"""
meshnet/gingiva_detection — Automatic gingival margin detection from dental meshes.

Pipeline:
    curvature_analysis.py   → per-vertex PCA curvature
    valley_detection.py     → concave valley score
    gingival_margin.py      → margin candidate vertices + region growing
    gingiva_classifier.py   → flood-fill tooth/gingiva vertex labels → face labels

Public API
----------
    from meshnet.gingiva_detection import detect_gingival_margin, classify_gingiva

    face_labels, margin_verts, meta = detect_gingival_margin(mesh)
    # face_labels: (F,) int  0=gingiva 1=tooth
    # margin_verts: list[int] vertex indices on the margin curve
    # meta: dict with curvature/valley stats
"""

from .curvature_analysis import compute_vertex_curvature
from .valley_detection import compute_valley_score
from .gingival_margin import detect_gingival_margin_vertices, laplacian_smooth_mask
from .gingiva_classifier import classify_gingiva_faces, detect_gingival_margin

__all__ = [
    "compute_vertex_curvature",
    "compute_valley_score",
    "detect_gingival_margin_vertices",
    "laplacian_smooth_mask",
    "classify_gingiva_faces",
    "detect_gingival_margin",
]
