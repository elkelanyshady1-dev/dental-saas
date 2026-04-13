"""
synthetic_arch_generator.py — Generate synthetic dental arch training meshes.

Algorithm
---------
1. Load tooth library (ToothLibraryBuilder)
2. Fit a B-spline dental arch curve (parametric)
3. Sample 14 (or 16) equidistant positions on the arch
4. For each position, randomly select a tooth from the library
   matching the FDI number at that position
5. Place the tooth:
   a. Translate to arch position
   b. Rotate to follow arch tangent direction
   c. Apply random spacing jitter (±1.5 mm) and rotation jitter (±10°)
6. Concatenate all tooth meshes + generate gingiva plane
7. Assign labels and save as a synthetic dataset case

Standard Arch Parameters
-------------------------
Lower arch: FDI 31–38 (left) + 41–48 (right)
Upper arch: FDI 11–18 (left) + 21–28 (right)

Usage
-----
    gen = SyntheticArchGenerator(
        library_dir="./datasets/tooth_library",
        output_dir="./datasets/synthetic",
        arch="lower",
    )
    gen.generate_batch(n_cases=50)
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy.interpolate import CubicSpline

from .tooth_library_builder import ToothEntry, ToothLibraryBuilder

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Arch geometry constants
# ─────────────────────────────────────────────────────────────────────────────

# FDI numbers in mesial-to-distal order for each arch
LOWER_ARCH_FDI = [41, 42, 43, 44, 45, 46, 47, 48,
                  31, 32, 33, 34, 35, 36, 37, 38]
UPPER_ARCH_FDI = [11, 12, 13, 14, 15, 16, 17, 18,
                  21, 22, 23, 24, 25, 26, 27, 28]

# Approximate dental arch shape (U-parabola in XZ plane)
# Parameterised from midline (t=0) to distal (t=1)
ARCH_CONTROL_T  = np.array([0.0, 0.14, 0.29, 0.43, 0.57, 0.71, 0.86, 1.0])
LOWER_ARCH_X    = np.array([0, 5.5, 10, 14, 17, 20, 22, 23.5])  # mm right of midline
LOWER_ARCH_Z    = np.array([0, -1, -4, -8, -13, -18, -22, -26]) # mm posterior


# ─────────────────────────────────────────────────────────────────────────────
# Generator
# ─────────────────────────────────────────────────────────────────────────────

class SyntheticArchGenerator:
    """
    Generates synthetic dental arch training meshes from the tooth library.

    Parameters
    ----------
    library_dir  : str  — path to ToothLibraryBuilder output
    output_dir   : str  — where to save synthetic cases
    arch         : str  — "lower" or "upper"
    n_points     : int  — points to sample from each synthetic arch
    spacing_jitter_mm : float — random spacing jitter per tooth (±mm)
    rotation_jitter_deg : float — random axial rotation per tooth (±deg)
    seed         : int, optional
    """

    def __init__(
        self,
        library_dir: str = "./datasets/tooth_library",
        output_dir: str  = "./datasets/synthetic",
        arch: str = "lower",
        n_points: int = 10000,
        spacing_jitter_mm: float = 1.5,
        rotation_jitter_deg: float = 10.0,
        seed: Optional[int] = None,
    ) -> None:
        self.library = ToothLibraryBuilder(library_dir=library_dir)
        self.output_dir = Path(output_dir)
        self.arch = arch.lower()
        self.n_points = n_points
        self.spacing_jitter_mm = spacing_jitter_mm
        self.rotation_jitter_deg = rotation_jitter_deg
        self._rng = np.random.default_rng(seed)

        # Load library
        fdi_list = LOWER_ARCH_FDI if self.arch == "lower" else UPPER_ARCH_FDI
        self._entries: Dict[int, List[ToothEntry]] = {}
        all_entries = self.library.load(fdi_filter=fdi_list)
        for e in all_entries:
            self._entries.setdefault(e.fdi_number, []).append(e)

        logger.info(
            "SyntheticArchGenerator: arch=%s  library_fdi=%s",
            self.arch,
            {k: len(v) for k, v in self._entries.items()},
        )

    # ── Arch curve ────────────────────────────────────────────────────────

    def _build_arch_spline(self) -> Tuple[CubicSpline, CubicSpline]:
        """
        Build parametric cubic spline for the dental arch.

        Returns (spline_x, spline_z) interpolating t in [0, 1].
        Mirrored to both sides of the midline.
        """
        t = ARCH_CONTROL_T
        if self.arch == "lower":
            x_pts = LOWER_ARCH_X
            z_pts = LOWER_ARCH_Z
        else:
            # Upper arch is slightly wider and anteriorly displaced
            x_pts = LOWER_ARCH_X * 1.05
            z_pts = LOWER_ARCH_Z + 3.0   # 3 mm more anterior

        cs_x = CubicSpline(t, x_pts, bc_type="natural")
        cs_z = CubicSpline(t, z_pts, bc_type="natural")
        return cs_x, cs_z

    def _arch_positions(
        self, fdi_list: List[int]
    ) -> Dict[int, np.ndarray]:
        """
        Return {fdi: position (3,)} for each tooth in fdi_list.

        Positions are placed symmetrically around the arch midline.
        Right-side (FDI 1x/4x): positive X.
        Left-side  (FDI 2x/3x): negative X.
        """
        cs_x, cs_z = self._build_arch_spline()
        n_per_side = len(fdi_list) // 2

        # t values for each tooth (uniform along arch)
        t_values = np.linspace(0.0, 1.0, n_per_side)

        positions: Dict[int, np.ndarray] = {}
        # Right-side teeth (first half)
        for i, fdi in enumerate(fdi_list[:n_per_side]):
            t = t_values[i]
            jitter = self._rng.uniform(
                -self.spacing_jitter_mm, self.spacing_jitter_mm
            )
            x = float(cs_x(t)) + jitter
            z = float(cs_z(t)) + jitter
            positions[fdi] = np.array([x, 0.0, z], dtype=np.float32)

        # Left-side teeth (mirror X)
        for i, fdi in enumerate(fdi_list[n_per_side:]):
            t = t_values[i]
            jitter = self._rng.uniform(
                -self.spacing_jitter_mm, self.spacing_jitter_mm
            )
            x = -float(cs_x(t)) + jitter   # mirror
            z = float(cs_z(t)) + jitter
            positions[fdi] = np.array([x, 0.0, z], dtype=np.float32)

        return positions

    # ── Rotation ──────────────────────────────────────────────────────────

    def _arch_tangent_rotation(
        self,
        pos: np.ndarray,
        fdi_list: List[int],
        positions: Dict[int, np.ndarray],
        fdi: int,
    ) -> np.ndarray:
        """
        Build a rotation matrix orienting the tooth buccal side outward
        along the arch tangent at its position.

        Returns (3, 3) rotation matrix.
        """
        idx = fdi_list.index(fdi)
        if idx == 0:
            neighbour = positions.get(fdi_list[1], pos + np.array([1, 0, 0]))
        else:
            neighbour = positions.get(fdi_list[idx - 1], pos - np.array([1, 0, 0]))

        tangent = neighbour - pos
        tangent_norm = np.linalg.norm(tangent)
        if tangent_norm < 1e-6:
            return np.eye(3, dtype=np.float32)

        tangent /= tangent_norm
        up = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        right = np.cross(tangent, up)
        right_norm = np.linalg.norm(right)
        if right_norm < 1e-6:
            return np.eye(3, dtype=np.float32)
        right /= right_norm

        R = np.stack([right, up, tangent], axis=1).astype(np.float32)

        # Apply random axial jitter rotation
        jitter_deg = self._rng.uniform(
            -self.rotation_jitter_deg, self.rotation_jitter_deg
        )
        jitter_rad = jitter_deg * np.pi / 180.0
        c, s = np.cos(jitter_rad), np.sin(jitter_rad)
        Rz = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], dtype=np.float32)
        return R @ Rz

    # ── Assembly ──────────────────────────────────────────────────────────

    def _assemble_arch(self) -> Tuple[np.ndarray, np.ndarray]:
        """
        Assemble a complete synthetic arch point cloud.

        Returns
        -------
        points : (N_total, 3)
        labels : (N_total,)  — FDI number as label; 0=gingiva plane
        """
        fdi_list = LOWER_ARCH_FDI if self.arch == "lower" else UPPER_ARCH_FDI
        positions = self._arch_positions(fdi_list)

        all_pts: List[np.ndarray] = []
        all_lbl: List[np.ndarray] = []

        for fdi, pos in positions.items():
            library_entries = self._entries.get(fdi, [])
            if not library_entries:
                logger.debug("No library entry for FDI %d — skipping tooth.", fdi)
                continue

            # Randomly pick a tooth from the library
            entry = library_entries[int(self._rng.integers(0, len(library_entries)))]
            pts = entry.normalised_crown() * 7.0   # scale back to ~14mm tooth size

            # Orient along arch tangent
            R = self._arch_tangent_rotation(pos, fdi_list, positions, fdi)
            pts = pts @ R.T

            # Translate to arch position
            pts += pos

            lbl = np.full(len(pts), fdi, dtype=np.int64)
            all_pts.append(pts)
            all_lbl.append(lbl)

        if not all_pts:
            raise RuntimeError("No teeth assembled — tooth library may be empty.")

        points = np.concatenate(all_pts, axis=0).astype(np.float32)
        labels = np.concatenate(all_lbl, axis=0).astype(np.int64)

        # Add a flat gingiva plane
        points, labels = self._add_gingiva_plane(points, labels)

        return points, labels

    def _add_gingiva_plane(
        self,
        points: np.ndarray,
        labels: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Add a flat point-sampled gingiva plane below the arch."""
        x_range = (points[:, 0].min() - 5.0, points[:, 0].max() + 5.0)
        z_range = (points[:, 2].min() - 5.0, points[:, 2].max() + 5.0)
        y_floor = points[:, 1].min() - 2.0

        n_ging = max(500, len(points) // 5)
        gx = self._rng.uniform(x_range[0], x_range[1], n_ging).astype(np.float32)
        gy = np.full(n_ging, y_floor, dtype=np.float32)
        gz = self._rng.uniform(z_range[0], z_range[1], n_ging).astype(np.float32)
        gy += self._rng.normal(0, 0.3, n_ging).astype(np.float32)  # slight variation

        ging_pts = np.stack([gx, gy, gz], axis=1)
        ging_lbl = np.zeros(n_ging, dtype=np.int64)  # 0 = gingiva

        return (
            np.concatenate([points, ging_pts], axis=0),
            np.concatenate([labels, ging_lbl], axis=0),
        )

    # ── Sample and save ───────────────────────────────────────────────────

    def _sample_points(
        self,
        points: np.ndarray,
        labels: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Random subsample to target n_points."""
        N = len(points)
        if N <= self.n_points:
            return points, labels
        idx = self._rng.choice(N, self.n_points, replace=False)
        return points[idx], labels[idx]

    def _save_case(
        self,
        case_id: str,
        points: np.ndarray,
        labels: np.ndarray,
    ) -> Path:
        out_dir = self.output_dir / case_id
        out_dir.mkdir(parents=True, exist_ok=True)
        np.save(str(out_dir / "points.npy"), points)
        np.save(str(out_dir / "tooth_labels.npy"), labels)
        meta = {
            "case": case_id,
            "synthetic": True,
            "arch": self.arch,
            "n_points": len(points),
            "n_teeth": int((labels > 0).sum()),
            "n_gingiva": int((labels == 0).sum()),
        }
        with open(out_dir / "meta.json", "w") as f:
            json.dump(meta, f, indent=2)
        return out_dir

    # ── Public API ────────────────────────────────────────────────────────

    def generate_one(self, case_id: Optional[str] = None) -> Path:
        """Generate and save one synthetic arch case."""
        if case_id is None:
            case_id = f"synthetic_{self.arch}_{int(time.time()*1000) % 1_000_000:06d}"

        points, labels = self._assemble_arch()
        points, labels = self._sample_points(points, labels)
        out_dir = self._save_case(case_id, points, labels)
        logger.info(
            "Synthetic case saved: %s  pts=%d  teeth=%d  gingiva=%d",
            case_id, len(points), int((labels > 0).sum()), int((labels == 0).sum()),
        )
        return out_dir

    def generate_batch(self, n_cases: int = 10) -> List[Path]:
        """Generate and save n_cases synthetic arch cases."""
        out_dirs: List[Path] = []
        for i in range(n_cases):
            cid = f"synthetic_{self.arch}_{i:04d}"
            try:
                out_dirs.append(self.generate_one(cid))
            except Exception as exc:
                logger.warning("Failed to generate case %s: %s", cid, exc)
        logger.info(
            "Synthetic batch complete: %d/%d cases generated → %s",
            len(out_dirs), n_cases, self.output_dir,
        )
        return out_dirs
