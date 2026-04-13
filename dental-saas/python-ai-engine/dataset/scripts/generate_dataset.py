"""
generate_dataset.py — STL → Boundary-Aware Point Cloud Dataset Generator.

Pipeline
--------
    STL file
       ↓  stream mesh (trimesh)
       ↓  sample dense points + assign per-vertex labels
       ↓  boundary-aware sampling (50% uniform / 30% curvature / 20% boundary)
       ↓  save  points.npy, tooth_labels.npy, meta.json

Usage
-----
    python -m dataset.scripts.generate_dataset \\
        --input_dir  ./raw_stl_cases \\
        --output_dir ./datasets/cases \\
        --n_points   10000 \\
        --k_boundary 16 \\
        --k_curvature 20 \\
        --workers    4

Input directory layout expected
--------------------------------
    raw_stl_cases/
        case001/
            scan.stl          ← mesh with per-vertex colour / face groups
            labels.npy        ← (V,) vertex labels, 0=gingiva 1-32=teeth
                                 OR labels can be encoded as mesh face attributes
        case002/
            ...

Output layout produced
-----------------------
    datasets/cases/
        case001/
            points.npy            (N, 3) float32
            tooth_labels.npy      (N,)   int64
            meta.json             sampling statistics + provenance
        case002/
            ...

Notes
-----
- If ``labels.npy`` is absent, the script tries to read per-face colour
  information from the STL (trimesh face_colors → rounded to label index).
- Graceful-skip on corrupted / empty meshes with a warning.
- All meta.json files include boundary / curvature sample counts so the
  dashboard can report dataset quality per case.

Dependencies
------------
    trimesh  ≥ 3.21
    scipy    ≥ 1.10   (via geometry sub-modules)
    numpy    ≥ 1.24
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Optional, Tuple

import numpy as np

# Try trimesh — required for STL loading
try:
    import trimesh
    TRIMESH_AVAILABLE = True
except ImportError:
    TRIMESH_AVAILABLE = False

# Rich composite sampler (50% uniform / 30% curvature / 20% boundary)
from ..sampling.boundary_sampler import boundary_aware_sampling, SamplingStats
from ..geometry.boundary_detection import detect_boundary_points

# Mesh-based simple boundary sampler (for --boundary-aware CLI mode)
from ..core import (
    detect_boundary_vertices as _detect_boundary_vertices,
    boundary_aware_sampling as _mesh_boundary_aware_sampling,
)

# Gingival margin detection (auto-run when gingiva_labels.npy is absent)
try:
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
    from meshnet.gingiva_detection.gingiva_classifier import detect_gingival_margin
    from meshnet.gingiva_detection.gingival_margin import MarginDetectionConfig
    _GINGIVA_DETECTION_AVAILABLE = True
except ImportError:
    _GINGIVA_DETECTION_AVAILABLE = False

# Two-stage pipeline extensions
try:
    _sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
    from meshnet.landmarks.cusp_detection import detect_cusps, LandmarkType
    _LANDMARK_DETECTION_AVAILABLE = True
except ImportError:
    _LANDMARK_DETECTION_AVAILABLE = False

# Base-creation preprocessing (auto-run when scan has no printable base)
try:
    _sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
    from meshnet.preprocessing.base_creation.preprocess_pipeline import (
        PreprocessPipeline as _PreprocessPipeline,
        detect_base as _detect_base,
    )
    _PREPROCESS_AVAILABLE = True
except ImportError:
    _PREPROCESS_AVAILABLE = False

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_N_POINTS = 10_000
DEFAULT_K_BOUNDARY = 16
DEFAULT_K_CURVATURE = 20
DENSE_SAMPLE_MULTIPLIER = 5   # sample 5× n_points dense then down-sample


# ---------------------------------------------------------------------------
# Core per-case processing
# ---------------------------------------------------------------------------

def _load_or_derive_labels(
    mesh: "trimesh.Trimesh",
    case_dir: Path,
) -> Optional[np.ndarray]:
    """
    Load per-vertex labels from labels.npy if present, otherwise try to
    derive from mesh colour information.

    Returns
    -------
    vertex_labels : np.ndarray, shape (V,), int64
        Or None if labels cannot be determined.
    """
    labels_file = case_dir / "labels.npy"
    if labels_file.exists():
        labels = np.load(labels_file).astype(np.int64)
        if len(labels) == len(mesh.vertices):
            return labels
        logger.warning(
            "labels.npy has %d entries but mesh has %d vertices — skipping file",
            len(labels), len(mesh.vertices),
        )

    # Attempt to derive from face colours (trimesh sets face_colors for
    # coloured STLs exported by dental CAD software)
    if hasattr(mesh, "visual") and hasattr(mesh.visual, "face_colors"):
        fc = mesh.visual.face_colors
        if fc is not None and len(fc) == len(mesh.faces):
            # Heuristic: use the red channel (often encodes tooth index)
            # Clamp to 0–32 range
            face_labels = np.clip((fc[:, 0] // 8).astype(np.int64), 0, 32)
            # Propagate face labels to vertices via mode voting
            vertex_labels = np.zeros(len(mesh.vertices), dtype=np.int64)
            for face_idx, face in enumerate(mesh.faces):
                for v in face:
                    vertex_labels[v] = face_labels[face_idx]
            return vertex_labels

    logger.warning(
        "Could not determine labels for %s — generating gingiva-only labels",
        case_dir.name,
    )
    # Last resort: all-gingiva placeholder
    return np.zeros(len(mesh.vertices), dtype=np.int64)


def _sample_dense_from_mesh(
    mesh: "trimesh.Trimesh",
    n_dense: int,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Sample dense points from the mesh surface with barycentric interpolation
    to propagate vertex labels to surface samples.

    Returns
    -------
    dense_points : np.ndarray, shape (n_dense, 3)
    dense_labels : np.ndarray, shape (n_dense,)
    """
    # Sample points on mesh surface
    dense_points, face_indices = trimesh.sample.sample_surface(mesh, n_dense)
    dense_points = np.asarray(dense_points, dtype=np.float32)

    # Map face → labels via nearest vertex
    # Each face has 3 vertices; use the first vertex's label (fast approximation)
    vertex_labels = getattr(mesh, "_vertex_labels", None)
    if vertex_labels is not None:
        face_vertex_labels = vertex_labels[mesh.faces[face_indices]]
        # Mode of the 3 face vertices
        from scipy.stats import mode as scipy_mode
        dense_labels = scipy_mode(face_vertex_labels, axis=1).mode.flatten().astype(np.int64)
    else:
        dense_labels = np.zeros(len(dense_points), dtype=np.int64)

    return dense_points, dense_labels


