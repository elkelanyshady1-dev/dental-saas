"""
Training script for PointNet++ orthodontic models.

Supports two modes:
    1. Standard segmentation  (default)
    2. Multi-task training    (--multitask flag)

Two-phase multi-task training strategy:
    Phase 1: Train segmentation heads only (tooth + gingiva) until stable
    Phase 2: Enable all four task heads (full multi-task)

    Use --phase to start in a specific phase, and --phase_switch_epoch
    to auto-transition from phase 1 → 2 mid-training.

Usage:
    # Single-task tooth segmentation
    python -m train.train_pointnet --data_root ./data --epochs 100

    # Multi-task training (full, phase 2 from start)
    python -m train.train_pointnet --data_root ./data --epochs 100 --multitask

    # Two-phase: segmentation for 30 epochs, then full multi-task
    python -m train.train_pointnet --data_root ./data --epochs 100 --multitask \
        --phase 1 --phase_switch_epoch 30

    # Resume from checkpoint
    python -m train.train_pointnet --data_root ./data --resume ckpt.pth --multitask
"""

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.tensorboard import SummaryWriter

from .dataset_loader import create_dataloaders
from .pointnet2_segmentation import PointNet2Segmentation
from .multitask_pointnet import MultiTaskPointNet, MultiTaskLoss

# Tooth Graph GNN model (optional, requires geometry module)
_TOOTH_GRAPH_AVAILABLE = False
try:
    from .tooth_graph_segmentation import ToothGraphSegmentation
    _TOOTH_GRAPH_AVAILABLE = True
except ImportError:
    pass

# Hard-case mining (optional, only imported when --hard_mining is set)
_HARD_MINING_AVAILABLE = False
try:
    from .hard_mining.hard_case_detector import HardCaseDetector
    from .hard_mining.hard_case_dataset import HardCaseDataset
    from .hard_mining.priority_sampler import PrioritySampler
    _HARD_MINING_AVAILABLE = True
except ImportError:
    pass

# Curriculum training pipeline (optional — meshnet.training_pipeline)
_CURRICULUM_AVAILABLE = False
try:
    import sys as _sys
    import os as _os
    _sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from meshnet.training_pipeline import CurriculumTrainer, StageController
    from meshnet.training_pipeline.augmentation import AugmentationConfig
    _CURRICULUM_AVAILABLE = True
except ImportError:
    pass

# Dataset split validator (optional — meshnet.utils)
_SPLIT_VALIDATOR_AVAILABLE = False
try:
    import sys as _sys_sv
    _sys_sv.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from meshnet.utils.dataset_split_validator import (
        validate_dataset_split as _validate_split,
        SplitValidationResult as _SplitValidationResult,
    )
    _SPLIT_VALIDATOR_AVAILABLE = True
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# Dashboard log helpers (torch-free, importable without GPU)
from .log_helpers import (
    _write_json,
    write_training_metrics,
    write_session_status,
    write_preview_mesh,
)


# ---------------------------------------------------------------------------
# Training loop helpers
# ---------------------------------------------------------------------------

def compute_miou(
    preds: torch.Tensor,
    labels: torch.Tensor,
    num_classes: int,
    ignore_index: int = -1,
) -> float:
    """
    Compute mean Intersection-over-Union over *num_classes* classes.

    Parameters
    ----------
    preds   : (B*N,) int64 — predicted class indices
    labels  : (B*N,) int64 — ground-truth class indices
    """
    ious = []
    for cls in range(num_classes):
        pred_cls  = preds  == cls
        label_cls = labels == cls
        intersection = (pred_cls & label_cls).sum().item()
        union        = (pred_cls | label_cls).sum().item()
        if union > 0:
            ious.append(intersection / union)
    return float(np.mean(ious)) if ious else 0.0


def train_one_epoch_segmentation(
    model: nn.Module,
    dataloader,
    criterion: nn.Module,
    optimizer: optim.Optimizer,
    device: torch.device,
    epoch: int,
    num_classes: int = 33,
) -> Dict[str, float]:
    """Single-task segmentation training epoch."""
    model.train()
    total_loss = 0.0
    total_correct = 0
    total_points = 0
    all_preds: List[torch.Tensor] = []
    all_labels: List[torch.Tensor] = []

    for batch_idx, batch in enumerate(dataloader):
        points = batch["points"].to(device)           # (B, N, 3)
        labels = batch["tooth_labels"].to(device)      # (B, N)

        optimizer.zero_grad()
        logits = model(points)                         # (B, N, C)

        # CrossEntropyLoss expects (B, C, N)
        loss = criterion(logits.permute(0, 2, 1), labels)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * points.size(0)
        preds = logits.argmax(dim=-1)
        total_correct += (preds == labels).sum().item()
        total_points += labels.numel()
        all_preds.append(preds.reshape(-1).cpu())
        all_labels.append(labels.reshape(-1).cpu())

    avg_loss = total_loss / len(dataloader.dataset)
    accuracy = total_correct / total_points

    # mIoU over all batches
    flat_preds  = torch.cat(all_preds)
    flat_labels = torch.cat(all_labels)
    miou = compute_miou(flat_preds, flat_labels, num_classes)

    return {"loss": avg_loss, "accuracy": accuracy, "mIoU": miou}


