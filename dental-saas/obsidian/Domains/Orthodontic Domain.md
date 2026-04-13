# Orthodontic Domain

> Case management, STL processing, treatment staging, and aligner production.

## Location
- **Backend**: `backend/src/modules/orthodonticDomain/`, `backend/src/modules/orthodontics/`
- **Aligner Production**: `backend/src/modules/alignerProductionDomain/`
- **Staging**: `backend/src/modules/stageDomain/`
- **Dental Charts**: `dental-chart-pro/`, `dental-chart-pro v2/`

## Key Features
- Orthodontic case creation and management
- 3D STL file upload and processing
- Treatment staging and visualization
- Aligner production pipeline
- Dental charting (interactive)
- OPG Reference System (Dual-layer diagnostic viewer)
- Bonding Selection Engine (MBT/Roth auto-sync to DB)
- Clinical Assistant Engine (Floating, Voice-enabled command parser)
- Interactive Snapshot Editor (Versioning, Collision resolution, Onboarding)
- Event-Driven Snapshot Architecture (See `ORTHODONTIC_SNAPSHOT_EVENT_SYSTEM_AUDIT.md`)
- Clinical measurements (Bolton, Crowding, Overjet, etc.)

## AI Integration
- Automated STL analysis via [[AI Engine]]
- PointNet++ segmentation for tooth identification
- Gingival margin detection
- Clinical measurement automation

## Supervision
- Cases submitted to [[Supervisor Plane]] for review
- Approval / rejection workflows

## Related
- [[AI Engine]]
- [[Supervisor Plane]]
- [[Treatment Domain]]
- [[Patient Domain]]

---
#clinical #orthodontics #3d
