"""
ONNX export for PointNet++ orthodontic models.

Exports the trained model to ONNX format for inference deployment.
Multi-task models export all four outputs:
    tooth_logits, gingiva_logits, base_plane, bite_transform

Usage:
    # Single-task
    python -m train.export_model --checkpoint best.pth --output model.onnx

    # Multi-task
    python -m train.export_model --checkpoint best.pth --output model.onnx --multitask
"""

import argparse
import logging
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Wrapper modules for clean ONNX export (dict outputs → tuple)
# ---------------------------------------------------------------------------

class MultiTaskExportWrapper(nn.Module):
    """
    Wraps MultiTaskPointNet to produce tuple outputs for ONNX export.
    ONNX doesn't support dict outputs directly.
    """

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, xyz):
        out = self.model(xyz)
        return (
            out["tooth_logits"],
            out["gingiva_logits"],
            out["base_plane"],
            out["bite_transform"],
        )


# ---------------------------------------------------------------------------
# Export functions
# ---------------------------------------------------------------------------

def export_segmentation(
    checkpoint_path: str,
    output_path: str,
    num_classes: int = 33,
    num_points: int = 4096,
    opset_version: int = 17,
):
    """Export single-task segmentation model to ONNX."""
    from .pointnet2_segmentation import PointNet2Segmentation

    device = torch.device("cpu")

    model = PointNet2Segmentation(num_classes=num_classes)
    checkpoint = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    dummy_input = torch.randn(1, num_points, 3)

    logger.info(f"Exporting segmentation model to {output_path}...")

    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=opset_version,
        do_constant_folding=True,
        input_names=["points"],
        output_names=["tooth_logits"],
        dynamic_axes={
            "points": {0: "batch_size", 1: "num_points"},
            "tooth_logits": {0: "batch_size", 1: "num_points"},
        },
    )

    _validate_onnx(output_path, dummy_input, model)
    logger.info("✓ Segmentation model exported successfully.")


def export_multitask(
    checkpoint_path: str,
    output_path: str,
    num_classes: int = 33,
    num_points: int = 4096,
    opset_version: int = 17,
):
    """Export multi-task model to ONNX with all 4 outputs."""
    from .multitask_pointnet import MultiTaskPointNet

    device = torch.device("cpu")

    model = MultiTaskPointNet(num_tooth_classes=num_classes)
    checkpoint = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    # Wrap for tuple output
    export_model = MultiTaskExportWrapper(model)
    export_model.eval()

    dummy_input = torch.randn(1, num_points, 3)

    logger.info(f"Exporting multi-task model to {output_path}...")

    torch.onnx.export(
        export_model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=opset_version,
        do_constant_folding=True,
        input_names=["points"],
        output_names=[
            "tooth_logits",
            "gingiva_logits",
            "base_plane",
            "bite_transform",
        ],
        dynamic_axes={
            "points": {0: "batch_size", 1: "num_points"},
            "tooth_logits": {0: "batch_size", 1: "num_points"},
            "gingiva_logits": {0: "batch_size", 1: "num_points"},
            "base_plane": {0: "batch_size"},
            "bite_transform": {0: "batch_size"},
        },
    )

    _validate_onnx_multitask(output_path, dummy_input, model, num_points)
    logger.info("✓ Multi-task model exported successfully.")


def _validate_onnx(
    onnx_path: str, dummy_input: torch.Tensor, model: nn.Module
):
    """Validate ONNX export by comparing against PyTorch output."""
    try:
        import onnx
        import onnxruntime as ort

        # Structural check
        onnx_model = onnx.load(onnx_path)
        onnx.checker.check_model(onnx_model)
        logger.info("  ONNX structural check passed.")

        # Numerical check
        session = ort.InferenceSession(onnx_path)
        input_np = dummy_input.numpy()
        onnx_outputs = session.run(None, {"points": input_np})

        with torch.no_grad():
            torch_output = model(dummy_input).numpy()

        max_diff = np.max(np.abs(onnx_outputs[0] - torch_output))
        logger.info(f"  Max numerical difference: {max_diff:.6e}")

        if max_diff < 1e-4:
            logger.info("  ✓ Numerical validation passed.")
        else:
            logger.warning(
                f"  ⚠ Large numerical difference: {max_diff:.6e}"
            )

    except ImportError:
        logger.warning(
            "  onnx/onnxruntime not installed — skipping validation."
        )


