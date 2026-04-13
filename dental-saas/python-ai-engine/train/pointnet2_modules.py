"""
PointNet++ Set Abstraction & Feature Propagation modules.

These are the fundamental building blocks for the PointNet++ architecture,
implementing hierarchical point cloud processing for orthodontic STL data.

References:
    Qi et al., "PointNet++: Deep Hierarchical Feature Learning on Point Sets
    in a Metric Space", NeurIPS 2017.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional, Tuple


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def square_distance(src: torch.Tensor, dst: torch.Tensor) -> torch.Tensor:
    """
    Compute pairwise squared Euclidean distance between two point clouds.

    Args:
        src: (B, N, C) source points
        dst: (B, M, C) target points

    Returns:
        dist: (B, N, M) squared distances
    """
    B, N, _ = src.shape
    _, M, _ = dst.shape
    dist = -2.0 * torch.matmul(src, dst.permute(0, 2, 1))
    dist += torch.sum(src ** 2, dim=-1).unsqueeze(-1)
    dist += torch.sum(dst ** 2, dim=-1).unsqueeze(1)
    return dist


def farthest_point_sample(xyz: torch.Tensor, npoint: int) -> torch.Tensor:
    """
    Iterative farthest point sampling.

    Args:
        xyz: (B, N, 3) input point cloud
        npoint: number of points to sample

    Returns:
        centroids: (B, npoint) indices of sampled points
    """
    device = xyz.device
    B, N, C = xyz.shape
    centroids = torch.zeros(B, npoint, dtype=torch.long, device=device)
    distance = torch.full((B, N), 1e10, device=device)
    farthest = torch.randint(0, N, (B,), dtype=torch.long, device=device)
    batch_indices = torch.arange(B, dtype=torch.long, device=device)

    for i in range(npoint):
        centroids[:, i] = farthest
        centroid = xyz[batch_indices, farthest, :].view(B, 1, 3)
        dist = torch.sum((xyz - centroid) ** 2, dim=-1)
        distance = torch.min(distance, dist)
        farthest = torch.max(distance, dim=-1)[1]

    return centroids


def index_points(points: torch.Tensor, idx: torch.Tensor) -> torch.Tensor:
    """
    Gather points by index.

    Args:
        points: (B, N, C) input points
        idx: (B, S) or (B, S, K) index tensor

    Returns:
        new_points: (B, S, C) or (B, S, K, C) indexed points
    """
    device = points.device
    B = points.shape[0]
    view_shape = list(idx.shape)
    view_shape[1:] = [1] * (len(view_shape) - 1)
    repeat_shape = list(idx.shape)
    repeat_shape[0] = 1
    batch_indices = (
        torch.arange(B, dtype=torch.long, device=device)
        .view(view_shape)
        .repeat(repeat_shape)
    )
    new_points = points[batch_indices, idx, :]
    return new_points


def query_ball_point(
    radius: float, nsample: int, xyz: torch.Tensor, new_xyz: torch.Tensor
) -> torch.Tensor:
    """
    Ball query: find all points within radius of each centroid.

    Args:
        radius: local region radius
        nsample: max number of neighbors
        xyz: (B, N, 3) all points
        new_xyz: (B, S, 3) query (centroid) points

    Returns:
        group_idx: (B, S, nsample) indices of grouped points
    """
    device = xyz.device
    B, N, C = xyz.shape
    _, S, _ = new_xyz.shape

    group_idx = (
        torch.arange(N, dtype=torch.long, device=device)
        .view(1, 1, N)
        .repeat(B, S, 1)
    )
    sqrdists = square_distance(new_xyz, xyz)  # (B, S, N)
    group_idx[sqrdists > radius ** 2] = N
    group_idx = group_idx.sort(dim=-1)[0][:, :, :nsample]

    # Fill with first element where not enough neighbors
    group_first = group_idx[:, :, 0].view(B, S, 1).repeat(1, 1, nsample)
    mask = group_idx == N
    group_idx[mask] = group_first[mask]

    return group_idx


def sample_and_group(
    npoint: int,
    radius: float,
    nsample: int,
    xyz: torch.Tensor,
    points: Optional[torch.Tensor] = None,
    returnfps: bool = False,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Sample centroids + group neighbors.

    Args:
        npoint: number of centroids
        radius: ball query radius
        nsample: neighbors per centroid
        xyz: (B, N, 3) input coordinates
        points: (B, N, D) optional features
        returnfps: whether to return FPS indices

    Returns:
        new_xyz: (B, npoint, 3) centroid coordinates
        new_points: (B, npoint, nsample, 3+D) grouped & centered features
    """
    B, N, C = xyz.shape
    S = npoint

    fps_idx = farthest_point_sample(xyz, npoint)  # (B, S)
    new_xyz = index_points(xyz, fps_idx)  # (B, S, 3)

    idx = query_ball_point(radius, nsample, xyz, new_xyz)  # (B, S, nsample)
    grouped_xyz = index_points(xyz, idx)  # (B, S, nsample, 3)
    grouped_xyz_norm = grouped_xyz - new_xyz.view(B, S, 1, C)  # center

    if points is not None:
        grouped_points = index_points(points, idx)
        new_points = torch.cat([grouped_xyz_norm, grouped_points], dim=-1)
    else:
        new_points = grouped_xyz_norm

    if returnfps:
        return new_xyz, new_points, grouped_xyz, fps_idx
    return new_xyz, new_points


