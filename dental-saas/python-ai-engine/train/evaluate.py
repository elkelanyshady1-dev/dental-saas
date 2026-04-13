"""
Evaluation script for PointNet++ orthodontic models.

Computes comprehensive metrics for both single-task and multi-task models:
    - Tooth segmentation:  per-class IoU, mIoU, accuracy, boundary IoU
    - Gingiva segmentation: binary IoU, accuracy
    - Base plane:           angular error (degrees), offset error
    - Bite alignment:       translation L2, rotation angular error

Boundary IoU measures accuracy specifically at tooth-gingiva transition
zones, where orthodontic segmentation models typically struggle.

Usage:
    # Single-task evaluation
    python -m train.evaluate --data_root ./data --checkpoint best.pth

    # Multi-task evaluation
    python -m train.evaluate --data_root ./data --checkpoint best.pth --multitask
"""

import argparse
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from scipy.spatial import cKDTree
import torch
import torch.nn as nn

from .dataset_loader import create_dataloaders
from .pointnet2_segmentation import PointNet2Segmentation
from .multitask_pointnet import MultiTaskPointNet

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Metric computation
# ---------------------------------------------------------------------------

def compute_iou_per_class(
    predictions: np.ndarray,
    labels: np.ndarray,
    num_classes: int,
) -> np.ndarray:
    """
    Compute IoU for each class.

    Args:
        predictions: (M,) predicted class indices
        labels: (M,) ground truth class indices
        num_classes: total number of classes

    Returns:
        iou: (num_classes,) IoU per class (NaN where class absent)
    """
    iou = np.full(num_classes, np.nan)
    for c in range(num_classes):
        pred_c = predictions == c
        label_c = labels == c
        intersection = np.logical_and(pred_c, label_c).sum()
        union = np.logical_or(pred_c, label_c).sum()
        if union > 0:
            iou[c] = intersection / union
    return iou


def compute_miou(iou_per_class: np.ndarray) -> float:
    """Mean IoU across classes that are present (non-NaN)."""
    valid = ~np.isnan(iou_per_class)
    if valid.sum() == 0:
        return 0.0
    return float(np.nanmean(iou_per_class))


def compute_plane_angle_error(
    pred_plane: np.ndarray, gt_plane: np.ndarray
) -> float:
    """
    Angular error between predicted and ground truth plane normals (degrees).

    Args:
        pred_plane: (4,) — [nx, ny, nz, d]
        gt_plane: (4,) — [nx, ny, nz, d]

    Returns:
        angle_degrees: angular error in degrees
    """
    pred_n = pred_plane[:3]
    gt_n = gt_plane[:3]

    # Normalize
    pred_n = pred_n / (np.linalg.norm(pred_n) + 1e-8)
    gt_n = gt_n / (np.linalg.norm(gt_n) + 1e-8)

    cos_angle = np.clip(np.dot(pred_n, gt_n), -1.0, 1.0)
    angle_rad = np.arccos(np.abs(cos_angle))  # abs handles flipped normals
    return float(np.degrees(angle_rad))


def compute_plane_offset_error(
    pred_plane: np.ndarray, gt_plane: np.ndarray
) -> float:
    """Absolute difference in plane offset d."""
    return float(np.abs(pred_plane[3] - gt_plane[3]))


def compute_transform_errors(
    pred_transform: np.ndarray, gt_transform: np.ndarray
) -> Dict[str, float]:
    """
    Compute errors for rigid transform [Tx, Ty, Tz, Rx, Ry, Rz].

    Returns:
        dict with:
            translation_l2:  L2 norm of translation error
            rotation_l2:     L2 norm of rotation error (radians)
            rotation_degrees: rotation error in degrees
    """
    pred_t = pred_transform[:3]
    gt_t = gt_transform[:3]
    pred_r = pred_transform[3:]
    gt_r = gt_transform[3:]

    translation_l2 = float(np.linalg.norm(pred_t - gt_t))
    rotation_l2 = float(np.linalg.norm(pred_r - gt_r))
    rotation_degrees = float(np.degrees(rotation_l2))

    return {
        "translation_l2": translation_l2,
        "rotation_l2": rotation_l2,
        "rotation_degrees": rotation_degrees,
    }


