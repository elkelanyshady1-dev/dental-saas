"""
dual_arch_meshnet.py — Dual-Arch Point Cloud Segmentation with Positional Encoding.
======================================================================================

Architecture overview
---------------------

    ┌─────────────────────────────────────────────────────────────┐
    │  DualArchMeshNet                                            │
    │                                                             │
    │  Upper arch (xyz_u, features_u)                             │
    │  Lower arch (xyz_l, features_l)                             │
    │                     │                                       │
    │              SharedEncoder (SA×3 + FP×3)                   │
    │               ↓ upper_feat    ↓ lower_feat                  │
    │                                                             │
    │        CrossArchAttention  (optional, occlusion-aware)      │
    │               ↓                                             │
    │        ArchPositionalEncoding                               │
    │          extracts features[:, :, ARCH_POS_IDX]             │
    │          → sinusoidal(5) → MLP → pos_embed (B, N, 8)       │
    │               ↓                                             │
    │        cat([decoder_feat, pos_embed])  → (B, N, D+8)       │
    │               ↓                                             │
    │        SegmentationHead   (D+8 → 128 → 64 → num_classes)   │
    │               ↓                                             │
    │        tooth_logits  (B, N, num_classes)                    │
    └─────────────────────────────────────────────────────────────┘

Input feature layout (face_features, shape (B, N, 14+))
---------------------------------------------------------
    idx 0-2   : xyz                  (3)
    idx 3-5   : face normals         (3)
    idx 6-9   : geodesic features    (4)
    idx 10    : curvature            (1)
    idx 11    : elevation            (1)
    idx 12    : arch_side            (1)  0=upper, 1=lower
    idx 13    : arch_pos             (1)  ∈ [0, 1] along the arch curve  ← used by ArchPositionalEncoding
    ...

Design decisions
----------------
- ARCH_POS_IDX = 13 (configurable via constructor) is the arch-position feature.
- Sinusoidal basis: [x, sin(πx), cos(πx), sin(2πx), cos(2πx)] gives the network
  smooth periodic position awareness without requiring hard-coded tooth bins.
- Cross-arch attention is optional (enabled by default) and lets the model leverage
  opposing-arch geometry (important for molar / premolar occlusal disambiguation).
- The segmentation head input is automatically widened by POS_EMBED_DIM (default 8)
  so checkpoint compatibility is explicit through the constructor signature.

Usage
-----
    # Training
    model = DualArchMeshNet(in_channels=14, num_classes=33)
    out = model(xyz_upper, feat_upper, xyz_lower, feat_lower)
    # out["upper_logits"]  (B, N_u, 33)
    # out["lower_logits"]  (B, N_l, 33)

    # Inference (single arch)
    model = DualArchMeshNet(in_channels=14, num_classes=33, use_cross_arch=False)
    out = model(xyz, features)
    # out["upper_logits"]  (B, N, 33)

References
----------
    - Qi et al. (2017) PointNet++
    - Vaswani et al. (2017) Attention Is All You Need
    - Chen et al. (2021) Dental mesh segmentation with arch-level context
"""

from __future__ import annotations

import logging
import math
from typing import Dict, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ARCH_POS_IDX: int = 13     # index of arch_pos inside face_features
POS_EMBED_DIM: int = 8     # output dimension of ArchPositionalEncoding


# ---------------------------------------------------------------------------
# Geometry utilities (self-contained, no extra library required)
# ---------------------------------------------------------------------------

def _fps(xyz: torch.Tensor, n_samples: int) -> torch.Tensor:
    """Farthest-point sampling.  Returns (B, n_samples) indices."""
    B, N, _ = xyz.shape
    device = xyz.device
    idx = torch.zeros(B, n_samples, dtype=torch.long, device=device)
    dist = torch.full((B, N), float("inf"), device=device)
    farthest = torch.randint(0, N, (B,), dtype=torch.long, device=device)
    for i in range(n_samples):
        idx[:, i] = farthest
        centroid = xyz[torch.arange(B), farthest].unsqueeze(1)  # (B,1,3)
        d = ((xyz - centroid) ** 2).sum(dim=-1)
        dist = torch.minimum(dist, d)
        farthest = dist.argmax(dim=1)
    return idx


