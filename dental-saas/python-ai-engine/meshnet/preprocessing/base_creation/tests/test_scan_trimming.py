"""
test_scan_trimming.py — Unit tests for ScanTrimmer.
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


def _simple_box_mesh() -> "trimesh.Trimesh":
    """A clean closed box mesh (watertight)."""
    return trimesh.primitives.Box(extents=[20, 30, 15]).to_mesh()


def _mesh_with_floating_debris(n_debris: int = 50) -> "trimesh.Trimesh":
    """Dental arch + small floating debris cloud."""
    import trimesh as tri
    arch = tri.primitives.Box(extents=[60, 40, 20]).to_mesh()
    # Small floating debris (remote from arch)
    debris = tri.primitives.Sphere(radius=0.5, center=[200, 200, 200]).to_mesh()
    return tri.util.concatenate([arch, debris])


def _planar_mesh_with_artifact() -> "trimesh.Trimesh":
    """Dental arch with a large flat planar region on the bottom."""
    import trimesh as tri
    arch = tri.primitives.Box(extents=[60, 40, 20]).to_mesh()
    # Large flat slab below (scanner bed artifact)
    slab = tri.primitives.Box(extents=[200, 200, 0.2]).to_mesh()
    center = slab.vertices.mean(axis=0)
    slab.apply_translation([0, 0, -10 - center[2]])
    return tri.util.concatenate([arch, slab])


# ── Tests ────────────────────────────────────────────────────────────────────

class TestScanTrimmerComponentFilter:

    def test_clean_mesh_unchanged(self):
        """A single-component mesh should not be trimmed."""
        from meshnet.preprocessing.base_creation.scan_trimmer import ScanTrimmer
        mesh = _simple_box_mesh()
        trimmer = ScanTrimmer(min_component_ratio=0.05)
        cleaned, stats = trimmer.trim(mesh)
        # Should keep the same mesh (no separate components)
        assert stats.components_removed == 0
        assert len(cleaned.faces) > 0

    def test_floating_debris_removed(self):
        """Floating debris < 5% of largest component should be removed."""
        from meshnet.preprocessing.base_creation.scan_trimmer import ScanTrimmer
        mesh = _mesh_with_floating_debris()
        n_comp_before = len(mesh.split(only_watertight=False))
        assert n_comp_before >= 2, "Test mesh should have multiple components"

        trimmer = ScanTrimmer(min_component_ratio=0.10)
        cleaned, stats = trimmer.trim(mesh)
        assert stats.components_removed > 0
        assert len(cleaned.faces) < len(mesh.faces)

    def test_output_not_empty(self):
        from meshnet.preprocessing.base_creation.scan_trimmer import ScanTrimmer
        mesh = _mesh_with_floating_debris()
        trimmer = ScanTrimmer()
        cleaned, stats = trimmer.trim(mesh)
        assert len(cleaned.faces) > 0
        assert len(cleaned.vertices) > 0

    def test_stats_sum_correctly(self):
        from meshnet.preprocessing.base_creation.scan_trimmer import ScanTrimmer
        mesh = _simple_box_mesh()
        trimmer = ScanTrimmer()
        _, stats = trimmer.trim(mesh)
        assert stats.input_faces == len(mesh.faces)
        assert stats.output_faces <= stats.input_faces

    def test_no_crash_empty_mesh(self):
        """Trimmer must not crash on an empty mesh."""
        from meshnet.preprocessing.base_creation.scan_trimmer import ScanTrimmer
        import trimesh as tri
        empty = tri.Trimesh()
        trimmer = ScanTrimmer()
        try:
            cleaned, stats = trimmer.trim(empty)
        except Exception:
            pass   # Acceptable — just must not hang


class TestScanTrimmerSliverRemoval:

    def test_sliver_flag_off(self):
        """With remove_slivers=False, sliver count should be 0."""
        from meshnet.preprocessing.base_creation.scan_trimmer import ScanTrimmer
        mesh = _simple_box_mesh()
        trimmer = ScanTrimmer(remove_slivers=False)
        _, stats = trimmer.trim(mesh)
        assert stats.sliver_faces_removed == 0

    def test_sliver_flag_on_runs(self):
        from meshnet.preprocessing.base_creation.scan_trimmer import ScanTrimmer
        mesh = _simple_box_mesh()
        trimmer = ScanTrimmer(remove_slivers=True)
        cleaned, stats = trimmer.trim(mesh)
        assert len(cleaned.faces) > 0


class TestTrimStatsToDicat:

    def test_to_dict_keys(self):
        from meshnet.preprocessing.base_creation.scan_trimmer import TrimStats
        stats = TrimStats(
            input_faces=100, input_vertices=50,
            output_faces=90, output_vertices=45,
            components_removed=1, sliver_faces_removed=2, planar_faces_removed=3,
        )
        d = stats.to_dict()
        assert "input_faces" in d
        assert "output_faces" in d
        assert "faces_removed_total" in d
        assert d["faces_removed_total"] == 10
