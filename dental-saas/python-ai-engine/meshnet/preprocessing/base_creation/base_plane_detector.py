"""
base_plane_detector.py — Fit a base plane below the gingival margin.

Two detection strategies:

    RANSAC (default)
        Robust fitting against outliers.  Runs on the lower 20% of the
        scan (height-filtered), prevents occlusal surface contaminating
        the fit.

    PCA
        Fit a plane through the lower-boundary vertices using PCA.
        Faster but less robust to outlier vertices.

The "lower" region is defined as vertices with Z ≤ p20 of the full
scan Z-range, after the scan is roughly aligned (tallest axis = Z).

Output
------
    BasePlane.normal   : (3,) float  — unit normal (points downward)
    BasePlane.point    : (3,) float  — a point on the plane
    BasePlane.offset_mm: float       — distance below lowest gingival vertex
    BasePlane.z_level  : float       — Z coordinate of base plane

Usage
-----
    detector = BasePlaneDetector(method="ransac", offset_mm=3.0)
    plane = detector.detect(mesh)
    print(f"Base Z = {plane.z_level:.2f} mm")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class BasePlane:
    """
    Detected base plane for a dental scan.

    Attributes
    ----------
    normal     : (3,) unit normal — points away from tooth arch (typically -Z)
    point      : (3,) a point on the plane
    z_level    : float — Z coordinate of the base plane
    offset_mm  : float — offset below the lowest detected gingival vertex
    method     : str   — "ransac" or "pca"
    inlier_ratio: float — RANSAC inlier ratio (0 if PCA)
    """
    normal: np.ndarray
    point: np.ndarray
    z_level: float
    offset_mm: float
    method: str
    inlier_ratio: float = 0.0

    def signed_distance(self, points: np.ndarray) -> np.ndarray:
        """
        Signed distance of each point from the plane.

        Positive = above plane (same side as normal).
        Negative = below plane.
        """
        return (points - self.point) @ self.normal

    def project_to_plane(self, points: np.ndarray) -> np.ndarray:
        """Project points onto the plane."""
        dist = self.signed_distance(points)
        return points - dist[:, None] * self.normal

    def to_dict(self) -> dict:
        return {
            "normal": self.normal.tolist(),
            "point": self.point.tolist(),
            "z_level": round(float(self.z_level), 4),
            "offset_mm": round(float(self.offset_mm), 4),
            "method": self.method,
            "inlier_ratio": round(float(self.inlier_ratio), 4),
        }


class BasePlaneDetector:
    """
    Fits a printable base plane below the gingival margin of a dental scan.

    Parameters
    ----------
    method       : str   — "ransac" or "pca"
    offset_mm    : float — additional lowering of the plane below the lowest
                           gingival vertex  (default 3.0 mm for clearance)
    lower_pct    : float — fraction of scan height to search for base vertices
                           (default 0.25 = bottom 25%)
    ransac_iters : int   — RANSAC iterations  (default 200)
    ransac_thresh: float — inlier distance threshold in mm  (default 0.5)
    """

    def __init__(
        self,
        method: Literal["ransac", "pca"] = "ransac",
        offset_mm: float = 3.0,
        lower_pct: float = 0.25,
        ransac_iters: int = 200,
        ransac_thresh: float = 0.5,
    ) -> None:
        self.method = method
        self.offset_mm = float(offset_mm)
        self.lower_pct = float(lower_pct)
        self.ransac_iters = int(ransac_iters)
        self.ransac_thresh = float(ransac_thresh)

    # ── Public API ─────────────────────────────────────────────────────────

    def detect(self, mesh: "trimesh.Trimesh") -> BasePlane:
        """
        Detect the base plane for a dental scan mesh.

        Returns
        -------
        BasePlane
        """
        vertices = np.asarray(mesh.vertices, dtype=np.float64)
        lower_verts = self._extract_lower_region(vertices)

        if self.method == "ransac":
            normal, point, inlier_ratio = self._ransac_plane(lower_verts)
        else:
            normal, point = self._pca_plane(lower_verts)
            inlier_ratio = 0.0

        # Ensure normal points downward (negative Z)
        if normal[2] > 0:
            normal = -normal

        # Lowest gingival vertex in scan (bottom Z)
        z_min = float(vertices[:, 2].min())

        # Place base plane offset_mm below the lowest point
        z_level = z_min - self.offset_mm
        base_point = np.array([
            vertices[:, 0].mean(),
            vertices[:, 1].mean(),
            z_level,
        ], dtype=np.float64)

        logger.info(
            "BasePlaneDetector[%s]: z_min=%.2f  z_base=%.2f  offset=%.1f mm  inliers=%.1f%%",
            self.method, z_min, z_level, self.offset_mm, inlier_ratio * 100,
        )

        return BasePlane(
            normal=normal,
            point=base_point,
            z_level=z_level,
            offset_mm=self.offset_mm,
            method=self.method,
            inlier_ratio=inlier_ratio,
        )

    # ── Region extraction ──────────────────────────────────────────────────

    def _extract_lower_region(self, vertices: np.ndarray) -> np.ndarray:
        """Return the lower lower_pct fraction of vertices by Z coordinate."""
        z = vertices[:, 2]
        z_min = float(z.min())
        z_max = float(z.max())
        z_thresh = z_min + (z_max - z_min) * self.lower_pct
        mask = z <= z_thresh
        lower = vertices[mask]
        if len(lower) < 10:
            logger.warning("Very few lower vertices (%d) — using all vertices", len(lower))
            return vertices
        return lower

    # ── RANSAC plane fitting ───────────────────────────────────────────────

    def _ransac_plane(
        self,
        points: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray, float]:
        """
        RANSAC plane fitting on lower vertices.

        Returns (normal, point_on_plane, inlier_ratio).
        """
        rng = np.random.default_rng(42)
        N = len(points)
        best_normal = np.array([0.0, 0.0, -1.0])
        best_point  = points.mean(axis=0)
        best_inliers = 0

        if N < 3:
            return best_normal, best_point, 0.0

        for _ in range(self.ransac_iters):
            # Sample 3 random points
            idx = rng.choice(N, 3, replace=False)
            p0, p1, p2 = points[idx[0]], points[idx[1]], points[idx[2]]

            # Fit plane
            v1 = p1 - p0
            v2 = p2 - p0
            normal = np.cross(v1, v2)
            n_norm = np.linalg.norm(normal)
            if n_norm < 1e-9:
                continue
            normal /= n_norm

            # Count inliers
            dists = np.abs((points - p0) @ normal)
            n_inliers = int((dists <= self.ransac_thresh).sum())

            if n_inliers > best_inliers:
                best_inliers = n_inliers
                best_normal  = normal.copy()
                # Refit using all inliers for stability
                inlier_pts = points[dists <= self.ransac_thresh]
                best_point  = inlier_pts.mean(axis=0)

        inlier_ratio = best_inliers / N if N > 0 else 0.0
        return best_normal.astype(np.float64), best_point.astype(np.float64), inlier_ratio

    # ── PCA plane fitting ──────────────────────────────────────────────────

    def _pca_plane(
        self,
        points: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """PCA plane: normal = smallest eigenvector of covariance matrix."""
        centroid = points.mean(axis=0)
        centred  = points - centroid
        cov      = centred.T @ centred / max(1, len(points) - 1)
        eigenvalues, eigenvectors = np.linalg.eigh(cov)
        # Smallest eigenvalue → most compressed direction → plane normal
        normal = eigenvectors[:, 0]  # (3,)
        return normal.astype(np.float64), centroid.astype(np.float64)
