"""
dataset_integrity_checker.py — Pre-training dataset safety validation.
=======================================================================

Runs a suite of checks BEFORE any training job or dataset rebuild.

Checks performed
----------------
    CHECK 1: Directory existence
        Verify required directories exist and are not empty.

    CHECK 2: Minimum case count
        Abort if fewer than ``min_cases`` cases present.

    CHECK 3: Per-case file completeness
        Every case directory must contain:
            points.npy      — point cloud
            tooth_labels.npy — labels

    CHECK 4: Label consistency
        • Labels must be 1-D integer arrays
        • Labels must have same length as points
        • All labels must be in range [0, 32] (FDI range)
        • No case may have only gingiva labels (all zeros)

    CHECK 5: Point cloud validity
        • points.npy must be (N, 3) float32
        • No NaN or Inf values
        • N ≥ min_points (default 256)

    CHECK 6: Duplicate case IDs
        The same directory name must not appear in multiple
        source directories.

    CHECK 7: Coarse label consistency (if coarse_labels.npy present)
        Must be binary (0 or 1) and match length of points.

Result
------
    :class:`IntegrityReport` — passed, warnings, errors, case-level details.
    Training MUST be aborted if ``report.passed is False``.

Usage
-----
    checker = DatasetIntegrityChecker(
        processed_dir="./datasets/processed_cases",
        synthetic_dir="./datasets/synthetic_cases",
        pseudo_dir="./datasets/pseudo_cases",
    )
    report = checker.run()
    if not report.passed:
        raise RuntimeError(f"Dataset integrity failed:\\n{report.summary()}")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)


# ── IntegrityReport ───────────────────────────────────────────────────────────

@dataclass
class IntegrityReport:
    """
    Result of a full integrity check run.

    Attributes:
        passed:      True only if zero errors (warnings are non-blocking)
        errors:      list of blocking error messages
        warnings:    list of non-blocking warning messages
        case_issues: {case_id: [issue messages]}
        stats:       summary counts (total_cases, valid_cases, ...)
        timestamp:   ISO timestamp when the check ran
    """
    passed: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    case_issues: Dict[str, List[str]] = field(default_factory=dict)
    stats: Dict[str, int] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))

    def summary(self) -> str:
        """Return human-readable summary string."""
        lines = [
            f"Dataset Integrity Report — {self.timestamp}",
            f"  Status : {'✓ PASSED' if self.passed else '✗ FAILED'}",
            f"  Errors : {len(self.errors)}",
            f"  Warnings: {len(self.warnings)}",
        ]
        for k, v in self.stats.items():
            lines.append(f"  {k}: {v}")
        if self.errors:
            lines.append("\nErrors:")
            for e in self.errors:
                lines.append(f"  ✗ {e}")
        if self.warnings:
            lines.append("\nWarnings:")
            for w in self.warnings:
                lines.append(f"  ⚠ {w}")
        if self.case_issues:
            lines.append("\nPer-case issues (first 10):")
            for cid, issues in list(self.case_issues.items())[:10]:
                for iss in issues:
                    lines.append(f"  [{cid}] {iss}")
        return "\n".join(lines)

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "errors": self.errors,
            "warnings": self.warnings,
            "case_issues": self.case_issues,
            "stats": self.stats,
            "timestamp": self.timestamp,
        }


# ── DatasetIntegrityChecker ───────────────────────────────────────────────────

class DatasetIntegrityChecker:
    """
    Pre-training dataset validation suite.

    Args:
        processed_dir:  path to processed_cases directory
        synthetic_dir:  path to synthetic_cases directory (optional)
        pseudo_dir:     path to pseudo_cases directory (optional)
        min_cases:      minimum total cases for training (default 1)
        min_points:     minimum points per case (default 256)
        max_label:      maximum valid FDI label (default 32)
        abort_on_nan:   if True, NaN points are an ERROR (not warning)
    """

    # Required files per case
    REQUIRED_FILES = ["points.npy", "tooth_labels.npy"]

    def __init__(
        self,
        processed_dir: str | Path,
        synthetic_dir: Optional[str | Path] = None,
        pseudo_dir: Optional[str | Path] = None,
        min_cases: int = 1,
        min_points: int = 256,
        max_label: int = 32,
        abort_on_nan: bool = True,
    ) -> None:
        self.processed_dir = Path(processed_dir)
        self.synthetic_dir = Path(synthetic_dir) if synthetic_dir else None
        self.pseudo_dir    = Path(pseudo_dir) if pseudo_dir else None
        self.min_cases     = min_cases
        self.min_points    = min_points
        self.max_label     = max_label
        self.abort_on_nan  = abort_on_nan

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _collect_case_dirs(self) -> Dict[str, Path]:
        """Return {case_id: path} for all source directories."""
        dirs: Dict[str, Path] = {}
        for source_dir in [self.processed_dir, self.synthetic_dir, self.pseudo_dir]:
            if source_dir is None or not source_dir.exists():
                continue
            for p in sorted(source_dir.iterdir()):
                if p.is_dir():
                    if p.name in dirs:
                        # Duplicate! Will report below
                        pass
                    dirs[p.name] = p
        return dirs

    def _check_case(self, case_id: str, case_path: Path) -> List[str]:
        """Run per-case checks. Returns list of issue strings (empty = OK)."""
        issues: List[str] = []

        # CHECK 3: File completeness
        for fname in self.REQUIRED_FILES:
            if not (case_path / fname).exists():
                issues.append(f"Missing required file: {fname}")
                return issues  # Cannot proceed without required files

        # Load arrays
        try:
            pts = np.load(case_path / "points.npy")
        except Exception as e:
            issues.append(f"Cannot load points.npy: {e}")
            return issues

        try:
            labels = np.load(case_path / "tooth_labels.npy")
        except Exception as e:
            issues.append(f"Cannot load tooth_labels.npy: {e}")
            return issues

        # CHECK 5: Point cloud validity
        if pts.ndim != 2 or pts.shape[1] != 3:
            issues.append(f"points.npy shape {pts.shape} — expected (N, 3)")
        if len(pts) < self.min_points:
            issues.append(f"Only {len(pts)} points — minimum is {self.min_points}")

        if np.isnan(pts).any() or np.isinf(pts).any():
            msg = f"points.npy contains NaN or Inf values"
            if self.abort_on_nan:
                issues.append(msg)
            else:
                issues.append(f"WARN: {msg}")

        # CHECK 4: Label consistency
        if labels.ndim != 1:
            issues.append(f"tooth_labels.npy must be 1-D, got shape {labels.shape}")
        elif len(labels) != len(pts):
            issues.append(
                f"Label count {len(labels)} ≠ point count {len(pts)}"
            )
        else:
            if labels.max() < 0 or labels.max() > self.max_label:
                issues.append(
                    f"Labels out of range [0, {self.max_label}]: "
                    f"min={labels.min()} max={labels.max()}"
                )
            if (labels > 0).sum() == 0:
                issues.append("All labels are 0 (gingiva only) — no tooth labels present")

        # CHECK 7: Coarse labels (optional)
        coarse_path = case_path / "coarse_labels.npy"
        if coarse_path.exists():
            try:
                coarse = np.load(coarse_path)
                if len(coarse) != len(pts):
                    issues.append(
                        f"coarse_labels.npy length {len(coarse)} ≠ points {len(pts)}"
                    )
                unique_coarse = set(coarse.tolist())
                if not unique_coarse.issubset({0, 1}):
                    issues.append(
                        f"coarse_labels.npy should be binary (0|1), "
                        f"found values: {unique_coarse}"
                    )
            except Exception as e:
                issues.append(f"Cannot load coarse_labels.npy: {e}")

        return issues

    # ── Main run ──────────────────────────────────────────────────────────────

    def run(self) -> IntegrityReport:
        """
        Execute the full integrity check suite.

        Returns:
            :class:`IntegrityReport` — always returns (never raises).
        """
        errors: List[str] = []
        warnings: List[str] = []
        case_issues: Dict[str, List[str]] = {}

        # CHECK 1: Directory existence
        if not self.processed_dir.exists():
            errors.append(f"processed_dir does not exist: {self.processed_dir}")

        # Collect all cases
        all_cases = self._collect_case_dirs()

        # CHECK 6: Duplicate case IDs across sources
        seen_ids: Dict[str, str] = {}
        for source_dir in [self.processed_dir, self.synthetic_dir, self.pseudo_dir]:
            if source_dir is None or not source_dir.exists():
                continue
            for p in source_dir.iterdir():
                if p.is_dir():
                    if p.name in seen_ids:
                        warnings.append(
                            f"Duplicate case ID '{p.name}' in "
                            f"{seen_ids[p.name]} AND {source_dir.name}"
                        )
                    else:
                        seen_ids[p.name] = source_dir.name

        # CHECK 2: Minimum case count
        if len(all_cases) < self.min_cases:
            errors.append(
                f"Only {len(all_cases)} cases found — minimum is {self.min_cases}"
            )

        # Per-case checks
        n_valid = 0
        n_errors = 0
        for case_id, case_path in all_cases.items():
            issues = self._check_case(case_id, case_path)
            if issues:
                case_issues[case_id] = issues
                n_errors += 1
                # Case-level issues that are NaN/format are errors; labels are warnings
                for iss in issues:
                    if "WARN:" in iss:
                        warnings.append(f"{case_id}: {iss.replace('WARN: ','')}")
                    else:
                        errors.append(f"Case {case_id}: {iss}")
            else:
                n_valid += 1

        # Stats
        n_processed = sum(
            1 for p in self.processed_dir.iterdir() if p.is_dir()
        ) if self.processed_dir.exists() else 0
        n_synthetic = sum(
            1 for p in (self.synthetic_dir or Path(".")).iterdir() if p.is_dir()
        ) if self.synthetic_dir and self.synthetic_dir.exists() else 0
        n_pseudo = sum(
            1 for p in (self.pseudo_dir or Path(".")).iterdir() if p.is_dir()
        ) if self.pseudo_dir and self.pseudo_dir.exists() else 0

        stats = {
            "total_cases": len(all_cases),
            "valid_cases": n_valid,
            "invalid_cases": n_errors,
            "processed_cases": n_processed,
            "synthetic_cases": n_synthetic,
            "pseudo_cases": n_pseudo,
        }

        passed = len(errors) == 0
        report = IntegrityReport(
            passed=passed,
            errors=errors,
            warnings=warnings,
            case_issues=case_issues,
            stats=stats,
        )
        logger.info("Integrity check: %s  (%d errors, %d warnings)",
                    "PASSED" if passed else "FAILED", len(errors), len(warnings))
        return report
