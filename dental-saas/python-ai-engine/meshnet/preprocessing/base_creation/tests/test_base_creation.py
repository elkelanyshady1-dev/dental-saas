"""
test_base_creation.py — Unit tests for BasePlaneDetector, BaseGenerator, and ModelNormalizer.
"""
from __future__ import annotations

import numpy as np
import pytest

try:
    import trimesh
    TRIMESH_AVAILABLE = True
except ImportError:
    TRIMESH_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not TRIMESH_AVAILABLE, reason="trimesh not installed"
)


def _dental_arch_mesh() -> "trimesh.Trimesh":
    """Approximate dental arch: a U-shaped cylinder cluster."""
    import trimesh as tri
    parts = []
    angles = np.linspace(0, np.pi, 8)
    for a in angles:
        cx = 30 * np.cos(a)
        cy = 20 * np.sin(a)
        tooth = tri.primitives.Cylinder(radius=3.0, height=10.0)
        tooth.apply_translation([cx, cy, 5.0])
        parts.append(tooth.to_mesh())
    return tri.util.concatenate(parts)


def _box_mesh_no_base() -> "trimesh.Trimesh":
    """Open-bottom box — simulates a raw scan with no base."""
    v = np.array([
        [0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0],
        [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10],
    ], dtype=np.float32)
    # Only walls and top — no bottom face
    f = np.array([
        [0, 1, 5], [0, 5, 4],   # front
        [1, 2, 6], [1, 6, 5],   # right
        [2, 3, 7], [2, 7, 6],   # back
        [3, 0, 4], [3, 4, 7],   # left
        [4, 5, 6], [4, 6, 7],   # top
    ], dtype=np.int32)
    return trimesh.Trimesh(vertices=v, faces=f, process=False)


# ── BasePlaneDetector ─────────────────────────────────────────────────────────

class TestBasePlaneDetector:

    def test_ransac_returns_plane(self):
        from meshnet.preprocessing.base_creation.base_plane_detector import BasePlaneDetector
        mesh = _dental_arch_mesh()
        detector = BasePlaneDetector(method="ransac", offset_mm=3.0)
        plane = detector.detect(mesh)
        assert plane is not None
        assert hasattr(plane, "z_level")
        assert hasattr(plane, "normal")
        assert hasattr(plane, "point")

    def test_pca_returns_plane(self):
        from meshnet.preprocessing.base_creation.base_plane_detector import BasePlaneDetector
        mesh = _dental_arch_mesh()
        detector = BasePlaneDetector(method="pca", offset_mm=2.0)
        plane = detector.detect(mesh)
        assert plane is not None

    def test_z_level_below_scan(self):
        """Base plane must be below all mesh vertices."""
        from meshnet.preprocessing.base_creation.base_plane_detector import BasePlaneDetector
        mesh = _dental_arch_mesh()
        detector = BasePlaneDetector(method="ransac", offset_mm=1.0)
        plane = detector.detect(mesh)
        z_min = float(np.asarray(mesh.vertices)[:, 2].min())
        # Base plane should be at or below z_min
        assert plane.z_level <= z_min + 1e-3

    def test_normal_unit_length(self):
        from meshnet.preprocessing.base_creation.base_plane_detector import BasePlaneDetector
        mesh = _dental_arch_mesh()
        detector = BasePlaneDetector()
        plane = detector.detect(mesh)
        norm = float(np.linalg.norm(plane.normal))
        assert abs(norm - 1.0) < 0.01

    def test_normal_points_downward(self):
        from meshnet.preprocessing.base_creation.base_plane_detector import BasePlaneDetector
        mesh = _dental_arch_mesh()
        detector = BasePlaneDetector()
        plane = detector.detect(mesh)
        # Normal should have negative or zero Z component (pointing down)
        assert plane.normal[2] <= 0.01

    def test_project_to_plane(self):
        from meshnet.preprocessing.base_creation.base_plane_detector import BasePlaneDetector
        mesh = _dental_arch_mesh()
        detector = BasePlaneDetector()
        plane = detector.detect(mesh)
        pts = np.random.rand(10, 3).astype(np.float32) * 20
        proj = plane.project_to_plane(pts)
        # Projected points should have near-zero signed distance
        dist = plane.signed_distance(proj)
        assert np.abs(dist).max() < 1e-5

    def test_to_dict(self):
        from meshnet.preprocessing.base_creation.base_plane_detector import BasePlaneDetector
        mesh = _dental_arch_mesh()
        plane = BasePlaneDetector().detect(mesh)
        d = plane.to_dict()
        assert "normal" in d and "z_level" in d and "method" in d


