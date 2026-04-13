"""
balanced_sampler.py — Class-balanced batch sampler for dental segmentation.

Problem
-------
Dental scans contain vastly more gingiva points than individual tooth points.
Standard random sampling creates batches heavily biased toward gingiva,
causing the model to predict "gingiva" for ambiguous boundary regions.

Solution
--------
BalancedSampler builds batches by:
    1. Drawing 50% of points from tooth faces (label > 0)
    2. Drawing 50% from gingiva faces (label == 0)
    3. Shuffling the combined sample

This is applied at the point level within each scan, not at the scan level.
Scan-level selection is handled by PrioritySampler.

Usage
-----
    from meshnet.training_pipeline.sampling import BalancedSampler

    sampler = BalancedSampler(tooth_ratio=0.5, n_points=4096, seed=42)
    pts_b, labels_b = sampler.sample(points, labels)   # balanced (4096, 3) + (4096,)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class BalancedSampler:
    """
    Class-balanced point sampler.

    For each scan, draws equal counts of tooth and gingiva points so the
    model sees a 50/50 class split regardless of the raw scan distribution.

    Parameters
    ----------
    tooth_ratio  : float   — fraction of output points from tooth class  (default 0.5)
    n_points     : int     — total output points  (default 4096)
    replace      : bool    — allow replacement sampling  (default True)
    seed         : int     — random seed  (None = non-deterministic)
    """
    tooth_ratio: float = 0.5
    n_points: int = 4096
    replace: bool = True
    seed: Optional[int] = None

    def __post_init__(self) -> None:
        if not (0.0 < self.tooth_ratio < 1.0):
            raise ValueError(f"tooth_ratio must be in (0,1), got {self.tooth_ratio}")
        self._rng = np.random.default_rng(self.seed)

    # ── Core sampling ─────────────────────────────────────────────────────

    def sample(
        self,
        points: np.ndarray,         # (N, 3) or (N, C)
        labels: np.ndarray,         # (N,) int  — 0=gingiva ≥1=tooth
        features: Optional[np.ndarray] = None,  # (N, F) optional
    ) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]:
        """
        Return a balanced sample.

        Parameters
        ----------
        points   : (N, 3)  float32
        labels   : (N,)    int64   — 0=gingiva, ≥1=tooth class
        features : (N, F)  float32 optional

        Returns
        -------
        sampled_pts    : (n_points, 3)
        sampled_labels : (n_points,)
        sampled_feats  : (n_points, F) or None
        """
        N = len(points)
        n_tooth_target = int(self.n_points * self.tooth_ratio)
        n_ging_target  = self.n_points - n_tooth_target

        tooth_idx = np.where(labels > 0)[0]
        ging_idx  = np.where(labels == 0)[0]

        # Graceful fallback: if one class is absent, fill entirely from the other
        if len(tooth_idx) == 0:
            logger.warning("No tooth points in scan — sampling all from gingiva.")
            chosen = self._rng.choice(len(ging_idx), self.n_points,
                                      replace=self.replace or len(ging_idx) < self.n_points)
            chosen_idx = ging_idx[chosen]
        elif len(ging_idx) == 0:
            logger.warning("No gingiva points in scan — sampling all from teeth.")
            chosen = self._rng.choice(len(tooth_idx), self.n_points,
                                      replace=self.replace or len(tooth_idx) < self.n_points)
            chosen_idx = tooth_idx[chosen]
        else:
            tc = self._rng.choice(len(tooth_idx), n_tooth_target,
                                  replace=self.replace or len(tooth_idx) < n_tooth_target)
            gc = self._rng.choice(len(ging_idx), n_ging_target,
                                  replace=self.replace or len(ging_idx) < n_ging_target)
            chosen_idx = np.concatenate([tooth_idx[tc], ging_idx[gc]])

        # Shuffle
        perm = self._rng.permutation(len(chosen_idx))
        chosen_idx = chosen_idx[perm]

        sampled_pts    = points[chosen_idx].astype(np.float32)
        sampled_labels = labels[chosen_idx].astype(np.int64)
        sampled_feats  = features[chosen_idx] if features is not None else None

        logger.debug(
            "BalancedSampler: tooth=%d  gingiva=%d  total=%d",
            int((sampled_labels > 0).sum()),
            int((sampled_labels == 0).sum()),
            len(sampled_labels),
        )
        return sampled_pts, sampled_labels, sampled_feats

    # ── Batch wrapper ─────────────────────────────────────────────────────

    def sample_batch(
        self,
        points_batch: np.ndarray,    # (B, N, 3)
        labels_batch: np.ndarray,    # (B, N)
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Apply balanced sampling across a batch."""
        B = points_batch.shape[0]
        out_pts = np.zeros((B, self.n_points, 3), dtype=np.float32)
        out_lbl = np.zeros((B, self.n_points),    dtype=np.int64)
        for b in range(B):
            p, l, _ = self.sample(points_batch[b], labels_batch[b])
            out_pts[b] = p
            out_lbl[b] = l
        return out_pts, out_lbl
