"""
scan_trimmer.py — Remove floating triangles, scanner artifacts, and noisy edges.

Problem
-------
Raw intraoral STL scans often contain:
    • Floating components disconnected from the main tooth arch
    • Scanner edge artifacts (thin slivers, near-degenerate triangles)
    • Overextended boundaries from the scanner tray border
    • Large flat planar regions (scanner bed reflection artifacts)

Solution
--------
Three-pass cleaning:

    Pass 1 — Component filtering
        Keep only the largest connected component(s) by face count.
        Discards floating debris, saliva bubbles, retractor artefacts.

    Pass 2 — Curvature threshold
        Remove isolated faces with near-zero local curvature that form
        large flat planar patches (scanner bed artefacts).

    Pass 3 — Boundary edge cleaning
        Remove faces whose all three edges are boundary edges (naked triangles)
        — these are degenerate scan slivers.

Usage
-----
    trimmer = ScanTrimmer(
        min_component_ratio=0.05,       # keep components ≥ 5% of largest
        planar_artifact_area_mm2=200.0, # remove flat patches > 200 mm²
        remove_slivers=True,
    )
    clean_mesh = trimmer.trim(raw_mesh)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class TrimStats:
    """Statistics from a trim operation."""
    input_faces: int
    input_vertices: int
    output_faces: int
    output_vertices: int
    components_removed: int
    sliver_faces_removed: int
    planar_faces_removed: int

    @property
    def faces_removed(self) -> int:
        return self.input_faces - self.output_faces

    def to_dict(self) -> dict:
        return {
            "input_faces": self.input_faces,
            "input_vertices": self.input_vertices,
            "output_faces": self.output_faces,
            "output_vertices": self.output_vertices,
            "components_removed": self.components_removed,
            "sliver_faces_removed": self.sliver_faces_removed,
            "planar_faces_removed": self.planar_faces_removed,
            "faces_removed_total": self.faces_removed,
        }


class ScanTrimmer:
    """
    Cleans raw intraoral scan STL meshes.

    Parameters
    ----------
    min_component_ratio : float
        Minimum size of a kept component relative to the largest one.
        Components smaller than (largest × ratio) are discarded.
        Default: 0.05  (keep components ≥ 5% of largest)
    planar_artifact_area_mm2 : float
        Remove large flat planar component groups whose total area exceeds
        this value.  These are typically scanner bed reflections.
        Default: 200.0 mm²
    remove_slivers : bool
        If True, remove faces where all three edges are naked (boundary).
        These are scanner-edge slivers that cause watertight failures.
        Default: True
    curvature_artifact_threshold : float
        Faces with average curvature below this value AND forming isolated
        planar islands are considered artifacts.  Default: 0.005
    """

    def __init__(
        self,
        min_component_ratio: float = 0.05,
        planar_artifact_area_mm2: float = 200.0,
        remove_slivers: bool = True,
        curvature_artifact_threshold: float = 0.005,
    ) -> None:
        self.min_component_ratio = min_component_ratio
        self.planar_artifact_area_mm2 = planar_artifact_area_mm2
        self.remove_slivers = remove_slivers
        self.curvature_artifact_threshold = curvature_artifact_threshold

    # ── Public API ─────────────────────────────────────────────────────────

    def trim(self, mesh: "trimesh.Trimesh") -> Tuple["trimesh.Trimesh", TrimStats]:
        """
        Apply all three cleaning passes to a mesh.

        Parameters
        ----------
        mesh : trimesh.Trimesh

        Returns
        -------
        cleaned_mesh : trimesh.Trimesh
        stats        : TrimStats
        """
        try:
            import trimesh
        except ImportError:
            raise ImportError("trimesh is required: pip install trimesh")

        in_faces = len(mesh.faces)
        in_verts = len(mesh.vertices)
        n_comp_removed = 0
        n_slivers = 0
        n_planar = 0

        # ── Pass 1: Component filtering ────────────────────────────────────
        mesh, n_comp_removed = self._filter_components(mesh)

        # ── Pass 2: Planar artifact removal ───────────────────────────────
        mesh, n_planar = self._remove_planar_artifacts(mesh)

        # ── Pass 3: Sliver removal ─────────────────────────────────────────
        if self.remove_slivers:
            mesh, n_slivers = self._remove_slivers(mesh)

        # Final cleanup
        mesh.remove_unreferenced_vertices()
        mesh.remove_degenerate_faces()

        stats = TrimStats(
            input_faces=in_faces,
            input_vertices=in_verts,
            output_faces=len(mesh.faces),
            output_vertices=len(mesh.vertices),
            components_removed=n_comp_removed,
            sliver_faces_removed=n_slivers,
            planar_faces_removed=n_planar,
        )
        logger.info(
            "ScanTrimmer: %d faces → %d  (removed: %d comp, %d planar, %d slivers)",
            in_faces, len(mesh.faces), n_comp_removed, n_planar, n_slivers,
        )
        return mesh, stats

    # ── Pass 1: Component filtering ────────────────────────────────────────

    def _filter_components(
        self,
        mesh: "trimesh.Trimesh",
    ) -> Tuple["trimesh.Trimesh", int]:
        """Keep only components whose face count ≥ min_component_ratio × largest."""
        components = mesh.split(only_watertight=False)
        if len(components) <= 1:
            return mesh, 0

        # Sort by face count descending
        components = sorted(components, key=lambda m: len(m.faces), reverse=True)
        max_faces = len(components[0].faces)
        min_faces = max(1, int(max_faces * self.min_component_ratio))

        kept    = [c for c in components if len(c.faces) >= min_faces]
        removed = len(components) - len(kept)

        if not kept:
            logger.warning("All components removed — returning original mesh")
            return mesh, 0

        import trimesh
        combined = trimesh.util.concatenate(kept)
        return combined, removed

    # ── Pass 2: Planar artifact removal ────────────────────────────────────

    def _remove_planar_artifacts(
        self,
        mesh: "trimesh.Trimesh",
    ) -> Tuple["trimesh.Trimesh", int]:
        """
        Remove flat planar regions likely caused by scanner bed reflections.

        Strategy:
            1. Compute face normals relative to median normal direction
            2. Flag faces whose normal is within 10° of a horizontal plane
            3. Group these into connected regions
            4. Remove regions whose total area > planar_artifact_area_mm2
        """
        import trimesh

        face_normals = np.asarray(mesh.face_normals)  # (F, 3)
        face_areas   = np.asarray(mesh.area_faces)    # (F,)

        # Identify near-horizontal faces (normals close to ±Z)
        z_component = np.abs(face_normals[:, 2])
        horizontal_mask = z_component > np.cos(np.radians(10))  # within 10° of Z

        if not horizontal_mask.any():
            return mesh, 0

        # Find connected groups of horizontal faces via BFS on adjacency
        faces = np.asarray(mesh.faces)
        horiz_face_ids = np.where(horizontal_mask)[0]

        # Build vertex → face adjacency for BFS
        V = len(mesh.vertices)
        v2f: List[List[int]] = [[] for _ in range(V)]
        for fi, face in enumerate(faces):
            for v in face:
                v2f[v].append(fi)

        visited = np.zeros(len(faces), dtype=bool)
        faces_to_remove: List[int] = []

        for start in horiz_face_ids:
            if visited[start]:
                continue
            # BFS over connected horizontal faces
            group = []
            queue = [start]
            while queue:
                fi = queue.pop()
                if visited[fi]:
                    continue
                visited[fi] = True
                if not horizontal_mask[fi]:
                    continue
                group.append(fi)
                for v in faces[fi]:
                    for nb_fi in v2f[v]:
                        if not visited[nb_fi] and horizontal_mask[nb_fi]:
                            queue.append(nb_fi)

            group_area = face_areas[group].sum()
            if group_area > self.planar_artifact_area_mm2:
                faces_to_remove.extend(group)

        if not faces_to_remove:
            return mesh, 0

        n_removed = len(faces_to_remove)
        keep_mask = np.ones(len(faces), dtype=bool)
        keep_mask[faces_to_remove] = False
        new_faces = faces[keep_mask]

        cleaned = trimesh.Trimesh(
            vertices=np.asarray(mesh.vertices),
            faces=new_faces,
            process=False,
        )
        cleaned.remove_unreferenced_vertices()
        return cleaned, n_removed

    # ── Pass 3: Sliver removal ─────────────────────────────────────────────

    def _remove_slivers(
        self,
        mesh: "trimesh.Trimesh",
    ) -> Tuple["trimesh.Trimesh", int]:
        """
        Remove scanner-edge slivers: faces where all three edges are boundary edges.

        Boundary edges = edges belonging to exactly one face.
        Slivers that are fully surrounded by nothing but boundary edges
        are degenerate extensions of the scan boundary.
        """
        import trimesh

        edges = np.asarray(mesh.edges_unique)   # (E, 2)
        edge_faces = mesh.edges_unique_faces     # (E, 2)  — -1 for boundary edge

        # An edge is a boundary edge if one side is -1
        is_boundary_edge = (edge_faces[:, 0] == -1) | (edge_faces[:, 1] == -1)

        # Map edge index → is_boundary
        # Build face → its 3 edges lookup
        face_edges = np.asarray(mesh.edges_face)  # (F*3,) — face index per raw edge

        # Simpler approach: use trimesh's built-in boundary detection
        try:
            # edges_unique_faces gives the two faces per unique edge; -1 = boundary
            # Count boundary edges per face
            face_to_boundary_count = np.zeros(len(mesh.faces), dtype=np.int32)
            for i, (f0, f1) in enumerate(edge_faces):
                if f0 == -1 and f1 != -1:
                    face_to_boundary_count[f1] += 1
                elif f1 == -1 and f0 != -1:
                    face_to_boundary_count[f0] += 1
        except Exception:
            return mesh, 0

        # Faces with all 3 edges being boundary edges (completely isolated slivers)
        sliver_mask = face_to_boundary_count == 3

        # Iterative: also remove faces where 2 edges are boundary AND they neighbour
        # a sliver face — repeat until stable
        for _ in range(3):
            new_slivers = face_to_boundary_count >= 2
            new_slivers &= ~sliver_mask
            if not new_slivers.any():
                break
            # Check if their non-boundary neighbour is itself a sliver
            for fi in np.where(new_slivers)[0]:
                for j, (f0, f1) in enumerate(edge_faces):
                    if (f0 == fi and sliver_mask[f1]) or (f1 == fi and sliver_mask[f0]):
                        sliver_mask[fi] = True
                        break

        n_slivers = int(sliver_mask.sum())
        if n_slivers == 0:
            return mesh, 0

        keep_mask = ~sliver_mask
        new_faces = np.asarray(mesh.faces)[keep_mask]
        cleaned = trimesh.Trimesh(
            vertices=np.asarray(mesh.vertices),
            faces=new_faces,
            process=False,
        )
        cleaned.remove_unreferenced_vertices()
        return cleaned, n_slivers
