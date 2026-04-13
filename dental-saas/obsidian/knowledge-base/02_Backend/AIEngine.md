# AI Engine Architecture

## Purpose
Process 3D dental mesh data (STL/PLY) to generate automated tooth segmentation, arch curve estimations, and orthodontic measurements.

## Stack
- **Language**: Python
- **Framework**: PyTorch / TorchScript
- **Models**: PointNet++ (multi-task), MeshNet (experimental)
- **Deployment**: Isolated process via HTTP/REST or BullMQ worker

## Core Pipeline

### 1. Segmentation Pipeline (PointNet++)
- **Task**: 3D tooth identification and FDI numbering.
- **Input**: Preprocessed STL/PLY point clouds.
- **Output**: Per-point semantic labels.

### 2. Geometry Analysis
- **Arch Curve Detection**: Estimating the ideal arch form.
- **Gingival Margin Analysis**: Identifying the boundary between tooth and soft tissue.
- **Curvature Analysis**: Discrete mean curvature for feature detection.

### 3. Measurements
- Bolton analysis
- Crowding measurements
- Curve of Spee
- Overjet / Overbite

## Data & Privacy
- **Anonymization**: PII is stripped before mesh data reaches the AI engine.
- **GDPR Compliance**: Meshes are stored without patient demographic markers.

## Training Infrastructure
- **Dataset Generation**: Automated STL preprocessing and labeling scripts.
- **Hard-Case Mining**: Focusing training on high-error clinical scenarios.
- **Incremental Training**: Supporting continuous improvement without catastrophic forgetting.
- **Export**: Models exported to ONNX or TorchScript for production inference.

## Integration Point
- **Backend**: `beckend/src/modules/intelligenceDomain/`
- **Frontend**: 3D visualization via `@react-three/fiber` and `@react-three/drei`.

## Status
**ACTIVE** — Core segmentation and geometry pipelines operational.

---
#ai #python #pytorch #orthodontics #geometry
