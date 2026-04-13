"""
meshnet.tooth_numbering — Automatic tooth numbering and missing-tooth detection.

Pipeline:
    1. extract_teeth          — Segment individual teeth from face labels
    2. arch_classifier        — Separate maxillary / mandibular
    3. tooth_sorting          — Order teeth along the arch curve
    4. fdi_assignment         — Map sorted teeth → FDI numbers
    5. missing_detection      — Detect absent FDI slots
    6. orthodontic_measurements — Clinical metrics (width, Bolton, Spee, …)

Public API
----------
>>> from meshnet.tooth_numbering import run_numbering_pipeline
>>> result = run_numbering_pipeline(vertices, faces, face_labels, occlusal_plane)
>>> result.fdi_map        # {11: ToothMesh, 12: ToothMesh, ...}
>>> result.missing        # [14, 24, 36, ...]
>>> result.measurements   # OrthodonticMeasurements
"""

from .extract_teeth import extract_teeth, ToothMesh
from .arch_classifier import classify_arches, ArchSeparation
from .tooth_sorting import sort_teeth_along_arch
from .fdi_assignment import assign_fdi_numbers, FDI_MAXILLARY, FDI_MANDIBULAR
from .missing_detection import detect_missing_teeth
from .orthodontic_measurements import compute_measurements, OrthodonticMeasurements

from dataclasses import dataclass, field
from typing import Dict, List, Optional
import numpy as np


@dataclass
class ToothNumberingResult:
    """Complete result of the tooth numbering pipeline."""
    fdi_map: Dict[int, ToothMesh]
    missing: List[int]
    measurements: OrthodonticMeasurements
    arch_separation: ArchSeparation


def run_numbering_pipeline(
    vertices: np.ndarray,
    faces: np.ndarray,
    face_labels: np.ndarray,
    occlusal_plane: np.ndarray,
    sagittal_axis: Optional[np.ndarray] = None,
    missing_threshold: float = 5.0,
) -> ToothNumberingResult:
    """
    Full tooth numbering pipeline.

    Args:
        vertices:       (V, 3) vertex array
        faces:          (F, 3) face index array
        face_labels:    (F,)   integer label per face (0 = gingiva, 1-32 = tooth)
        occlusal_plane: (4,)   plane equation [nx, ny, nz, d]
        sagittal_axis:  (3,)   anterior-posterior axis (default: [0, 1, 0])
        missing_threshold: mm distance threshold for missing-tooth detection

    Returns:
        ToothNumberingResult with fdi_map, missing, measurements, arch_separation
    """
    if sagittal_axis is None:
        sagittal_axis = np.array([0.0, 1.0, 0.0])

    # 1. Extract individual teeth
    tooth_meshes = extract_teeth(vertices, faces, face_labels)

    # 2. Classify arches
    arch_sep = classify_arches(tooth_meshes, occlusal_plane)

    # 3. Sort along arch
    upper_sorted = sort_teeth_along_arch(arch_sep.upper_teeth, sagittal_axis)
    lower_sorted = sort_teeth_along_arch(arch_sep.lower_teeth, sagittal_axis)

    # 4. FDI assignment
    fdi_map = assign_fdi_numbers(upper_sorted, lower_sorted)

    # 5. Missing detection
    missing = detect_missing_teeth(fdi_map, missing_threshold)

    # 6. Orthodontic measurements
    measurements = compute_measurements(fdi_map)

    return ToothNumberingResult(
        fdi_map=fdi_map,
        missing=missing,
        measurements=measurements,
        arch_separation=arch_sep,
    )


__all__ = [
    "run_numbering_pipeline",
    "ToothNumberingResult",
    "extract_teeth",
    "ToothMesh",
    "classify_arches",
    "ArchSeparation",
    "sort_teeth_along_arch",
    "assign_fdi_numbers",
    "FDI_MAXILLARY",
    "FDI_MANDIBULAR",
    "detect_missing_teeth",
    "compute_measurements",
    "OrthodonticMeasurements",
]
