"""
dataset/sampling — Point cloud sampling strategies for orthodontic datasets.

Modules:
    boundary_sampler — Boundary-aware composite sampling (50% uniform,
                       30% curvature-biased, 20% boundary-focused)
"""

from .boundary_sampler import boundary_aware_sampling, SamplingStats

__all__ = ["boundary_aware_sampling", "SamplingStats"]
