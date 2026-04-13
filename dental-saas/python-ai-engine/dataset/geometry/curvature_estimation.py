"""
curvature_estimation.py — PCA-based curvature estimation for dental point clouds.

Curvature is a powerful signal for orthodontic segmentation because high-
curvature regions correspond to:

    • Gingival valleys between adjacent teeth
    • Cusp tips and incisal edges
    • Interproximal contact areas
    • Subgingival contours

Algorithm (per point)
---------------------
1. Retrieve the k-nearest neighbours in 3-D space.
2. Build the 3×3 covariance matrix of the local neighbourhood.
3. Compute eigenvalues λ₀ ≤ λ₁ ≤ λ₂.
4. Curvature κ = λ₀ / (λ₀ + λ₁ + λ₂ + ε)
   → 0 for planar → ~1/3 for isotropic → >0.3 for ridge/valley

This is the standard definition used in PointNet++ and PCD-Net literature.

Performance notes
-----------------
Batched KDTree queries + vectorised covariance keep wall-clock time to
~2–5 s for N=50 000 on a modern CPU.  The inner SVD call uses
numpy.linalg.eigvalsh (symmetric eigenvalue solver, ~3× faster than eigvals).
"""

from __future__ import annotations

import logging

import numpy as np
from scipy.spatial import cKDTree

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def estimate_curvature(
    points: np.ndarray,
    k: int = 20,
    batch_size: int = 2048,
    eps: float = 1e-8,
) -> np.ndarray:
    """
    Estimate local PCA curvature for every point in the cloud.

    Parameters
    ----------
    points : np.ndarray, shape (N, 3)
        3-D point coordinates.
    k : int
        Neighbourhood size for covariance computation (default 20).
        Larger k → smoother curvature estimates.
    batch_size : int
        Number of points processed per batch to control peak memory.
    eps : float
        Numerical stability addend in denominator.

    Returns
    -------
    curvature : np.ndarray, shape (N,), dtype float32
        Per-point curvature in [0, 1].
        Values near 0 → flat surface.
        Values > 0.3  → high curvature (ridges, valleys, edges).

    Raises
    ------
    ValueError
        If ``points`` is not shape (N, 3).
    """
    points = np.asarray(points, dtype=np.float64)   # float64 for stable PCA

    if points.ndim != 2 or points.shape[1] != 3:
        raise ValueError(
            f"points must have shape (N, 3), got {points.shape}"
        )

    N = points.shape[0]
    k_query = min(k + 1, N)   # +1: point is its own nearest neighbour

    logger.debug(
        "Building KDTree for curvature estimation: N=%d, k=%d", N, k
    )
    tree = cKDTree(points)
    curvature = np.zeros(N, dtype=np.float32)

    for start in range(0, N, batch_size):
        end = min(start + batch_size, N)
        batch_pts = points[start:end]

        # indices: (B, k_query)
        _, indices = tree.query(batch_pts, k=k_query)

        # neighbours: (B, k_query, 3)
        neighbours = points[indices]

        # Centre each local neighbourhood
        centroid = neighbours.mean(axis=1, keepdims=True)   # (B, 1, 3)
        centred = neighbours - centroid                      # (B, k_query, 3)

        # Batch covariance: (B, 3, 3)
        # cov[b] = (centred[b].T @ centred[b]) / k_query
        cov = np.einsum("bni,bnj->bij", centred, centred) / k_query

        # Symmetric eigenvalues (sorted ascending by numpy convention)
        eigvals = np.linalg.eigvalsh(cov)   # (B, 3) — λ₀ ≤ λ₁ ≤ λ₂

        λ_min = eigvals[:, 0]                # smallest eigenvalue
        λ_sum = eigvals.sum(axis=1)

        curvature[start:end] = (λ_min / (λ_sum + eps)).astype(np.float32)

    logger.debug(
        "Curvature estimation complete: min=%.4f max=%.4f mean=%.4f",
        float(curvature.min()),
        float(curvature.max()),
        float(curvature.mean()),
    )
    return curvature


def curvature_percentile_thresholds(
    curvature: np.ndarray,
    low_pct: float = 33.0,
    high_pct: float = 67.0,
) -> tuple[float, float]:
    """
    Return percentile-based low/high threshold values for curvature.

    Useful for colour-mapped visualisation and adaptive neighbourhood sizing.

    Parameters
    ----------
    curvature : np.ndarray, shape (N,)
    low_pct   : float — percentile for 'low curvature' cut-off
    high_pct  : float — percentile for 'high curvature' cut-off

    Returns
    -------
    (threshold_low, threshold_high) : tuple[float, float]
    """
    curvature = np.asarray(curvature, dtype=np.float32)
    t_low = float(np.percentile(curvature, low_pct))
    t_high = float(np.percentile(curvature, high_pct))
    return t_low, t_high
