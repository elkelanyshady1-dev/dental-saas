"""
tooth_graph_segmentation.py — PointNet++ + Tooth Adjacency GNN.

Architecture (Step 6):
    PointNet++ encoder + decoder  →  per-point features  (B, N, 128)
            ↓
    ToothGraphGNN  →  tooth-level graph features         (B, N, 64)
            ↓
    Concat [ point_feat | graph_feat ]                   (B, N, 192)
            ↓
    Conv1D(192→128) → Conv1D(128→64) → Conv1D(64→C)     (B, N, C)

The GNN takes soft predictions from an intermediate segmentation pass
(1-step iterative refinement) as pseudo-labels for graph construction,
making the entire pipeline end-to-end differentiable.

Usage:
    model = ToothGraphSegmentation(num_classes=33)
    logits = model(xyz)   # (B, N, 33) — same API as PointNet2Segmentation
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from .pointnet2_modules import (
    PointNetSetAbstraction,
    PointNetFeaturePropagation,
)
try:
    from geometry.tooth_graph import ToothGraphGNN
except ImportError:
    from ..geometry.tooth_graph import ToothGraphGNN


class ToothGraphSegmentation(nn.Module):
    """
    PointNet++ segmentation augmented with a Tooth Adjacency Graph layer.

    The model runs PointNet++ SA+FP to get per-point features, then:
    1. Makes a coarse prediction to get soft tooth assignments.
    2. Passes those through the GNN to get inter-tooth context.
    3. Concatenates GNN features with PointNet++ features.
    4. Makes the final per-point prediction.

    Parameters
    ----------
    num_classes   : int  — number of segmentation classes (33)
    gnn_hidden    : int  — GNN hidden dimension           (128)
    gnn_out       : int  — GNN output dimension           (64)
    gnn_k         : int  — k-NN connectivity for graph    (3)
    """

    def __init__(
        self,
        num_classes: int = 33,
        gnn_hidden: int = 128,
        gnn_out: int = 64,
        gnn_k: int = 3,
    ):
        super().__init__()
        self.num_classes = num_classes
        self.gnn_out = gnn_out
        POINT_FEAT_DIM = 128   # FP1 output channels

        # ── PointNet++ Encoder ────────────────────────────────────────────
        self.sa1 = PointNetSetAbstraction(
            npoint=1024, radius=0.1, nsample=32,
            in_channel=3, mlp=[32, 32, 64],
        )
        self.sa2 = PointNetSetAbstraction(
            npoint=256, radius=0.2, nsample=32,
            in_channel=64 + 3, mlp=[64, 64, 128],
        )
        self.sa3 = PointNetSetAbstraction(
            npoint=64, radius=0.4, nsample=32,
            in_channel=128 + 3, mlp=[128, 128, 256],
        )
        self.sa4 = PointNetSetAbstraction(
            npoint=16, radius=0.8, nsample=32,
            in_channel=256 + 3, mlp=[256, 256, 512],
        )

        # ── PointNet++ Decoder ────────────────────────────────────────────
        self.fp4 = PointNetFeaturePropagation(512 + 256, [256, 256])
        self.fp3 = PointNetFeaturePropagation(256 + 128, [256, 128])
        self.fp2 = PointNetFeaturePropagation(128 + 64,  [128, 128])
        self.fp1 = PointNetFeaturePropagation(128 + 3,   [128, 128, POINT_FEAT_DIM])

        # ── Coarse segmentation head (for graph pseudo-labels) ────────────
        self.coarse_conv = nn.Conv1d(POINT_FEAT_DIM, num_classes, 1)

        # ── Tooth Graph GNN ───────────────────────────────────────────────
        self.gnn = ToothGraphGNN(
            in_dim=POINT_FEAT_DIM,
            hidden_dim=gnn_hidden,
            out_dim=gnn_out,
            k=gnn_k,
            num_classes=num_classes,
        )

        # ── Final segmentation head (Step 6) ─────────────────────────────
        fused_dim = POINT_FEAT_DIM + gnn_out   # 128 + 64 = 192
        self.final_conv1 = nn.Conv1d(fused_dim, 128, 1)
        self.final_bn1   = nn.BatchNorm1d(128)
        self.final_conv2 = nn.Conv1d(128, 64, 1)
        self.final_bn2   = nn.BatchNorm1d(64)
        self.final_conv3 = nn.Conv1d(64, num_classes, 1)
        self.drop         = nn.Dropout(0.4)

    def _encode_decode(self, xyz: torch.Tensor):
        """Run PointNet++ SA+FP, return (B, N, 128) per-point features."""
        l0_xyz = xyz
        l0_points = xyz

        l1_xyz, l1_points = self.sa1(l0_xyz, None)
        l2_xyz, l2_points = self.sa2(l1_xyz, l1_points)
        l3_xyz, l3_points = self.sa3(l2_xyz, l2_points)
        l4_xyz, l4_points = self.sa4(l3_xyz, l3_points)

        l3_points = self.fp4(l3_xyz, l4_xyz, l3_points, l4_points)
        l2_points = self.fp3(l2_xyz, l3_xyz, l2_points, l3_points)
        l1_points = self.fp2(l1_xyz, l2_xyz, l1_points, l2_points)
        l0_points = self.fp1(l0_xyz, l1_xyz, l0_points, l1_points)

        return l0_points  # (B, N, 128)

    def forward(
        self,
        xyz: torch.Tensor,
        return_graph_info: bool = False,
    ):
        """
        Parameters
        ----------
        xyz              : (B, N, 3) input point cloud
        return_graph_info: if True, also return centroids & adjacency matrix
                           for visualisation (Step 9).

        Returns
        -------
        logits     : (B, N, num_classes)
        [centroids : (B, T, 3)]   — only when return_graph_info=True
        [adj       : (B, T, T)]   — only when return_graph_info=True
        """
        B, N, _ = xyz.shape

        # ── PointNet++ encode + decode ─────────────────────────────────────
        point_feats = self._encode_decode(xyz)   # (B, N, 128)

        # ── Coarse prediction for pseudo-labels ───────────────────────────
        coarse_logits = self.coarse_conv(
            point_feats.permute(0, 2, 1)         # (B, 128, N)
        ).permute(0, 2, 1)                       # (B, N, C)

        with torch.no_grad():
            pseudo_labels = coarse_logits.argmax(dim=-1)  # (B, N)

        # ── Tooth Graph GNN ───────────────────────────────────────────────
        graph_feats, centroids, adj = self.gnn(
            point_feats, xyz, pseudo_labels
        )  # (B, N, gnn_out)

        # ── Fuse features (Step 5) ────────────────────────────────────────
        fused = torch.cat([point_feats, graph_feats], dim=-1)  # (B, N, 192)

        # ── Final segmentation head (Step 6) ─────────────────────────────
        x = fused.permute(0, 2, 1)                       # (B, 192, N)
        x = self.drop(F.relu(self.final_bn1(self.final_conv1(x))))
        x = self.drop(F.relu(self.final_bn2(self.final_conv2(x))))
        logits = self.final_conv3(x).permute(0, 2, 1)   # (B, N, C)

        if return_graph_info:
            return logits, centroids, adj
        return logits