def _validate_onnx_multitask(
    onnx_path: str,
    dummy_input: torch.Tensor,
    model: nn.Module,
    num_points: int,
):
    """Validate multi-task ONNX export."""
    try:
        import onnx
        import onnxruntime as ort

        onnx_model = onnx.load(onnx_path)
        onnx.checker.check_model(onnx_model)
        logger.info("  ONNX structural check passed.")

        session = ort.InferenceSession(onnx_path)
        input_np = dummy_input.numpy()
        onnx_outputs = session.run(None, {"points": input_np})

        with torch.no_grad():
            torch_outputs = model(dummy_input)

        output_names = [
            "tooth_logits", "gingiva_logits", "base_plane", "bite_transform"
        ]
        expected_shapes = [
            (1, num_points, 33), (1, num_points, 2), (1, 4), (1, 6)
        ]

        all_ok = True
        for i, (name, expected_shape) in enumerate(
            zip(output_names, expected_shapes)
        ):
            actual_shape = onnx_outputs[i].shape
            torch_val = torch_outputs[name].numpy()
            max_diff = np.max(np.abs(onnx_outputs[i] - torch_val))

            shape_ok = actual_shape == expected_shape
            num_ok = max_diff < 1e-4

            status = "✓" if (shape_ok and num_ok) else "✗"
            logger.info(
                f"  {status} {name}: shape={actual_shape} "
                f"(expected {expected_shape}) max_diff={max_diff:.6e}"
            )

            if not (shape_ok and num_ok):
                all_ok = False

        if all_ok:
            logger.info("  ✓ All multi-task outputs validated.")
        else:
            logger.warning("  ⚠ Some outputs failed validation.")

    except ImportError:
        logger.warning(
            "  onnx/onnxruntime not installed — skipping validation."
        )


def print_model_info(onnx_path: str):
    """Print ONNX model input/output info."""
    try:
        import onnx

        model = onnx.load(onnx_path)
        print("\n" + "=" * 50)
        print("ONNX MODEL INFO")
        print("=" * 50)

        print("\nInputs:")
        for inp in model.graph.input:
            shape = [
                d.dim_value or d.dim_param
                for d in inp.type.tensor_type.shape.dim
            ]
            print(f"  {inp.name}: {shape}")

        print("\nOutputs:")
        for out in model.graph.output:
            shape = [
                d.dim_value or d.dim_param
                for d in out.type.tensor_type.shape.dim
            ]
            print(f"  {out.name}: {shape}")

        # File size
        path = Path(onnx_path)
        size_mb = path.stat().st_size / (1024 * 1024)
        print(f"\nFile size: {size_mb:.1f} MB")
        print("=" * 50 + "\n")

    except ImportError:
        pass


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Export PointNet++ model to ONNX"
    )
    parser.add_argument("--checkpoint", type=str, required=True)
    parser.add_argument("--output", type=str, required=True)
    parser.add_argument("--multitask", action="store_true")
    parser.add_argument("--num_classes", type=int, default=33)
    parser.add_argument("--num_points", type=int, default=4096)
    parser.add_argument("--opset_version", type=int, default=17)
    return parser.parse_args()


def main():
    args = parse_args()

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    if args.multitask:
        export_multitask(
            checkpoint_path=args.checkpoint,
            output_path=args.output,
            num_classes=args.num_classes,
            num_points=args.num_points,
            opset_version=args.opset_version,
        )
    else:
        export_segmentation(
            checkpoint_path=args.checkpoint,
            output_path=args.output,
            num_classes=args.num_classes,
            num_points=args.num_points,
            opset_version=args.opset_version,
        )

    print_model_info(args.output)


if __name__ == "__main__":
    main()
