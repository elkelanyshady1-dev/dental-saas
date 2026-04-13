"""
dataset/core.py — Core mesh-level geometry utilities.

Provides two public functions that operate directly on trimesh objects:

    detect_boundary_vertices(mesh, tooth_meshes, threshold=0.5)
        Returns a boolean mask over mesh.vertices identifying which vertices
        are within `threshold` Euclidean distance of ANY tooth submesh
        vertex.  Used to tag boundary zones before sampling.

    boundary_aware_sampling(mesh, tooth_meshes, n_points=10000)
        Allocates 30 % of sampled points to the boundary zone and 70 % to
        the remaining "normal" region.  Returns an (n_points, 3) array of
        vertex positions.

These functions complement the richer pipeline in
    dataset/geometry/boundary_detection.py   (label-aware KNN boundary)
    dataset/sampling/boundary_sampler.py      (3-pool composite sampler)

The mesh-based API here is intentionally simpler:  it takes trimesh objects
and a distance threshold rather than per-point label arrays.  This is ideal
for the generate_dataset CLI where multiple tooth submeshes are available as
separate geometry objects rather than per-vertex label arrays.

Dependencies
------------
    numpy        — array ops
    scipy        — cKDTree for vectorised distance queries
"""

from __future__ import annotations

import logging
from typing import List

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Step 1 — Boundary vertex detection (mesh-aware, distance-based)
# ---------------------------------------------------------------------------

def detect_boundary_vertices(
    mesh,
    tooth_meshes: List,
    threshold: float = 0.5,
) -> np.ndarray:
    """
    Detect which vertices of *mesh* lie within *threshold* Euclidean units of
    any vertex in one of the *tooth_meshes*.

    This produces a coarser but faster boundary signal than the label-KNN
    approach in ``geometry.boundary_detection``:  it does not require
    per-vertex labels and is well-suited for cases where individual tooth
    submeshes are available as separate trimesh objects (e.g. CAD exports
    with one mesh per tooth).

    Parameters
    ----------
    mesh : trimesh.Trimesh (or any object with a `.vertices` ndarray)
        The full scan mesh whose vertices are being classified.
    tooth_meshes : list of trimesh.Trimesh
        Individual tooth sub-meshes.  Boundary = proximity to any of these.
    threshold : float
        Distance threshold in the same units as the mesh coordinates.
        Vertices closer than this to any tooth-mesh vertex are marked as
        boundary.  Default 0.5 (corresponds to ~0.5 mm for mm-scale STLs).

    Returns
    -------
    boundary_mask : np.ndarray, shape (V,), dtype bool
        True where vertex is within *threshold* of a tooth mesh vertex.

    Raises
    ------
    ValueError
        If *tooth_meshes* is empty.
    """
    from scipy.spatial import cKDTree  # local import keeps the module light

    if not tooth_meshes:
        raise ValueError(
            "tooth_meshes must contain at least one mesh object."
        )

    verts = np.asarray(mesh.vertices, dtype=np.float32)
    V = len(verts)
    boundary_mask = np.zeros(V, dtype=bool)

    logger.debug(
        "detect_boundary_vertices: V=%d, %d tooth meshes, threshold=%.3f",
        V, len(tooth_meshes), threshold,
    )

    for tooth in tooth_meshes:
        tooth_verts = np.asarray(tooth.vertices, dtype=np.float32)
        if len(tooth_verts) == 0:
            continue
        tree = cKDTree(tooth_verts)
        dist, _ = tree.query(verts)
        boundary_mask |= dist < threshold

    n_boundary = int(boundary_mask.sum())
    logger.debug(
        "Boundary vertices: %d / %d (%.1f%%)",
        n_boundary, V, 100.0 * n_boundary / max(V, 1),
    )
    return boundary_mask


# ---------------------------------------------------------------------------
# Step 2 — Boundary-aware sampling (mesh-based)
# ---------------------------------------------------------------------------

def boundary_aware_sampling(
    mesh,
    tooth_meshes: List,
    n_points: int = 10_000,
    boundary_ratio: float = 0.3,
    threshold: float = 0.5,
    seed: int | None = None,
) -> np.ndarray:
    """
    Sample *n_points* vertex positions from *mesh*, over-representing the
    boundary zone near tooth sub-meshes.

    Composition
    -----------
    ┌─────────────────────────────────────────────────┐
    │  30%  Boundary — near tooth–gingiva interfaces  │
    │  70%  Normal   — bulk of the scan               │
    └─────────────────────────────────────────────────┘

    Parameters
    ----------
    mesh : trimesh.Trimesh
        Full scan mesh.
    tooth_meshes : list of trimesh.Trimesh
        Individual tooth sub-meshes for boundary detection.
    n_points : int
        Total number of points in the output sample.
    boundary_ratio : float
        Fraction of output points drawn from the boundary zone.
        Default 0.3 → 30 % boundary, 70 % normal.
    threshold : float
        Distance threshold passed to :func:`detect_boundary_vertices`.
    seed : int, optional
        NumPy random seed for reproducibility.

    Returns
    -------
    points : np.ndarray, shape (n_points, 3), float32
        Sampled vertex coordinates.

    Raises
    ------
    ValueError
        If boundary or normal pool is completely empty (degenerate mesh).
    """
    if not (0.0 < boundary_ratio < 1.0):
        raise ValueError(
            f"boundary_ratio must be in (0, 1), got {boundary_ratio}"
        )

    rng = np.random.default_rng(seed)

    verts = np.asarray(mesh.vertices, dtype=np.float32)

    # ── Detect boundary ──────────────────────────────────────────────────
    boundary_mask = detect_boundary_vertices(mesh, tooth_meshes, threshold)

    boundary_indices = np.where(boundary_mask)[0]
    normal_indices = np.where(~boundary_mask)[0]

    logger.info(
        "boundary_aware_sampling: boundary=%d  normal=%d  target=%d",
        len(boundary_indices), len(normal_indices), n_points,
    )

    # ── Budget split ─────────────────────────────────────────────────────
    n_boundary = int(n_points * boundary_ratio)
    n_normal = n_points - n_boundary

    # ── Sample boundary pool ─────────────────────────────────────────────
    if len(boundary_indices) == 0:
        logger.warning(
            "No boundary vertices detected; filling boundary quota with "
            "uniform samples."
        )
        boundary_pts = verts[rng.choice(len(verts), n_boundary, replace=True)]
    else:
        boundary_pts = verts[
            rng.choice(
                boundary_indices,
                n_boundary,
                replace=(len(boundary_indices) < n_boundary),
            )
        ]

    # ── Sample normal pool ───────────────────────────────────────────────
    if len(normal_indices) == 0:
        logger.warning(
            "No normal (non-boundary) vertices; filling normal quota with "
            "boundary samples."
        )
        normal_pts = verts[rng.choice(len(verts), n_normal, replace=True)]
    else:
        normal_pts = verts[
            rng.choice(
                normal_indices,
                n_normal,
                replace=(len(normal_indices) < n_normal),
            )
        ]

    # ── Concatenate ──────────────────────────────────────────────────────
    points = np.concatenate([boundary_pts, normal_pts], axis=0)

    logger.info(
        "boundary_aware_sampling complete: %d points (boundary=%d normal=%d)",
        len(points), n_boundary, n_normal,
    )
    return points