def compute_boundary_iou(
    predictions: np.ndarray,
    labels: np.ndarray,
    points: np.ndarray,
    num_classes: int,
    k_neighbors: int = 8,
) -> float:
    """
    Compute IoU restricted to boundary points (tooth-gingiva transitions).

    A point is a boundary point if any of its K nearest neighbors
    has a different ground-truth label. This metric focuses evaluation
    on the regions that matter most for orthodontic segmentation.

    Args:
        predictions: (M,) predicted labels
        labels: (M,) ground truth labels
        points: (M, 3) point coordinates
        num_classes: total classes
        k_neighbors: number of neighbors to check

    Returns:
        boundary_miou: mIoU computed only at boundary points
    """
    # Build KD-tree for neighbor queries
    tree = cKDTree(points)
    _, nn_indices = tree.query(points, k=k_neighbors + 1)  # +1 for self
    nn_indices = nn_indices[:, 1:]  # exclude self

    # A point is boundary if any neighbor has a different label
    neighbor_labels = labels[nn_indices]  # (M, K)
    is_boundary = np.any(neighbor_labels != labels[:, None], axis=1)

    if is_boundary.sum() == 0:
        return 0.0

    # Compute IoU only at boundary points
    boundary_preds = predictions[is_boundary]
    boundary_labels = labels[is_boundary]

    iou_per_class = compute_iou_per_class(boundary_preds, boundary_labels, num_classes)
    return compute_miou(iou_per_class)


# ---------------------------------------------------------------------------
# Evaluation runners
# ---------------------------------------------------------------------------

@torch.no_grad()
def evaluate_segmentation(
    model: nn.Module,
    dataloader,
    device: torch.device,
    num_classes: int = 33,
) -> Dict:
    """Full evaluation for single-task segmentation."""
    model.eval()

    all_preds = []
    all_labels = []

    for batch in dataloader:
        points = batch["points"].to(device)
        labels = batch["tooth_labels"]

        logits = model(points)
        preds = logits.argmax(dim=-1).cpu().numpy()

        all_preds.append(preds.reshape(-1))
        all_labels.append(labels.numpy().reshape(-1))

    all_preds = np.concatenate(all_preds)
    all_labels = np.concatenate(all_labels)

    iou_per_class = compute_iou_per_class(all_preds, all_labels, num_classes)
    miou = compute_miou(iou_per_class)
    accuracy = float((all_preds == all_labels).mean())

    # Boundary IoU (requires point coordinates — re-iterate if needed)
    # For efficiency, we compute it on the concatenated arrays
    # using a subset of points if the dataset is very large
    boundary_miou = None
    try:
        all_points = []
        for batch in dataloader:
            pts = batch["points"].numpy().reshape(-1, 3)
            all_points.append(pts)
        all_points_arr = np.concatenate(all_points)
        # Subsample for speed if > 500k points
        if len(all_points_arr) > 500_000:
            idx = np.random.choice(len(all_points_arr), 500_000, replace=False)
            boundary_miou = compute_boundary_iou(
                all_preds[idx], all_labels[idx], all_points_arr[idx],
                num_classes,
            )
        else:
            boundary_miou = compute_boundary_iou(
                all_preds, all_labels, all_points_arr, num_classes,
            )
    except Exception as e:
        logger.warning(f"Could not compute boundary IoU: {e}")

    # Per-class report
    class_report = {}
    for c in range(num_classes):
        if not np.isnan(iou_per_class[c]):
            class_report[f"class_{c}"] = {
                "iou": float(iou_per_class[c]),
                "support": int((all_labels == c).sum()),
            }

    result = {
        "miou": miou,
        "accuracy": accuracy,
        "iou_per_class": iou_per_class.tolist(),
        "class_report": class_report,
    }
    if boundary_miou is not None:
        result["boundary_miou"] = boundary_miou

    return result


