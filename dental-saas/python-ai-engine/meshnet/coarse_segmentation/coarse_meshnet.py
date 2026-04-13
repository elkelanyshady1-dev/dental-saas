"""
coarse_meshnet.py — Stage 1: Coarse tooth vs. gingiva segmentation.
====================================================================

Architecture
------------
A lightweight PointNet++-style encoder with three set-abstraction (SA)
layers followed by feature propagation (FP) back to input resolution.

The model predicts a **binary** label per face/point:
    0 = gingiva
    1 = tooth  (any tooth; individual identity comes in Stage 2)

Input features per point
------------------------
    xyz     (3)  – Cartesian coordinates
    normal  (3)  – face/vertex normal
    geo     (4)  – geodesic feature vector from GeodesicFeatureExtractor:
                   [mean_dist, std_dist, eccentricity, elevation_angle]

Total input channels: 10

Design decisions
----------------
- Pure PyTorch; no PointNet++ library dependency.
  SA layers are implemented via farthest-point-sampling + ball-query.
- Architecture is intentionally shallow (< 1M params) to allow fast
  inference (~100ms per scan on CPU) — Stage 2 patch models handle precision.
- Geodesic features help boundary sharpness at tooth-gingiva transitions.

Usage
-----
    model = CoarseMeshNet(in_channels=10, num_classes=2)
    logits = model(points_xyz, features)  # (B, N, 2)
    preds  = logits.argmax(dim=-1)        # (B, N) — 0=gingiva, 1=tooth

Inference helper
----------------
    coarse_labels = run_coarse_inference(vertices, normals, checkpoint_path)
"""

from __future__ import annotations

import logging
from typing import Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger(__name__)


# ── Geometry utils (no library needed) ───────────────────────────────────────

def _farthest_point_sample(xyz: torch.Tensor, n_samples: int) -> torch.Tensor:
    """
    Farthest point sampling.

    Args:
        xyz:       (B, N, 3)
        n_samples: int

    Returns:
        idx: (B, n_samples) long
    """
    B, N, _ = xyz.shape
    device = xyz.device
    idx = torch.zeros(B, n_samples, dtype=torch.long, device=device)
    dist = torch.full((B, N), float("inf"), device=device)
    farthest = torch.randint(0, N, (B,), dtype=torch.long, device=device)

    for i in range(n_samples):
        idx[:, i] = farthest
        centroid = xyz[torch.arange(B), farthest].unsqueeze(1)  # (B,1,3)
        d = ((xyz - centroid) ** 2).sum(dim=-1)                  # (B,N)
        dist = torch.minimum(dist, d)
        farthest = dist.argmax(dim=1)

    return idx


def _ball_query(
    xyz: torch.Tensor,
    query: torch.Tensor,
    radius: float,
    n_samples: int,
) -> torch.Tensor:
    """
    Ball-query neighbourhood.

    Args:
        xyz:      (B, N, 3) — source points
        query:    (B, M, 3) — query/centroid points
        radius:   float
        n_samples: max neighbours per ball

    Returns:
        idx: (B, M, n_samples) long — neighbour indices in xyz
    """
    B, N, _ = xyz.shape
    _, M, _ = query.shape
    device = xyz.device

    # pairwise distances (B, M, N)
    diff = query.unsqueeze(2) - xyz.unsqueeze(1)     # (B, M, N, 3)
    dists = (diff ** 2).sum(dim=-1)                  # (B, M, N)

    # For each query, get up to n_samples neighbours within radius²
    idx = torch.arange(N, device=device).expand(B, M, N)
    mask = dists > radius ** 2
    dists_masked = dists.clone()
    dists_masked[mask] = 1e10

    # Sort and take top-k
    _, sorted_idx = dists_masked.sort(dim=-1)        # (B, M, N)
    idx_out = sorted_idx[:, :, :n_samples]           # (B, M, n_samples)
    return idx_out


