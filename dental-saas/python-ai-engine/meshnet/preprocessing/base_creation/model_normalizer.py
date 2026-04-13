"""
model_normalizer.py — Align, centre, and orient a dental model for printing.

Goals
-----
    1. Align the occlusal plane to horizontal (Z = constant)
    2. Centre the model in XY (dental arch centred at origin)
    3. Place the base flat at Z = 0  (base rests on print bed)

Algorithm
---------
    STEP 1: Detect occlusal plane
        PCA on the top 30% of vertices → the 1st and 2nd PC span the plane.
        Normal = PC3 = direction of maximum change (tooth height).

    STEP 2: Align occlusal plane to Z
        Compute rotation to align the occlusal normal to [0, 0, 1].
        Apply rotation via Rodrigues formula.

    STEP 3: Centre in XY
        After rotation: translate so that AABB centroid = (0, 0, z_min).

    STEP 4: Base to Z = 0
        Translate so that the lowest Z vertex is at Z = 0.

    STEP 5: Final flip check
        Ensure teeth point upward (positive Z).
        If teeth are downward, flip 180° around X axis.

Usage
-----
    normalizer = ModelNormalizer(flip_check=True)
    aligned_mesh, norm_meta = normalizer.normalize(model_mesh)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class NormMetadata:
    """Metadata from a normalization operation."""
    rotation_matrix: np.ndarray          # (3, 3)
    translation:     np.ndarray          # (3,)
    occlusal_normal_before: np.ndarray   # (3,) — detected occlusal normal
    scale:           float = 1.0         # if rescaling was applied (default: none)
    flipped:         bool = False
    z_min_before:    float = 0.0
    z_min_after:     float = 0.0

    def to_dict(self) -> dict:
        return {
            "rotation_matrix": self.rotation_matrix.tolist(),
            "translation": self.translation.tolist(),
            "occlusal_normal_before": self.occlusal_normal_before.tolist(),
            "scale": self.scale,
            "flipped": self.flipped,
            "z_min_before": round(float(self.z_min_before), 4),
            "z_min_after": round(float(self.z_min_after), 4),
        }


class ModelNormalizer:
    """
    Normalize dental model orientation for 3D printing.

    Parameters
    ----------
    flip_check          : bool  — check and flip if teeth point downward
    upper_pct           : float — fraction of top vertices to use for occlusal
                                   plane detection (default 0.30 = top 30%)
    target_height_mm    : float — rescale to fixed arch height (None = no rescale)
    """

    def __init__(
        self,
        flip_check: bool = True,
        upper_pct: float = 0.30,
        target_height_mm: Optional[float] = None,
    ) -> None:
        self.flip_check = flip_check
        self.upper_pct = float(upper_pct)
        self.target_height_mm = target_height_mm

    # ── Public API ─────────────────────────────────────────────────────────

    def normalize(
        self,
        mesh: "trimesh.Trimesh",
    ) -> Tuple["trimesh.Trimesh", NormMetadata]:
        """
        Normalize mesh orientation for dental printing.

        Returns
        -------
        aligned_mesh : trimesh.Trimesh
        meta         : NormMetadata
        """
        try:
            import trimesh
        except ImportError:
            raise ImportError("trimesh is required: pip install trimesh")

        vertices = np.asarray(mesh.vertices, dtype=np.float64)
        z_min_before = float(vertices[:, 2].min())

        # ── Step 1+2: Detect + align occlusal plane ───────────────────────
        occlusal_normal = self._detect_occlusal_normal(vertices)
        R = self._rotation_to_z(occlusal_normal)
        vertices = (R @ vertices.T).T

        # ── Step 3: Centre in XY ───────────────────────────────────────────
        xy_centroid = vertices[:, :2].mean(axis=0)
        vertices[:, 0] -= xy_centroid[0]
        vertices[:, 1] -= xy_centroid[1]

        # ── Step 4: Base to Z = 0 ──────────────────────────────────────────
        z_shift = -vertices[:, 2].min()
        vertices[:, 2] += z_shift

        translation = np.array([
            -xy_centroid[0],
            -xy_centroid[1],
            z_shift,
        ], dtype=np.float64)

        # ── Step 5: Flip check ─────────────────────────────────────────────
        flipped = False
        if self.flip_check:
            # Heuristic: if top 10% of vertices have higher density near
            # Z_top (teeth pointing up), flip if not.
            z_max = float(vertices[:, 2].max())
            upper_z_pct = 0.10
            top_mask = vertices[:, 2] >= z_max * (1 - upper_z_pct)
            # Count how many top vertices have positive curvature-like neighbours
            # Simple heuristic: if most mass is in upper half, teeth are up — OK.
            upper_mass  = top_mask.sum()
            lower_mass  = (vertices[:, 2] < z_max * 0.5).sum()
            if upper_mass < lower_mass * 0.1:
                # Teeth seem to be pointing downward — flip 180° on X
                R_flip = np.array([
                    [1, 0, 0],
                    [0, -1, 0],
                    [0, 0, -1],
                ], dtype=np.float64)
                vertices = (R_flip @ vertices.T).T
                # Re-base to Z=0
                vertices[:, 2] -= vertices[:, 2].min()
                R = R_flip @ R
                flipped = True
                logger.info("ModelNormalizer: model flipped (teeth down detected)")

        # ── Optional: rescale to target height ────────────────────────────
        scale = 1.0
        if self.target_height_mm is not None:
            z_height = float(vertices[:, 2].max() - vertices[:, 2].min())
            if z_height > 1e-6:
                scale = self.target_height_mm / z_height
                vertices *= scale
                translation *= scale

        z_min_after = float(vertices[:, 2].min())

        # ── Rebuild mesh ───────────────────────────────────────────────────
        aligned_mesh = trimesh.Trimesh(
            vertices=vertices.astype(np.float32),
            faces=np.asarray(mesh.faces),
            process=False,
        )
        aligned_mesh.fix_normals()

        meta = NormMetadata(
            rotation_matrix=R.astype(np.float64),
            translation=translation.astype(np.float64),
            occlusal_normal_before=occlusal_normal,
            scale=float(scale),
            flipped=flipped,
            z_min_before=z_min_before,
            z_min_after=z_min_after,
        )

        logger.info(
            "ModelNormalizer: z_min %.2f→%.2f  flipped=%s  scale=%.3f",
            z_min_before, z_min_after, flipped, scale,
        )
        return aligned_mesh, meta

    # ── Occlusal plane detection ───────────────────────────────────────────

    def _detect_occlusal_normal(self, vertices: np.ndarray) -> np.ndarray:
        """
        PCA on top upper_pct of vertices to detect occlusal plane normal.

        The smallest PC (least variance direction) is the plane normal.
        But for dental arches, the occlusal surface is roughly flat and
        the height axis has *large* variance — so we use the PC with
        highest variance as the normal candidate, then disambiguate.
        """
        z = vertices[:, 2]
        z_min, z_max = float(z.min()), float(z.max())
        z_thresh = z_min + (z_max - z_min) * (1 - self.upper_pct)
        upper_verts = vertices[z >= z_thresh]
        if len(upper_verts) < 4:
            upper_verts = vertices

        centred = upper_verts - upper_verts.mean(axis=0)
        cov = (centred.T @ centred) / max(1, len(centred) - 1)
        eigenvalues, eigenvectors = np.linalg.eigh(cov)
        # eigenvectors columns are in ascending eigenvalue order
        # Largest eigenvalue = 1st principal direction of the flat occlusal surface
        # Smallest eigenvalue = normal to the occlusal plane
        normal = eigenvectors[:, 0]  # smallest eigenvalue eigenvector = plane normal
        return normal.astype(np.float64)

    # ── Rotation from n to [0,0,1] ────────────────────────────────────────

    def _rotation_to_z(self, normal: np.ndarray) -> np.ndarray:
        """
        Compute 3×3 rotation matrix that rotates `normal` to [0, 0, 1].

        Uses Rodrigues' rotation formula.
        """
        n = normal / (np.linalg.norm(normal) + 1e-12)
        target = np.array([0.0, 0.0, 1.0])

        v = np.cross(n, target)
        v_norm = np.linalg.norm(v)

        if v_norm < 1e-9:
            # Already aligned
            if np.dot(n, target) > 0:
                return np.eye(3, dtype=np.float64)
            else:
                # Anti-aligned — rotate 180° around X
                return np.diag([1.0, -1.0, -1.0])

        v /= v_norm
        c = float(np.dot(n, target))
        s = float(v_norm)

        # Skew-symmetric cross product matrix
        K = np.array([
            [0,    -v[2],  v[1]],
            [v[2],  0,    -v[0]],
            [-v[1], v[0],  0   ],
        ], dtype=np.float64)

        # Rodrigues
        R = np.eye(3) + s * K + (1 - c) * K @ K
        return R.astype(np.float64)
