"""
dataset_merger.py — Rebuild the training_set from all source pools.
====================================================================

Merges three source pools into a unified training dataset:

    Source pools:
        processed_cases/    — real patient scans, preprocessed
        synthetic_cases/    — procedurally generated dental scans
        pseudo_cases/       — pseudo-labelled or augmented cases

    Output:
        training_set/merged_dataset/
            case_001/  → symlink or hard copy
            case_002/
            ...
            manifest.json   ← per-case provenance + stats

Algorithm
---------
1. Scan all three source directories.
2. Verify each case has ``points.npy`` + ``tooth_labels.npy``.
3. Create symlinks (fast, no disk duplication) or copy (cross-device)
   from each verified case into ``merged_dataset/``.
4. Write ``manifest.json`` with provenance for every merged case.
5. Return a :class:`MergeReport`.

SAFETY RULE: The merger NEVER modifies source directories.
             It only reads from them and writes to the output directory.

Usage
-----
    merger = DatasetMerger(
        processed_dir  = "./datasets/processed_cases",
        synthetic_dir  = "./datasets/synthetic_cases",
        pseudo_dir     = "./datasets/pseudo_cases",
        output_dir     = "./datasets/training_set/merged_dataset",
    )
    report = merger.rebuild()
    print(report.summary())
"""

from __future__ import annotations

import json
import logging
import os
import shutil
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)

# Files that must exist for a case to be merged
_REQUIRED = ["points.npy", "tooth_labels.npy"]
# All files that are copied/linked to the merged dataset
_COPY_FILES = [
    "points.npy",
    "tooth_labels.npy",
    "coarse_labels.npy",
    "normals.npy",
    "landmark_points.npy",
    "gingiva_labels.npy",
    "meta.json",
]


# ── MergeReport ───────────────────────────────────────────────────────────────

@dataclass
class MergeReport:
    """Result of a dataset merge operation."""
    version: int
    total_cases: int
    processed_cases: int
    synthetic_cases: int
    pseudo_cases: int
    skipped_cases: int
    skipped_reasons: Dict[str, str] = field(default_factory=dict)
    output_dir: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))
    elapsed_s: float = 0.0

    def summary(self) -> str:
        return (
            f"DatasetMerger Report — {self.timestamp}\n"
            f"  Total merged : {self.total_cases}\n"
            f"  Processed    : {self.processed_cases}\n"
            f"  Synthetic    : {self.synthetic_cases}\n"
            f"  Pseudo       : {self.pseudo_cases}\n"
            f"  Skipped      : {self.skipped_cases}\n"
            f"  Output dir   : {self.output_dir}\n"
            f"  Elapsed      : {self.elapsed_s:.1f}s"
        )

    def to_dict(self) -> dict:
        return asdict(self)


# ── DatasetMerger ─────────────────────────────────────────────────────────────

