"""
meshnet — Mesh-based neural analysis modules for orthodontic AI.

Submodules:
    gingiva_detection        — Automatic gingival margin detection from dental meshes
    tooth_numbering          — FDI tooth numbering, missing detection, and orthodontic measurements
    coarse_segmentation      — Stage 1: binary tooth vs. gingiva coarse classification (PointNet++)
    patch_learning           — Stage 2: local patch extraction, PointNet instance segmentation, patch merge
    landmarks                — Stage 3: cusp/incisal landmark detection, head, refinement
"""

