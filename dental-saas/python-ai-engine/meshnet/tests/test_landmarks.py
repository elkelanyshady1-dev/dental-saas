"""
test_landmarks.py — Unit tests for Stage 3 landmark detection modules.

Covers:
    • CuspDetector: runs on synthetic tooth, returns correct structure
    • LandmarkHead: forward shape, loss computation
    • LandmarkRefinement: quadratic extremum, probability-map extraction

All tests run CPU-only without real scan data.

Run:
    python -m pytest meshnet/tests/test_landmarks.py -v
or:
    python -m meshnet.tests.test_landmarks
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from meshnet.landmarks.landmark_head import (
    LandmarkType, LandmarkProbabilityMap, N_LANDMARK_TYPES,
    LANDMARK_COLORS, LANDMARK_DESCRIPTIONS,
)
from meshnet.landmarks.cusp_detection import (
    detect_cusps, CuspDetector,
    _compute_pca_curvature, _find_local_maxima, _nms,
)
from meshnet.landmarks.landmark_refinement import (
    LandmarkRefinement, _fit_quadratic_extremum, _weighted_centroid,
)


# ── Synthetic data ────────────────────────────────────────────────────────────

def _make_crown_points(n: int = 500, seed: int = 42) -> np.ndarray:
    """
    Generate a synthetic tooth crown: hemisphere with one sharp cusp tip
    at [0, 0, 5.0] (5 mm above the base plane).
    """
    rng = np.random.default_rng(seed)
    pts = rng.standard_normal((n, 3)).astype(np.float32)
    # Project onto upper hemisphere
    pts[:, 2] = np.abs(pts[:, 2])
    # Normalise to radius 5
    norms = np.linalg.norm(pts, axis=-1, keepdims=True)
    pts = pts / (norms + 1e-8) * 5.0
    # Add a sharp tip
    tip = np.array([[0.0, 0.0, 5.0]], dtype=np.float32)
    pts = np.vstack([pts[:n-1], tip])
    return pts


def _make_flat_surface(n: int = 200, seed: int = 0) -> np.ndarray:
    """Flat square surface (expected: no cusp peaks)."""
    rng = np.random.default_rng(seed)
    pts = rng.uniform(-5.0, 5.0, (n, 3)).astype(np.float32)
    pts[:, 2] = 0.0   # flat in Z
    return pts


# ─────────────────────────────────────────────────────────────────────────────
# LandmarkType registry tests
# ─────────────────────────────────────────────────────────────────────────────

class TestLandmarkTypeRegistry:

    def test_all_types_have_colors(self):
        for lt in LandmarkType:
            assert lt in LANDMARK_COLORS, f"{lt.name} missing color"
            color = LANDMARK_COLORS[lt]
            assert len(color) == 3
            assert all(0 <= c <= 255 for c in color)

    def test_all_types_have_descriptions(self):
        for lt in LandmarkType:
            assert lt in LANDMARK_DESCRIPTIONS
            assert len(LANDMARK_DESCRIPTIONS[lt]) > 5

    def test_n_landmark_types(self):
        assert N_LANDMARK_TYPES == len(LandmarkType) == 6

    def test_enum_int_values(self):
        assert LandmarkType.CUSP_TIP == 0
        assert LandmarkType.INCISAL_EDGE == 1
        assert LandmarkType.CENTRAL_GROOVE == 2
        assert LandmarkType.MESIAL_CONTACT == 3
        assert LandmarkType.DISTAL_CONTACT == 4
        assert LandmarkType.GINGIVAL_MARGIN == 5


# ─────────────────────────────────────────────────────────────────────────────
# Curvature helper tests
# ─────────────────────────────────────────────────────────────────────────────

class TestCurvatureComputation:

    def test_flat_surface_low_curvature(self):
        pts = _make_flat_surface(n=300)
        curv = _compute_pca_curvature(pts, k=10)
        assert curv.shape == (len(pts),)
        # Flat surface → curvature should be near 0
        assert float(curv.mean()) < 0.05, \
            f"Flat surface curvature should be low, got {curv.mean():.4f}"

    def test_sphere_uniform_curvature(self):
        theta = np.linspace(0, np.pi, 20)
        phi   = np.linspace(0, 2*np.pi, 20)
        T, P  = np.meshgrid(theta, phi)
        pts = np.stack([
            np.sin(T.ravel()) * np.cos(P.ravel()),
            np.sin(T.ravel()) * np.sin(P.ravel()),
            np.cos(T.ravel()),
        ], axis=-1).astype(np.float32)
        curv = _compute_pca_curvature(pts, k=8)
        assert curv.shape == (len(pts),)
        # All curvature values should be in valid range
        assert curv.min() >= 0.0
        assert curv.max() <= 0.5

    def test_curvature_shape(self):
        pts = np.random.rand(100, 3).astype(np.float32)
        curv = _compute_pca_curvature(pts, k=10)
        assert curv.shape == (100,)
        assert curv.dtype == np.float32


# ─────────────────────────────────────────────────────────────────────────────
# Local maxima & NMS tests
# ─────────────────────────────────────────────────────────────────────────────

class TestLocalMaxima:

    def test_finds_at_least_one_peak(self):
        pts  = _make_crown_points(n=200)
        curv = _compute_pca_curvature(pts, k=10)
        peaks = _find_local_maxima(curv, pts, k=8, min_curvature=0.0)
        assert len(peaks) > 0, "Should find at least one local max"

    def test_nms_reduces_peaks(self):
        pts  = _make_crown_points(n=300)
        curv = _compute_pca_curvature(pts, k=10)
        raw_peaks = _find_local_maxima(curv, pts, k=8, min_curvature=0.0)
        suppressed = _nms(raw_peaks, pts, curv, nms_radius=1.0)
        # NMS should never produce MORE peaks
        assert len(suppressed) <= len(raw_peaks)

    def test_nms_empty_input(self):
        pts  = np.random.rand(50, 3).astype(np.float32)
        curv = np.zeros(50, np.float32)
        result = _nms(np.array([], dtype=np.int32), pts, curv, nms_radius=2.0)
        assert len(result) == 0


# ─────────────────────────────────────────────────────────────────────────────
# CuspDetector end-to-end
# ─────────────────────────────────────────────────────────────────────────────

class TestCuspDetector:

    def test_detect_returns_all_types(self):
        pts = _make_crown_points(n=400)
        result = detect_cusps(pts)

        assert isinstance(result, dict)
        for lt in LandmarkType:
            assert lt in result, f"{lt.name} missing from result"
            assert isinstance(result[lt], np.ndarray)
            assert result[lt].ndim == 2
            assert result[lt].shape[1] == 3

    def test_detect_tiny_mesh_no_crash(self):
        """Very small mesh should return empty dicts, not crash."""
        pts = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=np.float32)
        result = detect_cusps(pts)
        for lt in LandmarkType:
            assert result[lt].shape[1] == 3

    def test_detector_class_interface(self):
        detector = CuspDetector(k=8, nms_radius=1.0, min_curvature=0.01)
        pts = _make_crown_points(n=200)
        result = detector.detect(pts)
        assert isinstance(result, dict)

    def test_with_normals(self):
        pts = _make_crown_points(n=200)
        normals = pts / (np.linalg.norm(pts, axis=-1, keepdims=True) + 1e-8)
        result = detect_cusps(pts, normals=normals)
        assert isinstance(result, dict)


# ─────────────────────────────────────────────────────────────────────────────
# LandmarkHead PyTorch tests
# ─────────────────────────────────────────────────────────────────────────────

class TestLandmarkHead:

    def test_forward_shape(self):
        torch = pytest.importorskip("torch")
        from meshnet.landmarks.landmark_head import LandmarkHead

        B, N, C = 2, 512, 128
        head = LandmarkHead(in_channels=C, n_types=6)
        head.eval()

        feat = torch.randn(B, N, C)
        with torch.no_grad():
            out = head(feat)

        assert out.shape == (B, N, 6), f"Expected (B,N,6) got {out.shape}"

    def test_output_are_logits(self):
        torch = pytest.importorskip("torch")
        from meshnet.landmarks.landmark_head import LandmarkHead

        head = LandmarkHead(in_channels=64, n_types=6)
        head.eval()
        with torch.no_grad():
            out = head(torch.randn(1, 100, 64))
        # Logits can be any value
        assert out.shape[-1] == 6

    def test_landmark_loss_binary_ce(self):
        torch = pytest.importorskip("torch")
        from meshnet.landmarks.landmark_head import LandmarkLoss

        B, N = 2, 256
        loss_fn = LandmarkLoss(pos_weight=10.0, n_types=6)

        logits  = torch.randn(B, N, 6)
        targets = torch.zeros(B, N, 6)
        targets[:, :10, 0] = 1.0   # 10 cusp tips per sample

        loss = loss_fn(logits, targets)
        assert loss.item() > 0.0
        assert not torch.isnan(loss)
        assert not torch.isinf(loss)

    def test_probability_map_to_api_dict(self):
        probs = np.random.rand(100, 6).astype(np.float32)
        pm = LandmarkProbabilityMap(probs=probs)
        d = pm.to_api_dict()

        assert "CUSP_TIP" in d
        assert "INCISAL_EDGE" in d
        assert "count" in d["CUSP_TIP"]
        assert "color" in d["CUSP_TIP"]


# ─────────────────────────────────────────────────────────────────────────────
# LandmarkRefinement tests
# ─────────────────────────────────────────────────────────────────────────────

class TestLandmarkRefinement:

    def test_weighted_centroid(self):
        pts = np.array([[0, 0, 0], [1, 0, 0], [2, 0, 0]], dtype=np.float32)
        w   = np.array([1.0, 2.0, 1.0])
        c   = _weighted_centroid(pts, w)
        expected = np.array([1.0, 0.0, 0.0])
        np.testing.assert_allclose(c, expected, atol=1e-5)

    def test_quadratic_extremum_sphere_tip(self):
        """On a sphere, the extreme point is the pole."""
        n_pts = 50
        theta = np.linspace(0, np.pi / 4, n_pts)
        x = np.sin(theta) * np.cos(0)
        y = np.sin(theta) * np.sin(0)
        z = np.cos(theta)
        pts = np.stack([x, y, z], axis=-1).astype(np.float32) * 5.0

        centre = pts[0].copy()   # already at the tip
        refined = _fit_quadratic_extremum(pts, centre)
        # Refined should be close to the actual top [0, 0, 5]
        dist = np.linalg.norm(refined - np.array([0, 0, 5], np.float32))
        assert dist < 2.0, f"Quadratic extremum too far from tip: dist={dist:.3f}"

    def test_quadratic_fallback_too_few_points(self):
        """With < 6 points, should fall back to ``centre`` unchanged."""
        pts = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=np.float32)
        centre = np.array([0.3, 0.3, 0.0], np.float32)
        result = _fit_quadratic_extremum(pts, centre)
        # Fallback: return centre as-is
        np.testing.assert_array_equal(result, centre)

    def test_refine_geometry_peaks(self):
        pts = _make_crown_points(n=500)
        landmarks = detect_cusps(pts)

        refiner = LandmarkRefinement(k=16, use_quadratic=True)
        refined = refiner.refine_geometry_peaks(landmarks, pts)

        assert isinstance(refined, dict)
        for lt in LandmarkType:
            assert lt in refined
            assert refined[lt].ndim == 2
            assert refined[lt].shape[1] == 3

    def test_refine_from_probability_map(self):
        pts = _make_crown_points(n=500)
        # Simulate probability map: high at the tip (last point)
        prob_map = np.zeros((len(pts), 6), dtype=np.float32)
        prob_map[-1, 0] = 0.99   # CUSP_TIP probability at tip

        refiner = LandmarkRefinement(k=8, use_quadratic=False)
        result  = refiner.refine_from_probability_map(prob_map, pts, threshold=0.5)

        assert LandmarkType.CUSP_TIP in result
        # Should detect 1 cusp tip
        assert len(result[LandmarkType.CUSP_TIP]) == 1

    def test_build_probability_map(self):
        pts = np.random.rand(300, 3).astype(np.float32)
        prob_map = np.random.rand(300, 6).astype(np.float32)

        refiner = LandmarkRefinement(k=10, use_quadratic=False)
        lm_map  = refiner.build_probability_map(prob_map, pts, threshold=0.9)

        assert isinstance(lm_map, LandmarkProbabilityMap)
        assert lm_map.probs.shape == (300, 6)


# ─────────────────────────────────────────────────────────────────────────────
# Run standalone
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
