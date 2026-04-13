"""
preprocess_pipeline.py — Full preprocessing pipeline for raw intraoral STL scans.

Orchestrates all preprocessing modules in sequence:

    Stage 0 — Load raw STL (trimesh)
    Stage 1 — ScanTrimmer         → clean floating triangles + artifacts
    Stage 2 — BasePlaneDetector   → fit base plane below gingival margin
    Stage 3 — BaseGenerator       → create flat base geometry
    Stage 4 — MeshFiller          → fill scan → base gap, ensure watertight
    Stage 5 — ModelNormalizer     → align occlusal plane, centre, Z=0
    Stage 6 — Save intermediates + outputs

Outputs per case
----------------
    output_dir/
        trimmed_scan.stl          ← after ScanTrimmer
        base_plane.stl            ← visualisation plane quad (debug)
        scan_with_base.stl        ← scan + base before fill  (debug)
        final_model.stl           ← fully processed printable model
        meta.json                 ← all step metadata + timing

Usage
-----
    pipeline = PreprocessPipeline()
    result = pipeline.run("./raw_cases/case001/scan.stl",
                          output_dir="./raw_cases/case001/")

    if result.success:
        print(f"Saved to: {result.output_stl}")
    else:
        print(f"Failed: {result.error}")

CLI
---
    python -m meshnet.preprocessing.base_creation.preprocess_pipeline \\
        --input  ./raw_cases/ \\
        --output ./raw_cases/ \\
        --workers 4
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

from .scan_trimmer       import ScanTrimmer, TrimStats
from .base_plane_detector import BasePlaneDetector, BasePlane
from .base_generator     import BaseGenerator
from .mesh_filler        import MeshFiller, FillStats
from .model_normalizer   import ModelNormalizer, NormMetadata

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Result container
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class PreprocessResult:
    """Complete result from one preprocessing pipeline run."""
    case_id:      str
    success:      bool
    output_stl:   Optional[str]
    elapsed_s:    float
    error:        Optional[str] = None
    trim_stats:   Optional[Dict] = None
    base_plane:   Optional[Dict] = None
    fill_stats:   Optional[Dict] = None
    norm_meta:    Optional[Dict] = None
    has_base_before: bool = False    # True if scan already had a base
    skipped:          bool = False

    def to_dict(self) -> dict:
        return {
            "case_id":        self.case_id,
            "success":        self.success,
            "output_stl":     self.output_stl,
            "elapsed_s":      round(self.elapsed_s, 3),
            "error":          self.error,
            "trim_stats":     self.trim_stats,
            "base_plane":     self.base_plane,
            "fill_stats":     self.fill_stats,
            "norm_meta":      self.norm_meta,
            "has_base_before": self.has_base_before,
            "skipped":         self.skipped,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Base detection heuristic
# ─────────────────────────────────────────────────────────────────────────────

def detect_base(mesh: "trimesh.Trimesh") -> bool:
    """
    Heuristic: does the scan already have a printable base?

    A scan has a base if:
        • Is (near-)watertight, AND
        • Has a large flat area near the bottom (Z ≤ p10)

    Used by the dataset generator to decide whether to skip preprocessing.
    """
    try:
        if hasattr(mesh, "is_watertight") and not mesh.is_watertight:
            return False

        vertices = np.asarray(mesh.vertices, dtype=np.float32)
        z = vertices[:, 2]
        z_min, z_max = float(z.min()), float(z.max())
        z_thresh = z_min + (z_max - z_min) * 0.05  # lower 5%

        lower_mask = z <= z_thresh
        if lower_mask.sum() < 50:
            return False

        # Check planarity of lower region: std dev Z should be tiny
        lower_z = z[lower_mask]
        z_std = float(lower_z.std())
        arch_height = z_max - z_min
        planarity = z_std / max(arch_height, 1.0)

        # Flat base → planarity < 0.5%
        return planarity < 0.005

    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline
# ─────────────────────────────────────────────────────────────────────────────

class PreprocessPipeline:
    """
    Full preprocessing pipeline for raw intraoral STL scans.

    Parameters
    ----------
    trimmer_config   : dict — kwargs for ScanTrimmer
    detector_config  : dict — kwargs for BasePlaneDetector
    generator_config : dict — kwargs for BaseGenerator
    filler_config    : dict — kwargs for MeshFiller
    normalizer_config: dict — kwargs for ModelNormalizer
    save_intermediates: bool — save debug STL files (default True)
    skip_if_base_present: bool — skip scan if detect_base() returns True
    overwrite        : bool — overwrite existing outputs (default False)
    """

    def __init__(
        self,
        trimmer_config:    Optional[Dict] = None,
        detector_config:   Optional[Dict] = None,
        generator_config:  Optional[Dict] = None,
        filler_config:     Optional[Dict] = None,
        normalizer_config: Optional[Dict] = None,
        save_intermediates: bool = True,
        skip_if_base_present: bool = False,
        overwrite:         bool = False,
    ) -> None:
        self.trimmer    = ScanTrimmer(**(trimmer_config or {}))
        self.detector   = BasePlaneDetector(**(detector_config or {}))
        self.generator  = BaseGenerator(**(generator_config or {}))
        self.filler     = MeshFiller(**(filler_config or {}))
        self.normalizer = ModelNormalizer(**(normalizer_config or {}))
        self.save_intermediates = save_intermediates
        self.skip_if_base_present = skip_if_base_present
        self.overwrite = overwrite

    # ── Public API ─────────────────────────────────────────────────────────

    def run(
        self,
        stl_path: str,
        output_dir: Optional[str] = None,
    ) -> PreprocessResult:
        """
        Run the full preprocessing pipeline on one STL file.

        Parameters
        ----------
        stl_path   : str  — path to raw STL file
        output_dir : str  — directory to save outputs; defaults to STL parent dir

        Returns
        -------
        PreprocessResult
        """
        t0 = time.perf_counter()
        stl_path_ = Path(stl_path)
        case_id   = stl_path_.parent.name or stl_path_.stem

        if output_dir is None:
            out_dir = stl_path_.parent
        else:
            out_dir = Path(output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)

        final_stl = out_dir / "final_model.stl"
        if final_stl.exists() and not self.overwrite:
            elapsed = time.perf_counter() - t0
            logger.info("Skipping %s (already processed)", case_id)
            return PreprocessResult(
                case_id=case_id, success=True,
                output_stl=str(final_stl), elapsed_s=elapsed, skipped=True,
            )

        try:
            import trimesh
        except ImportError:
            return PreprocessResult(
                case_id=case_id, success=False, output_stl=None,
                elapsed_s=time.perf_counter() - t0,
                error="trimesh not installed: pip install trimesh",
            )

        try:
            # ── Stage 0: Load ──────────────────────────────────────────────
            logger.info("[%s] Loading STL: %s", case_id, stl_path_)
            mesh = trimesh.load(str(stl_path_), force="mesh", process=True)
            if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) == 0:
                raise ValueError(f"STL loaded as empty or non-Trimesh: {stl_path_}")
            logger.info("[%s] Loaded: %d faces  %d vertices", case_id,
                        len(mesh.faces), len(mesh.vertices))

            # ── Skip check ────────────────────────────────────────────────
            has_base_before = detect_base(mesh)
            if self.skip_if_base_present and has_base_before:
                elapsed = time.perf_counter() - t0
                logger.info("[%s] Already has base — skipping preprocessing.", case_id)
                return PreprocessResult(
                    case_id=case_id, success=True,
                    output_stl=str(stl_path_), elapsed_s=elapsed,
                    skipped=True, has_base_before=True,
                )

            # ── Stage 1: Trim ──────────────────────────────────────────────
            t1 = time.perf_counter()
            logger.info("[%s] Stage 1: Trimming...", case_id)
            trimmed, trim_stats = self.trimmer.trim(mesh)
            logger.info("[%s] Trimmed: %d → %d faces (%.1fs)",
                        case_id, trim_stats.input_faces, trim_stats.output_faces,
                        time.perf_counter() - t1)

            if self.save_intermediates:
                trimmed.export(str(out_dir / "trimmed_scan.stl"))

            # ── Stage 2: Base plane ───────────────────────────────────────
            t2 = time.perf_counter()
            logger.info("[%s] Stage 2: Detecting base plane...", case_id)
            plane = self.detector.detect(trimmed)
            logger.info("[%s] Base plane: z=%.2f mm (%.1fs)",
                        case_id, plane.z_level, time.perf_counter() - t2)

            if self.save_intermediates:
                self._save_plane_debug(plane, out_dir / "base_plane.stl")

            # ── Stage 3: Base geometry ─────────────────────────────────────
            t3 = time.perf_counter()
            logger.info("[%s] Stage 3: Generating base...", case_id)
            base_mesh = self.generator.generate(trimmed, plane)
            logger.info("[%s] Base: %d faces (%.1fs)",
                        case_id, len(base_mesh.faces), time.perf_counter() - t3)

            if self.save_intermediates:
                combined_debug = trimesh.util.concatenate([trimmed, base_mesh])
                combined_debug.export(str(out_dir / "scan_with_base.stl"))

            # ── Stage 4: Gap fill ─────────────────────────────────────────
            t4 = time.perf_counter()
            logger.info("[%s] Stage 4: Filling mesh gaps...", case_id)
            filled, fill_stats = self.filler.fill(trimmed, base_mesh)
            logger.info("[%s] Fill: holes=%d  watertight=%s (%.1fs)",
                        case_id, fill_stats.holes_found,
                        fill_stats.is_watertight, time.perf_counter() - t4)

            # ── Stage 5: Normalise ────────────────────────────────────────
            t5 = time.perf_counter()
            logger.info("[%s] Stage 5: Normalising orientation...", case_id)
            final_mesh, norm_meta = self.normalizer.normalize(filled)
            logger.info("[%s] Normalised: z_base=%.2f mm (%.1fs)",
                        case_id, norm_meta.z_min_after, time.perf_counter() - t5)

            # ── Stage 6: Save ─────────────────────────────────────────────
            final_mesh.export(str(final_stl))
            logger.info("[%s] Saved → %s", case_id, final_stl)

            elapsed = time.perf_counter() - t0

            meta = {
                "case_id": case_id,
                "source_stl": str(stl_path_),
                "has_base_before": has_base_before,
                "trim_stats": trim_stats.to_dict(),
                "base_plane": plane.to_dict(),
                "fill_stats": fill_stats.to_dict(),
                "norm_meta":  norm_meta.to_dict(),
                "elapsed_s":  round(elapsed, 3),
                "output_stl": str(final_stl),
            }
            with open(out_dir / "preprocess_meta.json", "w") as f:
                json.dump(meta, f, indent=2)

            return PreprocessResult(
                case_id=case_id,
                success=True,
                output_stl=str(final_stl),
                elapsed_s=elapsed,
                trim_stats=trim_stats.to_dict(),
                base_plane=plane.to_dict(),
                fill_stats=fill_stats.to_dict(),
                norm_meta=norm_meta.to_dict(),
                has_base_before=has_base_before,
            )

        except Exception as exc:
            import traceback
            elapsed = time.perf_counter() - t0
            logger.error("[%s] FAILED: %s", case_id, exc)
            logger.debug(traceback.format_exc())
            return PreprocessResult(
                case_id=case_id,
                success=False,
                output_stl=None,
                elapsed_s=elapsed,
                error=str(exc),
            )

    def run_directory(
        self,
        input_dir: str,
        output_dir: Optional[str] = None,
        workers: int = 1,
    ) -> List[PreprocessResult]:
        """
        Process all STL files in a directory.

        Parameters
        ----------
        input_dir  : str  — root dir with one sub-folder per case
        output_dir : str  — output root (defaults to input_dir)
        workers    : int  — parallel worker processes

        Returns
        -------
        List[PreprocessResult]
        """
        input_path  = Path(input_dir)
        output_path = Path(output_dir) if output_dir else input_path

        # Discover STL files
        stl_pairs: List[tuple] = []
        for case_dir in sorted(input_path.iterdir()):
            if not case_dir.is_dir():
                continue
            stl_files = (
                list(case_dir.glob("*.stl")) + list(case_dir.glob("*.STL"))
            )
            if not stl_files:
                # Check for STL in subdirectory named "scan.stl"
                scan = case_dir / "scan.stl"
                if scan.exists():
                    stl_files = [scan]
            if stl_files:
                stl_pairs.append((
                    str(stl_files[0]),
                    str(output_path / case_dir.name),
                ))

        logger.info("PreprocessPipeline: %d cases found in %s", len(stl_pairs), input_dir)

        results: List[PreprocessResult] = []
        if workers <= 1:
            for stl, out in stl_pairs:
                results.append(self.run(stl, out))
        else:
            with ProcessPoolExecutor(max_workers=workers) as executor:
                futures = {
                    executor.submit(_run_case_worker, stl, out): (stl, out)
                    for stl, out in stl_pairs
                }
                for future in as_completed(futures):
                    try:
                        results.append(future.result())
                    except Exception as exc:
                        stl, _ = futures[future]
                        logger.error("Worker failed for %s: %s", stl, exc)
                        results.append(PreprocessResult(
                            case_id=Path(stl).parent.name,
                            success=False, output_stl=None,
                            elapsed_s=0.0, error=str(exc),
                        ))

        # Summary
        ok      = sum(1 for r in results if r.success and not r.skipped)
        skipped = sum(1 for r in results if r.skipped)
        errors  = sum(1 for r in results if not r.success)
        logger.info(
            "PreprocessPipeline: ✓%d  ↷%d  ✗%d  (total %d)",
            ok, skipped, errors, len(results),
        )
        return results

    # ── Debug helpers ──────────────────────────────────────────────────────

    def _save_plane_debug(self, plane: BasePlane, path: Path) -> None:
        """Save a flat quad representing the base plane for debug viewing."""
        try:
            import trimesh
            # Create a 60×60 mm quad centred at plane.point
            cx, cy, cz = plane.point
            half = 30.0
            verts = np.array([
                [cx - half, cy - half, cz],
                [cx + half, cy - half, cz],
                [cx + half, cy + half, cz],
                [cx - half, cy + half, cz],
            ], dtype=np.float32)
            faces = np.array([[0, 1, 2], [0, 2, 3]], dtype=np.int32)
            plane_mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
            plane_mesh.export(str(path))
        except Exception:
            pass


# ── Worker function for multiprocessing ──────────────────────────────────────

def _run_case_worker(stl_path: str, output_dir: str) -> PreprocessResult:
    """Top-level function for ProcessPoolExecutor compatibility."""
    pipeline = PreprocessPipeline()
    return pipeline.run(stl_path, output_dir)


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "STL Preprocessing Pipeline — Create printable base for raw intraoral scans.\n\n"
            "Pipeline: STL → Trim → Base plane → Base geometry → Fill → Normalise → Save"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--input",  "-i", required=True,
                        help="Input directory (one sub-folder per case, each with .stl)")
    parser.add_argument("--output", "-o", default=None,
                        help="Output root directory (default: same as input)")
    parser.add_argument("--workers",  type=int, default=1,
                        help="Parallel worker processes (default: 1)")
    parser.add_argument("--overwrite", action="store_true",
                        help="Overwrite existing processed STL files")
    parser.add_argument("--skip_with_base", action="store_true",
                        help="Skip scans that already appear to have a base")
    parser.add_argument("--no_intermediates", action="store_true",
                        help="Do not save intermediate debug STL files")
    parser.add_argument("--offset_mm", type=float, default=3.0,
                        help="Base plane offset below lowest vertex (mm, default 3.0)")
    parser.add_argument("--base_thickness_mm", type=float, default=2.0,
                        help="Base thickness in mm (default 2.0)")
    parser.add_argument("--fill_strategy", default="bridge",
                        choices=["bridge", "fan", "poisson"],
                        help="Hole filling strategy (default: bridge)")
    parser.add_argument("--log_level", default="INFO",
                        choices=["DEBUG", "INFO", "WARNING", "ERROR"])
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
        datefmt="%H:%M:%S",
    )

    pipeline = PreprocessPipeline(
        detector_config={"offset_mm": args.offset_mm},
        generator_config={"base_thickness_mm": args.base_thickness_mm},
        filler_config={"strategy": args.fill_strategy},
        save_intermediates=not args.no_intermediates,
        skip_if_base_present=args.skip_with_base,
        overwrite=args.overwrite,
    )
    results = pipeline.run_directory(
        input_dir=args.input,
        output_dir=args.output,
        workers=args.workers,
    )

    ok      = sum(1 for r in results if r.success and not r.skipped)
    skipped = sum(1 for r in results if r.skipped)
    errors  = sum(1 for r in results if not r.success)
    print(f"\n{'='*55}")
    print(f"  Preprocessing complete")
    print(f"  Processed : {ok}")
    print(f"  Skipped   : {skipped}")
    print(f"  Errors    : {errors}")
    print(f"{'='*55}")


if __name__ == "__main__":
    main()