class DatasetMerger:
    """
    Rebuild the training_set from all source pools.

    Args:
        processed_dir:  path to processed_cases
        synthetic_dir:  path to synthetic_cases (optional)
        pseudo_dir:     path to pseudo_cases (optional)
        output_dir:     path to training_set/merged_dataset (will be created)
        use_symlinks:   if True, create symbolic links instead of copies
                        (faster, no disk duplication — requires same filesystem)
        overwrite:      if True, remove and recreate output_dir on rebuild
        version:        override version number (usually managed by DatasetVersionManager)
    """

    def __init__(
        self,
        processed_dir: str | Path,
        synthetic_dir: Optional[str | Path] = None,
        pseudo_dir: Optional[str | Path] = None,
        output_dir: str | Path = "./datasets/training_set/merged_dataset",
        use_symlinks: bool = False,
        overwrite: bool = True,
        version: int = 1,
    ) -> None:
        self.processed_dir = Path(processed_dir)
        self.synthetic_dir = Path(synthetic_dir) if synthetic_dir else None
        self.pseudo_dir    = Path(pseudo_dir)    if pseudo_dir    else None
        self.output_dir    = Path(output_dir)
        self.use_symlinks  = use_symlinks
        self.overwrite     = overwrite
        self.version       = version

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _is_valid_case(self, case_path: Path) -> bool:
        """Return True if all required files exist."""
        return all((case_path / f).exists() for f in _REQUIRED)

    def _link_or_copy(self, src: Path, dst: Path) -> None:
        """
        Create dst as a symlink to src or as a hard copy.
        dst parent directory must already exist.
        """
        if dst.exists() or dst.is_symlink():
            return  # already linked/copied — skip

        if self.use_symlinks:
            try:
                os.symlink(src.resolve(), dst)
                return
            except (OSError, NotImplementedError):
                pass  # fall through to copy on cross-device or Windows symlink failure

        shutil.copy2(src, dst)

    def _merge_case(
        self,
        src_dir: Path,
        source_type: str,
        manifest: dict,
    ) -> bool:
        """
        Copy/link one case into the merged dataset.

        Returns True on success, False if skipped.
        """
        case_id = src_dir.name
        out_case = self.output_dir / case_id

        out_case.mkdir(parents=True, exist_ok=True)

        copied_files = []
        for fname in _COPY_FILES:
            src_file = src_dir / fname
            if src_file.exists():
                self._link_or_copy(src_file, out_case / fname)
                copied_files.append(fname)

        # Count points for manifest
        n_points = 0
        pts_path = out_case / "points.npy"
        if pts_path.exists():
            try:
                n_points = int(np.load(pts_path).shape[0])
            except Exception:
                pass

        manifest[case_id] = {
            "case_id":     case_id,
            "source_type": source_type,
            "source_path": str(src_dir),
            "files":       copied_files,
            "n_points":    n_points,
        }
        return True

    # ── Public API ────────────────────────────────────────────────────────────

    def rebuild(self) -> MergeReport:
        """
        Rebuild the merged training directory from all source pools.

        Existing merged_dataset is cleared before rebuild (if overwrite=True).

        Returns:
            :class:`MergeReport`
        """
        import time
        t0 = time.perf_counter()

        # Optionally clear output directory first
        if self.overwrite and self.output_dir.exists():
            shutil.rmtree(self.output_dir)
            logger.info("Cleared previous merged dataset: %s", self.output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

        manifest: dict = {}
        counts = {"processed": 0, "synthetic": 0, "pseudo": 0}
        skipped = 0
        skip_reasons: Dict[str, str] = {}

        source_map = {
            "processed": self.processed_dir,
            "synthetic": self.synthetic_dir,
            "pseudo":    self.pseudo_dir,
        }

        for source_type, source_dir in source_map.items():
            if source_dir is None or not source_dir.exists():
                logger.debug("Source dir absent/None — skipping: %s", source_dir)
                continue

            for case_dir in sorted(source_dir.iterdir()):
                if not case_dir.is_dir():
                    continue
                if not self._is_valid_case(case_dir):
                    skipped += 1
                    skip_reasons[case_dir.name] = "Missing required files"
                    logger.warning("Skipping %s — missing required files", case_dir.name)
                    continue

                try:
                    self._merge_case(case_dir, source_type, manifest)
                    counts[source_type] += 1
                except Exception as exc:
                    skipped += 1
                    skip_reasons[case_dir.name] = str(exc)
                    logger.error("Failed to merge %s: %s", case_dir.name, exc)

        total = sum(counts.values())

        # Write manifest
        manifest_data = {
            "version":         self.version,
            "merged_at":       datetime.now().isoformat(timespec="seconds"),
            "total_cases":     total,
            "by_source":       counts,
            "cases":           manifest,
        }
        (self.output_dir / "manifest.json").write_text(
            json.dumps(manifest_data, indent=2), encoding="utf-8"
        )

        elapsed = time.perf_counter() - t0
        report = MergeReport(
            version=self.version,
            total_cases=total,
            processed_cases=counts["processed"],
            synthetic_cases=counts["synthetic"],
            pseudo_cases=counts["pseudo"],
            skipped_cases=skipped,
            skipped_reasons=skip_reasons,
            output_dir=str(self.output_dir),
            elapsed_s=elapsed,
        )
        logger.info(
            "Dataset merge complete: %d cases in %.1fs (skip=%d)",
            total, elapsed, skipped
        )
        return report

    def get_manifest(self) -> Optional[dict]:
        """Return the current manifest.json as a dict, or None if not found."""
        path = self.output_dir / "manifest.json"
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return None
