"""
PointNet++ Segmentation Model — Original single-task architecture.

Performs per-point tooth segmentation on orthodontic STL point clouds.
This file is preserved for backward compatibility; for multi-task usage
see multitask_pointnet.py.

Architecture:
    SA1 → SA2 → SA3 → SA4 → FP4 → FP3 → FP2 → FP1 → MLP → (B, N, num_classes)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional

from .pointnet2_modules import (
    PointNetSetAbstraction,
    PointNetFeaturePropagation,
)


class PointNet2Segmentation(nn.Module):
    """
    PointNet++ for semantic segmentation of dental point clouds.

    Encodes a raw (B, N, 3) point cloud through 4 SA layers
    and decodes through 4 FP layers to produce per-point logits.
    """

    def __init__(self, num_classes: int = 33):
        """
        Args:
            num_classes: Number of segmentation classes.
                         33 = 32 teeth (FDI) + 1 gingiva/background.
        """
        super().__init__()
        self.num_classes = num_classes

        # ---------- Encoder (Set Abstraction) ----------
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

        # ---------- Decoder (Feature Propagation) ----------
        self.fp4 = PointNetFeaturePropagation(
            in_channel=512 + 256, mlp=[256, 256],
        )
        self.fp3 = PointNetFeaturePropagation(
            in_channel=256 + 128, mlp=[256, 128],
        )
        self.fp2 = PointNetFeaturePropagation(
            in_channel=128 + 64, mlp=[128, 128],
        )
        self.fp1 = PointNetFeaturePropagation(
            in_channel=128 + 3, mlp=[128, 128, 128],
        )

        # ---------- Segmentation head ----------
        self.conv1 = nn.Conv1d(128, 128, 1)
        self.bn1 = nn.BatchNorm1d(128)
        self.drop1 = nn.Dropout(0.5)
        self.conv2 = nn.Conv1d(128, num_classes, 1)

    def forward(
        self, xyz: torch.Tensor
    ) -> torch.Tensor:
        """
        Args:
            xyz: (B, N, 3) input point cloud

        Returns:
            logits: (B, N, num_classes) per-point class logits
        """
        B, N, _ = xyz.shape

        # ---- Encoder ----
        l0_xyz = xyz
        l0_points = xyz  # use coords as initial features

        l1_xyz, l1_points = self.sa1(l0_xyz, None)
        l2_xyz, l2_points = self.sa2(l1_xyz, l1_points)
        l3_xyz, l3_points = self.sa3(l2_xyz, l2_points)
        l4_xyz, l4_points = self.sa4(l3_xyz, l3_points)

        # ---- Decoder ----
        l3_points = self.fp4(l3_xyz, l4_xyz, l3_points, l4_points)
        l2_points = self.fp3(l2_xyz, l3_xyz, l2_points, l3_points)
        l1_points = self.fp2(l1_xyz, l2_xyz, l1_points, l2_points)
        l0_points = self.fp1(l0_xyz, l1_xyz, l0_points, l1_points)

        # ---- Segmentation Head ----
        # l0_points: (B, N, 128) → (B, 128, N)
        x = l0_points.permute(0, 2, 1)
        x = self.drop1(F.relu(self.bn1(self.conv1(x))))
        x = self.conv2(x)  # (B, num_classes, N)

        return x.permute(0, 2, 1)  # (B, N, num_classes)
