"""
tooth_library_builder.py — Extract individual tooth meshes from labelled scans.

Builds a tooth library (catalogue) from pre-labelled dataset cases.
Each library entry stores:
    • FDI tooth number
    • Crown point cloud  (N, 3)
    • Landmarks          (L, 3) — cusps, marginal ridges
    • Source case ID

The library is then used by SyntheticArchGenerator to assemble synthetic arches.

Usage
-----
    builder = ToothLibraryBuilder(library_dir="./datasets/tooth_library")
    builder.build_from_dataset("./datasets/cases", fdi_assignments="auto")

    # Later:
    entries = builder.load(fdi_filter=[11, 12, 21, 22])
"""

from __future__ import annotations

import json
import logging
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ToothEntry:
    """
    A single tooth entry in the library.

    Attributes
    ----------
    fdi_number  : int   — FDI notation (11–48); 0 = unknown
    crown_points: (N, 3) float32 — normalised crown point cloud
    landmarks   : (L, 3) float32 — landmark XYZ (empty if unavailable)
    case_id     : str
    label_id    : int   — raw label value used in tooth_labels.npy
    n_points    : int   — number of points in crown_points
    source_path : str   — absolute path to source case directory
    """
    fdi_number:   int
    crown_points: np.ndarray    # (N, 3)
    landmarks:    np.ndarray    # (L, 3) — may be (0, 3)
    case_id:      str
    label_id:     int
    source_path:  str

    @property
    def n_points(self) -> int:
        return len(self.crown_points)

    def normalised_crown(self) -> np.ndarray:
        """Return crown_points centred at origin, scaled to unit sphere."""
        pts = self.crown_points.copy()
        pts -= pts.mean(axis=0)
        r = np.linalg.norm(pts, axis=-1).max()
        if r > 1e-6:
            pts /= r
        return pts


# ─────────────────────────────────────────────────────────────────────────────
# Builder
# ─────────────────────────────────────────────────────────────────────────────

