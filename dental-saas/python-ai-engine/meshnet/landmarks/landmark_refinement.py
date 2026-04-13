"""
landmark_refinement.py — Refine detected landmarks using local surface fitting.
================================================================================

After initial detection (geometry peaks or network probability map),
landmark coordinates need sub-voxel accuracy refinement.

Two refinement strategies are implemented:

    1. **Local quadratic surface fitting**
       Fit a quadratic surface z = ax² + bxy + cy² + dx + ey + f
       to the k-NN neighbourhood of a detected peak.
       The true cusp tip is the extremum of this quadratic.
       → Provides sub-vertex-spacing accuracy (important for Bolton measurements).

    2. **Geodesic neighbourhood smoothing**
       Replace the detected coordinate with the weighted centroid of nearby
       high-probability points (where weights come from the network output
       probability at each point).
       → Robust to noise; good for contact points where geometry is ambiguous.

Usage
-----
    refiner = LandmarkRefinement(k=16, use_quadratic=True)

    # From geometry detector output:
    refined = refiner.refine_geometry_peaks(
        raw_landmarks,   # Dict[LandmarkType, (K, 3)]
        all_vertices,    # (N, 3)
    )

    # From network probability map:
    refined = refiner.refine_from_probability_map(
        prob_map,        # (N, n_types) float32
        all_vertices,    # (N, 3)
        threshold=0.5,
    )

Returns:
    Dict[LandmarkType, (K, 3)] — refined coordinates
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy.spatial import cKDTree

from .landmark_head import LandmarkType, N_LANDMARK_TYPES, LandmarkProbabilityMap

logger = logging.getLogger(__name__)


# ── Quadratic surface fitting ─────────────────────────────────────────────────

def _fit_quadratic_extremum(
    pts: np.ndarray,     # (K, 3) — local neighbourhood
    centre: np.ndarray,  # (3,)   — current peak estimate
) -> np.ndarray:
    """
    Fit a quadratic surface to neighbourhood points and return the extremum.

    Steps:
    1. Project neighbourhood onto local tangent plane (PCA axes).
    2. Fit f(u, v) = a*u² + b*u*v + c*v² + d*u + e*v + f via LLS.
    3. Compute analytic extremum (∂f/∂u = 0, ∂f/∂v = 0).
    4. Back-project to 3-D.

    Returns refined 3-D coordinate (falls back to ``centre`` if degenerate).
    """
    K = len(pts)
    if K < 6:
        return centre  # not enough points for quadratic fit

    # ── Local frame via PCA ───────────────────────────────────────────────────
    centred = pts - centre
    cov = np.cov(centred.T)
    try:
        _, vecs = np.linalg.eigh(cov)
    except np.linalg.LinAlgError:
        return centre

    # vecs columns are eigenvectors; last two are the tangent plane axes
    normal = vecs[:, 0]   # smallest eigenvalue → normal
    u_axis = vecs[:, 1]   # tangent axis 1
    v_axis = vecs[:, 2]   # tangent axis 2

    # Project to (u, v) plane
    u = centred @ u_axis  # (K,)
    v = centred @ v_axis  # (K,)
    h = centred @ normal  # (K,) — heights above tangent plane

    # ── Quadratic regress: h = a*u² + b*u*v + c*v² + d*u + e*v + f ─────────
    A = np.stack([u**2, u*v, v**2, u, v, np.ones(K)], axis=1)  # (K, 6)
    try:
        coeffs, _, _, _ = np.linalg.lstsq(A, h, rcond=None)     # (6,)
    except np.linalg.LinAlgError:
        return centre

    a, b, c, d, e, f = coeffs

    # ── Analytic extremum: gradient = 0 ──────────────────────────────────────
    # ∂h/∂u = 2a*u + b*v + d = 0
    # ∂h/∂v = b*u + 2c*v + e = 0
    # → [[2a, b], [b, 2c]] [u*, v*]ᵀ = [-d, -e]
    M = np.array([[2*a, b], [b, 2*c]])
    rhs = np.array([-d, -e])

    det = float(2*a*2*c - b*b)
    if abs(det) < 1e-10:
        return centre  # degenerate (flat surface)

    uv_star = np.linalg.solve(M, rhs)  # (u*, v*)

    # Height at extremum
    h_star = a*uv_star[0]**2 + b*uv_star[0]*uv_star[1] + c*uv_star[1]**2 \
             + d*uv_star[0] + e*uv_star[1] + f

    # Back-project
    refined = centre + uv_star[0]*u_axis + uv_star[1]*v_axis + h_star*normal

    # Sanity check: reject if extremum is more than ``r/2`` away from centre
    if np.linalg.norm(refined - centre) > 0.5 * np.linalg.norm(centred).mean():
        return centre

    return refined.astype(np.float32)


# ── Probability-map weighted centroid ─────────────────────────────────────────

def _weighted_centroid(
    pts: np.ndarray,      # (K, 3)
    weights: np.ndarray,  # (K,)
) -> np.ndarray:
    """Return weight-average centroid."""
    w = np.asarray(weights, np.float64)
    w_sum = w.sum()
    if w_sum < 1e-10:
        return pts.mean(axis=0).astype(np.float32)
    return (pts * w[:, np.newaxis]).sum(axis=0) / w_sum


# ── LandmarkRefinement ────────────────────────────────────────────────────────

class LandmarkRefinement:
    """
    Refine raw landmark detections using local surface fitting
    or probability-weighted centroids.

    Args:
        k:               k-NN neighbourhood for local fitting
        use_quadratic:   if True, apply quadratic surface fitting
                         (more accurate but slower)
        smooth_k:        if > 0, apply geodesic-neighbourhood smoothing pass
    """

    def __init__(
        self,
        k: int = 16,
        use_quadratic: bool = True,
        smooth_k: int = 8,
    ) -> None:
        self.k = k
        self.use_quadratic = use_quadratic
        self.smooth_k = smooth_k

    # ── Geometry-peak refinement ──────────────────────────────────────────────

    def refine_geometry_peaks(
        self,
        landmarks: Dict[LandmarkType, np.ndarray],  # type → (K, 3)
        all_vertices: np.ndarray,                   # (N, 3) — source mesh
    ) -> Dict[LandmarkType, np.ndarray]:
        """
        Refine geometry-detected landmarks by fitting to local surface.

        For each detected landmark, collects k-NN from all_vertices and
        applies quadratic surface fitting to sub-vertex precision.
        """
        tree = cKDTree(all_vertices)
        refined: Dict[LandmarkType, np.ndarray] = {}

        for lt, coords in landmarks.items():
            if len(coords) == 0:
                refined[lt] = coords
                continue

            new_coords = []
            for pt in coords:
                k_q = min(self.k + 1, len(all_vertices))
                _, nb_idx = tree.query(pt, k=k_q)
                nb_pts = all_vertices[nb_idx]

                if self.use_quadratic:
                    r = _fit_quadratic_extremum(nb_pts, pt.copy())
                else:
                    r = nb_pts.mean(axis=0)  # simple centroid

                new_coords.append(r)

            refined[lt] = np.array(new_coords, dtype=np.float32) \
                if new_coords else np.empty((0, 3), np.float32)

        return refined

    # ── Probability-map refinement ────────────────────────────────────────────

    def refine_from_probability_map(
        self,
        prob_map: np.ndarray,          # (N, n_types) float32  — sigmoid output
        all_vertices: np.ndarray,      # (N, 3)
        threshold: float = 0.5,
        cluster_radius: float = 3.0,   # mm — cluster peaks from nearby high-prob pts
    ) -> Dict[LandmarkType, np.ndarray]:
        """
        Extract and refine landmarks from the network probability map.

        Per landmark type:
            1. Threshold prob_map[:, t] > threshold
            2. Cluster high-prob points using a greedy ball-growing strategy
            3. Each cluster → one landmark at the weighted-centroid (weights=prob)
            4. Optionally apply quadratic refinement to each cluster centroid

        Args:
            prob_map:       (N, n_types) probabilities from LandmarkHead sigmoid
            all_vertices:   (N, 3) coordinates for all points
            threshold:      minimum probability to consider as candidate
            cluster_radius: merge candidates within this distance (mm)

        Returns:
            Dict[LandmarkType, (K, 3)]
        """
        tree = cKDTree(all_vertices)
        result: Dict[LandmarkType, np.ndarray] = {}

        for t_idx in range(N_LANDMARK_TYPES):
            lt = LandmarkType(t_idx)
            probs = prob_map[:, t_idx]           # (N,)
            cand_mask = probs > threshold
            cand_idx  = np.where(cand_mask)[0]

            if len(cand_idx) == 0:
                result[lt] = np.empty((0, 3), np.float32)
                continue

            cand_pts   = all_vertices[cand_idx]         # (C, 3)
            cand_probs = probs[cand_idx]                # (C,)

            # Greedy clustering
            assigned = np.zeros(len(cand_idx), dtype=bool)
            clusters: List[np.ndarray] = []   # per cluster: (K, 3)
            weights_list: List[np.ndarray] = []

            for i in np.argsort(-cand_probs):   # highest probability first
                if assigned[i]:
                    continue
                # Collect all unassigned candidates within cluster_radius
                near = tree.query_ball_point(cand_pts[i], r=cluster_radius)
                cluster_local = [j for j in range(len(cand_idx))
                                 if cand_idx[j] in near and not assigned[j]]
                cluster_verts = cand_pts[cluster_local]
                cluster_w     = cand_probs[cluster_local]
                for j in cluster_local:
                    assigned[j] = True

                clusters.append(cluster_verts)
                weights_list.append(cluster_w)

            # Compute cluster centroid (weighted)
            landmarks_for_type: List[np.ndarray] = []
            for ci, (cl_verts, cl_w) in enumerate(zip(clusters, weights_list)):
                centroid = _weighted_centroid(cl_verts, cl_w)

                if self.use_quadratic:
                    k_q = min(self.k + 1, len(all_vertices))
                    _, nb_idx = tree.query(centroid, k=k_q)
                    centroid = _fit_quadratic_extremum(
                        all_vertices[nb_idx], centroid
                    )

                landmarks_for_type.append(centroid)

            result[lt] = np.array(landmarks_for_type, dtype=np.float32) \
                if landmarks_for_type else np.empty((0, 3), np.float32)

        n_total = sum(len(v) for v in result.values())
        logger.info(
            "LandmarkRefinement: %d landmarks refined from probability map",
            n_total
        )
        return result

    # ── Structured output ─────────────────────────────────────────────────────

    def build_probability_map(
        self,
        prob_map: np.ndarray,     # (N, n_types)
        vertices: np.ndarray,     # (N, 3)
        threshold: float = 0.5,
    ) -> LandmarkProbabilityMap:
        """
        Build a :class:`LandmarkProbabilityMap` from a network output.

        Args:
            prob_map:  (N, n_types) sigmoid probabilities
            vertices:  (N, 3) coordinates
            threshold: probability threshold for peak extraction

        Returns:
            :class:`LandmarkProbabilityMap`
        """
        refined = self.refine_from_probability_map(prob_map, vertices, threshold)

        peak_indices: Dict[LandmarkType, np.ndarray] = {}
        for lt, coords in refined.items():
            if len(coords) == 0:
                peak_indices[lt] = np.empty(0, np.int32)
                continue
            # Map back to nearest vertex indices
            tree = cKDTree(vertices)
            _, idx = tree.query(coords)
            peak_indices[lt] = idx.astype(np.int32)

        return LandmarkProbabilityMap(
            probs=prob_map,
            peak_indices=peak_indices,
            peak_coords=refined,
        )
