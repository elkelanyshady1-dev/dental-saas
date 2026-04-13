"""
dataset_split_validator.py — Train/Val split integrity checker.
================================================================

Prevents two critical silent failures observed in production:

1. **Data leakage** — the same case appears in both train and val sets
   (happens when split files are missing and the loader falls back to
   auto-discover for ALL splits, giving both splits access to every case).

2. **Incorrect validation metrics** — val set is empty so validation is
   skipped, yet logs report val_loss = 0.000 (inherited from train_loss),
   creating a false sense of good generalisation.

How the validator resolves each layout
---------------------------------------

    Layout A  —  manifest files (train.txt / val.txt)
        Reads both files and compares case name sets.
        → Reports overlap and empty-set warnings.

    Layout B  —  physical subdirectories (train/ val/)
        Enumerates case sub-directories in each folder.
        → Reports overlap and empty-set warnings.

    Layout C  —  flat directory (no split)
        All cases sit directly in dataset_dir without sub-dirs or manifests.
        → Warns that no split was performed and suggests running split_dataset.

    Fallback  —  dataset_dir does not exist
        Raises FileNotFoundError so callers fail early.

Usage
-----
    from meshnet.utils.dataset_split_validator import validate_dataset_split

    result = validate_dataset_split("./datasets/processed_cases")

    if result.has_leakage:
        raise RuntimeError("Data leakage detected!")

    train_loader = make_loader(result.train_cases, split="train")
    val_loader   = make_loader(result.val_cases,   split="val") if result.val_cases else None

The function also logs all findings via the standard ``logging`` module so
they appear in the dashboard Action Log automatically.
"""

from __future__ import annotations

import dataclasses
import logging
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclasses.dataclass
class SplitValidationResult:
    """
    Structured result from ``validate_dataset_split()``.

    Attributes
    ----------
    train_cases   : sorted list of case names in the training set
    val_cases     : sorted list of case names in the validation set
    overlap       : case names that appear in BOTH sets (data leakage)
    layout        : how the split was detected — one of:
                    "manifest" | "subdir" | "flat" | "unknown"
    train_count   : len(train_cases)
    val_count     : len(val_cases)
    has_leakage   : True when overlap is non-empty
    val_enabled   : True when val_cases is non-empty — use this to gate
                    val_loader creation in the training script
    warnings      : list of human-readable warning strings
    suggestions   : list of remediation suggestions
    """
    train_cases:  List[str] = dataclasses.field(default_factory=list)
    val_cases:    List[str] = dataclasses.field(default_factory=list)
    overlap:      List[str] = dataclasses.field(default_factory=list)
    layout:       str = "unknown"
    warnings:     List[str] = dataclasses.field(default_factory=list)
    suggestions:  List[str] = dataclasses.field(default_factory=list)

    @property
    def train_count(self) -> int:
        return len(self.train_cases)

    @property
    def val_count(self) -> int:
        return len(self.val_cases)

    @property
    def has_leakage(self) -> bool:
        return len(self.overlap) > 0

    @property
    def val_enabled(self) -> bool:
        return len(self.val_cases) > 0

    def summary(self) -> str:
        """Return a multi-line human-readable summary."""
        lines = [
            "─" * 55,
            "  Dataset Split Validation Report",
            f"  Layout      : {self.layout}",
            f"  Train cases : {self.train_count}",
            f"  Val cases   : {self.val_count}",
            f"  Overlap     : {len(self.overlap)} case(s)",
        ]
        if self.warnings:
            for w in self.warnings:
                lines.append(f"  ⚠  {w}")
        if self.suggestions:
            for s in self.suggestions:
                lines.append(f"  ℹ  {s}")
        if not self.warnings:
            lines.append("  ✓  No issues detected")
        lines.append("─" * 55)
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_case_dir(path: Path) -> bool:
    """Return True if path looks like a processed case directory."""
    return path.is_dir() and (path / "points.npy").exists()


def _read_manifest(manifest_path: Path, dataset_dir: Path) -> List[str]:
    """
    Read a split manifest file (.txt) and return sorted list of case names
    that actually exist as directories in dataset_dir.
    """
    names: List[str] = []
    try:
        for line in manifest_path.read_text(encoding="utf-8").splitlines():
            name = line.strip()
            if name and (dataset_dir / name).is_dir():
                names.append(name)
    except OSError as exc:
        logger.warning("[split-validator] Cannot read manifest %s: %s", manifest_path, exc)
    return sorted(names)


def _list_subdir_cases(subdir: Path) -> List[str]:
    """List case names with points.npy inside a subdir."""
    if not subdir.is_dir():
        return []
    return sorted(d.name for d in subdir.iterdir() if _is_case_dir(d))


# ---------------------------------------------------------------------------
# Main validator
# ---------------------------------------------------------------------------

