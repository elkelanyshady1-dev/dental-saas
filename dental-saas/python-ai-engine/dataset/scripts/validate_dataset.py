"""
validate_dataset.py — Dataset quality validation tool.

Checks the processed dataset for:
    ✓ Class distribution (gingiva vs teeth ratio)
    ✓ Missing tooth classes per case
    ✓ Point cloud size consistency
    ✓ Imbalanced class ratios
    ✓ Meta.json presence & schema
    ✓ Overall dataset size

Output (human-readable + optional JSON):
    Dataset Summary
    ---------------
    Cases      : 11
    Avg points : 10000
    Gingiva    : 70.3%
    Teeth      : 29.7%
    Classes    : 1–32 (detected 8)

    Warnings:
      ⚠ case_003: missing tooth classes [4, 7, 12]
      ⚠ Gingiva > 80% in 3 cases (possible imbalance)

Usage:
    python -m dataset.scripts.validate_dataset \\
        --data_dir datasets/synthetic_cases \\
        --output   logs/dataset_validation.json

    # Strict mode — exit 1 on any warning
    python -m dataset.scripts.validate_dataset --data_dir datasets/... --strict
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# ANSI colours (gracefully disabled on non-TTY)
# ──────────────────────────────────────────────────────────────────────────────
import os as _os
_USE_COLOR = sys.stdout.isatty() and _os.name != "nt" or (
    _os.name == "nt" and _os.environ.get("TERM") not in (None, "")
)

def _c(code: str, text: str) -> str:
    if not _USE_COLOR:
        return text
    RESET = "\033[0m"
    return f"\033[{code}m{text}{RESET}"

GREEN  = lambda t: _c("92", t)
YELLOW = lambda t: _c("93", t)
RED    = lambda t: _c("91", t)
BOLD   = lambda t: _c("1",  t)
DIM    = lambda t: _c("2",  t)
CYAN   = lambda t: _c("96", t)


# ──────────────────────────────────────────────────────────────────────────────
# Per-case analysis
# ──────────────────────────────────────────────────────────────────────────────

def analyse_case(case_dir: Path, num_expected_classes: int = 33) -> dict:
    """
    Analyse a single processed case directory.

    Returns a structured dict with counts, ratios, warnings.
    """
    result: dict = {
        "case": case_dir.name,
        "valid": True,
        "warnings": [],
        "errors": [],
        "n_points": 0,
        "gingiva_ratio": 0.0,
        "teeth_ratio": 0.0,
        "detected_classes": [],
        "missing_classes": [],
        "sampling_method": "unknown",
        "boundary_ratio": None,
    }

    # ── Required files ───────────────────────────────────────────────────────
    points_path = case_dir / "points.npy"
    labels_path = case_dir / "tooth_labels.npy"

    if not points_path.exists():
        result["errors"].append("points.npy missing")
        result["valid"] = False
        return result

    if not labels_path.exists():
        result["errors"].append("tooth_labels.npy missing")
        result["valid"] = False
        return result

    # ── Load arrays ──────────────────────────────────────────────────────────
    try:
        points = np.load(points_path)
        labels = np.load(labels_path)
    except Exception as e:
        result["errors"].append(f"Array load failed: {e}")
        result["valid"] = False
        return result

    n = len(points)
    result["n_points"] = int(n)

    if n == 0:
        result["errors"].append("Empty point cloud (0 points)")
        result["valid"] = False
        return result

    if len(labels) != n:
        result["errors"].append(
            f"Shape mismatch: points={n}, labels={len(labels)}"
        )
        result["valid"] = False
        return result

    # ── Class distribution ───────────────────────────────────────────────────
    unique_classes = np.unique(labels).tolist()
    result["detected_classes"] = [int(c) for c in unique_classes]

    gingiva_mask = labels == 0
    gingiva_ratio = float(gingiva_mask.sum()) / n
    teeth_ratio = 1.0 - gingiva_ratio
    result["gingiva_ratio"] = round(gingiva_ratio, 4)
    result["teeth_ratio"] = round(teeth_ratio, 4)

    # Missing tooth classes (1..32 not present)
    tooth_classes = set(range(1, min(num_expected_classes, 33)))
    detected_teeth = {c for c in unique_classes if c > 0}
    missing = sorted(tooth_classes - detected_teeth)
    result["missing_classes"] = missing

    # ── Warnings ─────────────────────────────────────────────────────────────
    if gingiva_ratio > 0.85:
        result["warnings"].append(
            f"Gingiva ratio very high ({gingiva_ratio:.1%}) — possible labelling error"
        )
    if gingiva_ratio < 0.30:
        result["warnings"].append(
            f"Gingiva ratio very low ({gingiva_ratio:.1%}) — check labels"
        )
    if n < 1000:
        result["warnings"].append(f"Very few points ({n} < 1000)")
    if missing:
        short = missing[:8]
        extra = f" …+{len(missing)-8} more" if len(missing) > 8 else ""
        result["warnings"].append(
            f"Missing tooth classes: {short}{extra}"
        )

    # ── meta.json ──────────────────────────────────────────────────────────
    meta_path = case_dir / "meta.json"
    if not meta_path.exists():
        result["warnings"].append("meta.json missing (run generate_dataset again)")
    else:
        try:
            meta = json.loads(meta_path.read_text())
            result["sampling_method"] = meta.get("sampling_method", "unknown")
            result["boundary_ratio"] = meta.get("boundary_ratio")

            if "sampling_method" not in meta:
                result["warnings"].append("meta.json missing 'sampling_method' key")
            if "boundary_ratio" not in meta:
                result["warnings"].append("meta.json missing 'boundary_ratio' key")
        except Exception as e:
            result["warnings"].append(f"meta.json parse error: {e}")

    return result


# ──────────────────────────────────────────────────────────────────────────────
# Dataset-level summary
# ──────────────────────────────────────────────────────────────────────────────

def validate_dataset(
    data_dir: Path,
    num_expected_classes: int = 33,
) -> Tuple[dict, List[dict]]:
    """
    Validate all cases in *data_dir*.

    Returns
    -------
    summary : dict
        Human-readable aggregate statistics.
    case_results : list[dict]
        Per-case detailed results.
    """
    if not data_dir.exists():
        raise FileNotFoundError(f"Data directory not found: {data_dir}")

    case_dirs = sorted(
        d for d in data_dir.iterdir()
        if d.is_dir() and (d / "points.npy").exists()
    )

    if not case_dirs:
        raise ValueError(
            f"No valid case directories found in {data_dir}.\n"
            "A valid case must contain at least points.npy."
        )

    logger.info("Validating %d cases in %s ...", len(case_dirs), data_dir)
    case_results = [analyse_case(d, num_expected_classes) for d in case_dirs]

    # ── Aggregate ────────────────────────────────────────────────────────────
    valid_cases = [r for r in case_results if r["valid"]]
    total = len(case_results)
    n_valid = len(valid_cases)
    n_errors = total - n_valid
    n_warnings = sum(1 for r in case_results if r["warnings"])

    avg_points = (
        int(np.mean([r["n_points"] for r in valid_cases]))
        if valid_cases else 0
    )
    avg_gingiva = (
        float(np.mean([r["gingiva_ratio"] for r in valid_cases]))
        if valid_cases else 0.0
    )
    avg_teeth = 1.0 - avg_gingiva

    # Global class presence
    all_classes: set = set()
    for r in valid_cases:
        all_classes.update(r["detected_classes"])
    all_teeth_classes = sorted(c for c in all_classes if c > 0)

    # Cases per class (how many cases have this tooth)
    class_case_count: Dict[int, int] = {}
    for r in valid_cases:
        for c in r["detected_classes"]:
            if c > 0:
                class_case_count[c] = class_case_count.get(c, 0) + 1

    # Systematically missing: present in < 50% of cases
    systematic_missing = [
        c for c in range(1, min(num_expected_classes, 33))
        if class_case_count.get(c, 0) < total * 0.5
    ]

    summary = {
        "data_dir": str(data_dir),
        "total_cases": total,
        "valid_cases": n_valid,
        "error_cases": n_errors,
        "warning_cases": n_warnings,
        "avg_points": avg_points,
        "avg_gingiva_ratio": round(avg_gingiva, 4),
        "avg_teeth_ratio": round(avg_teeth, 4),
        "detected_tooth_classes": all_teeth_classes,
        "n_detected_tooth_classes": len(all_teeth_classes),
        "systematic_missing_classes": systematic_missing,
        "class_case_counts": {
            str(k): v for k, v in sorted(class_case_count.items())
        },
        "sampling_methods": list({
            r["sampling_method"] for r in case_results
            if r["sampling_method"] != "unknown"
        }),
    }

    return summary, case_results


# ──────────────────────────────────────────────────────────────────────────────
# Pretty-print report
# ──────────────────────────────────────────────────────────────────────────────

def print_report(summary: dict, cases: List[dict]) -> None:
    div = "-" * 55
    print("\n" + BOLD("Dataset Validation Report"))
    print(div)
    print("  Directory    : " + DIM(summary["data_dir"]))
    print("  Total cases  : " + BOLD(str(summary["total_cases"])))
    print("  Valid        : " + GREEN(str(summary["valid_cases"])))
    if summary["error_cases"]:
        print("  Errors       : " + RED(str(summary["error_cases"])))
    if summary["warning_cases"]:
        print("  Warnings     : " + YELLOW(str(summary["warning_cases"])))
    print(div)
    print("  Avg points   : " + f"{summary['avg_points']:,}")
    ginv_str = f"{summary['avg_gingiva_ratio']:.1%}"
    teeth_str = f"{summary['avg_teeth_ratio']:.1%}"
    print("  Gingiva      : " + GREEN(ginv_str))
    print("  Teeth        : " + CYAN(teeth_str))
    n_cls = summary["n_detected_tooth_classes"]
    max_exp = min(32, summary["total_cases"] * 4)
    print(f"  Tooth classes: {n_cls} detected  (max expected {max_exp})")
    if summary["sampling_methods"]:
        print("  Sampling     : " + ", ".join(summary["sampling_methods"]))
    print(div)

    # Systematic missing
    if summary["systematic_missing_classes"]:
        ms = summary["systematic_missing_classes"]
        print("\n  " + YELLOW("⚠  Systematically missing tooth classes") + " (< 50% of cases):")
        print(f"     {ms}")

    # Per-case issues
    issues = [(r["case"], r["warnings"], r["errors"]) for r in cases
              if r["warnings"] or r["errors"]]

    if issues:
        print("\n  " + YELLOW("Per-case issues:"))
        for case, warnings, errors in issues:
            for err in errors:
                print("    " + RED("✗") + f" {case}: {err}")
            for warn in warnings:
                print("    " + YELLOW("⚠") + f" {case}: {warn}")
    else:
        print("\n  " + GREEN("✓  No per-case issues detected."))

    # Final status
    n_err = summary["error_cases"]
    n_warn = summary["warning_cases"]
    print("\n" + div)
    if n_err == 0 and n_warn == 0:
        print("  " + GREEN("✓  Dataset is CLEAN — ready for training."))
    elif n_err == 0:
        print("  " + YELLOW(f"⚠  Dataset has {n_warn} warning(s). Review before training."))
    else:
        print("  " + RED(f"✗  Dataset has {n_err} error(s). Fix before training."))
    print(div + "\n")


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Validate a processed dental point cloud dataset.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--data_dir", "-d", required=True,
        help="Root directory of the processed dataset (contains case sub-dirs)",
    )
    p.add_argument(
        "--output", "-o", default=None,
        help="Optional: write full JSON report to this path",
    )
    p.add_argument(
        "--num_classes", type=int, default=33,
        help="Expected number of classes (0=gingiva, 1..N=teeth) (default: 33)",
    )
    p.add_argument(
        "--strict", action="store_true",
        help="Exit with code 1 if any warnings or errors are found",
    )
    p.add_argument(
        "--quiet", "-q", action="store_true",
        help="Suppress per-case output; only show summary",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    data_dir = Path(args.data_dir)

    try:
        summary, cases = validate_dataset(data_dir, args.num_classes)
    except (FileNotFoundError, ValueError) as e:
        print(RED(f"ERROR: {e}"))
        sys.exit(1)

    if not args.quiet:
        print_report(summary, cases)
    else:
        # Compact summary only
        print(f"Cases: {summary['total_cases']} | "
              f"Valid: {summary['valid_cases']} | "
              f"Errors: {summary['error_cases']} | "
              f"Warnings: {summary['warning_cases']}")
        print(f"Gingiva: {summary['avg_gingiva_ratio']:.1%} | "
              f"Teeth: {summary['avg_teeth_ratio']:.1%} | "
              f"Tooth classes: {summary['n_detected_tooth_classes']}")

    # Optional JSON output
    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        report = {"summary": summary, "cases": cases}
        out_path.write_text(json.dumps(report, indent=2))
        print(f"Report written to: {out_path}")

    # Exit code
    has_errors = summary["error_cases"] > 0
    has_warnings = summary["warning_cases"] > 0

    if has_errors:
        sys.exit(1)
    if args.strict and has_warnings:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
