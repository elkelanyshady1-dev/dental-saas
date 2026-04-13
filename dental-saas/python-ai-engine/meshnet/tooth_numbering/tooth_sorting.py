"""
Module 3: tooth_sorting.py
===========================
Sort teeth along the dental arch from one end to the other.

Sorting strategy
----------------
1. Project each tooth centroid onto the ``sagittal_axis`` (anterior-posterior
   direction) and the ``lateral_axis`` (left-right direction).
2. For **each half of the arch** (left / right of the midplane) sort by the
   projection along the arch curve independently, then join the two halves.

FDI-aware split
---------------
In FDI notation the arch is split at the midline:
    Maxillary:  right quadrant (18→11) ++ left quadrant (21→28)
    Mandibular: right quadrant (48→41) ++ left quadrant (31→38)

The midline is estimated as the plane perpendicular to the lateral axis passing
through the centroid of all teeth in the arch.

Output
------
A list of ToothMesh objects in arch order:
    [rightmost posterior → right anterior → left anterior → leftmost posterior]

This order exactly matches the FDI slot sequence expected by `fdi_assignment.py`.
"""

from __future__ import annotations

import logging
from typing import List, Optional

import numpy as np

from .extract_teeth import ToothMesh

logger = logging.getLogger(__name__)


# ─── Public API ──────────────────────────────────────────────────────────────


def sort_teeth_along_arch(
    teeth: List[ToothMesh],
    sagittal_axis: Optional[np.ndarray] = None,
    lateral_axis: Optional[np.ndarray] = None,
) -> List[ToothMesh]:
    """
    Order teeth along the dental arch, left-to-right from FDI perspective.

    The output order matches FDI quadrant convention:
        [ ... posterior_right → anterior_right | anterior_left → posterior_left ... ]

    This makes it straightforward to zip with the FDI slot lists in
    `fdi_assignment.py`.

    Args:
        teeth:         unsorted list of ToothMesh for one arch
        sagittal_axis: (3,) unit vector pointing anterior (default [0,1,0])
        lateral_axis:  (3,) unit vector pointing left     (default [1,0,0])

    Returns:
        sorted list, empty if input is empty
    """
    if not teeth:
        return []

    if sagittal_axis is None:
        sagittal_axis = np.array([0.0, 1.0, 0.0], dtype=np.float64)
    else:
        sagittal_axis = np.asarray(sagittal_axis, dtype=np.float64)
        sagittal_axis = sagittal_axis / (np.linalg.norm(sagittal_axis) + 1e-9)

    if lateral_axis is None:
        lateral_axis = np.array([1.0, 0.0, 0.0], dtype=np.float64)
    else:
        lateral_axis = np.asarray(lateral_axis, dtype=np.float64)
        lateral_axis = lateral_axis / (np.linalg.norm(lateral_axis) + 1e-9)

    centroids = np.array([t.centroid for t in teeth], dtype=np.float64)

    # Lateral coordinates (positive = patient's left in clinical view)
    lateral_coords = centroids @ lateral_axis
    midline_lateral = float(np.median(lateral_coords))

    # Sagittal (AP) coordinates — used as secondary sort within each half
    sagittal_coords = centroids @ sagittal_axis

    # Split: right (lateral < midline) and left (lateral >= midline)
    right_mask = lateral_coords < midline_lateral
    left_mask = ~right_mask

    right_teeth = [(teeth[i], sagittal_coords[i]) for i in range(len(teeth)) if right_mask[i]]
    left_teeth  = [(teeth[i], sagittal_coords[i]) for i in range(len(teeth)) if left_mask[i]]

    # Right quadrant: posterior → anterior = descending sagittal coord
    # (tooth 18 is most posterior, tooth 11 is most anterior)
    right_sorted = sorted(right_teeth, key=lambda x: -x[1])

    # Left quadrant: anterior → posterior = ascending sagittal coord
    # (tooth 21 is most anterior, tooth 28 is most posterior)
    left_sorted = sorted(left_teeth, key=lambda x: x[1])

    ordered = [t for t, _ in right_sorted] + [t for t, _ in left_sorted]

    logger.debug(
        "sort_teeth_along_arch: %d total (right=%d, left=%d)",
        len(ordered),
        len(right_sorted),
        len(left_sorted),
    )

    return ordered


def sort_teeth_by_coordinate(
    teeth: List[ToothMesh],
    axis: np.ndarray,
    ascending: bool = True,
) -> List[ToothMesh]:
    """
    Simple 1-D sort along a single axis vector.

    Useful for debugging or when a pre-computed arch direction is available.

    Args:
        teeth:     ToothMesh list
        axis:      (3,) direction to project onto
        ascending: sort direction

    Returns:
        sorted list
    """
    if not teeth:
        return []
    axis = np.asarray(axis, dtype=np.float64)
    axis = axis / (np.linalg.norm(axis) + 1e-9)
    projections = [float(t.centroid @ axis) for t in teeth]
    paired = sorted(zip(projections, teeth), key=lambda x: x[0], reverse=not ascending)
    return [t for _, t in paired]
