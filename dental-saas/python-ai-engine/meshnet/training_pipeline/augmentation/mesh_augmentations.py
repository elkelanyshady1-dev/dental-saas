"""
mesh_augmentations.py — Geometric augmentations for dental point clouds.

Supported Augmentations
-----------------------
    occlusal_rotation   — rotation around the occlusal (Z) axis  ±180°
    scale_jitter        — uniform scale in [0.85, 1.15]
    vertex_noise        — additive Gaussian noise on XYZ
    elastic_deformation — local sinusoidal warp
    partial_crop        — random half-space crop (mimics partial scans)

All augmentations are label-preserving (they modify point positions only,
not labels).  Each augmentation has an independent probability of being
applied, allowing any combination.

Usage
-----
    aug = MeshAugmentations(config=AugmentationConfig(
        occlusal_rotation_prob=1.0,
        scale_jitter_prob=0.5,
        vertex_noise_prob=0.5,
    ))
    pts_aug, labels_aug = aug(points, labels)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class AugmentationConfig:
    """
    Augmentation probabilities and magnitudes.

    All *_prob fields: probability in [0, 1] that the augmentation is applied.
    """
    # Occlusal axis rotation
    occlusal_rotation_prob: float = 0.8
    rotation_max_deg: float = 180.0      # max rotation angle each side

    # Small tilts in X/Y axes (tooth scan variations)
    tilt_prob: float = 0.4
    tilt_max_deg: float = 15.0

    # Scale jitter
    scale_jitter_prob: float = 0.5
    scale_min: float = 0.85
    scale_max: float = 1.15

    # Vertex noise
    vertex_noise_prob: float = 0.5
    noise_std_mm: float = 0.1           # realistic for dental STL accuracy

    # Elastic deformation (local sinusoidal warp)
    elastic_prob: float = 0.3
    elastic_amplitude_mm: float = 0.5
    elastic_freq: float = 0.3

    # Partial crop (simulate partial scan)
    partial_crop_prob: float = 0.2
    crop_keep_fraction: float = 0.7     # keep at least this fraction of points

    # Global flip (mirror: simulate opposite arch)
    flip_prob: float = 0.3


# ─────────────────────────────────────────────────────────────────────────────
# Augmentation Class
# ─────────────────────────────────────────────────────────────────────────────

class MeshAugmentations:
    """
    Applies randomised geometric augmentations to a dental point cloud.

    All operations are performed in-place on copies — original arrays are
    not modified.

    Parameters
    ----------
    config : AugmentationConfig
    seed   : int, optional — for reproducible augmentation during unit testing
    """

    def __init__(
        self,
        config: Optional[AugmentationConfig] = None,
        seed: Optional[int] = None,
    ) -> None:
        self.config = config or AugmentationConfig()
        self._rng = np.random.default_rng(seed)

    # ── Public API ────────────────────────────────────────────────────────

    def __call__(
        self,
        points: np.ndarray,          # (N, 3)
        labels: np.ndarray,          # (N,)
        features: Optional[np.ndarray] = None,
    ) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]:
        """
        Apply a randomised subset of augmentations.

        Returns copies — original arrays are unchanged.
        """
        pts = points.copy().astype(np.float64)
        lbl = labels.copy()
        cfg = self.config

        # Occlusal rotation (Z axis)
        if self._rng.random() < cfg.occlusal_rotation_prob:
            pts = self._rotate_z(pts, cfg.rotation_max_deg)

        # Tilt (X/Y axes)
        if self._rng.random() < cfg.tilt_prob:
            pts = self._tilt(pts, cfg.tilt_max_deg)

        # Scale jitter
        if self._rng.random() < cfg.scale_jitter_prob:
            pts = self._scale_jitter(pts, cfg.scale_min, cfg.scale_max)

        # Vertex noise
        if self._rng.random() < cfg.vertex_noise_prob:
            pts = self._vertex_noise(pts, cfg.noise_std_mm)

        # Elastic deformation
        if self._rng.random() < cfg.elastic_prob:
            pts = self._elastic_deform(pts, cfg.elastic_amplitude_mm, cfg.elastic_freq)

        # Mirror flip (X axis — simulates opposite arch laterality)
        if self._rng.random() < cfg.flip_prob:
            pts[:, 0] = -pts[:, 0]

        # Partial crop (must come last — changes N)
        if self._rng.random() < cfg.partial_crop_prob:
            pts, lbl, features = self._partial_crop(
                pts, lbl, cfg.crop_keep_fraction, features
            )

        return pts.astype(np.float32), lbl, features

    # ── Individual augmentations ──────────────────────────────────────────

    def _rotate_z(self, pts: np.ndarray, max_deg: float) -> np.ndarray:
        """Rotate around the occlusal (Z) axis."""
        angle_rad = self._rng.uniform(-max_deg, max_deg) * np.pi / 180.0
        c, s = np.cos(angle_rad), np.sin(angle_rad)
        R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], dtype=np.float64)
        return pts @ R.T

    def _tilt(self, pts: np.ndarray, max_deg: float) -> np.ndarray:
        """Apply small tilts around X and Y axes (arch inclination variance)."""
        for axis in [0, 1]:   # tilt around X then Y
            angle_rad = self._rng.uniform(-max_deg, max_deg) * np.pi / 180.0
            c, s = np.cos(angle_rad), np.sin(angle_rad)
            if axis == 0:   # X tilt
                R = np.array([[1, 0, 0], [0, c, -s], [0, s, c]], dtype=np.float64)
            else:           # Y tilt
                R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float64)
            pts = pts @ R.T
        return pts

    def _scale_jitter(self, pts: np.ndarray, lo: float, hi: float) -> np.ndarray:
        """Uniform scale jitter (models patient size variation)."""
        scale = self._rng.uniform(lo, hi)
        return pts * scale

    def _vertex_noise(self, pts: np.ndarray, std_mm: float) -> np.ndarray:
        """Additive per-vertex Gaussian noise (models scanner imprecision)."""
        noise = self._rng.normal(0.0, std_mm, size=pts.shape)
        return pts + noise

    def _elastic_deform(
        self,
        pts: np.ndarray,
        amplitude: float,
        freq: float,
    ) -> np.ndarray:
        """
        Local sinusoidal elastic deformation.

        Applies a smooth spatially-varying displacement field to model
        soft-tissue deformation (cheeks, tongue, gingival variation).
        Each axis gets an independent sinusoidal phase.
        """
        phases = self._rng.uniform(0, 2 * np.pi, size=(3, 3))  # 3 axes × 3 dims
        displacement = np.zeros_like(pts)
        for out_dim in range(3):
            for in_dim in range(3):
                displacement[:, out_dim] += amplitude * np.sin(
                    freq * pts[:, in_dim] + phases[out_dim, in_dim]
                )
        return pts + displacement

    def _partial_crop(
        self,
        pts: np.ndarray,
        lbl: np.ndarray,
        keep_fraction: float,
        features: Optional[np.ndarray],
    ) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]:
        """
        Half-space crop: remove a random slab of points along a random axis.

        Simulates incomplete dental scans (partially opened mouth, scanner
        not reaching distal molars, etc.).
        """
        N = len(pts)
        target_n = max(1, int(N * keep_fraction))

        # Pick random axis and threshold
        axis = int(self._rng.integers(0, 3))
        axis_vals = pts[:, axis]
        threshold = self._rng.uniform(
            np.percentile(axis_vals, 20),
            np.percentile(axis_vals, 80),
        )
        keep_mask = axis_vals >= threshold
        n_kept = int(keep_mask.sum())

        # If crop removed too many, fall back to uniform random subset
        if n_kept < target_n:
            keep_idx = self._rng.choice(N, target_n, replace=False)
            keep_mask = np.zeros(N, dtype=bool)
            keep_mask[keep_idx] = True

        pts_out = pts[keep_mask]
        lbl_out = lbl[keep_mask]
        feat_out = features[keep_mask] if features is not None else None
        return pts_out, lbl_out, feat_out
