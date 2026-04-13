"""
arch_detection.py — Dental arch detection pipeline.

Orchestrates the full arch curve detection workflow:

    1. Extract tooth centroids from point cloud + labels
    2. Estimate or receive occlusal plane
    3. Project centroids to 2-D occlusal plane coordinates
    4. Fit B-spline arch curve (maxillary and mandibular separately)
    5. Back-project curve samples to 3-D
    6. Return structured ArchDetectionResult

Entry point for the dashboard API and the test script.

Usage
-----
    from meshnet.arch_analysis.arch_detection import detect_arch_curve

    result = detect_arch_curve(
        points=pts_np,        # (N, 3) float32
        labels=labels_np,     # (N,)   int
        num_classes=33,
    )
    print(result.maxillary.fit_residual)

Dependencies
------------
    numpy >= 1.24
    scipy >= 1.10
    torch >= 2.0  (for compute_tooth_centroids)
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np

from .arch_projection import (
    backproject_to_3d,
    estimate_occlusal_plane_from_centroids,
    project_centroids_to_plane,
)
from .spline_fitting import ArchSpline, fit_arch_spline, split_arches

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result data structure
# ---------------------------------------------------------------------------

@dataclass
class ArchDetectionResult:
    """
    Full arch detection result for one case (both arches if available).

    Attributes
    ----------
    maxillary        : ArchSpline or None  — upper arch spline
    mandibular       : ArchSpline or None  — lower arch spline
    centroids_3d     : (T, 3)  — 3-D tooth centroids (all classes)
    centroids_valid  : (T,)    — which teeth are present
    occlusal_normal  : (3,)    — estimated/given occlusal plane normal
    occlusal_origin  : (3,)    — plane origin (centroid of teeth)
    basis            : dict    — coordinate basis for back-projection
    max_curve_3d     : (M, 3) or None  — maxillary arch curve in 3D
    mand_curve_3d    : (M, 3) or None  — mandibular arch curve in 3D
    elapsed_s        : float   — total detection time (seconds)
    error            : str or None
    """
    maxillary: Optional[ArchSpline] = None
    mandibular: Optional[ArchSpline] = None
    centroids_3d: np.ndarray = field(default_factory=lambda: np.zeros((33, 3)))
    centroids_valid: np.ndarray = field(default_factory=lambda: np.zeros(33, dtype=bool))
    occlusal_normal: np.ndarray = field(default_factory=lambda: np.array([0.0, 0.0, 1.0]))
    occlusal_origin: np.ndarray = field(default_factory=lambda: np.zeros(3))
    basis: dict = field(default_factory=dict)
    max_curve_3d: Optional[np.ndarray] = None
    mand_curve_3d: Optional[np.ndarray] = None
    elapsed_s: float = 0.0
    error: Optional[str] = None

    @property
    def success(self) -> bool:
        return self.error is None and (
            self.maxillary is not None or self.mandibular is not None
        )

    def to_dict(self) -> dict:
        """Serialise for JSON API response."""
        def spline_json(s: Optional[ArchSpline]) -> Optional[dict]:
            if s is None:
                return None
            return s.to_dict()

        return {
            "success":        self.success,
            "elapsed_s":      round(self.elapsed_s, 4),
            "error":          self.error,
            "occlusal_normal": self.occlusal_normal.tolist(),
            "occlusal_origin": self.occlusal_origin.tolist(),
            "centroids_3d":   self.centroids_3d.tolist(),
            "centroids_valid": self.centroids_valid.tolist(),
            "maxillary":      spline_json(self.maxillary),
            "mandibular":     spline_json(self.mandibular),
            "max_curve_3d":   self.max_curve_3d.tolist() if self.max_curve_3d is not None else None,
            "mand_curve_3d":  self.mand_curve_3d.tolist() if self.mand_curve_3d is not None else None,
        }


# ---------------------------------------------------------------------------
# Centroid extraction (delegates to geometry.tooth_graph if torch available)
# ---------------------------------------------------------------------------

def _extract_centroids_numpy(
    points: np.ndarray,
    labels: np.ndarray,
    num_classes: int = 33,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Pure-numpy centroid extraction (no torch dependency).

    Returns
    -------
    centroids : (T, 3) float64
    valid     : (T,)   bool
    """
    T = num_classes
    centroids = np.zeros((T, 3), dtype=np.float64)
    counts = np.zeros(T, dtype=np.int64)

    lbl = np.asarray(labels, dtype=np.int64)
    pts = np.asarray(points, dtype=np.float64)

    lbl_clipped = np.clip(lbl, 0, T - 1)

    np.add.at(centroids, lbl_clipped, pts)
    np.add.at(counts, lbl_clipped, 1)

    valid = counts > 0
    safe_counts = np.where(valid, counts, 1)
    centroids /= safe_counts[:, None]
    centroids[~valid] = 0.0

    return centroids, valid


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def detect_arch_curve(
    points: np.ndarray,
    labels: np.ndarray,
    num_classes: int = 33,
    *,
    occlusal_normal: Optional[np.ndarray] = None,
    occlusal_origin: Optional[np.ndarray] = None,
    n_curve_points: int = 200,
    smoothing: Optional[float] = None,
    spline_degree: int = 3,
) -> ArchDetectionResult:
    """
    Detect the dental arch curves for a case.

    Parameters
    ----------
    points : (N, 3) float
        Point cloud sampled from the dental scan surface.
    labels : (N,) int
        Per-point tooth labels.  0 = gingiva, 1-32 or FDI = teeth.
    num_classes : int
        Total class count (default 33 = gingiva + 32 teeth).
    occlusal_normal : (3,) float or None
        If None, estimated from the centroid PCA.
    occlusal_origin : (3,) float or None
        If None, uses centroid of all valid tooth positions.
    n_curve_points : int
        Number of curve sample points (default 200).
    smoothing : float or None
        B-spline smoothing (None = auto K teeth).
    spline_degree : int
        Spline degree (default 3 = cubic).

    Returns
    -------
    ArchDetectionResult
    """
    t0 = time.perf_counter()
    result = ArchDetectionResult()

    try:
        pts = np.asarray(points,  dtype=np.float32)
        lbl = np.asarray(labels,  dtype=np.int64)

        # ── Step 1: Extract tooth centroids ──────────────────────────────
        centroids, valid = _extract_centroids_numpy(pts, lbl, num_classes)
        result.centroids_3d    = centroids
        result.centroids_valid = valid

        n_valid = int(valid.sum())
        logger.info("Detected %d / %d tooth centroids", n_valid, num_classes - 1)

        if n_valid < 3:
            raise ValueError(
                f"Too few detected teeth ({n_valid}) to fit arch curve. "
                "Need at least 3."
            )

        # ── Step 2: Occlusal plane ────────────────────────────────────────
        if occlusal_normal is None:
            occ_n, occ_o = estimate_occlusal_plane_from_centroids(
                centroids, valid_mask=valid
            )
        else:
            occ_n = np.asarray(occlusal_normal, dtype=np.float64)
            occ_n /= np.linalg.norm(occ_n) + 1e-12
            occ_o = (
                np.asarray(occlusal_origin, dtype=np.float64)
                if occlusal_origin is not None
                else centroids[valid].mean(axis=0)
            )

        result.occlusal_normal = occ_n
        result.occlusal_origin = occ_o

        # ── Step 3: Project centroids to 2D ──────────────────────────────
        coords_2d, proj_labels, basis = project_centroids_to_plane(
            centroids,
            plane_normal=occ_n,
            plane_origin=occ_o,
            valid_mask=valid,
        )
        result.basis = basis

        if len(coords_2d) < 3:
            raise ValueError("Not enough projected centroids for spline fitting.")

        # ── Step 4: Split arches ──────────────────────────────────────────
        (max_xy, max_lbl), (mand_xy, mand_lbl) = split_arches(coords_2d, proj_labels)

        spline_kwargs = dict(
            n_curve_points=n_curve_points,
            smoothing=smoothing,
            degree=spline_degree,
        )

        # ── Step 5: Fit splines ───────────────────────────────────────────
        if len(max_xy) >= spline_degree + 1:
            try:
                result.maxillary = fit_arch_spline(max_xy, max_lbl, **spline_kwargs)
                result.max_curve_3d = backproject_to_3d(
                    result.maxillary.curve_xy, basis
                )
                logger.info(
                    "Maxillary arch: %d teeth, residual=%.3f mm",
                    len(max_xy), result.maxillary.fit_residual,
                )
            except Exception as exc:
                logger.warning("Maxillary spline failed: %s", exc)
        else:
            logger.info("Too few maxillary teeth (%d) for spline.", len(max_xy))

        if len(mand_xy) >= spline_degree + 1:
            try:
                result.mandibular = fit_arch_spline(mand_xy, mand_lbl, **spline_kwargs)
                result.mand_curve_3d = backproject_to_3d(
                    result.mandibular.curve_xy, basis
                )
                logger.info(
                    "Mandibular arch: %d teeth, residual=%.3f mm",
                    len(mand_xy), result.mandibular.fit_residual,
                )
            except Exception as exc:
                logger.warning("Mandibular spline failed: %s", exc)
        else:
            logger.info("Too few mandibular teeth (%d) for spline.", len(mand_xy))

    except Exception as exc:
        result.error = str(exc)
        logger.error("Arch detection failed: %s", exc)

    result.elapsed_s = round(time.perf_counter() - t0, 4)
    return result