def train_one_epoch_multitask(
    model: MultiTaskPointNet,
    dataloader,
    criterion: MultiTaskLoss,
    optimizer: optim.Optimizer,
    device: torch.device,
    epoch: int,
) -> Dict[str, float]:
    """Multi-task training epoch."""
    model.train()
    running = {
        "total": 0.0,
        "tooth": 0.0,
        "gingiva": 0.0,
        "base_plane": 0.0,
        "bite_transform": 0.0,
    }
    total_correct_tooth = 0
    total_correct_gingiva = 0
    total_points = 0
    count = 0

    for batch_idx, batch in enumerate(dataloader):
        points = batch["points"].to(device)
        targets = {
            "tooth_labels": batch["tooth_labels"].to(device),
            "gingiva_labels": batch["gingiva_labels"].to(device),
            "base_plane": batch["base_plane"].to(device),
            "bite_transform": batch["bite_transform"].to(device),
        }

        optimizer.zero_grad()
        predictions = model(points)
        losses = criterion(predictions, targets)

        losses["total"].backward()

        # Gradient clipping for stability
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

        optimizer.step()

        bs = points.size(0)
        count += bs
        for key in running:
            running[key] += losses[key].item() * bs

        # Accuracy tracking
        tooth_preds = predictions["tooth_logits"].argmax(dim=-1)
        total_correct_tooth += (
            tooth_preds == targets["tooth_labels"]
        ).sum().item()

        gingiva_preds = predictions["gingiva_logits"].argmax(dim=-1)
        total_correct_gingiva += (
            gingiva_preds == targets["gingiva_labels"]
        ).sum().item()

        total_points += targets["tooth_labels"].numel()

    metrics = {k: v / count for k, v in running.items()}
    metrics["tooth_accuracy"] = total_correct_tooth / total_points
    metrics["gingiva_accuracy"] = total_correct_gingiva / total_points

    return metrics


@torch.no_grad()
def validate_segmentation(
    model: nn.Module,
    dataloader,
    criterion: nn.Module,
    device: torch.device,
) -> Dict[str, float]:
    """Single-task validation."""
    model.eval()
    total_loss = 0.0
    total_correct = 0
    total_points = 0

    for batch in dataloader:
        points = batch["points"].to(device)
        labels = batch["tooth_labels"].to(device)

        logits = model(points)
        loss = criterion(logits.permute(0, 2, 1), labels)

        total_loss += loss.item() * points.size(0)
        preds = logits.argmax(dim=-1)
        total_correct += (preds == labels).sum().item()
        total_points += labels.numel()

    return {
        "loss": total_loss / len(dataloader.dataset),
        "accuracy": total_correct / total_points,
    }


@torch.no_grad()
def validate_multitask(
    model: MultiTaskPointNet,
    dataloader,
    criterion: MultiTaskLoss,
    device: torch.device,
) -> Dict[str, float]:
    """Multi-task validation."""
    model.eval()
    running = {
        "total": 0.0, "tooth": 0.0, "gingiva": 0.0,
        "base_plane": 0.0, "bite_transform": 0.0,
    }
    total_correct_tooth = 0
    total_correct_gingiva = 0
    total_points = 0
    count = 0

    for batch in dataloader:
        points = batch["points"].to(device)
        targets = {
            "tooth_labels": batch["tooth_labels"].to(device),
            "gingiva_labels": batch["gingiva_labels"].to(device),
            "base_plane": batch["base_plane"].to(device),
            "bite_transform": batch["bite_transform"].to(device),
        }

        predictions = model(points)
        losses = criterion(predictions, targets)

        bs = points.size(0)
        count += bs
        for key in running:
            running[key] += losses[key].item() * bs

        tooth_preds = predictions["tooth_logits"].argmax(dim=-1)
        total_correct_tooth += (
            tooth_preds == targets["tooth_labels"]
        ).sum().item()

        gingiva_preds = predictions["gingiva_logits"].argmax(dim=-1)
        total_correct_gingiva += (
            gingiva_preds == targets["gingiva_labels"]
        ).sum().item()

        total_points += targets["tooth_labels"].numel()

    metrics = {k: v / count for k, v in running.items()}
    metrics["tooth_accuracy"] = total_correct_tooth / total_points
    metrics["gingiva_accuracy"] = total_correct_gingiva / total_points

    return metrics


