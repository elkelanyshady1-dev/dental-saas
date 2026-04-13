"""
coarse_dataset.py — Dataset for Stage 1 coarse segmentation training.
======================================================================

Expected directory layout per case:
    datasets/cases/
        case_001/
            points.npy          (N, 3)  float32 — point cloud
            tooth_labels.npy    (N,)    int64   — 0=gingiva  1-32=individual tooth
            gingiva_labels.npy  (N,)    int64   — 0=gingiva  1=tooth (BINARY — optional)

    If gingiva_labels.npy is absent, it is derived automatically from
    tooth_labels.npy: any non-zero label → 1 (tooth).

Output per sample:
    {
        "points":          (N, 3)  float32  — xyz
        "normals":         (N, 3)  float32  — surface normals (from PCA-KNN)
        "geo_features":    (N, 4)  float32  — geodesic features
        "coarse_labels":   (N,)    int64    — 0=gingiva  1=tooth (binary)
        "tooth_labels":    (N,)    int64    — original 0-32 labels (for reference)
    }
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional, Callable, List

import numpy as np
import torch
from torch.utils.data import Dataset

# Reuse GeodesicFeatureExtractor from coarse_meshnet
from .coarse_meshnet import GeodesicFeatureExtractor

logger = logging.getLogger(__name__)


# ── Normal estimation ─────────────────────────────────────────────────────────

def _estimate_normals(points: np.ndarray, k: int = 20) -> np.ndarray:
    """Estimate per-point normals via PCA on k-NN neighbourhood."""
    from scipy.spatial import cKDTree
    tree = cKDTree(points)
    k_q = min(k + 1, len(points))
    _, idx = tree.query(points, k=k_q)
    neighbours = points[idx[:, 1:]]          # (N, k, 3)

    centred = neighbours - neighbours.mean(axis=1, keepdims=True)
    cov = np.einsum("nki,nkj->nij", centred, centred) / (k_q - 1)
    _, eigvecs = np.linalg.eigh(cov)        # eigvecs: (N, 3, 3)
    normals = eigvecs[:, :, 0]              # smallest eigenvector = normal
    return normals.astype(np.float32)


# ── CoarseDataset ─────────────────────────────────────────────────────────────

class CoarseDataset(Dataset):
    """
    PyTorch Dataset for Stage 1 coarse (binary) segmentation.

    Args:
        data_root:        root directory containing case sub-directories
        num_points:       number of points to use per sample (FPS / random crop)
        augment:          if True, apply random rotation + jitter
        k_normal:         KNN for normal estimation (default 20)
        k_geo:            KNN for geodesic features (default 16)
        transform:        optional callable applied to the output dict
        cases:            optional list of case directory names to restrict to
    """

    def __init__(
        self,
        data_root: str,
        num_points: int = 8192,
        augment: bool = False,
        k_normal: int = 20,
        k_geo: int = 16,
        transform: Optional[Callable] = None,
        cases: Optional[List[str]] = None,
    ) -> None:
        self.data_root = Path(data_root)
        self.num_points = num_points
        self.augment = augment
        self.k_normal = k_normal
        self.transform = transform
        self._geo_extractor = GeodesicFeatureExtractor(k=k_geo)

        # Discover case directories
        if cases is not None:
            self._cases = [self.data_root / c for c in cases
                           if (self.data_root / c / "points.npy").exists()]
        else:
            self._cases = sorted([
                p for p in self.data_root.iterdir()
                if p.is_dir() and (p / "points.npy").exists()
            ])

        logger.info(
            "CoarseDataset: %d cases | num_points=%d | augment=%s",
            len(self._cases), num_points, augment
        )

    def __len__(self) -> int:
        return len(self._cases)

    def __getitem__(self, idx: int) -> dict:
        case_dir = self._cases[idx]

        # Load points
        points = np.load(case_dir / "points.npy").astype(np.float32)    # (N, 3)
        tooth_labels = np.load(case_dir / "tooth_labels.npy").astype(np.int64)  # (N,)

        # Load or derive binary (coarse) labels
        coarse_path = case_dir / "coarse_labels.npy"
        if coarse_path.exists():
            coarse_labels = np.load(coarse_path).astype(np.int64)
        else:
            # Derive: any non-zero tooth label → tooth (1)
            coarse_labels = (tooth_labels > 0).astype(np.int64)

        # ── Subsample ────────────────────────────────────────────────────────
        N = len(points)
        if N >= self.num_points:
            chosen = np.random.choice(N, self.num_points, replace=False)
        else:
            chosen = np.random.choice(N, self.num_points, replace=True)

        points        = points[chosen]
        coarse_labels = coarse_labels[chosen]
        tooth_labels  = tooth_labels[chosen]

        # ── Normalise to unit sphere ─────────────────────────────────────────
        centroid = points.mean(axis=0)
        points -= centroid
        scale = np.linalg.norm(points, axis=-1).max()
        if scale > 1e-6:
            points /= scale

        # ── Augmentation ─────────────────────────────────────────────────────
        if self.augment:
            # Random rotation around Z axis
            theta = np.random.uniform(0, 2 * np.pi)
            c, s = np.cos(theta), np.sin(theta)
            R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], dtype=np.float32)
            points = points @ R.T

            # Random jitter
            points += np.random.normal(0, 0.005, points.shape).astype(np.float32)

        # ── Compute normals & geodesic features ──────────────────────────────
        normals   = _estimate_normals(points, k=self.k_normal)       # (N, 3)
        geo_feats = self._geo_extractor(points)                       # (N, 4)

        sample = {
            "points":        torch.from_numpy(points),                # (N, 3)
            "normals":       torch.from_numpy(normals),               # (N, 3)
            "geo_features":  torch.from_numpy(geo_feats),             # (N, 4)
            "coarse_labels": torch.from_numpy(coarse_labels),         # (N,)  long
            "tooth_labels":  torch.from_numpy(tooth_labels),          # (N,)  long
            "case_id":       case_dir.name,
        }

        if self.transform:
            sample = self.transform(sample)

        return sample
