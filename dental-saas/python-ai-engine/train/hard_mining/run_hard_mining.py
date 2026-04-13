"""
run_hard_mining.py — Standalone CLI for hard-case mining.

Loads a trained model, runs inference over the full dataset,
scores every case, and updates:
    logs/hard_cases.json
    logs/difficulty_report.json
    datasets/hard_cases/

Usage:
    python -m train.hard_mining.run_hard_mining \
        --data_root  ./datasets/cases       \
        --checkpoint ./models/best.pth      \
        --multitask                         \
        --top_fraction 0.20                 \
        --log_path ./logs/hard_cases.json   \
        --hard_cases_dir ./datasets/hard_cases

This script is also called automatically from train_pointnet.py
when --hard_mining is enabled.
"""

import argparse
import json
import logging
import sys
from pathlib import Path

import torch

from ..pointnet2_segmentation import PointNet2Segmentation
from ..multitask_pointnet import MultiTaskPointNet
from .hard_case_detector import HardCaseDetector

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Hard-case mining for orthodontic AI engine"
    )
    parser.add_argument(
        "--data_root", type=str, required=True,
        help="Root directory of the dataset to score",
    )
    parser.add_argument(
        "--checkpoint", type=str, required=True,
        help="Path to trained model checkpoint (.pth)",
    )
    parser.add_argument(
        "--multitask", action="store_true",
        help="Use MultiTaskPointNet (default: PointNet2Segmentation)",
    )
    parser.add_argument(
        "--top_fraction", type=float, default=0.20,
        help="Fraction of cases to designate as hard (default: 0.20 = top 20%%)",
    )
    parser.add_argument(
        "--log_path", type=str, default="./logs/hard_cases.json",
        help="Output path for hard_cases.json",
    )
    parser.add_argument(
        "--hard_cases_dir", type=str, default="./datasets/hard_cases",
        help="Directory to populate with hard case data",
    )
    parser.add_argument(
        "--num_points", type=int, default=4096,
        help="Points per sample during inference",
    )
    parser.add_argument(
        "--num_classes", type=int, default=33,
        help="Number of segmentation classes",
    )
    # Difficulty weights
    parser.add_argument("--w_iou", type=float, default=0.6)
    parser.add_argument("--w_boundary", type=float, default=0.3)
    parser.add_argument("--w_missing", type=float, default=0.1)

    return parser.parse_args()


def main():
    args = parse_args()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Device: {device}")

    # ---- Load model ----
    if args.multitask:
        model = MultiTaskPointNet(num_tooth_classes=args.num_classes)
    else:
        model = PointNet2Segmentation(num_classes=args.num_classes)

    checkpoint = torch.load(args.checkpoint, map_location=device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model = model.to(device)
    logger.info(f"Loaded checkpoint: {args.checkpoint}")

    # ---- Difficulty weights ----
    weights = {
        "iou": args.w_iou,
        "boundary": args.w_boundary,
        "missing": args.w_missing,
    }

    # ---- Run detector ----
    detector = HardCaseDetector(
        model=model,
        data_root=args.data_root,
        log_path=args.log_path,
        hard_cases_dir=args.hard_cases_dir,
        top_fraction=args.top_fraction,
        num_points=args.num_points,
        num_classes=args.num_classes,
        is_multitask=args.multitask,
        difficulty_weights=weights,
    )

    hard_cases = detector.run(device)

    # ---- Summary ----
    print("\n" + "=" * 60)
    print("HARD-CASE MINING RESULTS")
    print("=" * 60)
    print(f"\nTotal hard cases detected: {len(hard_cases)}")
    print(f"\nTop 10 hardest cases:")
    for rank, case in enumerate(hard_cases[:10], 1):
        missing = case.get("missing_predicted_teeth", [])
        missing_str = f"missing={missing[:4]}" if missing else "no missing"
        print(
            f"  {rank:2d}. {case['case']:20s} "
            f"difficulty={case['difficulty']:.3f}  "
            f"IoU={case['mean_iou']:.3f}  {missing_str}"
        )

    print(f"\nLog saved to: {args.log_path}")
    print(f"Hard cases dir: {args.hard_cases_dir}")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