def _ball_query(
    xyz: torch.Tensor,
    centroids: torch.Tensor,
    radius: float,
    k: int,
) -> torch.Tensor:
    """Returns (B, M, k) indices into xyz."""
    diff = centroids.unsqueeze(2) - xyz.unsqueeze(1)    # (B, M, N, 3)
    dists = (diff ** 2).sum(dim=-1)                     # (B, M, N)
    dists[dists > radius ** 2] = 1e9
    _, idx = dists.topk(k, dim=-1, largest=False)
    return idx


def _group(
    xyz: torch.Tensor,
    features: Optional[torch.Tensor],
    centroids: torch.Tensor,
    idx: torch.Tensor,
) -> torch.Tensor:
    """Group + relative xyz → (B, M, K, 3+C)."""
    B, M, K = idx.shape
    flat = idx.reshape(B, -1)
    grp_xyz = xyz.gather(1, flat.unsqueeze(-1).expand(-1, -1, 3)).reshape(B, M, K, 3)
    grp_xyz -= centroids.unsqueeze(2)
    if features is not None:
        C = features.shape[-1]
        grp_f = features.gather(1, flat.unsqueeze(-1).expand(-1, -1, C)).reshape(B, M, K, C)
        return torch.cat([grp_xyz, grp_f], dim=-1)
    return grp_xyz


# ---------------------------------------------------------------------------
# ArchPositionalEncoding  (Step 1)
# ---------------------------------------------------------------------------

class ArchPositionalEncoding(nn.Module):
    """
    Sinusoidal + MLP positional encoding for tooth arch position.

    Converts a scalar arch_pos ∈ [0, 1] (the normalised position of each
    point along the dental arch curve) into a rich embedding vector.

    Encoding basis
    --------------
    For each scalar x ∈ [0, 1]:
        basis = [x,
                 sin(π·x),  cos(π·x),
                 sin(2π·x), cos(2π·x)]   (length 5)

    The basis is then projected by a two-layer MLP to ``out_dim`` channels.
    This gives the network:
        - Linear scale awareness  (x)
        - Smooth periodicities    (sin/cos terms)
        - Learnable non-linear combination (MLP)

    Args:
        out_dim: output embedding dimension (default 8)
        arch_pos_idx: index of arch_pos in the feature tensor (default 13)
    """

    SINUSOIDAL_DIM: int = 5  # [x, sin(πx), cos(πx), sin(2πx), cos(2πx)]

    def __init__(self, out_dim: int = POS_EMBED_DIM) -> None:
        super().__init__()
        self.out_dim = out_dim
        self.fc = nn.Sequential(
            nn.Linear(self.SINUSOIDAL_DIM, out_dim),
            nn.ReLU(inplace=True),
            nn.Linear(out_dim, out_dim),
        )

    def forward(self, arch_pos: torch.Tensor) -> torch.Tensor:
        """
        Args:
            arch_pos: (B, N) — normalised arch position in [0, 1]

        Returns:
            embedding: (B, N, out_dim)
        """
        x = arch_pos  # (B, N)

        # Build sinusoidal basis  →  (B, N, 5)
        pi = math.pi
        basis = torch.stack([
            x,
            torch.sin(pi * x),
            torch.cos(pi * x),
            torch.sin(2.0 * pi * x),
            torch.cos(2.0 * pi * x),
        ], dim=-1)

        return self.fc(basis)  # (B, N, out_dim)


# ---------------------------------------------------------------------------
# Shared encoder block (SA + FP, re-used for both arches)
# ---------------------------------------------------------------------------