def process_case(
    case_dir: Path,
    output_dir: Path,
    n_points: int = DEFAULT_N_POINTS,
    k_boundary: int = DEFAULT_K_BOUNDARY,
    k_curvature: int = DEFAULT_K_CURVATURE,
    overwrite: bool = False,
    seed: Optional[int] = None,
    use_boundary_aware: bool = False,
    boundary_ratio: float = 0.3,
    auto_gingiva: bool = False,
    auto_preprocess: bool = False,   # ← NEW: auto base creation
) -> dict:
    """
    Process a single case directory: load STL → boundary-aware sample → save.

    Returns a result dict with status, timing, and sampling stats.
    """
    t_start = time.perf_counter()
    case_name = case_dir.name
    out_case_dir = output_dir / case_name

    result = {
        "case": case_name,
        "status": "pending",
        "error": None,
        "elapsed_s": 0.0,
        "stats": None,
    }

    # Skip if already processed
    if not overwrite and (out_case_dir / "points.npy").exists():
        result["status"] = "skipped"
        result["elapsed_s"] = time.perf_counter() - t_start
        logger.debug("Skipping %s (already processed)", case_name)
        return result

    try:
        if not TRIMESH_AVAILABLE:
            raise ImportError(
                "trimesh is required for STL loading. "
                "Install it with: pip install trimesh"
            )

        # ── Load STL ──────────────────────────────────────────────────
        stl_candidates = list(case_dir.glob("*.stl")) + list(case_dir.glob("*.STL"))
        if not stl_candidates:
            raise FileNotFoundError(f"No STL file found in {case_dir}")

        stl_path = stl_candidates[0]
        logger.info("  Loading mesh: %s", stl_path.name)
        mesh = trimesh.load(str(stl_path), force="mesh", process=True)

        if mesh.is_empty or len(mesh.vertices) < 100:
            raise ValueError(f"Mesh is empty or too small: {len(mesh.vertices)} vertices")

        # ── AUTO PREPROCESSING: create base if scan has none ───────────────────────
        if auto_preprocess and _PREPROCESS_AVAILABLE:
            if not _detect_base(mesh):
                logger.info(
                    "  [preprocess] No base detected in %s — running PreprocessPipeline",
                    case_name,
                )
                _pipeline = _PreprocessPipeline(
                    save_intermediates=True,
                    skip_if_base_present=False,
                    overwrite=True,
                )
                _pp_result = _pipeline.run(
                    str(stl_path),
                    output_dir=str(case_dir),
                )
                if _pp_result.success and _pp_result.output_stl:
                    # Reload the processed mesh
                    logger.info(
                        "  [preprocess] ✓ Base created → reloading %s",
                        _pp_result.output_stl,
                    )
                    mesh = trimesh.load(
                        _pp_result.output_stl, force="mesh", process=True
                    )
                    mesh._vertex_labels = _load_or_derive_labels(mesh, case_dir)
                    result["auto_preprocessed"] = True
                    result["preprocess_meta"] = _pp_result.to_dict()
                else:
                    logger.warning(
                        "  [preprocess] ✗ PreprocessPipeline failed for %s: %s",
                        case_name, _pp_result.error,
                    )
                    result["auto_preprocessed"] = False
            else:
                logger.debug("  [preprocess] Base already present in %s — skipping.", case_name)
        # ── END AUTO PREPROCESSING ───────────────────────────────────────────────

        # ── Load / derive labels ───────────────────────────────────────
        vertex_labels = _load_or_derive_labels(mesh, case_dir)

        # Attach labels to mesh for downstream propagation
        mesh._vertex_labels = vertex_labels

        # ── Dense sampling from mesh surface ───────────────────────────
        n_dense = min(n_points * DENSE_SAMPLE_MULTIPLIER, 200_000)
        logger.info(
            "  Mesh loaded: %d vertices, %d faces. Sampling %d dense points...",
            len(mesh.vertices), len(mesh.faces), n_dense,
        )
        dense_points, dense_labels = _sample_dense_from_mesh(mesh, n_dense)

        # ── Sampling ───────────────────────────────────────────────────
        if use_boundary_aware:
            # Simple mesh-based boundary-aware sampling (Step 2 / --boundary-aware)
            logger.info(
                "  Running mesh boundary-aware sampling "
                "(ratio=%.2f) → %d points...", boundary_ratio, n_points
            )
            # Build tooth submeshes from vertex labels
            # Each unique non-zero label becomes a pseudo-submesh object
            tooth_submeshes = []
            for lbl in np.unique(vertex_labels):
                if lbl == 0:
                    continue  # skip gingiva
                idx = np.where(vertex_labels == lbl)[0]
                if len(idx) < 3:
                    continue

                class _PseudoMesh:
                    def __init__(self, v):
                        self.vertices = v

                tooth_submeshes.append(_PseudoMesh(mesh.vertices[idx]))

            if tooth_submeshes:
                sampled_points = _mesh_boundary_aware_sampling(
                    mesh,
                    tooth_submeshes,
                    n_points=n_points,
                    boundary_ratio=boundary_ratio,
                    seed=seed,
                )
                # Assign labels via nearest vertex in original mesh
                from scipy.spatial import cKDTree as _cKDTree
                _tree = _cKDTree(mesh.vertices)
                _dists, _idxs = _tree.query(sampled_points)
                sampled_labels = vertex_labels[_idxs].astype(np.int64)
            else:
                logger.warning(
                    "  No tooth submeshes found; falling back to uniform."
                )
                sampled_points = dense_points[:n_points]
                sampled_labels = dense_labels[:n_points]

            # Build a minimal stats dict for meta.json
            stats_dict = {
                "sampling_method": "boundary_aware",
                "boundary_ratio": boundary_ratio,
                "n_tooth_submeshes": len(tooth_submeshes),
            }

            # Save output
            out_case_dir.mkdir(parents=True, exist_ok=True)
            np.save(out_case_dir / "points.npy", sampled_points.astype(np.float32))
            np.save(out_case_dir / "tooth_labels.npy", sampled_labels)

            meta = {
                "case": case_name,
                "source_stl": str(stl_path),
                "n_dense_sampled": int(n_dense),
                "n_points": int(n_points),
                "sampling_method": "boundary_aware",
                "boundary_ratio": boundary_ratio,
                **stats_dict,
            }

            # ── Auto gingival detection ────────────────────────────────────
            if auto_gingiva and not (out_case_dir / "gingiva_labels.npy").exists():
                meta = _auto_detect_gingiva(mesh, out_case_dir, meta)

            with open(out_case_dir / "meta.json", "w") as f:
                json.dump(meta, f, indent=2)

            elapsed = time.perf_counter() - t_start
            logger.info(
                "  ✓ %s processed in %.1fs  | boundary_ratio=%.2f  "
                "tooth_submeshes=%d",
                case_name, elapsed, boundary_ratio, len(tooth_submeshes),
            )

            result.update({
                "status": "ok",
                "elapsed_s": round(elapsed, 2),
                "stats": stats_dict,
            })

        else:
            # Default: rich 3-pool composite sampler
            logger.info(
                "  Running boundary-aware sampling → %d points...", n_points
            )
            sampled_points, sampled_labels, stats = boundary_aware_sampling(
                dense_points,
                dense_labels,
                n_points=n_points,
                k_boundary=k_boundary,
                k_curvature=k_curvature,
                seed=seed,
            )

            # ── Save output ────────────────────────────────────────────────
            out_case_dir.mkdir(parents=True, exist_ok=True)
            np.save(out_case_dir / "points.npy", sampled_points)
            np.save(out_case_dir / "tooth_labels.npy", sampled_labels)

            # Derive coarse labels: 0=gingiva, 1=tooth (binary)
            coarse_labels = (sampled_labels > 0).astype(np.int64)
            np.save(out_case_dir / "coarse_labels.npy", coarse_labels)

            # meta.json — sampling statistics + provenance
            meta = {
                "case": case_name,
                "source_stl": str(stl_path),
                "n_dense_sampled": int(n_dense),
                "n_points": int(n_points),
                "k_boundary": k_boundary,
                "k_curvature": k_curvature,
                "sampling_strategy": "boundary_aware_v1",
                "sampling_method": "boundary_aware",
                "boundary_ratio": 0.20,      # composite sampler boundary fraction
                **stats.to_dict(),
            }

            # ── Auto gingival detection ────────────────────────────────────
            if auto_gingiva and not (out_case_dir / "gingiva_labels.npy").exists():
                meta = _auto_detect_gingiva(mesh, out_case_dir, meta)

            with open(out_case_dir / "meta.json", "w") as f:
                json.dump(meta, f, indent=2)

            elapsed = time.perf_counter() - t_start
            logger.info(
                "  ✓ %s processed in %.1fs  | boundary=%d curvature=%d uniform=%d",
                case_name, elapsed,
                stats.boundary_points, stats.curvature_points, stats.uniform_points,
            )

            result.update({
                "status": "ok",
                "elapsed_s": round(elapsed, 2),
                "stats": stats.to_dict(),
            })

    except Exception as exc:
        elapsed = time.perf_counter() - t_start
        logger.error("  ✗ %s FAILED: %s", case_name, exc)
        logger.debug(traceback.format_exc())
        result.update({
            "status": "error",
            "error": str(exc),
            "elapsed_s": round(elapsed, 2),
        })

    return result


