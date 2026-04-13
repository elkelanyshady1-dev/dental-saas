"""
meshnet.dataset_management
==========================
Dataset protection, versioning, and incremental training management system.

Responsibilities:
    • Track all dataset cases in a persistent registry (registry.json)
    • Detect new raw cases added to dataset/raw_cases/
    • Merge processed + synthetic + pseudo cases into the training set
    • Snapshot dataset state before any rebuild (timestamped backups)
    • Version every training-set rebuild (dataset_v1, dataset_v2, ...)
    • Run integrity checks before training starts

Public API:
    DatasetRegistry         — persistent case registry
    DatasetIntegrityChecker — pre-training safety check
    DatasetMerger           — rebuild training_set from all sources
    DatasetVersionManager   — version tracking (dataset_version.json)
    DatasetBackup           — snapshot processed_cases + training metadata
    DatasetChangeDetector   — poll/watch raw_cases for new arrivals

Usage (standalone):
    python -m meshnet.dataset_management.dataset_change_detector \\
        --watch ./datasets/raw_cases \\
        --processed ./datasets/processed_cases \\
        --interval 30
"""

from .dataset_registry import DatasetRegistry, CaseRecord         # noqa: F401
from .dataset_integrity_checker import DatasetIntegrityChecker, IntegrityReport  # noqa: F401
from .dataset_merger import DatasetMerger, MergeReport            # noqa: F401
from .dataset_versioning import DatasetVersionManager, DatasetVersion  # noqa: F401
from .dataset_backup import DatasetBackup                          # noqa: F401
