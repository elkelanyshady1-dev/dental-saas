"""
train_incremental.py — Incremental training entry point.
=========================================================

Trains the PointNet++ segmentation model incrementally:

    1. Load the latest model checkpoint (model_v<N>.pt)
    2. Run integrity check on the full dataset
    3. Create a pre-training dataset snapshot
    4. Rebuild the training set (if --rebuild is passed)
    5. Train for the specified number of epochs using ALL cases
    6. Save the new model as model_v<N+1>_<M>cases.pt
    7. Update model_history.json

Model versioning
----------------
Models are stored in the ``models/`` directory:

    models/
        model_v1_30cases.pt
        model_v2_50cases.pt
        model_v3_142cases.pt
        model_history.json

model_history.json schema::

    {
      "current_version": 3,
      "models": [
        {
          "version": 1,
          "filename": "model_v1_30cases.pt",
          "n_cases": 30,
          "dataset_version": 1,
          "trained_at": "2026-03-08T10:00:00",
          "val_loss": 0.312,
          "epochs": 100
        },
        ...
      ]
    }

Usage
-----
    python -m train.train_incremental \\
        --data_root   ./datasets/training_set/merged_dataset \\
        --models_dir  ./models \\
        --output_dir  ./checkpoints \\
        --log_dir     ./logs \\
        --epochs      50 \\
        --rebuild     \\
        --backup      \\
        --processed_dir ./datasets/processed_cases \\
        --synthetic_dir ./datasets/synthetic_cases \\
        --pseudo_dir    ./datasets/pseudo_cases \\
        --version_file  ./datasets/dataset_version.json

    # Dry-run (validate pipeline without full training):
    python -m train.train_incremental --data_root ... --dry_run
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Sentinel: resolve python-ai-engine root ────────────────────────────────
_THIS_DIR = Path(__file__).resolve().parent
_ROOT = _THIS_DIR.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# ── Optional imports (non-fatal at module level) ───────────────────────────
try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False

try:
    from meshnet.dataset_management import (
        DatasetIntegrityChecker,
        DatasetMerger,
        DatasetVersionManager,
        DatasetBackup,
        DatasetRegistry,
    )
    _MGMT_AVAILABLE = True
except ImportError:
    _MGMT_AVAILABLE = False

try:
    from train.train_pointnet import (
        create_dataloaders,
        train_one_epoch_segmentation,
        validate_segmentation,
        PointNet2Segmentation,
        run_preview_snapshot,
    )
    _TRAIN_AVAILABLE = True
except ImportError:
    _TRAIN_AVAILABLE = False
    PointNet2Segmentation = None  # type: ignore[assignment,misc]
    run_preview_snapshot = None   # type: ignore[assignment]

try:
    from train.log_helpers import (
        write_training_metrics,
        write_session_status,
        write_preview_mesh,
    )
    _LOG_HELPERS = True
except ImportError:
    _LOG_HELPERS = False

try:
    import sys as _sys2
    _sys2.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from meshnet.utils.dataset_split_validator import (
        validate_dataset_split,
        SplitValidationResult,
    )
    _SPLIT_VALIDATOR_AVAILABLE = True
except ImportError:
    _SPLIT_VALIDATOR_AVAILABLE = False


# ── ModelVersionManager ───────────────────────────────────────────────────────

class ModelVersionManager:
    """
    Tracks model checkpoint versions in models/model_history.json.

    Args:
        models_dir: directory containing .pt checkpoints + model_history.json
    """

    HISTORY_FILE = "model_history.json"

    def __init__(self, models_dir: str | Path) -> None:
        self.models_dir   = Path(models_dir)
        self.history_file = self.models_dir / self.HISTORY_FILE
        self._history: list = []
        self._load()

    def _load(self) -> None:
        self.models_dir.mkdir(parents=True, exist_ok=True)
        if not self.history_file.exists():
            self._history = []
            return
        try:
            data = json.loads(self.history_file.read_text(encoding="utf-8"))
            self._history = data.get("models", [])
        except Exception as e:
            logger.error("Failed to load model_history.json: %s", e)
            self._history = []

    def _save(self) -> None:
        payload = {
            "current_version": self.current_version,
            "models": self._history,
        }
        tmp = self.history_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(self.history_file)

    @property
    def current_version(self) -> int:
        return self._history[-1]["version"] if self._history else 0

    def latest_checkpoint(self) -> Optional[Path]:
        """Return path to the latest .pt checkpoint, or None."""
        if not self._history:
            return None
        fname = self._history[-1].get("filename")
        if fname:
            p = self.models_dir / fname
            return p if p.exists() else None
        return None

    def register_model(
        self,
        checkpoint_path: Path,
        n_cases: int,
        dataset_version: int,
        val_loss: float,
        epochs: int,
        notes: str = "",
    ) -> dict:
        """
        Register a new trained model checkpoint.

        Args:
            checkpoint_path: absolute path to the .pt file
            n_cases:         number of training cases used
            dataset_version: dataset version this model was trained on
            val_loss:        best validation loss achieved
            epochs:          total training epochs
            notes:           free-form notes

        Returns:
            The new history entry dict.
        """
        new_ver = self.current_version + 1
        filename = f"model_v{new_ver}_{n_cases}cases.pt"
        target = self.models_dir / filename

        # Move/copy checkpoint to versioned name
        if checkpoint_path != target:
            import shutil
            shutil.copy2(checkpoint_path, target)

        entry = {
            "version":         new_ver,
            "filename":        filename,
            "n_cases":         n_cases,
            "dataset_version": dataset_version,
            "trained_at":      datetime.now().isoformat(timespec="seconds"),
            "val_loss":        round(float(val_loss), 6),
            "epochs":          epochs,
            "notes":           notes,
        }
        self._history.append(entry)
        self._save()
        logger.info(
            "Model v%d registered: %s  (cases=%d, val_loss=%.4f)",
            new_ver, filename, n_cases, val_loss
        )
        return entry

    def history_report(self) -> str:
        """Human-readable model version table."""
        if not self._history:
            return "No model versions recorded."
        lines = ["Model Version History", "=" * 60]
        for m in self._history:
            lines.append(
                f"  v{m['version']:02d}  {m['trained_at'][:10]}  "
                f"cases={m['n_cases']:4d}  "
                f"val_loss={m['val_loss']:.4f}  "
                f"epoch={m['epochs']:3d}  "
                f"[{m['filename']}]"
            )
        return "\n".join(lines)


# ── Incremental training pipeline ─────────────────────────────────────────────

def run_incremental_training(args: argparse.Namespace) -> None:
    """
    Full incremental training pipeline.

    Raises SystemExit on unrecoverable errors.
    """
    if not _TORCH_AVAILABLE:
        logger.error("PyTorch not available — cannot train")
        sys.exit(1)

    if not _TRAIN_AVAILABLE:
        logger.error("train.train_pointnet not importable — cannot train")
        sys.exit(1)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("Device: %s", device)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    log_dir = Path(args.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)

    models_dir = Path(args.models_dir)
    models_dir.mkdir(parents=True, exist_ok=True)

    model_vm = ModelVersionManager(models_dir)

    # ── Step A: Dataset management setup ─────────────────────────────────────
    version_manager = None
    dataset_version = 0
    if _MGMT_AVAILABLE:
        if args.version_file:
            version_manager = DatasetVersionManager(args.version_file)
            dataset_version = version_manager.current_version

        # Step B: Rebuild dataset if requested
        if args.rebuild and args.processed_dir:
            if args.backup and args.training_dir:
                backup = DatasetBackup(
                    processed_dir=args.processed_dir,
                    training_dir=args.training_dir,
                    backup_root=args.backup_root or "./dataset_backups",
                )
                try:
                    snap = backup.create_snapshot(label="pre_training")
                    logger.info("Pre-training backup: %s", snap.name)
                except Exception as exc:
                    logger.warning("Backup failed (non-fatal): %s", exc)

            merger = DatasetMerger(
                processed_dir=args.processed_dir,
                synthetic_dir=getattr(args, "synthetic_dir", None),
                pseudo_dir=getattr(args, "pseudo_dir", None),
                output_dir=args.data_root,
                overwrite=True,
                version=(version_manager.current_version + 1) if version_manager else 1,
            )
            merge_report = merger.rebuild()
            logger.info("Dataset rebuilt:\n%s", merge_report.summary())

            if version_manager:
                ver = version_manager.bump_version(
                    cases=merge_report.total_cases,
                    processed=merge_report.processed_cases,
                    synthetic=merge_report.synthetic_cases,
                    pseudo=merge_report.pseudo_cases,
                    notes="Incremental training rebuild",
                )
                dataset_version = ver.version

        # Step C: Integrity check
        checker = DatasetIntegrityChecker(
            processed_dir=args.data_root,
            min_cases=getattr(args, "min_cases", 1),
        )
        report = checker.run()
        logger.info(report.summary())
        if not report.passed:
            logger.error("Dataset integrity check FAILED — aborting training")
            sys.exit(1)

    n_cases_total = len(list(Path(args.data_root).iterdir())) if Path(args.data_root).exists() else 0

    # ── Step D: Build model ───────────────────────────────────────────────────
    model = PointNet2Segmentation(num_classes=args.num_classes).to(device)
    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    criterion = nn.CrossEntropyLoss()

    start_epoch = 0
    best_val_metric = float("inf")

    # Step E: Resume from latest checkpoint
    resume_path = getattr(args, "resume", None)
    if not resume_path:
        resume_path = str(model_vm.latest_checkpoint()) if model_vm.latest_checkpoint() else None

    if resume_path and Path(resume_path).exists():
        ckpt = torch.load(resume_path, map_location=device)
        model.load_state_dict(ckpt["model_state_dict"])
        optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        start_epoch = ckpt.get("epoch", 0) + 1
        best_val_metric = ckpt.get("best_val_metric", float("inf"))
        logger.info(
            "Resumed from checkpoint: %s  (start_epoch=%d, best_val=%.4f)",
            resume_path, start_epoch, best_val_metric
        )
    else:
        logger.info("No checkpoint found — training from scratch")

    # ── Step F: Data loaders ──────────────────────────────────────────────────

    # ── Step F.0: Split validation (detects leakage + empty val) ─────────────
    _split_result: "SplitValidationResult | None" = None
    if _SPLIT_VALIDATOR_AVAILABLE:
        try:
            _split_result = validate_dataset_split(args.data_root)
            if _split_result.has_leakage:
                logger.error(
                    "[split-validator] DATA LEAKAGE detected — %d case(s) appear in "
                    "both train and val sets. Training aborted to prevent invalid metrics. "
                    "Re-run split_dataset() with a fixed seed.",
                    len(_split_result.overlap),
                )
                sys.exit(1)
        except FileNotFoundError as _sve:
            logger.warning("[split-validator] %s — skipping validation", _sve)
        except Exception as _sve:
            logger.warning("[split-validator] Unexpected error: %s — continuing", _sve)
    else:
        logger.debug("[split-validator] meshnet.utils not importable — split validation skipped")

    # ── Step F.1: Build loaders ───────────────────────────────────────────────
    loaders = create_dataloaders(
        data_root=args.data_root,
        mode="segmentation",
        num_points=args.num_points,
        batch_size=args.batch_size,
        num_workers=args.num_workers,
    )
    if "train" not in loaders:
        logger.error("No training data found at %s — exiting", args.data_root)
        sys.exit(1)

    train_loader = loaders["train"]
    val_loader   = loaders.get("val")

    # Step F.2: Disable validation if validator confirmed empty val set
    if val_loader is not None and _split_result is not None and not _split_result.val_enabled:
        logger.info(
            "[split-validator] Validation set is empty — skipping validation "
            "(val_loader set to None to avoid metrics based on train data)."
        )
        val_loader = None

    logger.info(
        "[split-validator] Final dataset split → train=%d samples  val=%s",
        len(train_loader.dataset),
        f"{len(val_loader.dataset)} samples" if val_loader else "disabled",
    )

    if args.dry_run:
        logger.info("DRY RUN: one forward+backward pass, then exit")
        model.train()
        pts, lbl = next(iter(train_loader))
        pts, lbl = pts.to(device), lbl.to(device)
        logits = model(pts)
        loss = criterion(logits.reshape(-1, args.num_classes), lbl.reshape(-1))
        loss.backward()
        logger.info("Dry-run loss: %.4f  ✓ Pipeline is healthy", loss.item())
        return

    # Step G: Training loop
    if args.scheduler == "cosine":
        scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    elif args.scheduler == "step":
        scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=20, gamma=0.5)
    else:
        scheduler = None

    _history = []
    if _LOG_HELPERS:
        write_session_status(
            log_dir=log_dir,
            status="running",
            epoch=start_epoch,
            total_epochs=start_epoch + args.epochs,
            best_val_metric=best_val_metric,
        )

    for epoch in range(start_epoch, start_epoch + args.epochs):
        t0 = time.time()
        train_metrics = train_one_epoch_segmentation(
            model, train_loader, criterion, optimizer, device, epoch,
            num_classes=args.num_classes,
        )
        val_metrics = None
        if val_loader:
            val_metrics = validate_segmentation(model, val_loader, criterion, device)
        if scheduler:
            scheduler.step()

        elapsed = time.time() - t0
        lr = optimizer.param_groups[0]["lr"]
        val_loss = (
            val_metrics["loss"] if val_metrics
            else train_metrics.get("loss", train_metrics.get("total", 0.0))
        )
        logger.info(
            "Epoch %d/%d  lr=%.2e  train_loss=%.4f  val_loss=%.4f  [%.1fs]",
            epoch + 1, start_epoch + args.epochs, lr,
            train_metrics.get("loss", 0.0), val_loss, elapsed
        )

        if _LOG_HELPERS:
            write_training_metrics(
                log_dir=log_dir,
                epoch=epoch,
                total_epochs=start_epoch + args.epochs,
                train_metrics=train_metrics,
                val_metrics=val_metrics,
                lr=lr,
                elapsed_s=elapsed,
                history=_history,
            )
            write_session_status(
                log_dir=log_dir,
                status="running",
                epoch=epoch + 1,
                total_epochs=start_epoch + args.epochs,
                best_val_metric=best_val_metric,
                train_metrics=train_metrics,
                val_metrics=val_metrics,
            )

        # ---- Live 3-D segmentation preview ----
        _prev_interval = getattr(args, "preview_interval", 5)
        if (
            _prev_interval > 0
            and (epoch + 1) % _prev_interval == 0
            and val_loader is not None
            and run_preview_snapshot is not None
        ):
            run_preview_snapshot(
                model=model,
                val_loader=val_loader,
                device=device,
                log_dir=log_dir,
                epoch=epoch + 1,
                total_epochs=start_epoch + args.epochs,
                is_multitask=False,
            )

        is_best = val_loss < best_val_metric
        if is_best:
            best_val_metric = val_loss
        ckpt = {
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "best_val_metric": best_val_metric,
            "n_cases": n_cases_total,
        }
        torch.save(ckpt, output_dir / "latest.pth")
        if is_best:
            torch.save(ckpt, output_dir / "best.pth")
            logger.info("  ✓ New best (val_loss=%.4f)", best_val_metric)
        if (epoch + 1) % 10 == 0:
            torch.save(ckpt, output_dir / f"epoch_{epoch+1}.pth")

    # Step H: Register trained model
    best_ckpt = output_dir / "best.pth"
    model_entry = model_vm.register_model(
        checkpoint_path=best_ckpt,
        n_cases=n_cases_total,
        dataset_version=dataset_version,
        val_loss=best_val_metric,
        epochs=args.epochs,
        notes=f"Incremental training run",
    )
    logger.info("Model registered:\n%s", model_vm.history_report())

    # Link model to dataset version
    if version_manager:
        version_manager.link_model(
            dataset_version=dataset_version,
            model_version=model_entry["filename"],
        )

    if _LOG_HELPERS:
        write_session_status(
            log_dir=log_dir,
            status="done",
            epoch=start_epoch + args.epochs,
            total_epochs=start_epoch + args.epochs,
            best_val_metric=best_val_metric,
        )

    logger.info("Incremental training complete! Best val_loss=%.4f", best_val_metric)


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="DentalMeshNet incremental training",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--data_root",     required=True, help="Training data directory (merged_dataset)")
    p.add_argument("--output_dir",    default="./checkpoints",         help="Checkpoint output dir")
    p.add_argument("--models_dir",    default="./models",              help="Versioned model output dir")
    p.add_argument("--log_dir",       default="./logs",                help="Dashboard log dir")
    p.add_argument("--epochs",        type=int,   default=50)
    p.add_argument("--batch_size",    type=int,   default=8)
    p.add_argument("--lr",            type=float, default=1e-3)
    p.add_argument("--weight_decay",  type=float, default=1e-4)
    p.add_argument("--num_points",    type=int,   default=4096)
    p.add_argument("--num_workers",   type=int,   default=4)
    p.add_argument("--num_classes",   type=int,   default=33)
    p.add_argument("--scheduler",     choices=["cosine","step","none"], default="cosine")
    p.add_argument("--resume",        default=None,                     help="Override checkpoint path")
    p.add_argument("--min_cases",     type=int,   default=1,           help="Min cases for integrity check")
    # Dataset management flags
    p.add_argument("--rebuild",       action="store_true",             help="Rebuild training set before training")
    p.add_argument("--backup",        action="store_true",             help="Snapshot dataset before training")
    p.add_argument("--backup_root",   default="./dataset_backups")
    p.add_argument("--processed_dir", default=None,                    help="processed_cases directory")
    p.add_argument("--synthetic_dir", default=None,                    help="synthetic_cases directory")
    p.add_argument("--pseudo_dir",    default=None,                    help="pseudo_cases directory")
    p.add_argument("--training_dir",  default=None,                    help="training_set directory root")
    p.add_argument("--version_file",  default=None,                    help="dataset_version.json path")
    p.add_argument("--dry_run",       action="store_true",             help="Validate pipeline only (1 step)")
    p.add_argument(
        "--preview_interval", "--preview-interval",
        dest="preview_interval",
        type=int, default=5,
        help="Write a 3D segmentation preview every N epochs (0 = disabled, default: 5)",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)-8s %(name)s — %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(
                str(Path(args.log_dir) / "dataset_manager.log"),
                mode="a", encoding="utf-8"
            ),
        ],
    )
    run_incremental_training(args)


if __name__ == "__main__":
    main()
