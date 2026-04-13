"""
stage_controller.py — Controls which training stage is active and when to advance.

Three Stages
------------
    Stage 1  Isolated tooth patches
             Model learns localised tooth geometry without distractors.
             Easiest — fast convergence, high per-tooth accuracy.

    Stage 2  Neighbour tooth patches
             Patches contain 1-2 adjacent teeth + proximal boundary zone.
             Model learns interproximal separation.

    Stage 3  Full dental arch
             Full scan passed to the model.
             Model must handle gingival margins, full occlusion, cross-arch context.

Advancement Logic
-----------------
    Epoch-based:  advance after stage_1_epochs / stage_2_epochs (default).
    Metric-based: optionally advance only after val_miou > threshold.
    Manual:       StageController.advance() can be called directly.

Usage
-----
    controller = StageController(stage_1_epochs=20, stage_2_epochs=30)

    for epoch in range(total_epochs):
        stage = controller.get_stage(epoch)
        train_one_epoch(model, loader_for_stage(stage), ...)
        controller.maybe_advance(epoch, val_miou)
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from enum import IntEnum
from pathlib import Path
from typing import Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Stage enum
# ─────────────────────────────────────────────────────────────────────────────

class TrainingStage(IntEnum):
    """Curriculum training stage identifier."""
    STAGE_1_ISOLATED   = 1   # isolated tooth patches
    STAGE_2_NEIGHBOUR  = 2   # neighbour tooth patches
    STAGE_3_FULL_ARCH  = 3   # full dental arch


# ─────────────────────────────────────────────────────────────────────────────
# Stage configuration dataclass
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class StageConfig:
    """
    Configuration for one training stage.

    Attributes
    ----------
    stage              : TrainingStage identifier
    start_epoch        : First epoch of this stage (inclusive)
    end_epoch          : Last epoch of this stage (inclusive); -1 = until end
    description        : Human-readable description
    patch_radius_mm    : Patch extraction radius for Stage 1/2
    n_seeds            : FPS seed count for patch generation
    include_neighbours : Whether to include adjacent teeth (Stage 2+)
    boundary_weight    : Loss weight multiplier for boundary-zone faces
    lr_scale           : LR multiplier relative to base LR
    miou_threshold     : Minimum val mIoU to consider for advancement (-1 = disabled)
    dataloader_kwargs  : Extra kwargs forwarded to DataLoader
    """
    stage: TrainingStage
    start_epoch: int
    end_epoch: int                          # -1 = infinite
    description: str = ""
    patch_radius_mm: float = 10.0
    n_seeds: int = 32
    include_neighbours: bool = False
    boundary_weight: float = 2.0
    lr_scale: float = 1.0
    miou_threshold: float = -1.0            # -1 = epoch-based only
    dataloader_kwargs: Dict = field(default_factory=dict)

    @property
    def n_epochs(self) -> int:
        if self.end_epoch < 0:
            return -1
        return self.end_epoch - self.start_epoch + 1


# ─────────────────────────────────────────────────────────────────────────────
# Stage Controller
# ─────────────────────────────────────────────────────────────────────────────

class StageController:
    """
    Manages the three-stage curriculum training schedule.

    Parameters
    ----------
    stage_1_epochs : int
        Number of epochs in Stage 1 (default 20).
    stage_2_epochs : int
        Number of epochs in Stage 2 (default 30).
    stage_1_miou_threshold : float
        Min val mIoU to advance from Stage 1 → 2 if metric-based control
        is enabled.  -1 = epoch-based only.
    stage_2_miou_threshold : float
        Min val mIoU to advance from Stage 2 → 3.  -1 = epoch-based only.
    log_dir : str, optional
        If set, writes stage_log.json to this directory on each transition.
    on_stage_change : callable, optional
        Called with (old_stage, new_stage, epoch) on every transition.
    """

    def __init__(
        self,
        stage_1_epochs: int = 20,
        stage_2_epochs: int = 30,
        stage_1_miou_threshold: float = -1.0,
        stage_2_miou_threshold: float = -1.0,
        log_dir: Optional[str] = None,
        on_stage_change: Optional[Callable] = None,
    ) -> None:
        self.stage_1_epochs = stage_1_epochs
        self.stage_2_epochs = stage_2_epochs
        self._log_dir = Path(log_dir) if log_dir else None
        self._on_stage_change = on_stage_change

        stage_2_start = stage_1_epochs
        stage_3_start = stage_1_epochs + stage_2_epochs

        self.stages: List[StageConfig] = [
            StageConfig(
                stage=TrainingStage.STAGE_1_ISOLATED,
                start_epoch=0,
                end_epoch=stage_1_epochs - 1,
                description="Stage 1 — Isolated tooth patches",
                patch_radius_mm=8.0,
                n_seeds=16,
                include_neighbours=False,
                boundary_weight=1.5,
                lr_scale=1.0,
                miou_threshold=stage_1_miou_threshold,
            ),
            StageConfig(
                stage=TrainingStage.STAGE_2_NEIGHBOUR,
                start_epoch=stage_2_start,
                end_epoch=stage_3_start - 1,
                description="Stage 2 — Neighbour tooth patches",
                patch_radius_mm=12.0,
                n_seeds=32,
                include_neighbours=True,
                boundary_weight=2.5,
                lr_scale=0.5,
                miou_threshold=stage_2_miou_threshold,
            ),
            StageConfig(
                stage=TrainingStage.STAGE_3_FULL_ARCH,
                start_epoch=stage_3_start,
                end_epoch=-1,
                description="Stage 3 — Full dental arch",
                patch_radius_mm=0.0,        # no patching — full arch
                n_seeds=0,
                include_neighbours=True,
                boundary_weight=3.0,
                lr_scale=0.25,
                miou_threshold=-1.0,
            ),
        ]

        self._current_stage_idx: int = 0
        self._history: List[Dict] = []

    # ── Current stage ──────────────────────────────────────────────────────

    @property
    def current_stage(self) -> StageConfig:
        return self.stages[self._current_stage_idx]

    @property
    def current_stage_enum(self) -> TrainingStage:
        return self.current_stage.stage

    def get_stage(self, epoch: int) -> StageConfig:
        """
        Return the stage config that applies to *epoch*.

        This uses the default epoch-boundary schedule without metric gates.
        Call :meth:`maybe_advance` each epoch to use metric-based gating.
        """
        for cfg in reversed(self.stages):
            if epoch >= cfg.start_epoch:
                return cfg
        return self.stages[0]

    # ── Advancement logic ──────────────────────────────────────────────────

    def maybe_advance(
        self,
        epoch: int,
        val_miou: Optional[float] = None,
    ) -> bool:
        """
        Check whether to advance to the next stage and do so if warranted.

        Advancement happens when BOTH conditions are met:
            1. epoch >= stage.end_epoch (epoch-based gate)
            2. val_miou >= stage.miou_threshold  (metric gate; ignored if -1)

        Parameters
        ----------
        epoch    : current epoch (0-indexed)
        val_miou : current validation mIoU (None → metric gate ignored)

        Returns
        -------
        advanced : bool — True if stage was advanced this call
        """
        if self._current_stage_idx >= len(self.stages) - 1:
            return False  # already at final stage

        cfg = self.current_stage

        # Epoch gate
        epoch_gate = (cfg.end_epoch >= 0 and epoch >= cfg.end_epoch)

        # Metric gate
        if cfg.miou_threshold > 0 and val_miou is not None:
            metric_gate = val_miou >= cfg.miou_threshold
        else:
            metric_gate = True   # disabled or no metric provided

        if epoch_gate and metric_gate:
            return self.advance(epoch, val_miou)

        return False

    def advance(
        self,
        epoch: int,
        val_miou: Optional[float] = None,
    ) -> bool:
        """
        Forcefully advance to the next stage.

        Returns True if advanced, False if already at final stage.
        """
        if self._current_stage_idx >= len(self.stages) - 1:
            logger.warning("StageController: already at final stage — cannot advance.")
            return False

        old_stage = self.current_stage
        self._current_stage_idx += 1
        new_stage = self.current_stage

        entry = {
            "epoch": epoch,
            "from_stage": old_stage.stage.value,
            "to_stage": new_stage.stage.value,
            "val_miou": round(val_miou, 4) if val_miou is not None else None,
            "description": new_stage.description,
        }
        self._history.append(entry)

        logger.info(
            "\n%s\n  CURRICULUM ADVANCE  epoch=%d\n"
            "  %s  →  %s\n%s",
            "═" * 60, epoch,
            old_stage.description, new_stage.description,
            "═" * 60,
        )

        if self._log_dir:
            self._write_log()

        if self._on_stage_change:
            try:
                self._on_stage_change(old_stage.stage, new_stage.stage, epoch)
            except Exception as exc:
                logger.warning("on_stage_change callback raised: %s", exc)

        return True

    # ── State serialisation ────────────────────────────────────────────────

    def state_dict(self) -> Dict:
        """Return serialisable state for checkpointing."""
        return {
            "current_stage_idx": self._current_stage_idx,
            "history": self._history,
        }

    def load_state_dict(self, state: Dict) -> None:
        """Restore state from checkpoint."""
        self._current_stage_idx = state.get("current_stage_idx", 0)
        self._history = state.get("history", [])
        logger.info(
            "StageController restored: stage=%s  transitions=%d",
            self.current_stage_enum.name, len(self._history),
        )

    def _write_log(self) -> None:
        if self._log_dir is None:
            return
        self._log_dir.mkdir(parents=True, exist_ok=True)
        log_path = self._log_dir / "stage_log.json"
        payload = {
            "current_stage": self.current_stage_enum.value,
            "current_description": self.current_stage.description,
            "history": self._history,
        }
        with open(log_path, "w") as f:
            json.dump(payload, f, indent=2)

    def summary(self) -> str:
        """Return a human-readable summary of the stage schedule."""
        lines = ["Curriculum Training Schedule:"]
        for cfg in self.stages:
            end = f"epoch {cfg.end_epoch}" if cfg.end_epoch >= 0 else "∞"
            lines.append(
                f"  {cfg.stage.name:<25s}  "
                f"epochs {cfg.start_epoch}–{end}  "
                f"patch_r={cfg.patch_radius_mm:.0f}mm  "
                f"bw={cfg.boundary_weight:.1f}x  "
                f"lr_scale={cfg.lr_scale}"
            )
        return "\n".join(lines)
