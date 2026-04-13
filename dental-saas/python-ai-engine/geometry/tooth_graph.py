"""
geometry/tooth_graph.py — Tooth Adjacency Graph Learning module.

Implements a tooth-level Graph Neural Network (GNN) layer that captures
inter-tooth relationships in orthodontic point cloud segmentation.

Pipeline within the model forward pass:
    per-point features (B, N, F)
    ↓  [aggregate by predicted/gt label]
    tooth node features  (B, T, F)  — T ≤ 33 tooth classes
    ↓  [build k-NN adjacency on tooth centroids]
    edge_index  (B, T, k)
    ↓  [3× graph conv with mean-aggregation message passing]
    updated node features  (B, T, G)  — G = 64
    ↓  [broadcast back to points via label assignment]
    point-level graph features  (B, N, G)
    ↓  concat with original per-point features
    (B, N, F+G)

Design choices
--------------
* **No external library required** — implemented entirely in PyTorch using
  dense adjacency matrices and masked attention. This avoids the PyTorch
  Geometric dependency.
* **Batch-safe** — all operations are vectorised over the batch dimension.
* **Graceful degeneracy** — if a tooth class is absent in a batch item,
  its node is zero-initialised and isolated (no edges). The broadcast still
  works correctly.
* **Differentiable** — fully differentiable through all operations.

Functions
---------
    compute_tooth_centroids(points, labels, num_classes) → (B, T, 3)
    build_tooth_adjacency(centroids, k, valid_mask)      → (B, T, T)
    ToothGraphGNN                                        nn.Module
    ToothGraphLayer                                      nn.Module

Usage
-----
    from geometry.tooth_graph import ToothGraphGNN
    gnn = ToothGraphGNN(in_dim=128, hidden_dim=128, out_dim=64, k=3)
    # During forward pass:
    graph_feats = gnn(point_feats, pred_labels)   # (B, N, 64)
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple

__all__ = [
    "compute_tooth_centroids",
    "build_tooth_adjacency",
    "ToothGraphLayer",
    "ToothGraphGNN",
]


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Tooth centroid extraction
# ─────────────────────────────────────────────────────────────────────────────

def compute_tooth_centroids(
    points: torch.Tensor,
    labels: torch.Tensor,
    num_classes: int = 33,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Compute the 3D centroid and occupancy mask for each tooth class.

    Parameters
    ----------
    points : (B, N, 3) float  — point cloud coordinates
    labels : (B, N)    long   — per-point class labels  0=gingiva
    num_classes : int          — total class count (T)

    Returns
    -------
    centroids   : (B, T, 3) float — mean XYZ per tooth class.
                  Zero for classes absent in a batch item.
    valid_mask  : (B, T)    bool  — True where the class has ≥1 point.
    """
    B, N, _ = points.shape
    T = num_classes
    device = points.device

    centroids  = torch.zeros(B, T, 3, device=device, dtype=points.dtype)
    counts     = torch.zeros(B, T,    device=device, dtype=points.dtype)
    valid_mask = torch.zeros(B, T,    device=device, dtype=torch.bool)

    # One-hot encode labels  →  (B, N, T)
    labels_clamped = labels.clamp(0, T - 1)          # safety clamp
    one_hot = F.one_hot(labels_clamped, T).float()   # (B, N, T)

    # Sum coordinates per class:  (B, T, 3)
    centroid_sum = torch.bmm(
        one_hot.permute(0, 2, 1),  # (B, T, N)
        points,                    # (B, N, 3)
    )

    # Count points per class:  (B, T)
    counts = one_hot.sum(dim=1)  # (B, T)

    valid_mask = counts > 0
    safe_counts = counts.clamp(min=1).unsqueeze(-1)  # (B, T, 1)
    centroids = centroid_sum / safe_counts
    centroids = centroids * valid_mask.unsqueeze(-1).float()  # zero absent

    return centroids, valid_mask


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — Tooth adjacency graph (k-NN on centroids)
# ─────────────────────────────────────────────────────────────────────────────

