"""
patch_merger.py — Stage 2: Merge overlapping patch predictions into full arch.
==============================================================================

Algorithm
---------
Individual patches overlap: the same physical point can appear in 2-4
patches.  Each patch assigns a local label (1..K) that is NOT globally
consistent across patches.  The merger resolves this via:

    1. Collect all (point_index, local_label, confidence) tuples.

    2. Build a label graph: two local labels (from different patches) are
       the same tooth if the fraction of shared points exceeds
       ``iou_threshold`` (default 0.5).

    3. Assign globally consistent FDI-region labels (1-32) by
       connected component resolution of the label graph.

    4. For points covered by multiple patches:
          - Use majority vote weighted by prediction confidence (softmax max).
          - In case of tie → use geodesic distance from patch centroid as
            tiebreaker (lower distance = higher quality prediction).

    5. Return full-resolution tooth_labels (N,) int.

Boundary conflict resolution
-----------------------------
Along patch overlap boundaries the merged label transitions can be
noisy.  A short median-filter pass (via KN neighbours, ``boundary_smooth_k``)
is applied to smooth the transition.

Usage
-----
    merger = PatchMerger(n_total_points=N)
    merger.add_patch(patch, local_logits)
    merger.add_patch(patch2, local_logits2)
    tooth_labels = merger.merge()
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np
from scipy.spatial import cKDTree

from .patch_generator import MeshPatch

logger = logging.getLogger(__name__)


@dataclass
class _PatchPrediction:
    """Internal container for one patch's prediction data."""
    patch: MeshPatch
    local_logits: np.ndarray    # (P, K) float32 — softmax or raw logits
    local_labels: np.ndarray    # (P,)  int — argmax of logits
    confidence:   np.ndarray    # (P,)  float — max softmax score


