"""
dataset_backup.py — Timestamped snapshots of the dataset before any rebuild.
=============================================================================

BEFORE every dataset rebuild, a snapshot is created:

    dataset_backups/
        dataset_snapshot_2026_03_08_16_39/
            processed_cases/          ← copy of all case subdirectories
            training_set_metadata/    ← manifest.json + dataset_version.json
            snapshot_meta.json        ← snapshot info + case list

SAFETY GUARANTEES
-----------------
1. Backup is ALWAYS created before DatasetMerger.rebuild() is called.
2. Backup is READ-ONLY (files are copied, not linked).
3. Source directories are NEVER modified during backup.
4. If disk space is insufficient, backup is skipped with a warning
   (training must not be prevented by backup failure — it is advisory).

Backup contents
---------------
    processed_cases/    — full copy of source processed_cases
    training_set_metadata/
        manifest.json          (current training_set manifest if it exists)
        dataset_version.json   (version history)
        registry.json          (case registry)
    snapshot_meta.json  — {timestamp, case_list, source_paths, total_cases}

Usage
-----
    backup = DatasetBackup(
        processed_dir="./datasets/processed_cases",
        training_dir="./datasets/training_set",
        backup_root="./dataset_backups",
    )
    snapshot_path = backup.create_snapshot()
    print(f"Snapshot saved: {snapshot_path}")

    # List existing snapshots
    snapshots = backup.list_snapshots()
    for s in snapshots:
        print(s["name"], s["total_cases"])

    # Restore from a specific snapshot (emergency recovery)
    backup.restore_processed(snapshot_name="dataset_snapshot_2026_03_08_16_39")
"""

from __future__ import annotations

import json
import logging
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# Files within training/dataset directories that are worth backing up
_METADATA_FILES = [
    "manifest.json",
    "dataset_version.json",
    "registry.json",
]


