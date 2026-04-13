"""
landmark_head.py — Stage 3: Landmark detection head for the segmentation network.
==================================================================================

This module defines:
    1. LandmarkType         — enum of detectable landmark classes
    2. LandmarkHead         — a per-point probability head that attaches to
                             any PointNet++ / CoarseMeshNet feature backbone
    3. LandmarkProbabilityMap — structured output of the head

Landmark classes
----------------
    CUSP_TIP          : highest point of a cusp (positive curvature peak)
    INCISAL_EDGE      : midpoint of anterior incisal edge
    CENTRAL_GROOVE    : valley running mesio-distal on posterior teeth
    MESIAL_CONTACT    : contact point on mesial surface
    DISTAL_CONTACT    : contact point on distal surface
    GINGIVAL_MARGIN   : cementoenamel junction region (boundary)

Architecture
------------
The landmark head is a 3-layer per-point MLP that branches off the shared
point-wise feature representation from the encoder.  It produces a
probability map (one channel per landmark class) via sigmoid (not softmax
— a point can simultaneously be a cusp tip and a contact point, so
independent binary classifiers per class are appropriate).

    shared_features (B, N, C)
        ↓
    Conv1d 128        + BN + ReLU
    Conv1d 64         + BN + ReLU
    Conv1d n_landmark_types   + Sigmoid
        ↓
    landmark_probs (B, N, n_landmark_types)

Training target
---------------
Ground-truth landmark maps are sparse: only a handful of vertices per
tooth receive a 1.  A binary cross-entropy loss with heavy positive-class
weighting (``pos_weight``) is used:

    LandmarkLoss = BCEWithLogitsLoss(pos_weight=class_weights)

Usage — standalone head
-----------------------
    head = LandmarkHead(in_channels=128, n_types=6)
    logits = head(point_features)  # (B, N, 6)
    probs  = torch.sigmoid(logits)

Usage — integrated into CoarseMeshNet
--------------------------------------
    model = CoarseMeshNet(...)
    lm_head = LandmarkHead(in_channels=128)      # 128 = FP1 out_ch
    # During forward:
    lm_logits = lm_head(fp1_features)            # attached after FP1
"""

from __future__ import annotations

import enum
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger(__name__)


# ── Landmark type registry ────────────────────────────────────────────────────

class LandmarkType(enum.IntEnum):
    """
    Enumeration of all detectable dental landmark types.

    Values are used as channel indices in the landmark probability map.
    """
    CUSP_TIP       = 0
    INCISAL_EDGE   = 1
    CENTRAL_GROOVE = 2
    MESIAL_CONTACT = 3
    DISTAL_CONTACT = 4
    GINGIVAL_MARGIN = 5

ALL_LANDMARK_TYPES = list(LandmarkType)
N_LANDMARK_TYPES   = len(ALL_LANDMARK_TYPES)

# Clinical description for visualisation / API
LANDMARK_DESCRIPTIONS: Dict[LandmarkType, str] = {
    LandmarkType.CUSP_TIP:       "Cusp tip — highest curvature point on tooth cusp",
    LandmarkType.INCISAL_EDGE:   "Incisal edge — labial/lingual junction of anterior teeth",
    LandmarkType.CENTRAL_GROOVE: "Central groove — primary fissure of posterior tooth",
    LandmarkType.MESIAL_CONTACT: "Mesial contact point — interproximal mesial contact",
    LandmarkType.DISTAL_CONTACT: "Distal contact point — interproximal distal contact",
    LandmarkType.GINGIVAL_MARGIN: "Gingival margin — cementoenamel junction ring",
}

# Visualisation colour per type (RGB 0-255)
LANDMARK_COLORS: Dict[LandmarkType, tuple] = {
    LandmarkType.CUSP_TIP:       (0, 120, 255),    # blue
    LandmarkType.INCISAL_EDGE:   (0, 220, 80),     # green
    LandmarkType.CENTRAL_GROOVE: (255, 200, 0),    # yellow
    LandmarkType.MESIAL_CONTACT: (255, 100, 0),    # orange
    LandmarkType.DISTAL_CONTACT: (220, 0, 200),    # magenta
    LandmarkType.GINGIVAL_MARGIN:(180, 180, 180),  # grey
}


