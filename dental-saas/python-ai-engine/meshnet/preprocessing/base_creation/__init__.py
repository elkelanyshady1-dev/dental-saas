"""
meshnet/preprocessing/base_creation — Preprocessing pipeline for raw STL intraoral scans.

Converts raw intraoral scans (no base) into 3D-printable dental models
with a flat base suitable for segmentation and dataset generation.

Pipeline
--------
    raw STL
      ↓  scan_trimmer        — remove floating triangles + scan artifacts
      ↓  base_plane_detector — RANSAC/PCA plane below gingival margin
      ↓  base_generator      — extrude margin → flat base polygon
      ↓  mesh_filler         — fill underside wall to make watertight
      ↓  model_normalizer    — align occlusal plane, centre, Z=0 for base
      ↓  preprocess_pipeline — full orchestration + save all intermediates

Public API
----------
    from meshnet.preprocessing.base_creation import PreprocessPipeline
    pipeline = PreprocessPipeline()
    result = pipeline.run("scan.stl", output_dir="./out/case001/")
"""

from .preprocess_pipeline import PreprocessPipeline, PreprocessResult
from .scan_trimmer import ScanTrimmer
from .base_plane_detector import BasePlaneDetector
from .base_generator import BaseGenerator
from .mesh_filler import MeshFiller
from .model_normalizer import ModelNormalizer

__all__ = [
    "PreprocessPipeline",
    "PreprocessResult",
    "ScanTrimmer",
    "BasePlaneDetector",
    "BaseGenerator",
    "MeshFiller",
    "ModelNormalizer",
]