def _group_features(
    features: torch.Tensor,
    xyz: torch.Tensor,
    centroids: torch.Tensor,
    idx: torch.Tensor,
) -> torch.Tensor:
    """
    Group input features around centroids.

    Args:
        features:  (B, N, C)  or None
        xyz:       (B, N, 3)
        centroids: (B, M, 3)
        idx:       (B, M, K) — indices into N

    Returns:
        grouped: (B, M, K, 3+C)  — relative xyz + features
    """
    B, M, K = idx.shape
    # Gather xyz
    expanded_idx = idx.reshape(B, -1)               # (B, M*K)
    grouped_xyz = xyz.gather(
        1,
        expanded_idx.unsqueeze(-1).expand(-1, -1, 3)
    ).reshape(B, M, K, 3)
    relative_xyz = grouped_xyz - centroids.unsqueeze(2)  # (B, M, K, 3)

    if features is not None:
        C = features.shape[-1]
        grouped_feat = features.gather(
            1,
            expanded_idx.unsqueeze(-1).expand(-1, -1, C)
        ).reshape(B, M, K, C)
        return torch.cat([relative_xyz, grouped_feat], dim=-1)  # (B, M, K, 3+C)
    return relative_xyz


# ── Set Abstraction (SA) Block ────────────────────────────────────────────────

