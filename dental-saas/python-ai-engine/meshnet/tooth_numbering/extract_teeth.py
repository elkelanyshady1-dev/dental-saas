"""
Module 1: extract_teeth.py
==========================
Extract individual tooth meshes from a segmented dental scan.

Each face in the mesh carries an integer label (from model segmentation):
    0            → gingiva (background) — skipped
    1 – 32       → generic tooth index (before FDI mapping)

The extractor groups faces by label using connected-component analysis so that
spatially-disconnected fragments with the same label are kept as separate
instances (important for crowded dentitions where adjacent teeth may accidentally
share a numeric label from the segmenter).

Output
------
A list of :class:`ToothMesh` objects, each containing the locally-indexed
vertices and faces that belong to one tooth, plus its centroid.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ─── Data model ──────────────────────────────────────────────────────────────


@dataclass
class ToothMesh:
    """
    A single extracted tooth mesh.

    Attributes:
        label:      Original segmentation label (1-32).
        vertices:   (V, 3) float32 array of 3-D vertex coordinates.
        faces:      (F, 3) int32 array of face indices into `vertices`.
        centroid:   (3,) float32 — mean vertex position.
        face_area:  float — total surface area of the tooth (mm²).
        normal:     (3,) float32 — approximate occlusal normal (area-weighted).
    """

    label: int
    vertices: np.ndarray          # (V, 3)
    faces: np.ndarray             # (F, 3)
    centroid: np.ndarray          # (3,)
    face_area: float = 0.0
    normal: np.ndarray = field(default_factory=lambda: np.zeros(3))
    # Assigned FDI number (set later by fdi_assignment module)
    fdi: Optional[int] = None

    def __repr__(self) -> str:
        return (
            f"ToothMesh(label={self.label}, fdi={self.fdi}, "
            f"V={len(self.vertices)}, F={len(self.faces)}, "
            f"centroid=[{self.centroid[0]:.1f}, {self.centroid[1]:.1f}, {self.centroid[2]:.1f}])"
        )


# ─── Core extraction ─────────────────────────────────────────────────────────


def _face_neighbours(faces: np.ndarray, n_vertices: int) -> Dict[int, Set[int]]:
    """
    Build a face-adjacency graph via shared edges.

    Two faces are adjacent if they share at least one edge (two vertex indices).
    Returns a dict mapping face_index → set of neighbouring face_indices.
    """
    # Map each (v_a, v_b) edge → list of face indices that contain it
    edge_to_faces: Dict[Tuple[int, int], List[int]] = {}
    for fi, (a, b, c) in enumerate(faces):
        for u, v in ((a, b), (b, c), (a, c)):
            key = (min(u, v), max(u, v))
            edge_to_faces.setdefault(key, []).append(fi)

    adjacency: Dict[int, Set[int]] = {i: set() for i in range(len(faces))}
    for edge, face_list in edge_to_faces.items():
        for i in range(len(face_list)):
            for j in range(i + 1, len(face_list)):
                fi, fj = face_list[i], face_list[j]
                adjacency[fi].add(fj)
                adjacency[fj].add(fi)

    return adjacency


def _connected_components_faces(
    face_indices: List[int],
    adjacency: Dict[int, Set[int]],
) -> List[List[int]]:
    """
    Union-Find connected components on faces sharing the same label.

    Args:
        face_indices: indices of faces with the same label
        adjacency:    global face-adjacency dict

    Returns:
        list of lists — each inner list is one connected component
    """
    local_set = set(face_indices)
    visited: Set[int] = set()
    components: List[List[int]] = []

    for start in face_indices:
        if start in visited:
            continue
        component: List[int] = []
        stack = [start]
        while stack:
            fi = stack.pop()
            if fi in visited:
                continue
            visited.add(fi)
            component.append(fi)
            for nb in adjacency[fi]:
                if nb in local_set and nb not in visited:
                    stack.append(nb)
        components.append(component)

    return components


def _build_tooth_mesh(
    global_vertices: np.ndarray,
    global_faces: np.ndarray,
    component_face_indices: List[int],
    label: int,
) -> ToothMesh:
    """
    Build a ToothMesh by extracting only the faces (and referenced vertices)
    belonging to one connected component.

    Global vertex indices are remapped to local ones so that:
        local_faces.max() == len(local_vertices) - 1
    """
    component_faces_global = global_faces[component_face_indices]  # (F_c, 3)

    # Unique vertex indices used by this component
    unique_verts, inverse = np.unique(component_faces_global, return_inverse=True)
    local_vertices = global_vertices[unique_verts].astype(np.float32)
    local_faces = inverse.reshape(-1, 3).astype(np.int32)

    centroid = local_vertices.mean(axis=0).astype(np.float32)

    # Surface area + area-weighted normal
    v0 = local_vertices[local_faces[:, 0]]
    v1 = local_vertices[local_faces[:, 1]]
    v2 = local_vertices[local_faces[:, 2]]
    cross = np.cross(v1 - v0, v2 - v0)               # (F, 3)
    face_areas = 0.5 * np.linalg.norm(cross, axis=1)  # (F,)
    total_area = float(face_areas.sum())

    if total_area > 0:
        weighted_normal = (cross * face_areas[:, np.newaxis]).sum(axis=0)
        weighted_normal /= np.linalg.norm(weighted_normal) + 1e-8
    else:
        weighted_normal = np.array([0.0, 0.0, 1.0], dtype=np.float32)

    return ToothMesh(
        label=label,
        vertices=local_vertices,
        faces=local_faces,
        centroid=centroid,
        face_area=total_area,
        normal=weighted_normal.astype(np.float32),
    )


# ─── Public API ──────────────────────────────────────────────────────────────

MIN_FACES_PER_TOOTH = 10   # Skip microscopic fragments (noise)
GINGIVA_LABEL = 0


def extract_teeth(
    vertices: np.ndarray,
    faces: np.ndarray,
    face_labels: np.ndarray,
    min_faces: int = MIN_FACES_PER_TOOTH,
    use_connected_components: bool = True,
) -> List[ToothMesh]:
    """
    Extract individual tooth meshes from a segmented scan.

    Args:
        vertices:    (V, 3) float vertex positions
        faces:       (F, 3) int face index array
        face_labels: (F,)   int label per face — 0 = gingiva, 1-32 = tooth
        min_faces:   minimum faces a component must have to be included
                     (filters out segmentation noise/specks)
        use_connected_components: if True, split same-label regions that are
                     not geometrically connected (handles touching teeth with
                     the same numeric label)

    Returns:
        List of :class:`ToothMesh` objects, sorted by label then component size.
    """
    vertices = np.asarray(vertices, dtype=np.float32)
    faces = np.asarray(faces, dtype=np.int32)
    face_labels = np.asarray(face_labels, dtype=np.int32)

    if vertices.ndim != 2 or vertices.shape[1] != 3:
        raise ValueError(f"vertices must be (V,3), got {vertices.shape}")
    if faces.ndim != 2 or faces.shape[1] != 3:
        raise ValueError(f"faces must be (F,3), got {faces.shape}")
    if face_labels.ndim != 1 or len(face_labels) != len(faces):
        raise ValueError("face_labels must be (F,) matching faces")

    unique_labels = np.unique(face_labels)
    tooth_labels = unique_labels[unique_labels != GINGIVA_LABEL]

    if len(tooth_labels) == 0:
        logger.warning("No tooth labels found in face_labels — returning empty list")
        return []

    # Build adjacency once (expensive) if CC is needed
    adjacency = _face_neighbours(faces, len(vertices)) if use_connected_components else None

    tooth_meshes: List[ToothMesh] = []

    for lbl in tooth_labels:
        label_face_indices = list(np.where(face_labels == lbl)[0])

        if len(label_face_indices) < min_faces:
            continue  # Skip tiny fragments

        if use_connected_components:
            components = _connected_components_faces(label_face_indices, adjacency)
        else:
            components = [label_face_indices]

        for comp in components:
            if len(comp) < min_faces:
                continue
            tooth = _build_tooth_mesh(vertices, faces, comp, int(lbl))
            tooth_meshes.append(tooth)

    # Sort: primary by label, secondary by descending size (largest fragment first)
    tooth_meshes.sort(key=lambda t: (t.label, -len(t.faces)))

    logger.info(
        "extract_teeth: found %d tooth instances from %d labels",
        len(tooth_meshes),
        len(tooth_labels),
    )
    return tooth_meshes
