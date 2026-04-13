"""
align_teeth_icp.py — Open3D ICP alignment for 3Shape-exported segmented teeth.

3Shape CAD software exports segmented teeth in a **spread layout** where each
tooth mesh is displaced from the arch.  This module aligns each tooth mesh
back onto the raw arch scan using point-to-plane ICP registration.

Pipeline
--------
    3Shape export
       ↓  raw_scan.stl + segmented teeth/tooth_XX.stl
       ↓  Open3D ICP alignment (point-to-plane)
       ↓  aligned tooth meshes
       ↓  point sampling + KDTree label assignment
       ↓  points.npy + labels.npy

Performance targets
-------------------
    Single tooth alignment : < 0.3 s
    Full case (28+ teeth)  : < 10 s

Dependencies
------------
    open3d   >= 0.17    — ICP registration + mesh I/O
    numpy    >= 1.24
    tqdm     >= 4.65    — progress bars
    trimesh  >= 3.21    — optional fallback for STL I/O

Usage
-----
    # Single tooth
    from dataset.align_teeth_icp import align_tooth_to_arch
    result = align_tooth_to_arch(
        tooth_mesh_path="segmentation/maxillary/tooth_11.stl",
        arch_mesh_path="raw/maxillary_scan.stl",
        output_path="aligned_teeth/tooth_11.stl",
    )

    # Full case
    from dataset.align_teeth_icp import align_case_teeth
    results = align_case_teeth("dataset/raw_cases/case001")

    # CLI
    python -m dataset.align_teeth_icp --case dataset/raw_cases/case001
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Open3D lazy import — fail gracefully with a clear message
# ---------------------------------------------------------------------------
_O3D_AVAILABLE = False
try:
    import open3d as o3d
    _O3D_AVAILABLE = True
except ImportError:
    o3d = None  # type: ignore[assignment]

_TRIMESH_AVAILABLE = False
try:
    import trimesh
    _TRIMESH_AVAILABLE = True
except ImportError:
    trimesh = None  # type: ignore[assignment]


def _require_open3d() -> None:
    """Raise ImportError with install instructions if Open3D is missing."""
    if not _O3D_AVAILABLE:
        raise ImportError(
            "open3d is required for ICP alignment. "
            "Install it with:  pip install open3d>=0.17.0"
        )


# ---------------------------------------------------------------------------
# FDI numbering constants
# ---------------------------------------------------------------------------
FDI_MAXILLARY = list(range(11, 19)) + list(range(21, 29))  # 11–18, 21–28
FDI_MANDIBULAR = list(range(31, 39)) + list(range(41, 49))  # 31–38, 41–48
FDI_ALL = FDI_MAXILLARY + FDI_MANDIBULAR

# Regex to extract FDI number from filename: tooth_11.stl, Tooth12.stl, 11.stl
_FDI_RE = re.compile(r"(?:tooth[_\s-]?)?(\d{2})\.stl$", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class AlignmentResult:
    """Result of a single tooth ICP alignment."""

    tooth_id: int                   # FDI number (11–48)
    source_path: str                # input tooth STL
    output_path: str                # aligned output STL
    fitness: float = 0.0            # ICP fitness (0–1, higher = better)
    inlier_rmse: float = 0.0       # RMS error of inlier correspondences (mm)
    elapsed_s: float = 0.0         # wall-clock time (seconds)
    converged: bool = True          # ICP converged within max iterations
    error: Optional[str] = None     # error message if alignment failed
    transformation: list = field(default_factory=list)  # 4×4 matrix (flat)

    @property
    def success(self) -> bool:
        return self.error is None and self.fitness > 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class CaseAlignmentReport:
    """Summary of all tooth alignments for a case."""

    case_id: str
    arch_types: List[str]           # ['maxillary', 'mandibular']
    total_teeth: int = 0
    aligned_teeth: int = 0
    failed_teeth: int = 0
    mean_fitness: float = 0.0
    mean_rmse: float = 0.0
    total_elapsed_s: float = 0.0
    results: List[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Core ICP alignment — single tooth
# ---------------------------------------------------------------------------

def align_tooth_to_arch(
    tooth_mesh_path: str | Path,
    arch_mesh_path: str | Path,
    output_path: str | Path,
    *,
    arch_sample_points: int = 50_000,
    tooth_sample_points: int = 5_000,
    voxel_size: float = 0.5,
    icp_threshold: float = 2.0,
    max_iterations: int = 100,
    debug: bool = False,
) -> AlignmentResult:
    """
    Align a single segmented tooth mesh to the arch scan using ICP.

    Parameters
    ----------
    tooth_mesh_path : path
        Path to the tooth STL file (3Shape export, possibly displaced).
    arch_mesh_path : path
        Path to the arch scan STL file (raw scan, ground truth position).
    output_path : path
        Where to save the aligned tooth STL.
    arch_sample_points : int
        Number of points to sample from the arch scan (default 50k).
    tooth_sample_points : int
        Number of points to sample from the tooth mesh (default 5k).
    voxel_size : float
        Voxel size for downsampling (mm). Default 0.5 mm.
    icp_threshold : float
        Max correspondence distance for ICP (mm). Default 2.0 mm.
    max_iterations : int
        Maximum ICP iterations. Default 100.
    debug : bool
        If True, visualise arch + aligned tooth using Open3D.

    Returns
    -------
    AlignmentResult
        Fitness, RMSE, timing, and transformation matrix.
    """
    _require_open3d()

    tooth_mesh_path = Path(tooth_mesh_path)
    arch_mesh_path = Path(arch_mesh_path)
    output_path = Path(output_path)

    # Extract FDI number from filename
    fdi_match = _FDI_RE.search(tooth_mesh_path.name)
    tooth_id = int(fdi_match.group(1)) if fdi_match else 0

    result = AlignmentResult(
        tooth_id=tooth_id,
        source_path=str(tooth_mesh_path),
        output_path=str(output_path),
    )

    t0 = time.perf_counter()

    try:
        # ── 1. Load meshes ────────────────────────────────────────────
        logger.info("Loading arch: %s", arch_mesh_path.name)
        arch_mesh = o3d.io.read_triangle_mesh(str(arch_mesh_path))
        if arch_mesh.is_empty():
            raise ValueError(f"Arch mesh is empty: {arch_mesh_path}")

        logger.info("Loading tooth: %s", tooth_mesh_path.name)
        tooth_mesh = o3d.io.read_triangle_mesh(str(tooth_mesh_path))
        if tooth_mesh.is_empty():
            raise ValueError(f"Tooth mesh is empty: {tooth_mesh_path}")

        # ── 2. Sample point clouds ───────────────────────────────────
        arch_pcd = arch_mesh.sample_points_uniformly(
            number_of_points=arch_sample_points
        )
        tooth_pcd = tooth_mesh.sample_points_uniformly(
            number_of_points=tooth_sample_points
        )

        # ── 3. Voxel downsample ──────────────────────────────────────
        arch_down = arch_pcd.voxel_down_sample(voxel_size=voxel_size)
        tooth_down = tooth_pcd.voxel_down_sample(voxel_size=voxel_size)

        # ── 4. Estimate normals ──────────────────────────────────────
        search_param = o3d.geometry.KDTreeSearchParamHybrid(
            radius=voxel_size * 4, max_nn=30
        )
        arch_down.estimate_normals(search_param=search_param)
        tooth_down.estimate_normals(search_param=search_param)

        # Orient normals consistently (outward)
        arch_down.orient_normals_consistent_tangent_plane(k=10)
        tooth_down.orient_normals_consistent_tangent_plane(k=10)

        # ── 5. Compute initial alignment via FPFH features ───────────
        # Use FPFH for coarse registration if tooth is far from arch
        arch_fpfh = o3d.pipelines.registration.compute_fpfh_feature(
            arch_down,
            o3d.geometry.KDTreeSearchParamHybrid(
                radius=voxel_size * 10, max_nn=100
            ),
        )
        tooth_fpfh = o3d.pipelines.registration.compute_fpfh_feature(
            tooth_down,
            o3d.geometry.KDTreeSearchParamHybrid(
                radius=voxel_size * 10, max_nn=100
            ),
        )

        # RANSAC global registration for initial pose
        ransac_result = (
            o3d.pipelines.registration.registration_ransac_based_on_feature_matching(
                tooth_down,
                arch_down,
                tooth_fpfh,
                arch_fpfh,
                mutual_filter=True,
                max_correspondence_distance=voxel_size * 3,
                estimation_method=o3d.pipelines.registration.TransformationEstimationPointToPoint(),
                ransac_n=4,
                checkers=[
                    o3d.pipelines.registration.CorrespondenceCheckerBasedOnEdgeLength(
                        0.9
                    ),
                    o3d.pipelines.registration.CorrespondenceCheckerBasedOnDistance(
                        voxel_size * 3
                    ),
                ],
                criteria=o3d.pipelines.registration.RANSACConvergenceCriteria(
                    max_iteration=100_000, confidence=0.999
                ),
            )
        )

        init_transform = ransac_result.transformation
        logger.debug(
            "RANSAC initial fitness: %.4f  RMSE: %.4f",
            ransac_result.fitness, ransac_result.inlier_rmse,
        )

        # ── 6. Point-to-plane ICP refinement ─────────────────────────
        icp_result = o3d.pipelines.registration.registration_icp(
            tooth_down,
            arch_down,
            max_correspondence_distance=icp_threshold,
            init=init_transform,
            estimation_method=(
                o3d.pipelines.registration.TransformationEstimationPointToPlane()
            ),
            criteria=o3d.pipelines.registration.ICPConvergenceCriteria(
                max_iteration=max_iterations,
                relative_fitness=1e-7,
                relative_rmse=1e-7,
            ),
        )

        result.fitness = float(icp_result.fitness)
        result.inlier_rmse = float(icp_result.inlier_rmse)
        result.converged = icp_result.fitness > 0.0
        result.transformation = icp_result.transformation.flatten().tolist()

        logger.info(
            "  ICP result — fitness: %.4f  RMSE: %.4f mm  converged: %s",
            result.fitness, result.inlier_rmse, result.converged,
        )

        # ── 7. Apply transformation to the ORIGINAL mesh ────────────
        tooth_mesh.transform(icp_result.transformation)

        # ── 8. Save aligned mesh ─────────────────────────────────────
        output_path.parent.mkdir(parents=True, exist_ok=True)
        o3d.io.write_triangle_mesh(str(output_path), tooth_mesh)
        logger.info("  Saved aligned mesh: %s", output_path)

        # ── 9. Optional debug visualisation ──────────────────────────
        if debug:
            _visualise_alignment(arch_mesh, tooth_mesh, tooth_mesh_path.name)

    except Exception as exc:
        result.error = str(exc)
        logger.error("  Alignment FAILED for %s: %s", tooth_mesh_path.name, exc)

    result.elapsed_s = round(time.perf_counter() - t0, 4)
    return result


# ---------------------------------------------------------------------------
# Batch alignment — full case
# ---------------------------------------------------------------------------

def align_case_teeth(
    case_folder: str | Path,
    *,
    arch_sample_points: int = 50_000,
    tooth_sample_points: int = 5_000,
    voxel_size: float = 0.5,
    icp_threshold: float = 2.0,
    max_iterations: int = 100,
    overwrite: bool = False,
    debug: bool = False,
    progress: bool = True,
) -> CaseAlignmentReport:
    """
    Align ALL segmented teeth in a case folder to the arch scan.

    Expected directory structure::

        case_folder/
            raw/
                maxillary_scan.stl
                mandibular_scan.stl
            segmentation/
                maxillary/
                    tooth_11.stl
                    tooth_12.stl
                    ...
                mandibular/
                    tooth_31.stl
                    tooth_32.stl
                    ...

    Output::

        case_folder/
            aligned_teeth/
                tooth_11.stl
                tooth_12.stl
                tooth_31.stl
                ...
            alignment_report.json

    Parameters
    ----------
    case_folder : path
        Root directory of the case.
    overwrite : bool
        Re-align teeth even if aligned_teeth/ already exists.
    debug : bool
        Visualise each alignment in Open3D.
    progress : bool
        Show tqdm progress bar.

    Returns
    -------
    CaseAlignmentReport
        Aggregate statistics for all tooth alignments.
    """
    _require_open3d()

    case_folder = Path(case_folder)
    case_id = case_folder.name

    logger.info("=" * 60)
    logger.info("  Aligning case: %s", case_id)
    logger.info("=" * 60)

    report = CaseAlignmentReport(case_id=case_id, arch_types=[])
    t_case_start = time.perf_counter()

    # ── Discover arch scans ──────────────────────────────────────────────
    raw_dir = case_folder / "raw"
    seg_dir = case_folder / "segmentation"
    aligned_dir = case_folder / "aligned_teeth"

    if not raw_dir.exists():
        logger.error("  raw/ directory not found in %s", case_folder)
        return report
    if not seg_dir.exists():
        logger.error("  segmentation/ directory not found in %s", case_folder)
        return report

    # Collect (arch_type, arch_path, seg_subdir) tuples
    arch_configs: List[Tuple[str, Path, Path]] = []
    for arch_type in ("maxillary", "mandibular"):
        arch_path = raw_dir / f"{arch_type}_scan.stl"
        if not arch_path.exists():
            # Try alternate naming: maxillary.stl
            arch_path = raw_dir / f"{arch_type}.stl"
        if not arch_path.exists():
            logger.warning("  Arch scan not found: %s", arch_type)
            continue

        seg_subdir = seg_dir / arch_type
        if not seg_subdir.exists():
            logger.warning("  Segmentation dir not found: %s", seg_subdir)
            continue

        arch_configs.append((arch_type, arch_path, seg_subdir))
        report.arch_types.append(arch_type)

    if not arch_configs:
        logger.error("  No arch + segmentation pairs found. Abort.")
        return report

    # ── Collect all tooth STL files ──────────────────────────────────────
    tooth_jobs: List[Tuple[str, Path, Path, Path]] = []  # (arch_type, arch_path, tooth_path, out_path)
    for arch_type, arch_path, seg_subdir in arch_configs:
        stl_files = sorted(
            list(seg_subdir.glob("*.stl")) + list(seg_subdir.glob("*.STL"))
        )
        for tooth_stl in stl_files:
            out_path = aligned_dir / tooth_stl.name
            if not overwrite and out_path.exists():
                logger.debug("  Skipping %s (already aligned)", tooth_stl.name)
                continue
            tooth_jobs.append((arch_type, arch_path, tooth_stl, out_path))

    report.total_teeth = len(tooth_jobs)
    if not tooth_jobs:
        logger.info("  All teeth already aligned (or none found).")
        return report

    logger.info("  Found %d teeth to align across %d arches",
                len(tooth_jobs), len(arch_configs))

    # ── Pre-load arch point clouds (cache per arch) ──────────────────────
    #    This avoids re-loading the arch for every tooth
    arch_cache: Dict[str, "o3d.geometry.TriangleMesh"] = {}

    # ── Run alignments ───────────────────────────────────────────────────
    iterator = tooth_jobs
    if progress:
        try:
            from tqdm import tqdm
            iterator = tqdm(tooth_jobs, desc="Aligning teeth", unit="tooth")
        except ImportError:
            pass

    fitness_values = []
    rmse_values = []

    for arch_type, arch_path, tooth_stl, out_path in iterator:
        result = align_tooth_to_arch(
            tooth_mesh_path=tooth_stl,
            arch_mesh_path=arch_path,
            output_path=out_path,
            arch_sample_points=arch_sample_points,
            tooth_sample_points=tooth_sample_points,
            voxel_size=voxel_size,
            icp_threshold=icp_threshold,
            max_iterations=max_iterations,
            debug=debug,
        )

        report.results.append(result.to_dict())

        if result.success:
            report.aligned_teeth += 1
            fitness_values.append(result.fitness)
            rmse_values.append(result.inlier_rmse)
        else:
            report.failed_teeth += 1

        # Update progress bar description
        if progress and hasattr(iterator, "set_postfix"):
            iterator.set_postfix(  # type: ignore[union-attr]
                fitness=f"{result.fitness:.3f}",
                rmse=f"{result.inlier_rmse:.3f}",
            )

    # ── Summary ──────────────────────────────────────────────────────────
    report.total_elapsed_s = round(time.perf_counter() - t_case_start, 2)
    if fitness_values:
        report.mean_fitness = round(float(np.mean(fitness_values)), 4)
        report.mean_rmse = round(float(np.mean(rmse_values)), 4)

    # Save report JSON alongside aligned teeth
    report_path = case_folder / "alignment_report.json"
    report_path.write_text(
        json.dumps(report.to_dict(), indent=2), encoding="utf-8"
    )
    logger.info("  Report saved: %s", report_path)

    logger.info(
        "\n  Case %s alignment complete:\n"
        "    Aligned : %d / %d teeth\n"
        "    Failed  : %d\n"
        "    Fitness : %.4f (mean)\n"
        "    RMSE    : %.4f mm (mean)\n"
        "    Time    : %.2f s",
        case_id,
        report.aligned_teeth, report.total_teeth,
        report.failed_teeth,
        report.mean_fitness, report.mean_rmse,
        report.total_elapsed_s,
    )

    return report


# ---------------------------------------------------------------------------
# Debug visualisation
# ---------------------------------------------------------------------------

def _visualise_alignment(
    arch_mesh: "o3d.geometry.TriangleMesh",
    aligned_tooth_mesh: "o3d.geometry.TriangleMesh",
    title: str = "ICP Alignment",
) -> None:
    """
    Open an Open3D visualiser showing the arch (grey) and aligned tooth (green).

    Only works in environments with a display. Skipped silently in headless mode.
    """
    try:
        # Colour arch light grey
        arch_vis = o3d.geometry.TriangleMesh(arch_mesh)
        arch_vis.paint_uniform_color([0.8, 0.82, 0.85])
        arch_vis.compute_vertex_normals()

        # Colour aligned tooth green
        tooth_vis = o3d.geometry.TriangleMesh(aligned_tooth_mesh)
        tooth_vis.paint_uniform_color([0.2, 0.85, 0.4])
        tooth_vis.compute_vertex_normals()

        o3d.visualization.draw_geometries(
            [arch_vis, tooth_vis],
            window_name=f"ICP Alignment: {title}",
            width=1200,
            height=800,
        )
    except Exception as e:
        logger.warning("Visualisation failed (headless?): %s", e)


# ---------------------------------------------------------------------------
# Utility: create raw_cases directory scaffold
# ---------------------------------------------------------------------------

def create_case_scaffold(
    case_folder: str | Path,
    arch_types: List[str] | None = None,
) -> None:
    """
    Create the expected directory structure for a new case.

    Creates::

        case_folder/
            raw/
            segmentation/
                maxillary/
                mandibular/
            aligned_teeth/
            processed/
    """
    case_folder = Path(case_folder)
    arch_types = arch_types or ["maxillary", "mandibular"]

    (case_folder / "raw").mkdir(parents=True, exist_ok=True)
    for arch in arch_types:
        (case_folder / "segmentation" / arch).mkdir(parents=True, exist_ok=True)
    (case_folder / "aligned_teeth").mkdir(parents=True, exist_ok=True)
    (case_folder / "processed").mkdir(parents=True, exist_ok=True)

    logger.info("Case scaffold created: %s", case_folder)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Align 3Shape-exported segmented teeth to the arch scan using "
            "Open3D point-to-plane ICP registration."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Example:
    python -m dataset.align_teeth_icp --case dataset/raw_cases/case001

    # With debug visualisation
    python -m dataset.align_teeth_icp --case dataset/raw_cases/case001 --debug

    # Create scaffold for a new case
    python -m dataset.align_teeth_icp --scaffold dataset/raw_cases/case002

Directory structure expected:
    case_folder/
        raw/
            maxillary_scan.stl
            mandibular_scan.stl
        segmentation/
            maxillary/
                tooth_11.stl  tooth_12.stl  ...
            mandibular/
                tooth_31.stl  tooth_32.stl  ...
""",
    )
    parser.add_argument(
        "--case", type=str,
        help="Path to case folder to align",
    )
    parser.add_argument(
        "--scaffold", type=str,
        help="Create directory scaffold at this path (no alignment)",
    )
    parser.add_argument(
        "--arch_samples", type=int, default=50_000,
        help="Arch point cloud sample count (default: 50000)",
    )
    parser.add_argument(
        "--tooth_samples", type=int, default=5_000,
        help="Tooth point cloud sample count (default: 5000)",
    )
    parser.add_argument(
        "--voxel_size", type=float, default=0.5,
        help="Voxel downsample size in mm (default: 0.5)",
    )
    parser.add_argument(
        "--icp_threshold", type=float, default=2.0,
        help="ICP max correspondence distance in mm (default: 2.0)",
    )
    parser.add_argument(
        "--max_iter", type=int, default=100,
        help="ICP max iterations (default: 100)",
    )
    parser.add_argument(
        "--overwrite", action="store_true",
        help="Re-align teeth even if aligned_teeth/ already has them",
    )
    parser.add_argument(
        "--debug", action="store_true",
        help="Visualise each alignment in Open3D viewer",
    )
    parser.add_argument(
        "--no_progress", action="store_true",
        help="Disable tqdm progress bar",
    )
    return parser.parse_args()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    args = _parse_args()

    if args.scaffold:
        create_case_scaffold(args.scaffold)
        return

    if not args.case:
        logger.error("Must specify --case or --scaffold. Use --help for usage.")
        sys.exit(1)

    case_path = Path(args.case)
    if not case_path.exists():
        logger.error("Case folder does not exist: %s", case_path)
        sys.exit(1)

    report = align_case_teeth(
        case_path,
        arch_sample_points=args.arch_samples,
        tooth_sample_points=args.tooth_samples,
        voxel_size=args.voxel_size,
        icp_threshold=args.icp_threshold,
        max_iterations=args.max_iter,
        overwrite=args.overwrite,
        debug=args.debug,
        progress=not args.no_progress,
    )

    # Print summary
    print(f"\n{'=' * 60}")
    print(f"  Case: {report.case_id}")
    print(f"  Teeth: {report.aligned_teeth}/{report.total_teeth} aligned")
    if report.failed_teeth > 0:
        print(f"  Failed: {report.failed_teeth}")
    print(f"  Mean fitness: {report.mean_fitness:.4f}")
    print(f"  Mean RMSE: {report.mean_rmse:.4f} mm")
    print(f"  Time: {report.total_elapsed_s:.2f} s")
    print(f"{'=' * 60}")

    if report.failed_teeth > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