def _generate_landmark_stubs(
    mesh,
    out_case_dir: Path,
    meta: dict,
) -> dict:
    """
    Generate curvature-based landmark stub annotations for Stage 3 training.

    Uses the geometry-only CuspDetector (no trained model) to produce initial
    landmark estimates.  These are stored as ``landmark_points.npy``:
        (L, 5) float32 — [x, y, z, landmark_type_int, fdi_tooth_number]

    ``fdi_tooth_number`` is set to 0 (unknown) at this stage; the training
    pipeline annotates it after FDI assignment.

    Called when ``--gen_landmarks`` is passed to the CLI.
    """
    if not _LANDMARK_DETECTION_AVAILABLE:
        logger.warning("Landmark detection modules unavailable — skipping stub generation.")
        return meta

    logger.info("  Generating landmark stubs from curvature geometry...")
    t_lm = time.perf_counter()
    try:
        vertices = np.asarray(mesh.vertices, dtype=np.float32)
        lm_dict = detect_cusps(
            vertices,
            normals=None,
            occlusal_normal=np.array([0.0, 0.0, 1.0], dtype=np.float32),
        )

        rows = []
        for lt, coords in lm_dict.items():
            for pt in coords:
                rows.append([pt[0], pt[1], pt[2], float(lt.value), 0.0])

        if rows:
            lm_arr = np.array(rows, dtype=np.float32)
        else:
            lm_arr = np.empty((0, 5), dtype=np.float32)

        np.save(out_case_dir / "landmark_points.npy", lm_arr)

        elapsed_lm = time.perf_counter() - t_lm
        meta["landmark_stubs"] = {
            "generated": True,
            "n_landmarks": len(rows),
            "elapsed_s": round(elapsed_lm, 3),
        }
        logger.info(
            "  Landmark stubs generated: %d points in %.2fs",
            len(rows), elapsed_lm
        )
    except Exception as exc:
        logger.warning("  Landmark stub generation failed: %s", exc)
        meta["landmark_stubs"] = {"generated": False, "error": str(exc)}

    return meta


