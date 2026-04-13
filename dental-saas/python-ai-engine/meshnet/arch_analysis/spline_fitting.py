"""
spline_fitting.py — Fit a smooth B-spline dental arch curve.

Takes 2-D projected tooth centroid coordinates from arch_projection.py
and fits a smooth parametric cubic B-spline through them, ordered
correctly along the dental arch (right-to-left, mirroring the clinical
convention).

Algorithm
---------
1. Sort centroids: right → anterior → left (by x-coordinate)
2. Fit parametric B-spline: scipy.interpolate.splprep
3. Evaluate at uniform parameter steps: scipy.interpolate.splev
4. Return curve samples, knots, and coefficients

Dependencies
------------
    numpy  >= 1.24
    scipy  >= 1.10
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional, Tuple

import numpy as np
from scipy.interpolate import splev, splprep

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class ArchSpline:
    """
    Fitted dental arch B-spline in 2-D occlusal plane coordinates.

    Attributes
    ----------
    tck        : scipy tck tuple  — (knots, coefficients, degree)
    t_samples  : (M,) float       — uniform parameter values evaluated
    curve_xy   : (M, 2) float     — sampled (x, y) along the arch
    sorted_xy  : (K, 2) float     — input centroids in arch order
    sorted_labels : (K,) int      — corresponding tooth labels
    fit_residual  : float         — mean L2 distance from centroids to spline
    smoothing  : float            — smoothing factor used
    degree     : int              — spline degree (default 3 = cubic)
    n_points   : int              — number of sampled curve points
    """
    tck: tuple
    t_samples: np.ndarray
    curve_xy: np.ndarray
    sorted_xy: np.ndarray
    sorted_labels: np.ndarray
    fit_residual: float = 0.0
    smoothing: float = 0.0
    degree: int = 3
    n_points: int = 200

    def evaluate(self, t: np.ndarray) -> np.ndarray:
        """Evaluate spline at parameter values t ∈ [0, 1]. Returns (M, 2)."""
        xy = np.array(splev(t, self.tck)).T
        return xy  # (M, 2)

    def to_dict(self) -> dict:
        """Serialise to JSON-compatible dict."""
        return {
            "curve_xy":      self.curve_xy.tolist(),
            "sorted_xy":     self.sorted_xy.tolist(),
            "sorted_labels": self.sorted_labels.tolist(),
            "fit_residual":  float(self.fit_residual),
            "smoothing":     float(self.smoothing),
            "degree":        int(self.degree),
            "n_points":      int(self.n_points),
            # Spline knots / coefficients (for reconstruction)
            "knots":         [k.tolist() for k in self.tck[0]]
                             if isinstance(self.tck[0], np.ndarray)
                             else [self.tck[0]],
            "coefficients":  [c.tolist() for c in self.tck[1]],
            "t_samples":     self.t_samples.tolist(),
        }


# ---------------------------------------------------------------------------
# Sorting helpers
# ---------------------------------------------------------------------------

def sort_arch_order(
    coords_2d: np.ndarray,
    labels: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Sort 2-D centroids in dental arch traversal order.

    Strategy:
    ---------
    Standard dental arch goes from upper-right (11) across the front (21)
    to upper-left (28), sweeping through a U or parabolic shape.
    In the projected 2D plane this corresponds to travelling along the
    x-axis from positive (right) through the midline (x≈0) to negative
    (left), but the anterior teeth dip forward (lower y).

    We use the **angular order** around the centroid of the arch — this
    correctly handles arch variations (V-shaped, wide, narrow) without
    hard-coding x-sort.

    Parameters
    ----------
    coords_2d : (K, 2) float
    labels    : (K,)   int

    Returns
    -------
    sorted_xy     : (K, 2)
    sorted_labels : (K,)
    """
    if len(coords_2d) < 2:
        return coords_2d, labels

    centre = coords_2d.mean(axis=0)
    dx = coords_2d[:, 0] - centre[0]
    dy = coords_2d[:, 1] - centre[1]
    angles = np.arctan2(dy, dx)

    # Sort counter-clockwise (left to right in clinical view)
    order = np.argsort(angles)
    return coords_2d[order], labels[order]


# ---------------------------------------------------------------------------
# Core fitting function
# ---------------------------------------------------------------------------

