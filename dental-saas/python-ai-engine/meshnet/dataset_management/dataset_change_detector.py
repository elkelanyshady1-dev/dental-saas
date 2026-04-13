"""
dataset_change_detector.py — Watch raw_cases for new arrivals and trigger pipeline.
=====================================================================================

Monitors ``dataset/raw_cases/`` for new case directories.

When a new case directory is detected:
    1. Run preprocessing (generate_dataset.py) on the new case
    2. Register the case in the dataset registry
    3. Trigger dataset merger (rebuild training_set)
    4. Optionally trigger incremental training

Two modes
---------
poll mode (default, cross-platform):
    Periodically scans raw_cases for new directories not yet in processed_cases.
    No watchdog dependency required.

watch mode (requires ``watchdog`` package):
    Uses filesystem events for near-instant detection.
    Falls back to poll mode if watchdog is unavailable.

Usage (CLI)
-----------
    python -m meshnet.dataset_management.dataset_change_detector \\
        --raw_cases ./datasets/raw_cases \\
        --processed ./datasets/processed_cases \\
        --synthetic ./datasets/synthetic_cases \\
        --pseudo    ./datasets/pseudo_cases \\
        --training  ./datasets/training_set \\
        --backups   ./dataset_backups \\
        --registry  ./datasets/registry.json \\
        --version   ./datasets/dataset_version.json \\
        --interval  30 \\
        --mode      poll \\
        --log_dir   ./logs

Usage (programmatic)
--------------------
    detector = DatasetChangeDetector(
        raw_cases_dir="./datasets/raw_cases",
        processed_dir="./datasets/processed_cases",
        registry=registry,
        on_new_case=my_callback,
    )
    detector.run_once()        # one scan pass
    detector.run_forever()     # blocking poll loop
    detector.stop()            # signal stop
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Callable, List, Optional, Set

from .dataset_registry import DatasetRegistry
from .dataset_merger import DatasetMerger
from .dataset_versioning import DatasetVersionManager
from .dataset_backup import DatasetBackup
from .dataset_integrity_checker import DatasetIntegrityChecker

logger = logging.getLogger(__name__)


# ── DatasetChangeDetector ─────────────────────────────────────────────────────

class DatasetChangeDetector:
    """
    Poll-based new-case detector for the raw_cases directory.

    When a new case is found:
        1. The preprocessing pipeline is invoked (generate_dataset.py)
        2. The case is registered in the DatasetRegistry
        3. A dataset snapshot is created
        4. DatasetMerger rebuilds the training set
        5. DatasetVersionManager bumps the version

    Args:
        raw_cases_dir:   directory to monitor for new cases
        processed_dir:   destination for processed cases (also used to detect "already done")
        synthetic_dir:   synthetic cases directory (for merge)
        pseudo_dir:      pseudo-label cases directory (for merge)
        training_dir:    training_set directory root
        backup_root:     dataset_backups root
        registry:        DatasetRegistry instance (or None to skip)
        version_manager: DatasetVersionManager instance (or None to skip)
        on_new_case:     optional callback(case_id: str) after successful detection
        python_bin:      path to python executable for subprocess calls
        gen_script:      path to generate_dataset.py (for subprocess preprocessing)
        poll_interval_s: seconds between scan passes in poll mode
    """

    def __init__(
        self,
        raw_cases_dir: str | Path,
        processed_dir: str | Path,
        synthetic_dir: Optional[str | Path] = None,
        pseudo_dir: Optional[str | Path] = None,
        training_dir: Optional[str | Path] = None,
        backup_root: Optional[str | Path] = None,
        registry: Optional[DatasetRegistry] = None,
        version_manager: Optional[DatasetVersionManager] = None,
        on_new_case: Optional[Callable[[str], None]] = None,
        python_bin: str = sys.executable,
        gen_script: Optional[str] = None,
        poll_interval_s: int = 30,
    ) -> None:
        self.raw_cases_dir   = Path(raw_cases_dir)
        self.processed_dir   = Path(processed_dir)
        self.synthetic_dir   = Path(synthetic_dir) if synthetic_dir else None
        self.pseudo_dir      = Path(pseudo_dir) if pseudo_dir else None
        self.training_dir    = Path(training_dir) if training_dir else None
        self.backup_root     = Path(backup_root) if backup_root else None
        self.registry        = registry
        self.version_manager = version_manager
        self.on_new_case     = on_new_case
        self.python_bin      = python_bin
        self.gen_script      = gen_script
        self.poll_interval_s = poll_interval_s
        self._running        = False
        self._seen: Set[str] = set()

    # ── Detection ─────────────────────────────────────────────────────────────

    def _get_processed_ids(self) -> Set[str]:
        """Return set of case IDs already in processed_cases."""
        if not self.processed_dir.exists():
            return set()
        return {p.name for p in self.processed_dir.iterdir() if p.is_dir()}

    def _get_raw_ids(self) -> Set[str]:
        """Return set of case IDs in raw_cases."""
        if not self.raw_cases_dir.exists():
            return set()
        return {p.name for p in self.raw_cases_dir.iterdir() if p.is_dir()}

    def detect_new(self) -> List[str]:
        """Return list of raw case IDs not yet processed."""
        processed = self._get_processed_ids()
        raw = self._get_raw_ids()
        new = sorted(raw - processed - self._seen)
        if new:
            logger.info("New cases detected: %s", new)
        return new

    # ── Preprocessing ────────────────────────────────────────────────────────

    def _run_preprocessing(self, case_id: str) -> bool:
        """
        Invoke generate_dataset.py on a single case.

        Returns True on success.
        """
        if not self.gen_script:
            logger.debug("No gen_script configured — skipping preprocessing for %s", case_id)
            return True  # treat as successful (manual preprocessing assumed done)

        raw_case_path = self.raw_cases_dir / case_id
        if not raw_case_path.exists():
            logger.error("Raw case dir not found: %s", raw_case_path)
            return False

        cmd = [
            self.python_bin, self.gen_script,
            "--cases",       str(self.raw_cases_dir),
            "--output",      str(self.processed_dir),
            "--filter_case", case_id,
            "--auto_gingiva",
        ]

        logger.info("Preprocessing %s: %s", case_id, " ".join(cmd))
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,
            )
            if result.returncode != 0:
                logger.error(
                    "Preprocessing failed for %s (exit %d):\n%s",
                    case_id, result.returncode, result.stderr[-1000:]
                )
                return False
            logger.info("Preprocessing complete for %s", case_id)
            return True
        except subprocess.TimeoutExpired:
            logger.error("Preprocessing timeout for %s", case_id)
            return False
        except Exception as exc:
            logger.error("Preprocessing exception for %s: %s", case_id, exc)
            return False

    # ── Per-case pipeline ────────────────────────────────────────────────────

    def _handle_new_case(self, case_id: str) -> bool:
        """
        Full pipeline for a newly detected case.

        Steps:
            1. Preprocessing
            2. Register in registry
            3. Snapshot
            4. Rebuild training set
            5. Bump version
            6. Invoke callback

        Returns True if all steps succeeded.
        """
        logger.info("=" * 60)
        logger.info("Handling new case: %s", case_id)
        logger.info("=" * 60)

        # Step 1: Preprocess
        if not self._run_preprocessing(case_id):
            logger.error("Preprocessing failed for %s — aborting pipeline", case_id)
            return False

        # Step 2: Register
        processed_path = self.processed_dir / case_id
        if self.registry and not self.registry.is_registered(case_id):
            n_pts = 0
            pts_file = processed_path / "points.npy"
            if pts_file.exists():
                try:
                    import numpy as _np
                    n_pts = int(_np.load(pts_file).shape[0])
                except Exception:
                    pass
            self.registry.register_case(
                case_id=case_id,
                source_type="processed",
                n_points=n_pts,
            )
            logger.info("Registered case in registry: %s", case_id)

        # Step 3: Snapshot
        if self.backup_root and self.training_dir:
            backup = DatasetBackup(
                processed_dir=self.processed_dir,
                training_dir=self.training_dir,
                backup_root=self.backup_root,
                dataset_dir=self.processed_dir.parent,
            )
            try:
                snap_path = backup.create_snapshot(label=f"before_add_{case_id}")
                logger.info("Snapshot created: %s", snap_path.name)
            except Exception as exc:
                logger.warning("Snapshot failed (non-fatal): %s", exc)

        # Step 4: Rebuild training set
        if self.training_dir:
            current_ver = self.version_manager.current_version if self.version_manager else 0
            merger = DatasetMerger(
                processed_dir=self.processed_dir,
                synthetic_dir=self.synthetic_dir,
                pseudo_dir=self.pseudo_dir,
                output_dir=self.training_dir / "merged_dataset",
                overwrite=True,
                version=current_ver + 1,
            )
            report = merger.rebuild()
            logger.info("Training set rebuilt: %s", report.summary())

            # Step 5: Bump version
            if self.version_manager:
                new_ver = self.version_manager.bump_version(
                    cases=report.total_cases,
                    processed=report.processed_cases,
                    synthetic=report.synthetic_cases,
                    pseudo=report.pseudo_cases,
                    notes=f"Incremental: added case {case_id}",
                )
                logger.info("Dataset version bumped to v%d", new_ver.version)

        # Step 6: Callback
        if self.on_new_case:
            try:
                self.on_new_case(case_id)
            except Exception as exc:
                logger.warning("on_new_case callback raised: %s", exc)

        return True

    # ── Run loop ──────────────────────────────────────────────────────────────

    def run_once(self) -> List[str]:
        """
        Perform one scan pass. Process all newly detected cases.

        Returns list of case IDs handled.
        """
        new_cases = self.detect_new()
        handled = []
        for case_id in new_cases:
            success = self._handle_new_case(case_id)
            if success:
                self._seen.add(case_id)
                handled.append(case_id)
            else:
                logger.error("Failed to handle case %s — will retry next pass", case_id)
        return handled

    def run_forever(self) -> None:
        """
        Blocking poll loop. Scans every ``poll_interval_s`` seconds.
        Call ``stop()`` from another thread to terminate.
        """
        self._running = True
        self._seen = self._get_processed_ids()  # initialize seen with existing
        logger.info(
            "DatasetChangeDetector started (poll mode, interval=%ds, watching=%s)",
            self.poll_interval_s, self.raw_cases_dir
        )
        try:
            while self._running:
                self.run_once()
                time.sleep(self.poll_interval_s)
        except KeyboardInterrupt:
            logger.info("DatasetChangeDetector stopped by keyboard interrupt")
        finally:
            self._running = False

    def stop(self) -> None:
        """Signal the poll loop to stop after the current scan."""
        self._running = False


# ── CLI entrypoint ────────────────────────────────────────────────────────────

def _setup_log(log_dir: str) -> None:
    """Configure file + console logging."""
    import os
    log_path = Path(log_dir) / "dataset_manager.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)-8s %(name)s — %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(str(log_path), encoding="utf-8"),
        ],
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="DentalMeshNet dataset change detector",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--raw_cases",  required=True, help="raw_cases directory to monitor")
    parser.add_argument("--processed",  required=True, help="processed_cases output directory")
    parser.add_argument("--synthetic",  default=None, help="synthetic_cases directory")
    parser.add_argument("--pseudo",     default=None, help="pseudo_cases directory")
    parser.add_argument("--training",   default=None, help="training_set root directory")
    parser.add_argument("--backups",    default="./dataset_backups", help="backup root")
    parser.add_argument("--registry",   default="./datasets/registry.json")
    parser.add_argument("--version",    default="./datasets/dataset_version.json")
    parser.add_argument("--gen_script", default=None, help="path to generate_dataset.py")
    parser.add_argument("--interval",   type=int, default=30, help="poll interval (seconds)")
    parser.add_argument("--mode",       choices=["poll", "once"], default="poll")
    parser.add_argument("--log_dir",    default="./logs", help="log directory")
    args = parser.parse_args()

    _setup_log(args.log_dir)

    registry = DatasetRegistry(args.registry)
    version_manager = DatasetVersionManager(args.version)

    detector = DatasetChangeDetector(
        raw_cases_dir=args.raw_cases,
        processed_dir=args.processed,
        synthetic_dir=args.synthetic,
        pseudo_dir=args.pseudo,
        training_dir=args.training,
        backup_root=args.backups,
        registry=registry,
        version_manager=version_manager,
        python_bin=sys.executable,
        gen_script=args.gen_script,
        poll_interval_s=args.interval,
    )

    if args.mode == "once":
        handled = detector.run_once()
        logger.info("Single-pass complete. Handled: %s", handled)
    else:
        detector.run_forever()


if __name__ == "__main__":
    main()
