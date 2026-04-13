"""
test_margin.py — Test script for gingival margin detection.

Loads an STL mesh, detects the gingival margin, prints statistics, and
optionally renders the result using trimesh's built-in viewer.

Usage
-----
    # Detect margin on a single STL file
    python -m meshnet.gingiva_detection.test_margin path/to/scan.stl

    # Detect and display interactive viewer with green margin curve
    python -m meshnet.gingiva_detection.test_margin path/to/scan.stl --view

    # Save outputs
    python -m meshnet.gingiva_detection.test_margin path/to/scan.stl \\
        --view \\
        --save_labels ./outputs/face_labels.npy \\
        --save_screenshot ./outputs/margin.png

    # Adjust sensitivity (higher percentile = stricter margin detection)
    python -m meshnet.gingiva_detection.test_margin path/to/scan.stl \\
        --curv_pct 75 --valley_pct 80

Validation Checklist
--------------------
    ✓ Green curve wraps continuously around each tooth base
    ✓ No large gaps in the margin ring
    ✓ Gingiva region (pink) is below the margin ring
    ✓ Tooth surface (white/grey) is above the margin ring
    ✓ meta.json shows n_components ~ number of teeth in the scan

Output Colours (--view mode)
-----------------------------
    🟢 Green     → detected margin vertices (3-D tube overlay)
    🩷 Pink      → gingiva faces (label 0)
    ⬜ Light grey → tooth faces (label 1)
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Visualisation helpers
# ─────────────────────────────────────────────────────────────────────────────

GINGIVA_COLOUR = np.array([255, 158, 186, 200], dtype=np.uint8)   # pink, semi-transparent
TOOTH_COLOUR   = np.array([240, 240, 235, 255], dtype=np.uint8)   # ivory
MARGIN_COLOUR  = np.array([0,   220, 80,  255], dtype=np.uint8)   # vivid green


def _build_margin_tube(vertices: np.ndarray, margin_idx: list[int], radius: float = 0.15):
    """
    Create a trimesh sphere cluster along the margin vertices for visualisation.

    Returns a list of trimesh.primitives.Sphere objects positioned at each
    margin vertex.  Fusing them into a single mesh would require boolean ops;
    returning them as a list lets trimesh render them as separate geometries.
    """
    try:
        import trimesh
    except ImportError:
        return []

    spheres = []
    # Subsample for performance if many margin vertices
    step = max(1, len(margin_idx) // 500)
    for idx in margin_idx[::step]:
        s = trimesh.primitives.Sphere(radius=radius, center=vertices[idx])
        s.visual.face_colors = MARGIN_COLOUR
        spheres.append(s)
    return spheres


def _colour_mesh_by_labels(mesh, face_labels: np.ndarray):
    """Apply face colours to a mesh copy based on gingiva/tooth labels."""
    try:
        import trimesh
    except ImportError:
        return mesh

    coloured = mesh.copy()
    colours = np.where(
        face_labels[:, np.newaxis] == 0,
        GINGIVA_COLOUR,
        TOOTH_COLOUR,
    )
    coloured.visual.face_colors = colours.astype(np.uint8)
    return coloured


# ─────────────────────────────────────────────────────────────────────────────
# Main detection + visualisation function
# ─────────────────────────────────────────────────────────────────────────────

def run_test(
    stl_path: str,
    view: bool = False,
    save_labels: Optional[str] = None,
    save_screenshot: Optional[str] = None,
    save_meta: Optional[str] = None,
    curv_pct: float = 70.0,
    valley_pct: float = 75.0,
    curvature_k: int = 20,
    valley_thresh: float = 0.0,
    smooth_iters: int = 2,
    min_component: int = 10,
    use_flood_fill: bool = True,
) -> dict:
    """
    Load STL, detect gingival margin, print stats, optionally display.

    Returns the meta dict from detect_gingival_margin.
    """
    try:
        import trimesh
    except ImportError:
        logger.error(
            "trimesh is required. Install with: pip install trimesh[easy]"
        )
        sys.exit(1)

    from .gingival_margin import MarginDetectionConfig
    from .gingiva_classifier import detect_gingival_margin

    stl_path = Path(stl_path)
    if not stl_path.exists():
        logger.error("STL file not found: %s", stl_path)
        sys.exit(1)

    # ── Load mesh ──────────────────────────────────────────────────────────
    logger.info("Loading mesh: %s", stl_path)
    t_load = time.perf_counter()
    mesh = trimesh.load(str(stl_path), force="mesh", process=True)
    logger.info(
        "Mesh loaded in %.2fs: %d vertices, %d faces",
        time.perf_counter() - t_load, len(mesh.vertices), len(mesh.faces),
    )

    if mesh.is_empty or len(mesh.vertices) < 100:
        logger.error(
            "Mesh is empty or too small (%d vertices). "
            "Check the STL file.", len(mesh.vertices)
        )
        sys.exit(1)

    # ── Configure detector ─────────────────────────────────────────────────
    config = MarginDetectionConfig(
        curvature_percentile=curv_pct,
        valley_percentile=valley_pct,
        laplacian_smooth_iters=smooth_iters,
        min_component_size=min_component,
    )

    # ── Run detection pipeline ─────────────────────────────────────────────
    logger.info("Running gingival margin detection...")
    face_labels, margin_vertices, meta = detect_gingival_margin(
        mesh,
        config=config,
        curvature_k=curvature_k,
        valley_concavity_thresh=valley_thresh,
        use_flood_fill=use_flood_fill,
    )

    # ── Print report ───────────────────────────────────────────────────────
    print(f"\n{'─' * 55}")
    print(f"  Gingival Margin Detection — {stl_path.name}")
    print(f"{'─' * 55}")
    print(f"  Vertices         : {meta['n_vertices']:>8,}")
    print(f"  Faces            : {meta['n_faces']:>8,}")
    print(f"  Margin vertices  : {meta['margin_vertex_count']:>8,}")
    print(f"  Components       : {meta['n_components']:>8,}")
    print(f"  Gingiva faces    : {meta['n_gingiva_faces']:>8,}")
    print(f"  Tooth faces      : {meta['n_tooth_faces']:>8,}")
    print(f"  Curvature thresh : {meta['curvature_threshold']:>8.4f}")
    print(f"  Valley thresh    : {meta['valley_threshold']:>8.4f}")
    print(f"\n  Timing:")
    for step, dur in meta["timing_s"].items():
        print(f"    {step:<20s}: {dur:.3f}s")
    print(f"{'─' * 55}\n")

    # ── Save outputs ───────────────────────────────────────────────────────
    if save_labels:
        out_path = Path(save_labels)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        np.save(out_path, face_labels)
        logger.info("Face labels saved to %s", out_path)
        print(f"  ✓ Face labels saved: {out_path}")

    if save_meta:
        out_path = Path(save_meta)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w") as f:
            json.dump(meta, f, indent=2)
        logger.info("Meta saved to %s", out_path)
        print(f"  ✓ Meta saved: {out_path}")

    # ── Interactive viewer ─────────────────────────────────────────────────
    if view or save_screenshot:
        logger.info("Building visualisation scene...")
        coloured_mesh = _colour_mesh_by_labels(mesh, face_labels)
        margin_spheres = _build_margin_tube(
            np.asarray(mesh.vertices), margin_vertices
        )

        scene_geoms = [coloured_mesh] + margin_spheres
        scene = trimesh.Scene(scene_geoms)

        # Legend
        print("  Colour legend:")
        print("    🟢 Green  → gingival margin curve")
        print("    🩷 Pink   → gingiva region (label 0)")
        print("    ⬜ Ivory  → tooth surface  (label 1)")

        if save_screenshot:
            png = scene.save_image(resolution=(1920, 1080))
            out_path = Path(save_screenshot)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(png)
            print(f"  ✓ Screenshot saved: {out_path}")

        if view:
            print("\n  ℹ  Close the viewer window to exit.\n")
            scene.show(
                caption=f"Gingival Margin — {stl_path.name}",
                background=(0.07, 0.07, 0.12, 1.0),
            )

    return meta


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Test gingival margin detection on a dental STL mesh.\n"
            "\n"
            "Output colours (viewer):\n"
            "  Green → margin curve\n"
            "  Pink  → gingiva (label 0)\n"
            "  Ivory → tooth (label 1)\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("stl", help="Path to input STL file")
    parser.add_argument(
        "--view", action="store_true",
        help="Open interactive 3D viewer"
    )
    parser.add_argument(
        "--save_labels", metavar="PATH",
        help="Save face_labels.npy to this path"
    )
    parser.add_argument(
        "--save_screenshot", metavar="PATH",
        help="Save PNG screenshot to this path"
    )
    parser.add_argument(
        "--save_meta", metavar="PATH",
        help="Save detection meta JSON to this path"
    )
    parser.add_argument(
        "--curv_pct", type=float, default=70.0,
        help="Curvature percentile threshold (default: 70)"
    )
    parser.add_argument(
        "--valley_pct", type=float, default=75.0,
        help="Valley score percentile threshold (default: 75)"
    )
    parser.add_argument(
        "--curvature_k", type=int, default=20,
        help="KNN size for curvature estimation (default: 20)"
    )
    parser.add_argument(
        "--valley_thresh", type=float, default=0.0,
        help="Dihedral angle concavity threshold (default: 0.0)"
    )
    parser.add_argument(
        "--smooth_iters", type=int, default=2,
        help="Laplacian smoothing iterations for margin mask (default: 2)"
    )
    parser.add_argument(
        "--min_component", type=int, default=10,
        help="Minimum component size to keep (default: 10)"
    )
    parser.add_argument(
        "--no_flood_fill", action="store_true",
        help="Use simple projection instead of BFS flood fill for classification"
    )
    parser.add_argument(
        "--log_level", default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    return parser.parse_args()


# Optional type hint import
from typing import Optional   # noqa: E402  (after imports)


def main() -> None:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    run_test(
        stl_path=args.stl,
        view=args.view,
        save_labels=args.save_labels,
        save_screenshot=args.save_screenshot,
        save_meta=args.save_meta,
        curv_pct=args.curv_pct,
        valley_pct=args.valley_pct,
        curvature_k=args.curvature_k,
        valley_thresh=args.valley_thresh,
        smooth_iters=args.smooth_iters,
        min_component=args.min_component,
        use_flood_fill=not args.no_flood_fill,
    )


if __name__ == "__main__":
    main()
