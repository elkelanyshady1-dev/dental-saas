"""
log_helpers.py — Dashboard-compatible JSON log writers for the training pipeline.

Three files are written to the log directory:

    training_metrics.json
        Cumulative epoch history.  Format::

            {
              "total_epochs": 100,
              "history": [
                {"epoch": 1, "train_loss": 0.82, "val_loss": 0.91, "lr": 0.001, ...},
                ...
              ]
            }

    session_status.json
        Live progress snapshot (overwritten each epoch).  Format::

            {
              "status": "running",   # running | done | error
              "epoch": 5,
              "total_epochs": 100,
              "progress_pct": 5.0,
              "progress": 0.05,     # ← NEW: normalised 0.0–1.0 for progress bar
              "best_val_metric": 0.312,
              "last_train_loss": 0.74,
              "last_val_loss": 0.81,
              "timestamp": "2026-03-08T10:44:23"
            }

    preview_mesh.json  (NEW)
        Latest 3-D segmentation snapshot written every PREVIEW_INTERVAL epochs.
        Format::

            {
              "epoch": 10,
              "total_epochs": 100,
              "timestamp": "2026-03-08T10:44:23",
              "points": [[x, y, z], ...],   # sampled point cloud (N × 3)
              "labels": [int, ...],          # per-point predicted label
              "n_points": N
            }

These files are consumed by the dental dashboard front-end to show
real-time training progress without polling TensorBoard.
"""

from __future__ import annotations

import datetime
import json
from pathlib import Path
from typing import Dict, List, Optional


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _write_json(path: Path, data: dict) -> None:
    """Atomically write a JSON file (write to .tmp then rename)."""
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(path)


def safe_meta_path(path: Path, suffix: str = "_meta.json") -> Path:
    """
    Construct a metadata companion path *correctly*.

    Path.with_suffix("_meta.json") raises ValueError because
    "_meta.json" is not a valid extension (contains underscore before dot).
    This helper does the right thing::

        safe_meta_path(Path("model.pt"))
        → Path("model_meta.json")

        safe_meta_path(Path("/out/best.pth"), "_meta.json")
        → Path("/out/best_meta.json")
    """
    return path.with_name(path.stem + suffix)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def write_training_metrics(
    log_dir: Path,
    epoch: int,
    total_epochs: int,
    train_metrics: Dict[str, float],
    val_metrics: Optional[Dict[str, float]],
    lr: float,
    elapsed_s: float,
    history: List[dict],
) -> None:
    """
    Append per-epoch metrics to ``{log_dir}/training_metrics.json``.

    Parameters
    ----------
    log_dir       : directory where the file will be written
    epoch         : 0-indexed current epoch
    total_epochs  : total number of planned epochs
    train_metrics : dict of metric_name → float from the training loop
    val_metrics   : dict or None (val loss/acc if a val split exists)
    lr            : current learning rate
    elapsed_s     : seconds this epoch took
    history       : mutable list — new record is appended in-place
    """
    record: dict = {
        "epoch": epoch + 1,
        "lr": round(lr, 8),
        "elapsed_s": round(elapsed_s, 2),
        **{f"train_{k}": round(float(v), 6) for k, v in train_metrics.items()},
    }
    if val_metrics:
        record.update(
            {f"val_{k}": round(float(v), 6) for k, v in val_metrics.items()}
        )
    history.append(record)

    _write_json(
        log_dir / "training_metrics.json",
        {"total_epochs": total_epochs, "history": history},
    )


def write_session_status(
    log_dir: Path,
    status: str,
    epoch: int,
    total_epochs: int,
    best_val_metric: float,
    train_metrics: Optional[Dict[str, float]] = None,
    val_metrics: Optional[Dict[str, float]] = None,
) -> None:
    """
    Write/overwrite ``{log_dir}/session_status.json`` with a live snapshot.

    Parameters
    ----------
    log_dir          : directory where the file will be written
    status           : "running" | "done" | "error"
    epoch            : epochs completed so far (1-indexed for display)
    total_epochs     : total epochs planned
    best_val_metric  : best validation metric seen; float("inf") → None in JSON
    train_metrics    : optional train metric dict (for last_train_loss field)
    val_metrics      : optional val metric dict   (for last_val_loss field)
    """
    payload: dict = {
        "status": status,
        "epoch": epoch,
        "total_epochs": total_epochs,
        "progress_pct": round(100.0 * epoch / max(total_epochs, 1), 2),
        "best_val_metric": (
            round(float(best_val_metric), 6)
            if best_val_metric != float("inf")
            else None
        ),
        "timestamp": datetime.datetime.now().isoformat(timespec="seconds"),
    }

    if train_metrics:
        key = "total" if "total" in train_metrics else "loss"
        if key in train_metrics:
            payload["last_train_loss"] = round(float(train_metrics[key]), 6)

    if val_metrics:
        key = "total" if "total" in val_metrics else "loss"
        if key in val_metrics:
            payload["last_val_loss"] = round(float(val_metrics[key]), 6)

    # Normalised progress (0.0 – 1.0) — used directly by the progress bar
    payload["progress"] = round(payload["progress_pct"] / 100.0, 6)

    _write_json(log_dir / "session_status.json", payload)


# ---------------------------------------------------------------------------
# Live 3-D prediction preview writer
# ---------------------------------------------------------------------------

def write_preview_mesh(
    log_dir: Path,
    epoch: int,
    total_epochs: int,
    points: "list | None",
    labels: "list | None",
) -> None:
    """
    Overwrite ``{log_dir}/preview_mesh.json`` with the latest per-epoch
    3-D segmentation snapshot so the dashboard can render a live preview.

    Parameters
    ----------
    log_dir       : directory where the file will be written
    epoch         : current epoch number (1-indexed for display)
    total_epochs  : total planned epochs
    points        : list of [x, y, z] coordinates  (sub-sampled to MAX_PREVIEW_PTS)
    labels        : list of int labels, one per point
    """
    MAX_PREVIEW_PTS = 8_000  # cap to stay under ~1 MB of JSON

    if points is None or labels is None:
        return

    n = len(points)
    if n > MAX_PREVIEW_PTS:
        # Uniform stride sub-sampling — no numpy required
        step = max(1, n // MAX_PREVIEW_PTS)
        points = points[::step][:MAX_PREVIEW_PTS]
        labels = labels[::step][:MAX_PREVIEW_PTS]
        n = len(points)

    payload = {
        "epoch":        epoch,
        "total_epochs": total_epochs,
        "timestamp":    datetime.datetime.now().isoformat(timespec="seconds"),
        "n_points":     n,
        "points":       points,
        "labels":       labels,
    }
    _write_json(log_dir / "preview_mesh.json", payload)