def fit_arch_spline(
    coords_2d: np.ndarray,
    labels: np.ndarray,
    *,
    n_curve_points: int = 200,
    smoothing: Optional[float] = None,
    degree: int = 3,
    enforce_open: bool = True,
) -> ArchSpline:
    """
    Fit a parametric cubic B-spline through 2-D arch centroids.

    Parameters
    ----------
    coords_2d : (K, 2) float
        2-D projected tooth centroid coordinates.
    labels : (K,) int
        Tooth labels (for output reporting only).
    n_curve_points : int
        Number of evenly spaced points to sample from the spline (default 200).
    smoothing : float or None
        Smoothing factor for ``splprep``.  None → auto (s = K).  Set to 0
        for interpolating spline (passes exactly through all points).
    degree : int
        Spline degree — 3 = cubic (default, recommended).
    enforce_open : bool
        If True, fix endpoints so the spline doesn't wrap around
        (dental arches are open, not closed).

    Returns
    -------
    ArchSpline
        Fitted spline with curve samples and quality metrics.

    Raises
    ------
    ValueError
        If fewer than `degree + 1` valid centroids provided.
    """
    coords_2d = np.asarray(coords_2d, dtype=np.float64)
    labels = np.asarray(labels, dtype=int)

    min_pts = degree + 1
    if len(coords_2d) < min_pts:
        raise ValueError(
            f"Need at least {min_pts} centroids to fit a degree-{degree} spline, "
            f"got {len(coords_2d)}."
        )

    # ── Sort in arch order ────────────────────────────────────────────────
    sorted_xy, sorted_labels = sort_arch_order(coords_2d, labels)

    # ── Auto smoothing ────────────────────────────────────────────────────
    K = len(sorted_xy)
    if smoothing is None:
        # s = K gives a smooth curve; s = 0 interpolates exactly
        smoothing = float(K)

    # ── Fit parametric B-spline ───────────────────────────────────────────
    # splprep expects separate x, y arrays
    x = sorted_xy[:, 0]
    y = sorted_xy[:, 1]

    try:
        tck, u_params = splprep(
            [x, y],
            s=smoothing,
            k=degree,
            per=False,  # open curve (not periodic)
        )
    except Exception as exc:
        # Fallback: lower degree if too few points
        d_fallback = min(degree, K - 1)
        logger.warning(
            "splprep degree-%d failed (%s), retrying with degree-%d",
            degree, exc, d_fallback,
        )
        tck, u_params = splprep(
            [x, y],
            s=smoothing,
            k=d_fallback,
            per=False,
        )
        degree = d_fallback

    # ── Evaluate spline at uniform parameter steps ────────────────────────
    t_samples = np.linspace(0.0, 1.0, n_curve_points)
    xy_eval = np.array(splev(t_samples, tck)).T  # (M, 2)

    # ── Compute fit residual ──────────────────────────────────────────────
    # For each original centroid, find closest curve sample
    from scipy.spatial import cKDTree
    tree = cKDTree(xy_eval)
    dists, _ = tree.query(sorted_xy)
    residual = float(dists.mean())

    spline = ArchSpline(
        tck=tck,
        t_samples=t_samples,
        curve_xy=xy_eval,
        sorted_xy=sorted_xy,
        sorted_labels=sorted_labels,
        fit_residual=residual,
        smoothing=smoothing,
        degree=degree,
        n_points=n_curve_points,
    )

    logger.info(
        "Arch spline fitted: %d teeth, degree=%d, residual=%.3f mm, "
        "smoothing=%.1f",
        K, degree, residual, smoothing,
    )

    return spline


# ---------------------------------------------------------------------------
# Convenience: fit both arches separately
# ---------------------------------------------------------------------------

def split_arches(
    coords_2d: np.ndarray,
    labels: np.ndarray,
) -> Tuple[
    Tuple[np.ndarray, np.ndarray],
    Tuple[np.ndarray, np.ndarray],
]:
    """
    Split centroids into maxillary (FDI 11–28) and mandibular (FDI 31–48).

    Works with both FDI labels (11+) and sequential labels (1+) by
    thresholding at label 30.

    Returns
    -------
    (max_xy, max_labels), (mand_xy, mand_labels)
    """
    labels = np.asarray(labels, dtype=int)
    max_mask  = (labels >= 11) & (labels <= 28)
    mand_mask = (labels >= 31) & (labels <= 48)

    # Fallback for sequential labels: split by sign of y (maxillary = positive y)
    if not np.any(max_mask) and not np.any(mand_mask):
        logger.debug("FDI labels not detected — splitting arches by Y coordinate")
        mid_y = coords_2d[:, 1].mean()
        max_mask  = coords_2d[:, 1] >= mid_y
        mand_mask = ~max_mask

    return (
        (coords_2d[max_mask],  labels[max_mask]),
        (coords_2d[mand_mask], labels[mand_mask]),
    )
