"""
patch_generator.py — Curriculum-aware geodesic patch extraction.

Extends the existing meshnet.patch_learning.patch_generator with
curriculum-specific features:

    Stage 1 — small radius (8 mm), single tooth, no neighbour context
    Stage 2 — larger radius (12 mm), captures 1–2 adjacent teeth
    Stage 3 — no patching; full arch passed directly to model

New vs Existing
---------------
The original patch_generator.py in meshnet/patch_learning/ handles the
inference-time patch-then-merge workflow.  This module handles TRAINING-time
patch generation, which differs in:
    • Controlled neighbour inclusion (Stage 2 explicitly seeds from boundaries)
    • Label-aware patch selection (picks seeds near tooth–gingiva boundary)
    • Hard patch flagging (patches with > 4 tooth classes → Stage 2 territory)
    • Returns (points, labels, features) tuples instead of MeshPatch objects
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Iterator, List, Optional, Tuple

import numpy as np
from scipy.spatial import cKDTree

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Patch data container
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CurriculumPatch:
    """A single curriculum training patch."""
    points:      np.ndarray   # (P, 3) float32 — normalised coordinates
    labels:      np.ndarray   # (P,)   int64
    features:    Optional[np.ndarray]  # (P, F) or None
    centroid:    np.ndarray   # (3,)   float32 — original centroid
    scale:       float        # original scale factor
    seed_idx:    int
    n_tooth_classes: int      # how many distinct tooth IDs in patch
    is_boundary_patch: bool   # True if patch spans tooth–gingiva boundary
    stage:       int          # stage this patch targets (1 or 2)

    def to_dict(self) -> dict:
        return {
            "n_points": len(self.points),
            "n_tooth_classes": self.n_tooth_classes,
            "is_boundary_patch": self.is_boundary_patch,
            "stage": self.stage,
            "scale": float(self.scale),
        }


# ─────────────────────────────────────────────────────────────────────────────
# Curriculum Patch Generator
# ─────────────────────────────────────────────────────────────────────────────

class CurriculumPatchGenerator:
    """
    Geodesic-proxy patch generator for curriculum training.

    Parameters
    ----------
    stage             : int   — 1=isolated, 2=neighbour, 3=full-arch
    patch_radius_mm   : float — Euclidean patch radius  (Stage 1: ~8, Stage 2: ~12)
    n_seeds           : int   — FPS seed count
    min_patch_points  : int   — discard smaller patches
    max_patch_points  : int   — subsample larger patches
    boundary_seed_fraction : float
        Fraction of seeds explicitly placed near tooth–gingiva boundary
        (ignored for Stage 1).
    """

    def __init__(
        self,
        stage: int = 1,
        patch_radius_mm: float = 10.0,
        n_seeds: int = 32,
        min_patch_points: int = 64,
        max_patch_points: int = 2048,
        boundary_seed_fraction: float = 0.5,
    ) -> None:
        self.stage = stage
        self.patch_radius_mm = float(patch_radius_mm)
        self.n_seeds = int(n_seeds)
        self.min_patch_points = int(min_patch_points)
        self.max_patch_points = int(max_patch_points)
        self.boundary_seed_fraction = boundary_seed_fraction

    # ── Seed selection ────────────────────────────────────────────────────

    def _fps_seeds(
        self,
        points: np.ndarray,
        n: int,
    ) -> np.ndarray:
        """Greedy Farthest-Point Sampling on N points, returns n indices."""
        N = len(points)
        n = min(n, N)
        rng = np.random.default_rng()
        selected = [int(rng.integers(0, N))]
        dists = np.full(N, np.inf)
        for _ in range(n - 1):
            last = points[selected[-1]]
            d = ((points - last) ** 2).sum(axis=-1)
            dists = np.minimum(dists, d)
            selected.append(int(dists.argmax()))
        return np.array(selected, dtype=np.int32)

    def _select_seeds(
        self,
        points: np.ndarray,
        labels:  np.ndarray,
    ) -> np.ndarray:
        """
        Select seeds for patch extraction.

        Stage 1: FPS over tooth points only.
        Stage 2: Mix of boundary-zone seeds (50%) + FPS seeds (50%).
        """
        tooth_idx = np.where(labels > 0)[0]
        if len(tooth_idx) < self.min_patch_points:
            # fallback: seed from all points
            tooth_idx = np.arange(len(points), dtype=np.int32)

        n_fps = self.n_seeds
        fps_local = self._fps_seeds(points[tooth_idx], n_fps)
        fps_seeds = tooth_idx[fps_local]

        if self.stage == 1:
            return fps_seeds

        # Stage 2: also seed near boundary
        n_boundary_seeds = int(self.n_seeds * self.boundary_seed_fraction)
        n_fps_seeds = self.n_seeds - n_boundary_seeds

        # Detect boundary points (label differs from ≥1 neighbour)
        tree = cKDTree(points)
        k_q = min(8, len(points))
        _, nn_idx = tree.query(points, k=k_q)
        nn_labels = labels[nn_idx[:, 1:]]
        is_boundary = (nn_labels != labels[:, np.newaxis]).any(axis=1)
        boundary_idx = np.where(is_boundary)[0]

        if len(boundary_idx) > 0:
            rng = np.random.default_rng()
            b_seeds = boundary_idx[rng.choice(
                len(boundary_idx), n_boundary_seeds,
                replace=len(boundary_idx) < n_boundary_seeds
            )]
        else:
            b_seeds = fps_seeds[:n_boundary_seeds]

        fps_seeds_sub = fps_seeds[self._fps_seeds(points[fps_seeds], n_fps_seeds)]
        return np.concatenate([fps_seeds_sub, b_seeds])

    # ── Patch extraction ──────────────────────────────────────────────────

    def _extract_one(
        self,
        points: np.ndarray,
        labels:  np.ndarray,
        features: Optional[np.ndarray],
        seed_idx: int,
        tree: cKDTree,
    ) -> Optional[CurriculumPatch]:
        seed_pt = points[seed_idx]
        nn = tree.query_ball_point(seed_pt, r=self.patch_radius_mm)
        nn = np.array(nn, dtype=np.int32)
        if len(nn) < self.min_patch_points:
            return None
        if len(nn) > self.max_patch_points:
            rng = np.random.default_rng()
            nn = nn[rng.choice(len(nn), self.max_patch_points, replace=False)]

        patch_pts = points[nn].copy().astype(np.float32)
        centroid  = patch_pts.mean(axis=0)
        patch_pts -= centroid
        scale = float(np.linalg.norm(patch_pts, axis=-1).max())
        if scale > 1e-6:
            patch_pts /= scale
        else:
            scale = 1.0

        patch_lbl  = labels[nn].copy().astype(np.int64)
        patch_feat = features[nn].copy() if features is not None else None

        tooth_classes = int(np.unique(patch_lbl[patch_lbl > 0]).size)
        has_gingiva   = bool((patch_lbl == 0).any())
        is_boundary_patch = has_gingiva and tooth_classes > 0

        return CurriculumPatch(
            points=patch_pts,
            labels=patch_lbl,
            features=patch_feat,
            centroid=centroid,
            scale=scale,
            seed_idx=int(seed_idx),
            n_tooth_classes=tooth_classes,
            is_boundary_patch=is_boundary_patch,
            stage=self.stage,
        )

    # ── Public API ────────────────────────────────────────────────────────

    def generate(
        self,
        points: np.ndarray,          # (N, 3)
        labels:  np.ndarray,         # (N,)
        features: Optional[np.ndarray] = None,
    ) -> List[CurriculumPatch]:
        """
        Extract curriculum patches from a scan.

        For Stage 3, returns a single patch covering the full scan.
        """
        if self.stage == 3:
            # Full arch — no patching
            centroid = points.mean(axis=0)
            pts = (points - centroid).astype(np.float32)
            scale = float(np.linalg.norm(pts, axis=-1).max()) or 1.0
            pts /= scale
            n_tc = int(np.unique(labels[labels > 0]).size)
            return [CurriculumPatch(
                points=pts,
                labels=labels.astype(np.int64),
                features=features,
                centroid=centroid.astype(np.float32),
                scale=scale,
                seed_idx=0,
                n_tooth_classes=n_tc,
                is_boundary_patch=True,
                stage=3,
            )]

        seed_idx = self._select_seeds(points, labels)
        tree = cKDTree(points)
        patches: List[CurriculumPatch] = []
        for sid in seed_idx:
            p = self._extract_one(points, labels, features, int(sid), tree)
            if p is not None:
                patches.append(p)

        logger.info(
            "CurriculumPatchGenerator stage=%d: %d/%d valid patches",
            self.stage, len(patches), len(seed_idx),
        )
        return patches

    def iter_batches(
        self,
        points: np.ndarray,
        labels:  np.ndarray,
        batch_size: int = 8,
        features: Optional[np.ndarray] = None,
    ) -> Iterator[List[CurriculumPatch]]:
        """Yield batches of curriculum patches."""
        patches = self.generate(points, labels, features)
        for i in range(0, len(patches), batch_size):
            yield patches[i : i + batch_size]
