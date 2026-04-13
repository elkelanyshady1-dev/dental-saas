"""
boundary_detection.py — Detect tooth–gingiva boundary points via KDTree.

A boundary point is defined as a point whose k-nearest-neighbour set contains
at least one point with a *different* tooth/gingiva label.  These zones are
the most clinically significant areas for segmentation quality:

    • Tooth–gingiva interface (gingival margin)
    • Interproximal contacts (adjacent tooth boundaries)
    • CEJ (Cemento-Enamel Junction) region

The output boolean mask is consumed by boundary_aware_sampling to ensure
those critical regions are over-represented in every training mini-batch.

Dependencies
------------
    scipy.spatial.cKDTree  — vectorised KNN queries
    numpy                  — array ops

Performance notes
-----------------
The naïve per-point loop is O(N·k·log N).  For N=50 000 and k=16 this
completes in ~1–2 s on CPU, which is acceptable for offline dataset
generation.  A vectorised batch variant is provided for large meshes.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
from scipy.spatial import cKDTree

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def detect_boundary_points(
    points: np.ndarray,
    labels: np.ndarray,
    k: int = 16,
    batch_size: int = 4096,
) -> np.ndarray:
    """
    Detect boundary points where label identity changes within a local
    k-nearest-neighbour neighbourhood.

    Parameters
    ----------
    points : np.ndarray, shape (N, 3)
        3-D coordinates of the point cloud.
    labels : np.ndarray, shape (N,)
        Integer segmentation label per point.
        Convention: 0 = gingiva, 1–32 = individual teeth.
    k : int
        Neighbourhood size for boundary test (default 16).
        Larger k → smoother, slightly wider boundary band.
    batch_size : int
        KDTree queries are executed in batches to limit peak memory.

    Returns
    -------
    boundary_mask : np.ndarray, shape (N,), dtype bool
        True where the point sits on a label boundary.

    Raises
    ------
    ValueError
        If ``points`` and ``labels`` have incompatible first dimensions.
    """
    points = np.asarray(points, dtype=np.float32)
    labels = np.asarray(labels, dtype=np.int64)

    if points.ndim != 2 or points.shape[1] != 3:
        raise ValueError(
            f"points must have shape (N, 3), got {points.shape}"
        )
    if labels.ndim != 1 or labels.shape[0] != points.shape[0]:
        raise ValueError(
            f"labels shape {labels.shape} incompatible with "
            f"points shape {points.shape}"
        )

    N = points.shape[0]
    # k+1 because query includes the point itself as its own nearest neighbour
    k_query = min(k + 1, N)

    logger.debug(
        "Building KDTree for boundary detection: N=%d, k=%d", N, k
    )
    tree = cKDTree(points)
    boundary_mask = np.zeros(N, dtype=bool)

    # Batched queries — avoids allocating an (N, k) index matrix at once
    for start in range(0, N, batch_size):
        end = min(start + batch_size, N)
        batch_pts = points[start:end]

        # distances shape: (batch, k_query)
        # indices shape:   (batch, k_query)
        _, indices = tree.query(batch_pts, k=k_query)

        # labels[indices]: (batch, k_query)
        neighbour_labels = labels[indices]            # (B, k_query)
        own_labels = labels[start:end, np.newaxis]   # (B, 1)

        # Any neighbour with a different label → boundary
        has_different = np.any(neighbour_labels != own_labels, axis=1)
        boundary_mask[start:end] = has_different

    n_boundary = int(boundary_mask.sum())
    logger.debug(
        "Boundary detection complete: %d / %d points on boundary (%.1f%%)",
        n_boundary, N, 100.0 * n_boundary / max(N, 1),
    )
    return boundary_mask


def compute_boundary_statistics(
    boundary_mask: np.ndarray,
    labels: np.ndarray,
) -> dict:
    """
    Summarise boundary detection results per label class.

    Useful for meta.json reporting and dashboard diagnostics.

    Parameters
    ----------
    boundary_mask : np.ndarray, shape (N,), dtype bool
    labels        : np.ndarray, shape (N,)

    Returns
    -------
    dict with keys:
        total_points        int
        boundary_points     int
        boundary_pct        float
        per_class           dict[int, dict]  — {label: {total, boundary, pct}}
    """
    boundary_mask = np.asarray(boundary_mask, dtype=bool)
    labels = np.asarray(labels, dtype=np.int64)

    N = len(labels)
    n_boundary = int(boundary_mask.sum())
    unique_labels = np.unique(labels)

    per_class: dict = {}
    for lbl in unique_labels:
        mask_lbl = labels == lbl
        total_lbl = int(mask_lbl.sum())
        boundary_lbl = int((boundary_mask & mask_lbl).sum())
        per_class[int(lbl)] = {
            "total": total_lbl,
            "boundary": boundary_lbl,
            "pct": round(100.0 * boundary_lbl / max(total_lbl, 1), 2),
        }

    return {
        "total_points": N,
        "boundary_points": n_boundary,
        "boundary_pct": round(100.0 * n_boundary / max(N, 1), 2),
        "per_class": per_class,
    }
