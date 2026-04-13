"""
base_generator.py — Create a flat printable base from the gingival margin loop.

Algorithm
---------
1. Extract the gingival margin — the lowest closed boundary loop of the scan.
2. Project the margin vertices vertically onto the base plane.
3. Compute the 2D convex hull (XY) of the projected margin.
4. Triangulate the convex hull polygon into a flat base cap.
5. Generate the lateral wall: connect each margin edge to its projection
   using two triangles (a quad strip).

Output is a trimesh.Trimesh representing ONLY the base geometry.
This is combined with the trimmed scan body by MeshFiller.

Usage
-----
    detector   = BasePlaneDetector()
    plane      = detector.detect(mesh)

    generator  = BaseGenerator(n_hull_points=64)
    base_mesh  = generator.generate(scan_mesh, plane)
"""

from __future__ import annotations

import logging
from typing import List, Optional, Tuple

import numpy as np

from .base_plane_detector import BasePlane

logger = logging.getLogger(__name__)


class BaseGenerator:
    """
    Generates a flat 3D-printable base from the gingival margin.

    Parameters
    ----------
    n_hull_points : int
        Number of vertices on the convex hull base polygon.
        More points → smoother base outline.  Default: 64.
    wall_smoothing : bool
        If True, smooth the wall edge loop before triangulation.
        Prevents sharp kinks at the base–wall junction.  Default: True.
    base_thickness_mm : float
        Constant extra thickness added below z_level.
        Creates a completely flat base face.  Default: 2.0 mm.
    """

    def __init__(
        self,
        n_hull_points: int = 64,
        wall_smoothing: bool = True,
        base_thickness_mm: float = 2.0,
    ) -> None:
        self.n_hull_points = int(n_hull_points)
        self.wall_smoothing = wall_smoothing
        self.base_thickness_mm = float(base_thickness_mm)

    # ── Public API ─────────────────────────────────────────────────────────

    def generate(
        self,
        scan_mesh: "trimesh.Trimesh",
        plane:     BasePlane,
    ) -> "trimesh.Trimesh":
        """
        Generate a base mesh for a dental scan.

        Parameters
        ----------
        scan_mesh : trimesh.Trimesh — cleaned scan (after ScanTrimmer)
        plane     : BasePlane      — detected base plane

        Returns
        -------
        trimesh.Trimesh — base geometry only (wall + flat cap)
        """
        try:
            import trimesh
        except ImportError:
            raise ImportError("trimesh is required: pip install trimesh")

        # ── Step 1: Extract margin (lower boundary loop) ──────────────────
        margin_verts = self._extract_margin_vertices(scan_mesh)

        # ── Step 2: Project margin onto base plane ─────────────────────────
        projected = plane.project_to_plane(margin_verts)
        # Force Z = plane.z_level
        projected[:, 2] = plane.z_level

        # ── Step 3: Compute convex hull in XY ─────────────────────────────
        hull_pts_2d = self._convex_hull_2d(projected[:, :2])  # (H, 2)
        hull_pts_3d = np.column_stack([
            hull_pts_2d,
            np.full(len(hull_pts_2d), plane.z_level),
        ])

        # ── Step 4: Triangulate flat base cap ─────────────────────────────
        base_cap = self._triangulate_base_cap(hull_pts_3d, plane)

        # ── Step 5: Generate wall strip ────────────────────────────────────
        # Find the actual margin loop from the scan
        wall = self._generate_wall_strip(
            margin_verts, hull_pts_3d, plane
        )

        # ── Combine ────────────────────────────────────────────────────────
        parts = [p for p in [base_cap, wall] if p is not None and len(p.faces) > 0]
        if not parts:
            logger.warning("BaseGenerator: no geometry produced — returning empty mesh")
            return trimesh.Trimesh()

        base_mesh = trimesh.util.concatenate(parts)
        base_mesh.remove_unreferenced_vertices()
        base_mesh.remove_degenerate_faces()

        logger.info(
            "BaseGenerator: base has %d faces, %d vertices",
            len(base_mesh.faces), len(base_mesh.vertices),
        )
        return base_mesh

    # ── Internal helpers ───────────────────────────────────────────────────

    def _extract_margin_vertices(
        self,
        mesh: "trimesh.Trimesh",
    ) -> np.ndarray:
        """
        Extract the lower boundary loop of the scan.

        Strategy:
            1. Find all boundary edges (edges with only one adjacent face).
            2. Keep boundary vertices in the lower 20% of the scan Z range.
            3. Return these as the gingival margin approximation.
        """
        try:
            # trimesh exposes boundary as outline
            boundary = mesh.outline()
            if boundary and len(boundary.entities) > 0:
                # Flatten all boundary path vertices
                bv_idx = []
                for entity in boundary.entities:
                    bv_idx.extend(entity.points.tolist())
                bv_idx = list(set(bv_idx))
                boundary_pts = boundary.vertices[bv_idx]
            else:
                raise ValueError("No boundary outline")
        except Exception:
            # Fallback: use raw boundary edge detection
            boundary_pts = self._boundary_fallback(mesh)

        # Keep lower portion (gingival margin approximation)
        if len(boundary_pts) == 0:
            return np.array([[0, 0, 0]], dtype=np.float64)

        z = boundary_pts[:, 2]
        z_min, z_max = float(z.min()), float(z.max())
        z_thresh = z_min + (z_max - z_min) * 0.30   # lower 30%
        margin = boundary_pts[z <= z_thresh]
        if len(margin) < 4:
            margin = boundary_pts

        return margin.astype(np.float64)

    def _boundary_fallback(self, mesh: "trimesh.Trimesh") -> np.ndarray:
        """Return boundary vertices by edge-count analysis."""
        edges = np.asarray(mesh.edges)   # (E*3, 2) — all directed edges
        # Unique undirected edges and their face count
        unique_edges, counts = np.unique(
            np.sort(edges, axis=1), axis=0, return_counts=True
        )
        boundary_edge_verts = unique_edges[counts == 1].reshape(-1)
        boundary_vert_idx   = np.unique(boundary_edge_verts)
        return np.asarray(mesh.vertices)[boundary_vert_idx]

    def _convex_hull_2d(self, pts_2d: np.ndarray) -> np.ndarray:
        """
        2D convex hull of XY points, returned as ordered polygon.
        Re-sampled to n_hull_points for a smooth outline.
        """
        try:
            from scipy.spatial import ConvexHull
            hull = ConvexHull(pts_2d)
            hull_pts = pts_2d[hull.vertices]  # (H, 2)
        except Exception:
            # Fallback: centred circle
            angles = np.linspace(0, 2 * np.pi, self.n_hull_points, endpoint=False)
            cx, cy = pts_2d[:, 0].mean(), pts_2d[:, 1].mean()
            r = float(np.linalg.norm(pts_2d - [cx, cy], axis=1).max())
            hull_pts = np.column_stack([
                cx + r * np.cos(angles),
                cy + r * np.sin(angles),
            ])
            return hull_pts

        # Resample hull polygon to n_hull_points using cumulative arc length
        hull_closed = np.vstack([hull_pts, hull_pts[0]])
        diffs = np.diff(hull_closed, axis=0)
        seg_lens = np.linalg.norm(diffs, axis=1)
        cum_len = np.concatenate([[0.0], seg_lens.cumsum()])
        total_len = float(cum_len[-1])
        if total_len < 1e-9:
            return hull_pts

        sample_t = np.linspace(0.0, total_len, self.n_hull_points, endpoint=False)
        resampled = np.column_stack([
            np.interp(sample_t, cum_len, hull_closed[:, 0]),
            np.interp(sample_t, cum_len, hull_closed[:, 1]),
        ])
        return resampled.astype(np.float64)

    def _triangulate_base_cap(
        self,
        hull_3d: np.ndarray,
        plane: BasePlane,
    ) -> Optional["trimesh.Trimesh"]:
        """
        Triangulate the convex hull polygon into a flat mesh cap using a fan.

        Also creates a parallel cap base_thickness_mm below for a solid base.
        """
        try:
            import trimesh

            H = len(hull_3d)
            centroid = hull_3d.mean(axis=0)

            # Top cap (at z_level) — fan triangulation
            # Bottom cap (at z_level - base_thickness) — fan, reversed normals
            z_bottom = plane.z_level - self.base_thickness_mm

            top_verts = np.vstack([hull_3d, centroid.reshape(1, 3)])        # (H+1, 3)
            bot_verts = top_verts.copy()
            bot_verts[:, 2] = z_bottom

            center_idx_top = H
            center_idx_bot = H

            # Fan faces for top cap (outward normal = +Z)
            faces_top = []
            for i in range(H):
                faces_top.append([i, (i + 1) % H, center_idx_top])

            # Fan faces for bottom cap (outward normal = -Z, reversed winding)
            faces_bot = []
            for i in range(H):
                faces_bot.append([i, center_idx_bot, (i + 1) % H])

            # Side faces connecting top and bottom hull rims
            n_top = len(top_verts)
            all_verts = np.vstack([top_verts, bot_verts])  # (2*(H+1), 3)
            faces_side = []
            for i in range(H):
                j = (i + 1) % H
                t0, t1 = i, j
                b0, b1 = i + n_top, j + n_top
                faces_side.append([t0, b0, t1])
                faces_side.append([t1, b0, b1])

            all_faces = (
                [[f[0], f[1], f[2]] for f in faces_top]
                + [[f[0] + n_top, f[1] + n_top, f[2] + n_top] for f in faces_bot]
                + faces_side
            )

            return trimesh.Trimesh(
                vertices=all_verts.astype(np.float32),
                faces=np.array(all_faces, dtype=np.int32),
                process=False,
            )
        except Exception as exc:
            logger.warning("Base cap triangulation failed: %s", exc)
            return None

    def _generate_wall_strip(
        self,
        margin_verts: np.ndarray,    # (M, 3) actual margin from scan
        hull_3d:      np.ndarray,    # (H, 3) hull at z_level
        plane:        BasePlane,
    ) -> Optional["trimesh.Trimesh"]:
        """
        Generate a wall strip connecting the scan margin to the base hull.

        Strategy: for each margin vertex, find the nearest hull point,
        then create quad strips from margin → hull projected.
        """
        try:
            import trimesh
            from scipy.spatial import cKDTree

            if len(margin_verts) < 3 or len(hull_3d) < 3:
                return None

            tree = cKDTree(hull_3d[:, :2])
            _, nearest_hull = tree.query(margin_verts[:, :2])   # (M,)

            # For clean wall: project each margin vertex down to z_level
            projected_margin = margin_verts.copy()
            projected_margin[:, 2] = plane.z_level

            # Build quad strip: margin → projected_margin
            M = len(margin_verts)
            verts = np.vstack([margin_verts, projected_margin])  # (2M, 3)

            faces = []
            for i in range(M):
                j = (i + 1) % M
                # Quad: [top_i, top_j, bot_j] + [top_i, bot_j, bot_i]
                faces.append([i, j, j + M])
                faces.append([i, j + M, i + M])

            return trimesh.Trimesh(
                vertices=verts.astype(np.float32),
                faces=np.array(faces, dtype=np.int32),
                process=False,
            )
        except Exception as exc:
            logger.warning("Wall strip generation failed: %s", exc)
            return None
