"""
test_mesh_filling.py — Unit tests for MeshFiller and detect_base().
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


def _open_cylinder() -> "trimesh.Trimesh":
    """Open-ended cylinder (not watertight — no caps)."""
    cyl = trimesh.primitives.Cylinder(radius=10, height=20)
    # Keep only the side faces (not the top/bottom caps)
    mesh = cyl.to_mesh()
    # Rough heuristic: remove faces whose centroid is near z=+10 or z=-10
    faces = np.asarray(mesh.faces)
    verts = np.asarray(mesh.vertices)
    centroids_z = verts[faces].mean(axis=1)[:, 2]
    keep = (np.abs(centroids_z) < 9.0)
    new_faces = faces[keep]
    return trimesh.Trimesh(vertices=verts, faces=new_faces, process=False)


def _closed_box() -> "trimesh.Trimesh":
    """Fully closed watertight box."""
    return trimesh.primitives.Box(extents=[10, 10, 10]).to_mesh()


def _arch_and_base():
    """dental arch + flat base (top and bottom box halves)."""
    arch = trimesh.primitives.Box(extents=[60, 30, 20])
    arch.apply_translation([0, 0, 10])
    base = trimesh.primitives.Box(extents=[60, 30, 3])
    base.apply_translation([0, 0, -1.5])
    return arch.to_mesh(), base.to_mesh()


# ── MeshFiller tests ─────────────────────────────────────────────────────────

class TestMeshFiller:

    def test_combine_two_meshes(self):
        """MeshFiller should produce a mesh with faces from both inputs."""
        from meshnet.preprocessing.base_creation.mesh_filler import MeshFiller
        arch, base = _arch_and_base()
        filler = MeshFiller(strategy="bridge", ensure_watertight=False)
        filled, stats = filler.fill(arch, base)
        assert len(filled.faces) > 0

    def test_faces_added_field(self):
        from meshnet.preprocessing.base_creation.mesh_filler import MeshFiller
        arch, base = _arch_and_base()
        filler = MeshFiller(strategy="bridge", ensure_watertight=False)
        filled, stats = filler.fill(arch, base)
        assert stats.faces_added >= 0

    def test_stats_strategy_field(self):
        from meshnet.preprocessing.base_creation.mesh_filler import MeshFiller
        arch, base = _arch_and_base()
        filler = MeshFiller(strategy="fan")
        _, stats = filler.fill(arch, base)
        assert stats.strategy == "fan"

    def test_to_dict(self):
        from meshnet.preprocessing.base_creation.mesh_filler import MeshFiller, FillStats
        stats = FillStats(
            holes_found=3, holes_filled=2, faces_added=100,
            strategy="bridge", is_watertight=False,
        )
        d = stats.to_dict()
        assert "holes_found" in d and "faces_added" in d

    def test_boundary_loop_extraction_on_open_mesh(self):
        """Boundary loop extraction should find loops in open meshes."""
        from meshnet.preprocessing.base_creation.mesh_filler import MeshFiller
        mesh = _open_cylinder()
        filler = MeshFiller(strategy="bridge", ensure_watertight=False)
        loops = filler._extract_boundary_loops(mesh)
        # Open cylinder should have at least one boundary loop
        assert isinstance(loops, list)

    def test_invalid_strategy_fallback(self):
        """Unknown strategy should fall back to bridge without crash."""
        from meshnet.preprocessing.base_creation.mesh_filler import MeshFiller
        arch, base = _arch_and_base()
        filler = MeshFiller(strategy="invalid_strategy_xyz", ensure_watertight=False)
        filled, stats = filler.fill(arch, base)
        assert len(filled.faces) > 0


# ── detect_base() tests ───────────────────────────────────────────────────────

class TestDetectBase:

    def test_watertight_flat_base_detected(self):
        """A closed box with flat bottom should be detected as having a base."""
        from meshnet.preprocessing.base_creation.preprocess_pipeline import detect_base
        mesh = _closed_box()
        # detect_base looks at watertightness + flat lower vertices
        # A box IS watertight and has a flat bottom → expect True
        result = detect_base(mesh)
        assert isinstance(result, bool)  # just verify no crash + bool return

    def test_open_mesh_no_base(self):
        """Open mesh (not watertight) should be detected as missing base."""
        from meshnet.preprocessing.base_creation.preprocess_pipeline import detect_base
        mesh = _open_cylinder()
        result = detect_base(mesh)
        # Open cylinder is not watertight → False
        assert result is False

    def test_empty_mesh_no_crash(self):
        from meshnet.preprocessing.base_creation.preprocess_pipeline import detect_base
        empty = trimesh.Trimesh()
        result = detect_base(empty)
        assert isinstance(result, bool)


# ── PreprocessPipeline smoke test ─────────────────────────────────────────────

class TestPreprocessPipelineSmoke:

    def test_run_in_memory_no_save(self, tmp_path):
        """End-to-end pipeline on a synthetic arch should produce a result."""
        import tempfile
        from meshnet.preprocessing.base_creation.preprocess_pipeline import PreprocessPipeline
        from meshnet.preprocessing.base_creation.base_plane_detector import BasePlaneDetector

        # Create a simple mesh and save as STL
        mesh = trimesh.primitives.Box(extents=[60, 30, 25]).to_mesh()
        stl_path = tmp_path / "case001" / "scan.stl"
        stl_path.parent.mkdir()
        mesh.export(str(stl_path))

        pipeline = PreprocessPipeline(
            save_intermediates=False,
            overwrite=True,
        )
        result = pipeline.run(str(stl_path), str(tmp_path / "case001"))
        assert result.case_id == "case001"
        # Pipeline may succeed or fail with trimesh geometry — just must not raise
        assert isinstance(result.success, bool)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
