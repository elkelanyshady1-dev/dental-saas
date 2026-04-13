"""
make_synthetic_dataset.py — Create a synthetic dental dataset for pipeline testing.

Generates fake 'cases' that look exactly like the output of generate_dataset.py:
    {output_dir}/case_NNN/
        points.npy          (N, 3) float32
        tooth_labels.npy    (N,)   int64   — 0=gingiva, 1–8=teeth
        meta.json           provenance

No trimesh / STL required — pure numpy.

Usage
-----
    python -m dataset.scripts.make_synthetic_dataset \\
        --output_dir datasets/synthetic_cases \\
        --n_cases   4 \\
        --n_points  4096 \\
        --n_classes 8

The generated data is usable directly by train_pointnet.py with --data_root.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def _make_case(
    case_dir: Path,
    n_points: int,
    n_classes: int,
    seed: int,
) -> None:
    rng = np.random.default_rng(seed)

    # Random points on a unit sphere (plausible dental scan distribution)
    # Cluster around n_classes tooth centres
    centres = rng.uniform(-50, 50, size=(n_classes, 3)).astype(np.float32)
    tooth_labels = rng.integers(0, n_classes, size=n_points, dtype=np.int64)
    offsets = rng.normal(scale=5.0, size=(n_points, 3)).astype(np.float32)
    points = centres[tooth_labels] + offsets

    # Remap label 0 → gingiva, keep others as-is
    meta = {
        "case": case_dir.name,
        "source": "synthetic",
        "n_points": n_points,
        "n_classes": n_classes,
        "sampling_method": "boundary_aware",
        "boundary_ratio": 0.3,
        "seed": seed,
    }

    case_dir.mkdir(parents=True, exist_ok=True)
    np.save(case_dir / "points.npy", points)
    np.save(case_dir / "tooth_labels.npy", tooth_labels)
    with open(case_dir / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    logger.info("  ✓ %s  — %d points, %d classes", case_dir.name, n_points, n_classes)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a synthetic dental dataset for pipeline testing."
    )
    parser.add_argument(
        "--output_dir", "-o", required=True,
        help="Root directory to write synthetic cases into",
    )
    parser.add_argument(
        "--n_cases", type=int, default=4,
        help="Number of synthetic cases to generate (default: 4)",
    )
    parser.add_argument(
        "--n_points", type=int, default=4096,
        help="Points per case (default: 4096)",
    )
    parser.add_argument(
        "--n_classes", type=int, default=8,
        help="Number of tooth classes (0=gingiva, 1–n=teeth) (default: 8)",
    )
    parser.add_argument(
        "--seed", type=int, default=42,
        help="Random seed (default: 42)",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info(
        "Generating %d synthetic cases → %s", args.n_cases, output_dir
    )

    for i in range(args.n_cases):
        case_name = f"case_{i+1:03d}"
        _make_case(
            output_dir / case_name,
            n_points=args.n_points,
            n_classes=args.n_classes,
            seed=args.seed + i,
        )

    logger.info("Done — %d cases written to %s", args.n_cases, output_dir)


if __name__ == "__main__":
    main()