@torch.no_grad()
def evaluate_multitask(
    model: MultiTaskPointNet,
    dataloader,
    device: torch.device,
    num_classes: int = 33,
) -> Dict:
    """Full evaluation for multi-task model."""
    model.eval()

    all_tooth_preds = []
    all_tooth_labels = []
    all_gingiva_preds = []
    all_gingiva_labels = []
    plane_angle_errors = []
    plane_offset_errors = []
    transform_errors: List[Dict] = []

    for batch in dataloader:
        points = batch["points"].to(device)
        predictions = model(points)

        # Tooth segmentation
        tooth_preds = predictions["tooth_logits"].argmax(dim=-1).cpu().numpy()
        tooth_labels = batch["tooth_labels"].numpy()
        all_tooth_preds.append(tooth_preds.reshape(-1))
        all_tooth_labels.append(tooth_labels.reshape(-1))

        # Gingiva segmentation
        gingiva_preds = (
            predictions["gingiva_logits"].argmax(dim=-1).cpu().numpy()
        )
        gingiva_labels = batch["gingiva_labels"].numpy()
        all_gingiva_preds.append(gingiva_preds.reshape(-1))
        all_gingiva_labels.append(gingiva_labels.reshape(-1))

        # Base plane
        pred_planes = predictions["base_plane"].cpu().numpy()
        gt_planes = batch["base_plane"].numpy()
        for i in range(pred_planes.shape[0]):
            plane_angle_errors.append(
                compute_plane_angle_error(pred_planes[i], gt_planes[i])
            )
            plane_offset_errors.append(
                compute_plane_offset_error(pred_planes[i], gt_planes[i])
            )

        # Bite transform
        pred_transforms = predictions["bite_transform"].cpu().numpy()
        gt_transforms = batch["bite_transform"].numpy()
        for i in range(pred_transforms.shape[0]):
            transform_errors.append(
                compute_transform_errors(
                    pred_transforms[i], gt_transforms[i]
                )
            )

    # ---- Aggregate metrics ----

    # Tooth segmentation
    all_tooth_preds = np.concatenate(all_tooth_preds)
    all_tooth_labels = np.concatenate(all_tooth_labels)
    tooth_iou = compute_iou_per_class(
        all_tooth_preds, all_tooth_labels, num_classes
    )
    tooth_miou = compute_miou(tooth_iou)
    tooth_accuracy = float((all_tooth_preds == all_tooth_labels).mean())

    # Gingiva segmentation
    all_gingiva_preds = np.concatenate(all_gingiva_preds)
    all_gingiva_labels = np.concatenate(all_gingiva_labels)
    gingiva_iou = compute_iou_per_class(all_gingiva_preds, all_gingiva_labels, 2)
    gingiva_binary_iou = float(gingiva_iou[1]) if not np.isnan(gingiva_iou[1]) else 0.0
    gingiva_accuracy = float((all_gingiva_preds == all_gingiva_labels).mean())

    # Base plane
    mean_plane_angle = float(np.mean(plane_angle_errors))
    median_plane_angle = float(np.median(plane_angle_errors))
    mean_plane_offset = float(np.mean(plane_offset_errors))

    # Bite transform
    mean_translation_l2 = float(
        np.mean([e["translation_l2"] for e in transform_errors])
    )
    mean_rotation_degrees = float(
        np.mean([e["rotation_degrees"] for e in transform_errors])
    )

    results = {
        "tooth_segmentation": {
            "miou": tooth_miou,
            "accuracy": tooth_accuracy,
            "iou_per_class": tooth_iou.tolist(),
        },
        "gingiva_segmentation": {
            "iou": gingiva_binary_iou,
            "accuracy": gingiva_accuracy,
        },
        "base_plane": {
            "mean_angle_error_deg": mean_plane_angle,
            "median_angle_error_deg": median_plane_angle,
            "mean_offset_error": mean_plane_offset,
        },
        "bite_alignment": {
            "mean_translation_l2": mean_translation_l2,
            "mean_rotation_error_deg": mean_rotation_degrees,
        },
    }

    # Boundary IoU for tooth segmentation
    try:
        all_points = []
        for batch in dataloader:
            pts = batch["points"].numpy().reshape(-1, 3)
            all_points.append(pts)
        all_points_arr = np.concatenate(all_points)
        if len(all_points_arr) > 500_000:
            idx = np.random.choice(len(all_points_arr), 500_000, replace=False)
            boundary_miou = compute_boundary_iou(
                all_tooth_preds[idx], all_tooth_labels[idx],
                all_points_arr[idx], num_classes,
            )
        else:
            boundary_miou = compute_boundary_iou(
                all_tooth_preds, all_tooth_labels,
                all_points_arr, num_classes,
            )
        results["tooth_segmentation"]["boundary_miou"] = boundary_miou
    except Exception as e:
        logger.warning(f"Could not compute boundary IoU: {e}")

    return results


