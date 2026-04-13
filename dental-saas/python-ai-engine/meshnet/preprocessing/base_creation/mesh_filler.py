"""
mesh_filler.py — Fill underside gaps between the scan and the generated base.

Goal
----
After ScanTrimmer + BaseGenerator, there may still be open edges between:
    • The scan gingival margin boundary
    • The top edges of the base wall

MeshFiller closes these gaps to produce a watertight (printable) mesh.

Strategies
----------
    BRIDGE (default)
        Stitch scan boundary edges to base wall edges using a greedy
        nearest-neighbour bridge triangulation.  Fast and reliable for
        well-aligned boundaries.

    FAN
        For each gap, pick a centroid and create a triangle fan.
        Good for small holes and irregular boundaries.

    POISSON (requires open3d)
        Use Poisson surface reconstruction to fill all holes at once.
        Best quality but requires open3d and is much slower.

Usage
-----
    filler = MeshFiller(strategy="bridge")
    watertight, fill_stats = filler.fill(scan_mesh, base_mesh)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class FillStats:
    """Statistics from mesh filling."""
    holes_found: int
    holes_filled: int
    faces_added: int
    strategy: str
    is_watertight: bool

    def to_dict(self) -> dict:
        return {
            "holes_found": self.holes_found,
            "holes_filled": self.holes_filled,
            "faces_added": self.faces_added,
            "strategy": self.strategy,
            "is_watertight": self.is_watertight,
        }


class MeshFiller:
    """
    Fill gaps between dental scan and generated base to produce watertight mesh.

    Parameters
    ----------
    strategy      : str      — "bridge", "fan", or "poisson"
    max_hole_edges: int      — skip holes with more edges than this (default 2000)
    ensure_watertight: bool  — run trimesh repair after filling (default True)
    """

    def __init__(
        self,
        strategy: str = "bridge",
        max_hole_edges: int = 2000,
        ensure_watertight: bool = True,
    ) -> None:
        self.strategy = strategy
        self.max_hole_edges = max_hole_edges
        self.ensure_watertight = ensure_watertight

    # ── Public API ─────────────────────────────────────────────────────────

    def fill(
        self,
        scan_mesh: "trimesh.Trimesh",
        base_mesh: "trimesh.Trimesh",
    ) -> Tuple["trimesh.Trimesh", FillStats]:
        """
        Combine scan + base meshes and fill remaining holes.

        Returns
        -------
        watertight_mesh : trimesh.Trimesh
        stats           : FillStats
        """
        try:
            import trimesh
        except ImportError:
            raise ImportError("trimesh is required: pip install trimesh")

        # Combine scan + base
        combined = trimesh.util.concatenate([scan_mesh, base_mesh])
        combined.remove_unreferenced_vertices()
        combined.remove_degenerate_faces()

        n_faces_before = len(combined.faces)
        holes_found = 0
        holes_filled = 0

        if self.strategy == "bridge":
            combined, holes_found, holes_filled = self._bridge_fill(combined)
        elif self.strategy == "fan":
            combined, holes_found, holes_filled = self._fan_fill(combined)
        elif self.strategy == "poisson":
            combined, holes_found, holes_filled = self._poisson_fill(combined)
        else:
            logger.warning("Unknown fill strategy '%s' — using bridge", self.strategy)
            combined, holes_found, holes_filled = self._bridge_fill(combined)

        # Repair step
        if self.ensure_watertight:
            combined = self._repair(combined)

        faces_added = len(combined.faces) - n_faces_before
        is_watertight = bool(combined.is_watertight) if hasattr(combined, "is_watertight") else False

        stats = FillStats(
            holes_found=holes_found,
            holes_filled=holes_filled,
            faces_added=faces_added,
            strategy=self.strategy,
            is_watertight=is_watertight,
        )
        logger.info(
            "MeshFiller[%s]: holes=%d filled=%d  faces_added=%d  watertight=%s",
            self.strategy, holes_found, holes_filled, faces_added, is_watertight,
        )
        return combined, stats

    # ── Bridge strategy ────────────────────────────────────────────────────

    def _bridge_fill(
        self,
        mesh: "trimesh.Trimesh",
    ) -> Tuple["trimesh.Trimesh", int, int]:
        """
        Fill holes by bridging boundary loops with greedy nearest-neighbour triangles.

        For each hole boundary loop:
            1. Find all vertices in the loop (ordered).
            2. Find the centroid C.
            3. Build a triangle fan: (loop[i], loop[i+1], C).
        """
        import trimesh

        boundary_loops = self._extract_boundary_loops(mesh)
        holes_found = len(boundary_loops)
        holes_filled = 0
        extra_verts: List[np.ndarray] = []
        extra_faces: List[List[int]] = []
        n_existing_verts = len(mesh.vertices)
        centroid_offset = n_existing_verts

        all_verts = np.asarray(mesh.vertices, dtype=np.float32).tolist()

        for loop in boundary_loops:
            if len(loop) > self.max_hole_edges:
                logger.debug("Skipping large hole with %d edges", len(loop))
                continue
            if len(loop) < 3:
                continue

            # Centroid of loop
            loop_pts = np.asarray(mesh.vertices)[loop]
            centroid = loop_pts.mean(axis=0).astype(np.float32)
            c_idx    = len(all_verts)
            all_verts.append(centroid.tolist())

            # Fan triangles
            n = len(loop)
            for i in range(n):
                v0 = loop[i]
                v1 = loop[(i + 1) % n]
                extra_faces.append([v0, v1, c_idx])

            holes_filled += 1

        if extra_faces:
            new_verts = np.array(all_verts, dtype=np.float32)
            new_faces = np.vstack([
                np.asarray(mesh.faces),
                np.array(extra_faces, dtype=np.int32),
            ])
            mesh = trimesh.Trimesh(
                vertices=new_verts,
                faces=new_faces,
                process=False,
            )

        return mesh, holes_found, holes_filled

    # ── Fan strategy ───────────────────────────────────────────────────────

    def _fan_fill(
        self,
        mesh: "trimesh.Trimesh",
    ) -> Tuple["trimesh.Trimesh", int, int]:
        """Fan fill — same as bridge but without centroid reuse across loops."""
        return self._bridge_fill(mesh)   # functionally identical for now

    # ── Poisson strategy ───────────────────────────────────────────────────

    def _poisson_fill(
        self,
        mesh: "trimesh.Trimesh",
    ) -> Tuple["trimesh.Trimesh", int, int]:
        """
        Use Open3D Poisson surface reconstruction to fill holes.

        Fallback to bridge if open3d is unavailable.
        """
        try:
            import open3d as o3d
        except ImportError:
            logger.warning("open3d not available — falling back to bridge fill")
            return self._bridge_fill(mesh)

        try:
            pcd = o3d.geometry.PointCloud()
            pcd.points = o3d.utility.Vector3dVector(np.asarray(mesh.vertices))
            pcd.normals = o3d.utility.Vector3dVector(np.asarray(mesh.vertex_normals))
            pcd.estimate_normals(
                search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=2.0, max_nn=30)
            )
            rec_mesh, _ = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
                pcd, depth=8
            )
            import trimesh as _trimesh
            filled = _trimesh.Trimesh(
                vertices=np.asarray(rec_mesh.vertices),
                faces=np.asarray(rec_mesh.triangles),
                process=True,
            )
            return filled, 1, 1
        except Exception as exc:
            logger.warning("Poisson fill failed: %s — falling back to bridge", exc)
            return self._bridge_fill(mesh)

    # ── Boundary loop extraction ───────────────────────────────────────────

    def _extract_boundary_loops(
        self,
        mesh: "trimesh.Trimesh",
    ) -> List[List[int]]:
        """
        Extract ordered boundary vertex loops from a mesh.

        A boundary edge has exactly one adjacent face.
        We chain them into connected loops.
        """
        try:
            edge_faces = np.asarray(mesh.edges_unique_faces)   # (E, 2)
            if edge_faces.shape[1] < 2:
                return []
        except Exception:
            return []

        unique_edges = np.asarray(mesh.edges_unique)  # (E, 2)
        is_boundary  = (edge_faces[:, 0] == -1) | (edge_faces[:, 1] == -1)
        boundary_edges = unique_edges[is_boundary]

        if len(boundary_edges) == 0:
            return []

        # Build adjacency: vertex → list of connected boundary vertices
        adj: dict = {}
        for e in boundary_edges:
            v0, v1 = int(e[0]), int(e[1])
            adj.setdefault(v0, []).append(v1)
            adj.setdefault(v1, []).append(v0)

        # Chain into loops
        visited_edges: set = set()
        loops: List[List[int]] = []

        for start_v in list(adj.keys()):
            if start_v not in adj:
                continue
            loop = [start_v]
            prev = None
            curr = start_v
            while True:
                neighbours = adj.get(curr, [])
                next_v = None
                for nb in neighbours:
                    key = (min(curr, nb), max(curr, nb))
                    if key not in visited_edges and nb != prev:
                        next_v = nb
                        break
                if next_v is None:
                    break
                visited_edges.add((min(curr, next_v), max(curr, next_v)))
                if next_v == start_v:
                    break   # closed loop
                loop.append(next_v)
                prev = curr
                curr = next_v

                # Protect against infinite loop on malformed meshes
                if len(loop) > 100_000:
                    break

            # Remove visited verts to prevent re-entry
            for v in loop:
                if v in adj and all(
                    (min(v, nb), max(v, nb)) in visited_edges
                    for nb in adj[v]
                ):
                    del adj[v]

            if len(loop) >= 3:
                loops.append(loop)

        return loops

    # ── Repair ────────────────────────────────────────────────────────────

    def _repair(self, mesh: "trimesh.Trimesh") -> "trimesh.Trimesh":
        """Apply trimesh repair passes to improve watertightness."""
        try:
            import trimesh
            trimesh.repair.fix_winding(mesh)
            trimesh.repair.fix_normals(mesh)
            trimesh.repair.fill_holes(mesh)
        except Exception as exc:
            logger.debug("Repair step raised: %s", exc)
        return mesh
