"""
patch_selector.py — Patch selection strategies for curriculum training.

Given a pool of extracted patches, PatchSelector applies a selection
strategy to determine which ones to include in training batches.

Strategies
----------
    ALL        — use all patches
    RANDOM     — random subsample of N patches
    BOUNDARY   — prioritise boundary patches (is_boundary_patch=True)
    HARD       — prioritise patches with more tooth classes (harder geometry)
    MIXED      — 50% boundary + 50% random from remaining

Usage
-----
    selector = PatchSelector(mode=PatchSelectionMode.BOUNDARY, max_patches=32)
    selected = selector.select(patches)
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import List, Optional

import numpy as np

from .patch_generator import CurriculumPatch

logger = logging.getLogger(__name__)


class PatchSelectionMode(str, Enum):
    ALL      = "all"
    RANDOM   = "random"
    BOUNDARY = "boundary"
    HARD     = "hard"
    MIXED    = "mixed"


class PatchSelector:
    """
    Selects patches from a pool using a specified strategy.

    Parameters
    ----------
    mode        : PatchSelectionMode
    max_patches : int — maximum patches to return (None = unlimited)
    seed        : int, optional
    """

    def __init__(
        self,
        mode: PatchSelectionMode = PatchSelectionMode.MIXED,
        max_patches: Optional[int] = 32,
        seed: Optional[int] = None,
    ) -> None:
        self.mode = mode
        self.max_patches = max_patches
        self._rng = np.random.default_rng(seed)

    def select(self, patches: List[CurriculumPatch]) -> List[CurriculumPatch]:
        """Select patches from pool according to the current mode."""
        if not patches:
            return []

        if self.mode == PatchSelectionMode.ALL:
            selected = patches

        elif self.mode == PatchSelectionMode.RANDOM:
            selected = self._random_select(patches, self.max_patches or len(patches))

        elif self.mode == PatchSelectionMode.BOUNDARY:
            selected = self._boundary_priority(patches)

        elif self.mode == PatchSelectionMode.HARD:
            selected = self._hard_priority(patches)

        elif self.mode == PatchSelectionMode.MIXED:
            selected = self._mixed_select(patches)

        else:
            selected = patches

        if self.max_patches and len(selected) > self.max_patches:
            selected = selected[:self.max_patches]

        logger.debug(
            "PatchSelector[%s]: %d/%d patches selected",
            self.mode.value, len(selected), len(patches),
        )
        return selected

    def _random_select(
        self, patches: List[CurriculumPatch], n: int
    ) -> List[CurriculumPatch]:
        n = min(n, len(patches))
        idx = self._rng.choice(len(patches), n, replace=False)
        return [patches[i] for i in idx]

    def _boundary_priority(
        self, patches: List[CurriculumPatch]
    ) -> List[CurriculumPatch]:
        """Sort boundary patches first, then fill with random interior patches."""
        boundary = [p for p in patches if p.is_boundary_patch]
        interior = [p for p in patches if not p.is_boundary_patch]
        n_max = self.max_patches or len(patches)
        combined = boundary + interior
        return combined[:n_max]

    def _hard_priority(
        self, patches: List[CurriculumPatch]
    ) -> List[CurriculumPatch]:
        """Sort by n_tooth_classes descending (more classes = harder)."""
        sorted_patches = sorted(patches, key=lambda p: p.n_tooth_classes, reverse=True)
        n_max = self.max_patches or len(patches)
        return sorted_patches[:n_max]

    def _mixed_select(
        self, patches: List[CurriculumPatch]
    ) -> List[CurriculumPatch]:
        """50% boundary patches + 50% random from remaining."""
        n_max = self.max_patches or len(patches)
        n_boundary = n_max // 2
        n_random   = n_max - n_boundary

        boundary = [p for p in patches if p.is_boundary_patch]
        other    = [p for p in patches if not p.is_boundary_patch]

        b_sel = self._random_select(boundary, min(n_boundary, len(boundary)))
        r_sel = self._random_select(other,    min(n_random,   len(other)))

        # If one pool is smaller, fill from the other
        shortfall = n_max - len(b_sel) - len(r_sel)
        if shortfall > 0:
            remaining = [p for p in patches if p not in b_sel and p not in r_sel]
            extra = self._random_select(remaining, min(shortfall, len(remaining)))
            return b_sel + r_sel + extra

        return b_sel + r_sel
