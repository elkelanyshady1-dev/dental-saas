"""
meshnet/training_pipeline — Staged curriculum training for dental mesh segmentation.

Three-stage curriculum:
    Stage 1  (epochs  1–20)  — isolated tooth patches
    Stage 2  (epochs 21–50)  — neighbour tooth patches
    Stage 3  (epochs 51+)    — full dental arch meshes

Public API
----------
    from meshnet.training_pipeline import CurriculumTrainer, StageController
    from meshnet.training_pipeline.sampling import BalancedSampler, BoundarySampler
    from meshnet.training_pipeline.patch_generation import PatchGenerator, PatchSelector
    from meshnet.training_pipeline.augmentation import MeshAugmentations
    from meshnet.training_pipeline.synthetic_generation import SyntheticArchGenerator
    from meshnet.training_pipeline.pseudo_labeling import PseudoLabelGenerator
    from meshnet.training_pipeline.hard_case_mining import HardCaseDetector, PrioritySampler
"""

from .curriculum_trainer import CurriculumTrainer
from .stage_controller import StageController, StageConfig, TrainingStage

__all__ = [
    "CurriculumTrainer",
    "StageController",
    "StageConfig",
    "TrainingStage",
]