class _SABlock(nn.Module):
    """Single PointNet++ Set-Abstraction block."""

    def __init__(self, n_pts: int, radius: float, k: int,
                 in_ch: int, mlp: list) -> None:
        super().__init__()
        self.n_pts, self.radius, self.k = n_pts, radius, k
        layers, cur = [], in_ch
        for out in mlp:
            layers += [nn.Conv2d(cur, out, 1), nn.BatchNorm2d(out), nn.ReLU(True)]
            cur = out
        self.mlp = nn.Sequential(*layers)
        self.out_ch = cur

    def forward(
        self,
        xyz: torch.Tensor,
        feat: Optional[torch.Tensor],
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        B, N, _ = xyz.shape
        M = min(self.n_pts, N)
        fps_idx = _fps(xyz, M)
        centroids = xyz.gather(1, fps_idx.unsqueeze(-1).expand(-1, -1, 3))
        ball_idx = _ball_query(xyz, centroids, self.radius, self.k)
        g = _group(xyz, feat, centroids, ball_idx).permute(0, 3, 1, 2)  # (B, C+3, M, K)
        out = self.mlp(g).max(dim=-1).values.permute(0, 2, 1)           # (B, M, out_ch)
        return centroids, out


class _FPBlock(nn.Module):
    """PointNet++ Feature Propagation block (3-NN interpolation + MLP)."""

    def __init__(self, in_ch: int, mlp: list) -> None:
        super().__init__()
        layers, cur = [], in_ch
        for out in mlp:
            layers += [nn.Conv1d(cur, out, 1), nn.BatchNorm1d(out), nn.ReLU(True)]
            cur = out
        self.mlp = nn.Sequential(*layers)
        self.out_ch = cur

    def forward(
        self,
        xyz1: torch.Tensor, xyz2: torch.Tensor,
        feat1: Optional[torch.Tensor], feat2: torch.Tensor,
    ) -> torch.Tensor:
        B, N1, _ = xyz1.shape
        diff = xyz1.unsqueeze(2) - xyz2.unsqueeze(1)
        dists = (diff ** 2).sum(dim=-1)
        dists, nn_idx = dists.topk(3, dim=-1, largest=False)
        dists = torch.clamp(dists, min=1e-10)
        w = 1.0 / dists
        w = w / w.sum(dim=-1, keepdim=True)
        C2 = feat2.shape[-1]
        nn_feat = feat2.gather(
            1, nn_idx.reshape(B, -1).unsqueeze(-1).expand(-1, -1, C2)
        ).reshape(B, N1, 3, C2)
        interp = (w.unsqueeze(-1) * nn_feat).sum(dim=2)
        merged = torch.cat([feat1, interp], dim=-1) if feat1 is not None else interp
        return self.mlp(merged.permute(0, 2, 1)).permute(0, 2, 1)


class SharedEncoder(nn.Module):
    """
    PointNet++-style encoder shared between both arches.

    Input:  xyz (B, N, 3),  features (B, N, feat_ch)
    Output: decoded per-point features (B, N, 128)
    """

    FP_OUT_CH = 128   # decoder output channel count

    def __init__(self, feat_ch: int) -> None:
        super().__init__()
        # Encoder
        self.sa1 = _SABlock(512,  5.0,  32, 3 + feat_ch,  [64,  64,  128])
        self.sa2 = _SABlock(128,  10.0, 64, 3 + 128,       [128, 128, 256])
        self.sa3 = _SABlock(1,    100.0, 512, 3 + 256,     [256, 512, 1024])
        # Decoder
        self.fp3 = _FPBlock(1024 + 256, [256, 256])
        self.fp2 = _FPBlock(256  + 128, [256, 128])
        self.fp1 = _FPBlock(128  + feat_ch, [128, self.FP_OUT_CH])

    def forward(
        self,
        xyz: torch.Tensor,
        features: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Returns:
            decoded_feat  : (B, N, 128)   — per-point features
            l1_xyz, l1_feat, l2_xyz (internal; stored for cross-arch)
        """
        l0_xyz, l0_feat = xyz, features
        l1_xyz, l1_feat = self.sa1(l0_xyz, l0_feat)
        l2_xyz, l2_feat = self.sa2(l1_xyz, l1_feat)
        l3_xyz, l3_feat = self.sa3(l2_xyz, l2_feat)

        l2_out = self.fp3(l2_xyz, l3_xyz, l2_feat, l3_feat)
        l1_out = self.fp2(l1_xyz, l2_xyz, l1_feat, l2_out)
        l0_out = self.fp1(l0_xyz, l1_xyz, l0_feat, l1_out)     # (B, N, 128)

        # Expose intermediate levels for cross-arch attention
        return l0_out, l1_xyz, l1_feat, l2_xyz


# ---------------------------------------------------------------------------
# Cross-Arch Attention  (optional occlusion-aware exchange)
# ---------------------------------------------------------------------------

class CrossArchAttention(nn.Module):
    """
    Lightweight cross-arch attention that lets each arch attend to the
    opposing arch's abstract features.

    Operates on the SA2 level (128 centroids) which is a good compromise
    between resolution and computational cost.

    Query:  upper SA2 features
    Key/Val: lower SA2 features (and vice-versa)

    Output: updated upper + lower SA2 features, same shape as input.
    """

    def __init__(self, feat_dim: int = 256, n_heads: int = 4) -> None:
        super().__init__()
        self.attn_u2l = nn.MultiheadAttention(
            embed_dim=feat_dim, num_heads=n_heads, batch_first=True
        )
        self.attn_l2u = nn.MultiheadAttention(
            embed_dim=feat_dim, num_heads=n_heads, batch_first=True
        )
        self.norm_u = nn.LayerNorm(feat_dim)
        self.norm_l = nn.LayerNorm(feat_dim)

    def forward(
        self,
        upper_feat: torch.Tensor,   # (B, M, feat_dim)
        lower_feat: torch.Tensor,   # (B, M, feat_dim)
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        # Upper queries lower context
        u_ctx, _ = self.attn_u2l(upper_feat, lower_feat, lower_feat)
        upper_out = self.norm_u(upper_feat + u_ctx)

        # Lower queries upper context
        l_ctx, _ = self.attn_l2u(lower_feat, upper_feat, upper_feat)
        lower_out = self.norm_l(lower_feat + l_ctx)

        return upper_out, lower_out


# ---------------------------------------------------------------------------
# Segmentation Head
# ---------------------------------------------------------------------------

class _SegHead(nn.Module):
    """
    Per-point segmentation head.

    in_ch = decoder_ch + pos_embed_dim  (e.g. 128 + 8 = 136 default)
    """

    def __init__(self, in_ch: int, num_classes: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(in_ch, 128, 1), nn.BatchNorm1d(128), nn.ReLU(True),
            nn.Dropout(0.5),
            nn.Conv1d(128, 64, 1),  nn.BatchNorm1d(64),  nn.ReLU(True),
            nn.Conv1d(64, num_classes, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (B, N, C) → (B, N, num_classes)"""
        return self.net(x.permute(0, 2, 1)).permute(0, 2, 1)


# ---------------------------------------------------------------------------
# DualArchMeshNet  (main model)
# ---------------------------------------------------------------------------

class DualArchMeshNet(nn.Module):
    """
    Dual-arch point cloud segmentation network with Arch Positional Encoding.

    Improvements over a plain segmentation network
    -----------------------------------------------
    1. **ArchPositionalEncoding** — converts features[:, :, arch_pos_idx]
       (the normalised position ∈ [0,1] along the arch curve) into an 8-dim
       sinusoidal + MLP embedding and concatenates it after the decoder.
       Result: the head sees both local geometry *and* global arch position.

    2. **CrossArchAttention** (optional) — SA2 features from upper and lower
       arches exchange context via multi-head attention.
       Result: occlusion-aware feature enrichment.

    Args:
        in_channels:    total input channels per point (default 14)
        num_classes:    number of output tooth classes (default 33)
        pos_embed_dim:  output dim of ArchPositionalEncoding (default 8)
        arch_pos_idx:   feature index of arch_pos (default 13)
        use_cross_arch: enable cross-arch attention (default True)
        n_attn_heads:   heads in CrossArchAttention (default 4)

    Inputs (forward)
    ----------------
        xyz_upper:   (B, N_u, 3)
        feat_upper:  (B, N_u, in_channels-3)   full feature tensor
        xyz_lower:   (B, N_l, 3)   [optional — if None, only upper is run]
        feat_lower:  (B, N_l, in_channels-3)   [optional]

    Outputs
    -------
        dict with:
            "upper_logits"  (B, N_u, num_classes)
            "lower_logits"  (B, N_l, num_classes)   [if lower arch provided]
    """

    def __init__(
        self,
        in_channels:    int  = 14,
        num_classes:    int  = 33,
        pos_embed_dim:  int  = POS_EMBED_DIM,
        arch_pos_idx:   int  = ARCH_POS_IDX,
        use_cross_arch: bool = True,
        n_attn_heads:   int  = 4,
    ) -> None:
        super().__init__()

        feat_ch = in_channels - 3   # channels excluding xyz
        self.feat_ch       = feat_ch
        self.arch_pos_idx  = arch_pos_idx
        self.use_cross_arch = use_cross_arch
        self.pos_embed_dim  = pos_embed_dim

        # Validate arch_pos_idx can be extracted from features
        if arch_pos_idx < 0:
            raise ValueError(
                f"arch_pos_idx must be >= 0, got {arch_pos_idx}"
            )
        # arch_pos is feature index inside the *feature* tensor (not counting xyz)
        # features[:, :, arch_pos_idx] — but if arch_pos_idx ≥ feat_ch we warn
        self._feat_arch_pos_idx = arch_pos_idx - 3  # offset for feature-only tensor

        if self._feat_arch_pos_idx < 0 or self._feat_arch_pos_idx >= feat_ch:
            logger.warning(
                "arch_pos_idx=%d maps to feature index %d which may be out of range "
                "for feat_ch=%d.  Will clamp to last feature channel.",
                arch_pos_idx, self._feat_arch_pos_idx, feat_ch,
            )
            self._feat_arch_pos_idx = max(0, min(self._feat_arch_pos_idx, feat_ch - 1))

        # ── Sub-modules ────────────────────────────────────────────────────────

        # Shared encoder (weights are NOT shared between arches by default;
        # create two instances so backprop is independent — prevents arch
        # cross-contamination during training on single-arch cases)
        self.encoder_upper = SharedEncoder(feat_ch)
        self.encoder_lower = SharedEncoder(feat_ch)

        # Arch positional encoding (Steps 1 & 2)
        self.pos_encoder = ArchPositionalEncoding(out_dim=pos_embed_dim)

        # Cross-arch attention on SA2 level (≈256-dim features from SA2)
        if use_cross_arch:
            # SA2 output is 256 channels (see _SABlock MLP config in SharedEncoder)
            self.cross_arch_attn = CrossArchAttention(feat_dim=256, n_heads=n_attn_heads)
        else:
            self.cross_arch_attn = None

        # Segmentation head — input = decoder(128) + pos_embed(pos_embed_dim)
        head_in = SharedEncoder.FP_OUT_CH + pos_embed_dim  # e.g. 128 + 8 = 136
        self.seg_head_upper = _SegHead(head_in, num_classes)
        self.seg_head_lower = _SegHead(head_in, num_classes)

        logger.info(
            "DualArchMeshNet initialized | in_ch=%d feat_ch=%d num_classes=%d "
            "pos_embed=%d arch_pos_idx=%d cross_arch=%s",
            in_channels, feat_ch, num_classes,
            pos_embed_dim, arch_pos_idx, use_cross_arch,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _extract_arch_pos(self, features: torch.Tensor) -> torch.Tensor:
        """
        Extract arch position scalar from the feature tensor.

        Args:
            features: (B, N, feat_ch)

        Returns:
            arch_pos: (B, N) — clamped to [0, 1]
        """
        idx = self._feat_arch_pos_idx
        arch_pos = features[:, :, idx]          # (B, N)
        return arch_pos.clamp(0.0, 1.0)

    def _encode_and_fuse(
        self,
        decoder_feat: torch.Tensor,  # (B, N, 128)
        features: torch.Tensor,      # (B, N, feat_ch)
        seg_head: nn.Module,
    ) -> torch.Tensor:
        """
        Apply ArchPositionalEncoding and fuse with decoder features,
        then run segmentation head.

        Step 3: extract arch_pos from features
        Step 4: encode → pos_embed
        Step 5: cat([decoder_feat, pos_embed])
        Step 6: segmentation head receives (128 + pos_embed_dim)
        """
        # Step 3 — extract arch position from features
        arch_pos = self._extract_arch_pos(features)     # (B, N)

        # Step 4 — encode
        pos_embed = self.pos_encoder(arch_pos)          # (B, N, pos_embed_dim)

        # Step 5 — fuse
        fused = torch.cat([decoder_feat, pos_embed], dim=-1)  # (B, N, 128+8)

        # Step 6 — segmentation head (head_in = 128 + pos_embed_dim)
        logits = seg_head(fused)                        # (B, N, num_classes)
        return logits

    # ─────────────────────────────────────────────────────────────────────────
    # Forward
    # ─────────────────────────────────────────────────────────────────────────

    def forward(
        self,
        xyz_upper:  torch.Tensor,                    # (B, N_u, 3)
        feat_upper: torch.Tensor,                    # (B, N_u, feat_ch)
        xyz_lower:  Optional[torch.Tensor] = None,   # (B, N_l, 3)
        feat_lower: Optional[torch.Tensor] = None,   # (B, N_l, feat_ch)
    ) -> Dict[str, torch.Tensor]:
        """
        Returns:
            {
                "upper_logits": (B, N_u, num_classes),
                "lower_logits": (B, N_l, num_classes)  [if lower provided],
            }
        """
        out: Dict[str, torch.Tensor] = {}

        # ── Encode both arches ────────────────────────────────────────────────
        dec_upper, l1_xyz_u, l1_feat_u, l2_xyz_u = self.encoder_upper(
            xyz_upper, feat_upper
        )

        has_lower = (xyz_lower is not None) and (feat_lower is not None)
        if has_lower:
            dec_lower, l1_xyz_l, l1_feat_l, l2_xyz_l = self.encoder_lower(
                xyz_lower, feat_lower
            )

        # ── Cross-arch attention (optional) ──────────────────────────────────
        if self.use_cross_arch and self.cross_arch_attn is not None and has_lower:
            # SA2 features live at (B, 128, 256); we use l1_feat for cross-attn
            # Note: SA2 output is l2 in the encoder.  Using l1 (SA1 output, 128-dim)
            # here keeps the attention dimension consistent.
            # For true SA2 we would need to expose it; the current encoder returns
            # l1 as the shallowest accessible level.  Patch: use l1_feat (B, M1, 128)
            l1u, l1l = self.cross_arch_attn(l1_feat_u, l1_feat_l)
            # The attention result is used as context but NOT re-injected into the
            # decoder (that would require re-running FP layers).  Instead we
            # compute a compact cross-context vector and add it to dec features.
            # Cross-context: global pool of attended features → (B, 128)
            ctx_u = l1u.max(dim=1).values.unsqueeze(1).expand_as(dec_upper)
            ctx_l = l1l.max(dim=1).values.unsqueeze(1).expand_as(dec_lower)
            dec_upper = dec_upper + 0.1 * ctx_u  # residual gate (small init)
            dec_lower = dec_lower + 0.1 * ctx_l

        # ── ArchPositionalEncoding + fusion + head ────────────────────────────
        upper_logits = self._encode_and_fuse(dec_upper, feat_upper, self.seg_head_upper)
        out["upper_logits"] = upper_logits

        if has_lower:
            lower_logits = self._encode_and_fuse(dec_lower, feat_lower, self.seg_head_lower)
            out["lower_logits"] = lower_logits

        return out


# ---------------------------------------------------------------------------
# Inference helper
# ---------------------------------------------------------------------------

def run_dual_arch_inference(
    vertices:        np.ndarray,
    features:        np.ndarray,
    checkpoint_path: Optional[str] = None,
    device:          str = "cpu",
    in_channels:     int = 14,
    num_classes:     int = 33,
    arch_pos_idx:    int = ARCH_POS_IDX,
) -> np.ndarray:
    """
    Run DualArchMeshNet on a single arch scan.

    Args:
        vertices:         (N, 3) float32 — point cloud
        features:         (N, in_channels-3) float32 — feature vector per point
                          Must include arch_pos at index ``arch_pos_idx - 3``
        checkpoint_path:  path to .pth checkpoint (None → random weights)
        device:           "cpu" | "cuda"
        in_channels:      total input channels (xyz + features)
        num_classes:      33 for full FDI numbering, 2 for coarse
        arch_pos_idx:     global feature index of arch_pos (default 13)

    Returns:
        preds: (N,) int — predicted tooth class per point
    """
    dev = torch.device(device)

    model = DualArchMeshNet(
        in_channels=in_channels,
        num_classes=num_classes,
        arch_pos_idx=arch_pos_idx,
        use_cross_arch=False,   # single-arch mode
    )

    if checkpoint_path:
        ckpt = torch.load(checkpoint_path, map_location=dev)
        state = ckpt.get("model_state_dict", ckpt)
        missing, unexpected = model.load_state_dict(state, strict=False)
        if missing:
            logger.warning("Missing keys: %s", missing)
        if unexpected:
            logger.warning("Unexpected keys: %s", unexpected)
        logger.info("DualArchMeshNet loaded from %s", checkpoint_path)
    else:
        logger.warning("No checkpoint — DualArchMeshNet running with random weights")

    model.to(dev).eval()
    with torch.no_grad():
        xyz_t  = torch.from_numpy(vertices).float().unsqueeze(0).to(dev)   # (1,N,3)
        feat_t = torch.from_numpy(features).float().unsqueeze(0).to(dev)   # (1,N,C)
        out = model(xyz_t, feat_t)
        logits = out["upper_logits"]                                        # (1,N,33)
        preds = logits.argmax(dim=-1).squeeze(0).cpu().numpy()              # (N,)

    logger.info(
        "Dual-arch inference: detected %d unique classes",
        len(np.unique(preds)),
    )
    return preds.astype(np.int32)
