"""
boundary_sampler.py — Curriculum boundary-aware point sampler.

Sampling Ratios (curriculum-aware)
-----------------------------------
    40%  boundary zone  (tooth–gingiva interface, interproximal contacts)
    30%  tooth interior (away from boundary)
    30%  gingiva interior

"Boundary" Definition
---------------------
A point is a boundary point if ≥1 of its k-nearest neighbours has a
different class label.  This is the same definition as the pipeline-level
boundary_detection module but applied here at the point-cloud level
(no trimesh required).

Curriculum Integration
----------------------
In Stage 1 (isolated patches), boundary weight may be reduced because
patches are intentionally single-tooth — fewer boundary zones exist.
In Stage 2/3, boundary weight is increased to help the model focus on
interproximal contacts and gingival margins.

Usage
-----
    sampler = CurriculumBoundarySampler(
        n_points=4096,
        boundary_fraction=0.4,
        k_boundary=16,
    )
    pts_b, lbl_b = sampler.sample(points, labels)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np
from scipy.spatial import cKDTree

logger = logging.getLogger(__name__)


@dataclass
class CurriculumBoundarySampler:
    """
    Boundary-aware sampler for curriculum training.

    Parameters
    ----------
    n_points          : int   — output point count        (default 4096)
    boundary_fraction : float — fraction from boundary    (default 0.40)
    tooth_fraction    : float — fraction from tooth int.  (default 0.30)
    gingiva_fraction  : float — fraction from gingiva int.(default 0.30)
    k_boundary        : int   — KNN for boundary detection(default 16)
    replace           : bool  — allow replacement         (default True)
    seed              : int   — RNG seed                  (None = non-det)
    """
    n_points: int = 4096
    boundary_fraction: float = 0.40
    tooth_fraction: float = 0.30
    gingiva_fraction: float = 0.30
    k_boundary: int = 16
    replace: bool = True
    seed: Optional[int] = None

    def __post_init__(self) -> None:
        total = self.boundary_fraction + self.tooth_fraction + self.gingiva_fraction
        if abs(total - 1.0) > 1e-4:
            raise ValueError(
                f"Fractions must sum to 1.0, got {total:.4f}. "
                "Adjust boundary/tooth/gingiva fractions."
            )
        self._rng = np.random.default_rng(self.seed)

    # ── Boundary detection ─────────────────────────────────────────────────

    def _detect_boundary(
        self,
        points: np.ndarray,    # (N, 3)
        labels: np.ndarray,    # (N,)
    ) -> np.ndarray:
        """
        Return boolean mask of boundary points.

        A point is on the boundary if ANY k-nearest neighbour has a different
        label.  Uses cKDTree for O(N log N) KNN.
        """
        N = len(points)
        k_q = min(self.k_boundary + 1, N)
        tree = cKDTree(points)
        _, nn_idx = tree.query(points, k=k_q)       # (N, k_q)

        # Label of self = labels[i], labels of neighbours = labels[nn_idx[i]]
        neighbour_labels = labels[nn_idx[:, 1:]]    # (N, k_boundary) — skip self
        boundary_mask = (neighbour_labels != labels[:, np.newaxis]).any(axis=1)
        return boundary_mask

    # ── Core sampling ─────────────────────────────────────────────────────

    def sample(
        self,
        points: np.ndarray,         # (N, 3)
        labels: np.ndarray,         # (N,) int — 0=gingiva ≥1=tooth
        features: Optional[np.ndarray] = None,
    ) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]:
        """
        Return boundary-weighted sample.

        Returns
        -------
        sampled_pts    : (n_points, 3)
        sampled_labels : (n_points,)
        sampled_feats  : (n_points, F) or None
        """
        N = len(points)

        # ── Pools ──────────────────────────────────────────────────────────
        boundary_mask = self._detect_boundary(points, labels)

        tooth_int_mask = (~boundary_mask) & (labels > 0)
        ging_int_mask  = (~boundary_mask) & (labels == 0)

        boundary_idx  = np.where(boundary_mask)[0]
        tooth_int_idx = np.where(tooth_int_mask)[0]
        ging_int_idx  = np.where(ging_int_mask)[0]

        n_boundary = int(self.n_points * self.boundary_fraction)
        n_tooth    = int(self.n_points * self.tooth_fraction)
        n_ging     = self.n_points - n_boundary - n_tooth

        def _draw(pool: np.ndarray, n: int, fallback_pool: np.ndarray) -> np.ndarray:
            if len(pool) == 0:
                pool = fallback_pool
            if len(pool) == 0:
                pool = np.arange(N)
            return pool[self._rng.choice(
                len(pool), n,
                replace=self.replace or len(pool) < n,
            )]

        uniform_all = np.arange(N)
        b_chosen  = _draw(boundary_idx,  n_boundary, uniform_all)
        t_chosen  = _draw(tooth_int_idx, n_tooth,    boundary_idx if len(boundary_idx) else uniform_all)
        g_chosen  = _draw(ging_int_idx,  n_ging,     boundary_idx if len(boundary_idx) else uniform_all)

        chosen_idx = np.concatenate([b_chosen, t_chosen, g_chosen])
        perm = self._rng.permutation(len(chosen_idx))
        chosen_idx = chosen_idx[perm]

        logger.debug(
            "BoundarySampler: boundary=%d  tooth_int=%d  ging_int=%d  "
            "pool_sizes: b=%d t=%d g=%d",
            n_boundary, n_tooth, n_ging,
            len(boundary_idx), len(tooth_int_idx), len(ging_int_idx),
        )

        return (
            points[chosen_idx].astype(np.float32),
            labels[chosen_idx].astype(np.int64),
            features[chosen_idx] if features is not None else None,
        )

    # ── Curriculum adjustment ─────────────────────────────────────────────

    def set_boundary_fraction(self, frac: float) -> None:
        """
        Adjust boundary fraction dynamically (e.g. ramp up across stages).

        Automatically redistributes remaining fraction equally between
        tooth interior and gingiva interior.
        """
        if not (0.0 <= frac <= 1.0):
            raise ValueError(f"frac must be in [0,1], got {frac}")
        self.boundary_fraction = frac
        remainder = 1.0 - frac
        self.tooth_fraction   = remainder / 2.0
        self.gingiva_fraction = remainder / 2.0
        logger.info(
            "BoundarySampler fractions updated: boundary=%.2f  tooth=%.2f  gingiva=%.2f",
            self.boundary_fraction, self.tooth_fraction, self.gingiva_fraction,
        )
