"""
cli_runner.py — Command-line bridge for the tooth numbering pipeline.

Usage:
    python cli_runner.py --scan <path> [--output-json] [--threshold <mm>]
                         [--include-wisdom] [--no-lower] [--no-upper]

The script loads a preprocessed scan file (points.npy + tooth_labels.npy in
the same directory, or a single .ply/.stl mesh file), runs the full tooth
numbering pipeline, and writes a JSON result to stdout.

Exit codes:
    0  — success
    1  — input file not found
    2  — pipeline error
    3  — unsupported file format

Output JSON schema:
{
    "teeth": {
        "11": "present",
        "12": "present",
        "14": "missing",
        ...
    },
    "measurements": {
        "tooth_widths": { "11": 8.2, "12": 7.1, ... },
        "arch_length_upper": 85.3,
        "arch_length_lower": 78.1,
        "bolton": {
            "overall_ratio": 91.5,
            "anterior_ratio": 77.4,
            "overall_discrepancy_mm": 0.2,
            "anterior_discrepancy_mm": 0.1
        },
        "curve_of_spee_mm": 2.1,
        "overjet_mm": 3.2,
        "overbite_mm": 2.5
    },
    "summary": {
        "upper_count": 13,
        "lower_count": 12,
        "missing_count": 3
    },
    "error": null   (or error string if pipeline partially failed)
}
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import Optional

import numpy as np

# ── Ensure python-ai-engine is importable ──────────────────────────────────────
_ENGINE_ROOT = Path(__file__).resolve().parents[3]  # python-ai-engine/
sys.path.insert(0, str(_ENGINE_ROOT))

from meshnet.tooth_numbering import run_numbering_pipeline
from meshnet.tooth_numbering.missing_detection import build_teeth_status_dict
from meshnet.tooth_numbering.fdi_assignment import FDI_MAXILLARY, FDI_MANDIBULAR

logging.basicConfig(
    level=logging.WARNING,
    format="%(levelname)s %(name)s %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("cli_runner")


# ─── File loaders ────────────────────────────────────────────────────────────

def load_npy_dataset(scan_dir: Path):
    """
    Load from a dataset directory:
        points.npy            → (N, 3) point cloud vertices
        tooth_labels.npy      → (N,)   per-point labels

    We convert point-cloud labels to face labels by treating each point
    as a degenerate triangle (1-point face) so the extract_teeth module
    receives the expected array shapes.

    For a real mesh-based scan, replace this with mesh loading.
    """
    points_path = scan_dir / "points.npy"
    labels_path = scan_dir / "tooth_labels.npy"

    if not points_path.exists():
        raise FileNotFoundError(f"points.npy not found in {scan_dir}")
    if not labels_path.exists():
        raise FileNotFoundError(f"tooth_labels.npy not found in {scan_dir}")

    vertices = np.load(points_path).astype(np.float32)   # (N, 3)
    labels   = np.load(labels_path).astype(np.int32)      # (N,)

    # Build degenerate faces (each point = a face with itself × 3)
    N = len(vertices)
    idx = np.arange(N, dtype=np.int32)
    faces = np.stack([idx, idx, idx], axis=1)             # (N, 3) — degenerate

    # Build a default occlusal plane from the data (Z axis as superior)
    # For production use, load base_plane.json
    base_plane_file = scan_dir / "base_plane.json"
    if base_plane_file.exists():
        import json as _json
        with open(base_plane_file) as f:
            bp = _json.load(f)
        plane_vec = bp.get("plane", bp.get("normal", [0, 0, 1]))
        if len(plane_vec) == 3:
            plane_vec = list(plane_vec) + [float(bp.get("offset", bp.get("d", 0.0)))]
        occlusal_plane = np.array(plane_vec, dtype=np.float32)
    else:
        # Default: Z-axis is superior (toward maxilla)
        centroid_z = float(np.mean(vertices[:, 2]))
        occlusal_plane = np.array([0.0, 0.0, 1.0, -centroid_z], dtype=np.float32)

    return vertices, faces, labels, occlusal_plane


def load_mesh_file(mesh_path: Path):
    """
    Load a mesh from .ply or .stl file using trimesh.

    Returns (vertices, faces, face_labels, occlusal_plane).
    face_labels will be zeros (gingiva) unless per-face colour data is present.
    """
    try:
        import trimesh
    except ImportError:
        raise ImportError("trimesh is required for .ply/.stl loading: pip install trimesh")

    mesh = trimesh.load(str(mesh_path), force="mesh")
    vertices = np.array(mesh.vertices, dtype=np.float32)
    faces    = np.array(mesh.faces, dtype=np.int32)

    # Try to extract face labels from face colors (r channel → label)
    if hasattr(mesh.visual, "face_colors") and mesh.visual.face_colors is not None:
        fc = np.array(mesh.visual.face_colors)
        face_labels = fc[:, 0].astype(np.int32)   # red channel as label
    else:
        face_labels = np.zeros(len(faces), dtype=np.int32)

    # Build occlusal plane from mesh bounding box centre
    bbox_min, bbox_max = vertices.min(axis=0), vertices.max(axis=0)
    centre_z = float((bbox_min[2] + bbox_max[2]) / 2)
    occlusal_plane = np.array([0.0, 0.0, 1.0, -centre_z], dtype=np.float32)

    return vertices, faces, face_labels, occlusal_plane


# ─── Result serialiser ────────────────────────────────────────────────────────

def serialise_result(pipeline_result, missing_list, status_dict, include_wisdom) -> dict:
    """Convert pipeline result to JSON-serialisable dict."""
    m = pipeline_result.measurements

    # Bolton dict
    bolton_dict = {
        "overall_ratio": m.bolton.overall_ratio,
        "anterior_ratio": m.bolton.anterior_ratio,
        "overall_discrepancy_mm": m.bolton.overall_discrepancy_mm,
        "anterior_discrepancy_mm": m.bolton.anterior_discrepancy_mm,
        "upper_overall_sum_mm": round(m.bolton.upper_overall_sum, 2),
        "lower_overall_sum_mm": round(m.bolton.lower_overall_sum, 2),
    }

    measurements_dict = {
        "tooth_widths": m.all_widths,
        "arch_length_upper_mm": m.arch_length_upper,
        "arch_length_lower_mm": m.arch_length_lower,
        "bolton": bolton_dict,
        "curve_of_spee_mm": m.curve_of_spee_mm,
        "overjet_mm": m.overjet_mm,
        "overbite_mm": m.overbite_mm,
    }

    # Summary counts from status dict
    upper_fdi_str = {str(f) for f in FDI_MAXILLARY}
    wisdom_str = {"18", "28", "38", "48"}
    upper_present = sum(
        1 for k, v in status_dict.items()
        if k in upper_fdi_str and v == "present"
        and (include_wisdom or k not in wisdom_str)
    )
    lower_present = sum(
        1 for k, v in status_dict.items()
        if k not in upper_fdi_str and v == "present"
        and (include_wisdom or k not in wisdom_str)
    )
    missing_count = sum(1 for v in status_dict.values() if v == "missing")

    return {
        "teeth": status_dict,
        "measurements": measurements_dict,
        "summary": {
            "upper_count": upper_present,
            "lower_count": lower_present,
            "missing_count": missing_count,
            "total_count": upper_present + lower_present,
        },
        "missing_fdi": sorted(missing_list),
        "error": None,
    }


# ─── Main ─────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(
        description="DentalMeshNet Tooth Numbering CLI Runner"
    )
    p.add_argument(
        "--scan", required=True,
        help="Path to scan directory (containing points.npy + tooth_labels.npy) "
             "OR path to a .ply/.stl mesh file",
    )
    p.add_argument(
        "--output-json", action="store_true",
        help="Write JSON to stdout (default mode)",
    )
    p.add_argument(
        "--threshold", type=float, default=5.0,
        help="Missing-tooth distance threshold in mm (default: 5.0)",
    )
    p.add_argument(
        "--include-wisdom", action="store_true",
        help="Include third molar slots (18/28/38/48) in output",
    )
    p.add_argument(
        "--no-upper", action="store_true",
        help="Skip maxillary analysis",
    )
    p.add_argument(
        "--no-lower", action="store_true",
        help="Skip mandibular analysis",
    )
    return p.parse_args()


def main():
    args = parse_args()
    scan_path = Path(args.scan).resolve()

    # ── Load scan ────────────────────────────────────────────────────────────
    try:
        if scan_path.is_dir():
            vertices, faces, face_labels, occlusal_plane = load_npy_dataset(scan_path)
        elif scan_path.suffix.lower() in (".ply", ".stl", ".obj"):
            vertices, faces, face_labels, occlusal_plane = load_mesh_file(scan_path)
        elif scan_path.suffix.lower() == ".npy":
            # Single .npy file assumed to be point cloud with labels in same dir
            vertices, faces, face_labels, occlusal_plane = load_npy_dataset(scan_path.parent)
        else:
            sys.stderr.write(f"Unsupported file format: {scan_path.suffix}\n")
            sys.exit(3)
    except FileNotFoundError as e:
        sys.stderr.write(f"File not found: {e}\n")
        sys.exit(1)

    # ── Run pipeline ─────────────────────────────────────────────────────────
    try:
        result = run_numbering_pipeline(
            vertices=vertices,
            faces=faces,
            face_labels=face_labels,
            occlusal_plane=occlusal_plane,
            missing_threshold=args.threshold,
        )
    except Exception as e:
        sys.stderr.write(f"Pipeline error: {e}\n")
        error_out = {
            "teeth": {},
            "measurements": None,
            "summary": {},
            "missing_fdi": [],
            "error": str(e),
        }
        print(json.dumps(error_out, indent=None))
        sys.exit(2)

    # ── Build output ─────────────────────────────────────────────────────────
    from meshnet.tooth_numbering.missing_detection import build_teeth_status_dict

    status_dict = build_teeth_status_dict(
        fdi_map=result.fdi_map,
        missing_list=result.missing,
        check_upper=not args.no_upper,
        check_lower=not args.no_lower,
        exclude_wisdom_teeth=not args.include_wisdom,
    )

    output = serialise_result(result, result.missing, status_dict, args.include_wisdom)

    # Always output JSON to stdout
    print(json.dumps(output, indent=2 if sys.stdout.isatty() else None))
    sys.exit(0)


if __name__ == "__main__":
    main()
