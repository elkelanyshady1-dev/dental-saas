"""
test_arch_curve.py — Integration test for dental arch curve detection.

Tests the full pipeline:
    1. Generates (or loads) a synthetic dental arch point cloud
    2. Extracts tooth centroids
    3. Fits maxillary + mandibular arch splines
    4. Computes orthodontic measurements
    5. Renders visualisation to PNG
    6. Prints structured results

Usage
-----
    python -m meshnet.tests.test_arch_curve
    python -m meshnet.tests.test_arch_curve --case datasets/synthetic_cases/case_001
    python -m meshnet.tests.test_arch_curve --save_plot output/arch.png
    python -m meshnet.tests.test_arch_curve --show   # interactive window

Dependencies
------------
    numpy, scipy, matplotlib (all in requirements.txt)
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import numpy as np

# — ensure project root is on path ————————————————————————————————————————
_ENGINE_ROOT = Path(__file__).resolve().parents[2]  # python-ai-engine/
sys.path.insert(0, str(_ENGINE_ROOT))

from meshnet.arch_analysis.arch_detection import (
    ArchDetectionResult,
    detect_arch_curve,
    detect_arch_from_case_dir,
)
from meshnet.arch_analysis.arch_measurements import compute_case_measurements
from meshnet.arch_analysis.arch_visualization import plot_arch_curve, render_arch_to_png

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("test_arch_curve")


# ─────────────────────────────────────────────────────────────────────────────
# Synthetic data generator
# ─────────────────────────────────────────────────────────────────────────────

def _make_synthetic_arch(
    n_teeth_per_arch: int = 14,
    n_points: int = 8000,
    noise_mm: float = 0.3,
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Generate a synthetic dental arch point cloud with FDI labels.

    Creates two parabolic arches (maxillary + mandibular) with tooth
    clusters around each centroid position.

    Returns
    -------
    points : (N, 3) float32
    labels : (N,)   int64
    """
    rng = np.random.default_rng(seed)

    # FDI labels for each arch
    max_labels_fdi  = list(range(11, 19)) + list(range(21, 29))  # 16 teeth
    mand_labels_fdi = list(range(41, 49)) + list(range(31, 39))  # 16 teeth

    # Use only first n_teeth_per_arch
    max_labels_fdi  = max_labels_fdi[:n_teeth_per_arch]
    mand_labels_fdi = mand_labels_fdi[:n_teeth_per_arch]

    def parabola_arch(n_teeth, x_span=60.0, depth=25.0, z_base=0.0):
        """Generate tooth centroid positions along a parabolic arch."""
        t = np.linspace(-1, 1, n_teeth)
        x = t * (x_span / 2)
        y = depth * (1 - t**2)     # parabola: deepest at midline
        z = np.full(n_teeth, z_base)
        return np.column_stack([x, y, z])

    max_centroids  = parabola_arch(n_teeth_per_arch, z_base=2.0)   # slightly elevated
    mand_centroids = parabola_arch(n_teeth_per_arch, depth=22.0, z_base=0.0)

    all_points = []
    all_labels = []

    pts_per_tooth = n_points // (n_teeth_per_arch * 2 + 1)

    for i, (c, lbl) in enumerate(zip(max_centroids, max_labels_fdi)):
        n = pts_per_tooth
        cluster = c + rng.normal(0, noise_mm + 1.5, (n, 3))
        cluster[:, 2] += rng.uniform(0, 3.0, n)  # vertical spread
        all_points.append(cluster)
        all_labels.append(np.full(n, lbl, dtype=np.int64))

    for i, (c, lbl) in enumerate(zip(mand_centroids, mand_labels_fdi)):
        n = pts_per_tooth
        cluster = c + rng.normal(0, noise_mm + 1.5, (n, 3))
        all_points.append(cluster)
        all_labels.append(np.full(n, lbl, dtype=np.int64))

    # Background gingiva (class 0)
    n_gingiva = n_points - len(all_points) * pts_per_tooth
    if n_gingiva > 0:
        gin_pts = rng.uniform(-35, 35, (n_gingiva, 3))
        gin_pts[:, 2] = rng.uniform(-1, 1, n_gingiva)
        all_points.append(gin_pts)
        all_labels.append(np.zeros(n_gingiva, dtype=np.int64))

    points = np.concatenate(all_points, axis=0).astype(np.float32)
    labels = np.concatenate(all_labels, axis=0).astype(np.int64)

    # Shuffle
    idx = rng.permutation(len(points))
    return points[idx], labels[idx]


# ─────────────────────────────────────────────────────────────────────────────
# Test runner
# ─────────────────────────────────────────────────────────────────────────────

