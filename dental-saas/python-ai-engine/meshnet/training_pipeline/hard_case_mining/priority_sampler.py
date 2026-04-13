"""
priority_sampler.py — Priority-weighted batch sampler for curriculum hard cases.

The CurriculumPrioritySampler wraps a PyTorch Dataset and biases sampling
toward hard cases using difficulty scores from CurriculumHardCaseDetector.

Algorithm
---------
    • Start with uniform weights for all cases.
    • After hard case detection, multiply weights of hard cases by hard_weight.
    • Normalise weights to a probability distribution.
    • Sample batch indices using weighted random sampling (with replacement).

This biases ∼3× more samples toward hard cases while still visiting all cases.

Usage
-----
    sampler = CurriculumPrioritySampler(
        dataset=dataset,
        hard_case_ids={"case001", "case042"},
        hard_weight=3.0,
        batch_size=8,
    )
    loader = DataLoader(dataset, batch_sampler=sampler)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterator, List, Optional, Set

import numpy as np
from torch.utils.data import Dataset, Sampler

logger = logging.getLogger(__name__)


class CurriculumPrioritySampler(Sampler):
    """
    Priority-weighted batch sampler for hard-case curriculum training.

    Parameters
    ----------
    dataset       : Dataset
    hard_case_ids : set of str — case IDs to up-weight
    hard_weight   : float — multiplier for hard case sampling probability
    batch_size    : int
    n_batches     : int   — batches per epoch  (None = len(dataset)/batch_size)
    drop_last     : bool
    seed          : int, optional
    """

    def __init__(
        self,
        dataset: Dataset,
        hard_case_ids: Optional[Set[str]] = None,
        hard_weight: float = 3.0,
        batch_size: int = 8,
        n_batches: Optional[int] = None,
        drop_last: bool = True,
        seed: Optional[int] = None,
    ) -> None:
        super().__init__(dataset)
        self.dataset = dataset
        self.hard_case_ids = hard_case_ids or set()
        self.hard_weight = hard_weight
        self.batch_size = batch_size
        self.drop_last = drop_last
        self._rng = np.random.default_rng(seed)

        self._weights = self._build_weights()

        if n_batches is None:
            n_batches = max(1, len(dataset) // batch_size)
        self.n_batches = n_batches

    # ── Weight computation ─────────────────────────────────────────────────

    def _build_weights(self) -> np.ndarray:
        """Build normalised sampling weights over dataset indices."""
        n = len(self.dataset)
        weights = np.ones(n, dtype=np.float64)

        # Up-weight hard cases
        if self.hard_case_ids:
            for i in range(n):
                case_id = self._case_id_at(i)
                if case_id in self.hard_case_ids:
                    weights[i] *= self.hard_weight

        # Normalise
        weights /= weights.sum()
        return weights

    def _case_id_at(self, idx: int) -> str:
        """Try to get case ID string from dataset item at index."""
        try:
            if hasattr(self.dataset, "samples"):
                return Path(self.dataset.samples[idx]).name
            if hasattr(self.dataset, "case_ids"):
                return self.dataset.case_ids[idx]
        except (IndexError, AttributeError):
            pass
        return str(idx)

    # ── Sampler API ────────────────────────────────────────────────────────

    def __iter__(self) -> Iterator[List[int]]:
        n = len(self.dataset)
        for _ in range(self.n_batches):
            batch = self._rng.choice(
                n,
                size=self.batch_size,
                replace=True,
                p=self._weights,
            ).tolist()
            yield batch

    def __len__(self) -> int:
        return self.n_batches

    # ── Hot-update ────────────────────────────────────────────────────────

    def update_hard_cases(self, new_hard_case_ids: Set[str]) -> None:
        """
        Update hard case IDs without rebuilding the DataLoader.

        Call this after each hard-mining step.
        """
        old_n = len(self.hard_case_ids)
        self.hard_case_ids = new_hard_case_ids
        self._weights = self._build_weights()
        logger.info(
            "CurriculumPrioritySampler: hard cases updated %d → %d",
            old_n, len(new_hard_case_ids),
        )

    def get_sampling_stats(self) -> dict:
        """Return statistics about current sampling weights."""
        n = len(self.dataset)
        hard_count = sum(
            1 for i in range(n) if self._case_id_at(i) in self.hard_case_ids
        )
        expected_hard = float(self._weights[
            [i for i in range(n) if self._case_id_at(i) in self.hard_case_ids]
        ].sum()) if hard_count > 0 else 0.0

        return {
            "n_total": n,
            "n_hard": hard_count,
            "hard_weight": self.hard_weight,
            "expected_hard_fraction": round(expected_hard, 4),
            "batch_size": self.batch_size,
            "n_batches_per_epoch": self.n_batches,
        }
