"""
landmark_dataset.py — Dataset for Stage 3 landmark detection training.
======================================================================

Ground-truth landmark annotations are stored as:
    landmark_points.npy      (L, 5)  float32
        columns: [x, y, z, landmark_type_int, fdi_tooth_number]

    Where landmark_type_int ∈ {0..5} (LandmarkType enum values).

Output per sample:
    {
        "points":          (N, 3) float32
        "normals":         (N, 3) float32
        "geo_features":    (N, 4) float32
        "landmark_maps":   (N, 6) float32  — binary label per type per point
                                            (1.0 within radius of a GT landmark)
        "coarse_labels":   (N,) int64  — optional, for multi-task training
    }

The landmark_maps are "soft" maps: all points within ``spread_radius_mm``
of a ground-truth landmark receive label 1.0.  This avoids extreme sparsity
and provides a training gradient at nearby points.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional, Callable

import numpy as np
import torch
from torch.utils.data import Dataset

from .landmark_head import LandmarkType, N_LANDMARK_TYPES

logger = logging.getLogger(__name__)


class LandmarkDataset(Dataset):
    """
    Dataset for Stage 3 landmark detection training.

    Args:
        data_root:         root directory with case sub-directories
        num_points:        points to sample per case
        spread_radius_mm:  radius around GT landmark that receive label 1
                           (in normalised space after unit-sphere normalisation)
        augment:           random rotation + jitter
        require_landmarks: if True, skip cases without landmark_points.npy
    """

    def __init__(
        self,
        data_root: str,
        num_points: int = 8192,
        spread_radius_mm: float = 0.1,   # in normalised space ~2mm physical
        augment: bool = False,
        require_landmarks: bool = True,
        transform: Optional[Callable] = None,
    ) -> None:
        self.data_root        = Path(data_root)
        self.num_points       = num_points
        self.spread_radius    = spread_radius_mm
        self.augment          = augment
        self.transform        = transform

        self._cases: List[Path] = []
        for p in sorted(self.data_root.iterdir()):
            if not p.is_dir():
                continue
            has_points = (p / "points.npy").exists()
            has_lm     = (p / "landmark_points.npy").exists()
            if has_points and (has_lm or not require_landmarks):
                self._cases.append(p)

        logger.info(
            "LandmarkDataset: %d cases | num_points=%d | spread=%.3f",
            len(self._cases), num_points, spread_radius_mm
        )

    def __len__(self) -> int:
        return len(self._cases)

    def __getitem__(self, idx: int) -> dict:
        case_dir = self._cases[idx]

        points = np.load(case_dir / "points.npy").astype(np.float32)

        # Sub-sample
        N = len(points)
        if N >= self.num_points:
            chosen = np.random.choice(N, self.num_points, replace=False)
        else:
            chosen = np.random.choice(N, self.num_points, replace=True)
        points = points[chosen]

        # Normalise
        centroid = points.mean(axis=0)
        points  -= centroid
        scale    = np.linalg.norm(points, axis=-1).max()
        if scale > 1e-6:
            points /= scale
        else:
            scale = 1.0

        # Augmentation
        if self.augment:
            theta = np.random.uniform(0, 2 * np.pi)
            c, s  = np.cos(theta), np.sin(theta)
            R     = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], np.float32)
            points = points @ R.T
            points += np.random.normal(0, 0.005, points.shape).astype(np.float32)

        # Normals (constant placeholder if not precomputed)
        normals_path = case_dir / "normals.npy"
        if normals_path.exists():
            normals = np.load(normals_path).astype(np.float32)[chosen]
        else:
            normals = np.zeros_like(points)
            normals[:, 2] = 1.0

        # Geo features (simple placeholder)
        geo_feats = np.zeros((self.num_points, 4), np.float32)

        # Build landmark maps (N, n_types) binary
        lm_maps = np.zeros((self.num_points, N_LANDMARK_TYPES), np.float32)

        lm_path = case_dir / "landmark_points.npy"
        if lm_path.exists():
            lm_data = np.load(lm_path).astype(np.float32)   # (L, 5)
            if len(lm_data) > 0:
                lm_xyz   = lm_data[:, :3]
                lm_types = lm_data[:, 3].astype(np.int32)

                # Transform GT landmarks to normalised space
                lm_xyz_norm = (lm_xyz - centroid) / (scale + 1e-8)

                from scipy.spatial import cKDTree
                tree = cKDTree(points)

                for li in range(len(lm_data)):
                    lt = int(lm_types[li])
                    if lt < 0 or lt >= N_LANDMARK_TYPES:
                        continue
                    pt = lm_xyz_norm[li]
                    near_idx = tree.query_ball_point(pt, r=self.spread_radius)
                    if near_idx:
                        lm_maps[near_idx, lt] = 1.0

        # Coarse labels (optional)
        cl_path = case_dir / "coarse_labels.npy"
        if cl_path.exists():
            coarse = np.load(cl_path).astype(np.int64)[chosen]
        else:
            tl_path = case_dir / "tooth_labels.npy"
            if tl_path.exists():
                tl = np.load(tl_path).astype(np.int64)[chosen]
                coarse = (tl > 0).astype(np.int64)
            else:
                coarse = np.zeros(self.num_points, np.int64)

        sample = {
            "points":        torch.from_numpy(points),
            "normals":       torch.from_numpy(normals),
            "geo_features":  torch.from_numpy(geo_feats),
            "landmark_maps": torch.from_numpy(lm_maps),
            "coarse_labels": torch.from_numpy(coarse),
            "case_id":       case_dir.name,
        }

        if self.transform:
            sample = self.transform(sample)

        return sample
