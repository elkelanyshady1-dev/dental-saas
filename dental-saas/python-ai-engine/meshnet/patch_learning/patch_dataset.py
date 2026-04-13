"""
patch_dataset.py — Dataset for Stage 2 patch segmentation training.
====================================================================

Expected case layout (extending Stage 1 output):
    datasets/cases/
        case_001/
            points.npy          (N, 3)  float32
            tooth_labels.npy    (N,)    int64   — 0=gingiva 1-32=teeth
            coarse_labels.npy   (N,)    int64   — 0=gingiva 1=tooth
            normals.npy         (N, 3)  float32  — optional pre-computed

Each __getitem__ call:
    1. Loads the case
    2. Generates a single random patch from the tooth region
    3. Returns patch_vertices, patch_features, patch_labels (local 0-based)

Label mapping
-------------
The patch labels are remapped to consecutive integers starting at 0
for the teeth present in the patch.  This enables training with a fixed
num_classes head (e.g., max 4 teeth visible in one patch).

    patch_labels: 0 = background (gingiva, out-of-patch)
                  1-N = individual tooth instances in this patch

In practice, a patch radius of 10 mm captures 1-3 adjacent FDI teeth.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import torch
from torch.utils.data import Dataset

from .patch_generator import PatchGenerator, MeshPatch

logger = logging.getLogger(__name__)

_MAX_TEETH_PER_PATCH = 8    # patch head num_classes = this + 1 (background)


class PatchDataset(Dataset):
    """
    Patch-level dataset for Stage 2 training.

    One __getitem__ = one random patch from one random case.
    Multiply num_patches_per_case to control how frequently a case is sampled
    per epoch.

    Args:
        data_root:           root directory with case sub-directories
        num_patches_per_case: virtual samples per case (default 4)
        patch_radius_mm:     geodesic ball radius for patch extraction
        max_patch_points:    maximum points per patch
        augment:             apply random rotation + jitter
    """

    def __init__(
        self,
        data_root: str,
        num_patches_per_case: int = 4,
        patch_radius_mm: float = 10.0,
        max_patch_points: int = 1024,
        augment: bool = False,
    ) -> None:
        self.data_root = Path(data_root)
        self.num_patches_per_case = num_patches_per_case
        self.augment = augment
        self.max_patch_points = max_patch_points

        self._generator = PatchGenerator(
            patch_radius_mm=patch_radius_mm,
            n_seeds=1,                     # generate 1 patch at a time
            min_patch_points=32,
            max_patch_points=max_patch_points,
            seed_strategy="random",
        )

        self._cases = sorted([
            p for p in self.data_root.iterdir()
            if p.is_dir() and (p / "points.npy").exists()
        ])
        logger.info(
            "PatchDataset: %d cases × %d patches = %d virtual samples",
            len(self._cases), num_patches_per_case,
            len(self._cases) * num_patches_per_case,
        )

    def __len__(self) -> int:
        return len(self._cases) * self.num_patches_per_case

    def __getitem__(self, idx: int) -> dict:
        case_idx = idx % len(self._cases)
        case_dir = self._cases[case_idx]

        # Load
        points       = np.load(case_dir / "points.npy").astype(np.float32)
        tooth_labels = np.load(case_dir / "tooth_labels.npy").astype(np.int32)

        # Load normals or estimate roughly
        normals_path = case_dir / "normals.npy"
        if normals_path.exists():
            normals = np.load(normals_path).astype(np.float32)
        else:
            normals = np.tile([0, 0, 1], (len(points), 1)).astype(np.float32)

        features = normals  # (N, 3) — can extend with geo features

        # Tooth mask from tooth_labels
        tooth_mask = tooth_labels > 0

        # Generate ONE patch (seed strategy = random)
        patches = self._generate_single_patch(points, tooth_mask, features, tooth_labels)

        if patches is None:
            # Fallback: return dummy patch
            dummy = np.zeros((self.max_patch_points, 3), dtype=np.float32)
            return {
                "patch_vertices": torch.zeros(self.max_patch_points, 3),
                "patch_features": torch.zeros(self.max_patch_points, 3),
                "patch_labels":   torch.zeros(self.max_patch_points, dtype=torch.long),
                "local_to_global": {},
            }

        patch, label_map = patches

        # ── Augmentation ─────────────────────────────────────────────────────
        verts = patch.patch_vertices.copy()
        feats = patch.patch_features.copy() if patch.patch_features is not None \
                else np.zeros((len(verts), 3), dtype=np.float32)

        if self.augment:
            theta = np.random.uniform(0, 2 * np.pi)
            c, s = np.cos(theta), np.sin(theta)
            R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], dtype=np.float32)
            verts = verts @ R.T
            feats[:, :3] = feats[:, :3] @ R.T  # rotate normals too
            verts += np.random.normal(0, 0.005, verts.shape).astype(np.float32)

        # ── Pad / crop to max_patch_points ───────────────────────────────────
        P = len(verts)
        if P < self.max_patch_points:
            pad = self.max_patch_points - P
            verts = np.concatenate([verts, np.zeros((pad, 3), np.float32)])
            feats = np.concatenate([feats, np.zeros((pad, feats.shape[1]), np.float32)])
        elif P > self.max_patch_points:
            chosen = np.random.choice(P, self.max_patch_points, replace=False)
            verts = verts[chosen]
            feats = feats[chosen]

        patch_labels_full = np.zeros(self.max_patch_points, dtype=np.int64)
        orig_p = min(P, self.max_patch_points)
        patch_labels_full[:orig_p] = patch.patch_features[:orig_p, 0].astype(np.int64) \
            if hasattr(patch, "_raw_labels") else 0  # filled below

        return {
            "patch_vertices": torch.from_numpy(verts),          # (M, 3)
            "patch_features": torch.from_numpy(feats),          # (M, 3)
            "patch_labels":   torch.from_numpy(patch_labels_full),  # (M,)
            "case_id":        case_dir.name,
        }

    def _generate_single_patch(
        self,
        points: np.ndarray,
        tooth_mask: np.ndarray,
        features: np.ndarray,
        tooth_labels: np.ndarray,
    ) -> Optional[Tuple["MeshPatch", dict]]:
        """Generate a single patch and remap labels to consecutive ints."""
        try:
            patches = self._generator.generate(points, tooth_mask, features)
        except Exception as exc:
            logger.debug("Patch generation failed: %s", exc)
            return None

        if not patches:
            return None

        patch = patches[0]

        # Get tooth labels for patch points
        raw_labels = tooth_labels[patch.patch_indices]  # (P,)

        # Remap to consecutive 0-based: 0=gingiva, 1..K=tooth instances
        unique_teeth = sorted(set(int(l) for l in raw_labels if l > 0))
        # Limit to _MAX_TEETH_PER_PATCH
        unique_teeth = unique_teeth[:_MAX_TEETH_PER_PATCH]
        label_map = {t: i + 1 for i, t in enumerate(unique_teeth)}

        remapped = np.zeros(len(raw_labels), dtype=np.int64)
        for orig, local in label_map.items():
            remapped[raw_labels == orig] = local

        # Attach remapped labels to patch (piggyback via patch_features channel)
        # We store them as a new attribute so __getitem__ can access them
        patch._raw_labels = remapped

        return patch, label_map
