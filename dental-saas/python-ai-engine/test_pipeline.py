"""
test_pipeline.py — Standalone integration test for the boundary-aware sampling pipeline.

Validates Steps 1–8 without requiring PyTorch:
  - detect_boundary_vertices  (dataset/core.py)
  - boundary_aware_sampling   (dataset/core.py)
  - detect_boundary_points    (dataset/geometry/boundary_detection.py)
  - estimate_curvature        (dataset/geometry/curvature_estimation.py)
  - boundary_aware_sampling   (dataset/sampling/boundary_sampler.py)
  - meta.json contains sampling_method + boundary_ratio
  - logs/training_metrics.json format
  - logs/session_status.json format

Usage
-----
    cd dental-saas/python-ai-engine
    python test_pipeline.py
"""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

import numpy as np

# Make sure the ai-engine root is on sys.path
ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

PASS = "\033[92m  [PASS]\033[0m"
FAIL = "\033[91m  [FAIL]\033[0m"
INFO = "\033[94m  [INFO]\033[0m"


def header(title: str) -> None:
    print(f"\n\033[1m{'=' * 55}\n  {title}\n{'=' * 55}\033[0m")


def check(cond: bool, msg: str) -> bool:
    if cond:
        print(f"{PASS} {msg}")
    else:
        print(f"{FAIL} {msg}")
    return cond


# ---------------------------------------------------------------------------
# Test 1 — dataset/core.py: detect_boundary_vertices
# ---------------------------------------------------------------------------
header("Test 1 — detect_boundary_vertices (dataset/core.py)")

passed = 0
total = 0

try:
    from dataset.core import detect_boundary_vertices

    # Fake mesh with 100 vertices in a 10×10 grid
    verts = np.random.default_rng(0).uniform(-10, 10, (100, 3)).astype(np.float32)

    class _Mesh:
        def __init__(self, v):
            self.vertices = v

    full_mesh = _Mesh(verts)

    # Tooth mesh centred at origin — vertices near (0,0,0)
    tooth_verts = np.random.default_rng(1).uniform(-1, 1, (20, 3)).astype(np.float32)
    tooth_mesh = _Mesh(tooth_verts)

    mask = detect_boundary_vertices(full_mesh, [tooth_mesh], threshold=3.0)

    total += 1
    if check(mask.dtype == bool, "Returns bool array"):
        passed += 1
    total += 1
    if check(mask.shape == (100,), f"Shape is (100,) → got {mask.shape}"):
        passed += 1
    total += 1
    if check(mask.sum() > 0, f"At least one boundary vertex detected ({mask.sum()} found)"):
        passed += 1

except Exception as e:
    print(f"{FAIL} detect_boundary_vertices raised: {e}")
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Test 2 — dataset/core.py: boundary_aware_sampling (mesh-based)
# ---------------------------------------------------------------------------
header("Test 2 — boundary_aware_sampling (dataset/core.py)")

try:
    from dataset.core import boundary_aware_sampling as mesh_bas

    N_OUT = 500
    pts = mesh_bas(full_mesh, [tooth_mesh], n_points=N_OUT, boundary_ratio=0.3)

    total += 1
    if check(pts.shape == (N_OUT, 3), f"Output shape ({pts.shape}) == ({N_OUT}, 3)"):
        passed += 1
    total += 1
    if check(pts.dtype == np.float32, f"dtype is float32 → {pts.dtype}"):
        passed += 1

except Exception as e:
    print(f"{FAIL} mesh boundary_aware_sampling raised: {e}")
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Test 3 — dataset/geometry: detect_boundary_points (label-aware)
# ---------------------------------------------------------------------------
header("Test 3 — detect_boundary_points (geometry/boundary_detection.py)")

try:
    from dataset.geometry.boundary_detection import detect_boundary_points

    pts3 = np.random.default_rng(2).uniform(-5, 5, (200, 3)).astype(np.float32)
    labels3 = np.zeros(200, dtype=np.int64)
    labels3[100:] = 1   # half gingiva, half tooth-1

    mask3 = detect_boundary_points(pts3, labels3, k=8)

    total += 1
    if check(mask3.shape == (200,), f"Shape (200,) → {mask3.shape}"):
        passed += 1
    total += 1
    if check(mask3.dtype == bool, f"dtype bool → {mask3.dtype}"):
        passed += 1
    total += 1
    if check(mask3.sum() > 0, f"Found {mask3.sum()} boundary points"):
        passed += 1

except Exception as e:
    print(f"{FAIL} detect_boundary_points raised: {e}")
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Test 4 — dataset/geometry: estimate_curvature
# ---------------------------------------------------------------------------
header("Test 4 — estimate_curvature (geometry/curvature_estimation.py)")

try:
    from dataset.geometry.curvature_estimation import estimate_curvature

    curv = estimate_curvature(pts3, k=10)

    total += 1
    if check(curv.shape == (200,), f"Shape (200,) → {curv.shape}"):
        passed += 1
    total += 1
    if check(curv.dtype == np.float32, f"dtype float32 → {curv.dtype}"):
        passed += 1
    total += 1
    if check(np.all(curv >= 0), "All curvature values non-negative"):
        passed += 1