def validate_dataset_split(
    dataset_dir: str | Path,
    case_prefix: str = "",
    auto_fix_suggest: bool = True,
) -> SplitValidationResult:
    """
    Validate the train/val split of a processed dataset directory.

    Parameters
    ----------
    dataset_dir       : root directory containing processed cases
    case_prefix       : if set, only case dirs starting with this prefix
                        are considered (e.g. ``"case"``).  Empty = all dirs.
    auto_fix_suggest  : include remediation suggestion strings in the result

    Returns
    -------
    SplitValidationResult — see class docstring for field details

    Raises
    ------
    FileNotFoundError   : if dataset_dir does not exist
    """
    dataset_dir = Path(dataset_dir)
    if not dataset_dir.exists():
        raise FileNotFoundError(
            f"[split-validator] dataset_dir not found: {dataset_dir}\n"
            "Run the dataset generator first."
        )

    result = SplitValidationResult()

    # ── Detect layout ─────────────────────────────────────────────────────────

    train_txt = dataset_dir / "train.txt"
    val_txt   = dataset_dir / "val.txt"
    train_dir = dataset_dir / "train"
    val_dir   = dataset_dir / "val"

    has_manifests = train_txt.exists() or val_txt.exists()
    has_subdirs   = (train_dir.is_dir() and any(True for _ in train_dir.iterdir())) \
                  or (val_dir.is_dir() and any(True for _ in val_dir.iterdir()))

    if has_manifests:
        result.layout = "manifest"
        result.train_cases = _read_manifest(train_txt, dataset_dir)
        result.val_cases   = _read_manifest(val_txt,   dataset_dir)

    elif has_subdirs:
        result.layout = "subdir"
        result.train_cases = _list_subdir_cases(train_dir)
        result.val_cases   = _list_subdir_cases(val_dir)

    else:
        # Flat layout — cases sit directly under dataset_dir
        result.layout = "flat"
        flat_cases = sorted(
            d.name for d in dataset_dir.iterdir()
            if _is_case_dir(d)
            and (not case_prefix or d.name.startswith(case_prefix))
        )
        # In flat layout, BOTH splits would share the same cases
        # if _discover_samples falls back to auto-discover.
        result.train_cases = flat_cases
        result.val_cases   = []   # cannot distinguish without manifest/subdir

    # Filter by case_prefix if specified (manifest/subdir layouts)
    if case_prefix and result.layout != "flat":
        result.train_cases = [c for c in result.train_cases if c.startswith(case_prefix)]
        result.val_cases   = [c for c in result.val_cases   if c.startswith(case_prefix)]

    # ── Overlap detection (data leakage) ─────────────────────────────────────

    train_set = set(result.train_cases)
    val_set   = set(result.val_cases)
    result.overlap = sorted(train_set & val_set)

    # ── Print + log findings ──────────────────────────────────────────────────

    print(f"[INFO] Train cases : {result.train_count}")
    print(f"[INFO] Val cases   : {result.val_count}")
    logger.info("[split-validator] Layout=%s  train=%d  val=%d",
                result.layout, result.train_count, result.val_count)

    if result.has_leakage:
        msg = (
            f"Train/Val overlap detected ({len(result.overlap)} case(s)): "
            f"{result.overlap[:5]}{'...' if len(result.overlap) > 5 else ''}"
        )
        result.warnings.append(msg)
        print(f"[WARN] {msg}")
        logger.warning("[split-validator] DATA LEAKAGE — %s", msg)
        if auto_fix_suggest:
            result.suggestions.append(
                "Re-run split_dataset() with mode='manifest' and a fixed seed. "
                "Remove or regenerate the existing train.txt / val.txt."
            )

    if result.val_count == 0:
        msg = "Validation set empty"
        result.warnings.append(msg)
        print(f"[WARN] {msg}")
        logger.warning("[split-validator] %s", msg)

        total = result.train_count + result.val_count
        if total >= 2:
            sug = "Suggest splitting dataset again with python -m dataset.scripts.generate_dataset --split"
            result.suggestions.append(sug)
            print(f"[INFO] {sug}")
            logger.info("[split-validator] %s", sug)
        else:
            sug = "Only one case available — validation disabled."
            result.suggestions.append(sug)
            print(f"[INFO] {sug}")
            logger.info("[split-validator] %s", sug)

    if result.layout == "flat" and result.train_count > 0:
        msg = (
            "No train.txt / val.txt manifest and no train/ val/ subdirectories found. "
            "Both splits will share all cases — this is correct ONLY for single-case datasets."
        )
        result.warnings.append(msg)
        print(f"[WARN] {msg}")
        logger.warning("[split-validator] %s", msg)
        if auto_fix_suggest and result.train_count >= 2:
            sug = (
                "Run: python -m dataset.scripts.generate_dataset "
                "--input_dir <raw> --output_dir <out> --split "
                "to create train.txt / val.txt automatically."
            )
            result.suggestions.append(sug)
            print(f"[INFO] {sug}")

    # ── Final summary line ────────────────────────────────────────────────────

    print(f"[INFO] Final dataset split → train={result.train_count} val={result.val_count}")
    logger.info(
        "[split-validator] Final split → train=%d  val=%d  leakage=%s  val_enabled=%s",
        result.train_count, result.val_count,
        result.has_leakage, result.val_enabled,
    )

    return result