def run_test(
    case_dir: str | None = None,
    save_plot: str | None = None,
    show: bool = False,
    num_classes: int = 33,
    verbose: bool = True,
) -> ArchDetectionResult:
    """
    Run the arch detection pipeline and print results.

    Parameters
    ----------
    case_dir  : load real case; None → use synthetic data
    save_plot : path to save PNG; None → skip
    show      : open interactive matplotlib window
    """
    logger.info("=" * 60)
    logger.info("  Dental Arch Curve Detection — Test")
    logger.info("=" * 60)

    # ── Load or generate data ─────────────────────────────────────────────
    if case_dir is not None:
        logger.info("Loading case: %s", case_dir)
        result = detect_arch_from_case_dir(case_dir, num_classes=num_classes)
    else:
        logger.info("Generating synthetic arch (FDI labels)...")
        points, labels = _make_synthetic_arch(n_teeth_per_arch=14, n_points=10_000)
        unique_labs = np.unique(labels)
        logger.info(
            "Synthetic data: %d points, %d classes, labels=%s",
            len(points), len(unique_labs), unique_labs[:8].tolist(),
        )
        result = detect_arch_curve(
            points, labels,
            num_classes=num_classes,
            n_curve_points=300,
        )

    # ── Print detection summary ───────────────────────────────────────────
    print(f"\n{'─' * 55}")
    print(f"  ARCH DETECTION RESULTS")
    print(f"{'─' * 55}")
    print(f"  Success       : {result.success}")
    print(f"  Elapsed       : {result.elapsed_s:.3f} s")
    if result.error:
        print(f"  Error         : {result.error}")
        return result

    valid_count = int(result.centroids_valid.sum())
    print(f"  Teeth found   : {valid_count}")
    print(f"  Occlusal n    : {np.round(result.occlusal_normal, 3)}")

    if result.maxillary:
        m = result.maxillary
        print(f"\n  MAX ARCH")
        print(f"    Teeth        : {len(m.sorted_labels)}")
        print(f"    Fit residual : {m.fit_residual:.3f} mm")
        print(f"    Curve points : {m.n_points}")

    if result.mandibular:
        m = result.mandibular
        print(f"\n  MAND ARCH")
        print(f"    Teeth        : {len(m.sorted_labels)}")
        print(f"    Fit residual : {m.fit_residual:.3f} mm")
        print(f"    Curve points : {m.n_points}")

    # ── Compute measurements ──────────────────────────────────────────────
    meas = compute_case_measurements(
        result.maxillary,
        result.mandibular,
        result.centroids_3d,
        result.centroids_valid,
    )

    print(f"\n{'─' * 55}")
    print(f"  ARCH MEASUREMENTS")
    print(f"{'─' * 55}")

    for arch_type, m in meas.items():
        if m is None:
            continue
        print(f"\n  [{arch_type.upper()}]")
        print(f"    Arch length        : {_fmt(m.arch_length_mm)} mm")
        print(f"    Intercanine width  : {_fmt(m.intercanine_width_mm)} mm")
        print(f"    Intermolar width   : {_fmt(m.intermolar_width_mm)} mm")
        print(f"    Curve of Spee      : {_fmt(m.curve_of_spee_depth_mm)} mm")
        print(f"    Anterior depth     : {_fmt(m.anterior_arch_depth_mm)} mm")
        print(f"    Symmetry index     : {_fmt(m.symmetry_index)}")
        print(f"    Crowding index     : {_fmt(m.crowding_index)} mm")
        if m.bolton_ratio:
            print(f"    Bolton ratio       : {m.bolton_ratio:.3f}")
        if m.notes:
            for note in m.notes:
                print(f"    ⚠ {note}")

    # ── Visualise ─────────────────────────────────────────────────────────
    print(f"\n{'─' * 55}")
    print(f"  VISUALISATION")
    print(f"{'─' * 55}")

    if save_plot:
        path = render_arch_to_png(
            max_spline=result.maxillary,
            mand_spline=result.mandibular,
            output_path=save_plot,
            case_id=case_dir or "synthetic",
        )
        print(f"  Plot saved: {path}")
    else:
        print("  (No --save_plot path specified — skipping PNG)")

    if show:
        try:
            import matplotlib
            matplotlib.use("TkAgg")
            import matplotlib.pyplot as plt
            from meshnet.arch_analysis.arch_visualization import plot_arch_curve
            fig = plot_arch_curve(
                max_spline=result.maxillary,
                mand_spline=result.mandibular,
                title="Dental Arch Curve — Interactive",
                output_path=None,
            )
            plt.show()
        except Exception as e:
            logger.warning("Interactive display failed: %s", e)

    print(f"\n{'=' * 55}")
    print(f"  Test complete ✓")
    print(f"{'=' * 55}\n")

    return result


def _fmt(v) -> str:
    if v is None:
        return "N/A"
    return f"{v:.2f}"


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Test dental arch curve detection pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Synthetic data test
    python -m meshnet.tests.test_arch_curve

    # Load real case
    python -m meshnet.tests.test_arch_curve --case datasets/synthetic_cases/case_001

    # Save visualisation
    python -m meshnet.tests.test_arch_curve --save_plot output/arch_curve.png

    # Interactive window
    python -m meshnet.tests.test_arch_curve --show
""",
    )
    p.add_argument("--case",       type=str, default=None,
                   help="Path to case directory (points.npy + tooth_labels.npy)")
    p.add_argument("--save_plot",  type=str, default=None,
                   help="Save arch curve plot to this PNG path")
    p.add_argument("--show",       action="store_true",
                   help="Open interactive matplotlib window")
    p.add_argument("--num_classes", type=int, default=33,
                   help="Number of tooth classes (default: 33)")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    result = run_test(
        case_dir=args.case,
        save_plot=args.save_plot,
        show=args.show,
        num_classes=args.num_classes,
    )
    sys.exit(0 if result.success else 1)