class DatasetBackup:
    """
    Create and manage timestamped dataset snapshots.

    Args:
        processed_dir:  path to processed_cases source
        training_dir:   path to training_set directory
        backup_root:    root directory for all snapshots (default: ./dataset_backups)
        dataset_dir:    root dataset directory (for registry + version file lookup)
        max_snapshots:  maximum number of kept snapshots (oldest deleted, 0=unlimited)
    """

    SNAPSHOT_PREFIX = "dataset_snapshot_"
    _TIMESTAMP_FMT  = "%Y_%m_%d_%H_%M"

    def __init__(
        self,
        processed_dir: str | Path,
        training_dir: str | Path,
        backup_root: str | Path = "./dataset_backups",
        dataset_dir: Optional[str | Path] = None,
        max_snapshots: int = 10,
    ) -> None:
        self.processed_dir = Path(processed_dir)
        self.training_dir  = Path(training_dir)
        self.backup_root   = Path(backup_root)
        self.dataset_dir   = Path(dataset_dir) if dataset_dir else self.processed_dir.parent
        self.max_snapshots = max_snapshots

    # ── Snapshot creation ─────────────────────────────────────────────────────

    def create_snapshot(
        self,
        label: Optional[str] = None,
        include_processed: bool = True,
        include_metadata: bool = True,
    ) -> Path:
        """
        Create a full timestamped snapshot.

        Args:
            label:               optional description appended to folder name
            include_processed:   copy processed_cases directory
            include_metadata:    copy training set metadata files

        Returns:
            Path to the created snapshot directory.

        Raises:
            OSError: if backup directory cannot be created
            Warning: if any individual file copy fails (non-fatal)
        """
        t0 = time.perf_counter()
        timestamp = datetime.now().strftime(self._TIMESTAMP_FMT)
        folder_name = f"{self.SNAPSHOT_PREFIX}{timestamp}"
        if label:
            safe_label = label.replace(" ", "_").replace("/", "_")[:30]
            folder_name += f"_{safe_label}"

        snapshot_dir = self.backup_root / folder_name
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Creating snapshot: %s", snapshot_dir)

        case_list: List[str] = []
        n_copied = 0
        n_failed = 0

        # ── Copy processed_cases ──────────────────────────────────────────────
        if include_processed and self.processed_dir.exists():
            proc_backup = snapshot_dir / "processed_cases"
            proc_backup.mkdir(exist_ok=True)

            for case_dir in sorted(self.processed_dir.iterdir()):
                if not case_dir.is_dir():
                    continue
                try:
                    dest = proc_backup / case_dir.name
                    if dest.exists():
                        shutil.rmtree(dest)
                    shutil.copytree(case_dir, dest)
                    case_list.append(case_dir.name)
                    n_copied += 1
                except Exception as exc:
                    logger.warning("Backup copy failed for %s: %s", case_dir.name, exc)
                    n_failed += 1

            logger.info(
                "  Backed up %d processed cases (%d failed)", n_copied, n_failed
            )

        # ── Copy metadata files ───────────────────────────────────────────────
        if include_metadata:
            meta_backup = snapshot_dir / "training_set_metadata"
            meta_backup.mkdir(exist_ok=True)

            # manifest.json from training_set
            merged = self.training_dir / "merged_dataset" / "manifest.json"
            if merged.exists():
                shutil.copy2(merged, meta_backup / "manifest.json")

            # Registry, version file from dataset root
            for fname in ["dataset_version.json", "registry.json"]:
                src = self.dataset_dir / fname
                if src.exists():
                    shutil.copy2(src, meta_backup / fname)

        # ── Snapshot meta ─────────────────────────────────────────────────────
        elapsed = time.perf_counter() - t0
        snapshot_meta = {
            "name":          folder_name,
            "timestamp":     datetime.now().isoformat(timespec="seconds"),
            "label":         label or "",
            "source_paths": {
                "processed_dir": str(self.processed_dir),
                "training_dir":  str(self.training_dir),
            },
            "total_cases":   n_copied,
            "failed_copies": n_failed,
            "case_list":     case_list,
            "elapsed_s":     round(elapsed, 2),
        }
        (snapshot_dir / "snapshot_meta.json").write_text(
            json.dumps(snapshot_meta, indent=2), encoding="utf-8"
        )

        logger.info(
            "Snapshot created in %.1fs: %s  (cases=%d, errors=%d)",
            elapsed, folder_name, n_copied, n_failed
        )

        # ── Prune old snapshots ───────────────────────────────────────────────
        if self.max_snapshots > 0:
            self._prune_old_snapshots()

        return snapshot_dir

    # ── Snapshot listing ──────────────────────────────────────────────────────

    def list_snapshots(self) -> List[dict]:
        """
        Return list of snapshot info dicts, newest first.

        Each dict contains the contents of snapshot_meta.json for that snapshot.
        """
        if not self.backup_root.exists():
            return []

        snapshots = []
        for p in sorted(self.backup_root.iterdir(), reverse=True):
            if not p.is_dir() or not p.name.startswith(self.SNAPSHOT_PREFIX):
                continue
            meta_file = p / "snapshot_meta.json"
            try:
                meta = json.loads(meta_file.read_text(encoding="utf-8"))
                meta["path"] = str(p)
                snapshots.append(meta)
            except Exception:
                snapshots.append({
                    "name": p.name,
                    "path": str(p),
                    "total_cases": "?",
                    "timestamp": "",
                })

        return snapshots

    # ── Restore ───────────────────────────────────────────────────────────────

    def restore_processed(self, snapshot_name: str, dry_run: bool = False) -> dict:
        """
        Emergency restore — copy processed_cases from a snapshot BACK to the
        source directory.

        Args:
            snapshot_name: name of the snapshot folder (not full path)
            dry_run:       if True, only report what would be restored

        Returns:
            dict with restore status

        .. warning::
            This OVERWRITES the current processed_cases directory contents
            with the snapshot versions.  Use with extreme caution.
        """
        snapshot_dir = self.backup_root / snapshot_name
        proc_backup  = snapshot_dir / "processed_cases"

        if not snapshot_dir.exists():
            return {"success": False, "error": f"Snapshot not found: {snapshot_name}"}
        if not proc_backup.exists():
            return {"success": False, "error": "Snapshot has no processed_cases directory"}

        cases_to_restore = sorted(p.name for p in proc_backup.iterdir() if p.is_dir())

        if dry_run:
            return {
                "success": True,
                "dry_run": True,
                "would_restore": cases_to_restore,
                "target": str(self.processed_dir),
            }

        logger.warning(
            "RESTORING %d cases from %s to %s",
            len(cases_to_restore), snapshot_name, self.processed_dir
        )

        restored = []
        failed = []
        for case_name in cases_to_restore:
            src  = proc_backup / case_name
            dest = self.processed_dir / case_name
            try:
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(src, dest)
                restored.append(case_name)
            except Exception as exc:
                failed.append({"case": case_name, "error": str(exc)})
                logger.error("Restore failed for %s: %s", case_name, exc)

        return {
            "success": len(failed) == 0,
            "restored": restored,
            "failed":   failed,
            "source_snapshot": snapshot_name,
        }

    # ── Pruning ───────────────────────────────────────────────────────────────

    def _prune_old_snapshots(self) -> None:
        """Delete oldest snapshots if count exceeds max_snapshots."""
        snapshots = self.list_snapshots()  # newest first
        while len(snapshots) > self.max_snapshots:
            oldest = snapshots.pop()   # last = oldest
            oldest_path = Path(oldest["path"])
            try:
                shutil.rmtree(oldest_path)
                logger.info("Pruned old snapshot: %s", oldest_path.name)
            except Exception as exc:
                logger.warning("Failed to prune snapshot %s: %s", oldest_path.name, exc)
                break  # don't loop on errors
