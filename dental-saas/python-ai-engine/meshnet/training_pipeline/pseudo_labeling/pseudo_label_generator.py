"""
pseudo_label_generator.py — Self-training via pseudo labeling for unlabelled scans.

Process
-------
1. Load an unlabelled scan (points.npy, no tooth_labels.npy)
2. Run model inference → raw logits + softmax confidence
3. Compute per-point confidence = max(softmax) over classes
4. Threshold: keep only points with confidence > min_confidence
5. Assign pseudo labels = argmax(softmax) for kept points
6. Save as pseudo_labels.npy alongside the scan

The label file is named "pseudo_labels.npy" (not "tooth_labels.npy") to
distinguish it from ground-truth labels.  The dataset loader handles both.

Usage
-----
    gen = PseudoLabelGenerator(
        model=model,
        output_dir="./datasets/pseudo_labeled",
        min_confidence=0.85,
    )
    result = gen.process_scan("./datasets/unlabeled/case001/points.npy")
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn

logger = logging.getLogger(__name__)


class PseudoLabelGenerator:
    """
    Runs model inference on unlabelled scans and generates pseudo labels.

    Parameters
    ----------
    model          : nn.Module  — trained segmentation model (eval mode)
    output_dir     : str        — where to save pseudo-labelled cases
    min_confidence : float      — minimum softmax confidence to keep a label
    num_points     : int        — points to sample from each scan
    batch_size     : int        — inference batch size (1 for single scan)
    device         : str        — "cuda" or "cpu"
    is_multitask   : bool       — if True, reads model["tooth_logits"]
    """

    def __init__(
        self,
        model: nn.Module,
        output_dir: str = "./datasets/pseudo_labeled",
        min_confidence: float = 0.85,
        num_points: int = 4096,
        batch_size: int = 1,
        device: str = "cpu",
        is_multitask: bool = False,
    ) -> None:
        self.model = model
        self.output_dir = Path(output_dir)
        self.min_confidence = min_confidence
        self.num_points = num_points
        self.batch_size = batch_size
        self.device = torch.device(device)
        self.is_multitask = is_multitask

        self.model.eval()
        self.model.to(self.device)

    # ── Inference ─────────────────────────────────────────────────────────

    @torch.no_grad()
    def _infer(self, points: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        Run inference on a single scan.

        Returns
        -------
        pred_labels : (N,) int64
        confidence  : (N,) float32  — max softmax per point
        """
        pts = torch.from_numpy(points).float().unsqueeze(0).to(self.device)  # (1, N, 3)

        if self.is_multitask:
            out = self.model(pts)
            logits = out["tooth_logits"]   # (1, N, C)
        else:
            logits = self.model(pts)       # (1, N, C)

        probs = torch.softmax(logits, dim=-1)          # (1, N, C)
        conf, pred = probs.max(dim=-1)                 # (1, N), (1, N)

        pred_labels = pred.squeeze(0).cpu().numpy().astype(np.int64)
        confidence  = conf.squeeze(0).cpu().numpy().astype(np.float32)
        return pred_labels, confidence

    # ── Processing ────────────────────────────────────────────────────────

    def _load_and_sample_points(self, pts_path: Path) -> np.ndarray:
        """Load and subsample a scan to num_points."""
        points = np.load(str(pts_path)).astype(np.float32)
        N = len(points)
        if N > self.num_points:
            idx = np.random.choice(N, self.num_points, replace=False)
            points = points[idx]
        elif N < self.num_points:
            idx = np.random.choice(N, self.num_points, replace=True)
            points = points[idx]
        return points

    def process_scan(self, scan_path: str) -> Dict:
        """
        Process a single scan directory.

        Parameters
        ----------
        scan_path : str  — path to a case directory containing points.npy

        Returns
        -------
        dict with keys:
            case_id, n_total, n_labelled, coverage, mean_confidence, path
        """
        scan_dir = Path(scan_path)
        pts_path = scan_dir / "points.npy"
        if not pts_path.exists():
            pts_path = Path(scan_path)  # maybe it IS the .npy file

        if not pts_path.exists():
            raise FileNotFoundError(f"points.npy not found: {pts_path}")

        case_id = pts_path.parent.name
        t0 = time.perf_counter()

        points = self._load_and_sample_points(pts_path)
        pred_labels, confidence = self._infer(points)

        # Coverage statistics
        kept_mask = confidence >= self.min_confidence
        n_total = len(points)
        n_labelled = int(kept_mask.sum())
        coverage = n_labelled / n_total if n_total > 0 else 0.0
        mean_conf = float(confidence[kept_mask].mean()) if n_labelled > 0 else 0.0

        # Set low-confidence labels to -1 (ConfidenceFilter will remove them)
        pseudo_labels = pred_labels.copy()
        pseudo_labels[~kept_mask] = -1

        # Save
        out_dir = self.output_dir / case_id
        out_dir.mkdir(parents=True, exist_ok=True)
        np.save(str(out_dir / "points.npy"), points)
        np.save(str(out_dir / "pseudo_labels.npy"), pseudo_labels)
        np.save(str(out_dir / "confidence.npy"), confidence)

        meta = {
            "case_id": case_id,
            "n_total": n_total,
            "n_labelled": n_labelled,
            "coverage": round(coverage, 4),
            "mean_confidence": round(mean_conf, 4),
            "min_confidence": self.min_confidence,
            "elapsed_s": round(time.perf_counter() - t0, 3),
        }
        with open(out_dir / "pseudo_meta.json", "w") as f:
            json.dump(meta, f, indent=2)

        logger.info(
            "PseudoLabel[%s]: coverage=%.1f%%  mean_conf=%.3f  kept=%d/%d",
            case_id, coverage * 100, mean_conf, n_labelled, n_total,
        )
        return meta

    def process_directory(
        self,
        unlabeled_dir: str,
        skip_existing: bool = True,
    ) -> List[Dict]:
        """
        Process all cases in an unlabelled directory.

        Parameters
        ----------
        unlabeled_dir : str  — directory containing one sub-folder per case
        skip_existing : bool — skip cases already in output_dir

        Returns
        -------
        List of result dicts
        """
        src_dir = Path(unlabeled_dir)
        case_dirs = [d for d in src_dir.iterdir() if d.is_dir()]
        logger.info(
            "PseudoLabelGenerator: processing %d cases from %s",
            len(case_dirs), src_dir,
        )

        results: List[Dict] = []
        for case_dir in sorted(case_dirs):
            out_dir = self.output_dir / case_dir.name
            if skip_existing and (out_dir / "pseudo_labels.npy").exists():
                logger.debug("Skipping existing: %s", case_dir.name)
                continue
            try:
                result = self.process_scan(str(case_dir))
                results.append(result)
            except Exception as exc:
                logger.warning("Failed to process %s: %s", case_dir.name, exc)

        logger.info(
            "Pseudo labeling complete: %d/%d cases processed",
            len(results), len(case_dirs),
        )
        return results