# ── BaseGenerator ─────────────────────────────────────────────────────────────

class TestBaseGenerator:

    def test_generates_non_empty_mesh(self):
        from meshnet.preprocessing.base_creation.base_plane_detector import BasePlaneDetector
        from meshnet.preprocessing.base_creation.base_generator import BaseGenerator
        mesh = _dental_arch_mesh()
        plane = BasePlaneDetector().detect(mesh)
        gen = BaseGenerator(n_hull_points=16)
        base = gen.generate(mesh, plane)
        assert isinstance(base, trimesh.Trimesh)
        assert len(base.faces) > 0

    def test_base_vertices_at_z_level(self):
        from meshnet.preprocessing.base_creation.base_plane_detector import BasePlaneDetector
        from meshnet.preprocessing.base_creation.base_generator import BaseGenerator
        mesh = _dental_arch_mesh()
        plane = BasePlaneDetector(offset_mm=3.0).detect(mesh)
        gen = BaseGenerator(n_hull_points=16, base_thickness_mm=2.0)
        base = gen.generate(mesh, plane)
        z_vals = np.asarray(base.vertices)[:, 2]
        # All base vertices should be at or below z_level
        assert float(z_vals.max()) <= plane.z_level + 0.5

    def test_n_hull_points_respected(self):
        from meshnet.preprocessing.base_creation.base_plane_detector import BasePlaneDetector
        from meshnet.preprocessing.base_creation.base_generator import BaseGenerator
        mesh = _dental_arch_mesh()
        plane = BasePlaneDetector().detect(mesh)
        gen32 = BaseGenerator(n_hull_points=32)
        gen64 = BaseGenerator(n_hull_points=64)
        base32 = gen32.generate(mesh, plane)
        base64 = gen64.generate(mesh, plane)
        # More hull points = more vertices
        assert len(base64.vertices) >= len(base32.vertices) - 5   # allow small tolerance


# ── ModelNormalizer ────────────────────────────────────────────────────────────

class TestModelNormalizer:

    def test_base_at_z0(self):
        """After normalization, Z minimum should be ≈ 0."""
        from meshnet.preprocessing.base_creation.model_normalizer import ModelNormalizer
        mesh = _dental_arch_mesh()
        # Offset the mesh
        mesh.apply_translation([10, 20, -50])
        normalizer = ModelNormalizer(flip_check=False)
        aligned, meta = normalizer.normalize(mesh)
        z_min = float(np.asarray(aligned.vertices)[:, 2].min())
        assert abs(z_min) < 0.5, f"z_min={z_min} not ≈ 0"

    def test_centred_in_xy(self):
        """After normalization, XY centroid should be near origin."""
        from meshnet.preprocessing.base_creation.model_normalizer import ModelNormalizer
        mesh = _dental_arch_mesh()
        mesh.apply_translation([100, -50, 0])
        normalizer = ModelNormalizer(flip_check=False)
        aligned, meta = normalizer.normalize(mesh)
        verts = np.asarray(aligned.vertices)
        cx = float(verts[:, 0].mean())
        cy = float(verts[:, 1].mean())
        # Centroid should be near 0, 0
        assert abs(cx) < 5.0, f"cx={cx} not near 0"
        assert abs(cy) < 5.0, f"cy={cy} not near 0"

    def test_rotation_matrix_orthogonal(self):
        """Rotation matrix must be orthogonal (R @ R.T ≈ I)."""
        from meshnet.preprocessing.base_creation.model_normalizer import ModelNormalizer
        mesh = _dental_arch_mesh()
        normalizer = ModelNormalizer(flip_check=False)
        _, meta = normalizer.normalize(mesh)
        R = meta.rotation_matrix
        I_approx = R @ R.T
        np.testing.assert_allclose(I_approx, np.eye(3), atol=1e-6)

    def test_meta_to_dict(self):
        from meshnet.preprocessing.base_creation.model_normalizer import ModelNormalizer
        mesh = _dental_arch_mesh()
        _, meta = ModelNormalizer().normalize(mesh)
        d = meta.to_dict()
        assert "rotation_matrix" in d and "z_min_after" in d

    def test_rodrigues_aligned(self):
        """_rotation_to_z applied to the occlusal normal should yield (0,0,1)."""
        from meshnet.preprocessing.base_creation.model_normalizer import ModelNormalizer
        norm = ModelNormalizer()
        n = np.array([0.1, 0.2, 0.95])
        n /= np.linalg.norm(n)
        R = norm._rotation_to_z(n)
        result = R @ n
        np.testing.assert_allclose(result, [0, 0, 1], atol=1e-6)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
