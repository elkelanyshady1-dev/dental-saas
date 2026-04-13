"""
hard_case_dataset.py — Dataset wrapper that merges normal + augmented + hard cases.

Extends OrthodonticDataset to load from multiple source directories and
expose a unified index that the PrioritySampler can work with.

Usage:
    dataset = HardCaseDataset(
        cases_dir="./datasets/cases",
        augmented_dir="./datasets/augmented",   # optional
        hard_cases_dir="./datasets/hard_cases", # optional
        mode="multitask",
        num_points=4096,
    )
    print(dataset.summary())
    # {"normal": 300, "augmented": 2400, "hard": 60, "total": 2760}
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List, Optional

import torch
from torch.utils.data import Dataset

from ..dataset_loader import OrthodonticDataset

logger = logging.getLogger(__name__)


class HardCaseDataset(Dataset):
    """
    Merged dataset from three sources:
        normal cases    → datasets/cases/
        augmented cases → datasets/augmented/
        hard cases      → datasets/hard_cases/

    Each source is loaded as an independent OrthodonticDataset.
    The unified index maps to (source_dataset, local_idx) tuples.

    The .samples list exposes all sample paths so PrioritySampler can
    classify them into buckets.
    """

    def __init__(
        self,
        cases_dir: str,
        augmented_dir: Optional[str] = None,
        hard_cases_dir: Optional[str] = None,
        mode: str = "multitask",
        num_points: int = 4096,
        augment_normal: bool = True,
        split: str = "train",
    ):
        super().__init__()
        self.mode = mode
        self.num_points = num_points

        self._sources: List[OrthodonticDataset] = []
        self._index_map: List[tuple] = []   # (source_idx, local_idx)
        self.samples: List[Path] = []       # all sample paths in order

        # --- Normal cases ---
        self._try_add_source(
            cases_dir, mode, num_points, augment=augment_normal, split=split
        )

        # --- Augmented cases ---
        if augmented_dir and Path(augmented_dir).exists():
            self._try_add_source(
                augmented_dir, mode, num_points, augment=False, split=split
            )

        # --- Hard cases ---
        if hard_cases_dir and Path(hard_cases_dir).exists():
            self._try_add_source(
                hard_cases_dir, mode, num_points, augment=True, split=split
            )

    # ------------------------------------------------------------------
    def _try_add_source(
        self,
        data_root: str,
        mode: str,
        num_points: int,
        augment: bool,
        split: str,
    ) -> None:
        """Attempt to add a dataset source; skip silently if empty."""
        try:
            ds = OrthodonticDataset(
                data_root=data_root,
                mode=mode,
                num_points=num_points,
                augment=augment,
                split=split,
            )
            src_idx = len(self._sources)
            self._sources.append(ds)
            for local_idx in range(len(ds)):
                self._index_map.append((src_idx, local_idx))
                self.samples.append(ds.samples[local_idx])
            logger.info(
                f"  Source loaded: {Path(data_root).name} "
                f"({len(ds)} samples)"
            )
        except (ValueError, FileNotFoundError) as e:
            logger.debug(f"Skipping source {data_root}: {e}")

    # ------------------------------------------------------------------
    def __len__(self) -> int:
        return len(self._index_map)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        src_idx, local_idx = self._index_map[idx]
        return self._sources[src_idx][local_idx]

    # ------------------------------------------------------------------
    def summary(self) -> Dict[str, int]:
        """Report number of samples per source type."""
        counts = {"normal": 0, "augmented": 0, "hard": 0, "total": len(self)}
        for path in self.samples:
            path_str = str(path)
            if "hard_cases" in path_str:
                counts["hard"] += 1
            elif "augmented" in path_str:
                counts["augmented"] += 1
            else:
                counts["normal"] += 1
        return counts