def _auto_detect_gingiva(
    mesh,
    out_case_dir: Path,
    meta: dict,
) -> dict:
    """
    Auto-detect gingival margin and save gingiva_labels.npy + gingiva_meta.json.

    Called from process_case() when gingiva_labels.npy is absent and
    ``--auto_gingiva`` is enabled.

    The saved gingiva_labels.npy stores per-vertex labels:
        0 = gingiva
        1 = tooth
    (This is the vertex-level counterpart to face_labels.)

    Parameters
    ----------
    mesh        : trimesh.Trimesh
    out_case_dir: Path  — output directory for this case
    meta        : dict  — existing meta.json dict (will be updated in-place)

    Returns
    -------
    Updated meta dict with gingiva detection results added.
    """
    if not _GINGIVA_DETECTION_AVAILABLE:
        logger.warning(
            "meshnet.gingiva_detection not available; skipping auto-gingiva. "
            "Ensure meshnet/ is on sys.path."
        )
        return meta

    logger.info("  Auto-detecting gingival margin...")
    t_g = time.perf_counter()
    try:
        face_labels, margin_verts, gingiva_meta = detect_gingival_margin(
            mesh,
            config=MarginDetectionConfig(),
            use_flood_fill=True,
        )
        elapsed_g = time.perf_counter() - t_g

        # Derive vertex labels from face labels (majority vote inverse):
        # A vertex is gingiva if majority of its incident faces are gingiva.
        V = len(mesh.vertices)
        faces = np.asarray(mesh.faces, dtype=np.int64)
        gingiva_face_mask = face_labels == 0

        gingiva_vote = np.zeros(V, dtype=np.float32)
        vote_count = np.zeros(V, dtype=np.float32)
        for fi, face in enumerate(faces):
            for v in face:
                vote_count[v] += 1
                if gingiva_face_mask[fi]:
                    gingiva_vote[v] += 1

        vertex_labels = np.where(
            vote_count > 0,
            (gingiva_vote / np.maximum(vote_count, 1) >= 0.5).astype(np.int64),
            0,
        )
        # Invert to match convention: 0=gingiva 1=tooth → same as face_labels
        vertex_labels = np.where(vertex_labels == 0, 0, 1).astype(np.int64)

        # Save gingiva_labels (vertex-level, same convention as tooth_labels)
        np.save(out_case_dir / "gingiva_labels.npy", vertex_labels)

        # Save gingiva face labels too (for reference)
        np.save(out_case_dir / "gingiva_face_labels.npy", face_labels)

        # Save margin vertex indices
        margin_arr = np.array(margin_verts, dtype=np.int64)
        np.save(out_case_dir / "gingival_margin_vertices.npy", margin_arr)

        # Save per-case gingiva metadata
        gingiva_meta["elapsed_s"] = round(elapsed_g, 3)
        with open(out_case_dir / "gingiva_meta.json", "w") as f:
            json.dump(gingiva_meta, f, indent=2)

        meta["auto_gingiva"] = {
            "detected": True,
            "margin_vertex_count": len(margin_verts),
            "n_gingiva_faces": gingiva_meta.get("n_gingiva_faces", 0),
            "n_tooth_faces": gingiva_meta.get("n_tooth_faces", 0),
            "n_components": gingiva_meta.get("n_components", 0),
            "elapsed_s": round(elapsed_g, 3),
        }
        logger.info(
            "  Gingiva auto-detected in %.2fs — margin=%d  components=%d",
            elapsed_g, len(margin_verts), gingiva_meta.get("n_components", 0),
        )
    except Exception as exc:
        logger.warning("  Auto-gingiva detection failed: %s", exc)
        meta["auto_gingiva"] = {"detected": False, "error": str(exc)}

    return meta