def sample_and_group_all(
    xyz: torch.Tensor, points: Optional[torch.Tensor] = None
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Group all points into a single set (for the deepest SA layer).

    Args:
        xyz: (B, N, 3) input coordinates
        points: (B, N, D) optional features

    Returns:
        new_xyz: (B, 1, 3) — origin
        new_points: (B, 1, N, 3+D) grouped features
    """
    device = xyz.device
    B, N, C = xyz.shape
    new_xyz = torch.zeros(B, 1, C, device=device)
    grouped_xyz = xyz.view(B, 1, N, C)

    if points is not None:
        new_points = torch.cat(
            [grouped_xyz, points.view(B, 1, N, -1)], dim=-1
        )
    else:
        new_points = grouped_xyz

    return new_xyz, new_points


# ---------------------------------------------------------------------------
# Set Abstraction Module
# ---------------------------------------------------------------------------

class PointNetSetAbstraction(nn.Module):
    """
    PointNet++ Set Abstraction layer.

    Performs: FPS → Ball Query → Mini-PointNet → Max Pool
    to produce a smaller, richer point cloud.
    """

    def __init__(
        self,
        npoint: Optional[int],
        radius: float,
        nsample: int,
        in_channel: int,
        mlp: list,
        group_all: bool = False,
    ):
        super().__init__()
        self.npoint = npoint
        self.radius = radius
        self.nsample = nsample
        self.group_all = group_all

        self.mlp_convs = nn.ModuleList()
        self.mlp_bns = nn.ModuleList()
        last_channel = in_channel
        for out_channel in mlp:
            self.mlp_convs.append(nn.Conv2d(last_channel, out_channel, 1))
            self.mlp_bns.append(nn.BatchNorm2d(out_channel))
            last_channel = out_channel

    def forward(
        self, xyz: torch.Tensor, points: Optional[torch.Tensor] = None
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            xyz: (B, N, 3) input coordinates
            points: (B, N, D) input features (or None)

        Returns:
            new_xyz: (B, S, 3) sampled coordinates
            new_points: (B, S, D') aggregated features
        """
        if self.group_all:
            new_xyz, new_points = sample_and_group_all(xyz, points)
        else:
            new_xyz, new_points = sample_and_group(
                self.npoint, self.radius, self.nsample, xyz, points
            )

        # new_points: (B, S, nsample, C) → (B, C, nsample, S) for Conv2d
        new_points = new_points.permute(0, 3, 2, 1)

        for conv, bn in zip(self.mlp_convs, self.mlp_bns):
            new_points = F.relu(bn(conv(new_points)))

        # Max pool over neighbors: (B, D', 1, S) → (B, S, D')
        new_points = torch.max(new_points, dim=2)[0]
        new_points = new_points.permute(0, 2, 1)

        return new_xyz, new_points


# ---------------------------------------------------------------------------
# Feature Propagation Module
# ---------------------------------------------------------------------------

class PointNetFeaturePropagation(nn.Module):
    """
    PointNet++ Feature Propagation layer.

    Uses inverse-distance-weighted interpolation + skip connections
    to upsample features back to the original point cloud resolution.
    """

    def __init__(self, in_channel: int, mlp: list):
        super().__init__()
        self.mlp_convs = nn.ModuleList()
        self.mlp_bns = nn.ModuleList()
        last_channel = in_channel
        for out_channel in mlp:
            self.mlp_convs.append(nn.Conv1d(last_channel, out_channel, 1))
            self.mlp_bns.append(nn.BatchNorm1d(out_channel))
            last_channel = out_channel

    def forward(
        self,
        xyz1: torch.Tensor,
        xyz2: torch.Tensor,
        points1: Optional[torch.Tensor],
        points2: torch.Tensor,
    ) -> torch.Tensor:
        """
        Propagate features from xyz2 (fewer points) to xyz1 (more points).

        Args:
            xyz1: (B, N, 3) target coordinates
            xyz2: (B, S, 3) source coordinates
            points1: (B, N, D1) target features (skip connection)
            points2: (B, S, D2) source features

        Returns:
            new_points: (B, N, D') propagated features
        """
        B, N, C = xyz1.shape
        _, S, _ = xyz2.shape

        if S == 1:
            # Broadcast single point
            interpolated_points = points2.repeat(1, N, 1)
        else:
            dists = square_distance(xyz1, xyz2)  # (B, N, S)
            dists, idx = dists.sort(dim=-1)
            dists, idx = dists[:, :, :3], idx[:, :, :3]  # 3-NN

            dist_recip = 1.0 / (dists + 1e-8)
            norm = torch.sum(dist_recip, dim=2, keepdim=True)
            weight = dist_recip / norm  # (B, N, 3)

            interpolated_points = torch.sum(
                index_points(points2, idx) * weight.unsqueeze(-1), dim=2
            )  # (B, N, D2)

        if points1 is not None:
            new_points = torch.cat([points1, interpolated_points], dim=-1)
        else:
            new_points = interpolated_points

        # (B, N, D) → (B, D, N) for Conv1d
        new_points = new_points.permute(0, 2, 1)
        for conv, bn in zip(self.mlp_convs, self.mlp_bns):
            new_points = F.relu(bn(conv(new_points)))

        return new_points.permute(0, 2, 1)  # (B, N, D')
