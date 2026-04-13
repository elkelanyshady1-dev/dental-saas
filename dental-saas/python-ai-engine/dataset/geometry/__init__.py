"""
dataset/geometry — Geometric analysis utilities for orthodontic point clouds.

Modules:
    boundary_detection   — Detect tooth–gingiva boundary points via KDTree
    curvature_estimation — Per-point PCA-based curvature estimation
"""

from .boundary_detection import detect_boundary_points
from .curvature_estimation import estimate_curvature

__all__ = ["detect_boundary_points", "estimate_curvature"]
