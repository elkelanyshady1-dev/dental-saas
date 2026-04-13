"""
MultiTaskPointNet — Multi-head PointNet++ for orthodontic STL processing.

Supports four simultaneous tasks from a single shared encoder:
    1. Tooth segmentation   → (B, N, 33)   per-point
    2. Gingiva segmentation → (B, N, 2)    per-point
    3. Base plane prediction → (B, 4)       global  (nx, ny, nz, d)
    4. Bite alignment        → (B, 6)       global  (Tx, Ty, Tz, Rx, Ry, Rz)

Usage:
    model = MultiTaskPointNet()
    out = model(xyz)  # xyz: (B, N, 3)
    out["tooth_logits"]     # (B, N, 33)
    out["gingiva_logits"]   # (B, N, 2)
    out["base_plane"]       # (B, 4)
    out["bite_transform"]   # (B, 6)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict

from .pointnet2_modules import (
    PointNetSetAbstraction,
    PointNetFeaturePropagation,
)


# ---------------------------------------------------------------------------
# Task-specific heads
# ---------------------------------------------------------------------------

class ToothSegmentationHead(nn.Module):
    """Per-point tooth segmentation head.  (B, N, 128) → (B, N, 33)"""

    def __init__(self, in_channels: int = 128, num_classes: int = 33):
        super().__init__()
        self.conv1 = nn.Conv1d(in_channels, 128, 1)
        self.bn1 = nn.BatchNorm1d(128)
        self.drop1 = nn.Dropout(0.5)
        self.conv2 = nn.Conv1d(128, 64, 1)
        self.bn2 = nn.BatchNorm1d(64)
        self.conv3 = nn.Conv1d(64, num_classes, 1)

    def forward(self, point_features: torch.Tensor) -> torch.Tensor:
        """
        Args:
            point_features: (B, N, C) per-point features from decoder

        Returns:
            logits: (B, N, num_classes)
        """
        x = point_features.permute(0, 2, 1)  # (B, C, N)
        x = self.drop1(F.relu(self.bn1(self.conv1(x))))
        x = F.relu(self.bn2(self.conv2(x)))
        x = self.conv3(x)
        return x.permute(0, 2, 1)  # (B, N, 33)


class GingivaSegmentationHead(nn.Module):
    """Per-point gingiva segmentation head.  (B, N, 128) → (B, N, 2)"""

    def __init__(self, in_channels: int = 128, num_classes: int = 2):
        super().__init__()
        self.conv1 = nn.Conv1d(in_channels, 64, 1)
        self.bn1 = nn.BatchNorm1d(64)
        self.drop1 = nn.Dropout(0.3)
        self.conv2 = nn.Conv1d(64, num_classes, 1)

    def forward(self, point_features: torch.Tensor) -> torch.Tensor:
        """
        Args:
            point_features: (B, N, C) per-point features

        Returns:
            logits: (B, N, 2)
        """
        x = point_features.permute(0, 2, 1)
        x = self.drop1(F.relu(self.bn1(self.conv1(x))))
        x = self.conv2(x)
        return x.permute(0, 2, 1)  # (B, N, 2)


class BasePlaneHead(nn.Module):
    """
    Predicts model base plane parameters from global features.
    Output: [nx, ny, nz, d]  — plane normal + offset.

    (B, 1024) → (B, 4)
    """

    def __init__(self, in_channels: int = 1024):
        super().__init__()
        self.fc1 = nn.Linear(in_channels, 256)
        self.bn1 = nn.BatchNorm1d(256)
        self.drop1 = nn.Dropout(0.3)
        self.fc2 = nn.Linear(256, 64)
        self.bn2 = nn.BatchNorm1d(64)
        self.fc3 = nn.Linear(64, 4)

    def forward(self, global_features: torch.Tensor) -> torch.Tensor:
        """
        Args:
            global_features: (B, D) global descriptor

        Returns:
            plane_params: (B, 4) — [nx, ny, nz, d]
        """
        x = self.drop1(F.relu(self.bn1(self.fc1(global_features))))
        x = F.relu(self.bn2(self.fc2(x)))
        x = self.fc3(x)

        # Normalize the normal vector for geometric consistency
        normal = F.normalize(x[:, :3], p=2, dim=-1)
        d = x[:, 3:4]
        return torch.cat([normal, d], dim=-1)


class BiteAlignmentHead(nn.Module):
    """
    Predicts rigid transform for bite alignment from global features.
    Output: [Tx, Ty, Tz, Rx, Ry, Rz]

    (B, 1024) → (B, 6)
    """

    def __init__(self, in_channels: int = 1024):
        super().__init__()
        self.fc1 = nn.Linear(in_channels, 256)
        self.bn1 = nn.BatchNorm1d(256)
        self.drop1 = nn.Dropout(0.3)
        self.fc2 = nn.Linear(256, 128)
        self.bn2 = nn.BatchNorm1d(128)
        self.fc3 = nn.Linear(128, 6)

    def forward(self, global_features: torch.Tensor) -> torch.Tensor:
        """
        Args:
            global_features: (B, D) global descriptor

        Returns:
            transform: (B, 6) — [Tx, Ty, Tz, Rx, Ry, Rz]
        """
        x = self.drop1(F.relu(self.bn1(self.fc1(global_features))))
        x = F.relu(self.bn2(self.fc2(x)))
        x = self.fc3(x)
        return x


# ---------------------------------------------------------------------------
# Shared Encoder
# ---------------------------------------------------------------------------

class PointNet2Encoder(nn.Module):
    """
    Shared PointNet++ encoder producing both per-point and global features.

    Encoder:  SA1 → SA2 → SA3 → SA4
    Decoder:  FP4 → FP3 → FP2 → FP1

    Outputs:
        point_features:  (B, N, 128) — per-point features at full resolution
        global_features: (B, 1024)   — scene-level global descriptor
    """

    def __init__(self):
        super().__init__()

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

        # Global feature aggregation (group_all)
        self.sa_global = PointNetSetAbstraction(
            npoint=None, radius=None, nsample=None,
            in_channel=512 + 3, mlp=[512, 512, 1024],
            group_all=True,
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

    def forward(self, xyz: torch.Tensor):
        """
        Args:
            xyz: (B, N, 3) input point cloud

        Returns:
            point_features:  (B, N, 128)
            global_features: (B, 1024)
        """
        # ---- Encoder ----
        l0_xyz = xyz
        l0_points = xyz

        l1_xyz, l1_points = self.sa1(l0_xyz, None)
        l2_xyz, l2_points = self.sa2(l1_xyz, l1_points)
        l3_xyz, l3_points = self.sa3(l2_xyz, l2_points)
        l4_xyz, l4_points = self.sa4(l3_xyz, l3_points)

        # Global features via group-all SA
        _, global_points = self.sa_global(l4_xyz, l4_points)
        global_features = global_points.squeeze(1)  # (B, 1024)

        # ---- Decoder (for per-point features) ----
        l3_points = self.fp4(l3_xyz, l4_xyz, l3_points, l4_points)
        l2_points = self.fp3(l2_xyz, l3_xyz, l2_points, l3_points)
        l1_points = self.fp2(l1_xyz, l2_xyz, l1_points, l2_points)
        l0_points = self.fp1(l0_xyz, l1_xyz, l0_points, l1_points)

        return l0_points, global_features


# ---------------------------------------------------------------------------
# Multi-Task Model
# ---------------------------------------------------------------------------

class MultiTaskPointNet(nn.Module):
    """
    Multi-task PointNet++ for orthodontic STL processing.

    Shared encoder → 4 task heads:
        1. Tooth segmentation   → (B, N, 33)
        2. Gingiva segmentation → (B, N, 2)
        3. Base plane            → (B, 4)
        4. Bite alignment        → (B, 6)

    Example:
        >>> model = MultiTaskPointNet()
        >>> xyz = torch.randn(2, 4096, 3)
        >>> out = model(xyz)
        >>> out["tooth_logits"].shape    # (2, 4096, 33)
        >>> out["gingiva_logits"].shape  # (2, 4096, 2)
        >>> out["base_plane"].shape      # (2, 4)
        >>> out["bite_transform"].shape  # (2, 6)
    """

    # Default multi-task loss weights
    DEFAULT_LOSS_WEIGHTS = {
        "tooth": 1.0,
        "gingiva": 0.7,
        "base_plane": 0.4,
        "bite_transform": 0.4,
    }

    def __init__(
        self,
        num_tooth_classes: int = 33,
        num_gingiva_classes: int = 2,
    ):
        super().__init__()

        # Shared backbone
        self.encoder = PointNet2Encoder()

        # Task-specific heads
        self.tooth_head = ToothSegmentationHead(
            in_channels=128, num_classes=num_tooth_classes,
        )
        self.gingiva_head = GingivaSegmentationHead(
            in_channels=128, num_classes=num_gingiva_classes,
        )
        self.base_plane_head = BasePlaneHead(in_channels=1024)
        self.bite_alignment_head = BiteAlignmentHead(in_channels=1024)

    def forward(self, xyz: torch.Tensor) -> Dict[str, torch.Tensor]:
        """
        Full forward pass through shared encoder + all task heads.

        Args:
            xyz: (B, N, 3) input point cloud

        Returns:
            dict with keys:
                tooth_logits:    (B, N, 33) tooth segmentation logits
                gingiva_logits:  (B, N, 2)  gingiva segmentation logits
                base_plane:      (B, 4)     plane parameters [nx, ny, nz, d]
                bite_transform:  (B, 6)     rigid transform [Tx Ty Tz Rx Ry Rz]
                point_features:  (B, N, 128) intermediate features (for analysis)
                global_features: (B, 1024)   global features (for analysis)
        """
        point_features, global_features = self.encoder(xyz)

        tooth_logits = self.tooth_head(point_features)
        gingiva_logits = self.gingiva_head(point_features)
        base_plane = self.base_plane_head(global_features)
        bite_transform = self.bite_alignment_head(global_features)

        return {
            "tooth_logits": tooth_logits,
            "gingiva_logits": gingiva_logits,
            "base_plane": base_plane,
            "bite_transform": bite_transform,
            "point_features": point_features,
            "global_features": global_features,
        }

    def forward_segmentation_only(self, xyz: torch.Tensor) -> torch.Tensor:
        """
        Backward-compatible: run only tooth segmentation.

        Args:
            xyz: (B, N, 3)

        Returns:
            tooth_logits: (B, N, 33)
        """
        point_features, _ = self.encoder(xyz)
        return self.tooth_head(point_features)


# ---------------------------------------------------------------------------
# Loss functions — geometrically meaningful for orthodontic tasks
# ---------------------------------------------------------------------------

class FocalLoss(nn.Module):
    """
    Focal Loss (Lin et al., 2017) for handling class imbalance.

    Reduces the loss contribution from well-classified points and focuses
    on hard-to-classify boundary regions — critical for dental segmentation
    where gingiva dominates and rare teeth are underrepresented.

    FL(p_t) = -alpha_t * (1 - p_t)^gamma * log(p_t)
    """

    def __init__(
        self,
        alpha: float = 0.25,
        gamma: float = 2.0,
        weight: torch.Tensor = None,
        reduction: str = "mean",
    ):
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.weight = weight
        self.reduction = reduction

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """
        Args:
            logits:  (B, C, N) raw class scores
            targets: (B, N)    class indices

        Returns:
            scalar focal loss
        """
        ce_loss = F.cross_entropy(
            logits, targets, weight=self.weight, reduction="none"
        )
        p_t = torch.exp(-ce_loss)
        focal_loss = self.alpha * (1.0 - p_t) ** self.gamma * ce_loss

        if self.reduction == "mean":
            return focal_loss.mean()
        elif self.reduction == "sum":
            return focal_loss.sum()
        return focal_loss


class DiceBCELoss(nn.Module):
    """
    Dice + BCE loss for binary gingiva segmentation.

    Dice loss handles class imbalance better than pure CE for binary
    boundary tasks. Combined with BCE for gradient stability.
    """

    def __init__(self, dice_weight: float = 0.5, smooth: float = 1.0):
        super().__init__()
        self.dice_weight = dice_weight
        self.bce_weight = 1.0 - dice_weight
        self.smooth = smooth

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """
        Args:
            logits:  (B, 2, N) raw class scores
            targets: (B, N)    binary labels {0, 1}

        Returns:
            scalar combined loss
        """
        # BCE component
        bce_loss = F.cross_entropy(logits, targets)

        # Dice component (on class 1 = gingiva)
        probs = F.softmax(logits, dim=1)[:, 1, :]  # (B, N) prob of gingiva
        targets_float = targets.float()

        intersection = (probs * targets_float).sum(dim=-1)
        union = probs.sum(dim=-1) + targets_float.sum(dim=-1)
        dice = (2.0 * intersection + self.smooth) / (union + self.smooth)
        dice_loss = 1.0 - dice.mean()

        return self.bce_weight * bce_loss + self.dice_weight * dice_loss


class PlaneAngularLoss(nn.Module):
    """
    Angular loss for base plane prediction.

    Uses cosine similarity on normals: L = 1 - |dot(n_pred, n_gt)|
    Plus MSE on offset d. The absolute value handles flipped normals.
    """

    def __init__(self, offset_weight: float = 0.5):
        super().__init__()
        self.offset_weight = offset_weight

    def forward(
        self, pred_plane: torch.Tensor, gt_plane: torch.Tensor
    ) -> torch.Tensor:
        """
        Args:
            pred_plane: (B, 4) predicted [nx, ny, nz, d]
            gt_plane:   (B, 4) ground truth [nx, ny, nz, d]

        Returns:
            scalar angular + offset loss
        """
        pred_n = F.normalize(pred_plane[:, :3], p=2, dim=-1)
        gt_n = F.normalize(gt_plane[:, :3], p=2, dim=-1)

        # Angular loss: 1 - |cos(angle)| — handles normal flips
        cos_sim = (pred_n * gt_n).sum(dim=-1)
        angular_loss = (1.0 - cos_sim.abs()).mean()

        # Offset loss
        offset_loss = F.mse_loss(pred_plane[:, 3], gt_plane[:, 3])

        return angular_loss + self.offset_weight * offset_loss


class TransformLoss(nn.Module):
    """
    Split loss for rigid transform [Tx, Ty, Tz, Rx, Ry, Rz].

    Separates translation (MSE in mm) from rotation (angular error in rad)
    to avoid mixing distance and angle units.
    """

    def __init__(self, rotation_weight: float = 1.0):
        super().__init__()
        self.rotation_weight = rotation_weight

    def forward(
        self, pred_transform: torch.Tensor, gt_transform: torch.Tensor
    ) -> torch.Tensor:
        """
        Args:
            pred_transform: (B, 6) predicted [Tx, Ty, Tz, Rx, Ry, Rz]
            gt_transform:   (B, 6) ground truth

        Returns:
            scalar combined loss
        """
        # Translation MSE (first 3 components)
        trans_loss = F.mse_loss(pred_transform[:, :3], gt_transform[:, :3])

        # Rotation angular error (last 3 components)
        rot_diff = pred_transform[:, 3:] - gt_transform[:, 3:]
        rot_loss = (rot_diff ** 2).sum(dim=-1).mean()

        return trans_loss + self.rotation_weight * rot_loss


# ---------------------------------------------------------------------------
# Multi-task loss aggregator
# ---------------------------------------------------------------------------

class MultiTaskLoss(nn.Module):
    """
    Production-grade multi-task loss for orthodontic PointNet++.

    Uses geometrically meaningful losses for each task:
        Tooth:   Focal Loss (handles class imbalance at boundaries)
        Gingiva: Dice + BCE (binary boundary segmentation)
        Base:    Angular cosine loss (respects normal geometry)
        Bite:    Split translation MSE + rotation angular error

    L = w_tooth * Focal(tooth) + w_gingiva * DiceBCE(gingiva)
      + w_base  * Angular(base) + w_bite * Transform(bite)

    Supports two-phase training:
        Phase 1: Only segmentation losses (tooth + gingiva)
        Phase 2: All four losses (full multi-task)
    """

    def __init__(
        self,
        w_tooth: float = 1.0,
        w_gingiva: float = 0.7,
        w_base: float = 0.4,
        w_bite: float = 0.4,
        tooth_class_weights: torch.Tensor = None,
        focal_gamma: float = 2.0,
        phase: int = 2,
    ):
        super().__init__()
        self.w_tooth = w_tooth
        self.w_gingiva = w_gingiva
        self.w_base = w_base
        self.w_bite = w_bite
        self.phase = phase

        # Task-specific loss functions
        self.tooth_loss = FocalLoss(
            gamma=focal_gamma, weight=tooth_class_weights
        )
        self.gingiva_loss = DiceBCELoss(dice_weight=0.5)
        self.base_loss = PlaneAngularLoss(offset_weight=0.5)
        self.bite_loss = TransformLoss(rotation_weight=1.0)

    def set_phase(self, phase: int):
        """Switch training phase (1=segmentation-only, 2=full multi-task)."""
        assert phase in (1, 2), f"Phase must be 1 or 2, got {phase}"
        self.phase = phase

    def forward(
        self,
        predictions: Dict[str, torch.Tensor],
        targets: Dict[str, torch.Tensor],
    ) -> Dict[str, torch.Tensor]:
        """
        Compute weighted multi-task loss.

        Args:
            predictions: model output dict from MultiTaskPointNet.forward()
            targets: dict with keys:
                tooth_labels:    (B, N)  long tensor of tooth class indices
                gingiva_labels:  (B, N)  long tensor {0=non-gingiva, 1=gingiva}
                base_plane:      (B, 4)  float ground truth plane params
                bite_transform:  (B, 6)  float ground truth transform params

        Returns:
            dict with "total", "tooth", "gingiva", "base_plane", "bite_transform"
        """
        # Tooth segmentation: Focal Loss — (B, N, C) → (B, C, N)
        tooth_logits = predictions["tooth_logits"].permute(0, 2, 1)
        loss_tooth = self.tooth_loss(tooth_logits, targets["tooth_labels"])

        # Gingiva segmentation: Dice + BCE
        gingiva_logits = predictions["gingiva_logits"].permute(0, 2, 1)
        loss_gingiva = self.gingiva_loss(
            gingiva_logits, targets["gingiva_labels"]
        )

        # Phase 1: segmentation-only
        if self.phase == 1:
            total = self.w_tooth * loss_tooth + self.w_gingiva * loss_gingiva
            return {
                "total": total,
                "tooth": loss_tooth,
                "gingiva": loss_gingiva,
                "base_plane": torch.tensor(0.0, device=total.device),
                "bite_transform": torch.tensor(0.0, device=total.device),
            }

        # Phase 2: full multi-task
        # Base plane: angular cosine loss
        loss_base = self.base_loss(
            predictions["base_plane"], targets["base_plane"]
        )

        # Bite alignment: split translation + rotation
        loss_bite = self.bite_loss(
            predictions["bite_transform"], targets["bite_transform"]
        )

        total = (
            self.w_tooth * loss_tooth
            + self.w_gingiva * loss_gingiva
            + self.w_base * loss_base
            + self.w_bite * loss_bite
        )

        return {
            "total": total,
            "tooth": loss_tooth,
            "gingiva": loss_gingiva,
            "base_plane": loss_base,
            "bite_transform": loss_bite,
        }