# ---------------------------------------------------------------------------
# Dry-run helper (Step 6)
# ---------------------------------------------------------------------------

def _run_dry_run(model: "nn.Module", train_loader, device, args) -> None:
    """
    Walk exactly ONE batch through forward → loss → backward → optimizer step.

    This validates:
      - DataLoader output shape
      - Model forward pass
      - Loss computation
      - Gradient flow
      - Optimizer step

    Total runtime: typically 1-5 seconds.  No checkpoint is written.
    """
    logger.info("=" * 60)
    logger.info("  DRY-RUN MODE — 1 forward/backward pass then exit")
    logger.info("=" * 60)

    t0 = time.time()
    batch = next(iter(train_loader))

    points = batch["points"].to(device)      # (B, N, 3)
    labels = batch["tooth_labels"].to(device) # (B, N)

    logger.info(
        f"  Batch shape   : points={tuple(points.shape)}  "
        f"labels={tuple(labels.shape)}"
    )

    criterion_dr = nn.CrossEntropyLoss().to(device)
    optimizer_dr = optim.AdamW(model.parameters(), lr=args.lr)

    model.train()
    optimizer_dr.zero_grad()
    logits = model(points)                   # (B, N, C)

    logger.info(f"  Logits shape  : {tuple(logits.shape)}")

    loss = criterion_dr(logits.permute(0, 2, 1), labels)
    loss.backward()
    optimizer_dr.step()

    preds   = logits.argmax(dim=-1)
    correct = (preds == labels).sum().item()
    total   = labels.numel()
    acc     = correct / total

    elapsed = time.time() - t0

    logger.info("  " + "-" * 50)
    logger.info(f"  Loss          : {loss.item():.4f}")
    logger.info(f"  Accuracy      : {acc:.4f}  ({correct}/{total} correct)")
    logger.info(f"  Elapsed       : {elapsed:.2f}s")
    logger.info("  " + "-" * 50)
    logger.info("  ✓  Dry-run PASSED — pipeline is healthy.")
    logger.info("=" * 60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Train PointNet++ for orthodontic STL processing"
    )
    parser.add_argument(
        "--data_root", type=str, required=True,
        help="Path to dataset root directory",
    )
    parser.add_argument(
        "--output_dir", type=str, default="./checkpoints",
        help="Directory to save checkpoints and logs",
    )
    parser.add_argument(
        "--multitask", action="store_true",
        help="Enable multi-task training (tooth + gingiva + base + bite)",
    )
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch_size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight_decay", type=float, default=1e-4)
    parser.add_argument("--num_points", type=int, default=4096)
    parser.add_argument("--num_workers", type=int, default=4)
    parser.add_argument("--num_classes", type=int, default=33)
    parser.add_argument(
        "--resume", type=str, default=None,
        help="Path to checkpoint to resume from",
    )
    # Multi-task loss weights
    parser.add_argument("--w_tooth", type=float, default=1.0)
    parser.add_argument("--w_gingiva", type=float, default=0.7)
    parser.add_argument("--w_base", type=float, default=0.4)
    parser.add_argument("--w_bite", type=float, default=0.4)
    # Two-phase training
    parser.add_argument(
        "--phase", type=int, default=2, choices=[1, 2],
        help="Training phase: 1=segmentation-only, 2=full multi-task",
    )
    parser.add_argument(
        "--phase_switch_epoch", type=int, default=0,
        help="Epoch at which to auto-switch from phase 1 to phase 2. "
             "0 = no auto-switch (stay in initial phase).",
    )
    # Scheduler
    parser.add_argument(
        "--scheduler", type=str, default="cosine",
        choices=["cosine", "step", "none"],
    )
    parser.add_argument("--step_size", type=int, default=20)
    parser.add_argument("--gamma", type=float, default=0.5)
    # Hard-case mining
    parser.add_argument(
        "--hard_mining", action="store_true",
        help="Enable automatic hard-case mining during training",
    )
    parser.add_argument(
        "--mining_interval", type=int, default=10,
        help="Run hard-case mining every N epochs (default: 10)",
    )
    parser.add_argument(
        "--mining_top_fraction", type=float, default=0.20,
        help="Fraction of cases to designate as hard (default: 0.20)",
    )
    parser.add_argument(
        "--hard_cases_dir", type=str, default="./datasets/hard_cases",
        help="Directory for hard cases",
    )
    parser.add_argument(
        "--log_dir", type=str, default="./logs",
        help="Directory for mining logs (hard_cases.json)",
    )
    # Dry-run & boundary sampling flags
    parser.add_argument(
        "--dry_run", "--dry-run",
        dest="dry_run",
        action="store_true",
        default=False,
        help=(
            "Dry-run: 1 forward + 1 backward + 1 optimizer step, then exit. "
            "Validates the full training pipeline in ~2 s without a full epoch."
        ),
    )
    parser.add_argument(
        "--boundary_sampling", "--boundary-sampling",
        dest="boundary_sampling",
        action="store_true",
        default=False,
        help="Enable boundary-aware composite sampling in the DataLoader",
    )
    # Tooth Graph GNN flag (Step 8)
    parser.add_argument(
        "--use_tooth_graph", "--use-tooth-graph",
        dest="use_tooth_graph",
        action="store_true",
        default=False,
        help=(
            "Enable Tooth Adjacency GNN layer.  Augments PointNet++ with a "
            "3-layer graph convolution over tooth centroids for better "
            "interproximal separation.  Requires geometry/tooth_graph.py."
        ),
    )
    parser.add_argument(
        "--gnn_k", type=int, default=3,
        help="GNN: number of nearest-neighbour teeth to connect  (default: 3)",
    )
    parser.add_argument(
        "--gnn_out", type=int, default=64,
        help="GNN: output feature dimension broadcast to points  (default: 64)",
    )

    # ── Curriculum training ───────────────────────────────────────────────
    parser.add_argument(
        "--curriculum",
        action="store_true",
        default=False,
        help=(
            "Enable three-stage curriculum training.  Replaces the standard "
            "training loop with CurriculumTrainer.  Stages: "
            "1=isolated patches, 2=neighbour patches, 3=full arch."
        ),
    )
    parser.add_argument(
        "--stage1_epochs", type=int, default=20,
        help="Curriculum: epochs for Stage 1 (isolated patches). Default: 20",
    )
    parser.add_argument(
        "--stage2_epochs", type=int, default=30,
        help="Curriculum: epochs for Stage 2 (neighbour patches). Default: 30",
    )
    parser.add_argument(
        "--stage1_miou_threshold", type=float, default=-1.0,
        help=(
            "Curriculum: min val mIoU to advance Stage 1 → 2.  "
            "-1 = epoch-based advancement only."
        ),
    )
    parser.add_argument(
        "--stage2_miou_threshold", type=float, default=-1.0,
        help=(
            "Curriculum: min val mIoU to advance Stage 2 → 3.  "
            "-1 = epoch-based advancement only."
        ),
    )

    parser.add_argument(
        "--preview_interval", "--preview-interval",
        dest="preview_interval",
        type=int, default=5,
        help="Write a 3D segmentation preview every N epochs (default: 5, 0 = disabled)",
    )

    return parser.parse_args()


