"""
meshnet.coarse_segmentation
===========================
Stage 1 of the two-stage segmentation pipeline.

Provides binary tooth vs. gingiva coarse classification using
a lightweight PointNet++ backbone with geodesic features.

Public API:
    CoarseMeshNet       — PyTorch model
    CoarseDataset       — dataset wrapper
    run_coarse_inference — single-scan inference helper
"""
from .coarse_meshnet import CoarseMeshNet, run_coarse_inference  # noqa: F401
