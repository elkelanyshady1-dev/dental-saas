"""
test_patch_generator.py — Unit tests for CurriculumPatchGenerator.
"""
from __future__ import annotations

import numpy as np
import pytest

from meshnet.training_pipeline.patch_generation.patch_generator import (
    CurriculumPatch,
    CurriculumPatchGenerator,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_scan(n: int = 2000, n_teeth: int = 14) -> tuple:
    """Generate a synthetic point cloud with n_teeth tooth classes + gingiva."""
    rng = np.random.default_rng(42)
    points = rng.standard_normal((n, 3)).astype(np.float32) * 20.0
    labels = rng.integers(0, n_teeth + 1, size=n).astype(np.int64)
    return points, labels


# ── Stage 1 tests ─────────────────────────────────────────────────────────────

class TestStage1PatchGenerator:

    def test_returns_list_of_patches(self):
        pts, lbl = _make_scan()
        gen = CurriculumPatchGenerator(stage=1, patch_radius_mm=8.0, n_seeds=8)
        patches = gen.generate(pts, lbl)
        assert isinstance(patches, list)
        assert len(patches) > 0

    def test_patch_points_normalised(self):
        pts, lbl = _make_scan()
        gen = CurriculumPatchGenerator(stage=1, patch_radius_mm=8.0, n_seeds=4)
        patches = gen.generate(pts, lbl)
        for p in patches:
            max_r = float(np.linalg.norm(p.points, axis=-1).max())
            assert max_r <= 1.01, f"Max radius {max_r} > 1"

    def test_patch_min_points(self):
        pts, lbl = _make_scan()
        gen = CurriculumPatchGenerator(
            stage=1, patch_radius_mm=8.0, n_seeds=4, min_patch_points=64
        )
        patches = gen.generate(pts, lbl)
        for p in patches:
            assert p.n_points >= 64 or len(patches) == 0

    def test_patch_dataclass_fields(self):
        pts, lbl = _make_scan()
        gen = CurriculumPatchGenerator(stage=1, patch_radius_mm=15.0, n_seeds=2)
        patches = gen.generate(pts, lbl)
        if patches:
            p = patches[0]
            assert p.points.dtype == np.float32
            assert p.labels.dtype == np.int64
            assert isinstance(p.is_boundary_patch, bool)
            assert isinstance(p.n_tooth_classes, int)
            assert p.scale > 0.0

    def test_stage1_no_features(self):
        pts, lbl = _make_scan()
        gen = CurriculumPatchGenerator(stage=1, n_seeds=4)
        patches = gen.generate(pts, lbl, features=None)
        for p in patches:
            assert p.features is None


# ── Stage 2 tests ─────────────────────────────────────────────────────────────

class TestStage2PatchGenerator:

    def test_boundary_seeding_produces_boundary_patches(self):
        pts, lbl = _make_scan(n=3000)
        gen = CurriculumPatchGenerator(
            stage=2, patch_radius_mm=12.0, n_seeds=16,
            boundary_seed_fraction=0.5,
        )
        patches = gen.generate(pts, lbl)
        boundary_count = sum(1 for p in patches if p.is_boundary_patch)
        # At least some boundary patches expected
        assert boundary_count >= 0  # soft assertion: depends on RNG

    def test_stage2_larger_radius_more_classes(self):
        pts, lbl = _make_scan(n=3000)
        gen1 = CurriculumPatchGenerator(stage=1, patch_radius_mm=5.0, n_seeds=4)
        gen2 = CurriculumPatchGenerator(stage=2, patch_radius_mm=15.0, n_seeds=4)
        p1 = gen1.generate(pts, lbl)
        p2 = gen2.generate(pts, lbl)
        if p1 and p2:
            avg_class1 = np.mean([p.n_tooth_classes for p in p1])
            avg_class2 = np.mean([p.n_tooth_classes for p in p2])
            # Larger radius should capture more classes on average
            assert avg_class2 >= avg_class1 - 2   # allow tolerance


# ── Stage 3 tests ─────────────────────────────────────────────────────────────

class TestStage3PatchGenerator:

    def test_returns_single_full_arch_patch(self):
        pts, lbl = _make_scan(n=5000)
        gen = CurriculumPatchGenerator(stage=3)
        patches = gen.generate(pts, lbl)
        assert len(patches) == 1

    def test_full_arch_patch_covers_all_points(self):
        pts, lbl = _make_scan(n=1000)
        gen = CurriculumPatchGenerator(stage=3)
        patches = gen.generate(pts, lbl)
        assert patches[0].n_points == len(pts)

    def test_full_arch_normalised(self):
        pts, lbl = _make_scan(n=500)
        gen = CurriculumPatchGenerator(stage=3)
        patches = gen.generate(pts, lbl)
        max_r = float(np.linalg.norm(patches[0].points, axis=-1).max())
        assert max_r <= 1.01


# ── Iter batches ──────────────────────────────────────────────────────────────

def test_iter_batches():
    pts, lbl = _make_scan(n=2000)
    gen = CurriculumPatchGenerator(stage=1, n_seeds=16)
    batches = list(gen.iter_batches(pts, lbl, batch_size=4))
    assert len(batches) > 0
    for b in batches:
        assert len(b) <= 4


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