# ---------------------------------------------------------------------------
# Convenience: load from case directory and run
# ---------------------------------------------------------------------------

def detect_arch_from_case_dir(
    case_dir: str | Path,
    num_classes: int = 33,
    **kwargs,
) -> ArchDetectionResult:
    """
    Load points + labels from a processed case directory and run arch detection.

    Expects:
        case_dir/points.npy
        case_dir/tooth_labels.npy

    Parameters
    ----------
    case_dir : path
    num_classes : int
    **kwargs : passed to detect_arch_curve

    Returns
    -------
    ArchDetectionResult
    """
    case_dir = Path(case_dir)

    pts_path = case_dir / "points.npy"
    lbl_path = case_dir / "tooth_labels.npy"

    if not pts_path.exists():
        raise FileNotFoundError(f"points.npy not found in {case_dir}")
    if not lbl_path.exists():
        raise FileNotFoundError(f"tooth_labels.npy not found in {case_dir}")

    points = np.load(pts_path).astype(np.float32)
    labels = np.load(lbl_path).astype(np.int64)

    logger.info(
        "Loaded case %s: %d points, %d unique labels",
        case_dir.name, len(points), len(np.unique(labels)),
    )

    return detect_arch_curve(points, labels, num_classes=num_classes, **kwargs)
