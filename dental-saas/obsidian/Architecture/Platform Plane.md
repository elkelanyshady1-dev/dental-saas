# Platform Plane

> The **superadmin control surface** — manages organizations, billing, plans, and system-wide governance.

## Overview
The Platform Plane is the highest-privilege layer. Only platform administrators access this plane. It controls the lifecycle of every organization on the system.

## Key Modules

### Billing Engine
- **Location**: `backend/src/platform/billing/`
- **Components**: [[Billing Engine]]
  - Subscription Engine
  - Invoice Engine  
  - Payment Engine
  - Ledger Engine
  - Checkout Orchestrator
- **Pattern**: Activate-Before-Invoice, Atomic Upgrade Pipeline

### Organization Management
- **Location**: `backend/src/platform/domain/`, `backend/src/platform/services/`
- Lifecycle: Provisioning → Active → Suspended → Archived
- Database provisioning per organization
- See: [[Organization Management]]

### Plan Builder
- **Location**: `frontend/src/platform/modules/plans/`
- Immutable version system with draft/published states
- Regional pricing (v3) with country overrides
- See: [[Plan Builder]]

### Feature Registry
- **Location**: `backend/src/platform/featureRegistry.js`
- Entitlement-based feature gating
- See: [[Feature Registry]]

### Security & Governance
- Platform RBAC with role seeding
- Audit logging and forensic trails
- See: [[Security Architecture]]

## Frontend Routes
| Route | Component | Purpose |
|-------|-----------|---------|
| `/platform/dashboard` | DashboardPage | System overview |
| `/platform/organizations` | OrgListPage | Organization management |
| `/platform/plans` | PlanBuilderPage | SaaS plan configuration |
| `/platform/contracts` | PlatformContractPage | Financial control surface |

## Related
- [[Organization Plane]]
- [[Database Isolation]]
- [[Billing Engine]]

---
#architecture #platform
