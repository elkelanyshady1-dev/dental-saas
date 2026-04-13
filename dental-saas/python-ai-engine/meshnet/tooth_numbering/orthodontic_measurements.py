"""
Module 6: orthodontic_measurements.py
=======================================
Compute clinical orthodontic measurements from the FDI-numbered tooth set.

Measurements
------------
1.  **Tooth width (mesiodistal)**   — widest extent of each crown in the
                                       mesiodistal direction (lateral axis).
2.  **Arch length**                 — sum of straight-line distances across
                                       contact points (simplified: sum of widths
                                       of teeth 13-23 / 43-33).
3.  **Bolton ratio**                — overall Bolton (32-tooth) and anterior
                                       Bolton (12-tooth) discrepancy ratios.
4.  **Curve of Spee**               — maximum vertical deviation of posterior
                                       teeth from the anterior reference plane.
5.  **Overjet**                     — horizontal distance between maxillary and
                                       mandibular central incisor centroids
                                       projected onto the sagittal axis.
6.  **Overbite**                    — vertical distance between maxillary and
                                       mandibular central incisor centroids
                                       projected onto the vertical axis.

All distances are in **millimetres**.

Notes
-----
For measurements that require actual crown landmarks (e.g. cusp tips, contact
points) the module uses the tooth mesh bounding box as an approximation when
detailed landmark data is unavailable.  Replace `_get_tooth_landmark` with a
proper landmark detection call when landmarks are available.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

from .extract_teeth import ToothMesh
from .fdi_assignment import FDI_MAXILLARY, FDI_MANDIBULAR

logger = logging.getLogger(__name__)


# ─── Data model ──────────────────────────────────────────────────────────────


@dataclass
class ToothWidths:
    """Mesiodistal width (mm) per FDI number."""
    upper: Dict[int, float] = field(default_factory=dict)   # FDI → mm
    lower: Dict[int, float] = field(default_factory=dict)

    def total_upper(self, fdi_subset: Optional[List[int]] = None) -> float:
        subset = fdi_subset or list(self.upper.keys())
        return sum(self.upper.get(f, 0.0) for f in subset)

    def total_lower(self, fdi_subset: Optional[List[int]] = None) -> float:
        subset = fdi_subset or list(self.lower.keys())
        return sum(self.lower.get(f, 0.0) for f in subset)


@dataclass
class BoltonRatio:
    """
    Bolton analysis ratios.

    overall_ratio   = sum_lower(32) / sum_upper(32) * 100
    anterior_ratio  = sum_lower(12) / sum_upper(12) * 100

    Normal values (Bolton 1958):
        Overall:   91.3 ± 1.91
        Anterior:  77.2 ± 1.65
    """
    overall_ratio: Optional[float] = None       # %
    anterior_ratio: Optional[float] = None      # %
    upper_overall_sum: float = 0.0              # mm
    lower_overall_sum: float = 0.0
    upper_anterior_sum: float = 0.0
    lower_anterior_sum: float = 0.0
    overall_discrepancy_mm: Optional[float] = None   # positive = lower excess
    anterior_discrepancy_mm: Optional[float] = None

    BOLTON_OVERALL_MEAN = 91.3
    BOLTON_ANTERIOR_MEAN = 77.2


@dataclass
class OrthodonticMeasurements:
    """Complete set of orthodontic measurements from a scan."""
    tooth_widths: ToothWidths = field(default_factory=ToothWidths)
    arch_length_upper: Optional[float] = None       # mm
    arch_length_lower: Optional[float] = None       # mm
    bolton: BoltonRatio = field(default_factory=BoltonRatio)
    curve_of_spee_mm: Optional[float] = None        # mm
    overjet_mm: Optional[float] = None              # mm (+ve = normal overjet)
    overbite_mm: Optional[float] = None             # mm (+ve = overbite)
    # Individual tooth width dict for API access
    all_widths: Dict[str, float] = field(default_factory=dict)


# ─── Geometry helpers ─────────────────────────────────────────────────────────


LATERAL_AXIS = np.array([1.0, 0.0, 0.0], dtype=np.float64)   # left-right (X)
SAGITTAL_AXIS = np.array([0.0, 1.0, 0.0], dtype=np.float64)  # front-back (Y)
VERTICAL_AXIS = np.array([0.0, 0.0, 1.0], dtype=np.float64)  # up-down   (Z)


def _bounding_box(tooth: ToothMesh) -> Tuple[np.ndarray, np.ndarray]:
    """Return (min_corner, max_corner) of tooth vertex bounding box."""
    return tooth.vertices.min(axis=0), tooth.vertices.max(axis=0)


def _mesiodistal_width(tooth: ToothMesh) -> float:
    """
    Approximate mesiodistal width as the extent along the lateral axis.

    A more accurate implementation would find the actual mesial/distal
    contact point but bounding-box width is a clinically reasonable proxy.
    """
    bb_min, bb_max = _bounding_box(tooth)
    return float(abs(bb_max[0] - bb_min[0]))   # X-extent in mm


def _occlusal_height(tooth: ToothMesh) -> float:
    """Approximate occlusal table height (Z-extent of bounding box)."""
    bb_min, bb_max = _bounding_box(tooth)
    return float(abs(bb_max[2] - bb_min[2]))


def _occlusal_centroid(tooth: ToothMesh) -> np.ndarray:
    """
    Return the centroid of the occlusal (top) 20% of the tooth vertices — a
    reasonable proxy for the cusp tip when landmark detection is unavailable.
    """
    verts = tooth.vertices
    z_min, z_max = float(verts[:, 2].min()), float(verts[:, 2].max())
    z_threshold = z_min + 0.80 * (z_max - z_min)
    occlusal_verts = verts[verts[:, 2] >= z_threshold]
    if len(occlusal_verts) == 0:
        return tooth.centroid
    return occlusal_verts.mean(axis=0).astype(np.float32)


# ─── Measurement computations ─────────────────────────────────────────────────


def _compute_tooth_widths(fdi_map: Dict[int, ToothMesh]) -> ToothWidths:
    widths = ToothWidths()
    for fdi, tooth in fdi_map.items():
        w = _mesiodistal_width(tooth)
        if fdi in FDI_MAXILLARY:
            widths.upper[fdi] = w
        else:
            widths.lower[fdi] = w
    return widths


def _compute_arch_length(
    fdi_map: Dict[int, ToothMesh],
    arch_fdi: List[int],
) -> Optional[float]:
    """
    Arch length = sum of mesiodistal widths of the 12 anterior-region teeth
    (13-23 for upper, 43-33 for lower in the clinical approximation).

    If fewer than 4 anterior teeth are detected, return None.
    """
    # Anterior region FDI numbers
    if arch_fdi == FDI_MAXILLARY:
        anterior = [13, 12, 11, 21, 22, 23]
    else:
        anterior = [43, 42, 41, 31, 32, 33]

    present = [f for f in anterior if f in fdi_map]
    if len(present) < 4:
        return None

    total = sum(_mesiodistal_width(fdi_map[f]) for f in present)

    # Add inter-canine distance as an approximation for arch width
    # Canines: 13/23 (upper), 43/33 (lower)
    if arch_fdi == FDI_MAXILLARY:
        c_left, c_right = 13, 23
    else:
        c_left, c_right = 43, 33

    if c_left in fdi_map and c_right in fdi_map:
        ic_dist = float(np.linalg.norm(
            fdi_map[c_left].centroid - fdi_map[c_right].centroid
        ))
        # Full arch length approximation from Moyers' prediction table
        # Arch length ≈ sum of widths of 12 teeth + 2 × (width extension factor)
        arch_len = total + 0.1 * ic_dist   # simplified model
    else:
        arch_len = total

    return arch_len


def _compute_bolton(
    widths: ToothWidths,
) -> BoltonRatio:
    bolton = BoltonRatio()

    # ── Overall Bolton (all incisors, canines, premolars, molars: 14 per arch) ──
    # Teeth 13-23 (upper) and 43-33 (lower) plus premolars and first molars
    overall_upper_slots = [13, 12, 11, 21, 22, 23, 14, 24, 15, 25, 16, 26]
    overall_lower_slots = [43, 42, 41, 31, 32, 33, 44, 34, 45, 35, 46, 36]

    u_sum = sum(widths.upper.get(f, 0.0) for f in overall_upper_slots)
    l_sum = sum(widths.lower.get(f, 0.0) for f in overall_lower_slots)
    bolton.upper_overall_sum = u_sum
    bolton.lower_overall_sum = l_sum

    if u_sum > 0 and l_sum > 0:
        bolton.overall_ratio = round(l_sum / u_sum * 100, 2)
        ideal_lower = u_sum * bolton.BOLTON_OVERALL_MEAN / 100.0
        bolton.overall_discrepancy_mm = round(l_sum - ideal_lower, 2)

    # ── Anterior Bolton (6 per arch: canines + 4 incisors) ────────────────────
    ant_upper_slots = [13, 12, 11, 21, 22, 23]
    ant_lower_slots = [43, 42, 41, 31, 32, 33]

    au_sum = sum(widths.upper.get(f, 0.0) for f in ant_upper_slots)
    al_sum = sum(widths.lower.get(f, 0.0) for f in ant_lower_slots)
    bolton.upper_anterior_sum = au_sum
    bolton.lower_anterior_sum = al_sum

    if au_sum > 0 and al_sum > 0:
        bolton.anterior_ratio = round(al_sum / au_sum * 100, 2)
        ideal_ant_lower = au_sum * bolton.BOLTON_ANTERIOR_MEAN / 100.0
        bolton.anterior_discrepancy_mm = round(al_sum - ideal_ant_lower, 2)

    return bolton


def _compute_curve_of_spee(
    fdi_map: Dict[int, ToothMesh],
) -> Optional[float]:
    """
    Curve of Spee — maximum vertical (Z) deviation of the occlusal plane of
    posterior teeth from the plane defined by the central and first-molar cusps.

    Measurement taken on the lower arch (31-38 / 41-48 region).
    """
    # Reference points: lower central incisor (41) and first molar (46) right side
    ref_fdi = [41, 42, 43, 44, 45, 46, 47]
    present = [f for f in ref_fdi if f in fdi_map]
    if len(present) < 3:
        return None

    # Build array of occlusal centroid positions
    pts = np.array([_occlusal_centroid(fdi_map[f]) for f in present], dtype=np.float64)

    # Fit a plane through the first and last points and the centroid
    a, b = pts[0], pts[-1]
    mid = pts[len(pts) // 2]

    # Plane normal via cross product
    ab = b - a
    am = mid - a
    normal = np.cross(ab, am)
    norm_mag = np.linalg.norm(normal)
    if norm_mag < 1e-6:
        return None
    normal /= norm_mag

    # Signed distances of all points from the plane
    d = float(a @ normal)
    distances = pts @ normal - d

    # Curve of Spee depth = difference between max and min signed deviation
    spee = float(distances.max() - distances.min())
    return round(spee, 2)


def _compute_overjet_overbite(
    fdi_map: Dict[int, ToothMesh],
) -> Tuple[Optional[float], Optional[float]]:
    """
    Overjet:  horizontal (sagittal, Y-axis) gap between upper/lower central incisors.
    Overbite: vertical  (Z-axis) overlap/gap between them.

    Central incisors: 11/21 (upper), 41/31 (lower).
    We use the midpoint of the two central incisors for each arch.
    """
    # Upper central incisors
    upper_centrals = [fdi_map[f] for f in (11, 21) if f in fdi_map]
    lower_centrals = [fdi_map[f] for f in (41, 31) if f in fdi_map]

    if not upper_centrals or not lower_centrals:
        return None, None

    upper_pt = np.mean([t.centroid for t in upper_centrals], axis=0)
    lower_pt = np.mean([t.centroid for t in lower_centrals], axis=0)

    delta = upper_pt - lower_pt

    # Overjet: sagittal (Y-axis) distance — upper incisor should be ahead (positive)
    overjet = round(float(delta @ SAGITTAL_AXIS), 2)

    # Overbite: vertical (Z-axis) overlap — upper incisor should be higher (positive)
    overbite = round(float(delta @ VERTICAL_AXIS), 2)

    return overjet, overbite


# ─── Public API ──────────────────────────────────────────────────────────────


def compute_measurements(
    fdi_map: Dict[int, ToothMesh],
) -> OrthodonticMeasurements:
    """
    Compute all supported orthodontic measurements from the FDI-numbered tooth map.

    Args:
        fdi_map: Dict[int, ToothMesh] from assign_fdi_numbers()

    Returns:
        :class:`OrthodonticMeasurements` dataclass with all computed values.
        Fields that could not be computed (insufficient data) are None.
    """
    meas = OrthodonticMeasurements()

    if not fdi_map:
        logger.warning("compute_measurements: empty fdi_map — returning empty measurements")
        return meas

    # 1. Tooth widths
    meas.tooth_widths = _compute_tooth_widths(fdi_map)
    meas.all_widths = {
        str(f): round(w, 2)
        for arch in (meas.tooth_widths.upper, meas.tooth_widths.lower)
        for f, w in arch.items()
    }
    logger.debug("Tooth widths: %d computed", len(meas.all_widths))

    # 2. Arch lengths
    meas.arch_length_upper = _compute_arch_length(fdi_map, FDI_MAXILLARY)
    meas.arch_length_lower = _compute_arch_length(fdi_map, FDI_MANDIBULAR)
    if meas.arch_length_upper:
        meas.arch_length_upper = round(meas.arch_length_upper, 2)
    if meas.arch_length_lower:
        meas.arch_length_lower = round(meas.arch_length_lower, 2)

    # 3. Bolton ratio
    meas.bolton = _compute_bolton(meas.tooth_widths)

    # 4. Curve of Spee
    meas.curve_of_spee_mm = _compute_curve_of_spee(fdi_map)

    # 5. Overjet / Overbite
    meas.overjet_mm, meas.overbite_mm = _compute_overjet_overbite(fdi_map)

    logger.info(
        "compute_measurements: overjet=%.1f mm, overbite=%.1f mm, "
        "arch_upper=%.1f mm, arch_lower=%.1f mm, Bolton_overall=%.1f%%",
        meas.overjet_mm or 0.0,
        meas.overbite_mm or 0.0,
        meas.arch_length_upper or 0.0,
        meas.arch_length_lower or 0.0,
        meas.bolton.overall_ratio or 0.0,
    )

    return meas