def print_results(results: Dict, multitask: bool):
    """Pretty-print evaluation results."""
    print("\n" + "=" * 60)
    print("EVALUATION RESULTS")
    print("=" * 60)

    if multitask:
        ts = results["tooth_segmentation"]
        print(f"\n🦷  Tooth Segmentation")
        print(f"    mIoU:          {ts['miou']:.4f}")
        print(f"    Accuracy:      {ts['accuracy']:.4f}")
        if "boundary_miou" in ts:
            print(f"    Boundary mIoU: {ts['boundary_miou']:.4f}")

        gs = results["gingiva_segmentation"]
        print(f"\n🔴  Gingiva Segmentation")
        print(f"    IoU:      {gs['iou']:.4f}")
        print(f"    Accuracy: {gs['accuracy']:.4f}")

        bp = results["base_plane"]
        print(f"\n📐  Base Plane Prediction")
        print(f"    Mean angle error:   {bp['mean_angle_error_deg']:.2f}°")
        print(f"    Median angle error: {bp['median_angle_error_deg']:.2f}°")
        print(f"    Mean offset error:  {bp['mean_offset_error']:.4f}")

        ba = results["bite_alignment"]
        print(f"\n🔧  Bite Alignment")
        print(f"    Mean translation L2:    {ba['mean_translation_l2']:.4f}")
        print(f"    Mean rotation error:    {ba['mean_rotation_error_deg']:.2f}°")
    else:
        print(f"\n🦷  Tooth Segmentation")
        print(f"    mIoU:          {results['miou']:.4f}")
        print(f"    Accuracy:      {results['accuracy']:.4f}")
        if "boundary_miou" in results:
            print(f"    Boundary mIoU: {results['boundary_miou']:.4f}")

    print("\n" + "=" * 60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Evaluate PointNet++ orthodontic model"
    )
    parser.add_argument("--data_root", type=str, required=True)
    parser.add_argument(
        "--checkpoint", type=str, default="infer",
        help='Path to model checkpoint, or "infer" to auto-discover latest'
    )
    parser.add_argument("--multitask", action="store_true")
    parser.add_argument("--num_points", type=int, default=4096)
    parser.add_argument("--batch_size", type=int, default=8)
    parser.add_argument("--num_workers", type=int, default=4)
    parser.add_argument("--num_classes", type=int, default=33)
    parser.add_argument("--split", type=str, default="test")
    parser.add_argument(
        "--output", type=str, default=None,
        help="Path to save results JSON",
    )
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

    # ---- Resolve checkpoint path ----
    checkpoint_path = Path(args.checkpoint)
    if args.checkpoint == "infer" or not checkpoint_path.exists():
        # Auto-discover model: try common locations
        candidates = [
            Path("models/tooth_segmentation_model.pt"),
            Path("models/best.pth"),
            Path("output/best.pth"),
            Path("output/latest.pth"),
            Path(args.data_root).parent / "output" / "best.pth",
        ]
        checkpoint_path = None
        for c in candidates:
            if c.exists():
                checkpoint_path = c
                break
        if checkpoint_path is None:
            logger.error(
                "No model checkpoint found. Searched: %s",
                ", ".join(str(c) for c in candidates),
            )
            return
        logger.info(f"Auto-discovered model: {checkpoint_path}")

    checkpoint = torch.load(str(checkpoint_path), map_location=device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model = model.to(device)
    logger.info(f"Loaded checkpoint: {checkpoint_path}")

    # ---- Data ----
    mode = "multitask" if args.multitask else "segmentation"
    loaders = create_dataloaders(
        data_root=args.data_root,
        mode=mode,
        num_points=args.num_points,
        batch_size=args.batch_size,
        num_workers=args.num_workers,
    )

    if args.split not in loaders:
        logger.error(f"Split '{args.split}' not found in data.")
        return

    dataloader = loaders[args.split]
    logger.info(f"Evaluating on {len(dataloader.dataset)} samples ({args.split})")

    # ---- Evaluate ----
    if args.multitask:
        results = evaluate_multitask(
            model, dataloader, device, args.num_classes
        )
    else:
        results = evaluate_segmentation(
            model, dataloader, device, args.num_classes
        )

    print_results(results, args.multitask)

    # Save results
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Convert numpy types for JSON serialization
        def to_serializable(obj):
            if isinstance(obj, (np.integer,)):
                return int(obj)
            if isinstance(obj, (np.floating,)):
                return float(obj)
            if isinstance(obj, np.ndarray):
                return obj.tolist()
            return obj

        with open(output_path, "w") as f:
            json.dump(results, f, indent=2, default=to_serializable)
        logger.info(f"Results saved to: {output_path}")


if __name__ == "__main__":
    main()
