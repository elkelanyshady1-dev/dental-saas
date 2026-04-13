"""
Module 5: missing_detection.py
================================
Detect missing teeth by comparing the detected FDI tooth map against the
complete set of expected FDI slots.

Detection logic
---------------
A tooth slot is declared **missing** when no detected centroid falls within
``threshold_mm`` of the expected arch position for that slot.

Expected arch positions are interpolated from the detected teeth using a
smooth arch curve (cubic spline through detected centroids in lateral–sagittal
space). This avoids false-positives caused by arch shape variations (e.g. very
narrow or expanded arches).

Output
------
    missing_teeth:   List[int]  — FDI numbers with no detected tooth
    present_teeth:   List[int]  — FDI numbers with a detected tooth
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

import numpy as np

from .extract_teeth import ToothMesh
from .fdi_assignment import (
    FDI_MAXILLARY,
    FDI_MANDIBULAR,
    _MAXILLARY_POSITIONS,
    _MANDIBULAR_POSITIONS,
)

logger = logging.getLogger(__name__)

ALL_FDI_SLOTS: List[int] = FDI_MAXILLARY + FDI_MANDIBULAR

# ─── Arch-curve estimation ────────────────────────────────────────────────────


def _interpolate_arch_position(
    detected_fdi: List[int],
    detected_centroids: np.ndarray,   # (N, 3)
    query_fdi: int,
    fdi_slots: List[int],
    slot_positions: np.ndarray,       # (M,) normalised 0-1
) -> Optional[np.ndarray]:
    """
    Interpolate the expected 3-D position of a missing FDI slot from
    the detected neighbouring teeth's positions using 1-D interpolation
    along the arch axis.

    Returns the expected centroid (3,) or None if not enough data.
    """
    # Build detected_fdi → normalised position map
    det_pos = np.array(
        [slot_positions[fdi_slots.index(f)] for f in detected_fdi],
        dtype=np.float64,
    )
    query_pos = slot_positions[fdi_slots.index(query_fdi)]

    if len(detected_fdi) < 2:
        return None  # Cannot interpolate without at least two anchors

    # Sort by position
    order = np.argsort(det_pos)
    det_pos_sorted = det_pos[order]
    det_centroids_sorted = detected_centroids[order]  # (N, 3)

    # Per-axis linear interpolation
    expected = np.array([
        np.interp(query_pos, det_pos_sorted, det_centroids_sorted[:, axis])
        for axis in range(3)
    ], dtype=np.float32)

    return expected


# ─── Core detector ───────────────────────────────────────────────────────────


def detect_missing_teeth(
    fdi_map: Dict[int, ToothMesh],
    threshold_mm: float = 5.0,
    check_upper: bool = True,
    check_lower: bool = True,
    exclude_wisdom_teeth: bool = False,
) -> List[int]:
    """
    Identify FDI slots that have no corresponding detected tooth.

    Args:
        fdi_map:            dict { fdi_number: ToothMesh } from assign_fdi_numbers
        threshold_mm:       maximum centroid-to-expected distance (mm) to be
                            considered "present".  Slots whose interpolated expected
                            position is more than this distance from the nearest
                            detected tooth are declared missing.
                            Set to ``np.inf`` to use simple presence/absence only.
        check_upper:        include maxillary slots in check
        check_lower:        include mandibular slots in check
        exclude_wisdom_teeth: if True, skip FDI numbers 18, 28, 38, 48 (third molars)

    Returns:
        List of FDI numbers that are missing, sorted numerically.
    """
    WISDOM_TEETH = {18, 28, 38, 48}

    slots_to_check: List[int] = []
    if check_upper:
        slots_to_check.extend(FDI_MAXILLARY)
    if check_lower:
        slots_to_check.extend(FDI_MANDIBULAR)

    if exclude_wisdom_teeth:
        slots_to_check = [s for s in slots_to_check if s not in WISDOM_TEETH]

    missing: List[int] = []
    present_fdi = set(fdi_map.keys())

    # ── Simple presence/absence first ────────────────────────────────────────
    # Any slot not in fdi_map is a candidate for "missing"
    candidate_missing = [s for s in slots_to_check if s not in present_fdi]

    if threshold_mm == np.inf or not candidate_missing:
        missing = sorted(candidate_missing)
        _log_result(missing, present_fdi, slots_to_check)
        return missing

    # ── Distance-based refinement ─────────────────────────────────────────────
    # Partition detected teeth into upper and lower for interpolation
    upper_detected = {f: m for f, m in fdi_map.items() if f in FDI_MAXILLARY}
    lower_detected = {f: m for f, m in fdi_map.items() if f in FDI_MANDIBULAR}

    for slot in candidate_missing:
        in_upper = slot in FDI_MAXILLARY
        arch_detected = upper_detected if in_upper else lower_detected
        fdi_slots_arch = FDI_MAXILLARY if in_upper else FDI_MANDIBULAR
        slot_positions = _MAXILLARY_POSITIONS if in_upper else _MANDIBULAR_POSITIONS

        if not arch_detected:
            # No detected teeth in this arch at all → definitely missing
            missing.append(slot)
            continue

        detected_fdi_list = list(arch_detected.keys())
        detected_centroids = np.array(
            [arch_detected[f].centroid for f in detected_fdi_list],
            dtype=np.float64,
        )

        expected_pos = _interpolate_arch_position(
            detected_fdi_list,
            detected_centroids,
            slot,
            fdi_slots_arch,
            slot_positions,
        )

        if expected_pos is None:
            # Cannot interpolate — treat as missing conservatively
            missing.append(slot)
            continue

        # Distance from expected position to nearest detected centroid
        dists = np.linalg.norm(detected_centroids - expected_pos, axis=1)
        min_dist = float(dists.min())

        if min_dist > threshold_mm:
            missing.append(slot)
        else:
            logger.debug(
                "FDI %d: nearest detected tooth %.1f mm (threshold %.1f mm) — NOT missing",
                slot,
                min_dist,
                threshold_mm,
            )

    missing_sorted = sorted(missing)
    _log_result(missing_sorted, present_fdi, slots_to_check)
    return missing_sorted


def _log_result(
    missing: List[int],
    present_fdi: set,
    slots_to_check: List[int],
) -> None:
    present_checked = [s for s in slots_to_check if s in present_fdi]
    logger.info(
        "detect_missing_teeth: present=%d, missing=%d | missing FDIs=%s",
        len(present_checked),
        len(missing),
        missing if len(missing) <= 10 else f"{missing[:10]}… ({len(missing)} total)",
    )


# ─── Result serialisation ─────────────────────────────────────────────────────


def build_teeth_status_dict(
    fdi_map: Dict[int, ToothMesh],
    missing_list: List[int],
    check_upper: bool = True,
    check_lower: bool = True,
    exclude_wisdom_teeth: bool = False,
) -> Dict[str, str]:
    """
    Build the API-ready status dictionary.

    Returns:
        { "11": "present", "12": "present", "14": "missing", ... }

    Covers all expected FDI slots for the requested arches.
    """
    WISDOM_TEETH = {18, 28, 38, 48}
    slots: List[int] = []
    if check_upper:
        slots.extend(FDI_MAXILLARY)
    if check_lower:
        slots.extend(FDI_MANDIBULAR)
    if exclude_wisdom_teeth:
        slots = [s for s in slots if s not in WISDOM_TEETH]

    missing_set = set(missing_list)
    status: Dict[str, str] = {}
    for s in sorted(slots):
        status[str(s)] = "missing" if s in missing_set else "present"
    return status
