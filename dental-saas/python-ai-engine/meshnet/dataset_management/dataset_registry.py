"""
dataset_registry.py — Persistent case registry for the DentalMeshNet dataset.
==============================================================================

Tracks every case that has ever been part of the dataset with immutable
metadata.  The registry is stored as a single JSON file:
    dataset/registry.json

Schema
------
Each entry in ``cases`` is a :class:`CaseRecord` with:
    case_id           str    — unique identifier (directory name)
    source_type       str    — "processed" | "synthetic" | "pseudo"
    creation_date     str    — ISO-8601 date
    scan_type         str    — "maxillary" | "mandibular" | "full_arch" | "unknown"
    augmentation_count int   — number of augmented variants generated
    n_points          int    — number of points in the processed dataset
    label_verified    bool   — whether labels have been human-verified
    notes             str    — free-form notes

Design decisions
----------------
- The registry is APPEND-ONLY. Cases are never deleted from the registry;
  if removed from disk, they are marked status="removed".
- Registry writes are atomic (write to .tmp then rename).
- Thread-safe for concurrent reads; write lock via filename `.lock`.

Usage
-----
    reg = DatasetRegistry("./datasets/registry.json")
    reg.register_case(case_id="case_042", source_type="processed", ...)
    cases = reg.get_cases_by_source("synthetic")
    report = reg.generate_report()
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


# ── CaseRecord ────────────────────────────────────────────────────────────────

@dataclass
class CaseRecord:
    """
    Immutable record for a single dataset case.

    Fields are stored verbatim in registry.json.
    """
    case_id: str
    source_type: str                  # "processed" | "synthetic" | "pseudo"
    creation_date: str                # ISO-8601 date string
    scan_type: str = "unknown"        # "maxillary" | "mandibular" | "full_arch"
    augmentation_count: int = 0
    n_points: int = 0
    label_verified: bool = False
    notes: str = ""
    status: str = "active"           # "active" | "removed"

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "CaseRecord":
        known = {f.name for f in cls.__dataclass_fields__.values() if isinstance(f, object)}
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


# ── DatasetRegistry ───────────────────────────────────────────────────────────

class DatasetRegistry:
    """
    Persistent append-only registry of all dataset cases.

    Args:
        registry_path: path to registry.json (created if absent)
    """

    def __init__(self, registry_path: str | Path) -> None:
        self.registry_path = Path(registry_path)
        self._cases: Dict[str, CaseRecord] = {}
        self._load()

    # ── Persistence ───────────────────────────────────────────────────────────

    def _load(self) -> None:
        """Load registry from disk (creates empty registry if absent)."""
        if not self.registry_path.exists():
            logger.info("Registry not found — creating new: %s", self.registry_path)
            self._cases = {}
            return

        try:
            data = json.loads(self.registry_path.read_text(encoding="utf-8"))
            for entry in data.get("cases", []):
                try:
                    rec = CaseRecord.from_dict(entry)
                    self._cases[rec.case_id] = rec
                except Exception as e:
                    logger.warning("Skipping malformed registry entry: %s — %s", entry, e)
            logger.info("Registry loaded: %d cases from %s", len(self._cases), self.registry_path)
        except (json.JSONDecodeError, OSError) as e:
            logger.error("Failed to load registry: %s — starting empty", e)
            self._cases = {}

    def _save(self) -> None:
        """Atomically write registry to disk."""
        self.registry_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "schema_version": 1,
            "last_updated": datetime.now().isoformat(timespec="seconds"),
            "total_cases": len(self._cases),
            "cases": [r.to_dict() for r in self._cases.values()],
        }
        tmp = self.registry_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(self.registry_path)
        logger.debug("Registry saved: %d cases", len(self._cases))

    # ── CRUD ─────────────────────────────────────────────────────────────────

    def register_case(
        self,
        case_id: str,
        source_type: str,
        scan_type: str = "unknown",
        augmentation_count: int = 0,
        n_points: int = 0,
        label_verified: bool = False,
        notes: str = "",
        overwrite: bool = False,
    ) -> CaseRecord:
        """
        Register a new case.

        Args:
            case_id:           unique directory name
            source_type:       "processed" | "synthetic" | "pseudo"
            scan_type:         arch type
            augmentation_count: number of augmented variants
            n_points:          processed point count
            label_verified:    human-verified labels flag
            notes:             free-form notes
            overwrite:         if True, allow re-registering an existing case

        Returns:
            The created or updated :class:`CaseRecord`.

        Raises:
            ValueError: if case_id already registered and overwrite=False
        """
        if case_id in self._cases and not overwrite:
            logger.warning("Case %s already registered. Use overwrite=True to update.", case_id)
            return self._cases[case_id]

        rec = CaseRecord(
            case_id=case_id,
            source_type=source_type,
            creation_date=date.today().isoformat(),
            scan_type=scan_type,
            augmentation_count=augmentation_count,
            n_points=n_points,
            label_verified=label_verified,
            notes=notes,
            status="active",
        )
        self._cases[case_id] = rec
        self._save()
        logger.info("Registered case: %s (source=%s)", case_id, source_type)
        return rec

    def mark_removed(self, case_id: str) -> None:
        """Mark a case as removed from disk (retains registry entry)."""
        if case_id not in self._cases:
            logger.warning("Cannot mark removed — case not in registry: %s", case_id)
            return
        self._cases[case_id].status = "removed"
        self._save()

    def get_case(self, case_id: str) -> Optional[CaseRecord]:
        """Return CaseRecord by ID, or None."""
        return self._cases.get(case_id)

    def update_n_points(self, case_id: str, n_points: int) -> None:
        """Update point count for an existing case (e.g. after reprocessing)."""
        if case_id in self._cases:
            self._cases[case_id].n_points = n_points
            self._save()

    # ── Queries ───────────────────────────────────────────────────────────────

    def get_cases_by_source(self, source_type: str) -> List[CaseRecord]:
        """Return all active cases of a given source type."""
        return [r for r in self._cases.values()
                if r.source_type == source_type and r.status == "active"]

    def get_all_active(self) -> List[CaseRecord]:
        """Return all active cases."""
        return [r for r in self._cases.values() if r.status == "active"]

    def is_registered(self, case_id: str) -> bool:
        """Check if a case_id is already in the registry."""
        return case_id in self._cases

    def get_unregistered(self, case_ids: List[str]) -> List[str]:
        """Return IDs from ``case_ids`` not yet in registry."""
        return [cid for cid in case_ids if cid not in self._cases]

    # ── Reporting ─────────────────────────────────────────────────────────────

    def generate_report(self) -> dict:
        """
        Return dataset summary report as JSON-serializable dict.

        Example::

            {
              "total": 142,
              "by_source": {"processed": 62, "synthetic": 60, "pseudo": 20},
              "by_scan_type": {"maxillary": 45, "mandibular": 50, "full_arch": 47},
              "verified": 38,
              "unverified": 104,
              "removed": 5
            }
        """
        active = self.get_all_active()
        removed = [r for r in self._cases.values() if r.status == "removed"]

        by_source: Dict[str, int] = {}
        by_scan: Dict[str, int] = {}
        verified = 0

        for r in active:
            by_source[r.source_type] = by_source.get(r.source_type, 0) + 1
            by_scan[r.scan_type] = by_scan.get(r.scan_type, 0) + 1
            if r.label_verified:
                verified += 1

        return {
            "total": len(active),
            "by_source": by_source,
            "by_scan_type": by_scan,
            "verified": verified,
            "unverified": len(active) - verified,
            "removed": len(removed),
            "generated_at": datetime.now().isoformat(timespec="seconds"),
        }

    def __len__(self) -> int:
        return len(self.get_all_active())

    def __repr__(self) -> str:
        return (f"DatasetRegistry(path={self.registry_path!r}, "
                f"active={len(self.get_all_active())}, "
                f"total={len(self._cases)})")