def main():  # noqa: C901
    args = parse_args()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Device: {device}")
    logger.info(f"Mode: {'multitask' if args.multitask else 'segmentation'}")


# ---------------------------------------------------------------------------
# Live 3-D preview helper
# ---------------------------------------------------------------------------

@torch.no_grad()
def run_preview_snapshot(
    model: "nn.Module",
    val_loader,
    device: "torch.device",
    log_dir: "Path",
    epoch: int,
    total_epochs: int,
    is_multitask: bool = False,
) -> None:
    """
    Run inference on a single validation batch and write preview_mesh.json.

    Called every PREVIEW_INTERVAL epochs from the training loop.
    Silently skips if val_loader is None or any error occurs.
    """
    if val_loader is None:
        return
    try:
        model.eval()
        batch = next(iter(val_loader))
        points = batch["points"].to(device)   # (B, N, 3)

        if is_multitask:
            predictions = model(points)
            logits = predictions["tooth_logits"]  # (B, N, C)
        else:
            logits = model(points)                # (B, N, C)

        pred_labels = logits.argmax(dim=-1)       # (B, N)

        # Take first sample from the batch
        pts_np = points[0].cpu().numpy()          # (N, 3)
        lbl_np = pred_labels[0].cpu().numpy()     # (N,)

        # Convert to plain Python lists for JSON serialisation
        pts_list = pts_np.tolist()                # list of [x, y, z]
        lbl_list = lbl_np.tolist()                # list of int

        write_preview_mesh(
            log_dir=log_dir,
            epoch=epoch,
            total_epochs=total_epochs,
            points=pts_list,
            labels=lbl_list,
        )
        logger.info(
            "[Preview] Epoch %d: wrote %d-point preview to preview_mesh.json",
            epoch, len(pts_list),
        )
    except Exception as exc:
        logger.warning("[Preview] Skipped (error: %s)", exc)
    finally:
        model.train()