def discover_cases(input_dir: Path) -> list[Path]:
    """Find all case directories that contain at least one STL file."""
    cases = []
    for candidate in sorted(input_dir.iterdir()):
        if candidate.is_dir():
            stl_files = list(candidate.glob("*.stl")) + list(candidate.glob("*.STL"))
            if stl_files:
                cases.append(candidate)
    return cases


# ---------------------------------------------------------------------------
# Dataset splitting
# ---------------------------------------------------------------------------

def split_dataset(
    output_dir: str | Path,
    train_ratio: float = 0.8,
    seed: int = 42,
    mode: str = "manifest",
    case_prefix: str = "",
) -> dict:
    """
    Split processed cases into training and validation sets.

    Supports two modes:

    ``"manifest"`` (default, recommended)
        Writes ``train.txt`` and ``val.txt`` alongside the cases.
        Case directories are NOT moved — the dataset registry / backup system
        remains intact.  The dataset loader already reads these files
        (``_discover_samples`` split-file branch, line 115-124).

    ``"subdir"``
        Physically **moves** case directories into ``output_dir/train/`` and
        ``output_dir/val/``.  Use only when the downstream loader strictly
        requires the sub-directory layout and the dataset is not yet registered.

    Parameters
    ----------
    output_dir  : directory that contains case sub-directories
    train_ratio : fraction of cases allocated to training (default 0.8)
    seed        : random seed for reproducibility (default 42)
    mode        : ``"manifest"`` | ``"subdir"``
    case_prefix : if set, only case directories whose name starts with this
                  prefix are included (e.g. ``"case"``).  Empty = include all.

    Returns
    -------
    dict with keys: train_cases, val_cases, train_count, val_count, mode, report_path
    """
    import random as _random

    output_dir = Path(output_dir)
    if not output_dir.exists():
        raise FileNotFoundError(f"output_dir does not exist: {output_dir}")

    # Collect processed case dirs (must have points.npy)
    candidates = [
        d for d in sorted(output_dir.iterdir())
        if d.is_dir()
        and (d / "points.npy").exists()
        and (not case_prefix or d.name.startswith(case_prefix))
    ]

    if not candidates:
        raise ValueError(
            f"No processed cases (with points.npy) found in {output_dir}. "
            "Run the dataset generator first."
        )

    # Shuffle deterministically
    _random.seed(seed)
    shuffled = candidates.copy()
    _random.shuffle(shuffled)

    split_idx   = max(1, int(len(shuffled) * train_ratio))
    # Guarantee at least 1 val case when total > 1
    if split_idx == len(shuffled) and len(shuffled) > 1:
        split_idx = len(shuffled) - 1

    train_cases = shuffled[:split_idx]
    val_cases   = shuffled[split_idx:]

    result = {
        "train_cases":  [c.name for c in train_cases],
        "val_cases":    [c.name for c in val_cases],
        "train_count":  len(train_cases),
        "val_count":    len(val_cases),
        "mode":         mode,
        "report_path":  None,
    }

    if mode == "manifest":
        _write_split_manifests(output_dir, train_cases, val_cases)

    elif mode == "subdir":
        train_dir = output_dir / "train"
        val_dir   = output_dir / "val"
        train_dir.mkdir(exist_ok=True)
        val_dir.mkdir(exist_ok=True)

        for c in train_cases:
            target = train_dir / c.name
            if not target.exists():
                c.rename(target)
                logger.debug("  Moved %s → train/", c.name)

        for c in val_cases:
            target = val_dir / c.name
            if not target.exists():
                c.rename(target)
                logger.debug("  Moved %s → val/", c.name)

        logger.info(
            "[split] Subdir split complete: %d train, %d val",
            len(train_cases), len(val_cases),
        )

    else:
        raise ValueError(f"Unknown split mode '{mode}'. Use 'manifest' or 'subdir'.")

    # Save split report
    report = {
        "train_cases":  result["train_cases"],
        "val_cases":    result["val_cases"],
        "train_count":  result["train_count"],
        "val_count":    result["val_count"],
        "total_cases":  len(candidates),
        "train_ratio":  train_ratio,
        "seed":         seed,
        "mode":         mode,
    }
    report_path = output_dir / "split_report.json"
    with open(report_path, "w") as _f:
        json.dump(report, _f, indent=2)
    result["report_path"] = str(report_path)

    print(
        f"\n{'─' * 55}\n"
        f"  Dataset split ({mode} mode)\n"
        f"  Total cases : {len(candidates)}\n"
        f"  Train       : {len(train_cases)} ({len(train_cases) / max(len(candidates), 1) * 100:.0f}%)\n"
        f"  Val         : {len(val_cases)} ({len(val_cases) / max(len(candidates), 1) * 100:.0f}%)\n"
        f"  Seed        : {seed}\n"
        f"  Report      : {report_path}\n"
        f"{'─' * 55}\n"
    )
    return result


