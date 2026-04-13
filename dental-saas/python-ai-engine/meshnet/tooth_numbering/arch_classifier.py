"""
Module 2: arch_classifier.py
=============================
Separate maxillary (upper) and mandibular (lower) teeth using the
occlusal plane as the separating boundary.

Decision rule
-------------
    centroid · n + d > 0  →  maxillary (upper jaw)
    centroid · n + d ≤ 0  →  mandibular (lower jaw)

where [n, d] = occlusal_plane parameter vector (plane equation n·x = -d).

In clinical dental scans the occlusal plane is defined so that the normal
points *toward* the maxillary arch, which is the convention this module assumes.
If the plane is provided in the opposite orientation the classifier will simply
swap arches — the `flip_if_wrong` heuristic corrects this by checking which
group has more teeth in the superior (high-Z) position.

Output
------
:class:`ArchSeparation` dataclass:
    upper_teeth: List[ToothMesh]   — maxillary (FDI 11-28)
    lower_teeth: List[ToothMesh]   — mandibular (FDI 31-48)
    is_flipped:  bool              — True if plane direction was corrected
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import numpy as np

from .extract_teeth import ToothMesh

logger = logging.getLogger(__name__)


# ─── Data model ──────────────────────────────────────────────────────────────


@dataclass
class ArchSeparation:
    """
    Result of maxillary / mandibular classification.

    Attributes:
        upper_teeth:  tooth meshes assigned to the maxillary arch
        lower_teeth:  tooth meshes assigned to the mandibular arch
        plane:        (4,) occlusal plane as used (possibly sign-corrected)
        is_flipped:   True if the input plane normal was inverted
        unclassified: teeth that could not be confidently placed (very close to plane)
    """
    upper_teeth: List[ToothMesh] = field(default_factory=list)
    lower_teeth: List[ToothMesh] = field(default_factory=list)
    plane: np.ndarray = field(default_factory=lambda: np.zeros(4))
    is_flipped: bool = False
    unclassified: List[ToothMesh] = field(default_factory=list)

    def __repr__(self) -> str:
        return (
            f"ArchSeparation(upper={len(self.upper_teeth)}, "
            f"lower={len(self.lower_teeth)}, "
            f"unclassified={len(self.unclassified)}, "
            f"flipped={self.is_flipped})"
        )


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _signed_distance_to_plane(
    points: np.ndarray,   # (N, 3)
    plane: np.ndarray,    # (4,) [nx, ny, nz, d]
) -> np.ndarray:
    """
    Signed distance from each point to the plane  n · x + d = 0.

    Positive values are on the side the normal points toward.
    """
    n = plane[:3]
    d = plane[3]
    norm = np.linalg.norm(n)
    if norm < 1e-8:
        raise ValueError("Occlusal plane normal has near-zero magnitude")
    n_unit = n / norm
    return points @ n_unit + d / norm


def _centroid_of_teeth(teeth: List[ToothMesh]) -> Optional[np.ndarray]:
    """Mean of tooth centroids, or None if list is empty."""
    if not teeth:
        return None
    return np.mean([t.centroid for t in teeth], axis=0)


# ─── Public API ──────────────────────────────────────────────────────────────

AMBIGUITY_MARGIN_MM = 2.0  # Teeth within ±2 mm of plane are "ambiguous"


def classify_arches(
    tooth_meshes: List[ToothMesh],
    occlusal_plane: np.ndarray,
    ambiguity_margin: float = AMBIGUITY_MARGIN_MM,
    auto_flip: bool = True,
) -> ArchSeparation:
    """
    Separate tooth meshes into maxillary and mandibular groups.

    Args:
        tooth_meshes:     list of extracted ToothMesh objects
        occlusal_plane:   (4,) plane equation [nx, ny, nz, d]
                          where n·x + d = 0 defines the plane surface.
                          Positive side → maxillary.
        ambiguity_margin: signed-distance band around the plane (mm) — teeth
                          inside this band are placed in `unclassified` and
                          then reassigned to the closer arch.
        auto_flip:        if True, auto-correct sign of plane normal when the
                          inferred upper group appears physically lower than the
                          lower group (scan coordinate systems vary by scanner).

    Returns:
        :class:`ArchSeparation`
    """
    if len(tooth_meshes) == 0:
        logger.warning("classify_arches: empty tooth list")
        return ArchSeparation()

    plane = np.asarray(occlusal_plane, dtype=np.float64)
    if plane.shape != (4,):
        raise ValueError(f"occlusal_plane must be (4,), got {plane.shape}")

    centroids = np.array([t.centroid for t in tooth_meshes], dtype=np.float64)
    distances = _signed_distance_to_plane(centroids, plane)

    upper: List[ToothMesh] = []
    lower: List[ToothMesh] = []
    ambiguous: List[Tuple[ToothMesh, float]] = []

    for tooth, dist in zip(tooth_meshes, distances):
        if dist > ambiguity_margin:
            upper.append(tooth)
        elif dist < -ambiguity_margin:
            lower.append(tooth)
        else:
            ambiguous.append((tooth, dist))

    # Resolve ambiguous teeth by sign of their distance
    for tooth, dist in ambiguous:
        if dist >= 0:
            upper.append(tooth)
        else:
            lower.append(tooth)

    # ── Auto-flip heuristic ───────────────────────────────────────────────────
    # In clinical scans, Z-axis typically points superiorly (toward the skull).
    # If the "upper" group has a lower mean Z than the "lower" group,
    # the plane normal is inverted — swap the groups and record the flip.
    is_flipped = False
    if auto_flip and upper and lower:
        mean_z_upper = np.mean([t.centroid[2] for t in upper])
        mean_z_lower = np.mean([t.centroid[2] for t in lower])
        if mean_z_upper < mean_z_lower:
            logger.info(
                "classify_arches: auto-flipping plane (upper Z=%.1f < lower Z=%.1f)",
                mean_z_upper,
                mean_z_lower,
            )
            upper, lower = lower, upper
            plane = -plane           # flip plane sign
            is_flipped = True

    logger.info(
        "classify_arches: upper=%d, lower=%d, ambiguous resolved into arches",
        len(upper),
        len(lower),
    )

    return ArchSeparation(
        upper_teeth=upper,
        lower_teeth=lower,
        plane=plane.astype(np.float32),
        is_flipped=is_flipped,
        unclassified=[],   # All ambiguous teeth were resolved
    )