def main():  # noqa: C901
    args = parse_args()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Device: {device}")
    logger.info(f"Mode: {'multitask' if args.multitask else 'segmentation'}")

    # ── Curriculum training branch ─────────────────────────────────────────
    if getattr(args, "curriculum", False):
        if not _CURRICULUM_AVAILABLE:
            logger.error(
                "--curriculum requested but meshnet.training_pipeline is not "
                "importable.  Ensure the meshnet package is on the Python path."
            )
            sys.exit(1)

        logger.info("Curriculum training ENABLED  (stage1=%d  stage2=%d  epochs=%d)",
                    args.stage1_epochs, args.stage2_epochs, args.epochs)

        output_dir = Path(args.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        log_dir = Path(args.log_dir)
        log_dir.mkdir(parents=True, exist_ok=True)

        writer = None
        try:
            from torch.utils.tensorboard import SummaryWriter
            writer = SummaryWriter(log_dir=str(output_dir / "runs"))
        except Exception:
            pass

        # Build model (re-use existing logic)
        if args.multitask:
            from .multitask_pointnet import MultiTaskPointNet
            model = MultiTaskPointNet(num_tooth_classes=args.num_classes).to(device)
        else:
            model = PointNet2Segmentation(num_classes=args.num_classes).to(device)

        optimizer = optim.AdamW(
            model.parameters(), lr=args.lr, weight_decay=args.weight_decay
        )
        if args.scheduler == "cosine":
            scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
        elif args.scheduler == "step":
            scheduler = optim.lr_scheduler.StepLR(
                optimizer, step_size=args.step_size, gamma=args.gamma
            )
        else:
            scheduler = None

        mode = "multitask" if args.multitask else "segmentation"
        loaders = create_dataloaders(
            data_root=args.data_root, mode=mode,
            num_points=args.num_points, batch_size=args.batch_size,
            num_workers=args.num_workers,
        )
        if "train" not in loaders:
            logger.error("No training data found. Exiting.")
            sys.exit(1)

        stage_controller = StageController(
            stage_1_epochs=args.stage1_epochs,
            stage_2_epochs=args.stage2_epochs,
            stage_1_miou_threshold=getattr(args, "stage1_miou_threshold", -1.0),
            stage_2_miou_threshold=getattr(args, "stage2_miou_threshold", -1.0),
            log_dir=str(log_dir),
        )

        trainer = CurriculumTrainer(
            model=model,
            train_dataset=loaders["train"].dataset,
            optimizer=optimizer,
            device=device,
            stage_controller=stage_controller,
            num_classes=args.num_classes,
            num_points=args.num_points,
            batch_size=args.batch_size,
            num_workers=args.num_workers,
            output_dir=str(output_dir),
            log_dir=str(log_dir),
            scheduler=scheduler,
            val_dataset=loaders["val"].dataset if "val" in loaders else None,
            writer=writer,
        )

        start_epoch = 0
        if args.resume:
            start_epoch = trainer.load_checkpoint(args.resume)

        trainer.train(
            n_epochs=args.epochs,
            start_epoch=start_epoch,
            mining_interval=getattr(args, "mining_interval", 10),
        )

        if writer:
            writer.close()
        write_session_status(
            log_dir=log_dir, status="done",
            epoch=args.epochs, total_epochs=args.epochs,
            best_val_metric=trainer.best_val_metric,
        )
        logger.info("Curriculum training complete!")
        return   # ← do NOT fall into the standard loop below
    # ── End curriculum branch ─────────────────────────────────────────────

    # Output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Dashboard log directory (Step 8)
    log_dir = Path(args.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)
    _metrics_history: List[dict] = []

    # TensorBoard
    writer = SummaryWriter(log_dir=str(output_dir / "runs"))

    # ---- Data ----
    mode = "multitask" if args.multitask else "segmentation"

    # Hard mining: use HardCaseDataset + PrioritySampler if requested
    hard_sampler = None
    detector = None

    if args.hard_mining and _HARD_MINING_AVAILABLE:
        logger.info("Hard-case mining ENABLED")
        hc_dataset = HardCaseDataset(
            cases_dir=args.data_root,
            augmented_dir=str(Path(args.data_root).parent / "augmented"),
            hard_cases_dir=args.hard_cases_dir,
            mode=mode,
            num_points=args.num_points,
        )
        summary = hc_dataset.summary()
        logger.info(
            f"Dataset: normal={summary['normal']} "
            f"augmented={summary['augmented']} hard={summary['hard']}"
        )

        # Load existing hard case IDs if log already exists
        existing_hc_ids = HardCaseDetector.load_hard_case_ids(
            str(Path(args.log_dir) / "hard_cases.json")
        )

        hard_sampler = PrioritySampler(
            dataset=hc_dataset,
            hard_case_ids=existing_hc_ids,
            batch_size=args.batch_size,
            drop_last=True,
        )

        from torch.utils.data import DataLoader
        train_loader = DataLoader(
            hc_dataset,
            batch_sampler=hard_sampler,
            num_workers=args.num_workers,
            pin_memory=True,
        )

        detector = HardCaseDetector(
            model=None,   # set later after model is created
            data_root=args.data_root,
            log_path=str(Path(args.log_dir) / "hard_cases.json"),
            hard_cases_dir=args.hard_cases_dir,
            top_fraction=args.mining_top_fraction,
            num_points=args.num_points,
            num_classes=args.num_classes,
            is_multitask=args.multitask,
        )

        # Also create a val loader from standard dataset
        std_loaders = create_dataloaders(
            data_root=args.data_root, mode=mode,
            num_points=args.num_points, batch_size=args.batch_size,
            num_workers=args.num_workers,
        )
        val_loader = std_loaders.get("val")

    else:
        if args.hard_mining and not _HARD_MINING_AVAILABLE:
            logger.warning("--hard_mining requested but mining modules unavailable. Using standard loader.")

        # ── Split validation (detects leakage + empty val) ────────────────────
        _sv_result = None
        if _SPLIT_VALIDATOR_AVAILABLE:
            try:
                _sv_result = _validate_split(args.data_root)
                if _sv_result.has_leakage:
                    logger.error(
                        "[split-validator] DATA LEAKAGE — %d case(s) in both train & val. "
                        "Training aborted. Re-run split_dataset() with a fixed seed.",
                        len(_sv_result.overlap),
                    )
                    sys.exit(1)
            except FileNotFoundError as _sv_err:
                logger.warning("[split-validator] %s — skipping validation", _sv_err)
            except Exception as _sv_err:
                logger.warning("[split-validator] Unexpected: %s — continuing", _sv_err)
        else:
            logger.debug("[split-validator] meshnet.utils not available — skipped")

        # ── Build data loaders ────────────────────────────────────────────────
        loaders = create_dataloaders(
            data_root=args.data_root,
            mode=mode,
            num_points=args.num_points,
            batch_size=args.batch_size,
            num_workers=args.num_workers,
        )

        if "train" not in loaders:
            logger.error("No training data found. Exiting.")
            sys.exit(1)

        train_loader = loaders["train"]
        val_loader = loaders.get("val")

        # Disable val_loader if validator confirmed empty val set (Step 3)
        if val_loader is not None and _sv_result is not None and not _sv_result.val_enabled:
            logger.info(
                "[split-validator] Skipping validation (no val cases available). "
                "val_loader disabled to prevent metrics based on train data."
            )
            val_loader = None

    # ── Final dataset stats summary (Step 4) ─────────────────────────────────
    logger.info(
        "[split-validator] Final dataset split → train=%d samples  val=%s",
        len(train_loader.dataset),
        f"{len(val_loader.dataset)} samples" if val_loader else "disabled",
    )

    # ---- Small dataset warning (Fix 4) ----
    n_train = len(train_loader.dataset)
    if n_train < 10:
        logger.warning(
            "WARNING: Dataset too small (%d cases). "
            "Tooth segmentation will not train properly. "
            "Aim for >= 50 cases for meaningful results.",
            n_train,
        )
        print(
            "\n" + "=" * 60
            + "\n  ⚠ WARNING: Dataset too small.\n"
            + f"  Only {n_train} training sample(s) found.\n"
            + "  Tooth segmentation will not train properly.\n"
            + "  Recommended: >= 50 cases for production quality.\n"
            + "=" * 60 + "\n"
        )

    # ---- Model ----
    if args.multitask:
        model = MultiTaskPointNet(num_tooth_classes=args.num_classes)
        criterion = MultiTaskLoss(
            w_tooth=args.w_tooth,
            w_gingiva=args.w_gingiva,
            w_base=args.w_base,
            w_bite=args.w_bite,
            phase=args.phase,
        )
        logger.info(
            f"Phase: {args.phase} "
            f"({'segmentation-only' if args.phase == 1 else 'full multi-task'})"
        )
        if args.phase_switch_epoch > 0:
            logger.info(
                f"Auto-switching to phase 2 at epoch {args.phase_switch_epoch}"
            )
    else:
        if getattr(args, "use_tooth_graph", False):
            if not _TOOTH_GRAPH_AVAILABLE:
                logger.warning(
                    "--use-tooth-graph requested but geometry.tooth_graph is "
                    "unavailable. Falling back to standard PointNet2Segmentation."
                )
                model = PointNet2Segmentation(num_classes=args.num_classes)
            else:
                model = ToothGraphSegmentation(
                    num_classes=args.num_classes,
                    gnn_k=getattr(args, "gnn_k", 3),
                    gnn_out=getattr(args, "gnn_out", 64),
                )
                logger.info(
                    f"Model: ToothGraphSegmentation  "
                    f"(GNN k={args.gnn_k}, out_dim={args.gnn_out})"
                )
        else:
            model = PointNet2Segmentation(num_classes=args.num_classes)
        criterion = nn.CrossEntropyLoss()

    model = model.to(device)

    # Wire model into detector after creation
    if detector is not None:
        detector.model = model
        detector.is_multitask = args.multitask
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(
        p.numel() for p in model.parameters() if p.requires_grad
    )
    logger.info(f"Total parameters: {total_params:,}")
    logger.info(f"Trainable parameters: {trainable_params:,}")

    # ---- Optimizer ----
    optimizer = optim.AdamW(
        model.parameters(), lr=args.lr, weight_decay=args.weight_decay
    )

    # ---- Scheduler ----
    if args.scheduler == "cosine":
        scheduler = optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=args.epochs
        )
    elif args.scheduler == "step":
        scheduler = optim.lr_scheduler.StepLR(
            optimizer, step_size=args.step_size, gamma=args.gamma
        )
    else:
        scheduler = None

    # ---- Resume ----
    start_epoch = 0
    best_val_metric = float("inf")

    if args.resume:
        checkpoint = torch.load(args.resume, map_location=device)
        model.load_state_dict(checkpoint["model_state_dict"])
        optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        start_epoch = checkpoint.get("epoch", 0) + 1
        best_val_metric = checkpoint.get("best_val_metric", float("inf"))
        logger.info(f"Resumed from epoch {start_epoch}")

    # ---- Training ----
    logger.info("=" * 60)
    logger.info("Starting training...")
    logger.info("=" * 60)

    # Write initial session status
    write_session_status(
        log_dir=log_dir,
        status="running",
        epoch=start_epoch,
        total_epochs=args.epochs,
        best_val_metric=best_val_metric,
    )

    for epoch in range(start_epoch, args.epochs):
        t0 = time.time()

        # ---- Phase transition (two-phase training) ----
        if (
            args.multitask
            and args.phase_switch_epoch > 0
            and epoch == args.phase_switch_epoch
            and criterion.phase == 1
        ):
            criterion.set_phase(2)
            logger.info(
                f"\n{'='*60}\n"
                f"  PHASE SWITCH: epoch {epoch} → Phase 2 (full multi-task)\n"
                f"{'='*60}"
            )

        # ---- Dry-run (Step 6) — placed inside loop but breaks on first pass ----
        if hasattr(args, "dry_run") and args.dry_run:
            _run_dry_run(model=model, train_loader=train_loader,
                         device=device, args=args)
            writer.close()
            sys.exit(0)

        # Train
        if args.multitask:
            train_metrics = train_one_epoch_multitask(
                model, train_loader, criterion, optimizer, device, epoch
            )
        else:
            train_metrics = train_one_epoch_segmentation(
                model, train_loader, criterion, optimizer, device, epoch,
                num_classes=args.num_classes,
            )

        # Validate
        val_metrics = None
        if val_loader:
            if args.multitask:
                val_metrics = validate_multitask(
                    model, val_loader, criterion, device
                )
            else:
                val_metrics = validate_segmentation(
                    model, val_loader, criterion, device
                )

        # Step scheduler
        if scheduler:
            scheduler.step()

        elapsed = time.time() - t0

        # ---- Logging ----
        lr = optimizer.param_groups[0]["lr"]

        if args.multitask:
            log_msg = (
                f"Epoch {epoch+1}/{args.epochs} [{elapsed:.1f}s] "
                f"lr={lr:.6f} | "
                f"Loss: total={train_metrics['total']:.4f} "
                f"tooth={train_metrics['tooth']:.4f} "
                f"ging={train_metrics['gingiva']:.4f} "
                f"base={train_metrics['base_plane']:.4f} "
                f"bite={train_metrics['bite_transform']:.4f} | "
                f"Acc: tooth={train_metrics['tooth_accuracy']:.4f} "
                f"ging={train_metrics['gingiva_accuracy']:.4f}"
            )
        else:
            log_msg = (
                f"Epoch {epoch+1}/{args.epochs} [{elapsed:.1f}s] "
                f"lr={lr:.6f} | "
                f"Loss={train_metrics['loss']:.4f} "
                f"Acc={train_metrics['accuracy']:.4f}"
            )

        if val_metrics:
            if args.multitask:
                log_msg += (
                    f" | Val: total={val_metrics['total']:.4f} "
                    f"tooth_acc={val_metrics['tooth_accuracy']:.4f}"
                )
            else:
                log_msg += (
                    f" | Val: loss={val_metrics['loss']:.4f} "
                    f"acc={val_metrics['accuracy']:.4f}"
                )

        logger.info(log_msg)

        # TensorBoard
        for k, v in train_metrics.items():
            writer.add_scalar(f"train/{k}", v, epoch)
        if val_metrics:
            for k, v in val_metrics.items():
                writer.add_scalar(f"val/{k}", v, epoch)
        writer.add_scalar("lr", lr, epoch)

        # Dashboard JSON logs (Step 8)
        write_training_metrics(
            log_dir=log_dir,
            epoch=epoch,
            total_epochs=args.epochs,
            train_metrics=train_metrics,
            val_metrics=val_metrics,
            lr=lr,
            elapsed_s=elapsed,
            history=_metrics_history,
        )
        write_session_status(
            log_dir=log_dir,
            status="running",
            epoch=epoch + 1,
            total_epochs=args.epochs,
            best_val_metric=best_val_metric,
            train_metrics=train_metrics,
            val_metrics=val_metrics,
        )

        # ---- Live 3-D segmentation preview ----
        _preview_interval = getattr(args, "preview_interval", 5)
        if (
            _preview_interval > 0
            and (epoch + 1) % _preview_interval == 0
            and val_loader is not None
        ):
            run_preview_snapshot(
                model=model,
                val_loader=val_loader,
                device=device,
                log_dir=log_dir,
                epoch=epoch + 1,
                total_epochs=args.epochs,
                is_multitask=args.multitask,
            )

        # ---- Checkpointing ----
        val_loss = (
            val_metrics["total"] if val_metrics and args.multitask
            else val_metrics["loss"] if val_metrics
            else train_metrics.get("total", train_metrics.get("loss"))
        )

        is_best = val_loss < best_val_metric
        if is_best:
            best_val_metric = val_loss

        checkpoint = {
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "best_val_metric": best_val_metric,
            "args": vars(args),
        }

        # Save latest
        torch.save(checkpoint, output_dir / "latest.pth")

        # Save best
        if is_best:
            torch.save(checkpoint, output_dir / "best.pth")
            logger.info(f"  ✓ New best model saved (val_loss={val_loss:.4f})")

        # Periodic save
        if (epoch + 1) % 10 == 0:
            torch.save(checkpoint, output_dir / f"epoch_{epoch+1}.pth")

        # ---- Hard-case mining step ----
        if (
            args.hard_mining
            and detector is not None
            and hard_sampler is not None
            and (epoch + 1) % args.mining_interval == 0
        ):
            logger.info(f"\n[Hard Mining] Running at epoch {epoch + 1}...")
            try:
                hard_results = detector.run(device)
                new_hard_ids = {r["case_id"] for r in hard_results}
                hard_sampler.update_hard_cases(new_hard_ids)
                logger.info(
                    f"[Hard Mining] Updated {len(new_hard_ids)} hard cases. "
                    f"Sampler reloaded."
                )
                # Log count to TensorBoard
                writer.add_scalar("hard_mining/n_hard_cases", len(new_hard_ids), epoch)
                if hard_results:
                    avg_difficulty = sum(r["difficulty"] for r in hard_results) / len(hard_results)
                    writer.add_scalar("hard_mining/avg_difficulty", avg_difficulty, epoch)
            except Exception as e:
                logger.warning(f"[Hard Mining] Failed: {e}")

    writer.close()

    # Final session status — mark as done
    write_session_status(
        log_dir=log_dir,
        status="done",
        epoch=args.epochs,
        total_epochs=args.epochs,
        best_val_metric=best_val_metric,
    )

    logger.info("Training complete!")
    logger.info(f"Best validation metric: {best_val_metric:.4f}")
    logger.info(f"Checkpoints saved to: {output_dir}")


if __name__ == "__main__":
    main()
