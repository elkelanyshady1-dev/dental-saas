"""
gingiva_classifier.py — Full gingival margin detection pipeline.

This is the top-level entry point that orchestrates the four-step pipeline:

    1. Compute per-vertex curvature          (curvature_analysis.py)
    2. Compute per-vertex valley score       (valley_detection.py)
    3. Detect margin candidate vertices      (gingival_margin.py)
    4. Flood-fill to classify gingiva/tooth  (this module)

Classification Logic (Flood Fill)
----------------------------------
After the margin ring is detected:

    • Flood fill OUTWARD from detected margin vertices along the mesh surface
      → vertices reachable while staying "outside" (lower elevation relative
        to the margin on the normal axis) are labelled GINGIVA (0).

    • Flood fill INWARD from detected margin vertices
      → vertices reachable while staying "above" the margin (toward cusps)
        are labelled TOOTH (1).

In practice, for unlabelled meshes (no prior segmentation), we use the
simpler geometric heuristic:

    • Fit the centroid + mean normal of the margin ring.
    • Project all vertices onto the normal axis.
    • Vertices below the margin projection → GINGIVA (0)
    • Vertices above the margin projection → TOOTH (1)

This produces an approximate but robust initial segmentation without
needing any trained classifier.

Face Labels
-----------
Convert vertex labels to face labels via majority vote:  if ≥2 of the 3
face vertices are gingiva, the face is gingiva.

Public Functions
----------------
    classify_gingiva_faces(vertices, faces, margin_vertices) → face_labels
    detect_gingival_margin(mesh, config)    → (face_labels, margin_verts, meta)

The second function is the main user-facing entry point.

Output Convention
-----------------
    0 = gingiva
    1 = tooth

Dependencies
------------
    numpy   ≥ 1.24
    trimesh ≥ 3.21  (optional — only for mesh loading in detect_gingival_margin)
    scipy   ≥ 1.10  (cKDTree for flood fill)
"""

from __future__ import annotations

import logging
import time
from typing import Optional, Tuple, Union

import numpy as np
from scipy.spatial import cKDTree

