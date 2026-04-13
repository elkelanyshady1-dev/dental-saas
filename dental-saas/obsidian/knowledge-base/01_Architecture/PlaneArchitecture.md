# Plane Architecture

## Purpose
Define the multi-plane isolation model that separates concerns across the platform.

## Planes

### Platform Plane
- **Purpose**: Superadmin operations, billing, organization lifecycle
- **Auth**: PlatformUser → PlatformJWT
- **DB**: Platform DB (shared `saasdental`)
- **Routes**: `/api/platform/*`
- **Key Models**: Organization, PlanVersion, OrgContract, PlatformUser, PlatformInvoice
- **Details**: [[PlatformPlane]]

### Organization Plane
- **Purpose**: Day-to-day clinic operations
- **Auth**: User → OrgJWT (tenant-scoped)
- **DB**: Per-org DB (`dental_org_<orgId>`)
- **Routes**: `/api/v1/*`
- **Key Models**: Patient, Appointment, Treatment, User, Branch, Role
- **Details**: [[OrganizationPlane]]

### Supervisor Plane (OrthoSupervise)
- **Purpose**: Remote orthodontic case review
- **Auth**: Supervisor → SupervisorJWT
- **DB**: Per-org DB (via case access grants)
- **Routes**: `/api/supervisor/*`
- **Key Models**: SupervisorInvitation, CaseAccess, ReviewStage
- **Details**: [[SupervisorPlane]]

### Patient Portal
- **Purpose**: Patient-facing self-service
- **Auth**: PatientUser → PatientJWT
- **DB**: Per-org DB (read-only patient scope)
- **Routes**: `/api/portal/*`
- **Key Models**: PatientUser, PatientMessage, PatientPhoto
- **Details**: [[PatientPortal]]

### AI Engine
- **Purpose**: STL processing, ML segmentation, clinical measurements
- **Stack**: Python + PyTorch
- **Isolation**: Separate process, communicates via HTTP/queue
- **Details**: [[AIEngine]]

## Cross-Plane Rules
1. Platform users ≠ Org users (separate identity models)
2. No cross-org data access — DB isolation enforces this
3. Supervisor access is grant-based, not role-based
4. Patient portal tokens are scoped to single org + patient

## Dependencies
- [[DatabaseIsolation]]
- [[AuthSystem]]
- [[SecurityArchitecture]]

## Status
**STABLE** — All 5 planes operational

---
#architecture #planes #isolation