class SetAbstraction(nn.Module):
    """
    PointNet++ set abstraction layer.

    Farthest-point-samples ``n_points`` centroids, queries ``radius``-radius
    balls, applies a shared MLP, and performs max-pool.

    Args:
        n_points:  number of centroids to sample (M)
        radius:    ball radius (mm)
        k:         max neighbours per ball
        in_ch:     input feature channels (incl. xyz = 3)
        mlp_dims:  list of MLP output dimensions
    """

    def __init__(
        self,
        n_points: int,
        radius: float,
        k: int,
        in_ch: int,
        mlp_dims: list,
    ) -> None:
        super().__init__()
        self.n_points = n_points
        self.radius = radius
        self.k = k

        layers = []
        cur = in_ch
        for out in mlp_dims:
            layers += [nn.Conv2d(cur, out, 1), nn.BatchNorm2d(out), nn.ReLU(inplace=True)]
            cur = out
        self.mlp = nn.Sequential(*layers)
        self.out_ch = cur

    def forward(
        self,
        xyz: torch.Tensor,
        features: Optional[torch.Tensor],
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            xyz:      (B, N, 3)
            features: (B, N, C) or None

        Returns:
            new_xyz:  (B, M, 3)   centroids
            new_feat: (B, M, out) aggregated features
        """
        B, N, _ = xyz.shape
        M = min(self.n_points, N)

        # 1. Sample centroids
        fps_idx = _farthest_point_sample(xyz, M)        # (B, M)
        centroids = xyz.gather(
            1,
            fps_idx.unsqueeze(-1).expand(-1, -1, 3)
        )                                                # (B, M, 3)

        # 2. Ball query
        ball_idx = _ball_query(xyz, centroids, self.radius, self.k)  # (B, M, K)

        # 3. Group + relative xyz
        grouped = _group_features(features, xyz, centroids, ball_idx)  # (B, M, K, 3+C)
        grouped = grouped.permute(0, 3, 1, 2)                          # (B, 3+C, M, K)

        # 4. MLP + max-pool
        out = self.mlp(grouped)           # (B, out, M, K)
        out = out.max(dim=-1).values      # (B, out, M)
        out = out.permute(0, 2, 1)        # (B, M, out)

        return centroids, out


# ── Feature Propagation (FP) ──────────────────────────────────────────────────

class FeaturePropagation(nn.Module):
    """
    Interpolate sparse features back to a denser point set,
    then apply a 1-D MLP.

    Args:
        in_ch:    feature channels from lower level + skip channels
        mlp_dims: list of MLP output dimensions
    """

    def __init__(self, in_ch: int, mlp_dims: list) -> None:
        super().__init__()
        layers = []
        cur = in_ch
        for out in mlp_dims:
            layers += [nn.Conv1d(cur, out, 1), nn.BatchNorm1d(out), nn.ReLU(inplace=True)]
            cur = out
        self.mlp = nn.Sequential(*layers)
        self.out_ch = cur

    def forward(
        self,
        xyz1: torch.Tensor,    # (B, N1, 3) — denser
        xyz2: torch.Tensor,    # (B, N2, 3) — sparser
        feat1: Optional[torch.Tensor],  # (B, N1, C1) — skip
        feat2: torch.Tensor,   # (B, N2, C2) — from lower level
    ) -> torch.Tensor:
        """Returns (B, N1, out_ch)."""
        B, N1, _ = xyz1.shape
        _, N2, _ = xyz2.shape

        # 3-NN interpolation
        diff = xyz1.unsqueeze(2) - xyz2.unsqueeze(1)        # (B, N1, N2, 3)
        dists = (diff ** 2).sum(dim=-1)                      # (B, N1, N2)
        dists, nn_idx = dists.topk(3, dim=-1, largest=False) # (B, N1, 3)

        # Inverse-distance weights
        dists = torch.clamp(dists, min=1e-10)
        weights = 1.0 / dists                                # (B, N1, 3)
        weights = weights / weights.sum(dim=-1, keepdim=True)

        # Gather and interpolate
        C2 = feat2.shape[-1]
        nn_feat = feat2.gather(
            1,
            nn_idx.reshape(B, -1).unsqueeze(-1).expand(-1, -1, C2)
        ).reshape(B, N1, 3, C2)
        interp = (weights.unsqueeze(-1) * nn_feat).sum(dim=2)  # (B, N1, C2)

        # Skip concat
        if feat1 is not None:
            merged = torch.cat([feat1, interp], dim=-1)         # (B, N1, C1+C2)
        else:
            merged = interp

        # 1-D MLP
        out = self.mlp(merged.permute(0, 2, 1))     # (B, out_ch, N1)
        return out.permute(0, 2, 1)                 # (B, N1, out_ch)


# ── Geodesic Feature Extractor (CPU, no-GPU) ─────────────────────────────────

class GeodesicFeatureExtractor:
    """
    Compute a compact 4-dimensional geodesic feature per point via
    k-NN distances in 3-D (approximate geodesic on surface).

    Features (dim=4):
        0: mean k-NN distance (local density)
        1: std of k-NN distances (local regularity)
        2: max/mean ratio — eccentricity proxy
        3: elevation angle from centroid — relative arch height

    This is a CPU-only preprocessing step run once per scan before
    the model forward pass.
    """

    def __init__(self, k: int = 16) -> None:
        self.k = k

    def __call__(self, points: np.ndarray) -> np.ndarray:
        """
        Args:
            points: (N, 3) float32

        Returns:
            geo_feats: (N, 4) float32
        """
        from scipy.spatial import cKDTree

        tree = cKDTree(points)
        k = min(self.k + 1, len(points))
        dists, _ = tree.query(points, k=k)
        dists = dists[:, 1:]  # exclude self

        mean_d = dists.mean(axis=-1)
        std_d = dists.std(axis=-1)
        ecc = dists.max(axis=-1) / (mean_d + 1e-8)

        centroid = points.mean(axis=0)
        elevation = points[:, 2] - centroid[2]
        elev_norm = (elevation - elevation.min()) / (elevation.ptp() + 1e-8)

        return np.stack([mean_d, std_d, ecc, elev_norm], axis=-1).astype(np.float32)


# ── Coarse MeshNet ────────────────────────────────────────────────────────────

class CoarseMeshNet(nn.Module):
    """
    Lightweight coarse segmentation network.

    Input channels: 10 (3 xyz + 3 normals + 4 geodesic features)
    Output: per-point logits for [gingiva, tooth] (num_classes=2 default)

    Architecture:
        SA1: 512 centroids, r=5mm,  k=32, MLP [64, 64, 128]
        SA2: 128 centroids, r=10mm, k=64, MLP [128, 128, 256]
        SA3: global,                k=∞,  MLP [256, 512, 1024]
        FP3: 128-point level ← SA3 ← SA2
        FP2: 512-point level ← FP3 ← SA1
        FP1: N-point level   ← FP2 ← input
        Head: FC 128 → 64 → num_classes
    """

    def __init__(self, in_channels: int = 10, num_classes: int = 2) -> None:
        super().__init__()
        feat_ch = in_channels - 3   # feature channels (excluding xyz)

        # Encoder
        self.sa1 = SetAbstraction(512,  5.0,  32, 3 + feat_ch, [64, 64, 128])
        self.sa2 = SetAbstraction(128,  10.0, 64, 3 + 128,     [128, 128, 256])
        self.sa3 = SetAbstraction(1,    100.0, 512, 3 + 256,   [256, 512, 1024])

        # Decoder (FP layers)
        self.fp3 = FeaturePropagation(1024 + 256, [256, 256])
        self.fp2 = FeaturePropagation(256  + 128, [256, 128])
        self.fp1 = FeaturePropagation(128  + feat_ch, [128, 128])

        # Segmentation head
        self.head = nn.Sequential(
            nn.Conv1d(128, 128, 1),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.5),
            nn.Conv1d(128, num_classes, 1),
        )

    def forward(
        self,
        xyz: torch.Tensor,              # (B, N, 3)
        features: Optional[torch.Tensor] = None,  # (B, N, feat_ch)
    ) -> torch.Tensor:
        """Returns (B, N, num_classes) logits."""
        B, N, _ = xyz.shape

        # ── Encoder ──────────────────────────────────────────────────────────
        l0_xyz, l0_feat = xyz, features   # (B, N, feat_ch)

        l1_xyz, l1_feat = self.sa1(l0_xyz, l0_feat)
        l2_xyz, l2_feat = self.sa2(l1_xyz, l1_feat)
        l3_xyz, l3_feat = self.sa3(l2_xyz, l2_feat)

        # ── Decoder ──────────────────────────────────────────────────────────
        l2_out = self.fp3(l2_xyz, l3_xyz, l2_feat, l3_feat)
        l1_out = self.fp2(l1_xyz, l2_xyz, l1_feat, l2_out)
        l0_out = self.fp1(l0_xyz, l1_xyz, l0_feat, l1_out)

        # ── Head ─────────────────────────────────────────────────────────────
        logits = self.head(l0_out.permute(0, 2, 1))  # (B, num_classes, N)
        return logits.permute(0, 2, 1)               # (B, N, num_classes)


# ── Inference Helper ──────────────────────────────────────────────────────────

def run_coarse_inference(
    vertices: np.ndarray,
    normals: Optional[np.ndarray] = None,
    checkpoint_path: Optional[str] = None,
    device: str = "cpu",
    batch_size: int = 1,
) -> np.ndarray:
    """
    Run coarse segmentation on a single scan.

    Args:
        vertices:         (N, 3) float32
        normals:          (N, 3) float32 — if None, estimated from geometry
        checkpoint_path:  path to .pth checkpoint (optional; random weights if None)
        device:           "cpu" or "cuda"

    Returns:
        coarse_labels: (N,) int — 0=gingiva, 1=tooth
    """
    dev = torch.device(device)

    # Build features
    geo_extractor = GeodesicFeatureExtractor(k=16)
    geo_feats = geo_extractor(vertices)       # (N, 4)

    if normals is None:
        normals = np.zeros((len(vertices), 3), dtype=np.float32)
        normals[:, 2] = 1.0  # default upright normal

    features = np.concatenate([normals, geo_feats], axis=-1)  # (N, 7)

    model = CoarseMeshNet(in_channels=10, num_classes=2)

    if checkpoint_path:
        ckpt = torch.load(checkpoint_path, map_location=dev)
        state = ckpt.get("model_state_dict", ckpt)
        model.load_state_dict(state, strict=False)
        logger.info("Loaded coarse model from %s", checkpoint_path)
    else:
        logger.warning("No checkpoint provided — CoarseMeshNet using random weights")

    model.to(dev).eval()

    with torch.no_grad():
        pts_t = torch.from_numpy(vertices).float().unsqueeze(0).to(dev)    # (1,N,3)
        feat_t = torch.from_numpy(features).float().unsqueeze(0).to(dev)   # (1,N,7)
        logits = model(pts_t, feat_t)                                        # (1,N,2)
        preds = logits.argmax(dim=-1).squeeze(0).cpu().numpy()              # (N,)

    logger.info(
        "Coarse segmentation: gingiva=%d  tooth=%d",
        int((preds == 0).sum()), int((preds == 1).sum())
    )
    return preds.astype(np.int32)