class ToothLibraryBuilder:
    """
    Scans a dataset of labelled cases and extracts per-tooth point clouds.

    Parameters
    ----------
    library_dir : str
        Directory to save the library (one folder per FDI tooth).
    max_points_per_tooth : int
        Maximum points to keep per tooth entry (random subsampled).
    min_points_per_tooth : int
        Discard teeth with fewer points than this.
    """

    def __init__(
        self,
        library_dir: str = "./datasets/tooth_library",
        max_points_per_tooth: int = 2048,
        min_points_per_tooth: int = 32,
    ) -> None:
        self.library_dir = Path(library_dir)
        self.max_points  = max_points_per_tooth
        self.min_points  = min_points_per_tooth

    # ── Build ─────────────────────────────────────────────────────────────

    def build_from_dataset(
        self,
        dataset_dir: str,
        overwrite: bool = False,
    ) -> Dict[int, int]:
        """
        Extract teeth from all cases in dataset_dir.

        Returns a dict of {label_id: n_entries_added}.
        """
        dataset_path = Path(dataset_dir)
        case_dirs = [d for d in dataset_path.iterdir() if d.is_dir()]
        logger.info(
            "ToothLibraryBuilder: scanning %d cases in %s",
            len(case_dirs), dataset_dir,
        )

        counts: Dict[int, int] = {}
        for case_dir in sorted(case_dirs):
            n = self._process_case(case_dir, overwrite)
            for lid, cnt in n.items():
                counts[lid] = counts.get(lid, 0) + cnt

        logger.info(
            "Library build complete: %d distinct label IDs, %d total entries",
            len(counts), sum(counts.values()),
        )
        return counts

    def _process_case(
        self,
        case_dir: Path,
        overwrite: bool,
    ) -> Dict[int, int]:
        """Extract all teeth from one case. Returns {label_id: count}."""
        pts_path = case_dir / "points.npy"
        lbl_path = case_dir / "tooth_labels.npy"
        if not pts_path.exists() or not lbl_path.exists():
            return {}

        points = np.load(str(pts_path)).astype(np.float32)
        labels = np.load(str(lbl_path)).astype(np.int64)
        case_id = case_dir.name

        # Optionally load landmarks
        lm_path = case_dir / "landmark_points.npy"
        landmarks_all = np.load(str(lm_path)) if lm_path.exists() else None

        counts: Dict[int, int] = {}
        unique_labels = np.unique(labels)
        unique_labels = unique_labels[unique_labels > 0]  # skip gingiva (0)

        for lid in unique_labels:
            mask = labels == lid
            tooth_pts = points[mask]
            if len(tooth_pts) < self.min_points:
                continue

            # Subsample if necessary
            if len(tooth_pts) > self.max_points:
                idx = np.random.choice(len(tooth_pts), self.max_points, replace=False)
                tooth_pts = tooth_pts[idx]

            # Stub FDI: map label_id directly (overridden later by FDI assignment)
            fdi = int(lid) if int(lid) <= 48 else 0

            # Landmark subset for this tooth (if available)
            lm_pts = np.empty((0, 3), dtype=np.float32)
            if landmarks_all is not None and len(landmarks_all) > 0:
                # landmark_points.npy: (L, 5) = [x, y, z, lm_type, fdi_number]
                if landmarks_all.shape[1] >= 3:
                    lm_pts = landmarks_all[:, :3].astype(np.float32)

            entry = ToothEntry(
                fdi_number=fdi,
                crown_points=tooth_pts,
                landmarks=lm_pts,
                case_id=case_id,
                label_id=int(lid),
                source_path=str(case_dir),
            )

            self._save_entry(entry, overwrite)
            counts[int(lid)] = counts.get(int(lid), 0) + 1

        return counts

    def _save_entry(self, entry: ToothEntry, overwrite: bool) -> None:
        """Save a ToothEntry to disk."""
        out_dir = self.library_dir / f"fdi_{entry.fdi_number:02d}" / entry.case_id
        if out_dir.exists() and not overwrite:
            return
        out_dir.mkdir(parents=True, exist_ok=True)

        np.save(str(out_dir / "crown_points.npy"), entry.crown_points)
        np.save(str(out_dir / "landmarks.npy"), entry.landmarks)

        meta = {
            "fdi_number":  entry.fdi_number,
            "case_id":     entry.case_id,
            "label_id":    entry.label_id,
            "n_points":    entry.n_points,
            "source_path": entry.source_path,
        }
        with open(out_dir / "meta.json", "w") as f:
            json.dump(meta, f, indent=2)

    # ── Load ──────────────────────────────────────────────────────────────

    def load(
        self,
        fdi_filter: Optional[List[int]] = None,
        max_per_fdi: Optional[int] = None,
    ) -> List[ToothEntry]:
        """
        Load tooth entries from the library.

        Parameters
        ----------
        fdi_filter  : list of FDI numbers to load  (None = all)
        max_per_fdi : maximum entries per FDI class (None = unlimited)

        Returns
        -------
        List[ToothEntry]
        """
        if not self.library_dir.exists():
            logger.warning("Library dir does not exist: %s", self.library_dir)
            return []

        entries: List[ToothEntry] = []
        fdi_dirs = sorted(self.library_dir.iterdir())

        for fdi_dir in fdi_dirs:
            if not fdi_dir.is_dir() or not fdi_dir.name.startswith("fdi_"):
                continue
            try:
                fdi_num = int(fdi_dir.name.split("_")[1])
            except (IndexError, ValueError):
                continue

            if fdi_filter and fdi_num not in fdi_filter:
                continue

            case_entries: List[ToothEntry] = []
            for case_dir in fdi_dir.iterdir():
                if not case_dir.is_dir():
                    continue
                try:
                    crown = np.load(str(case_dir / "crown_points.npy"))
                    lm    = np.load(str(case_dir / "landmarks.npy"))
                    with open(case_dir / "meta.json") as f:
                        meta = json.load(f)
                    case_entries.append(ToothEntry(
                        fdi_number=meta["fdi_number"],
                        crown_points=crown,
                        landmarks=lm,
                        case_id=meta["case_id"],
                        label_id=meta["label_id"],
                        source_path=meta["source_path"],
                    ))
                except Exception as exc:
                    logger.warning("Failed to load entry %s: %s", case_dir, exc)

            if max_per_fdi and len(case_entries) > max_per_fdi:
                case_entries = case_entries[:max_per_fdi]
            entries.extend(case_entries)

        logger.info(
            "ToothLibrary loaded: %d entries  fdi_filter=%s",
            len(entries), fdi_filter,
        )
        return entries

    def summary(self) -> Dict[int, int]:
        """Return {fdi_number: n_entries} for all library entries."""
        summary: Dict[int, int] = {}
        if not self.library_dir.exists():
            return summary
        for fdi_dir in self.library_dir.iterdir():
            if not fdi_dir.is_dir():
                continue
            try:
                fdi = int(fdi_dir.name.split("_")[1])
            except (IndexError, ValueError):
                continue
            count = sum(1 for d in fdi_dir.iterdir() if d.is_dir())
            summary[fdi] = count
        return summary
