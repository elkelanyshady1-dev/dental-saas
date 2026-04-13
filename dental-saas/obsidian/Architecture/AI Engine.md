# AI Engine

> **Python-based ML/Geometry pipeline** for orthodontic STL analysis and clinical measurements.

## Overview
A 12-step hybrid ML + geometry processing pipeline for dental 3D model analysis.

## Stack
- **Location**: `python-ai-engine/`
- Python + PyTorch
- PointNet++ for semantic segmentation

## Pipeline Steps
1. STL file ingestion
2. Mesh preprocessing
3. Automated gingival margin detection (geodesic Dijkstra)
4. Discrete mean curvature analysis
5. PointNet++ semantic segmentation
6. Nearest-neighbor label mapping
7. FDI tooth numbering
8. Bolton analysis
9. Crowding measurement
10. Curve of Spee analysis
11. Overjet / Overbite measurement
12. NLP Command Parsing for Clinical Assistant Engine
13. Clinical report generation

## Training Infrastructure
- 3D augmentation strategies (Z-rotation, scanner tilt, point dropout, midline mirroring)
- PyTorch training loop with PointNet++ models
- Custom dataset preparation for dental AI

## Related
- [[Orthodontic Domain]]
- [[Supervisor Plane]]

---
#architecture #ai #ml