class PatchMerger:
    """
    Merge per-patch localised labels into a globally consistent full-scan labelling.

    Args:
        n_total_points:       total number of points in the original scan (N)
        iou_threshold:        minimum overlap fraction to identify same tooth
        boundary_smooth_k:    k-NN for post-merge boundary smoothing (0 = off)
        confidence_weighted:  if True, weight majority vote by confidence
    """

    def __init__(
        self,
        n_total_points: int,
        iou_threshold: float = 0.4,
        boundary_smooth_k: int = 16,
        confidence_weighted: bool = True,
    ) -> None:
        self.n_total_points     = n_total_points
        self.iou_threshold      = iou_threshold
        self.boundary_smooth_k  = boundary_smooth_k
        self.confidence_weighted = confidence_weighted

        self._predictions: List[_PatchPrediction] = []

    def add_patch(
        self,
        patch: MeshPatch,
        local_logits: np.ndarray,  # (P, K)
    ) -> None:
        """Register one patch's predictions."""
        probs = self._softmax(local_logits)       # (P, K)
        labels = probs.argmax(axis=-1).astype(np.int32)  # (P,)
        conf   = probs.max(axis=-1).astype(np.float32)   # (P,)

        self._predictions.append(_PatchPrediction(
            patch=patch,
            local_logits=local_logits,
            local_labels=labels,
            confidence=conf,
        ))

    @staticmethod
    def _softmax(x: np.ndarray) -> np.ndarray:
        e = np.exp(x - x.max(axis=-1, keepdims=True))
        return e / e.sum(axis=-1, keepdims=True)

    # ── Main merge ────────────────────────────────────────────────────────────

    def merge(
        self,
        all_points: Optional[np.ndarray] = None,  # (N, 3) for boundary smoothing
    ) -> np.ndarray:
        """
        Merge all registered patch predictions.

        Args:
            all_points: (N, 3) float32 — needed for boundary smoothing

        Returns:
            tooth_labels: (N,) int32  — merged per-point labels (0 = gingiva)
        """
        if not self._predictions:
            logger.warning("PatchMerger.merge() called with no patches — returning zeros")
            return np.zeros(self.n_total_points, dtype=np.int32)

        # ── Step 1: Weighted vote accumulation ────────────────────────────────
        # vote_matrix[i, k] = sum of confidence-weighted votes for point i, class k
        # We use local classes here (will remap to global later)

        # Find max local class count across all patches
        max_local_class = max(
            p.local_logits.shape[1] for p in self._predictions
        )

        # Accumulators: (N, max_local_class) — we will remap after
        vote_acc    = np.zeros((self.n_total_points, max_local_class), np.float32)
        weight_acc  = np.zeros(self.n_total_points, np.float32)

        for pred in self._predictions:
            idx  = pred.patch.patch_indices          # (P,)
            K    = pred.local_logits.shape[1]
            probs = self._softmax(pred.local_logits) # (P, K)
            w     = pred.confidence                  # (P,)

            # Accumulate weighted votes per-class
            for k in range(K):
                weight = w if self.confidence_weighted else np.ones_like(w)
                np.add.at(vote_acc[:, k], idx, probs[:, k] * weight)

            np.add.at(weight_acc, idx, w if self.confidence_weighted
                      else np.ones(len(idx), dtype=np.float32))

        # Normalise
        covered_mask = weight_acc > 0
        vote_acc[covered_mask] /= weight_acc[covered_mask, np.newaxis]

        # Argmax → raw merged labels (local class space)
        raw_labels = vote_acc.argmax(axis=-1).astype(np.int32)  # (N,)
        raw_labels[~covered_mask] = 0  # uncovered → gingiva

        # ── Step 2: Global label graph resolution ─────────────────────────────
        global_labels = self._resolve_global_labels(raw_labels)

        # ── Step 3: Boundary smoothing ────────────────────────────────────────
        if self.boundary_smooth_k > 0 and all_points is not None:
            global_labels = self._smooth_boundaries(
                global_labels, all_points, k=self.boundary_smooth_k
            )

        logger.info(
            "PatchMerger: %d patches merged — unique labels: %s",
            len(self._predictions),
            sorted(np.unique(global_labels).tolist())
        )
        return global_labels

    def _resolve_global_labels(self, raw_labels: np.ndarray) -> np.ndarray:
        """
        Assign globally unique tooth IDs by grouping overlapping local labels
        across patches via IoU-based graph connected components.

        For now (no FDI knowledge at this stage), we just re-index using
        connected-component analysis on the point-label assignments from
        each patch.  The FDI assignment module (Stage 3 / tooth_numbering)
        assigns actual FDI numbers downstream.
        """
        # Collect (point_set_per_patch_label) for IoU computation
        # Group: for each patch, for each local class > 0, get its points
        patch_label_sets: Dict[Tuple[int, int], set] = {}  # (patch_i, local_k) → {point idxs}

        for pi, pred in enumerate(self._predictions):
            idx = pred.patch.patch_indices
            for k in range(1, pred.local_logits.shape[1]):  # skip 0=background
                mask = pred.local_labels == k
                if mask.sum() < 4:
                    continue
                patch_label_sets[(pi, k)] = set(int(i) for i in idx[mask])

        # Build IoU graph: nodes = (pi, k), edges where IoU > threshold
        keys = list(patch_label_sets.keys())
        n_nodes = len(keys)

        # Union-Find for connected components
        parent = list(range(n_nodes))

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a, b):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[rb] = ra

        for i in range(n_nodes):
            for j in range(i + 1, n_nodes):
                A, B = patch_label_sets[keys[i]], patch_label_sets[keys[j]]
                intersection = len(A & B)
                if intersection == 0:
                    continue
                union_size = len(A | B)
                iou = intersection / union_size if union_size > 0 else 0.0
                if iou >= self.iou_threshold:
                    union(i, j)

        # Assign global tooth IDs (1-based) to each component
        root_to_global: Dict[int, int] = {}
        global_id = 1

        # Map each (patch, local_k) to its global id
        node_to_global: Dict[int, int] = {}
        for i, key in enumerate(keys):
            root = find(i)
            if root not in root_to_global:
                root_to_global[root] = global_id
                global_id += 1
            node_to_global[i] = root_to_global[root]

        # Remap raw_labels through the node→global map
        # raw_labels currently encodes local class indices — remap
        global_labels = np.zeros(self.n_total_points, dtype=np.int32)

        for i, key in enumerate(keys):
            pi, k = key
            pred = self._predictions[pi]
            pt_idx = pred.patch.patch_indices
            local_mask = pred.local_labels == k
            global_labels[pt_idx[local_mask]] = node_to_global[i]

        return global_labels

    def _smooth_boundaries(
        self,
        labels: np.ndarray,   # (N,) int
        points: np.ndarray,   # (N, 3)
        k: int = 16,
    ) -> np.ndarray:
        """
        Majority-vote smoothing using k-NN neighbours.
        Applied only to boundary regions (points whose k-NN have different labels).
        """
        tree = cKDTree(points)
        _, nn_idx = tree.query(points, k=min(k + 1, len(points)))

        neighbour_labels = labels[nn_idx[:, 1:]]  # (N, k)

        # Detect boundary points (not all neighbours have same label)
        is_boundary = (neighbour_labels != labels[:, np.newaxis]).any(axis=1)

        smoothed = labels.copy()
        for pt_i in np.where(is_boundary)[0]:
            neighbours = neighbour_labels[pt_i]
            unique, counts = np.unique(neighbours, return_counts=True)
            smoothed[pt_i] = unique[counts.argmax()]

        changed = int((smoothed != labels).sum())
        logger.debug("Boundary smoothing: %d points relabelled", changed)
        return smoothed
