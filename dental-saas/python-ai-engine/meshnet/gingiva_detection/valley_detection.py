"""
valley_detection.py — Concave valley score for dental mesh vertices.

Gingival Margin Geometry
------------------------
The gingival margin is not just a region of high curvature — it also forms
a *concave valley*: looking at the mesh from outside, the margin dips inward
relative to the tooth crown above and the gingival tissue below.

Concavity detection uses the **dihedral angle** (angle between face normals
across a shared edge).  For a convex surface (tooth crown viewed externally),
adjacent face normals point outward and the dihedral angle between them is
< 180°.  At a concave valley (the gingival groove), the normals fold inward
and the dihedral angle exceeds 180° (equivalently, `cos(dihedral) < 0`).

Algorithm
---------
1. For every interior edge (i.e., shared by exactly 2 faces):
      a. Compute face normals of the two adjacent faces.
      b. Compute cos(θ) = dot(n₁, n₂).
      c. If cos(θ) < –concavity_thresh, mark the edge as *concave*.
2. Accumulate concave edge count to both endpoint vertices.
3. Optionally weight by magnitude of concavity: |cos(θ)| if concave.
4. Normalise valley score to [0, 1] per scan.

Output
------
    valley_score : (V,) float32  — 0 = convex, 1 = deep concave valley

Dependencies
------------
    numpy  ≥ 1.24
    scipy  ≥ 1.10  (csr_matrix for efficient edge-to-vertex accumulation)
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
from scipy.sparse import csr_matrix

logger = logging.getLogger(__name__)


def compute_valley_score(
    vertices: np.ndarray,
    faces: np.ndarray,
    concavity_thresh: float = 0.0,
    weighted: bool = True,
) -> np.ndarray:
    """
    Detect concave-valley score for every mesh vertex.

    Parameters
    ----------
    vertices         : np.ndarray, shape (V, 3)
        Mesh vertex positions.
    faces            : np.ndarray, shape (F, 3), int
        Face indices (triangles only).
    concavity_thresh : float
        Cosine of the dihedral angle threshold for concavity.
        cos(θ) < –concavity_thresh  → concave edge.
        Default 0.0: any fold-inward edge is classified as concave.
        Use 0.1–0.3 for stricter (sharper valleys only) detection.
    weighted         : bool
        If True, weight each concave edge contribution by |cos(θ)|
        so sharper valleys score higher.  If False, count them equally.

    Returns
    -------
    valley_score : np.ndarray, shape (V,), dtype float32
        Normalised concave-valley score in [0, 1].
        Higher values indicate deep concave grooves.

    Raises
    ------
    ValueError
        If ``vertices`` or ``faces`` have wrong shape.
    """
    vertices = np.asarray(vertices, dtype=np.float64)
    faces = np.asarray(faces, dtype=np.int64)

    if vertices.ndim != 2 or vertices.shape[1] != 3:
        raise ValueError(f"vertices must be (V, 3), got {vertices.shape}")
    if faces.ndim != 2 or faces.shape[1] != 3:
        raise ValueError(f"faces must be (F, 3), got {faces.shape}")

    V = len(vertices)
    F = len(faces)

    logger.debug("compute_valley_score: V=%d  F=%d", V, F)

    # ── Step 1: Compute face normals ───────────────────────────────────────
    v0 = vertices[faces[:, 0]]   # (F, 3)
    v1 = vertices[faces[:, 1]]
    v2 = vertices[faces[:, 2]]

    e1 = v1 - v0
    e2 = v2 - v0
    normals = np.cross(e1, e2)   # (F, 3)

    # Normalise (avoid division by zero for degenerate faces)
    norms = np.linalg.norm(normals, axis=1, keepdims=True)
    norms = np.where(norms < 1e-10, 1.0, norms)
    normals = normals / norms    # (F, 3) unit normals

    # ── Step 2: Build edge → face adjacency ──────────────────────────────
    # An interior edge is shared by exactly 2 faces.
    # Represent each edge as a sorted (v_lo, v_hi) pair.
    edge_to_faces: dict[tuple[int, int], list[int]] = {}
    for fi in range(F):
        tri = faces[fi]
        for a, b in [(0, 1), (1, 2), (2, 0)]:
            va, vb = int(tri[a]), int(tri[b])
            key = (min(va, vb), max(va, vb))
            if key not in edge_to_faces:
                edge_to_faces[key] = []
            edge_to_faces[key].append(fi)

    # ── Step 3: Detect concave edges and accumulate vertex scores ─────────
    vertex_score = np.zeros(V, dtype=np.float64)

    n_concave = 0
    for (va, vb), face_list in edge_to_faces.items():
        if len(face_list) != 2:
            continue  # boundary edge or non-manifold — skip

        fi, fj = face_list[0], face_list[1]
        cos_theta = float(np.dot(normals[fi], normals[fj]))

        if cos_theta < -concavity_thresh:
            # Concave edge — fold-inward
            contribution = abs(cos_theta) if weighted else 1.0
            vertex_score[va] += contribution
            vertex_score[vb] += contribution
            n_concave += 1

    logger.debug(
        "Valley detection: %d interior edges, %d concave edges (%.1f%%)",
        sum(1 for fl in edge_to_faces.values() if len(fl) == 2),
        n_concave,
        100.0 * n_concave / max(
            sum(1 for fl in edge_to_faces.values() if len(fl) == 2), 1
        ),
    )

    # ── Step 4: Normalise to [0, 1] ───────────────────────────────────────
    max_score = float(vertex_score.max())
    if max_score > 0:
        vertex_score = vertex_score / max_score

    return vertex_score.astype(np.float32)


def valley_percentile_threshold(
    valley_score: np.ndarray,
    percentile: float = 80.0,
) -> float:
    """
    Return a percentile-based threshold for valley score.

    Parameters
    ----------
    valley_score : np.ndarray, shape (V,)
    percentile   : float — default 80 (top 20% are considered 'valley')

    Returns
    -------
    threshold : float
    """
    return float(np.percentile(valley_score, percentile))
