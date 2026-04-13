"""
Module 4: fdi_assignment.py
============================
Map arch-sorted tooth meshes to FDI (Fédération Dentaire Internationale)
tooth numbers.

FDI Two-Digit System
--------------------
The FDI system uses a two-digit code:
    First digit  = quadrant  (1=upper-right, 2=upper-left, 3=lower-left, 4=lower-right)
    Second digit = position  (1=central incisor, 8=third molar)

Full arch sequences (mesial → distal):

    Maxillary (upper), right → left:
        18  17  16  15  14  13  12  11 │ 21  22  23  24  25  26  27  28

    Mandibular (lower), right → left:
        48  47  46  45  44  43  42  41 │ 31  32  33  34  35  36  37  38

Assignment strategy
-------------------
Given N arch-sorted teeth and 16 FDI slots (per arch), we map each detected
tooth to the *closest* available FDI slot position using a minimum-cost matching
(Hungarian / linear-sum assignment algorithm).

The matching is position-based: the FDI slot coordinate is estimated from the
expected arch anatomy and mapped to the actual detected centroids.  This handles
sparse arches (missing teeth do not shift numbering of the remaining teeth).

Output
------
Dict[int, ToothMesh] — mapping from FDI number to tooth mesh.
Only detected teeth are included (missing teeth are identified separately
by `missing_detection.py`).
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

import numpy as np

from .extract_teeth import ToothMesh

logger = logging.getLogger(__name__)

# ─── FDI Slot Definitions ────────────────────────────────────────────────────

FDI_MAXILLARY: List[int] = [
    18, 17, 16, 15, 14, 13, 12, 11,   # Upper right → upper left
    21, 22, 23, 24, 25, 26, 27, 28,
]

FDI_MANDIBULAR: List[int] = [
    48, 47, 46, 45, 44, 43, 42, 41,   # Lower right → lower left
    31, 32, 33, 34, 35, 36, 37, 38,
]

# Relative arch positions for each slot (0.0 = right end, 1.0 = left end)
# These encode expected mesio-distal position across a uniform arch model.
# Position spacing reflects that molars occupy ~2× more arch space than incisors.
#
# Maxillary: 16 slots, positions derived from average arch-length proportions.
_MAXILLARY_POSITIONS = np.array([
    0.00, 0.07, 0.14, 0.20, 0.26, 0.32, 0.38, 0.43,   # 18→11
    0.57, 0.62, 0.68, 0.74, 0.80, 0.86, 0.93, 1.00,   # 21→28
], dtype=np.float64)

_MANDIBULAR_POSITIONS = np.array([
    0.00, 0.07, 0.14, 0.20, 0.26, 0.32, 0.38, 0.43,   # 48→41
    0.57, 0.62, 0.68, 0.74, 0.80, 0.86, 0.93, 1.00,   # 31→38
], dtype=np.float64)


# ─── Hungarian-based matching ────────────────────────────────────────────────


def _linear_sum_assignment(cost_matrix: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    Thin wrapper around scipy linear_sum_assignment (Hungarian algorithm).
    Falls back to greedy nearest-neighbour if scipy is unavailable.
    """
    try:
        from scipy.optimize import linear_sum_assignment as _lsa
        row_ind, col_ind = _lsa(cost_matrix)
        return row_ind, col_ind
    except ImportError:
        # Greedy fallback — acceptable for ≤32 teeth
        n_rows, n_cols = cost_matrix.shape
        row_ind, col_ind = [], []
        used_cols: set = set()
        for r in range(n_rows):
            best_c = -1
            best_cost = np.inf
            for c in range(n_cols):
                if c not in used_cols and cost_matrix[r, c] < best_cost:
                    best_cost = cost_matrix[r, c]
                    best_c = c
            if best_c >= 0:
                row_ind.append(r)
                col_ind.append(best_c)
                used_cols.add(best_c)
        return np.array(row_ind), np.array(col_ind)