except Exception as e:
    print(f"{FAIL} estimate_curvature raised: {e}")
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Test 5 — dataset/sampling: composite boundary_aware_sampling
# ---------------------------------------------------------------------------
header("Test 5 — composite boundary_aware_sampling (sampling/boundary_sampler.py)")

try:
    from dataset.sampling.boundary_sampler import boundary_aware_sampling as composite_bas

    pts5 = np.random.default_rng(3).uniform(-5, 5, (500, 3)).astype(np.float32)
    labels5 = np.zeros(500, dtype=np.int64)
    labels5[200:] = 1

    sampled_pts, sampled_lbl, stats = composite_bas(
        pts5, labels5, n_points=100, seed=42
    )

    total += 1
    if check(sampled_pts.shape == (100, 3), f"Output pts shape (100,3) → {sampled_pts.shape}"):
        passed += 1
    total += 1
    if check(sampled_lbl.shape == (100,), f"Output labels shape (100,) → {sampled_lbl.shape}"):
        passed += 1
    total += 1
    if check(stats.total_points == 100, f"stats.total_points = 100 → {stats.total_points}"):
        passed += 1

except Exception as e:
    print(f"{FAIL} composite boundary_aware_sampling raised: {e}")
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Test 6 — meta.json format: sampling_method + boundary_ratio keys
# ---------------------------------------------------------------------------
header("Test 6 — meta.json sampling_method + boundary_ratio keys")

try:
    case_dir = ROOT / "datasets" / "synthetic_cases" / "case_001"
    meta_path = case_dir / "meta.json"

    total += 1
    if meta_path.exists():
        meta = json.loads(meta_path.read_text())
        if check("sampling_method" in meta, "meta.json has 'sampling_method' key"):
            passed += 1
        total += 1
        if check("boundary_ratio" in meta, "meta.json has 'boundary_ratio' key"):
            passed += 1
        total += 1
        if check(meta.get("sampling_method") == "boundary_aware",
                 f"sampling_method == 'boundary_aware' → '{meta.get('sampling_method')}'"):
            passed += 1
        total += 1
        if check(meta.get("boundary_ratio") == 0.3,
                 f"boundary_ratio == 0.3 → {meta.get('boundary_ratio')}"):
            passed += 1
    else:
        print(f"{FAIL} case_001/meta.json not found — run make_synthetic_dataset first")
        passed -= 0   # don't count this as a pass

except Exception as e:
    print(f"{FAIL} meta.json check raised: {e}")
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Test 7 — session_status.json format
# ---------------------------------------------------------------------------
header("Test 7 — logs/session_status.json format validation")

try:
    from train.log_helpers import _write_json, write_session_status

    test_log_dir = ROOT / "logs"
    test_log_dir.mkdir(exist_ok=True)

    write_session_status(
        log_dir=test_log_dir,
        status="running",
        epoch=1,
        total_epochs=10,
        best_val_metric=0.512,
        train_metrics={"loss": 0.832, "accuracy": 0.71},
    )

    status_path = test_log_dir / "session_status.json"
    total += 1
    if check(status_path.exists(), "session_status.json created"):
        passed += 1
        doc = json.loads(status_path.read_text())
        total += 1
        if check(doc.get("status") == "running", f"status='running' → '{doc.get('status')}'"):
            passed += 1
        total += 1
        if check(doc.get("epoch") == 1, f"epoch=1 → {doc.get('epoch')}"):
            passed += 1
        total += 1
        if check(doc.get("progress_pct") == 10.0, f"progress_pct=10.0 → {doc.get('progress_pct')}"):
            passed += 1
        total += 1
        if check(doc.get("last_train_loss") == 0.832, f"last_train_loss=0.832 → {doc.get('last_train_loss')}"):
            passed += 1

except Exception as e:
    print(f"{FAIL} session_status.json test raised: {e}")
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Test 8 — training_metrics.json format
# ---------------------------------------------------------------------------
header("Test 8 — logs/training_metrics.json format validation")

try:
    from train.log_helpers import write_training_metrics

    history = []
    write_training_metrics(
        log_dir=test_log_dir,
        epoch=0,
        total_epochs=10,
        train_metrics={"loss": 1.23, "accuracy": 0.45},
        val_metrics=None,
        lr=0.001,
        elapsed_s=12.5,
        history=history,
    )

    metrics_path = test_log_dir / "training_metrics.json"
    total += 1
    if check(metrics_path.exists(), "training_metrics.json created"):
        passed += 1
        doc = json.loads(metrics_path.read_text())
        total += 1
        if check("history" in doc, "has 'history' key"):
            passed += 1
        total += 1
        if check(len(doc["history"]) == 1, f"history has 1 entry → {len(doc['history'])}"):
            passed += 1
        rec = doc["history"][0]
        total += 1
        if check(rec.get("epoch") == 1, f"epoch=1 → {rec.get('epoch')}"):
            passed += 1
        total += 1
        if check("train_loss" in rec, f"train_loss key present → {list(rec.keys())}"):
            passed += 1

except Exception as e:
    print(f"{FAIL} training_metrics.json test raised: {e}")
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
header("SUMMARY")
pct = 100 * passed // max(total, 1)
colour = "\033[92m" if pct >= 80 else "\033[93m" if pct >= 60 else "\033[91m"
print(f"\n  {colour}{passed}/{total} tests passed ({pct}%)\033[0m\n")
sys.exit(0 if passed == total else 1)
