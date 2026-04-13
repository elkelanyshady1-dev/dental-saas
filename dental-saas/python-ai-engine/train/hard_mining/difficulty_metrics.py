"""
difficulty_metrics.py — Per-case difficulty scoring for hard-case mining.

Given predicted and ground-truth labels (and optionally point coordinates),
this module computes a composite difficulty score in [0, 1] that reflects
how hard a given scan is for the current model.

Score composition:
    difficulty = w1*(1 - mean_iou)        # segmentation quality
               + w2*boundary_error        # boundary precision
               + w3*missing_teeth_penalty # structural completeness

    Default weights: w1=0.6, w2=0.3, w3=0.1

Usage:
    from train.hard_mining.difficulty_metrics import compute_case_difficulty

    score, breakdown = compute_case_difficulty(pred_labels, gt_labels, points)
    print(score)          # e.g. 0.74  → hard case
    print(breakdown)      # {"iou_term": 0.45, "boundary_term": ...}
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

NUM_TEETH = 32          # FDI: teeth 1-32
GINGIVA_CLASS = 0       # class 0 is always gingiva
TOOTH_CLASSES = list(range(1, NUM_TEETH + 1))   # 1..32

DEFAULT_WEIGHTS = {"iou": 0.6, "boundary": 0.3, "missing": 0.1}


# ---------------------------------------------------------------------------
# Data class for structured output
# ---------------------------------------------------------------------------

@dataclass
class DifficultyBreakdown:
    """Detailed breakdown of the difficulty score computation."""
    case_id: str = ""
    difficulty: float = 0.0

    # Component scores (all in [0, 1])
    iou_term: float = 0.0
    boundary_term: float = 0.0
    missing_term: float = 0.0

    # Raw values for logging/analysis
    mean_iou: float = 0.0
    boundary_error: float = 0.0
    missing_teeth_penalty: float = 0.0

    # Per-tooth IoU (key=tooth class, value=iou)
    per_tooth_iou: Dict[int, float] = field(default_factory=dict)

    # Which teeth are in GT but missing from predictions
    missing_predicted_teeth: List[int] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "case_id": self.case_id,
            "difficulty": round(self.difficulty, 4),
            "iou_term": round(self.iou_term, 4),
            "boundary_term": round(self.boundary_term, 4),
            "missing_term": round(self.missing_term, 4),
            "mean_iou": round(self.mean_iou, 4),
            "boundary_error_fraction": round(self.boundary_error, 4),
            "missing_teeth_penalty": round(self.missing_teeth_penalty, 4),
            "missing_predicted_teeth": self.missing_predicted_teeth,
            "per_tooth_iou": {
                str(k): round(v, 4)
                for k, v in self.per_tooth_iou.items()
            },
        }


# ---------------------------------------------------------------------------
# Core metric functions
# ---------------------------------------------------------------------------

def _segmentation_iou(
    pred: np.ndarray,
    gt: np.ndarray,
    num_classes: int = 33,
) -> Tuple[float, Dict[int, float]]:
    """
    Compute mean IoU and per-class IoU between predicted and GT labels.

    Args:
        pred: (N,) predicted class indices
        gt:   (N,) ground truth class indices
        num_classes: total classes (0=gingiva, 1-32=teeth)

    Returns:
        mean_iou: float in [0, 1]
        per_class_iou: dict {class_idx: iou}
    """
    per_class = {}
    for c in range(num_classes):
        pred_c = pred == c
        gt_c = gt == c
        if gt_c.sum() == 0:
            continue  # skip absent classes
        intersection = np.logical_and(pred_c, gt_c).sum()
        union = np.logical_or(pred_c, gt_c).sum()
        per_class[c] = float(intersection / union) if union > 0 else 0.0

    mean_iou = float(np.mean(list(per_class.values()))) if per_class else 0.0
    return mean_iou, per_class


def _find_boundary_points(
    labels: np.ndarray, points: np.ndarray, k: int = 8
) -> np.ndarray:
    """
    Find boundary points using KD-tree nearest-neighbor analysis.

    A point is at a boundary if any of its k neighbors has a different label.

    Args:
        labels: (N,) class label per point
        points: (N, 3) point coordinates
        k: number of neighbors to check

    Returns:
        is_boundary: (N,) boolean mask
    """
    from scipy.spatial import cKDTree

    tree = cKDTree(points)
    # k+1 because the nearest neighbor of a point is itself
    _, nn_idx = tree.query(points, k=min(k + 1, len(points)))
    nn_idx = nn_idx[:, 1:]   # exclude self

    neighbor_labels = labels[nn_idx]          # (N, k)
    is_boundary = np.any(
        neighbor_labels != labels[:, None], axis=1
    )
    return is_boundary


def _boundary_error(
    pred: np.ndarray,
    gt: np.ndarray,
    points: Optional[np.ndarray] = None,
    k: int = 8,
) -> float:
    """
    Compute fraction of GT boundary points that are mispredicted.

    If points is None, falls back to label-change detection on a flat array
    (assumes points are spatially ordered, e.g. from mesh faces).

    Returns:
        float in [0, 1] — 0 = perfect boundary, 1 = all boundary wrong
    """
    if points is not None:
        try:
            is_boundary_gt = _find_boundary_points(gt, points, k=k)
        except ImportError:
            is_boundary_gt = _approx_boundary_mask(gt)
    else:
        is_boundary_gt = _approx_boundary_mask(gt)

    n_boundary = is_boundary_gt.sum()
    if n_boundary == 0:
        return 0.0

    # Fraction of boundary points that are incorrectly predicted
    wrong = (pred[is_boundary_gt] != gt[is_boundary_gt]).sum()
    return float(wrong / n_boundary)


def _approx_boundary_mask(labels: np.ndarray, window: int = 4) -> np.ndarray:
    """
    Approximate boundary detection without spatial coordinates.

    Marks a point as boundary if any of its `window` neighbors in
    index space has a different label. This is a fast fallback.
    """
    N = len(labels)
    is_boundary = np.zeros(N, dtype=bool)
    for offset in range(1, window + 1):
        if offset < N:
            is_boundary[:-offset] |= labels[:-offset] != labels[offset:]
            is_boundary[offset:] |= labels[offset:] != labels[:-offset]
    return is_boundary


def _missing_teeth_penalty(
    pred: np.ndarray,
    gt: np.ndarray,
) -> Tuple[float, List[int]]:
    """
    Detect teeth present in GT but absent in predictions.

    Also adds penalty for widespread tooth→gingiva mispredictions.

    Returns:
        penalty: float in [0, 1]
        missing: sorted list of missing tooth class indices
    """
    gt_teeth = set(np.unique(gt)) & set(TOOTH_CLASSES)
    pred_teeth = set(np.unique(pred)) & set(TOOTH_CLASSES)

    missing = sorted(gt_teeth - pred_teeth)
    n_gt_teeth = max(len(gt_teeth), 1)

    # Basic missing tooth ratio
    missing_ratio = len(missing) / n_gt_teeth

    # Bonus penalty if many tooth points predicted as gingiva (class 0)
    tooth_mask = np.isin(gt, TOOTH_CLASSES)
    n_tooth_gt = tooth_mask.sum()
    if n_tooth_gt > 0:
        tooth_as_gingiva = ((pred == GINGIVA_CLASS) & tooth_mask).sum()
        gingiva_contamination = float(tooth_as_gingiva / n_tooth_gt)
    else:
        gingiva_contamination = 0.0

    # Blend: heavy weight on missing teeth, lighter on gingiva contamination
    penalty = float(np.clip(0.7 * missing_ratio + 0.3 * gingiva_contamination, 0.0, 1.0))
    return penalty, missing


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_case_difficulty(
    pred_labels: np.ndarray,
    gt_labels: np.ndarray,
    points: Optional[np.ndarray] = None,
    case_id: str = "",
    weights: Optional[Dict[str, float]] = None,
    num_classes: int = 33,
    boundary_k: int = 8,
) -> Tuple[float, DifficultyBreakdown]:
    """
    Compute a composite difficulty score for a single orthodontic scan.

    The difficulty score is a weighted sum of three components:
        1. IoU deficit:        how far the model is from perfect segmentation
        2. Boundary error:     fraction of boundary points mispredicted
        3. Missing penalty:    teeth present in GT but absent in predictions

    Args:
        pred_labels:  (N,) array of predicted class indices
        gt_labels:    (N,) array of ground truth class indices
        points:       (N, 3) optional point coordinates for boundary detection.
                      If None, approximate boundary detection is used.
        case_id:      optional identifier for the scan (for logging)
        weights:      optional dict overriding default weights
                      {"iou": 0.6, "boundary": 0.3, "missing": 0.1}
        num_classes:  total number of classes (default 33)
        boundary_k:   number of neighbors for boundary detection

    Returns:
        difficulty: float in [0, 1] — 0=easy, 1=very hard
        breakdown: DifficultyBreakdown with per-component details
    """
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    # Normalise weights to sum to 1 for safety
    total_w = sum(w.values())
    w = {k: v / total_w for k, v in w.items()}

    pred = np.asarray(pred_labels).flatten()
    gt = np.asarray(gt_labels).flatten()

    if len(pred) != len(gt):
        raise ValueError(
            f"pred_labels ({len(pred)}) and gt_labels ({len(gt)}) must have the same length."
        )

    # 1. Segmentation IoU
    mean_iou, per_class_iou = _segmentation_iou(pred, gt, num_classes=num_classes)
    iou_term = 1.0 - mean_iou              # high when IoU is low

    # 2. Boundary error
    boundary_err = _boundary_error(pred, gt, points=points, k=boundary_k)
    boundary_term = boundary_err

    # 3. Missing teeth penalty
    missing_pen, missing_teeth = _missing_teeth_penalty(pred, gt)
    missing_term = missing_pen

    # Composite difficulty
    difficulty = float(np.clip(
        w["iou"] * iou_term
        + w["boundary"] * boundary_term
        + w["missing"] * missing_term,
        0.0, 1.0,
    ))

    # Per-tooth IoU (exclude gingiva class 0)
    per_tooth_iou = {k: v for k, v in per_class_iou.items() if k in TOOTH_CLASSES}

    breakdown = DifficultyBreakdown(
        case_id=case_id,
        difficulty=difficulty,
        iou_term=iou_term,
        boundary_term=boundary_term,
        missing_term=missing_term,
        mean_iou=mean_iou,
        boundary_error=boundary_err,
        missing_teeth_penalty=missing_pen,
        per_tooth_iou=per_tooth_iou,
        missing_predicted_teeth=missing_teeth,
    )

    return difficulty, breakdown


def classify_difficulty(score: float) -> str:
    """Human-readable difficulty tier."""
    if score < 0.25:
        return "easy"
    elif score < 0.50:
        return "medium"
    elif score < 0.75:
        return "hard"
    else:
        return "very_hard"
