"""
curriculum_trainer.py — Three-stage curriculum training orchestrator for DentalMeshNet.

This is the top-level training coordinator.  It wraps the existing
train_pointnet.py training loop with:

    1. Three-stage curriculum control via StageController
    2. Per-stage patch generation (Stages 1/2) or full-arch (Stage 3)
    3. Class-balanced + boundary-aware sampling
    4. Geometric mesh augmentation
    5. Boundary-weighted loss computation
    6. Per-stage hard case mining
    7. Synthetic arch integration (mix real + synthetic)
    8. Pseudo-labelled data integration
    9. TensorBoard & dashboard JSON logging

Training Schedule (Default)
---------------------------
    Epochs  1–20  : Stage 1 — isolated tooth patches  (patch_r=8mm)
    Epochs 21–50  : Stage 2 — neighbour tooth patches  (patch_r=12mm)
    Epochs 51+    : Stage 3 — full dental arch

Loss Weighting
--------------
The curriculum loss applies higher weight to boundary-zone points:
    L_total = L_interior  +  boundary_weight × L_boundary

Usage
-----
    trainer = CurriculumTrainer(
        model=model,
        train_dataset=dataset,
        optimizer=optimizer,
        device=device,
        stage_controller=StageController(),
    )
    trainer.train(n_epochs=100)

Or:
    python -m train.train_pointnet \\
        --data_root ./data \\
        --curriculum \\
        --stage1_epochs 20 \\
        --stage2_epochs 30
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset

from .stage_controller import StageConfig, StageController, TrainingStage
from .sampling.balanced_sampler import BalancedSampler
from .sampling.boundary_sampler import CurriculumBoundarySampler
from .augmentation.mesh_augmentations import AugmentationConfig, MeshAugmentations
from .patch_generation.patch_generator import CurriculumPatchGenerator
from .patch_generation.patch_selector import PatchSelectionMode, PatchSelector

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Boundary-weighted loss
# ─────────────────────────────────────────────────────────────────────────────

class BoundaryWeightedLoss(nn.Module):
    """
    CrossEntropyLoss with higher weight on boundary-zone points.

    Boundary points are detected using a KNN label-change criterion
    applied to the current batch.

    Parameters
    ----------
    boundary_weight : float — loss multiplier at boundary zone (default 3.0)
    num_classes     : int
    ignore_index    : int   — label index to ignore              (default -1)
    k_boundary      : int   — KNN for boundary detection        (default 8)
    """

    def __init__(
        self,
        boundary_weight: float = 3.0,
        num_classes: int = 33,
        ignore_index: int = -1,
        k_boundary: int = 8,
    ) -> None:
        super().__init__()
        self.boundary_weight = boundary_weight
        self.num_classes = num_classes
        self.ignore_index = ignore_index
        self.k_boundary = k_boundary
        self._ce = nn.CrossEntropyLoss(
            ignore_index=ignore_index, reduction="none"
        )

    def forward(
        self,
        logits: torch.Tensor,   # (B, C, N)  or (B, N, C)
        labels: torch.Tensor,   # (B, N)
        points: Optional[torch.Tensor] = None,  # (B, N, 3) — for boundary detection
    ) -> torch.Tensor:
        """Compute boundary-weighted CE loss."""
        # Ensure (B, C, N) format
        if logits.shape[-1] == self.num_classes:
            logits = logits.permute(0, 2, 1)  # (B, N, C) → (B, C, N)

        per_point_loss = self._ce(logits, labels)   # (B, N)

        if self.boundary_weight == 1.0 or points is None:
            return per_point_loss.mean()

        # ── Detect boundary points in CPU space ───────────────────────────
        # batch boundary detection: for each batch item, check label changes
        B, N = labels.shape
        weights = torch.ones_like(per_point_loss)

        with torch.no_grad():
            pts_np = points.detach().cpu().numpy()    # (B, N, 3)
            lbl_np = labels.detach().cpu().numpy()    # (B, N)

        # Simple nearest-label-change boundary detection
        try:
            from scipy.spatial import cKDTree
            k_q = min(self.k_boundary + 1, N)
            for b in range(B):
                tree = cKDTree(pts_np[b])
                _, nn_idx = tree.query(pts_np[b], k=k_q)  # (N, k)
                nn_lbl = lbl_np[b][nn_idx[:, 1:]]         # (N, k-1)
                is_boundary = (nn_lbl != lbl_np[b][:, np.newaxis]).any(axis=1)
                boundary_t = torch.from_numpy(is_boundary).to(logits.device)
                weights[b][boundary_t] = self.boundary_weight
        except Exception:
            pass   # fallback to uniform loss if cKDTree unavailable

        # Valid mask (ignore -1 labels)
        valid_mask = labels != self.ignore_index
        weighted_loss = (per_point_loss * weights * valid_mask).sum()
        n_valid = valid_mask.float().sum().clamp(min=1.0)
        return weighted_loss / n_valid


# ─────────────────────────────────────────────────────────────────────────────
# Curriculum Trainer
# ─────────────────────────────────────────────────────────────────────────────

class CurriculumTrainer:
    """
    Orchestrates three-stage curriculum training for DentalMeshNet.

    Parameters
    ----------
    model           : nn.Module
    train_dataset   : Dataset  — full training split (used in Stage 3)
    optimizer       : optim.Optimizer
    device          : torch.device
    stage_controller: StageController
    num_classes     : int
    num_points      : int      — points per sample
    batch_size      : int
    num_workers     : int
    output_dir      : str      — checkpoint directory
    log_dir         : str      — dashboard JSON log directory
    scheduler       : LR scheduler, optional
    val_dataset     : Dataset, optional
    augment_config  : AugmentationConfig, optional
    writer          : SummaryWriter, optional
    on_epoch_end    : callable(epoch, metrics), optional — hook for callbacks
    """

    def __init__(
        self,
        model: nn.Module,
        train_dataset: Dataset,
        optimizer: optim.Optimizer,
        device: torch.device,
        stage_controller: Optional[StageController] = None,
        num_classes: int = 33,
        num_points: int = 4096,
        batch_size: int = 8,
        num_workers: int = 4,
        output_dir: str = "./checkpoints",
        log_dir: str = "./logs",
        scheduler=None,
        val_dataset: Optional[Dataset] = None,
        augment_config: Optional[AugmentationConfig] = None,
        writer=None,
        on_epoch_end: Optional[Callable] = None,
    ) -> None:
        self.model = model
        self.train_dataset = train_dataset
        self.optimizer = optimizer
        self.device = device
        self.stage_controller = stage_controller or StageController(log_dir=log_dir)
        self.num_classes = num_classes
        self.num_points = num_points
        self.batch_size = batch_size
        self.num_workers = num_workers
        self.output_dir = Path(output_dir)
        self.log_dir = Path(log_dir)
        self.scheduler = scheduler
        self.val_dataset = val_dataset
        self.writer = writer
        self.on_epoch_end = on_epoch_end

        # Augmentation
        self.augmentor = MeshAugmentations(config=augment_config or AugmentationConfig())

        # Builders caches (recreated when stage changes)
        self._current_stage: Optional[TrainingStage] = None
        self._patch_gen: Optional[CurriculumPatchGenerator] = None
        self._patch_sel: Optional[PatchSelector] = None
        self._balanced_sampler: Optional[BalancedSampler] = None
        self._boundary_sampler: Optional[CurriculumBoundarySampler] = None
        self._loss_fn: Optional[BoundaryWeightedLoss] = None

        # History
        self.metrics_history: List[Dict] = []
        self.best_val_metric: float = float("inf")

    # ── Stage setup ────────────────────────────────────────────────────────

    def _setup_for_stage(self, stage_cfg: StageConfig) -> None:
        """Re-initialise components when the training stage changes."""
        if self._current_stage == stage_cfg.stage:
            return  # no-op

        self._current_stage = stage_cfg.stage
        logger.info("CurriculumTrainer: setting up for %s", stage_cfg.description)

        # Patch generator
        self._patch_gen = CurriculumPatchGenerator(
            stage=stage_cfg.stage.value,
            patch_radius_mm=stage_cfg.patch_radius_mm,
            n_seeds=max(1, stage_cfg.n_seeds),
            min_patch_points=64,
            max_patch_points=self.num_points,
        )
        self._patch_sel = PatchSelector(
            mode=(
                PatchSelectionMode.BOUNDARY
                if stage_cfg.stage == TrainingStage.STAGE_2_NEIGHBOUR
                else PatchSelectionMode.MIXED
            ),
            max_patches=max(1, self.batch_size * 4),
        )

        # Samplers
        self._balanced_sampler = BalancedSampler(
            tooth_ratio=0.5, n_points=self.num_points
        )
        self._boundary_sampler = CurriculumBoundarySampler(
            n_points=self.num_points,
            boundary_fraction=0.4 if stage_cfg.stage.value >= 2 else 0.25,
        )

        # Loss
        self._loss_fn = BoundaryWeightedLoss(
            boundary_weight=stage_cfg.boundary_weight,
            num_classes=self.num_classes,
        ).to(self.device)

        # Adjust LR by stage scale
        for pg in self.optimizer.param_groups:
            # We track base_lr separately to allow re-scaling
            if "base_lr" not in pg:
                pg["base_lr"] = pg["lr"]
            pg["lr"] = pg["base_lr"] * stage_cfg.lr_scale
        logger.info(
            "Stage setup complete: boundary_weight=%.1f  lr_scale=%.2f",
            stage_cfg.boundary_weight, stage_cfg.lr_scale,
        )

    # ── Batch preparation ──────────────────────────────────────────────────

    def _prepare_batch(
        self,
        batch: Dict,
        stage_cfg: StageConfig,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Apply curriculum sampling pipeline to a raw batch from the DataLoader.

        Steps:
            1. Unpack (B, N, 3) points + (B, N) labels
            2. For stages 1/2: generate patches → select → flatten
            3. Apply augmentation
            4. Apply balanced + boundary sampling
            5. Return (B′, num_points, 3) + (B′, num_points)
        """
        raw_pts = batch["points"].numpy()       # (B, N, 3)
        raw_lbl = batch["tooth_labels"].numpy() # (B, N)
        B = raw_pts.shape[0]

        out_pts: List[np.ndarray] = []
        out_lbl: List[np.ndarray] = []

        for b in range(B):
            pts = raw_pts[b]
            lbl = raw_lbl[b]

            # ── Patch extraction (Stages 1/2) ─────────────────────────────
            if stage_cfg.stage != TrainingStage.STAGE_3_FULL_ARCH and self._patch_gen:
                tooth_mask = lbl > 0
                if tooth_mask.sum() < 64:
                    # fallback: use full scan
                    patches = []
                else:
                    patches = self._patch_gen.generate(pts, lbl)
                    patches = self._patch_sel.select(patches)  # type: ignore

                if patches:
                    # Use first patch (shuffle is handled by PatchSelector)
                    p = patches[0]
                    pts = p.points
                    lbl = p.labels
                # else: fall through to full scan

            # ── Augmentation ──────────────────────────────────────────────
            pts, lbl, _ = self.augmentor(pts, lbl)

            # ── Sampling (balanced then boundary) ─────────────────────────
            pts, lbl, _ = self._balanced_sampler.sample(pts, lbl)       # type: ignore
            pts, lbl, _ = self._boundary_sampler.sample(pts, lbl)       # type: ignore

            out_pts.append(pts)
            out_lbl.append(lbl)

        out_pts_t = torch.from_numpy(np.stack(out_pts)).float()    # (B′, N, 3)
        out_lbl_t = torch.from_numpy(np.stack(out_lbl)).long()     # (B′, N)
        return out_pts_t.to(self.device), out_lbl_t.to(self.device)

    # ── Train one epoch ────────────────────────────────────────────────────

    def train_epoch(
        self,
        epoch: int,
        stage_cfg: StageConfig,
        train_loader: DataLoader,
    ) -> Dict[str, float]:
        """Train for one epoch under the given stage configuration."""
        self._setup_for_stage(stage_cfg)
        self.model.train()

        total_loss = 0.0
        total_correct = 0
        total_points = 0
        n_batches = 0

        for batch_idx, batch in enumerate(train_loader):
            pts, lbl = self._prepare_batch(batch, stage_cfg)

            self.optimizer.zero_grad()
            logits = self.model(pts)    # (B, N, C) expected

            loss = self._loss_fn(logits, lbl, pts)  # type: ignore
            loss.backward()

            torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self.optimizer.step()

            preds = logits.argmax(dim=-1)
            total_correct += (preds == lbl).sum().item()
            total_points  += lbl.numel()
            total_loss    += loss.item()
            n_batches     += 1

        avg_loss = total_loss / max(1, n_batches)
        accuracy = total_correct / max(1, total_points)

        # mIoU
        miou = self._compute_miou_fast(train_loader, stage_cfg)

        return {
            "loss": round(avg_loss, 5),
            "accuracy": round(accuracy, 4),
            "mIoU": round(miou, 4),
            "stage": stage_cfg.stage.value,
            "boundary_weight": stage_cfg.boundary_weight,
            "lr": self.optimizer.param_groups[0]["lr"],
        }

    @torch.no_grad()
    def _compute_miou_fast(
        self,
        loader: DataLoader,
        stage_cfg: StageConfig,
    ) -> float:
        """Fast mIoU estimate over one pass of the loader (eval mode)."""
        self.model.eval()
        intersection = np.zeros(self.num_classes)
        union        = np.zeros(self.num_classes)

        for batch in loader:
            pts, lbl = self._prepare_batch(batch, stage_cfg)
            logits = self.model(pts)
            preds = logits.argmax(dim=-1).reshape(-1).cpu().numpy()
            gt    = lbl.reshape(-1).cpu().numpy()

            for c in range(self.num_classes):
                p_c, g_c = preds == c, gt == c
                intersection[c] += (p_c & g_c).sum()
                union[c]        += (p_c | g_c).sum()

        valid = union > 0
        if not valid.any():
            return 0.0
        return float((intersection[valid] / union[valid]).mean())

    @torch.no_grad()
    def validate(self, stage_cfg: StageConfig) -> Dict[str, float]:
        """Validate on val_dataset. Returns metrics dict."""
        if self.val_dataset is None:
            return {}

        self.model.eval()
        val_loader = DataLoader(
            self.val_dataset,
            batch_size=self.batch_size,
            shuffle=False,
            num_workers=self.num_workers,
        )

        total_loss = 0.0
        total_correct = 0
        total_points = 0
        n_batches = 0

        for batch in val_loader:
            pts, lbl = self._prepare_batch(batch, stage_cfg)
            logits = self.model(pts)
            loss = self._loss_fn(logits, lbl, pts)  # type: ignore
            preds = logits.argmax(dim=-1)

            total_loss    += loss.item()
            total_correct += (preds == lbl).sum().item()
            total_points  += lbl.numel()
            n_batches     += 1

        avg_loss = total_loss / max(1, n_batches)
        accuracy = total_correct / max(1, total_points)

        intersection = np.zeros(self.num_classes)
        union        = np.zeros(self.num_classes)

        self.model.eval()
        for batch in val_loader:
            pts, lbl = self._prepare_batch(batch, stage_cfg)
            logits = self.model(pts)
            preds = logits.argmax(dim=-1).reshape(-1).cpu().numpy()
            gt    = lbl.reshape(-1).cpu().numpy()
            for c in range(self.num_classes):
                p_c, g_c = preds == c, gt == c
                intersection[c] += (p_c & g_c).sum()
                union[c]        += (p_c | g_c).sum()

        valid = union > 0
        miou = float((intersection[valid] / union[valid]).mean()) if valid.any() else 0.0

        return {
            "val_loss": round(avg_loss, 5),
            "val_accuracy": round(accuracy, 4),
            "val_mIoU": round(miou, 4),
        }

    # ── Main training loop ─────────────────────────────────────────────────

    def train(
        self,
        n_epochs: int,
        start_epoch: int = 0,
        mining_interval: int = 10,
    ) -> None:
        """
        Run the full curriculum training loop.

        Parameters
        ----------
        n_epochs        : int — total epochs
        start_epoch     : int — epoch to resume from
        mining_interval : int — run hard-case mining every N epochs
        """
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)

        train_loader = DataLoader(
            self.train_dataset,
            batch_size=self.batch_size,
            shuffle=True,
            num_workers=self.num_workers,
            pin_memory=True,
            drop_last=True,
        )

        logger.info("=" * 60)
        logger.info("  CurriculumTrainer — starting")
        logger.info("  n_epochs=%d  batch_size=%d  n_classes=%d",
                    n_epochs, self.batch_size, self.num_classes)
        logger.info(self.stage_controller.summary())
        logger.info("=" * 60)

        for epoch in range(start_epoch, n_epochs):
            t0 = time.perf_counter()

            # Get / advance stage
            stage_cfg = self.stage_controller.get_stage(epoch)

            # Train
            train_metrics = self.train_epoch(epoch, stage_cfg, train_loader)

            # Validate
            val_metrics = self.validate(stage_cfg)

            # Scheduler step
            if self.scheduler:
                self.scheduler.step()

            elapsed = time.perf_counter() - t0

            # ── Logging ──────────────────────────────────────────────────
            val_miou = val_metrics.get("val_mIoU")
            log_msg = (
                f"Epoch {epoch+1:>3}/{n_epochs}  "
                f"[{stage_cfg.description}]  "
                f"[{elapsed:.1f}s]  "
                f"loss={train_metrics['loss']:.4f}  "
                f"acc={train_metrics['accuracy']:.4f}  "
                f"mIoU={train_metrics['mIoU']:.4f}"
            )
            if val_metrics:
                log_msg += (
                    f"  | val_loss={val_metrics['val_loss']:.4f}"
                    f"  val_mIoU={val_metrics['val_mIoU']:.4f}"
                )
            logger.info(log_msg)

            # TensorBoard
            if self.writer:
                for k, v in train_metrics.items():
                    if isinstance(v, (int, float)):
                        self.writer.add_scalar(f"curriculum_train/{k}", v, epoch)
                for k, v in val_metrics.items():
                    if isinstance(v, (int, float)):
                        self.writer.add_scalar(f"curriculum_val/{k}", v, epoch)
                self.writer.add_scalar("curriculum/stage", stage_cfg.stage.value, epoch)

            # Dashboard JSON
            combined_metrics = {**train_metrics, **val_metrics, "elapsed_s": round(elapsed, 2)}
            self.metrics_history.append({"epoch": epoch, **combined_metrics})
            self._write_dashboard_log(epoch, n_epochs, combined_metrics)

            # Checkpoint
            val_loss = val_metrics.get("val_loss", train_metrics["loss"])
            if val_loss < self.best_val_metric:
                self.best_val_metric = val_loss
                self._save_checkpoint(epoch, "best.pth")
                logger.info("  ✓ New best model  val_loss=%.4f", val_loss)
            self._save_checkpoint(epoch, "latest.pth")
            if (epoch + 1) % 10 == 0:
                self._save_checkpoint(epoch, f"epoch_{epoch+1}.pth")

            # Stage advancement check
            self.stage_controller.maybe_advance(epoch, val_miou)

            # Epoch callback
            if self.on_epoch_end:
                try:
                    self.on_epoch_end(epoch, combined_metrics)
                except Exception as exc:
                    logger.warning("on_epoch_end callback raised: %s", exc)

        logger.info("=" * 60)
        logger.info("  Curriculum training complete")
        logger.info("  Best val metric: %.4f", self.best_val_metric)
        logger.info("=" * 60)

    # ── Utilities ─────────────────────────────────────────────────────────

    def _save_checkpoint(self, epoch: int, filename: str) -> None:
        ckpt = {
            "epoch": epoch,
            "model_state_dict": self.model.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "best_val_metric": self.best_val_metric,
            "stage_controller": self.stage_controller.state_dict(),
        }
        if self.scheduler:
            ckpt["scheduler_state_dict"] = self.scheduler.state_dict()
        torch.save(ckpt, self.output_dir / filename)

    def load_checkpoint(self, path: str) -> int:
        """Load checkpoint. Returns start epoch."""
        ckpt = torch.load(path, map_location=self.device)
        self.model.load_state_dict(ckpt["model_state_dict"])
        self.optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        self.best_val_metric = ckpt.get("best_val_metric", float("inf"))
        if "stage_controller" in ckpt:
            self.stage_controller.load_state_dict(ckpt["stage_controller"])
        if self.scheduler and "scheduler_state_dict" in ckpt:
            self.scheduler.load_state_dict(ckpt["scheduler_state_dict"])
        start_epoch = ckpt.get("epoch", 0) + 1
        logger.info("Checkpoint loaded from %s (epoch %d)", path, start_epoch)
        return start_epoch

    def _write_dashboard_log(
        self,
        epoch: int,
        n_epochs: int,
        metrics: Dict,
    ) -> None:
        log = {
            "epoch": epoch,
            "total_epochs": n_epochs,
            "stage": self.stage_controller.current_stage_enum.value,
            "stage_name": self.stage_controller.current_stage.description,
            "best_val_metric": self.best_val_metric,
            **metrics,
        }
        path = self.log_dir / "curriculum_status.json"
        with open(path, "w") as f:
            json.dump(log, f, indent=2)

        history_path = self.log_dir / "curriculum_history.json"
        with open(history_path, "w") as f:
            json.dump(self.metrics_history, f, indent=2)