def _teeth_to_arch_positions(teeth: List[ToothMesh]) -> np.ndarray:
    """
    Convert tooth centroid positions to normalized [0, 1] arch positions.

    The arch coordinate is the projection of each centroid onto the lateral
    (left-right) axis, normalized so that the rightmost tooth is 0.0 and the
    leftmost is 1.0.

    Returns:
        (N,) float array of normalized arch positions
    """
    if not teeth:
        return np.array([])
    # Use X-coordinate as proxy for lateral position (most common convention)
    x_coords = np.array([t.centroid[0] for t in teeth], dtype=np.float64)
    x_min, x_max = x_coords.min(), x_coords.max()
    span = x_max - x_min
    if span < 1e-6:
        # All teeth share the same X → uniformly space them
        return np.linspace(0.0, 1.0, len(teeth))
    normalized = (x_coords - x_min) / span
    return normalized   # 0 = rightmost, already sorted right→left from sort step


def _match_teeth_to_slots(
    teeth: List[ToothMesh],
    fdi_slots: List[int],
    slot_positions: np.ndarray,
) -> Dict[int, ToothMesh]:
    """
    Match detected teeth to FDI slots using minimum-cost position assignment.

    Cost = |tooth_arch_position - slot_position|

    Args:
        teeth:          N arch-sorted teeth
        fdi_slots:      16 FDI slot numbers for this arch
        slot_positions: (16,) normalized arch positions for each slot

    Returns:
        dict { fdi_number: tooth_mesh }
    """
    if not teeth:
        return {}

    N = len(teeth)
    M = len(fdi_slots)

    tooth_positions = _teeth_to_arch_positions(teeth)  # (N,)
    cost_matrix = np.abs(
        tooth_positions[:, np.newaxis] - slot_positions[np.newaxis, :]
    )  # (N, M)

    # We have N teeth and M slots; N ≤ M usually (missing teeth)
    row_ind, col_ind = _linear_sum_assignment(cost_matrix)

    fdi_map: Dict[int, ToothMesh] = {}
    for r, c in zip(row_ind, col_ind):
        if r < N and c < M:
            fdi_number = fdi_slots[c]
            tooth = teeth[r]
            tooth.fdi = fdi_number
            fdi_map[fdi_number] = tooth

    return fdi_map


# ─── Public API ──────────────────────────────────────────────────────────────


def assign_fdi_numbers(
    upper_sorted: List[ToothMesh],
    lower_sorted: List[ToothMesh],
) -> Dict[int, ToothMesh]:
    """
    Assign FDI numbers to arch-sorted teeth from both arches.

    Args:
        upper_sorted: maxillary teeth in arch order (right → left)
        lower_sorted: mandibular teeth in arch order (right → left)

    Returns:
        Dict[int, ToothMesh] mapping every detected FDI number to its mesh.
        Detected teeth receive their FDI number as `.fdi` attribute.
    """
    upper_map = _match_teeth_to_slots(
        upper_sorted, FDI_MAXILLARY, _MAXILLARY_POSITIONS
    )
    lower_map = _match_teeth_to_slots(
        lower_sorted, FDI_MANDIBULAR, _MANDIBULAR_POSITIONS
    )

    combined = {**upper_map, **lower_map}

    logger.info(
        "assign_fdi_numbers: %d upper + %d lower = %d total assigned",
        len(upper_map),
        len(lower_map),
        len(combined),
    )

    return combined


def get_quadrant(fdi: int) -> int:
    """Return FDI quadrant (1-4) for a given FDI number."""
    return fdi // 10


def get_position(fdi: int) -> int:
    """Return FDI position (1-8) for a given FDI number."""
    return fdi % 10


def fdi_to_universal(fdi: int) -> Optional[int]:
    """
    Convert FDI number to Universal (Palmer) numbering (1-32).
    Returns None for unrecognised FDI numbers.
    """
    mapping = {
        # Upper right
        18: 1, 17: 2, 16: 3, 15: 4, 14: 5, 13: 6, 12: 7, 11: 8,
        # Upper left
        21: 9, 22: 10, 23: 11, 24: 12, 25: 13, 26: 14, 27: 15, 28: 16,
        # Lower left
        31: 17, 32: 18, 33: 19, 34: 20, 35: 21, 36: 22, 37: 23, 38: 24,
        # Lower right
        41: 25, 42: 26, 43: 27, 44: 28, 45: 29, 46: 30, 47: 31, 48: 32,
    }
    return mapping.get(fdi)