def build_tooth_adjacency(
    centroids: torch.Tensor,
    valid_mask: torch.Tensor,
    k: int = 3,
) -> torch.Tensor:
    """
    Build a soft k-NN adjacency matrix over tooth centroids.

    Parameters
    ----------
    centroids   : (B, T, 3) float  — tooth centroids (zero for absent teeth)
    valid_mask  : (B, T)    bool   — which teeth are present
    k           : int              — number of nearest neighbours per tooth

    Returns
    -------
    adj : (B, T, T) float  — row-normalised adjacency (including self-loop).
          Absent teeth are fully isolated (zero row, zero column).
    """
    B, T, _ = centroids.shape
    device = centroids.device

    # Pairwise squared distances  (B, T, T)
    diff = centroids.unsqueeze(2) - centroids.unsqueeze(1)  # (B,T,T,3)
    sq_dist = (diff ** 2).sum(dim=-1)                        # (B,T,T)

    # Mask absent nodes: set their distances to infinity so they're never
    # chosen as neighbours and never pick neighbours.
    INF = 1e9
    absent = ~valid_mask  # (B, T)
    sq_dist = sq_dist.masked_fill(absent.unsqueeze(2), INF)  # absent src
    sq_dist = sq_dist.masked_fill(absent.unsqueeze(1), INF)  # absent dst

    # Also fill diagonal with INF so we don't pick self as a k-NN neighbour
    eye = torch.eye(T, device=device, dtype=torch.bool).unsqueeze(0)
    sq_dist = sq_dist.masked_fill(eye, INF)

    # Take k nearest  →  binary adjacency
    _, knn_idx = sq_dist.topk(k, dim=-1, largest=False)   # (B, T, k)
    adj = torch.zeros(B, T, T, device=device, dtype=centroids.dtype)
    adj.scatter_(2, knn_idx, 1.0)

    # Add self-loop so each node retains its own features
    adj = adj + torch.eye(T, device=device).unsqueeze(0)

    # Zero out rows/columns for absent nodes
    valid_f = valid_mask.float()
    adj = adj * valid_f.unsqueeze(2) * valid_f.unsqueeze(1)

    # Row-normalise (degree normalisation)
    row_sum = adj.sum(dim=-1, keepdim=True).clamp(min=1e-6)
    adj = adj / row_sum

    return adj  # (B, T, T)


# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — Graph convolution layer
# ─────────────────────────────────────────────────────────────────────────────

class ToothGraphLayer(nn.Module):
    """
    One graph convolution layer using dense adjacency:

        H' = ReLU( A · H · W + b )

    where A is (B, T, T), H is (B, T, in_dim).

    This is equivalent to one-hop mean aggregation (GCN-style).
    """

    def __init__(self, in_dim: int, out_dim: int, bias: bool = True):
        super().__init__()
        self.linear = nn.Linear(in_dim, out_dim, bias=bias)
        self.bn = nn.BatchNorm1d(out_dim)

    def forward(
        self,
        h: torch.Tensor,      # (B, T, in_dim)
        adj: torch.Tensor,    # (B, T, T)  row-normalised
    ) -> torch.Tensor:
        """Returns (B, T, out_dim)."""
        # Message passing:  aggregate neighbour features
        agg = torch.bmm(adj, h)                        # (B, T, in_dim)
        # Linear projection
        out = self.linear(agg)                          # (B, T, out_dim)
        # BatchNorm over the feature dim (treat B*T as batch)
        B, T, D = out.shape
        out = self.bn(out.reshape(B * T, D)).reshape(B, T, D)
        out = F.relu(out)
        return out


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 + 4 — Tooth node feature builder + full GNN
# ─────────────────────────────────────────────────────────────────────────────

