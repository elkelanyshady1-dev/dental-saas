"""
patch_meshnet.py — Stage 2: Patch-level individual tooth segmentation model.
=============================================================================

Architecture
------------
A PointNet-style (no hierarchical SA) encoder operating on small local
patches (≤1024 points).  For patch-sized inputs, full PointNet with
T-Net alignment is sufficient and faster than PointNet++ SA layers.

Input  : patch_vertices (B, P, 3) + patch_features (B, P, C)
Output : per-point logits (B, P, num_classes)

    num_classes = max_teeth_per_patch + 1  (0 = background/gingiva)

The model operates in the normalised patch space (centred unit sphere).
Recovering original coordinates requires the MeshPatch.scale and centroid.

Architecture details
--------------------
    T-Net(3)            — input transformation
    SharedMLP [64, 64]  — local features
    T-Net(64)           — feature transformation
    SharedMLP [64, 128, 512] — global features
    MaxPool              — global descriptor (512,)
    FC [512, 256, 128]   — global MLP
    Expand + concat      — (local 64) + (global 128) → 192 per point
    FC [192, 128, 64, num_classes] — output head

This is the classic PointNet segmentation network (Qi et al., 2017).
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger(__name__)

# Max teeth per patch — must match PatchDataset._MAX_TEETH_PER_PATCH
MAX_TEETH_PER_PATCH = 8


# ── T-Net (Spatial Transformer) ───────────────────────────────────────────────

class TNet(nn.Module):
    """Input/feature spatial transformer for PointNet."""

    def __init__(self, k: int = 3) -> None:
        super().__init__()
        self.k = k
        self.mlp = nn.Sequential(
            nn.Conv1d(k, 64, 1),  nn.BatchNorm1d(64),  nn.ReLU(True),
            nn.Conv1d(64, 128, 1), nn.BatchNorm1d(128), nn.ReLU(True),
            nn.Conv1d(128, 1024, 1), nn.BatchNorm1d(1024), nn.ReLU(True),
        )
        self.fc = nn.Sequential(
            nn.Linear(1024, 512), nn.BatchNorm1d(512), nn.ReLU(True),
            nn.Linear(512, 256),  nn.BatchNorm1d(256), nn.ReLU(True),
            nn.Linear(256, k * k),
        )
        self.fc[-1].weight.data.fill_(0)
        self.fc[-1].bias.data = torch.eye(k).view(-1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """x: (B, k, N) → transform matrix (B, k, k)"""
        B = x.shape[0]
        x = self.mlp(x).max(dim=-1).values    # (B, 1024)
        x = self.fc(x)                         # (B, k*k)
        return x.view(B, self.k, self.k)


# ── PatchMeshNet ──────────────────────────────────────────────────────────────

class PatchMeshNet(nn.Module):
    """
    PointNet segmentation head for local patch-level tooth instance labelling.

    Args:
        in_channels:  number of additional feature channels (default 3 = normals)
        num_classes:  number of output classes = max_teeth + 1 background
    """

    def __init__(
        self,
        in_channels: int = 3,
        num_classes: int = MAX_TEETH_PER_PATCH + 1,
    ) -> None:
        super().__init__()
        self.in_channels = in_channels
        self.num_classes = num_classes

        # T-Nets
        self.tnet3  = TNet(k=3)
        self.tnet64 = TNet(k=64)

        total_in = 3 + in_channels   # xyz + features

        # Shared MLPs (implemented as 1D convs)
        self.conv1 = nn.Sequential(
            nn.Conv1d(total_in, 64, 1),  nn.BatchNorm1d(64),  nn.ReLU(True),
            nn.Conv1d(64, 64, 1),         nn.BatchNorm1d(64),  nn.ReLU(True),
        )
        self.conv2 = nn.Sequential(
            nn.Conv1d(64, 64, 1),   nn.BatchNorm1d(64),   nn.ReLU(True),
            nn.Conv1d(64, 128, 1),  nn.BatchNorm1d(128),  nn.ReLU(True),
            nn.Conv1d(128, 512, 1), nn.BatchNorm1d(512),  nn.ReLU(True),
        )
        # Global MLP (applied after max-pool)
        self.global_fc = nn.Sequential(
            nn.Linear(512, 512), nn.BatchNorm1d(512), nn.ReLU(True),
            nn.Linear(512, 256), nn.BatchNorm1d(256), nn.ReLU(True),
            nn.Linear(256, 128), nn.BatchNorm1d(128), nn.ReLU(True),
        )
        # Per-point head: local (64) + global (128) → 192
        self.head = nn.Sequential(
            nn.Conv1d(192, 128, 1), nn.BatchNorm1d(128), nn.ReLU(True),
            nn.Dropout(0.3),
            nn.Conv1d(128, 64, 1),  nn.BatchNorm1d(64),  nn.ReLU(True),
            nn.Conv1d(64, num_classes, 1),
        )

    def forward(
        self,
        xyz: torch.Tensor,                    # (B, P, 3)
        features: Optional[torch.Tensor] = None,  # (B, P, C)
    ) -> torch.Tensor:
        """Returns (B, P, num_classes) logits."""
        B, P, _ = xyz.shape

        # Concatenate xyz + features → (B, total_in, P)
        if features is not None:
            x = torch.cat([xyz, features], dim=-1).permute(0, 2, 1)
        else:
            x = xyz.permute(0, 2, 1)  # (B, 3, P)

        # Input T-Net
        trans3 = self.tnet3(x[:, :3, :])         # (B, 3, 3)
        xyz_t  = torch.bmm(trans3, x[:, :3, :])  # (B, 3, P)
        if features is not None:
            x_in = torch.cat([xyz_t, x[:, 3:, :]], dim=1)
        else:
            x_in = xyz_t

        # Local features
        local_feat = self.conv1(x_in)             # (B, 64, P)

        # Feature T-Net
        trans64 = self.tnet64(local_feat)          # (B, 64, 64)
        feat_t  = torch.bmm(trans64, local_feat)   # (B, 64, P)

        # Global features
        global_feat = self.conv2(feat_t)           # (B, 512, P)
        global_pool = global_feat.max(dim=-1).values  # (B, 512)
        global_emb  = self.global_fc(global_pool)     # (B, 128)

        # Expand global to per-point
        global_exp = global_emb.unsqueeze(-1).expand(-1, -1, P)  # (B, 128, P)

        # Concatenate local + global
        per_point = torch.cat([feat_t, global_exp], dim=1)  # (B, 192, P)

        # Segmentation head
        logits = self.head(per_point)              # (B, num_classes, P)
        return logits.permute(0, 2, 1)             # (B, P, num_classes)
