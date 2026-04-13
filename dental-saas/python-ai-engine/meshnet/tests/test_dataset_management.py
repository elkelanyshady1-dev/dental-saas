"""
test_dataset_management.py — Unit tests for the dataset protection system.
===========================================================================

Tests all 5 modules without requiring actual GPU or large data:

    1. DatasetRegistry          — CRUD, report, persistence
    2. DatasetIntegrityChecker  — all 7 checks
    3. DatasetMerger            — rebuild, manifest, skip logic
    4. DatasetVersionManager    — version bumps, model linking
    5. DatasetBackup            — snapshot, list, prune

Run:
    python -m pytest meshnet/tests/test_dataset_management.py -v
    # or
    python meshnet/tests/test_dataset_management.py
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

# ── Add engine root to path ───────────────────────────────────────────────────
_THIS = Path(__file__).resolve()
_ENGINE_ROOT = _THIS.parents[2]
if str(_ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(_ENGINE_ROOT))

from meshnet.dataset_management import (
    DatasetRegistry, CaseRecord,
    DatasetIntegrityChecker, IntegrityReport,
    DatasetMerger, MergeReport,
    DatasetVersionManager, DatasetVersion,
    DatasetBackup,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_case(
    parent_dir: Path,
    case_id: str,
    n_pts: int = 512,
    max_label: int = 5,
    coarse: bool = False,
    corrupt_labels: bool = False,
    all_gingiva: bool = False,
    nan_pts: bool = False,
    only_points: bool = False,
) -> Path:
    """
    Create a synthetic processed case directory.

    Args:
        parent_dir:     where to create case_id/
        nan_pts:        put NaN values in points (triggers integrity error)
        only_points:    skip tooth_labels.npy (tests missing-file check)
    """
    case_dir = parent_dir / case_id
    case_dir.mkdir(parents=True, exist_ok=True)

    pts = np.random.randn(n_pts, 3).astype(np.float32)
    if nan_pts:
        pts[0, 0] = float("nan")

    np.save(case_dir / "points.npy", pts)

    if not only_points:
        if all_gingiva:
            lbl = np.zeros(n_pts, dtype=np.int32)
        elif corrupt_labels:
            lbl = np.ones(n_pts, dtype=np.int32) * 99   # out of range
        else:
            lbl = np.random.randint(0, max_label + 1, n_pts).astype(np.int32)
            lbl[: n_pts // 2] = np.arange(1, max_label + 1)[: n_pts // 2]  # ensure tooth labels

        np.save(case_dir / "tooth_labels.npy", lbl)

        if coarse:
            coarse_lbl = (lbl > 0).astype(np.int32)
            np.save(case_dir / "coarse_labels.npy", coarse_lbl)

    return case_dir


# ═══════════════════════════════════════════════════════════════════════════════
# 1. DatasetRegistry
# ═══════════════════════════════════════════════════════════════════════════════

class TestDatasetRegistry(unittest.TestCase):

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp())
        self.registry_path = self.tmpdir / "registry.json"

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _make_registry(self):
        return DatasetRegistry(self.registry_path)

    def test_create_empty(self):
        reg = self._make_registry()
        self.assertEqual(len(reg), 0)

    def test_register_case(self):
        reg = self._make_registry()
        rec = reg.register_case(
            "case001", "processed", scan_type="maxillary", n_points=4096
        )
        self.assertIsInstance(rec, CaseRecord)
        self.assertEqual(rec.case_id, "case001")
        self.assertEqual(len(reg), 1)

    def test_persistence(self):
        reg = self._make_registry()
        reg.register_case("case001", "processed")
        reg.register_case("case002", "synthetic")

        reg2 = DatasetRegistry(self.registry_path)
        self.assertEqual(len(reg2), 2)
        self.assertTrue(reg2.is_registered("case001"))
        self.assertTrue(reg2.is_registered("case002"))

    def test_no_duplicate(self):
        reg = self._make_registry()
        reg.register_case("case001", "processed")
        rec2 = reg.register_case("case001", "processed")  # should not duplicate
        self.assertEqual(len(reg), 1)

    def test_overwrite(self):
        reg = self._make_registry()
        reg.register_case("case001", "processed", n_points=100)
        reg.register_case("case001", "processed", n_points=999, overwrite=True)
        self.assertEqual(reg.get_case("case001").n_points, 999)

    def test_mark_removed(self):
        reg = self._make_registry()
        reg.register_case("case001", "processed")
        reg.mark_removed("case001")
        self.assertEqual(len(reg), 0)  # active count
        self.assertTrue(reg.is_registered("case001"))  # still in registry

    def test_get_cases_by_source(self):
        reg = self._make_registry()
        reg.register_case("case001", "processed")
        reg.register_case("case002", "synthetic")
        reg.register_case("case003", "processed")
        proc = reg.get_cases_by_source("processed")
        self.assertEqual(len(proc), 2)
        synth = reg.get_cases_by_source("synthetic")
        self.assertEqual(len(synth), 1)

    def test_report(self):
        reg = self._make_registry()
        reg.register_case("case001", "processed", scan_type="maxillary")
        reg.register_case("case002", "synthetic", scan_type="mandibular")
        report = reg.generate_report()
        self.assertEqual(report["total"], 2)
        self.assertEqual(report["by_source"]["processed"], 1)
        self.assertIn("by_scan_type", report)

    def test_get_unregistered(self):
        reg = self._make_registry()
        reg.register_case("case001", "processed")
        new = reg.get_unregistered(["case001", "case002", "case003"])
        self.assertEqual(sorted(new), ["case002", "case003"])


# ═══════════════════════════════════════════════════════════════════════════════
# 2. DatasetIntegrityChecker
# ═══════════════════════════════════════════════════════════════════════════════

class TestDatasetIntegrityChecker(unittest.TestCase):

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp())
        self.processed = self.tmpdir / "processed_cases"
        self.processed.mkdir()

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _checker(self, **kwargs):
        return DatasetIntegrityChecker(
            processed_dir=self.processed,
            **kwargs
        )

    def test_pass_valid_cases(self):
        _make_case(self.processed, "case001")
        _make_case(self.processed, "case002")
        report = self._checker().run()
        self.assertTrue(report.passed, report.summary())

    def test_fail_missing_tooth_labels(self):
        _make_case(self.processed, "case001", only_points=True)
        report = self._checker().run()
        self.assertFalse(report.passed)
        self.assertTrue(any("tooth_labels" in e for e in report.errors))

    def test_fail_all_gingiva(self):
        _make_case(self.processed, "case001", all_gingiva=True)
        report = self._checker().run()
        self.assertFalse(report.passed)
        self.assertTrue(any("gingiva" in e.lower() for e in report.errors))

    def test_fail_nan_points(self):
        _make_case(self.processed, "case001", nan_pts=True, abort_on_nan=True)
        report = self._checker(abort_on_nan=True).run()
        self.assertFalse(report.passed)

    def test_fail_min_cases(self):
        _make_case(self.processed, "case001")
        report = self._checker(min_cases=5).run()
        self.assertFalse(report.passed)

    def test_fail_nonexistent_dir(self):
        checker = DatasetIntegrityChecker(
            processed_dir=self.tmpdir / "does_not_exist"
        )
        report = checker.run()
        self.assertFalse(report.passed)

    def test_coarse_labels_valid(self):
        _make_case(self.processed, "case001", coarse=True)
        report = self._checker().run()
        self.assertTrue(report.passed, report.summary())

    def test_out_of_range_labels(self):
        _make_case(self.processed, "case001", corrupt_labels=True, max_label=99)
        report = self._checker(max_label=32).run()
        self.assertFalse(report.passed)

    def test_stats_populated(self):
        _make_case(self.processed, "caseX")
        report = self._checker().run()
        self.assertIn("total_cases", report.stats)
        self.assertGreater(report.stats["total_cases"], 0)


# hack: inject abort_on_nan into case creation via param
def _make_case(parent_dir, case_id, n_pts=512, max_label=5, coarse=False,
               corrupt_labels=False, all_gingiva=False, nan_pts=False,
               only_points=False, abort_on_nan=None):
    # Intercept abort_on_nan param (not used in file creation, passed to checker)
    return _orig_make_case(parent_dir, case_id, n_pts, max_label, coarse,
                           corrupt_labels, all_gingiva, nan_pts, only_points)

_orig_make_case = locals().get("_make_case", None) or _make_case

# Reset to the module-level version
import inspect
_make_case = inspect.getmodule(inspect.currentframe())  # type: ignore


# ═══════════════════════════════════════════════════════════════════════════════
# 3. DatasetMerger
# ═══════════════════════════════════════════════════════════════════════════════

class TestDatasetMerger(unittest.TestCase):

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp())
        self.processed = self.tmpdir / "processed_cases"
        self.synthetic = self.tmpdir / "synthetic_cases"
        self.output    = self.tmpdir / "merged_dataset"
        self.processed.mkdir()
        self.synthetic.mkdir()

        # Make some valid cases
        for i in range(3):
            pts = np.random.randn(256, 3).astype(np.float32)
            lbl = np.random.randint(1, 6, 256).astype(np.int32)
            case = self.processed / f"case_{i:03d}"
            case.mkdir()
            np.save(case / "points.npy", pts)
            np.save(case / "tooth_labels.npy", lbl)

        # Synthetic: 2 valid + 1 invalid (no labels)
        for i in range(2):
            pts = np.random.randn(256, 3).astype(np.float32)
            lbl = np.random.randint(1, 6, 256).astype(np.int32)
            case = self.synthetic / f"synth_{i:03d}"
            case.mkdir()
            np.save(case / "points.npy", pts)
            np.save(case / "tooth_labels.npy", lbl)

        # Invalid synthetic (missing labels)
        bad = self.synthetic / "synth_bad"
        bad.mkdir()
        np.save(bad / "points.npy", np.zeros((64, 3), np.float32))

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _merger(self, **kwargs):
        return DatasetMerger(
            processed_dir=self.processed,
            synthetic_dir=self.synthetic,
            output_dir=self.output,
            **kwargs,
        )

    def test_rebuild_count(self):
        report = self._merger().rebuild()
        # 3 processed + 2 valid synthetic = 5 merged
        self.assertEqual(report.total_cases, 5)
        self.assertEqual(report.processed_cases, 3)
        self.assertEqual(report.synthetic_cases, 2)

    def test_skips_invalid(self):
        report = self._merger().rebuild()
        self.assertEqual(report.skipped_cases, 1)  # synth_bad
        self.assertIn("synth_bad", report.skipped_reasons)

    def test_output_files_exist(self):
        self._merger().rebuild()
        self.assertTrue((self.output / "manifest.json").exists())
        case_dirs = [p for p in self.output.iterdir() if p.is_dir()]
        self.assertEqual(len(case_dirs), 5)

    def test_manifest_content(self):
        self._merger(version=7).rebuild()
        manifest = json.loads((self.output / "manifest.json").read_text())
        self.assertEqual(manifest["version"], 7)
        self.assertEqual(manifest["total_cases"], 5)
        self.assertIn("cases", manifest)

    def test_overwrite(self):
        self._merger().rebuild()
        # Add 1 more case and rebuild
        extra = self.processed / "case_extra"
        extra.mkdir()
        np.save(extra / "points.npy", np.zeros((64, 3), np.float32))
        np.save(extra / "tooth_labels.npy", np.ones(64, np.int32))

        report2 = self._merger(overwrite=True).rebuild()
        self.assertEqual(report2.processed_cases, 4)

    def test_no_source_dirs(self):
        """Should succeed with 0 cases if all source dirs are absent."""
        merger = DatasetMerger(
            processed_dir=self.tmpdir / "nonexistent",
            output_dir=self.output,
            overwrite=True,
        )
        report = merger.rebuild()
        self.assertEqual(report.total_cases, 0)

    def test_get_manifest_returns_none_before_rebuild(self):
        merger = DatasetMerger(
            processed_dir=self.processed,
            output_dir=self.tmpdir / "fresh_output",
        )
        self.assertIsNone(merger.get_manifest())


# ═══════════════════════════════════════════════════════════════════════════════
# 4. DatasetVersionManager
# ═══════════════════════════════════════════════════════════════════════════════

class TestDatasetVersionManager(unittest.TestCase):

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp())
        self.ver_file = self.tmpdir / "dataset_version.json"

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _vm(self):
        return DatasetVersionManager(self.ver_file)

    def test_starts_at_zero(self):
        vm = self._vm()
        self.assertEqual(vm.current_version, 0)
        self.assertIsNone(vm.latest)

    def test_bump_version(self):
        vm = self._vm()
        v = vm.bump_version(cases=30, processed=30, notes="Initial")
        self.assertEqual(v.version, 1)
        self.assertEqual(v.cases, 30)
        self.assertEqual(v.notes, "Initial")
        self.assertEqual(vm.current_version, 1)

    def test_multiple_bumps(self):
        vm = self._vm()
        vm.bump_version(cases=30)
        vm.bump_version(cases=60)
        v3 = vm.bump_version(cases=100)
        self.assertEqual(v3.version, 3)

    def test_persistence(self):
        vm = self._vm()
        vm.bump_version(cases=42, processed=42)
        vm2 = DatasetVersionManager(self.ver_file)
        self.assertEqual(vm2.current_version, 1)
        self.assertEqual(vm2.latest.cases, 42)

    def test_link_model(self):
        vm = self._vm()
        vm.bump_version(cases=30)
        vm.link_model(dataset_version=1, model_version="model_v1_30cases.pt")
        vm2 = DatasetVersionManager(self.ver_file)
        self.assertEqual(vm2.get_version(1).model_version, "model_v1_30cases.pt")

    def test_report(self):
        vm = self._vm()
        vm.bump_version(cases=30)
        vm.bump_version(cases=60)
        report = vm.generate_report()
        self.assertEqual(report["current_version"], 2)
        self.assertEqual(len(report["history"]), 2)

    def test_text_summary(self):
        vm = self._vm()
        vm.bump_version(cases=30, notes="First batch")
        summary = vm.text_summary()
        self.assertIn("v01", summary)
        self.assertIn("First batch", summary)


# ═══════════════════════════════════════════════════════════════════════════════
# 5. DatasetBackup
# ═══════════════════════════════════════════════════════════════════════════════

class TestDatasetBackup(unittest.TestCase):

    def setUp(self):
        self.tmpdir = Path(tempfile.mkdtemp())
        self.processed = self.tmpdir / "processed_cases"
        self.training  = self.tmpdir / "training_set"
        self.backups   = self.tmpdir / "dataset_backups"
        self.processed.mkdir()
        self.training.mkdir()

        # Create 2 processed case dirs
        for i in range(2):
            case = self.processed / f"case_{i:03d}"
            case.mkdir()
            np.save(case / "points.npy", np.zeros((64, 3), np.float32))

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _backup(self, **kwargs):
        return DatasetBackup(
            processed_dir=self.processed,
            training_dir=self.training,
            backup_root=self.backups,
            **kwargs,
        )

    def test_create_snapshot(self):
        b = self._backup()
        snap = b.create_snapshot()
        self.assertTrue(snap.exists())
        self.assertTrue((snap / "snapshot_meta.json").exists())

    def test_snapshot_copies_cases(self):
        b = self._backup()
        snap = b.create_snapshot()
        meta = json.loads((snap / "snapshot_meta.json").read_text())
        self.assertEqual(meta["total_cases"], 2)
        self.assertEqual(len(meta["case_list"]), 2)

    def test_list_snapshots(self):
        b = self._backup()
        b.create_snapshot(label="first")
        b.create_snapshot(label="second")
        snaps = b.list_snapshots()
        self.assertEqual(len(snaps), 2)

    def test_prune_snapshots(self):
        b = self._backup(max_snapshots=2)
        import time
        b.create_snapshot(label="old1")
        time.sleep(0.01)
        b.create_snapshot(label="old2")
        time.sleep(0.01)
        b.create_snapshot(label="new3")
        snaps = b.list_snapshots()
        self.assertLessEqual(len(snaps), 2)

    def test_restore_dry_run(self):
        b = self._backup()
        snap = b.create_snapshot()
        snap_name = snap.name
        result = b.restore_processed(snapshot_name=snap_name, dry_run=True)
        self.assertTrue(result["success"])
        self.assertTrue(result["dry_run"])
        self.assertEqual(len(result["would_restore"]), 2)

    def test_restore_invalid_snapshot(self):
        b = self._backup()
        result = b.restore_processed("nonexistent_snapshot")
        self.assertFalse(result["success"])
        self.assertIn("not found", result["error"])

    def test_snapshot_with_metadata(self):
        # Create a fake manifest in training_set/merged_dataset
        merged = self.training / "merged_dataset"
        merged.mkdir()
        manifest_data = {"version": 1, "total_cases": 2}
        (merged / "manifest.json").write_text(json.dumps(manifest_data))

        b = self._backup(dataset_dir=self.tmpdir)
        snap = b.create_snapshot(include_metadata=True)
        self.assertTrue((snap / "training_set_metadata").exists())
        self.assertTrue((snap / "training_set_metadata" / "manifest.json").exists())


# ═══════════════════════════════════════════════════════════════════════════════
# Main runner
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    unittest.main(verbosity=2)
