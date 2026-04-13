"""
patch_generator.py — Stage 2: Local mesh patch extraction.
===========================================================

Algorithm
---------
1. Accept ``tooth_mask`` — a boolean array (N,) marking tooth points
   (output of Stage 1 coarse segmentation, label == 1).

2. Sample ``n_seeds`` seed points from the tooth region using FPS to
   ensure good spatial coverage across the arch.

3. For each seed, extract all points within a geodesic radius
   (``patch_radius_mm``, default 8–12 mm) using Euclidean distance as a
   geodesic proxy on dental surfaces (typically accurate to ±1 mm).

4. Normalise the patch:
       • Translate centroid to origin.
       • Scale to unit sphere (max radius = 1).
       • Record the inverse transform for re-projection.

5. Return a list of :class:`MeshPatch` objects, each containing:
       • patch_vertices   (P, 3) float32
       • patch_features   (P, C) float32   — normals + geo features
       • patch_indices    (P,)   int32      — indices into original array
       • centroid         (3,)   float32
       • scale            float

Design rationale
----------------
Using Euclidean-distance ball query as an approximation of geodesic
distance is well-supported for dental scans because tooth crowns are
convex surfaces with small geodesic-Euclidean discrepancy.  A 10 mm
Euclidean radius typically captures 1–2 adjacent teeth — the right scope
for the patch segmentation network.

Overlapping patches are intentional: the PatchMerger resolves conflicts
via majority vote with geodesic distance weighting.

Usage
-----
    gen = PatchGenerator(patch_radius_mm=10.0, n_seeds=32)
    patches = gen.generate(points, tooth_mask, features)
    # patches: List[MeshPatch]

Dependencies
------------
    numpy       ≥ 1.24
    scipy       ≥ 1.10   (cKDTree)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import List, Optional

import numpy as np
from scipy.spatial import cKDTree

logger = logging.getLogger(__name__)


# ── Data class ────────────────────────────────────────────────────────────────

@dataclass
class MeshPatch:
    """
    A single local mesh patch extracted for Stage 2 segmentation.

    Attributes:
        patch_vertices:  (P, 3) normalised vertex coordinates
        patch_features:  (P, C) per-point features (normals + geo)
        patch_indices:   (P,)   indices into original N-point array
        centroid:        (3,)   original centroid (before normalisation)
        scale:           float  — original scale (max-radius before normalisation)
        seed_idx:        int    — seed point index in the original array
    """
    patch_vertices: np.ndarray          # (P, 3) float32 — normalised
    patch_features: Optional[np.ndarray]  # (P, C) float32
    patch_indices: np.ndarray           # (P,)   int32
    centroid: np.ndarray                # (3,)   float32
    scale: float
    seed_idx: int

    def __post_init__(self):
        self.patch_vertices = np.asarray(self.patch_vertices, dtype=np.float32)
        self.patch_indices  = np.asarray(self.patch_indices,  dtype=np.int32)
        self.centroid       = np.asarray(self.centroid,       dtype=np.float32)

    def to_original_space(self, pts: np.ndarray) -> np.ndarray:
        """Inverse-transform normalised coordinates back to original space."""
        return pts * self.scale + self.centroid

    @property
    def n_points(self) -> int:
        return len(self.patch_vertices)


# ── Patch Generator ───────────────────────────────────────────────────────────

class PatchGenerator:
    """
    Extract overlapping local patches from the tooth region of a scan.

    Args:
        patch_radius_mm:  geodesic (Euclidean proxy) radius per patch (mm)
        n_seeds:          number of seed points (spreads patches evenly)
        min_patch_points: minimum points for a valid patch (discard smaller)
        max_patch_points: maximum points per patch (random sub-sample if exceeded)
        seed_strategy:    "fps" (farthest-point), "random", or "uniform_grid"
    """

    def __init__(
        self,
        patch_radius_mm: float = 10.0,
        n_seeds: int = 32,
        min_patch_points: int = 64,
        max_patch_points: int = 1024,
        seed_strategy: str = "fps",
    ) -> None:
        self.patch_radius_mm  = float(patch_radius_mm)
        self.n_seeds          = int(n_seeds)
        self.min_patch_points = int(min_patch_points)
        self.max_patch_points = int(max_patch_points)
        self.seed_strategy    = seed_strategy

    # ── Seed selection ────────────────────────────────────────────────────────

    def _select_seeds(
        self,
        tooth_points: np.ndarray,
        tooth_indices: np.ndarray,
    ) -> np.ndarray:
        """Return seed indices (into the original array, not tooth sub-array)."""
        n_tooth = len(tooth_points)
        n_seeds = min(self.n_seeds, n_tooth)

        if self.seed_strategy == "fps":
            # Greedy FPS (O(n·k), fast enough for n ≤ 50 000)
            selected = [np.random.randint(0, n_tooth)]
            dists = np.full(n_tooth, np.inf)

            for _ in range(n_seeds - 1):
                last = tooth_points[selected[-1]]
                d = np.sum((tooth_points - last) ** 2, axis=-1)
                dists = np.minimum(dists, d)
                selected.append(int(dists.argmax()))

            seed_local = np.array(selected, dtype=np.int32)

        elif self.seed_strategy == "uniform_grid":
            # Random, spatially biased by grid cell occupancy
            rng = np.random.default_rng(42)
            seed_local = rng.choice(n_tooth, size=n_seeds, replace=n_tooth < n_seeds)

        else:  # "random"
            seed_local = np.random.choice(
                n_tooth, size=n_seeds, replace=n_tooth < n_seeds
            )

        return tooth_indices[seed_local]  # original-array indices

    # ── Single patch extraction ───────────────────────────────────────────────

    def _extract_patch(
        self,
        all_points: np.ndarray,     # (N, 3)
        seed_idx: int,
        features: Optional[np.ndarray],  # (N, C) or None
        tree: cKDTree,
    ) -> Optional[MeshPatch]:
        """Extract one patch around seed_idx.  Returns None if too small."""
        seed_pt = all_points[seed_idx]
        neighbour_indices = tree.query_ball_point(
            seed_pt, r=self.patch_radius_mm
        )
        neighbour_indices = np.array(neighbour_indices, dtype=np.int32)

        if len(neighbour_indices) < self.min_patch_points:
            return None

        # Sub-sample if too large
        if len(neighbour_indices) > self.max_patch_points:
            chosen = np.random.choice(
                len(neighbour_indices), self.max_patch_points, replace=False
            )
            neighbour_indices = neighbour_indices[chosen]

        patch_verts = all_points[neighbour_indices].copy()   # (P, 3)

        # Normalise
        centroid = patch_verts.mean(axis=0)
        patch_verts -= centroid
        scale = float(np.linalg.norm(patch_verts, axis=-1).max())
        if scale > 1e-6:
            patch_verts /= scale
        else:
            scale = 1.0

        patch_feats = features[neighbour_indices].copy() if features is not None else None

        return MeshPatch(
            patch_vertices=patch_verts,
            patch_features=patch_feats,
            patch_indices=neighbour_indices,
            centroid=centroid,
            scale=scale,
            seed_idx=int(seed_idx),
        )

    # ── Public API ────────────────────────────────────────────────────────────

    def generate(
        self,
        points: np.ndarray,          # (N, 3)
        tooth_mask: np.ndarray,      # (N,) bool — tooth region
        features: Optional[np.ndarray] = None,  # (N, C)
    ) -> List[MeshPatch]:
        """
        Generate local mesh patches.

        Args:
            points:     (N, 3) float32 — full scan point cloud
            tooth_mask: (N,)   bool    — True for tooth region points
            features:   (N, C) float32 — per-point features (optional)

        Returns:
            List[MeshPatch] — extracted patches (may be fewer than n_seeds)
        """
        tooth_indices = np.where(tooth_mask)[0].astype(np.int32)
        n_tooth = len(tooth_indices)

        if n_tooth < self.min_patch_points:
            logger.warning(
                "Only %d tooth points — too few for patch generation (need %d).",
                n_tooth, self.min_patch_points
            )
            return []

        logger.info(
            "PatchGenerator: %d tooth points  n_seeds=%d  radius=%.1f mm",
            n_tooth, self.n_seeds, self.patch_radius_mm
        )

        tooth_points = points[tooth_indices]
        seed_indices = self._select_seeds(tooth_points, tooth_indices)

        # Build global KDTree for ball-query
        tree = cKDTree(points)

        patches: List[MeshPatch] = []
        for sid in seed_indices:
            patch = self._extract_patch(points, int(sid), features, tree)
            if patch is not None:
                patches.append(patch)

        logger.info(
            "PatchGenerator: %d/%d valid patches extracted",
            len(patches), len(seed_indices)
        )
        return patches
