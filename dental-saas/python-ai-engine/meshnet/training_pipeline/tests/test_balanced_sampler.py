"""
test_balanced_sampler.py — Unit tests for BalancedSampler and CurriculumBoundarySampler.
"""
from __future__ import annotations

import numpy as np
import pytest

from meshnet.training_pipeline.sampling.balanced_sampler import BalancedSampler
from meshnet.training_pipeline.sampling.boundary_sampler import CurriculumBoundarySampler


def _make_dental_scan(n: int = 5000, tooth_fraction: float = 0.6) -> tuple:
    rng = np.random.default_rng(0)
    points = rng.standard_normal((n, 3)).astype(np.float32)
    labels = np.zeros(n, dtype=np.int64)
    n_tooth = int(n * tooth_fraction)
    labels[:n_tooth] = rng.integers(1, 33, size=n_tooth)
    return points, labels


# ── BalancedSampler ───────────────────────────────────────────────────────────

class TestBalancedSampler:

    def test_output_shape(self):
        pts, lbl = _make_dental_scan()
        s = BalancedSampler(tooth_ratio=0.5, n_points=1024, seed=0)
        p_out, l_out, _ = s.sample(pts, lbl)
        assert p_out.shape == (1024, 3)
        assert l_out.shape == (1024,)

    def test_50_50_balance(self):
        pts, lbl = _make_dental_scan()
        s = BalancedSampler(tooth_ratio=0.5, n_points=2000, seed=42)
        p_out, l_out, _ = s.sample(pts, lbl)
        tooth_frac = float((l_out > 0).sum()) / len(l_out)
        assert abs(tooth_frac - 0.5) < 0.02, f"tooth_frac={tooth_frac}"

    def test_custom_ratio(self):
        pts, lbl = _make_dental_scan()
        s = BalancedSampler(tooth_ratio=0.7, n_points=1000, seed=7)
        _, l_out, _ = s.sample(pts, lbl)
        tooth_frac = float((l_out > 0).sum()) / len(l_out)
        assert abs(tooth_frac - 0.7) < 0.03

    def test_no_crash_all_gingiva(self):
        pts = np.random.rand(500, 3).astype(np.float32)
        lbl = np.zeros(500, dtype=np.int64)
        s = BalancedSampler(n_points=256)
        p_out, l_out, _ = s.sample(pts, lbl)
        assert len(l_out) == 256

    def test_no_crash_all_tooth(self):
        pts = np.random.rand(500, 3).astype(np.float32)
        lbl = np.ones(500, dtype=np.int64)
        s = BalancedSampler(n_points=256)
        p_out, l_out, _ = s.sample(pts, lbl)
        assert len(l_out) == 256

    def test_features_passed_through(self):
        pts, lbl = _make_dental_scan(n=500)
        feats = np.ones((500, 6), dtype=np.float32)
        s = BalancedSampler(n_points=256)
        _, _, f_out = s.sample(pts, lbl, features=feats)
        assert f_out is not None
        assert f_out.shape == (256, 6)

    def test_batch_sampling(self):
        B, N = 4, 2000
        pts_b = np.random.rand(B, N, 3).astype(np.float32)
        lbl_b = np.random.randint(0, 5, size=(B, N)).astype(np.int64)
        s = BalancedSampler(n_points=512)
        p_out, l_out = s.sample_batch(pts_b, lbl_b)
        assert p_out.shape == (B, 512, 3)
        assert l_out.shape == (B, 512)


# ── CurriculumBoundarySampler ─────────────────────────────────────────────────

class TestCurriculumBoundarySampler:

    def test_output_shape(self):
        pts, lbl = _make_dental_scan(n=2000)
        s = CurriculumBoundarySampler(n_points=512, seed=0)
        p_out, l_out, _ = s.sample(pts, lbl)
        assert p_out.shape == (512, 3)
        assert l_out.shape == (512,)

    def test_fractions_sum_to_one(self):
        s = CurriculumBoundarySampler(
            boundary_fraction=0.4, tooth_fraction=0.3, gingiva_fraction=0.3
        )
        total = s.boundary_fraction + s.tooth_fraction + s.gingiva_fraction
        assert abs(total - 1.0) < 1e-5

    def test_invalid_fractions_raise(self):
        with pytest.raises(ValueError):
            CurriculumBoundarySampler(
                boundary_fraction=0.5, tooth_fraction=0.5, gingiva_fraction=0.5
            )

    def test_set_boundary_fraction(self):
        s = CurriculumBoundarySampler()
        s.set_boundary_fraction(0.6)
        total = s.boundary_fraction + s.tooth_fraction + s.gingiva_fraction
        assert abs(total - 1.0) < 1e-5
        assert s.boundary_fraction == 0.6

    def test_small_scan(self):
        pts = np.random.rand(100, 3).astype(np.float32)
        lbl = np.random.randint(0, 5, 100).astype(np.int64)
        s = CurriculumBoundarySampler(n_points=64)
        p_out, l_out, _ = s.sample(pts, lbl)
        assert len(l_out) == 64


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