from .curvature_analysis import compute_vertex_curvature
from .valley_detection import compute_valley_score
from .gingival_margin import (
    detect_gingival_margin_vertices,
    MarginDetectionConfig,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Step 4a — Vertex classification via normal-axis projection
# ─────────────────────────────────────────────────────────────────────────────

def _classify_vertices_by_normal_projection(
    vertices: np.ndarray,
    margin_vertices_idx: list[int],
) -> np.ndarray:
    """
    Classify vertices as gingiva (0) or tooth (1) by projecting onto the
    margin normal axis.

    Algorithm
    ---------
    1. Compute the centroid C of margin vertices.
    2. Compute the *up-normal* N of the margin ring using PCA:
       the 3rd principal component of the margin vertices points outward
       (away from the tooth axis).  The tooth axis is the principal
       direction of LEAST variance in the margin ring — this corresponds
       to the occlusal ↔ gingival direction.
    3. For each vertex v, compute projection p = (v − C) · N.
    4. Vertices with p > 0 are "above" the margin → TOOTH (1).
       Vertices with p ≤ 0 are "below" → GINGIVA (0).

    Parameters
    ----------
    vertices            : (V, 3)
    margin_vertices_idx : list[int]   — indices of margin ring vertices

    Returns
    -------
    vertex_labels : (V,) int  — 0=gingiva, 1=tooth
    """
    V = len(vertices)
    vertex_labels = np.zeros(V, dtype=np.int64)

    if len(margin_vertices_idx) < 3:
        # Not enough margin data — fallback: everything is gingiva
        logger.warning(
            "Too few margin vertices (%d) for projection; labelling all as gingiva.",
            len(margin_vertices_idx),
        )
        return vertex_labels

    margin_pts = vertices[np.array(margin_vertices_idx)]

    # Step 1 — Margin centroid
    centroid = margin_pts.mean(axis=0)   # (3,)

    # Step 2 — PCA to find occlusal axis (direction of min variance in margin)
    centred = margin_pts - centroid
    cov = np.cov(centred.T)             # (3, 3)
    eigvals, eigvecs = np.linalg.eigh(cov)
    # eigvecs columns are sorted by ascending eigenvalue
    # The smallest eigenvalue eigenvector = axis of minimum variation = normal axis
    # For a ring of margin vertices lying roughly in a plane, this is the
    # plane normal — pointing roughly in the occlusal direction.
    up_normal = eigvecs[:, 0]           # smallest eigenvalue → normal to margin plane

    # Step 3 — Project all vertices
    projections = (vertices - centroid) @ up_normal   # (V,)

    # Step 4 — Label: positive projection → tooth (1)
    vertex_labels[projections > 0] = 1

    logger.debug(
        "Normal-projection classification: gingiva=%d  tooth=%d",
        int((vertex_labels == 0).sum()),
        int((vertex_labels == 1).sum()),
    )
    return vertex_labels


# ─────────────────────────────────────────────────────────────────────────────
# Step 4b — Flood fill classification (KNN-based)
# ─────────────────────────────────────────────────────────────────────────────

def _flood_fill_classify(
    vertices: np.ndarray,
    margin_idx: list[int],
    flood_k: int = 12,
    flood_radius: float = 1.5,
) -> np.ndarray:
    """
    Classify vertices as gingiva (0) or tooth (1) using BFS flood fill
    from the margin ring, using normal-projection to determine initial
    direction.

    This is more topologically faithful than pure projection for meshes
    with complex geometry (e.g., crowded teeth).

    Parameters
    ----------
    vertices     : (V, 3)
    margin_idx   : list[int]
    flood_k      : int    — KNN for BFS adjacency graph
    flood_radius : float  — maximum edge length for adjacency

    Returns
    -------
    vertex_labels : (V,) int  — 0=gingiva, 1=tooth;  -1=margin (unlabelled seed)
    """
    V = len(vertices)

    # Start from normal-projection labels as seed
    seed_labels = _classify_vertices_by_normal_projection(vertices, margin_idx)

    # Override margin vertices with a special "unlabelled" marker so they
    # don't seed the fill themselves
    MARGIN = -1
    seed_labels[np.array(margin_idx, dtype=int)] = MARGIN

    # Build KNN adjacency
    tree = cKDTree(vertices)
    k_q = min(flood_k + 1, V)
    _, nn_indices = tree.query(vertices, k=k_q)   # (V, k_q)

    from collections import deque

    labels = seed_labels.copy()
    queue: deque[int] = deque()

    # Initialise BFS queue with labelled neighbours of margin
    for vi in margin_idx:
        for vj in nn_indices[vi][1:]:
            if labels[vj] != MARGIN:
                queue.append(vi)
                break

    # BFS propagation
    visited = np.zeros(V, dtype=bool)
    for vi in margin_idx:
        visited[vi] = True

    while queue:
        vi = queue.popleft()
        if visited[vi]:
            continue
        visited[vi] = True

        # Propagate to neighbours
        for vj in nn_indices[vi][1:]:
            if visited[vj]:
                continue
            dist_ij = np.linalg.norm(vertices[vi] - vertices[vj])
            if dist_ij > flood_radius:
                continue
            if labels[vj] == MARGIN:
                # Unlabelled — inherit from neighbour
                labels[vj] = labels[vi]
                queue.append(vj)

    # Any remaining MARGIN vertices: use projection label
    remaining_mask = labels == MARGIN
    if remaining_mask.any():
        labels[remaining_mask] = seed_labels[remaining_mask]
        labels[labels == MARGIN] = 0   # final fallback

    return labels.astype(np.int64)


# ─────────────────────────────────────────────────────────────────────────────
# Vertex → Face label conversion
# ─────────────────────────────────────────────────────────────────────────────

def classify_gingiva_faces(
    vertices: np.ndarray,
    faces: np.ndarray,
    margin_vertices: list[int],
    use_flood_fill: bool = True,
    flood_k: int = 12,
    flood_radius: float = 1.5,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Convert gingival margin vertices to face-level gingiva/tooth labels.

    Steps:
        1. Classify all vertices as gingiva (0) or tooth (1).
        2. Convert to face labels via majority vote of the 3 face vertex labels.

    Parameters
    ----------
    vertices        : (V, 3)
    faces           : (F, 3) int
    margin_vertices : list[int]  — output of detect_gingival_margin_vertices
    use_flood_fill  : bool
        If True, BFS flood fill from margin (more topologically faithful).
        If False, pure normal-projection classification (faster).
    flood_k         : int   — BFS KNN neighbourhood
    flood_radius    : float — maximum BFS edge length

    Returns
    -------
    face_labels   : (F,) int  — 0=gingiva  1=tooth
    vertex_labels : (V,) int  — 0=gingiva  1=tooth
    """
    vertices = np.asarray(vertices, dtype=np.float64)
    faces = np.asarray(faces, dtype=np.int64)

    if use_flood_fill and len(margin_vertices) > 0:
        vertex_labels = _flood_fill_classify(
            vertices, margin_vertices, flood_k=flood_k, flood_radius=flood_radius
        )
    else:
        vertex_labels = _classify_vertices_by_normal_projection(
            vertices, margin_vertices
        )

    # Majority vote: face is gingiva if ≥2 of 3 vertices are gingiva
    face_vertex_labels = vertex_labels[faces]         # (F, 3)
    gingiva_votes = (face_vertex_labels == 0).sum(axis=1)  # (F,)
    face_labels = np.where(gingiva_votes >= 2, 0, 1).astype(np.int64)

    logger.info(
        "Face labels: gingiva=%d  tooth=%d  total=%d",
        int((face_labels == 0).sum()),
        int((face_labels == 1).sum()),
        len(face_labels),
    )
    return face_labels, vertex_labels


# ─────────────────────────────────────────────────────────────────────────────
# Top-level Pipeline Entry Point
# ─────────────────────────────────────────────────────────────────────────────

def detect_gingival_margin(
    mesh,
    config: Optional[MarginDetectionConfig] = None,
    curvature_k: int = 20,
    valley_concavity_thresh: float = 0.0,
    use_flood_fill: bool = True,
    return_vertex_labels: bool = False,
) -> Tuple[np.ndarray, list[int], dict]:
    """
    Full gingival margin detection pipeline on a trimesh mesh.

    This is the production entry point.  It wraps the entire four-module
    pipeline into a single call.

    Parameters
    ----------
    mesh                   : trimesh.Trimesh  (or any object with .vertices / .faces)
    config                 : MarginDetectionConfig, optional
    curvature_k            : int    — KNN for curvature estimation (default 20)
    valley_concavity_thresh: float  — dihedral concavity threshold (default 0.0)
    use_flood_fill         : bool   — use BFS flood fill for classification
    return_vertex_labels   : bool   — if True, include vertex_labels in meta

    Returns
    -------
    face_labels     : np.ndarray, shape (F,)
        Per-face label:  0 = gingiva,  1 = tooth.
    margin_vertices : list[int]
        Vertex indices forming the detected gingival margin curve.
    meta            : dict
        Full pipeline diagnostics:
            curvature_threshold, valley_threshold,
            n_components, component_sizes,
            margin_vertex_count,
            timing_s (per-step wall times),
            vertex_labels (if return_vertex_labels=True)

    Raises
    ------
    ValueError
        If mesh has no vertices or faces.
    """
    t0 = time.perf_counter()

    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    faces = np.asarray(mesh.faces, dtype=np.int64)

    if len(vertices) < 10:
        raise ValueError(f"Mesh too small: {len(vertices)} vertices")
    if len(faces) == 0:
        raise ValueError("Mesh has no faces")

    logger.info(
        "detect_gingival_margin: V=%d  F=%d", len(vertices), len(faces)
    )

    timing: dict[str, float] = {}

    # ── Module 1: Curvature ─────────────────────────────────────────────────
    t1 = time.perf_counter()
    curvature = compute_vertex_curvature(vertices, faces, k=curvature_k)
    timing["curvature_s"] = round(time.perf_counter() - t1, 3)
    logger.debug("Curvature done in %.2fs", timing["curvature_s"])

    # ── Module 2: Valley score ───────────────────────────────────────────────
    t2 = time.perf_counter()
    valley_score = compute_valley_score(
        vertices, faces, concavity_thresh=valley_concavity_thresh
    )
    timing["valley_s"] = round(time.perf_counter() - t2, 3)
    logger.debug("Valley detection done in %.2fs", timing["valley_s"])

    # ── Module 3: Margin candidate detection ────────────────────────────────
    t3 = time.perf_counter()
    margin_vertices, margin_stats = detect_gingival_margin_vertices(
        vertices, curvature, valley_score, config=config
    )
    timing["margin_s"] = round(time.perf_counter() - t3, 3)
    logger.debug(
        "Margin detection done in %.2fs — %d margin vertices",
        timing["margin_s"], len(margin_vertices),
    )

    # ── Module 4: Classification via flood fill ──────────────────────────────
    t4 = time.perf_counter()
    face_labels, vertex_labels = classify_gingiva_faces(
        vertices, faces, margin_vertices, use_flood_fill=use_flood_fill
    )
    timing["classify_s"] = round(time.perf_counter() - t4, 3)
    logger.debug("Classification done in %.2fs", timing["classify_s"])

    timing["total_s"] = round(time.perf_counter() - t0, 3)
    logger.info(
        "detect_gingival_margin complete in %.2fs — "
        "gingiva_faces=%d  tooth_faces=%d",
        timing["total_s"],
        int((face_labels == 0).sum()),
        int((face_labels == 1).sum()),
    )

    meta = {
        **margin_stats,
        "n_vertices": len(vertices),
        "n_faces": len(faces),
        "n_gingiva_faces": int((face_labels == 0).sum()),
        "n_tooth_faces": int((face_labels == 1).sum()),
        "timing_s": timing,
    }
    if return_vertex_labels:
        meta["vertex_labels"] = vertex_labels.tolist()

    return face_labels, margin_vertices, meta