class ToothGraphGNN(nn.Module):
    """
    Full tooth-adjacency graph module.

    Takes per-point features from the PointNet++ decoder, pools them into
    tooth-level node features, runs 3 graph convolution layers, then
    broadcasts the updated tooth features back to the original point level.

    Parameters
    ----------
    in_dim     : int  — per-point feature dimension from FP layers  (128)
    hidden_dim : int  — intermediate GNN dimension                   (128)
    out_dim    : int  — output graph feature dim broadcast to points  (64)
    k          : int  — number of nearest teeth to connect            (3)
    num_classes: int  — total tooth class count including gingiva     (33)
    """

    def __init__(
        self,
        in_dim: int = 128,
        hidden_dim: int = 128,
        out_dim: int = 64,
        k: int = 3,
        num_classes: int = 33,
    ):
        super().__init__()
        self.k = k
        self.num_classes = num_classes
        self.out_dim = out_dim

        # Step 3 — node feature projection (pool → project)
        self.node_proj = nn.Sequential(
            nn.Linear(in_dim + 3, hidden_dim),   # +3 for centroid XYZ
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
        )

        # Step 4 — 3-layer GNN
        self.gnn1 = ToothGraphLayer(hidden_dim, hidden_dim)
        self.gnn2 = ToothGraphLayer(hidden_dim, hidden_dim)
        self.gnn3 = ToothGraphLayer(hidden_dim, out_dim)

    def forward(
        self,
        point_feats: torch.Tensor,   # (B, N, in_dim)
        point_xyz: torch.Tensor,     # (B, N, 3)
        labels: torch.Tensor,        # (B, N)  long — predicted or gt labels
    ) -> torch.Tensor:
        """
        Returns
        -------
        graph_feats : (B, N, out_dim)
            Graph features broadcast to every point from its assigned tooth node.
        centroids   : (B, T, 3)
            Tooth centroids (for viewer adjacency visualisation).
        adj         : (B, T, T)
            Adjacency matrix (for viewer edge rendering).
        """
        B, N, feat_dim = point_feats.shape
        T = self.num_classes
        device = point_feats.device

        # ── Step 1: centroid extraction ───────────────────────────────────
        centroids, valid_mask = compute_tooth_centroids(
            point_xyz, labels, T
        )  # (B,T,3), (B,T)

        # ── Step 2: adjacency graph ───────────────────────────────────────
        adj = build_tooth_adjacency(centroids, valid_mask, self.k)  # (B,T,T)

        # ── Step 3: aggregate per-point features → tooth node features ───
        #   Mean-pool point features per tooth class
        labels_clamped = labels.clamp(0, T - 1)
        one_hot = F.one_hot(labels_clamped, T).float()  # (B, N, T)

        # (B, T, F) = sum of point feats per class
        feat_sum = torch.bmm(
            one_hot.permute(0, 2, 1),  # (B, T, N)
            point_feats,               # (B, N, F)
        )
        counts = one_hot.sum(dim=1).clamp(min=1)        # (B, T)
        node_feats = feat_sum / counts.unsqueeze(-1)    # (B, T, F)

        # Concat centroid XYZ as positional feature
        node_input = torch.cat([node_feats, centroids], dim=-1)  # (B,T,F+3)

        # Project to hidden_dim
        h = self.node_proj(node_input)                  # (B, T, hidden)

        # ── Step 4: graph convolutions ────────────────────────────────────
        h = self.gnn1(h, adj)   # (B, T, hidden)
        h = self.gnn2(h, adj)   # (B, T, hidden)
        h = self.gnn3(h, adj)   # (B, T, out_dim)

        # ── Step 5: broadcast back to points ─────────────────────────────
        #   Each point gets the feature of its tooth node
        #   Expand: one_hot (B,N,T) · h (B,T,out_dim) → (B,N,out_dim)
        graph_feats = torch.bmm(one_hot, h)             # (B, N, out_dim)

        return graph_feats, centroids, adj
