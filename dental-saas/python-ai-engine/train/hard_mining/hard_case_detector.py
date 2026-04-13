"""
hard_case_detector.py — Scan the dataset, score all cases, emit hard_cases.json.

This module runs model inference on the full dataset, computes per-case
difficulty scores, ranks them, and writes the top-N% hardest cases to
logs/hard_cases.json. It also copies or symlinks those cases into
datasets/hard_cases/ for priority sampling.

Usage:
    from train.hard_mining.hard_case_detector import HardCaseDetector

    detector = HardCaseDetector(
        model=model,
        data_root="./datasets/cases",
        log_path="./logs/hard_cases.json",
        hard_cases_dir="./datasets/hard_cases",
        top_fraction=0.20,
    )
    results = detector.run(device)
"""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn

from ..dataset_loader import OrthodonticDataset
from .difficulty_metrics import compute_case_difficulty, classify_difficulty

logger = logging.getLogger(__name__)


class HardCaseDetector:
    """
    Runs model inference over the entire dataset and ranks cases by difficulty.

    Workflow:
        1. Iterate through all dataset samples (no shuffling)
        2. Run model inference → predicted labels per point
        3. Compute difficulty score (IoU deficit + boundary error + missing teeth)
        4. Sort cases by difficulty descending
        5. Write top_fraction% to logs/hard_cases.json
        6. Populate datasets/hard_cases/ with those cases
    """

    def __init__(
        self,
        model: nn.Module,
        data_root: str,
        log_path: str = "./logs/hard_cases.json",
        hard_cases_dir: str = "./datasets/hard_cases",
        top_fraction: float = 0.20,
        num_points: int = 4096,
        num_classes: int = 33,
        is_multitask: bool = True,
        difficulty_weights: Optional[Dict[str, float]] = None,
    ):
        self.model = model
        self.data_root = Path(data_root)
        self.log_path = Path(log_path)
        self.hard_cases_dir = Path(hard_cases_dir)
        self.top_fraction = top_fraction
        self.num_points = num_points
        self.num_classes = num_classes
        self.is_multitask = is_multitask
        self.difficulty_weights = difficulty_weights

    # ------------------------------------------------------------------
    @torch.no_grad()
    def run(self, device: torch.device) -> List[Dict]:
        """
        Full hard-case detection pipeline.

        Returns:
            List of dicts sorted by difficulty descending, e.g.:
            [{"case": "case034", "difficulty": 0.82, "tier": "very_hard", ...}]
        """
        self.model.eval()

        # Build dataset (segmentation mode to get basic labels from any sample)
        try:
            dataset = OrthodonticDataset(
                data_root=str(self.data_root),
                mode="segmentation",
                num_points=self.num_points,
                augment=False,
                split="train",
            )
        except ValueError:
            # Try without split file
            dataset = OrthodonticDataset(
                data_root=str(self.data_root),
                mode="segmentation",
                num_points=self.num_points,
                augment=False,
                split="any",  # will fall back to all samples
            )

        logger.info(f"Hard-case detection: scoring {len(dataset)} cases...")

        results = []

        for idx in range(len(dataset)):
            sample_dir = dataset.samples[idx]
            case_id = sample_dir.name

            try:
                batch = dataset[idx]
                points = batch["points"].unsqueeze(0).to(device)    # (1, N, 3)
                gt_labels = batch["tooth_labels"].numpy()           # (N,)

                # Run inference
                if self.is_multitask:
                    out = self.model(points)
                    pred_labels = (
                        out["tooth_logits"].argmax(dim=-1)
                        .squeeze(0).cpu().numpy()
                    )
                else:
                    logits = self.model(points)
                    pred_labels = (
                        logits.argmax(dim=-1)
                        .squeeze(0).cpu().numpy()
                    )

                # Get point coordinates for boundary detection
                pts_np = batch["points"].numpy()

                # Compute difficulty
                score, breakdown = compute_case_difficulty(
                    pred_labels=pred_labels,
                    gt_labels=gt_labels,
                    points=pts_np,
                    case_id=case_id,
                    weights=self.difficulty_weights,
                    num_classes=self.num_classes,
                )

                entry = breakdown.to_dict()
                entry["case_path"] = str(sample_dir)
                entry["tier"] = classify_difficulty(score)
                results.append(entry)

            except Exception as e:
                logger.warning(f"Failed to score case '{case_id}': {e}")
                continue

        # Sort by difficulty descending
        results.sort(key=lambda x: x["difficulty"], reverse=True)

        # Select top fraction
        n_hard = max(1, int(len(results) * self.top_fraction))
        hard_results = results[:n_hard]
        all_results = results

        logger.info(
            f"Detected {n_hard}/{len(results)} hard cases "
            f"(top {self.top_fraction*100:.0f}%)"
        )

        # Write logs
        self._write_log(all_results, hard_results)

        # Populate hard_cases directory
        self._populate_hard_cases_dir(hard_results)

        return hard_results

    # ------------------------------------------------------------------
    def _write_log(
        self,
        all_results: List[Dict],
        hard_results: List[Dict],
    ) -> None:
        """Write hard_cases.json and full difficulty report."""
        self.log_path.parent.mkdir(parents=True, exist_ok=True)

        # Compact hard cases list (for priority sampler)
        hard_compact = [
            {
                "case": r["case_id"],
                "difficulty": r["difficulty"],
                "tier": r["tier"],
                "mean_iou": r["mean_iou"],
                "missing_teeth": r.get("missing_predicted_teeth", []),
            }
            for r in hard_results
        ]
        with open(self.log_path, "w") as f:
            json.dump(hard_compact, f, indent=2)
        logger.info(f"Hard cases log → {self.log_path}")

        # Full detailed report
        full_report_path = self.log_path.parent / "difficulty_report.json"
        with open(full_report_path, "w") as f:
            json.dump(all_results, f, indent=2)
        logger.info(f"Full difficulty report → {full_report_path}")

    # ------------------------------------------------------------------
    def _populate_hard_cases_dir(self, hard_results: List[Dict]) -> None:
        """
        Copy hard cases into datasets/hard_cases/ for priority sampling.

        Uses Junction (Windows) / symlink (Linux) where possible,
        falls back to directory copy if that fails.
        """
        self.hard_cases_dir.mkdir(parents=True, exist_ok=True)

        # Clear previous hard cases
        for existing in self.hard_cases_dir.iterdir():
            if existing.is_dir() and not existing.name.startswith("."):
                shutil.rmtree(existing, ignore_errors=True)

        n_copied = 0
        for result in hard_results:
            src = Path(result["case_path"])
            if not src.exists():
                continue

            dst = self.hard_cases_dir / src.name
            try:
                dst.symlink_to(src.resolve())
            except (OSError, NotImplementedError):
                try:
                    shutil.copytree(src, dst, dirs_exist_ok=True)
                except Exception as e:
                    logger.warning(f"Could not link/copy {src.name}: {e}")
                    continue
            n_copied += 1

        logger.info(
            f"Populated hard_cases dir with {n_copied} cases → {self.hard_cases_dir}"
        )

    # ------------------------------------------------------------------
    @staticmethod
    def load_hard_case_ids(log_path: str) -> set:
        """
        Load the set of hard case IDs from an existing hard_cases.json.

        Used by the training loop to update the PrioritySampler hot.
        """
        path = Path(log_path)
        if not path.exists():
            return set()
        with open(path) as f:
            data = json.load(f)
        return {entry["case"] for entry in data}
