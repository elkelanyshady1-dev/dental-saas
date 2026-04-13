# Supervisor Plane

> **OrthoSupervise** — remote orthodontic case review and clinical supervision platform.

## Overview
A separate, isolated frontend and backend plane for orthodontic supervisors to review cases submitted by clinics. Supervisors can approve, reject, or request changes to treatment plans.

## Stack
- **Backend**: `backend/src/modules/supervisor/`
- **Frontend**: `supervisor-frontend/`
- Zustand for state management
- Tailwind CSS for styling

## Key Features
- Clinical-grade dashboard
- Case submission and review workflow
- Treatment plan approval pipeline
- Image & STL file review

## Security
- Plane-isolated authentication (separate from org/platform auth)
- Dedicated RBAC for supervisor roles
- See: [[Security Architecture]]

## Related
- [[Orthodontic Domain]]
- [[AI Engine]]
- [[Organization Plane]]

---
#architecture #supervisor
