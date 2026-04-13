"""
arch_measurements.py — Clinically relevant orthodontic arch measurements.

Computes the standard set of measurements used in digital orthodontics
from the fitted dental arch spline and tooth centroids.

Measurements implemented
------------------------
1.  Arch length         — perimeter of the B-spline arch curve (mm)
2.  Intercanine width   — distance between canine centroids (mm)
3.  Intermolar width    — distance between first molar centroids (mm)
4.  Crowding index      — Bolton-style ratio of arch length / sum tooth widths
5.  Curve of Spee depth — maximum vertical deviation from a flat occlusal plane
6.  Bolton ratio        — ratio of mandibular / maxillary arch perimeters
7.  Symmetry index      — left-right centroid balance score (0=perfect)
8.  Anterior arch depth — distance from incisors to molar line

FDI numbering convention
------------------------
    Upper canines : 13, 23
    Lower canines : 33, 43
    Upper 1st molar: 16, 26
    Lower 1st molar: 36, 46

Sequential label mapping (synthetic data 1-based):
    Upper canines: labels 3, 6 (positions 3, 6 in the arch)
    Upper molars:  labels 6, 11

Dependencies
------------
    numpy >= 1.24
    scipy >= 1.10
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple

import numpy as np
from scipy.interpolate import splev

from .spline_fitting import ArchSpline

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# FDI tooth role mapping
# ---------------------------------------------------------------------------

# Maps FDI label → clinical role (for measurement lookup)
_FDI_ROLE: Dict[int, str] = {
    # Upper
    11: "upper_r_central", 21: "upper_l_central",
    12: "upper_r_lateral",  22: "upper_l_lateral",
    13: "upper_r_canine",   23: "upper_l_canine",
    14: "upper_r_pm1",      24: "upper_l_pm1",
    15: "upper_r_pm2",      25: "upper_l_pm2",
    16: "upper_r_molar1",   26: "upper_l_molar1",
    17: "upper_r_molar2",   27: "upper_l_molar2",
    18: "upper_r_molar3",   28: "upper_l_molar3",
    # Lower
    31: "lower_l_central",  41: "lower_r_central",
    32: "lower_l_lateral",  42: "lower_r_lateral",
    33: "lower_l_canine",   43: "lower_r_canine",
    34: "lower_l_pm1",      44: "lower_r_pm1",
    35: "lower_l_pm2",      45: "lower_r_pm2",
    36: "lower_l_molar1",   46: "lower_r_molar1",
    37: "lower_l_molar2",   47: "lower_r_molar2",
    38: "lower_l_molar3",   48: "lower_r_molar3",
}

# Roles used for canonical clinical measurements
_UPPER_CANINES = {13, 23}
_LOWER_CANINES = {33, 43}
_UPPER_MOLAR1  = {16, 26}
_LOWER_MOLAR1  = {36, 46}
_UPPER_CENTRAL = {11, 21}
_LOWER_CENTRAL = {31, 41}


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class ArchMeasurements:
    """
    Orthodontic measurement set for a single dental arch.

    All distances in millimetres.
    Ratios are dimensionless (0–1 or %).
    """
    arch_type: str                         # "maxillary" | "mandibular"

    # Core measurements
    arch_length_mm: Optional[float] = None         # arch perimeter
    intercanine_width_mm: Optional[float] = None   # canine-to-canine
    intermolar_width_mm: Optional[float] = None    # molar-to-molar
    curve_of_spee_depth_mm: Optional[float] = None # vertical deviation
    anterior_arch_depth_mm: Optional[float] = None # incisor offset from molar line

    # Indices
    symmetry_index: Optional[float] = None  # 0.0 = perfect, 1.0 = very asymmetric
    crowding_index: Optional[float] = None  # <0 = crowded, >0 = spaced

    # Cross-arch
    bolton_ratio: Optional[float] = None    # mand / max arch length

    # Per-tooth widths (from projection distances to neighbours)
    tooth_widths_mm: Dict[int, float] = field(default_factory=dict)

    # Detected landmark positions (2D projected)
    landmarks_2d: Dict[str, list] = field(default_factory=dict)

    # Warnings / notes
    notes: list = field(default_factory=list)

    def to_dict(self) -> dict:
        d = {
            "arch_type":             self.arch_type,
            "arch_length_mm":        self.arch_length_mm,
            "intercanine_width_mm":  self.intercanine_width_mm,
            "intermolar_width_mm":   self.intermolar_width_mm,
            "curve_of_spee_depth_mm": self.curve_of_spee_depth_mm,
            "anterior_arch_depth_mm": self.anterior_arch_depth_mm,
            "symmetry_index":        self.symmetry_index,
            "crowding_index":        self.crowding_index,
            "bolton_ratio":          self.bolton_ratio,
            "tooth_widths_mm":       {str(k): round(v, 3) for k, v in self.tooth_widths_mm.items()},
            "landmarks_2d":          self.landmarks_2d,
            "notes":                 self.notes,
        }
        # round floats
        for key, val in d.items():
            if isinstance(val, float):
                d[key] = round(val, 3)
        return d


# ---------------------------------------------------------------------------
# Measurement helpers
# ---------------------------------------------------------------------------

def _spline_arc_length(spline: ArchSpline, n_segments: int = 1000) -> float:
    """Compute arc length of spline using numerical integration."""
    t = np.linspace(0.0, 1.0, n_segments + 1)
    xy = spline.evaluate(t)   # (M+1, 2)
    diffs = np.diff(xy, axis=0)   # (M, 2)
    segment_lengths = np.linalg.norm(diffs, axis=1)
    return float(segment_lengths.sum())


def _centroid_pair_dist(
    centroids_2d: np.ndarray,
    labels: np.ndarray,
    label_a: int,
    label_b: int,
) -> Optional[float]:
    """Distance between two specific tooth centroids in 2D (mm)."""
    idx_a = np.where(labels == label_a)[0]
    idx_b = np.where(labels == label_b)[0]

    if len(idx_a) == 0 or len(idx_b) == 0:
        return None

    a = centroids_2d[idx_a[0]]
    b = centroids_2d[idx_b[0]]
    return float(np.linalg.norm(a - b))


def _find_label_2d(
    centroids_2d: np.ndarray,
    labels: np.ndarray,
    target: int,
) -> Optional[np.ndarray]:
    idx = np.where(labels == target)[0]
    if len(idx) == 0:
        return None
    return centroids_2d[idx[0]]


def _symmetry_index(centroids_2d: np.ndarray, labels: np.ndarray) -> float:
    """
    Score left-right symmetry.

    For each pair (left_tooth, right_tooth) with known FDI numbers,
    compute the absolute y-difference relative to the midline.
    Returns mean asymmetry normalised to arch width.
    """
    paired = [
        (13, 23), (14, 24), (15, 25), (16, 26),
        (33, 43), (34, 44), (35, 45), (36, 46),
    ]
    displacements = []
    for la, lb in paired:
        pa = _find_label_2d(centroids_2d, labels, la)
        pb = _find_label_2d(centroids_2d, labels, lb)
        if pa is not None and pb is not None:
            # Midline deviation: both should be symmetric about x=0
            # y-coords should match, x-coords should be equal & opposite
            asym = abs(pa[1] - pb[1])          # ideal = 0 (same occlusal depth)
            displacements.append(asym)

    if not displacements:
        return 0.0

    # Normalise by arch width
    if len(centroids_2d) > 1:
        width = centroids_2d[:, 0].max() - centroids_2d[:, 0].min()
    else:
        width = 1.0

    return float(np.mean(displacements) / (width + 1e-6))


def _curve_of_spee(
    centroids_3d: np.ndarray,
    labels: np.ndarray,
    arch_labels: set,
) -> Optional[float]:
    """
    Estimate Curve of Spee depth from 3-D centroids.

    Fits a line through the canine (13/33) and last molar (17/37)
    and returns the maximum vertical deviation of all intermediate
    teeth from that line.
    """
    mask = np.isin(labels, list(arch_labels))
    if mask.sum() < 4:
        return None

    arch_pts = centroids_3d[mask]

    # Fit the "plane" via PCA using only z and the mesial-distal axis
    # Simple approach: fit a line through the x and z columns
    x = arch_pts[:, 0]
    z = arch_pts[:, 2]

    if np.ptp(x) < 1e-6:
        return None

    # Linear fit z = a*x + b
    coeffs = np.polyfit(x, z, 1)
    z_fitted = np.polyval(coeffs, x)
    deviations = np.abs(z - z_fitted)
    return float(deviations.max())


# ---------------------------------------------------------------------------
# Main measurement function
# ---------------------------------------------------------------------------

def compute_arch_measurements(
    spline: ArchSpline,
    centroids_3d: np.ndarray,
    valid_mask: np.ndarray,
    arch_type: str = "maxillary",
    mandibular_spline: Optional[ArchSpline] = None,
) -> ArchMeasurements:
    """
    Compute all orthodontic measurements for one arch.

    Parameters
    ----------
    spline : ArchSpline
        Fitted arch spline (2D projected).
    centroids_3d : (T, 3) float
        3-D tooth centroids for all classes.
    valid_mask : (T,) bool
        Which teeth are present.
    arch_type : "maxillary" | "mandibular"
    mandibular_spline : ArchSpline or None
        Required for Bolton ratio computation.

    Returns
    -------
    ArchMeasurements
    """
    m = ArchMeasurements(arch_type=arch_type)

    labels_present = spline.sorted_labels
    centroids_2d   = spline.sorted_xy     # (K, 2)

    # ── 1. Arch length ────────────────────────────────────────────────────
    m.arch_length_mm = _spline_arc_length(spline)
    logger.debug("Arch length: %.2f mm", m.arch_length_mm)

    # ── 2. Intercanine width ──────────────────────────────────────────────
    if arch_type == "maxillary":
        cans = (13, 23)
    else:
        cans = (33, 43)

    m.intercanine_width_mm = _centroid_pair_dist(
        centroids_2d, labels_present, *cans
    )
    if m.intercanine_width_mm:
        logger.debug("Intercanine width: %.2f mm", m.intercanine_width_mm)
    else:
        m.notes.append(f"Canines not detected (labels {cans})")

    # ── 3. Intermolar width ───────────────────────────────────────────────
    if arch_type == "maxillary":
        mols = (16, 26)
    else:
        mols = (36, 46)

    m.intermolar_width_mm = _centroid_pair_dist(
        centroids_2d, labels_present, *mols
    )
    if m.intermolar_width_mm:
        logger.debug("Intermolar width: %.2f mm", m.intermolar_width_mm)
    else:
        m.notes.append(f"First molars not detected (labels {mols})")

    # ── 4. Curve of Spee ──────────────────────────────────────────────────
    all_labels = np.arange(len(centroids_3d))
    if arch_type == "maxillary":
        arch_set = set(range(11, 29))
    else:
        arch_set = set(range(31, 49))

    m.curve_of_spee_depth_mm = _curve_of_spee(
        centroids_3d, all_labels, arch_set
    )

    # ── 5. Anterior arch depth ────────────────────────────────────────────
    # Distance from central incisors (11/21 or 31/41) to molar line
    if arch_type == "maxillary":
        inc_labels = (11, 21)
        mol_labels = (16, 26)
    else:
        inc_labels = (41, 31)
        mol_labels = (46, 36)

    inc_pts = [_find_label_2d(centroids_2d, labels_present, l) for l in inc_labels]
    mol_pts = [_find_label_2d(centroids_2d, labels_present, l) for l in mol_labels]

    inc_pts = [p for p in inc_pts if p is not None]
    mol_pts = [p for p in mol_pts if p is not None]

    if inc_pts and mol_pts:
        inc_mean = np.mean(inc_pts, axis=0)
        mol_mean = np.mean(mol_pts, axis=0)
        m.anterior_arch_depth_mm = float(np.linalg.norm(inc_mean - mol_mean))

    # ── 6. Symmetry index ─────────────────────────────────────────────────
    m.symmetry_index = _symmetry_index(centroids_2d, labels_present)

    # ── 7. Crowding index (simple version) ───────────────────────────────
    # Crowding index = arch_length - sum of mesiodistal widths of all teeth
    # We estimate mesiodistal width as the distance to the nearest neighbour
    # in the arch. Negative → crowded; positive → spacing.
    if len(centroids_2d) > 1:
        diffs = np.linalg.norm(np.diff(centroids_2d, axis=0), axis=1)
        estimated_space = float(diffs.sum())
        if m.arch_length_mm:
            m.crowding_index = m.arch_length_mm - estimated_space
            if m.crowding_index < 0:
                m.notes.append(f"Crowding detected ({m.crowding_index:.1f} mm)")
            elif m.crowding_index > 5:
                m.notes.append(f"Spacing detected ({m.crowding_index:.1f} mm)")

    # ── 8. Bolton ratio (cross-arch) ──────────────────────────────────────
    if mandibular_spline is not None and arch_type == "maxillary":
        mand_len = _spline_arc_length(mandibular_spline)
        if m.arch_length_mm and m.arch_length_mm > 0:
            m.bolton_ratio = mand_len / m.arch_length_mm
            logger.debug("Bolton ratio: %.4f", m.bolton_ratio)

    # ── Collect 2D landmarks for viewer ──────────────────────────────────
    landmark_targets = {
        "canine_r": cans[0], "canine_l": cans[1],
        "molar_r":  mols[0], "molar_l":  mols[1],
    }
    for name, lbl in landmark_targets.items():
        pt = _find_label_2d(centroids_2d, labels_present, lbl)
        if pt is not None:
            m.landmarks_2d[name] = pt.tolist()

    return m


# ---------------------------------------------------------------------------
# Convenience wrapper
# ---------------------------------------------------------------------------

def compute_case_measurements(
    max_spline: Optional[ArchSpline],
    mand_spline: Optional[ArchSpline],
    centroids_3d: np.ndarray,
    valid_mask: np.ndarray,
) -> Dict[str, Optional[ArchMeasurements]]:
    """
    Compute measurements for both arches and return as a dict.

    Returns
    -------
    {
        "maxillary":  ArchMeasurements or None,
        "mandibular": ArchMeasurements or None,
    }
    """
    results: Dict[str, Optional[ArchMeasurements]] = {
        "maxillary":  None,
        "mandibular": None,
    }

    if max_spline is not None:
        results["maxillary"] = compute_arch_measurements(
            max_spline, centroids_3d, valid_mask,
            arch_type="maxillary",
            mandibular_spline=mand_spline,
        )

    if mand_spline is not None:
        results["mandibular"] = compute_arch_measurements(
            mand_spline, centroids_3d, valid_mask,
            arch_type="mandibular",
        )

    return results
