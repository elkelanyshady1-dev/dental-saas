"""
meshnet.landmarks
=================
Stage 3 of the two-stage segmentation pipeline — dental landmark detection.

Detects clinically relevant landmarks:
    • Cusp tips
    • Incisal edges
    • Central grooves
    • Mesial contact points
    • Distal contact points

Public API:
    LandmarkHead        — PyTorch landmark probability head
    CuspDetector        — geometry-based cusp/peak finder
    LandmarkRefinement  — surface-fitting refinement
    LandmarkDataset     — dataset wrapper for landmark training
"""
from .landmark_head import LandmarkHead, LandmarkType    # noqa: F401
from .cusp_detection import CuspDetector, detect_cusps   # noqa: F401
from .landmark_refinement import LandmarkRefinement       # noqa: F401