# ── Output dataclass ──────────────────────────────────────────────────────────

@dataclass
class LandmarkProbabilityMap:
    """
    Structured output of the LandmarkHead for a single scan.

    Attributes:
        probs:       (N, n_types) float32 — sigmoid probabilities
        peak_indices: {LandmarkType: [point_indices]} — thresholded peaks
        peak_coords:  {LandmarkType: (K, 3) float32} — peak coordinates
    """
    probs: np.ndarray                                    # (N, n_types)
    peak_indices: Dict[LandmarkType, np.ndarray] = field(default_factory=dict)
    peak_coords:  Dict[LandmarkType, np.ndarray] = field(default_factory=dict)

    def to_api_dict(self, landmark_types: Optional[List[LandmarkType]] = None) -> dict:
        """Serialise to JSON-compatible dict for API response."""
        types = landmark_types or ALL_LANDMARK_TYPES
        out = {}
        for lt in types:
            coords = self.peak_coords.get(lt, np.empty((0, 3), np.float32))
            out[lt.name] = {
                "color": LANDMARK_COLORS[lt],
                "description": LANDMARK_DESCRIPTIONS[lt],
                "points": coords.tolist() if len(coords) > 0 else [],
                "count": int(len(coords)),
            }
        return out


# ── Landmark Head ─────────────────────────────────────────────────────────────

class LandmarkHead(nn.Module):
    """
    Per-point landmark probability head.

    Branches off an existing point-feature tensor (from any backbone).
    Predicts independent binary probabilities per landmark class per point.

    Args:
        in_channels:      feature dimension from backbone (e.g. 128)
        n_types:          number of landmark classes (default: 6)
        hidden_channels:  MLP hidden dimensions (default [128, 64])
        dropout:          dropout rate in hidden layers
    """

    def __init__(
        self,
        in_channels: int = 128,
        n_types: int = N_LANDMARK_TYPES,
        hidden_channels: Optional[List[int]] = None,
        dropout: float = 0.3,
    ) -> None:
        super().__init__()
        self.n_types = n_types

        if hidden_channels is None:
            hidden_channels = [128, 64]

        layers = []
        cur = in_channels
        for h in hidden_channels:
            layers += [
                nn.Conv1d(cur, h, 1),
                nn.BatchNorm1d(h),
                nn.ReLU(inplace=True),
                nn.Dropout(dropout),
            ]
            cur = h
        layers.append(nn.Conv1d(cur, n_types, 1))  # raw logits (no sigmoid here)
        self.mlp = nn.Sequential(*layers)

        logger.debug(
            "LandmarkHead: in=%d → hidden=%s → out=%d (n_types)",
            in_channels, hidden_channels, n_types
        )

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        """
        Args:
            features: (B, N, in_channels) — per-point features from backbone

        Returns:
            logits: (B, N, n_types) — raw logits (apply sigmoid for probabilities)
        """
        x = features.permute(0, 2, 1)   # (B, in_ch, N)
        x = self.mlp(x)                  # (B, n_types, N)
        return x.permute(0, 2, 1)       # (B, N, n_types)


# ── Loss ─────────────────────────────────────────────────────────────────────

class LandmarkLoss(nn.Module):
    """
    Binary cross-entropy loss for landmark detection.

    Handles heavy class imbalance (sparse positive landmarks) with per-class
    positive weighting.  pos_weight > 1 penalises false-negatives more.

    Args:
        pos_weight:  scalar or (n_types,) tensor — positive class weight
                     (default 20.0 — landmarks are ~5% of points)
        reduction:   'mean' or 'sum'
    """

    def __init__(
        self,
        pos_weight: float = 20.0,
        n_types: int = N_LANDMARK_TYPES,
        reduction: str = "mean",
    ) -> None:
        super().__init__()
        pw = torch.ones(n_types) * pos_weight
        self.register_buffer("pos_weight", pw)
        self.reduction = reduction

    def forward(
        self,
        logits: torch.Tensor,    # (B, N, n_types)
        targets: torch.Tensor,   # (B, N, n_types)  float 0/1
    ) -> torch.Tensor:
        return F.binary_cross_entropy_with_logits(
            logits,
            targets.float(),
            pos_weight=self.pos_weight,
            reduction=self.reduction,
        )
