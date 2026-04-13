"""
hard_case_detector.py — Curriculum-aware hard case detection.

Extends the existing train/hard_mining/hard_case_detector.py with
curriculum-specific difficulty metrics:

    Stage 1  — reports per-tooth mIoU deficit
    Stage 2  — reports interproximal boundary confusion rate
    Stage 3  — reports full-arch mIoU + crowding indicator

Key difference from the base detector:
    • Stage-aware difficulty weighting
    • Detects "boundary-confusion" cases where neighbour teeth are mislabelled
    • Flags large gingiva regions (>60% of scan = likely poor segmentation)

Usage
-----
    detector = CurriculumHardCaseDetector(
        model=model,
        data_root="./datasets/cases",
        stage=TrainingStage.STAGE_2_NEIGHBOUR,
    )
    hard_cases = detector.run(device)
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn

from ..stage_controller import TrainingStage

logger = logging.getLogger(__name__)


class CurriculumHardCaseDetector:
    """
    Curriculum-aware hard case detector.

    Computes per-case difficulty scores weighted according to the current
    training stage.  Difficulty at each stage targets:

        Stage 1 — per-tooth mIoU accuracy (single tooth accuracy)
        Stage 2 — boundary confusion: fraction of boundary-zone mislabelled
        Stage 3 — full arch mIoU + crowding score (% interproximal confusion)

    Parameters
    ----------
    model          : nn.Module
    data_root      : str
    stage          : TrainingStage
    log_path       : str
    hard_cases_dir : str
    top_fraction   : float — top % to designate hard
    num_points     : int
    num_classes    : int
    is_multitask   : bool
    """

    # ── Stage difficulty weights ──────────────────────────────────────────
    _STAGE_WEIGHTS: Dict[TrainingStage, Dict[str, float]] = {
        TrainingStage.STAGE_1_ISOLATED: {
            "miou_deficit": 0.7,
            "boundary_confusion": 0.2,
            "large_gingiva": 0.1,
        },
        TrainingStage.STAGE_2_NEIGHBOUR: {
            "miou_deficit": 0.4,
            "boundary_confusion": 0.5,
            "large_gingiva": 0.1,
        },
        TrainingStage.STAGE_3_FULL_ARCH: {
            "miou_deficit": 0.4,
            "boundary_confusion": 0.3,
            "large_gingiva": 0.1,
            "crowding_score": 0.2,
        },
    }

    def __init__(
        self,
        model: nn.Module,
        data_root: str,
        stage: TrainingStage = TrainingStage.STAGE_3_FULL_ARCH,
        log_path: str = "./logs/curriculum_hard_cases.json",
        hard_cases_dir: str = "./datasets/hard_cases",
        top_fraction: float = 0.20,
        num_points: int = 4096,
        num_classes: int = 33,
        is_multitask: bool = False,
    ) -> None:
        self.model = model
        self.data_root = Path(data_root)
        self.stage = stage
        self.log_path = Path(log_path)
        self.hard_cases_dir = Path(hard_cases_dir)
        self.top_fraction = top_fraction
        self.num_points = num_points
        self.num_classes = num_classes
        self.is_multitask = is_multitask
        self.weights = self._STAGE_WEIGHTS.get(stage, self._STAGE_WEIGHTS[TrainingStage.STAGE_3_FULL_ARCH])

    # ── Core metrics ──────────────────────────────────────────────────────

    def _compute_difficulty(
        self,
        pred: np.ndarray,
        gt: np.ndarray,
        points: np.ndarray,
    ) -> Dict[str, float]:
        """
        Compute stage-weighted difficulty score.

        Returns dict with all sub-metrics and final difficulty score.
        """
        N = len(gt)

        # ── mIoU deficit ────────────────────────────────────────────────
        ious = []
        for cls in range(self.num_classes):
            pred_c = pred == cls
            gt_c   = gt   == cls
            inter  = (pred_c & gt_c).sum()
            union  = (pred_c | gt_c).sum()
            if union > 0:
                ious.append(inter / union)
        mean_iou = float(np.mean(ious)) if ious else 0.0
        miou_deficit = 1.0 - mean_iou

        # ── Boundary confusion ───────────────────────────────────────────
        # A point is "boundary" if ≥1 of its 8 nearest neighbours has a
        # different GT label.  Boundary confusion = fraction of boundary
        # points that are mislabelled.
        boundary_confusion = 0.0
        try:
            from scipy.spatial import cKDTree
            tree = cKDTree(points)
            k_q = min(9, N)
            _, nn_idx = tree.query(points, k=k_q)
            nn_gt = gt[nn_idx[:, 1:]]
            is_boundary = (nn_gt != gt[:, np.newaxis]).any(axis=1)
            n_boundary = int(is_boundary.sum())
            if n_boundary > 0:
                boundary_wrong = int((pred[is_boundary] != gt[is_boundary]).sum())
                boundary_confusion = boundary_wrong / n_boundary
        except Exception:
            pass

        # ── Large gingiva score ──────────────────────────────────────────
        gingiva_fraction = float((pred == 0).sum()) / N
        large_gingiva = max(0.0, gingiva_fraction - 0.6) / 0.4   # 0 at 60%, 1 at 100%

        # ── Crowding score (Stage 3) ─────────────────────────────────────
        # Fraction of predicted tooth voxels that are one-misidentified-class
        # among boundary points of touching teeth.
        crowding_score = 0.0
        if self.stage == TrainingStage.STAGE_3_FULL_ARCH:
            # Simplified: pairs of adjacent classes that are frequently confused
            confusion_count = 0
            tooth_gt = gt[gt > 0]
            tooth_pred = pred[gt > 0]
            for cls in range(1, self.num_classes):
                mask = tooth_gt == cls
                if mask.sum() > 0:
                    # Adjacent classes = cls-1 and cls+1
                    neighbours = []
                    if cls > 1:  neighbours.append(cls - 1)
                    if cls < self.num_classes - 1: neighbours.append(cls + 1)
                    for nb in neighbours:
                        confused = ((tooth_pred[mask] == nb).sum())
                        confusion_count += int(confused)
            if len(tooth_gt) > 0:
                crowding_score = min(1.0, confusion_count / len(tooth_gt))

        # ── Weighted difficulty ──────────────────────────────────────────
        w = self.weights
        difficulty = (
            w.get("miou_deficit", 0) * miou_deficit
            + w.get("boundary_confusion", 0) * boundary_confusion
            + w.get("large_gingiva", 0) * large_gingiva
            + w.get("crowding_score", 0) * crowding_score
        )
        difficulty = min(1.0, max(0.0, difficulty))

        return {
            "mean_iou": round(mean_iou, 4),
            "miou_deficit": round(miou_deficit, 4),
            "boundary_confusion": round(boundary_confusion, 4),
            "gingiva_fraction": round(gingiva_fraction, 4),
            "large_gingiva": round(large_gingiva, 4),
            "crowding_score": round(crowding_score, 4),
            "difficulty": round(difficulty, 4),
            "stage": self.stage.value,
        }

    # ── Inference ─────────────────────────────────────────────────────────

    @torch.no_grad()
    def _infer_case(
        self,
        points: np.ndarray,
        device: torch.device,
    ) -> np.ndarray:
        pts = torch.from_numpy(points).float().unsqueeze(0).to(device)
        if self.is_multitask:
            out = self.model(pts)
            preds = out["tooth_logits"].argmax(dim=-1).squeeze(0).cpu().numpy()
        else:
            logits = self.model(pts)
            preds = logits.argmax(dim=-1).squeeze(0).cpu().numpy()
        return preds.astype(np.int64)

    # ── Run ───────────────────────────────────────────────────────────────

    def run(self, device: torch.device) -> List[Dict]:
        """
        Score all cases in data_root and return top hard cases.

        Returns
        -------
        List of case dicts sorted by difficulty descending.
        """
        self.model.eval()

        case_dirs = [
            d for d in self.data_root.iterdir()
            if d.is_dir() and (d / "points.npy").exists()
        ]
        logger.info(
            "CurriculumHardCaseDetector[stage=%s]: scoring %d cases",
            self.stage.name, len(case_dirs),
        )

        results: List[Dict] = []
        for case_dir in sorted(case_dirs):
            try:
                pts  = np.load(str(case_dir / "points.npy")).astype(np.float32)
                lbl_path = case_dir / "tooth_labels.npy"
                if not lbl_path.exists():
                    lbl_path = case_dir / "pseudo_labels.npy"
                if not lbl_path.exists():
                    continue
                gt = np.load(str(lbl_path)).astype(np.int64)

                # Subsample to num_points
                N = len(pts)
                if N > self.num_points:
                    idx = np.random.choice(N, self.num_points, replace=False)
                    pts, gt = pts[idx], gt[idx]

                pred = self._infer_case(pts, device)
                metrics = self._compute_difficulty(pred, gt, pts)
                metrics["case_id"] = case_dir.name
                metrics["case_path"] = str(case_dir)
                results.append(metrics)

            except Exception as exc:
                logger.warning("Failed to score %s: %s", case_dir.name, exc)

        results.sort(key=lambda x: x["difficulty"], reverse=True)
        n_hard = max(1, int(len(results) * self.top_fraction))
        hard_results = results[:n_hard]

        self._save_log(results, hard_results)
        logger.info(
            "Hard case detection complete: %d/%d hard cases",
            len(hard_results), len(results),
        )
        return hard_results

    def _save_log(
        self,
        all_results: List[Dict],
        hard_results: List[Dict],
    ) -> None:
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.log_path, "w") as f:
            json.dump(hard_results, f, indent=2)

        full_path = self.log_path.parent / f"difficulty_report_stage{self.stage.value}.json"
        with open(full_path, "w") as f:
            json.dump(all_results, f, indent=2)
        logger.info("Hard case log → %s", self.log_path)
