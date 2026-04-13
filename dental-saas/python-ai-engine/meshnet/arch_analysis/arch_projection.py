"""
arch_projection.py — Project tooth centroids onto the occlusal plane.

Converts 3-D tooth centroid coordinates (one per FDI tooth class) into
2-D coordinates lying in the occlusal plane by orthographic projection.

The resulting 2D layout is used by spline_fitting.py to fit the dental
arch curve.

Mathematical basis
------------------
Given:
    c   — centroid 3-D vector          (3,)
    n   — occlusal plane unit normal   (3,)
    o   — plane origin                 (3,)
    u,v — orthonormal basis in plane   (3,)

Projection:
    c_plane = c - dot(c - o, n) * n    (project to plane)
    x_2d    = dot(c_plane - o, u)
    y_2d    = dot(c_plane - o, v)

Dependencies
------------
    numpy >= 1.24
"""

from __future__ import annotations

import logging
from typing import Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants — FDI tooth ordering
# ---------------------------------------------------------------------------

# Canonical FDI label list (excluding gingiva=0)
FDI_MAXILLARY = list(range(11, 19)) + list(range(21, 29))  # upper arch
FDI_MANDIBULAR = list(range(31, 39)) + list(range(41, 49))  # lower arch
FDI_ALL = FDI_MAXILLARY + FDI_MANDIBULAR

# Sequential 1-based label list used when num_classes <= 33 but labels are
# 1-N (synthetic datasets).
_SEQ_LABELS: list[int] = list(range(1, 33))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_occlusal_basis(
    plane_normal: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute an orthonormal basis (u, v, n) for the occlusal plane.

    Parameters
    ----------
    plane_normal : (3,) array-like
        The plane normal vector (need not be unit length).

    Returns
    -------
    u : (3,) float  — first in-plane axis (roughly labial-lingual)
    v : (3,) float  — second in-plane axis (roughly mesial-distal)
    n : (3,) float  — plane normal (unit)
    """
    n = np.asarray(plane_normal, dtype=np.float64)
    n = n / (np.linalg.norm(n) + 1e-12)

    # Pick a reference vector not (anti-)parallel to n
    ref = np.array([0.0, 1.0, 0.0])
    if abs(np.dot(n, ref)) > 0.9:
        ref = np.array([1.0, 0.0, 0.0])

    u = np.cross(n, ref)
    u /= np.linalg.norm(u) + 1e-12

    v = np.cross(n, u)
    v /= np.linalg.norm(v) + 1e-12

    return u, v, n


def project_centroids_to_plane(
    centroids_3d: np.ndarray,
    plane_normal: np.ndarray,
    plane_origin: Optional[np.ndarray] = None,
    valid_mask: Optional[np.ndarray] = None,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Orthographically project 3-D tooth centroids onto the occlusal plane.

    Parameters
    ----------
    centroids_3d : (T, 3) float
        3-D centroids, one per tooth class. Zero rows for absent teeth.
    plane_normal : (3,) float
        Unit normal of the occlusal plane (pointing occlusally).
    plane_origin : (3,) float or None
        A point on the plane.  If None, uses the centroid of all valid points.
    valid_mask : (T,) bool or None
        Which teeth are present.  If None, treats any non-zero centroid as valid.

    Returns
    -------
    coords_2d : (K, 2) float
        Projected 2-D coordinates for the K valid teeth.
    labels : (K,) int
        FDI (or index) labels corresponding to each 2-D point.
    basis : dict
        {"u": u, "v": v, "n": n, "origin": origin}  — for back-projection.
    """
    centroids_3d = np.asarray(centroids_3d, dtype=np.float64)
    T = len(centroids_3d)

    # Build validity mask
    if valid_mask is not None:
        valid = np.asarray(valid_mask, dtype=bool)
    else:
        norms = np.linalg.norm(centroids_3d, axis=1)
        valid = norms > 1e-6

    valid_indices = np.where(valid)[0]
    if len(valid_indices) == 0:
        logger.warning("No valid centroids to project.")
        return np.zeros((0, 2)), np.array([], dtype=int), {}

    valid_pts = centroids_3d[valid_indices]

    # Plane origin defaults to mean of valid centroids
    if plane_origin is None:
        plane_origin = valid_pts.mean(axis=0)
    else:
        plane_origin = np.asarray(plane_origin, dtype=np.float64)

    u, v, n = compute_occlusal_basis(plane_normal)

    # Orthographic projection: c_rel = c - origin, remove normal component
    c_rel = valid_pts - plane_origin          # (K, 3)
    x_2d = c_rel @ u                         # (K,)
    y_2d = c_rel @ v                         # (K,)

    coords_2d = np.column_stack([x_2d, y_2d])  # (K, 2)
    labels = valid_indices.astype(int)

    basis = {
        "u": u,
        "v": v,
        "n": n,
        "origin": plane_origin,
    }

    logger.debug(
        "Projected %d centroids to 2D  | x=[%.1f,%.1f]  y=[%.1f,%.1f]",
        len(labels),
        x_2d.min(), x_2d.max(),
        y_2d.min(), y_2d.max(),
    )

    return coords_2d, labels, basis


def backproject_to_3d(
    coords_2d: np.ndarray,
    basis: dict,
) -> np.ndarray:
    """
    Back-project 2-D arch curve samples to 3-D world coordinates.

    Parameters
    ----------
    coords_2d : (M, 2) float
        2-D curve sample points in the occlusal plane coordinate system.
    basis : dict
        Output of `project_centroids_to_plane` — contains u, v, origin.

    Returns
    -------
    coords_3d : (M, 3) float
        3-D coordinates on the occlusal plane.
    """
    pts_2d = np.asarray(coords_2d, dtype=np.float64)
    u = basis["u"]
    v = basis["v"]
    origin = basis["origin"]

    coords_3d = origin + pts_2d[:, 0:1] * u + pts_2d[:, 1:2] * v
    return coords_3d


def estimate_occlusal_plane_from_centroids(
    centroids_3d: np.ndarray,
    valid_mask: Optional[np.ndarray] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Estimate the occlusal plane by PCA on valid tooth centroids.

    Returns the plane normal (smallest eigenvalue direction) and the centroid
    mean as the plane origin.

    Parameters
    ----------
    centroids_3d : (T, 3)
    valid_mask   : (T,) bool or None

    Returns
    -------
    normal : (3,) float  — unit normal pointing in the occlusal direction
    origin : (3,) float  — centroid of all valid tooth positions
    """
    pts = np.asarray(centroids_3d, dtype=np.float64)

    if valid_mask is not None:
        pts = pts[np.asarray(valid_mask, dtype=bool)]
    else:
        norms = np.linalg.norm(pts, axis=1)
        pts = pts[norms > 1e-6]

    if len(pts) < 3:
        logger.warning(
            "Too few valid centroids (%d) to estimate occlusal plane. "
            "Using [0, 0, 1] as fallback normal.",
            len(pts),
        )
        return np.array([0.0, 0.0, 1.0]), pts.mean(axis=0) if len(pts) else np.zeros(3)

    origin = pts.mean(axis=0)
    centered = pts - origin
    _, _, Vt = np.linalg.svd(centered, full_matrices=False)
    # Smallest singular value → direction most perpendicular to the plane
    normal = Vt[-1]
    normal /= np.linalg.norm(normal) + 1e-12

    # Ensure normal points upward (positive Z by convention)
    if normal[2] < 0:
        normal = -normal

    logger.debug(
        "Estimated occlusal plane: normal=%s  origin=%s",
        np.round(normal, 3), np.round(origin, 2),
    )

    return normal, origin
