"""
priority_sampler.py — Weighted batch sampler for hard-case mining.

Controls the composition of each training batch so that difficult cases
appear more frequently than their natural proportion in the dataset.

Default batch composition:
    50% normal cases
    30% augmented cases
    20% hard cases

Usage:
    sampler = PrioritySampler(dataset, hard_case_ids=["case034", "case071"])
    loader  = DataLoader(dataset, batch_sampler=sampler)
"""

from __future__ import annotations

import random
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Set

import numpy as np
from torch.utils.data import Sampler, Dataset


# ---------------------------------------------------------------------------
# Batch composition defaults
# ---------------------------------------------------------------------------

DEFAULT_COMPOSITION = {
    "normal":    0.50,
    "augmented": 0.30,
    "hard":      0.20,
}


# ---------------------------------------------------------------------------
# PrioritySampler
# ---------------------------------------------------------------------------

class PrioritySampler(Sampler):
    """
    Weighted batch sampler that over-samples hard and augmented cases.

    The dataset is partitioned into three buckets:
        - hard:      cases whose path is in hard_case_ids
        - augmented: cases whose path contains 'augmented'
        - normal:    everything else

    At each epoch, batches are assembled by drawing indices from these
    buckets according to the configured composition ratios.

    Args:
        dataset:       OrthodonticDataset (or any Dataset with .samples list)
        hard_case_ids: set of case folder names/IDs that are hard cases
        batch_size:    target batch size
        composition:   dict with keys "normal", "augmented", "hard"
                       and float values summing to 1.0
        drop_last:     whether to drop the final incomplete batch
        shuffle:       whether to shuffle within each bucket each epoch
    """

    def __init__(
        self,
        dataset: Dataset,
        hard_case_ids: Optional[Set[str]] = None,
        batch_size: int = 8,
        composition: Optional[Dict[str, float]] = None,
        drop_last: bool = True,
        shuffle: bool = True,
    ):
        super().__init__(dataset)
        self.dataset = dataset
        self.batch_size = batch_size
        self.drop_last = drop_last
        self.shuffle = shuffle
        self.hard_case_ids: Set[str] = hard_case_ids or set()

        # Normalise composition
        comp = {**DEFAULT_COMPOSITION, **(composition or {})}
        total = sum(comp.values())
        self.composition = {k: v / total for k, v in comp.items()}

        # Build buckets from dataset.samples
        self._buckets = self._build_buckets()

    # ------------------------------------------------------------------
    def _build_buckets(self) -> Dict[str, List[int]]:
        """Partition dataset indices into normal / augmented / hard."""
        buckets: Dict[str, List[int]] = defaultdict(list)

        samples = getattr(self.dataset, "samples", [])
        for idx, sample_path in enumerate(samples):
            path_str = str(sample_path)
            case_name = Path(sample_path).name

            if case_name in self.hard_case_ids or path_str in self.hard_case_ids:
                buckets["hard"].append(idx)
            elif "augmented" in path_str:
                buckets["augmented"].append(idx)
            else:
                buckets["normal"].append(idx)

        # Ensure no bucket is completely empty (prevents ZeroDivisionError)
        if not buckets["hard"]:
            # Promote the 10% hardest normal cases as synthetic "hard"
            n_promote = max(1, len(buckets["normal"]) // 10)
            promoted = buckets["normal"][-n_promote:]
            buckets["hard"].extend(promoted)

        if not buckets["augmented"]:
            # Treat all normal as augmented too (they'll still appear naturally)
            buckets["augmented"].extend(buckets["normal"])

        return dict(buckets)

    def update_hard_cases(self, hard_case_ids: Set[str]) -> None:
        """Hot-reload hard case IDs without recreating the sampler."""
        self.hard_case_ids = hard_case_ids
        self._buckets = self._build_buckets()

    # ------------------------------------------------------------------
    def _n_per_type(self) -> Dict[str, int]:
        """Compute how many samples to draw per type per batch."""
        n = {}
        remaining = self.batch_size
        keys = list(self.composition.keys())
        for i, k in enumerate(keys):
            if i < len(keys) - 1:
                n[k] = max(1, round(self.composition[k] * self.batch_size))
                remaining -= n[k]
            else:
                n[k] = max(1, remaining)  # absorb rounding remainder
        return n

    # ------------------------------------------------------------------
    def __iter__(self) -> Iterator[List[int]]:
        """
        Yield batches of indices with the configured composition.
        Cycles through each bucket independently in random order.
        """
        # Shuffle each bucket
        shuffled = {}
        for k, indices in self._buckets.items():
            idx = list(indices)
            if self.shuffle:
                random.shuffle(idx)
            # Make infinite cycle for the batch assembly loop
            shuffled[k] = idx

        n_per_type = self._n_per_type()

        # Determine total batches based on normal bucket (largest)
        n_normal = len(self._buckets.get("normal", []))
        n_normal_per_batch = n_per_type.get("normal", 1)
        n_batches = n_normal // n_normal_per_batch
        if not self.drop_last and n_normal % n_normal_per_batch:
            n_batches += 1

        # Cyclic iterators
        from itertools import cycle
        iters = {k: cycle(v) for k, v in shuffled.items()}

        for _ in range(n_batches):
            batch = []
            for bucket_key, count in n_per_type.items():
                it = iters.get(bucket_key)
                if it is not None:
                    for _ in range(count):
                        batch.append(next(it))

            if len(batch) == self.batch_size or not self.drop_last:
                random.shuffle(batch)  # mix types within batch
                yield batch

    def __len__(self) -> int:
        n_normal = len(self._buckets.get("normal", []))
        n_normal_per_batch = max(1, round(self.composition["normal"] * self.batch_size))
        return n_normal // n_normal_per_batch

    def summary(self) -> Dict[str, int]:
        """Return bucket sizes for logging."""
        return {k: len(v) for k, v in self._buckets.items()}
