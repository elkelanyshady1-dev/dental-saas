"""
cusp_detection.py — Geometry-based cusp and landmark peak finder.
=================================================================

This module detects local surface maxima (peaks) on individual tooth
meshes using curvature + normal orientation analysis.

Algorithm
---------
For a given tooth's vertices:

    1. Compute PCA curvature (smallest eigenvalue ratio) for each vertex.

    2. Identify local maxima: a vertex is a peak if its curvature is
       greater than ALL k-NN neighbours AND greater than ``min_curvature``.

    3. Filter by normal orientation:
           • Cusp tips: normal points AWAY from occlusal plane (upward for max)
           • Grooves: normal points toward occlusal plane (downward)
           • Contact points: normal is roughly horizontal (lateral orientation)

    4. Suppress near-duplicate peaks via Non-Maximum Suppression (NMS)
       using Euclidean distance: if two peaks are within ``nms_radius`` mm,
       keep the higher-curvature one.

    5. Classify remaining peaks into LandmarkType categories.

Usage
-----
    detector = CuspDetector(k=20, nms_radius=2.0)
    landmarks = detect_cusps(vertices, normals, occlusal_normal=np.array([0,0,1]))
    # landmarks: Dict[LandmarkType, np.ndarray]  — {type: (K, 3) point coords}

Dependencies
------------
    numpy   ≥ 1.24
    scipy   ≥ 1.10  (cKDTree)
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy.spatial import cKDTree

from .landmark_head import LandmarkType, LandmarkProbabilityMap

logger = logging.getLogger(__name__)


# ── Curvature helpers (same algorithm as gingiva_detection) ──────────────────

def _compute_pca_curvature(
    vertices: np.ndarray,  # (V, 3)
    k: int = 20,
    eps: float = 1e-8,
) -> np.ndarray:
    """
    PCA curvature: κ = λ_min / (λ0 + λ1 + λ2 + ε).
    Returns (V,) float32.
    """
    from scipy.spatial import cKDTree
    V = len(vertices)
    k_q = min(k + 1, V)
    tree = cKDTree(vertices)
    curvature = np.zeros(V, dtype=np.float32)

    batch = 2048
    for start in range(0, V, batch):
        end = min(start + batch, V)
        _, idx = tree.query(vertices[start:end], k=k_q)
        nb = vertices[idx]                              # (B, k, 3)
        c = nb.mean(axis=1, keepdims=True)             # (B, 1, 3)
        d = nb - c                                      # (B, k, 3)
        cov = np.einsum("bni,bnj->bij", d, d) / k_q   # (B, 3, 3)
        eig = np.linalg.eigvalsh(cov)                  # (B, 3)
        curvature[start:end] = (eig[:, 0] / (eig.sum(axis=1) + eps)).astype(np.float32)

    return curvature


def _estimate_vertex_normals(
    vertices: np.ndarray,
    k: int = 16,
) -> np.ndarray:
    """PCA-based normal estimation. Returns (V, 3) float32."""
    V = len(vertices)
    k_q = min(k + 1, V)
    tree = cKDTree(vertices)
    _, idx = tree.query(vertices, k=k_q)
    nb = vertices[idx[:, 1:]]                           # (V, k, 3)
    c  = nb.mean(axis=1, keepdims=True)
    d  = nb - c
    cov = np.einsum("vni,vnj->vij", d, d) / k
    _, vecs = np.linalg.eigh(cov)                      # (V, 3, 3)
    return vecs[:, :, 0].astype(np.float32)            # smallest eigenvec = normal


# ── Local maximum detection ───────────────────────────────────────────────────

def _find_local_maxima(
    curvature: np.ndarray,       # (V,)
    vertices: np.ndarray,        # (V, 3)
    k: int = 16,
    min_curvature: float = 0.05,
) -> np.ndarray:
    """
    Return indices of vertices that are local curvature maxima.

    A vertex i is a local max if curvature[i] > curvature[j] for all
    j in k-NN of i, and curvature[i] > min_curvature.
    """
    V = len(vertices)
    k_q = min(k + 1, V)
    tree = cKDTree(vertices)
    _, idx = tree.query(vertices, k=k_q)     # (V, k_q)

    is_max = np.ones(V, dtype=bool)
    for vi in range(V):
        if curvature[vi] < min_curvature:
            is_max[vi] = False
            continue
        nb_curv = curvature[idx[vi, 1:]]    # exclude self
        if not (curvature[vi] > nb_curv).all():
            is_max[vi] = False

    return np.where(is_max)[0]


# ── Non-Maximum Suppression ───────────────────────────────────────────────────

def _nms(
    peak_idx: np.ndarray,        # selected vertex indices
    vertices: np.ndarray,       # (V, 3)
    curvature: np.ndarray,      # (V,)
    nms_radius: float = 2.0,
) -> np.ndarray:
    """
    Suppress near-duplicate peaks: if two peaks are closer than
    ``nms_radius`` mm, keep the one with higher curvature.

    Returns filtered peak indices.
    """
    if len(peak_idx) == 0:
        return peak_idx

    peak_pts = vertices[peak_idx]
    peak_curv = curvature[peak_idx]

    # Sort by curvature descending
    order = np.argsort(-peak_curv)
    suppressed = np.zeros(len(peak_idx), dtype=bool)
    kept = []

    for i in order:
        if suppressed[i]:
            continue
        kept.append(peak_idx[i])
        # Suppress all peaks within nms_radius
        dists = np.linalg.norm(peak_pts - peak_pts[i], axis=-1)
        close = (dists < nms_radius) & (~suppressed)
        close[i] = False
        suppressed |= close

    return np.array(kept, dtype=np.int32)


# ── Landmark classification by normal orientation ─────────────────────────────

def _classify_peaks(
    peak_idx: np.ndarray,         # vertex indices
    vertices: np.ndarray,         # (V, 3)
    normals: np.ndarray,          # (V, 3)
    curvature: np.ndarray,        # (V,)
    occlusal_normal: np.ndarray,  # (3,) — "up" direction
) -> Dict[LandmarkType, np.ndarray]:
    """
    Classify each peak into a LandmarkType by its normal orientation
    relative to the occlusal plane normal.

    Classification rules:
        • |dot(vertex_normal, occlusal_normal)| > 0.7  → cusp tip or incisal edge
            - curvature > median_cusp_curv → CUSP_TIP
            - curvature ≤ median          → INCISAL_EDGE
        • dot(vertex_normal, occlusal_normal) < -0.5   → groove (concave, inverted)
            → CENTRAL_GROOVE
        • |dot(vertex_normal, lateral_normal)| > 0.6   → contact point
            - z > z_mid → MESIAL_CONTACT else DISTAL_CONTACT
        • default → CUSP_TIP (minor peaks)

    Returns:
        Dict {LandmarkType: (K, 3) vertex coordinates}
    """
    result: Dict[LandmarkType, List[np.ndarray]] = {lt: [] for lt in LandmarkType}

    if len(peak_idx) == 0:
        return {lt: np.empty((0, 3), np.float32) for lt in LandmarkType}

    occ = occlusal_normal / (np.linalg.norm(occlusal_normal) + 1e-8)

    pk_verts  = vertices[peak_idx]
    pk_norms  = normals[peak_idx]
    pk_curv   = curvature[peak_idx]

    med_curv = float(np.median(pk_curv)) if len(pk_curv) > 0 else 0.1

    # Lateral axis (perpendicular to occlusal)
    lat = np.array([1.0, 0.0, 0.0])

    for i, vi in enumerate(peak_idx):
        n       = pk_norms[i] / (np.linalg.norm(pk_norms[i]) + 1e-8)
        dot_occ = float(np.dot(n, occ))
        dot_lat = float(abs(np.dot(n, lat)))

        if abs(dot_occ) > 0.7:
            if pk_curv[i] > med_curv:
                result[LandmarkType.CUSP_TIP].append(pk_verts[i])
            else:
                result[LandmarkType.INCISAL_EDGE].append(pk_verts[i])
        elif dot_occ < -0.5:
            result[LandmarkType.CENTRAL_GROOVE].append(pk_verts[i])
        elif dot_lat > 0.6:
            # Use lateral position for mesial vs distal
            if pk_verts[i][0] > 0:
                result[LandmarkType.MESIAL_CONTACT].append(pk_verts[i])
            else:
                result[LandmarkType.DISTAL_CONTACT].append(pk_verts[i])
        else:
            result[LandmarkType.CUSP_TIP].append(pk_verts[i])

    return {lt: np.array(pts, np.float32) if pts else np.empty((0, 3), np.float32)
            for lt, pts in result.items()}


# ── CuspDetector ─────────────────────────────────────────────────────────────

class CuspDetector:
    """
    Geometry-driven landmark detector for tooth meshes.

    Args:
        k:               KNN for curvature and normal estimation
        nms_radius:      NMS suppression radius (mm)
        min_curvature:   minimum curvature threshold for local max
        occlusal_normal: default occlusal direction (Z-axis)
    """

    def __init__(
        self,
        k: int = 20,
        nms_radius: float = 2.0,
        min_curvature: float = 0.05,
        occlusal_normal: Optional[np.ndarray] = None,
    ) -> None:
        self.k = k
        self.nms_radius = nms_radius
        self.min_curvature = min_curvature
        self.occlusal_normal = (
            np.asarray(occlusal_normal, dtype=np.float32)
            if occlusal_normal is not None
            else np.array([0.0, 0.0, 1.0], dtype=np.float32)
        )

    def detect(
        self,
        vertices: np.ndarray,              # (V, 3)
        normals: Optional[np.ndarray] = None,  # (V, 3) — estimated if None
    ) -> Dict[LandmarkType, np.ndarray]:
        """
        Detect landmarks on a single tooth mesh.

        Args:
            vertices: (V, 3) — tooth vertex positions (already extracted)
            normals:  (V, 3) — optional pre-computed vertex normals

        Returns:
            {LandmarkType: (K, 3) point coordinates}
        """
        if len(vertices) < 10:
            return {lt: np.empty((0, 3), np.float32) for lt in LandmarkType}

        if normals is None:
            normals = _estimate_vertex_normals(vertices, k=self.k)

        curvature = _compute_pca_curvature(vertices, k=self.k)

        peak_idx = _find_local_maxima(
            curvature, vertices, k=self.k, min_curvature=self.min_curvature
        )

        peak_idx = _nms(peak_idx, vertices, curvature, self.nms_radius)

        classified = _classify_peaks(
            peak_idx, vertices, normals, curvature, self.occlusal_normal
        )

        total = sum(len(v) for v in classified.values())
        logger.info(
            "CuspDetector: V=%d  peaks=%d  classified=%d",
            len(vertices), len(peak_idx), total
        )
        return classified


# ── Module-level convenience function ────────────────────────────────────────

def detect_cusps(
    vertices: np.ndarray,
    normals: Optional[np.ndarray] = None,
    occlusal_normal: Optional[np.ndarray] = None,
    k: int = 20,
    nms_radius: float = 2.0,
    min_curvature: float = 0.05,
) -> Dict[LandmarkType, np.ndarray]:
    """
    Convenience wrapper for :class:`CuspDetector`.

    Returns:
        {LandmarkType: (K, 3) coordinates}
    """
    detector = CuspDetector(
        k=k, nms_radius=nms_radius,
        min_curvature=min_curvature,
        occlusal_normal=occlusal_normal,
    )
    return detector.detect(vertices, normals)
