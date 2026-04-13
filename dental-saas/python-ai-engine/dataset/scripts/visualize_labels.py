"""
visualize_labels.py — Interactive 3-D label & boundary visualiser.

Renders a processed dataset sample using trimesh's built-in viewer.

Colour scheme
-------------
    Gingiva (label 0)  →  pink  (#FF9EBA)
    Teeth (labels 1–32) → HSV-distributed palette per tooth index
    Boundary points     →  red   (#FF2244) when --boundary flag is set

Usage
-----
    # View segmentation labels
    python -m dataset.scripts.visualize_labels case001 \\
        --dataset_dir ./datasets/cases

    # View ONLY boundary points (overlay on full cloud)
    python -m dataset.scripts.visualize_labels case001 \\
        --dataset_dir ./datasets/cases \\
        --boundary

    # Save screenshot instead of opening interactive viewer
    python -m dataset.scripts.visualize_labels case001 \\
        --dataset_dir ./datasets/cases \\
        --save ./screenshots/case001.png

Validation checklist (post-sampling)
--------------------------------------
    ✓ Boundary points cluster along tooth borders (not scattered uniformly)
    ✓ High-curvature points land on cusps, ridges, interproximal zones
    ✓ Gingival margin is well-represented in boundary pool

Dependencies
------------
    trimesh       ≥ 3.21   (viewer uses pyglet backend)
    numpy         ≥ 1.24
    scipy         ≥ 1.10   (for boundary/curvature on-the-fly)
    matplotlib    ≥ 3.7    (for colour palette; optional, falls back to HSV)
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Optional

import numpy as np

# ── Trimesh — required for 3-D rendering ──────────────────────────────────
try:
    import trimesh
    import trimesh.points
    TRIMESH_AVAILABLE = True
except ImportError:
    TRIMESH_AVAILABLE = False

logger = logging.getLogger(__name__)

# ── Matplotlib palette ─────────────────────────────────────────────────────
try:
    import matplotlib.cm as cm
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False


# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------

# Clinically intuitive base colours
GINGIVA_COLOUR = np.array([255, 158, 186, 255], dtype=np.uint8)   # soft pink
BOUNDARY_COLOUR = np.array([255, 34, 68, 255], dtype=np.uint8)    # vivid red
BACKGROUND_COLOUR = (0.07, 0.07, 0.12, 1.0)                       # near-black


def _tooth_colour(tooth_idx: int, total_teeth: int = 32) -> np.ndarray:
    """
    Generate a visually distinct HSV colour for tooth index ``tooth_idx``,
    cycling through the full hue wheel.

    Returns RGBA uint8 array of shape (4,).
    """
    if MATPLOTLIB_AVAILABLE:
        # Use a perceptually uniform colourmap (tab20 for up to 20 classes,
        # then wrap around with a saturation shift)
        cmap = cm.get_cmap("tab20", 20)
        r, g, b, _ = cmap(tooth_idx % 20)
    else:
        # Simple HSV fallback
        hue = (tooth_idx / max(total_teeth, 1)) % 1.0
        r, g, b = _hsv_to_rgb(hue, 0.85, 0.90)

    return np.array([r * 255, g * 255, b * 255, 255], dtype=np.uint8)


def _hsv_to_rgb(h: float, s: float, v: float):
    """Minimal HSV→RGB without importing colorsys."""
    i = int(h * 6)
    f = h * 6 - i
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    table = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]
    return table[i % 6]


def build_label_colours(labels: np.ndarray) -> np.ndarray:
    """
    Return an (N, 4) RGBA colour array: pink for gingiva, distinct hue per tooth.
    """
    N = len(labels)
    colours = np.zeros((N, 4), dtype=np.uint8)
    unique_labels = np.unique(labels)

    for lbl in unique_labels:
        mask = labels == lbl
        if lbl == 0:
            colours[mask] = GINGIVA_COLOUR
        else:
            colours[mask] = _tooth_colour(int(lbl))

    return colours


def overlay_boundary_colours(
    colours: np.ndarray,
    boundary_mask: np.ndarray,
) -> np.ndarray:
    """
    Paint boundary points bright red on an existing colour array.

    Parameters
    ----------
    colours       : (N, 4) RGBA uint8
    boundary_mask : (N,) bool

    Returns
    -------
    Updated colours array (in-place).
    """
    colours = colours.copy()
    colours[boundary_mask] = BOUNDARY_COLOUR
    return colours


# ---------------------------------------------------------------------------
# Loading helpers
# ---------------------------------------------------------------------------

def load_sample(case_dir: Path) -> dict:
    """
    Load a dataset sample directory.

    Returns dict with keys:
        points, labels, meta (optional)
    """
    if not (case_dir / "points.npy").exists():
        raise FileNotFoundError(f"points.npy not found in {case_dir}")
    if not (case_dir / "tooth_labels.npy").exists():
        raise FileNotFoundError(f"tooth_labels.npy not found in {case_dir}")

    points = np.load(case_dir / "points.npy").astype(np.float32)
    labels = np.load(case_dir / "tooth_labels.npy").astype(np.int64)

    meta = {}
    meta_path = case_dir / "meta.json"
    if meta_path.exists():
        with open(meta_path) as f:
            meta = json.load(f)

    return {"points": points, "labels": labels, "meta": meta}


# ---------------------------------------------------------------------------
# Boundary/curvature computation for visualisation
# ---------------------------------------------------------------------------

def _compute_boundary_mask(
    points: np.ndarray,
    labels: np.ndarray,
    k: int = 16,
) -> np.ndarray:
    """Run boundary detection (lazy import to avoid heavy import at module level)."""
    from ..geometry.boundary_detection import detect_boundary_points
    return detect_boundary_points(points, labels, k=k)


def _compute_curvature(
    points: np.ndarray,
    k: int = 20,
) -> np.ndarray:
    """Run curvature estimation (lazy import)."""
    from ..geometry.curvature_estimation import estimate_curvature
    return estimate_curvature(points, k=k)


# ---------------------------------------------------------------------------
# Visualisation functions
# ---------------------------------------------------------------------------

def build_point_cloud_scene(
    points: np.ndarray,
    colours: np.ndarray,
    point_size: float = 3.0,
) -> "trimesh.Scene":
    """
    Create a trimesh Scene containing a colour-coded point cloud.
    """
    pc = trimesh.points.PointCloud(
        vertices=points,
        colors=colours,
    )
    scene = trimesh.Scene([pc])
    return scene


def visualize_case(
    case_name: str,
    dataset_dir: Path,
    show_boundary: bool = False,
    show_curvature: bool = False,
    k_boundary: int = 16,
    k_curvature: int = 20,
    save_path: Optional[str] = None,
    point_size: float = 3.0,
) -> None:
    """
    Load and visualise a processed dataset case.

    Parameters
    ----------
    case_name      : str   — name of the case directory
    dataset_dir    : Path  — root dataset directory
    show_boundary  : bool  — overlay boundary points in red
    show_curvature : bool  — colour by curvature magnitude (blue→red)
    k_boundary     : int   — KNN size for on-the-fly boundary detection
    k_curvature    : int   — KNN size for on-the-fly curvature estimation
    save_path      : str   — if set, save PNG screenshot here instead of viewer
    point_size     : float — rendered point size
    """
    if not TRIMESH_AVAILABLE:
        logger.error(
            "trimesh is required for visualisation. "
            "Install it with: pip install trimesh[easy]"
        )
        sys.exit(1)

    case_dir = dataset_dir / case_name
    if not case_dir.exists():
        logger.error("Case directory not found: %s", case_dir)
        sys.exit(1)

    logger.info("Loading case: %s", case_name)
    sample = load_sample(case_dir)
    points = sample["points"]
    labels = sample["labels"]
    meta = sample["meta"]

    # ── Print meta summary ─────────────────────────────────────────────
    print(f"\n{'─'*50}")
    print(f"  Case: {case_name}")
    print(f"  Points: {len(points):,}")
    print(f"  Unique labels: {np.unique(labels).tolist()}")
    if meta:
        print(f"  Boundary points: {meta.get('boundary_points', '?')}")
        print(f"  Curvature points: {meta.get('curvature_points', '?')}")
        print(f"  Uniform points: {meta.get('uniform_points', '?')}")
        print(f"  Boundary detected: {meta.get('boundary_detected', '?')}")
    print(f"{'─'*50}\n")

    # ── Build base colour map ──────────────────────────────────────────
    colours = build_label_colours(labels)

    # ── Curvature overlay ─────────────────────────────────────────────
    if show_curvature:
        logger.info("Computing curvature for visualisation (k=%d)...", k_curvature)
        curvature = _compute_curvature(points, k=k_curvature)

        if MATPLOTLIB_AVAILABLE:
            # Normalise and map to hot colourmap
            curv_norm = (curvature - curvature.min()) / (
                curvature.max() - curvature.min() + 1e-8
            )
            cmap = cm.get_cmap("plasma")
            rgba = (cmap(curv_norm) * 255).astype(np.uint8)
            colours = rgba
        else:
            # Fallback: brighten high-curvature points
            high_curv = curvature > np.percentile(curvature, 70)
            colours[high_curv] = np.array([255, 255, 0, 255], dtype=np.uint8)

        logger.info(
            "Curvature range: min=%.4f max=%.4f mean=%.4f",
            float(curvature.min()), float(curvature.max()), float(curvature.mean()),
        )

    # ── Boundary overlay ──────────────────────────────────────────────
    if show_boundary:
        logger.info(
            "Computing boundary mask for visualisation (k=%d)...", k_boundary
        )
        boundary_mask = _compute_boundary_mask(points, labels, k=k_boundary)
        n_boundary = int(boundary_mask.sum())
        logger.info(
            "Boundary points: %d / %d (%.1f%%)",
            n_boundary, len(points), 100.0 * n_boundary / max(len(points), 1),
        )

        colours = overlay_boundary_colours(colours, boundary_mask)

        print(
            f"  [BOUNDARY MODE]\n"
            f"  🔴 Red   = boundary points ({n_boundary:,})\n"
            f"  🔵 Other = teeth / gingiva\n"
        )

    # ── Build and show scene ───────────────────────────────────────────
    scene = build_point_cloud_scene(points, colours, point_size=point_size)

    title = f"Orthodontic AI — {case_name}"
    if show_boundary:
        title += " [BOUNDARY]"
    if show_curvature:
        title += " [CURVATURE]"

    if save_path:
        png = scene.save_image(resolution=(1920, 1080))
        Path(save_path).parent.mkdir(parents=True, exist_ok=True)
        with open(save_path, "wb") as f:
            f.write(png)
        logger.info("Screenshot saved to %s", save_path)
        print(f"  ✓ Screenshot saved: {save_path}")
    else:
        logger.info("Opening interactive viewer...")
        print("  ℹ  Close the viewer window to exit.\n")
        scene.show(
            caption=title,
            background=BACKGROUND_COLOUR,
        )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Visualise processed dataset cases with boundary / curvature overlays.\n"
            "\n"
            "Colour scheme:\n"
            "  Pink  → gingiva (label 0)\n"
            "  HSV   → individual teeth (labels 1–32)\n"
            "  Red   → boundary points (with --boundary flag)\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "case",
        help="Case name (directory name, e.g. case001)",
    )
    parser.add_argument(
        "--dataset_dir", "-d",
        default="./datasets/cases",
        help="Root dataset directory (default: ./datasets/cases)",
    )
    parser.add_argument(
        "--boundary", "-b",
        action="store_true",
        help="Overlay boundary points in red for validation",
    )
    parser.add_argument(
        "--curvature", "-c",
        action="store_true",
        help="Colour points by curvature magnitude (plasma colourmap)",
    )
    parser.add_argument(
        "--k_boundary", type=int, default=16,
        help="KNN neighbourhood for boundary detection (default: 16)",
    )
    parser.add_argument(
        "--k_curvature", type=int, default=20,
        help="KNN neighbourhood for curvature estimation (default: 20)",
    )
    parser.add_argument(
        "--save", "-s",
        default=None,
        help="Save screenshot to this path instead of showing interactive viewer",
    )
    parser.add_argument(
        "--point_size", type=float, default=3.0,
        help="Rendered point size (default: 3.0)",
    )
    parser.add_argument(
        "--log_level", default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    visualize_case(
        case_name=args.case,
        dataset_dir=Path(args.dataset_dir),
        show_boundary=args.boundary,
        show_curvature=args.curvature,
        k_boundary=args.k_boundary,
        k_curvature=args.k_curvature,
        save_path=args.save,
        point_size=args.point_size,
    )


if __name__ == "__main__":
    main()