def _write_split_manifests(
    output_dir: Path,
    train_cases: list,
    val_cases: list,
) -> None:
    """
    Write ``train.txt`` and ``val.txt`` inside *output_dir*.
    The dataset loader's ``_discover_samples`` reads these files.
    """
    for fname, case_list in [("train.txt", train_cases), ("val.txt", val_cases)]:
        split_file = output_dir / fname
        with open(split_file, "w") as f:
            for c in case_list:
                f.write(c.name + "\n")
        logger.info(
            "[split] Wrote %s with %d cases → %s",
            fname, len(case_list), split_file,
        )



# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate boundary-aware point cloud dataset from raw STL cases.\n"
            "\n"
            "Pipeline: STL → dense mesh sampling → boundary-aware subsampling\n"
            "         → points.npy + tooth_labels.npy + meta.json"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--input_dir", "-i", required=True,
        help="Root directory containing raw case sub-directories (each with .stl)",
    )
    parser.add_argument(
        "--output_dir", "-o", required=True,
        help="Output root directory for processed samples",
    )
    parser.add_argument(
        "--n_points", type=int, default=DEFAULT_N_POINTS,
        help=f"Number of points to sample per case (default: {DEFAULT_N_POINTS})",
    )
    parser.add_argument(
        "--k_boundary", type=int, default=DEFAULT_K_BOUNDARY,
        help=f"KNN neighbourhood size for boundary detection (default: {DEFAULT_K_BOUNDARY})",
    )
    parser.add_argument(
        "--k_curvature", type=int, default=DEFAULT_K_CURVATURE,
        help=f"KNN neighbourhood size for curvature estimation (default: {DEFAULT_K_CURVATURE})",
    )
    parser.add_argument(
        "--workers", type=int, default=1,
        help="Number of parallel worker processes (default: 1)",
    )
    parser.add_argument(
        "--overwrite", action="store_true",
        help="Overwrite already-processed cases",
    )
    parser.add_argument(
        "--seed", type=int, default=None,
        help="Random seed for reproducibility",
    )
    parser.add_argument(
        "--log_level", default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    # ── Step 5 — boundary-aware flag ──────────────────────────────────────
    parser.add_argument(
        "--boundary-aware", "--boundary_aware",
        dest="boundary_aware",
        action="store_true",
        default=False,
        help=(
            "Enable mesh-based boundary-aware sampling.\n"
            "When set, uses detect_boundary_vertices + boundary_aware_sampling\n"
            "from dataset/core.py (30%% boundary / 70%% normal) instead of\n"
            "the default composite sampler."
        ),
    )
    parser.add_argument(
        "--boundary-ratio", "--boundary_ratio",
        dest="boundary_ratio",
        type=float,
        default=0.3,
        help="Fraction of points from boundary zone (default: 0.3)",
    )
    # ── Preprocessing — auto base creation ────────────────────────────────────
    parser.add_argument(
        "--auto_preprocess", "--auto-preprocess",
        dest="auto_preprocess",
        action="store_true",
        default=False,
        help=(
            "Automatically detect and create a printable base for raw scans "
            "that do not already have one.  Runs PreprocessPipeline before "
            "standard sampling.  Requires meshnet.preprocessing to be installed.\n"
            "Intermediate debug STL files are saved to the case directory:\n"
            "  trimmed_scan.stl, base_plane.stl, scan_with_base.stl, final_model.stl"
        ),
    )
    # ── Dataset splitting ─────────────────────────────────────────────────────
    parser.add_argument(
        "--split",
        action="store_true",
        default=False,
        help=(
            "After dataset generation, automatically split processed cases into "
            "train and val sets.  Writes train.txt / val.txt manifests alongside "
            "the dataset directory so the training loader can find them.\n"
            "Use --split_mode=subdir to physically move cases to train/ and val/ "
            "subdirectories instead."
        ),
    )
    parser.add_argument(
        "--train_ratio",
        type=float,
        default=0.8,
        help="Fraction of cases used for training when --split is set (default: 0.8).",
    )
    parser.add_argument(
        "--split_seed",
        type=int,
        default=42,
        help="Random seed for reproducible dataset splitting (default: 42).",
    )
    parser.add_argument(
        "--split_mode",
        choices=["manifest", "subdir"],
        default="manifest",
        help=(
            "How to persist the split (default: manifest).\n"
            "  manifest — write train.txt / val.txt (safe, no file moves).\n"
            "  subdir   — physically move cases into train/ and val/ dirs."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
        datefmt="%H:%M:%S",
    )

    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)

    if not input_dir.exists():
        logger.error("Input directory not found: %s", input_dir)
        return

    output_dir.mkdir(parents=True, exist_ok=True)

    cases = discover_cases(input_dir)
    if not cases:
        logger.error("No STL case directories found in %s", input_dir)
        return

    logger.info(
        "\n%s\n  Boundary-Aware Dataset Generator\n"
        "  Cases found : %d\n"
        "  Output dir  : %s\n"
        "  n_points    : %d\n"
        "  k_boundary  : %d\n"
        "  k_curvature : %d\n"
        "  Workers     : %d\n%s",
        "=" * 55, len(cases), output_dir,
        args.n_points, args.k_boundary, args.k_curvature, args.workers,
        "=" * 55,
    )

    t_total = time.perf_counter()
    results = []

    if args.boundary_aware:
        logger.info(
            "  Sampling mode : mesh boundary-aware "
            "(boundary_ratio=%.2f)", args.boundary_ratio
        )
    else:
        logger.info("  Sampling mode : composite (50%% uniform / 30%% curvature / 20%% boundary)")

    if args.workers > 1:
        # Multi-process mode
        with ProcessPoolExecutor(max_workers=args.workers) as executor:
            futures = {
                executor.submit(
                    process_case,
                    case,
                    output_dir,
                    args.n_points,
                    args.k_boundary,
                    args.k_curvature,
                    args.overwrite,
                    args.seed,
                    args.boundary_aware,
                    args.boundary_ratio,
                ): case
                for case in cases
            }
            for future in as_completed(futures):
                result = future.result()
                results.append(result)
                status_icon = {"ok": "✓", "skipped": "↷", "error": "✗"}.get(
                    result["status"], "?"
                )
                print(
                    f"  {status_icon} {result['case']:30s} "
                    f"[{result['status']:8s}] {result['elapsed_s']:.1f}s"
                )
    else:
        # Single-process mode
        for case in cases:
            result = process_case(
                case, output_dir, args.n_points,
                args.k_boundary, args.k_curvature,
                args.overwrite, args.seed,
                args.boundary_aware, args.boundary_ratio,
            )
            results.append(result)
            status_icon = {"ok": "✓", "skipped": "↷", "error": "✗"}.get(
                result["status"], "?"
            )
            print(
                f"  {status_icon} {result['case']:30s} "
                f"[{result['status']:8s}] {result['elapsed_s']:.1f}s"
            )

    # Summary
    elapsed_total = time.perf_counter() - t_total
    ok = sum(1 for r in results if r["status"] == "ok")
    skipped = sum(1 for r in results if r["status"] == "skipped")
    errors = sum(1 for r in results if r["status"] == "error")

    print(
        f"\n{'=' * 55}\n"
        f"  Done in {elapsed_total:.1f}s\n"
        f"  Processed : {ok}\n"
        f"  Skipped   : {skipped}\n"
        f"  Errors    : {errors}\n"
        f"{'=' * 55}"
    )

    # Save run report
    report_path = output_dir / "generation_report.json"
    with open(report_path, "w") as f:
        json.dump({
            "total_cases": len(cases),
            "processed": ok,
            "skipped": skipped,
            "errors": errors,
            "elapsed_s": round(elapsed_total, 2),
            "config": {
                "n_points": args.n_points,
                "k_boundary": args.k_boundary,
                "k_curvature": args.k_curvature,
                "strategy": "boundary_aware_v1",
                "sampling_method": "boundary_aware" if args.boundary_aware else "composite",
                "boundary_ratio": args.boundary_ratio if args.boundary_aware else 0.20,
            },
            "results": results,
        }, f, indent=2)
    logger.info("Report written to %s", report_path)

    # ── Dataset splitting (optional) ──────────────────────────────────────────
    if args.split:
        if ok == 0 and skipped == 0:
            logger.warning(
                "[split] No cases were processed or skipped — skipping split."
            )
        else:
            try:
                split_result = split_dataset(
                    output_dir=output_dir,
                    train_ratio=args.train_ratio,
                    seed=args.split_seed,
                    mode=args.split_mode,
                )
                logger.info(
                    "[split] %d train / %d val | mode=%s | report=%s",
                    split_result["train_count"],
                    split_result["val_count"],
                    split_result["mode"],
                    split_result["report_path"],
                )
            except Exception as _split_exc:
                logger.error("[split] Dataset split failed: %s", _split_exc)
    else:
        logger.info(
            "[split] Skipping automatic split (pass --split to enable). "
            "Training loader will use all cases for both train and val."
        )


if __name__ == "__main__":
    main()
