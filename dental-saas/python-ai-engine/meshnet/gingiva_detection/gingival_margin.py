"""
gingival_margin.py — Gingival margin candidate detection and refinement.

Overview
--------
This module combines curvature and valley signals to identify the continuous
curve of vertices that marks the gingival margin — the anatomical boundary
between the tooth crown and gingival tissue.

Pipeline
--------
    curvature (V,)      │  computed by curvature_analysis.py
    valley_score (V,)   ┘

    Step 1 — Threshold curvature   → high_curv_mask  (V,) bool
    Step 2 — Threshold valley      → high_valley_mask (V,) bool
    Step 3 — Intersection          → candidate_mask   (V,) bool
    Step 4 — Region growing        → connected components
    Step 5 — Filter: keep components with enough vertices
    Step 6 — Optional Laplacian smoothing of mask

Output
------
    gingival_margin_vertices : list[int]
        Indices of vertices identified as being on the gingival margin.

Anatomy note
------------
On a typical dental scan, the gingival margin forms a closed or near-closed
ring around each tooth.  In crowded dentitions, rings may merge
interproximally — this is clinically expected and does not indicate a bug.

Dependencies
------------
    numpy   ≥ 1.24
    scipy   ≥ 1.10  (cKDTree for region growing, ndimage for connected labelling)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from scipy.spatial import cKDTree

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class MarginDetectionConfig:
    """
    Tunable parameters for gingival margin detection.

    These defaults are calibrated for dental scans in millimetre units
    with ~30 000–80 000 vertices.  Adjust ``curvature_percentile`` and
    ``valley_percentile`` if the margin is under- or over-detected.
    """
    curvature_percentile: float = 70.0
    """Threshold curvature at this percentile (top 30 % → candidate)."""

    valley_percentile: float = 75.0
    """Threshold valley score at this percentile (top 25 % → candidate)."""

    require_both: bool = True
    """If True, vertex must exceed BOTH thresholds.
       If False, exceeding either threshold suffices (more recall, less precision)."""

    region_grow_radius: float = 0.8
    """Radius (mm) for region growing from margin seeds to fill gaps."""

    min_component_size: int = 10
    """Discard connected components smaller than this vertex count."""

    laplacian_smooth_iters: int = 2
    """Number of Laplacian smoothing iterations on the binary margin mask.
       0 = no smoothing."""

    k_region_grow: int = 10
    """KNN neighbours used for region growing."""


# ─────────────────────────────────────────────────────────────────────────────
# Helper: connected components via union-find on KNN graph
# ─────────────────────────────────────────────────────────────────────────────

class _UnionFind:
    def __init__(self, n: int):
        self.parent = list(range(n))
        self.rank = [0] * n

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, x: int, y: int) -> None:
        rx, ry = self.find(x), self.find(y)
        if rx == ry:
            return
        if self.rank[rx] < self.rank[ry]:
            rx, ry = ry, rx
        self.parent[ry] = rx
        if self.rank[rx] == self.rank[ry]:
            self.rank[rx] += 1


def _connected_components_knn(
    points: np.ndarray,
    mask: np.ndarray,
    k: int = 6,
    radius: float = 2.0,
) -> np.ndarray:
    """
    Label connected components of masked vertices using KNN connectivity.

    Points within ``radius`` and both in ``mask`` are merged into the
    same component.

    Parameters
    ----------
    points : (V, 3)  — vertex positions
    mask   : (V,)    — boolean mask of candidate vertices
    k      : int     — KNN query size
    radius : float   — maximum edge length for connectivity

    Returns
    -------
    component_ids : (V,) int  — -1 for non-masked vertices;
                                ≥0 for component index
    """
    active_idx = np.where(mask)[0]
    N = len(active_idx)

    if N == 0:
        return np.full(len(points), -1, dtype=np.int64)

    active_pts = points[active_idx]
    uf = _UnionFind(N)

    tree = cKDTree(active_pts)
    k_q = min(k + 1, N)
    _, nn_indices = tree.query(active_pts, k=k_q)

    for i in range(N):
        pi = active_pts[i]
        for j_local in nn_indices[i][1:]:    # skip self
            pj = active_pts[j_local]
            if np.linalg.norm(pi - pj) <= radius:
                uf.union(i, j_local)

    # Build component_id array
    component_ids = np.full(len(points), -1, dtype=np.int64)
    root_to_comp: dict[int, int] = {}
    comp_counter = 0
    for local_i, global_i in enumerate(active_idx):
        root = uf.find(local_i)
        if root not in root_to_comp:
            root_to_comp[root] = comp_counter
            comp_counter += 1
        component_ids[global_i] = root_to_comp[root]

    return component_ids


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def detect_gingival_margin_vertices(
    vertices: np.ndarray,
    curvature: np.ndarray,
    valley_score: np.ndarray,
    config: Optional[MarginDetectionConfig] = None,
) -> tuple[list[int], dict]:
    """
    Identify vertices on the gingival margin from curvature + valley signals.

    Parameters
    ----------
    vertices     : np.ndarray, shape (V, 3)
        Mesh vertex positions.
    curvature    : np.ndarray, shape (V,)
        Per-vertex curvature (from curvature_analysis.compute_vertex_curvature).
    valley_score : np.ndarray, shape (V,)
        Per-vertex valley score (from valley_detection.compute_valley_score).
    config       : MarginDetectionConfig, optional
        Detection parameters.  Defaults used if None.

    Returns
    -------
    margin_vertices : list[int]
        Sorted list of vertex indices on the detected gingival margin.
    stats : dict
        Diagnostic statistics:
            curvature_threshold, valley_threshold,
            candidates_before_grow, candidates_after_grow,
            n_components, component_sizes
    """
    if config is None:
        config = MarginDetectionConfig()

    vertices = np.asarray(vertices, dtype=np.float64)
    curvature = np.asarray(curvature, dtype=np.float32)
    valley_score = np.asarray(valley_score, dtype=np.float32)

    V = len(vertices)
    logger.info(
        "detect_gingival_margin_vertices: V=%d  "
        "curv_pct=%.0f  valley_pct=%.0f",
        V, config.curvature_percentile, config.valley_percentile,
    )

    # ── Step 1: Threshold curvature ────────────────────────────────────────
    curv_thresh = float(np.percentile(curvature, config.curvature_percentile))
    high_curv = curvature >= curv_thresh

    # ── Step 2: Threshold valley score ────────────────────────────────────
    valley_thresh = float(np.percentile(valley_score, config.valley_percentile))
    high_valley = valley_score >= valley_thresh

    # ── Step 3: Combine criteria ──────────────────────────────────────────
    if config.require_both:
        candidate_mask = high_curv & high_valley
    else:
        candidate_mask = high_curv | high_valley

    n_candidates_initial = int(candidate_mask.sum())
    logger.debug(
        "Initial candidates: %d / %d  (curv_thresh=%.4f  valley_thresh=%.4f)",
        n_candidates_initial, V, curv_thresh, valley_thresh,
    )

    # ── Step 4: Region growing to fill gaps in the candidate ring ─────────
    if n_candidates_initial > 0 and config.region_grow_radius > 0:
        seed_pts = vertices[candidate_mask]
        tree = cKDTree(seed_pts)
        # Mark all vertices within radius of a seed as candidate
        all_pts = vertices
        k_q = min(config.k_region_grow, len(seed_pts))
        dists, _ = tree.query(all_pts, k=k_q)
        min_dists = dists.min(axis=1) if dists.ndim == 2 else dists
        grown_mask = min_dists <= config.region_grow_radius
        candidate_mask = candidate_mask | grown_mask

    n_candidates_grown = int(candidate_mask.sum())
    logger.debug("After region growing: %d candidates", n_candidates_grown)

    # ── Step 5: Optional Laplacian smoothing ─────────────────────────────
    if config.laplacian_smooth_iters > 0 and n_candidates_grown > 0:
        candidate_mask = laplacian_smooth_mask(
            vertices, candidate_mask, iters=config.laplacian_smooth_iters
        )

    # ── Step 6: Connected components + size filter ────────────────────────
    comp_ids = _connected_components_knn(
        vertices,
        candidate_mask,
        k=config.k_region_grow,
        radius=config.region_grow_radius * 1.5,
    )

    # Count component sizes
    valid_comp_ids = comp_ids[comp_ids >= 0]
    if len(valid_comp_ids) == 0:
        logger.warning("No margin candidates survived after filtering.")
        return [], {
            "curvature_threshold": curv_thresh,
            "valley_threshold": valley_thresh,
            "candidates_before_grow": n_candidates_initial,
            "candidates_after_grow": 0,
            "n_components": 0,
            "component_sizes": [],
        }

    unique_comps, comp_counts = np.unique(valid_comp_ids, return_counts=True)
    comp_size_map = dict(zip(unique_comps.tolist(), comp_counts.tolist()))

    # Keep only components >= min_component_size
    final_mask = np.zeros(V, dtype=bool)
    for comp_id, size in comp_size_map.items():
        if size >= config.min_component_size:
            final_mask[comp_ids == comp_id] = True

    margin_vertices = sorted(np.where(final_mask)[0].tolist())

    stats = {
        "curvature_threshold": round(float(curv_thresh), 5),
        "valley_threshold": round(float(valley_thresh), 5),
        "candidates_before_grow": n_candidates_initial,
        "candidates_after_grow": n_candidates_grown,
        "n_components": len(unique_comps),
        "component_sizes": sorted(comp_counts.tolist(), reverse=True),
        "margin_vertex_count": len(margin_vertices),
    }

    logger.info(
        "Margin detected: %d vertices  (%d components, min_size=%d)",
        len(margin_vertices), stats["n_components"], config.min_component_size,
    )
    return margin_vertices, stats


def laplacian_smooth_mask(
    vertices: np.ndarray,
    mask: np.ndarray,
    iters: int = 2,
    k: int = 8,
    threshold: float = 0.4,
) -> np.ndarray:
    """
    Laplacian smoothing of a binary vertex mask.

    Treats the mask as a scalar field and diffuses it over the KNN graph,
    converting a noisy binary mask into a smoother one.  After each iteration,
    re-threshold at ``threshold``.

    This removes spurious isolated margin candidates and fills small gaps
    in the margin ring.

    Parameters
    ----------
    vertices  : (V, 3)   vertex positions
    mask      : (V,)     bool — initial binary mask
    iters     : int      smoothing iterations
    k         : int      KNN neighbourhood for diffusion
    threshold : float    re-binarisation threshold after each iteration

    Returns
    -------
    smoothed_mask : (V,) bool
    """
    vertices = np.asarray(vertices, dtype=np.float64)
    field = np.asarray(mask, dtype=np.float64)

    V = len(vertices)
    k_q = min(k + 1, V)
    tree = cKDTree(vertices)
    _, nn_idx = tree.query(vertices, k=k_q)   # (V, k_q)

    for _ in range(iters):
        # Average field over local neighbourhood (including self)
        neighbour_vals = field[nn_idx]          # (V, k_q)
        field = neighbour_vals.mean(axis=1)     # (V,)
        # Re-binarise
        field = (field >= threshold).astype(np.float64)

    return field.astype(bool)
