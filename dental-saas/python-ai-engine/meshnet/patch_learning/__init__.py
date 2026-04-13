"""
meshnet.patch_learning
======================
Stage 2 of the two-stage segmentation pipeline.

Provides local mesh patch generation, patch-level individual tooth
segmentation, and multi-patch prediction merging.

Public API:
    PatchGenerator  — geodesic-radius patch extraction
    PatchMeshNet    — patch segmentation model
    PatchMerger     — majority-vote merge of overlapping patches
"""
from .patch_generator import PatchGenerator, MeshPatch  # noqa: F401
from .patch_meshnet import PatchMeshNet                 # noqa: F401
from .patch_merger import PatchMerger                  # noqa: F401
