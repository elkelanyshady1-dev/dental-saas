"""
confidence_filter.py — Filter pseudo-labelled scans by quality metrics.

After PseudoLabelGenerator produces pseudo_labels.npy, ConfidenceFilter
decides which cases are suitable for training and cleans the label maps.

Filtering Criteria
------------------
    1. coverage >= min_coverage       (fraction of labelled points)
    2. mean_confidence >= min_mean_confidence
    3. n_tooth_classes >= min_tooth_classes (avoid empty scans)
    4. class distribution not too skewed

Usage
-----
    filt = ConfidenceFilter(
        min_coverage=0.70,
        min_mean_confidence=0.80,
        min_tooth_classes=5,
    )
    accepted, rejected = filt.filter_directory("./datasets/pseudo_labeled")
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class FilterResult:
    """Result of filtering one pseudo-labelled case."""
    case_id: str
    accepted: bool
    coverage: float
    mean_confidence: float
    n_tooth_classes: int
    rejection_reason: Optional[str] = None


class ConfidenceFilter:
    """
    Filters pseudo-labelled scan cases by confidence and quality metrics.

    Parameters
    ----------
    min_coverage         : float — minimum fraction of labelled points  (default 0.70)
    min_mean_confidence  : float — minimum mean confidence              (default 0.80)
    min_tooth_classes    : int   — min distinct tooth labels in scan    (default 3)
    max_gingiva_fraction : float — fail if gingiva > this fraction      (default 0.90)
    """

    def __init__(
        self,
        min_coverage: float = 0.70,
        min_mean_confidence: float = 0.80,
        min_tooth_classes: int = 3,
        max_gingiva_fraction: float = 0.90,
    ) -> None:
        self.min_coverage = min_coverage
        self.min_mean_confidence = min_mean_confidence
        self.min_tooth_classes = min_tooth_classes
        self.max_gingiva_fraction = max_gingiva_fraction

    def filter_case(self, case_dir: Path) -> FilterResult:
        """Filter a single case. Returns FilterResult."""
        case_id = case_dir.name
        lbl_path  = case_dir / "pseudo_labels.npy"
        conf_path = case_dir / "confidence.npy"
        meta_path = case_dir / "pseudo_meta.json"

        if not lbl_path.exists():
            return FilterResult(
                case_id=case_id, accepted=False,
                coverage=0.0, mean_confidence=0.0, n_tooth_classes=0,
                rejection_reason="no pseudo_labels.npy",
            )

        labels     = np.load(str(lbl_path)).astype(np.int64)
        confidence = np.load(str(conf_path)) if conf_path.exists() else None

        # Reload meta if available
        coverage        = 0.0
        mean_confidence = 0.0
        if meta_path.exists():
            with open(meta_path) as f:
                meta = json.load(f)
            coverage        = float(meta.get("coverage", 0.0))
            mean_confidence = float(meta.get("mean_confidence", 0.0))
        else:
            # Compute from raw arrays
            valid_mask = labels >= 0
            coverage = float(valid_mask.mean())
            if confidence is not None and valid_mask.any():
                mean_confidence = float(confidence[valid_mask].mean())

        # Count distinct tooth classes (exclude gingiva=0 and unlabelled=-1)
        valid_labels = labels[labels >= 0]
        tooth_labels = valid_labels[valid_labels > 0]
        n_tooth_classes = int(np.unique(tooth_labels).size)

        # Gingiva fraction check
        n_valid = len(valid_labels)
        n_going = int((valid_labels == 0).sum())
        gingiva_fraction = n_going / n_valid if n_valid > 0 else 0.0

        # Apply filters
        rejection_reason = None
        if coverage < self.min_coverage:
            rejection_reason = f"coverage={coverage:.2f} < {self.min_coverage}"
        elif mean_confidence < self.min_mean_confidence:
            rejection_reason = f"mean_conf={mean_confidence:.3f} < {self.min_mean_confidence}"
        elif n_tooth_classes < self.min_tooth_classes:
            rejection_reason = f"n_tooth_classes={n_tooth_classes} < {self.min_tooth_classes}"
        elif gingiva_fraction > self.max_gingiva_fraction:
            rejection_reason = f"gingiva_fraction={gingiva_fraction:.2f} > {self.max_gingiva_fraction}"

        accepted = rejection_reason is None

        # If accepted, purge unlabelled (-1) points by setting them to most
        # common tooth class or gingiva (0)
        if accepted and np.any(labels == -1):
            most_common = int(
                np.bincount(labels[labels >= 0]).argmax()
            )
            labels[labels == -1] = most_common
            np.save(str(lbl_path), labels)

        return FilterResult(
            case_id=case_id,
            accepted=accepted,
            coverage=coverage,
            mean_confidence=mean_confidence,
            n_tooth_classes=n_tooth_classes,
            rejection_reason=rejection_reason,
        )

    def filter_directory(
        self,
        pseudo_dir: str,
        write_report: bool = True,
    ) -> Tuple[List[FilterResult], List[FilterResult]]:
        """
        Filter all cases in a pseudo-labelled directory.

        Returns
        -------
        accepted : List[FilterResult]
        rejected : List[FilterResult]
        """
        src_dir  = Path(pseudo_dir)
        case_dirs = [d for d in src_dir.iterdir() if d.is_dir()]
        logger.info(
            "ConfidenceFilter: evaluating %d cases in %s", len(case_dirs), src_dir
        )

        accepted: List[FilterResult] = []
        rejected: List[FilterResult] = []

        for case_dir in sorted(case_dirs):
            result = self.filter_case(case_dir)
            if result.accepted:
                accepted.append(result)
            else:
                rejected.append(result)
                logger.debug(
                    "Rejected %s: %s", result.case_id, result.rejection_reason
                )

        logger.info(
            "ConfidenceFilter: accepted=%d  rejected=%d  (%.0f%%)",
            len(accepted), len(rejected),
            100 * len(accepted) / max(1, len(case_dirs)),
        )

        if write_report:
            report_path = src_dir / "filter_report.json"
            report = {
                "accepted": [
                    {"case_id": r.case_id, "coverage": r.coverage,
                     "mean_confidence": r.mean_confidence}
                    for r in accepted
                ],
                "rejected": [
                    {"case_id": r.case_id, "reason": r.rejection_reason}
                    for r in rejected
                ],
            }
            with open(report_path, "w") as f:
                json.dump(report, f, indent=2)
            logger.info("Filter report written → %s", report_path)

        return accepted, rejected
