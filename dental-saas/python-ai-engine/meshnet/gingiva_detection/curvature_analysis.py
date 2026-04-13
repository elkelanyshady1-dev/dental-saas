"""
curvature_analysis.py — Per-vertex surface curvature for dental meshes.

Algorithm
---------
For each vertex v:
    1. Collect k-nearest neighbours in 3-D vertex space.
    2. Build the 3×3 covariance matrix of the local vertex set.
    3. Compute eigenvalues λ₀ ≤ λ₁ ≤ λ₂ via symmetric eigensolver.
    4. Curvature κ(v) = λ₀ / (λ₀ + λ₁ + λ₂ + ε)

Interpretation
--------------
    κ ≈ 0.0   →  flat surface (planar region)
    κ ≈ 0.1   →  slight curvature (tooth crown)
    κ > 0.25  →  high curvature: ridges, cusps, gingival valleys, CEJ

Why this matters for gingival margin detection
----------------------------------------------
The gingival margin is geometrically characterised by a sharp transition
from the (relatively flat) gingival tissue to the (curved) tooth crown.
This transition produces a local ring of high PCA curvature that can be
detected and used as a spatial prior for margin localisation.

Performance
-----------
Batched KDTree + vectorised eigvalsh keeps runtime to ~1–3 s for
V=50 000 vertices on a modern CPU (no GPU needed).

Dependencies
------------
    numpy        ≥ 1.24
    scipy        ≥ 1.10  (cKDTree, sparse)
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
from scipy.spatial import cKDTree

logger = logging.getLogger(__name__)


def compute_vertex_curvature(
    vertices: np.ndarray,
    faces: Optional[np.ndarray] = None,  # kept for API symmetry; unused here
    k: int = 20,
    batch_size: int = 2048,
    eps: float = 1e-8,
) -> np.ndarray:
    """
    Compute PCA-based surface curvature for every mesh vertex.

    Parameters
    ----------
    vertices   : np.ndarray, shape (V, 3)
        Mesh vertex positions.
    faces      : np.ndarray, shape (F, 3), optional
        Unused — provided for API symmetry with valley_detection.
        Future extensions may use face topology for geodesic neighbourhoods.
    k          : int
        KNN neighbourhood size (default 20).  Larger values → smoother
        curvature field, less sensitivity to small-scale features.
    batch_size : int
        Vertices processed per batch (controls peak RAM usage).
    eps        : float
        Numerical stability addend in the curvature denominator.

    Returns
    -------
    curvature : np.ndarray, shape (V,), dtype float32
        Per-vertex curvature in [0, ~0.5].

    Raises
    ------
    ValueError
        If ``vertices`` is not shape (V, 3).
    """
    vertices = np.asarray(vertices, dtype=np.float64)
    if vertices.ndim != 2 or vertices.shape[1] != 3:
        raise ValueError(f"vertices must be (V, 3), got {vertices.shape}")

    V = len(vertices)
    k_query = min(k + 1, V)   # +1: point queries itself

    logger.debug(
        "compute_vertex_curvature: V=%d  k=%d  batch_size=%d", V, k, batch_size
    )

    tree = cKDTree(vertices)
    curvature = np.zeros(V, dtype=np.float32)

    for start in range(0, V, batch_size):
        end = min(start + batch_size, V)
        batch_verts = vertices[start:end]

        # KNN query — indices shape (B, k_query)
        _, indices = tree.query(batch_verts, k=k_query)

        # Neighbourhood coords: (B, k_query, 3)
        neighbours = vertices[indices]

        # Centre each local neighbourhood
        centroid = neighbours.mean(axis=1, keepdims=True)   # (B, 1, 3)
        centred = neighbours - centroid                      # (B, k_query, 3)

        # Covariance matrix: (B, 3, 3)
        cov = np.einsum("bni,bnj->bij", centred, centred) / k_query

        # Symmetric eigenvalues sorted ascending: (B, 3)
        eigvals = np.linalg.eigvalsh(cov)

        # Curvature = smallest eigenvalue / sum  ∈ [0, 1/3]
        λ_min = eigvals[:, 0]
        λ_sum = eigvals.sum(axis=1)
        curvature[start:end] = (λ_min / (λ_sum + eps)).astype(np.float32)

    logger.debug(
        "Curvature stats: min=%.4f  max=%.4f  mean=%.4f  p75=%.4f",
        float(curvature.min()), float(curvature.max()),
        float(curvature.mean()),
        float(np.percentile(curvature, 75)),
    )
    return curvature


def curvature_threshold_adaptive(
    curvature: np.ndarray,
    percentile: float = 75.0,
) -> float:
    """
    Return an adaptive curvature threshold at the given percentile.

    Using a percentile-based threshold adapts to per-scan geometric
    variability (crowded vs. well-spaced teeth have different overall
    curvature distributions).

    Parameters
    ----------
    curvature  : np.ndarray, shape (V,)
    percentile : float — default 75 (top 25 % are considered 'high curvature')

    Returns
    -------
    threshold : float
    """
    return float(np.percentile(curvature, percentile))
