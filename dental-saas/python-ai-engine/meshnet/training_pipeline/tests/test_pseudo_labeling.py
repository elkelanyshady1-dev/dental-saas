"""
test_pseudo_labeling.py — Unit tests for PseudoLabelGenerator and ConfidenceFilter.
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Optional
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
import torch
import torch.nn as nn

from meshnet.training_pipeline.pseudo_labeling.pseudo_label_generator import (
    PseudoLabelGenerator,
)
from meshnet.training_pipeline.pseudo_labeling.confidence_filter import (
    ConfidenceFilter,
    FilterResult,
)


# ── Dummy model ───────────────────────────────────────────────────────────────

class DummySegModel(nn.Module):
    """Trivial model that returns high-confidence predictions."""

    def __init__(self, n_classes: int = 5, bias_class: int = 1):
        super().__init__()
        self.n_classes = n_classes
        self.bias_class = bias_class

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, N, _ = x.shape
        logits = torch.zeros(B, N, self.n_classes)
        logits[:, :, self.bias_class] = 10.0  # very confident
        return logits


# ── PseudoLabelGenerator ──────────────────────────────────────────────────────

class TestPseudoLabelGenerator:

    def _make_case(self, tmp_path: Path, n: int = 300) -> Path:
        case_dir = tmp_path / "case001"
        case_dir.mkdir()
        pts = np.random.rand(n, 3).astype(np.float32)
        np.save(str(case_dir / "points.npy"), pts)
        return case_dir

    def test_generates_pseudo_labels(self, tmp_path):
        model = DummySegModel(n_classes=5)
        case_dir = self._make_case(tmp_path / "unlabeled")
        out_dir = tmp_path / "pseudo"

        gen = PseudoLabelGenerator(
            model=model,
            output_dir=str(out_dir),
            min_confidence=0.5,
            num_points=64,
            device="cpu",
        )
        result = gen.process_scan(str(case_dir))

        assert (out_dir / "case001" / "pseudo_labels.npy").exists()
        assert (out_dir / "case001" / "confidence.npy").exists()
        assert result["n_total"] == 64

    def test_high_confidence_all_labelled(self, tmp_path):
        model = DummySegModel(n_classes=5)  # very high confidence
        case_dir = self._make_case(tmp_path / "unlabeled")
        out_dir = tmp_path / "pseudo"

        gen = PseudoLabelGenerator(
            model=model,
            output_dir=str(out_dir),
            min_confidence=0.1,   # very low threshold
            num_points=50,
            device="cpu",
        )
        result = gen.process_scan(str(case_dir))
        assert result["coverage"] == 1.0

    def test_high_threshold_reduces_coverage(self, tmp_path):
        # Model that returns uniform (low) confidence
        class UniformModel(nn.Module):
            def forward(self, x):
                B, N, _ = x.shape
                return torch.zeros(B, N, 5)   # uniform logits → conf ≈ 0.2

        case_dir = self._make_case(tmp_path / "unlabeled")
        out_dir = tmp_path / "pseudo"
        gen = PseudoLabelGenerator(
            model=UniformModel(),
            output_dir=str(out_dir),
            min_confidence=0.9,   # high threshold
            num_points=50,
            device="cpu",
        )
        result = gen.process_scan(str(case_dir))
        # With uniform confidence ~0.2 and threshold 0.9, coverage should be 0
        assert result["coverage"] == pytest.approx(0.0, abs=0.05)

    def test_missing_file_raises(self, tmp_path):
        model = DummySegModel()
        gen = PseudoLabelGenerator(model=model, output_dir=str(tmp_path))
        with pytest.raises(FileNotFoundError):
            gen.process_scan(str(tmp_path / "nonexistent_case"))


# ── ConfidenceFilter ──────────────────────────────────────────────────────────

class TestConfidenceFilter:

    def _make_pseudo_case(
        self,
        case_dir: Path,
        coverage: float = 0.85,
        mean_conf: float = 0.90,
        n_tooth_classes: int = 8,
    ) -> None:
        case_dir.mkdir(parents=True, exist_ok=True)
        n = 500
        lbl = np.random.randint(1, n_tooth_classes + 1, n).astype(np.int64)
        # Mark some as -1 (unlabelled)
        n_unlabelled = int(n * (1 - coverage))
        lbl[:n_unlabelled] = -1
        conf = np.full(n, mean_conf, dtype=np.float32)

        np.save(str(case_dir / "pseudo_labels.npy"), lbl)
        np.save(str(case_dir / "confidence.npy"), conf)

        meta = {
            "case_id": case_dir.name,
            "n_total": n,
            "n_labelled": int(n * coverage),
            "coverage": coverage,
            "mean_confidence": mean_conf,
            "min_confidence": 0.8,
        }
        with open(case_dir / "pseudo_meta.json", "w") as f:
            json.dump(meta, f)

    def test_accepts_good_case(self, tmp_path):
        case_dir = tmp_path / "case001"
        self._make_pseudo_case(case_dir, coverage=0.9, mean_conf=0.92, n_tooth_classes=8)
        filt = ConfidenceFilter(
            min_coverage=0.70,
            min_mean_confidence=0.80,
            min_tooth_classes=3,
        )
        result = filt.filter_case(case_dir)
        assert result.accepted

    def test_rejects_low_coverage(self, tmp_path):
        case_dir = tmp_path / "case002"
        self._make_pseudo_case(case_dir, coverage=0.4, mean_conf=0.92, n_tooth_classes=8)
        filt = ConfidenceFilter(min_coverage=0.70)
        result = filt.filter_case(case_dir)
        assert not result.accepted
        assert "coverage" in result.rejection_reason

    def test_rejects_missing_file(self, tmp_path):
        filt = ConfidenceFilter()
        bad_dir = tmp_path / "nonexistent"
        bad_dir.mkdir()
        result = filt.filter_case(bad_dir)
        assert not result.accepted

    def test_filter_directory_produces_report(self, tmp_path):
        pseudo_dir = tmp_path / "pseudo"
        for i in range(4):
            cov = 0.9 if i < 2 else 0.3
            self._make_pseudo_case(pseudo_dir / f"case{i:03d}", coverage=cov)

        filt = ConfidenceFilter(min_coverage=0.70)
        accepted, rejected = filt.filter_directory(str(pseudo_dir), write_report=True)
        assert (pseudo_dir / "filter_report.json").exists()
        assert len(accepted) + len(rejected) == 4

    def test_purges_minus1_in_accepted(self, tmp_path):
        case_dir = tmp_path / "case_purge"
        self._make_pseudo_case(case_dir, coverage=0.9, mean_conf=0.92, n_tooth_classes=8)
        filt = ConfidenceFilter()
        result = filt.filter_case(case_dir)
        if result.accepted:
            lbl = np.load(str(case_dir / "pseudo_labels.npy"))
            assert int((lbl == -1).sum()) == 0, "Unlabelled points should be purged"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
