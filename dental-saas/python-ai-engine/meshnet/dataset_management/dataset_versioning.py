"""
dataset_versioning.py — Dataset version tracking.
==================================================

Every time the training dataset is rebuilt (via DatasetMerger), a new
version entry is created and appended to ``dataset_version.json``.

Schema of dataset_version.json
-------------------------------
{
  "current_version": 3,
  "versions": [
    {
      "version": 1,
      "cases": 30,
      "processed": 30,
      "synthetic": 0,
      "pseudo": 0,
      "total_training_samples": 30,
      "timestamp": "2026-03-08T16:39:18",
      "notes": "Initial dataset"
    },
    {
      "version": 2,
      "cases": 50,
      ...
    },
    {
      "version": 3,
      "cases": 142,
      ...
    }
  ]
}

Usage
-----
    vm = DatasetVersionManager("./datasets/dataset_version.json")
    prev_version = vm.current_version
    new_version = vm.bump_version(
        cases=142, processed=62, synthetic=60, pseudo=20,
        notes="Added 92 new cases from clinic batch 3"
    )
    print(f"Dataset version {new_version.version}")
    report = vm.generate_report()
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


# ── DatasetVersion ────────────────────────────────────────────────────────────

@dataclass
class DatasetVersion:
    """Record for a single dataset version."""
    version:                int
    cases:                  int       # total merged cases
    processed:              int = 0
    synthetic:              int = 0
    pseudo:                 int = 0
    total_training_samples: int = 0   # may differ from cases if multi-patch/augmented
    timestamp:              str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))
    notes: str = ""
    model_version: Optional[str] = None   # paired model checkpoint name (set later)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "DatasetVersion":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


# ── DatasetVersionManager ─────────────────────────────────────────────────────

class DatasetVersionManager:
    """
    Tracks dataset rebuild versions in a persistent JSON file.

    Args:
        version_file: path to dataset_version.json (created if absent)
    """

    def __init__(self, version_file: str | Path) -> None:
        self.version_file = Path(version_file)
        self._versions: List[DatasetVersion] = []
        self._load()

    # ── Persistence ───────────────────────────────────────────────────────────

    def _load(self) -> None:
        if not self.version_file.exists():
            self._versions = []
            return
        try:
            data = json.loads(self.version_file.read_text(encoding="utf-8"))
            self._versions = [
                DatasetVersion.from_dict(v) for v in data.get("versions", [])
            ]
            logger.debug("Loaded %d dataset versions", len(self._versions))
        except Exception as e:
            logger.error("Failed to load dataset_version.json: %s", e)
            self._versions = []

    def _save(self) -> None:
        self.version_file.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "current_version": self.current_version,
            "versions": [v.to_dict() for v in self._versions],
        }
        tmp = self.version_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(self.version_file)

    # ── Properties ────────────────────────────────────────────────────────────

    @property
    def current_version(self) -> int:
        """Current (latest) version number, or 0 if none."""
        return self._versions[-1].version if self._versions else 0

    @property
    def latest(self) -> Optional[DatasetVersion]:
        """Latest DatasetVersion record, or None."""
        return self._versions[-1] if self._versions else None

    # ── Version management ────────────────────────────────────────────────────

    def bump_version(
        self,
        cases: int,
        processed: int = 0,
        synthetic: int = 0,
        pseudo: int = 0,
        total_training_samples: Optional[int] = None,
        notes: str = "",
    ) -> DatasetVersion:
        """
        Create a new version entry and persist it.

        Args:
            cases:                   total merged case count
            processed:               count from processed_cases
            synthetic:               count from synthetic_cases
            pseudo:                  count from pseudo_cases
            total_training_samples:  overrides ``cases`` if different
                                     (e.g. when virtual patch sampling is used)
            notes:                   human-readable reason for rebuild

        Returns:
            The newly created :class:`DatasetVersion`.
        """
        new_ver = self.current_version + 1
        record = DatasetVersion(
            version=new_ver,
            cases=cases,
            processed=processed,
            synthetic=synthetic,
            pseudo=pseudo,
            total_training_samples=total_training_samples or cases,
            notes=notes,
        )
        self._versions.append(record)
        self._save()
        logger.info(
            "Dataset version bumped: v%d → v%d  (cases=%d, processed=%d, "
            "synthetic=%d, pseudo=%d)",
            new_ver - 1, new_ver, cases, processed, synthetic, pseudo
        )
        return record

    def link_model(self, dataset_version: int, model_version: str) -> None:
        """
        Associate a trained model checkpoint name with a dataset version.

        Example:
            vm.link_model(dataset_version=3, model_version="model_v3_142cases.pt")
        """
        for v in self._versions:
            if v.version == dataset_version:
                v.model_version = model_version
                self._save()
                logger.info("Linked model %s to dataset v%d", model_version, dataset_version)
                return
        logger.warning("Dataset version %d not found — cannot link model", dataset_version)

    def get_version(self, version: int) -> Optional[DatasetVersion]:
        """Return a specific version record by version number."""
        for v in self._versions:
            if v.version == version:
                return v
        return None

    # ── Report ────────────────────────────────────────────────────────────────

    def generate_report(self) -> dict:
        """
        Return a JSON-serializable report with version history.

        Example::
            {
              "current_version": 3,
              "history": [
                {"version": 1, "cases": 30, ...},
                {"version": 2, "cases": 50, ...},
                {"version": 3, "cases": 142, ...}
              ]
            }
        """
        return {
            "current_version": self.current_version,
            "history": [v.to_dict() for v in self._versions],
        }

    def text_summary(self) -> str:
        """Return a human-readable version history table."""
        if not self._versions:
            return "No dataset versions recorded."
        lines = ["Dataset Version History", "=" * 50]
        for v in self._versions:
            lines.append(
                f"  v{v.version:02d}  {v.timestamp[:10]}  "
                f"cases={v.cases:5d}  "
                f"(proc={v.processed} synth={v.synthetic} pseudo={v.pseudo})  "
                + (f"[{v.model_version}]" if v.model_version else "")
                + (f"  # {v.notes}" if v.notes else "")
            )
        return "\n".join(lines)
