"""patch_generation — Geodesic patch extraction and selection."""
from .patch_generator import CurriculumPatchGenerator, CurriculumPatch
from .patch_selector import PatchSelector, PatchSelectionMode

__all__ = [
    "CurriculumPatchGenerator",
    "CurriculumPatch",
    "PatchSelector",
    "PatchSelectionMode",
]
