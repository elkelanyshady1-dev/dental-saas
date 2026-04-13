# Security Architecture

## Purpose
Enforce zero-trust access control via a three-layer pipeline: RBAC → PBAC → RLS.

## Security Pipeline
```
Request
  ↓
Layer 1: ENTITLEMENTS (Platform)
  → requireEntitlement(moduleName) — Is this module enabled for the org?
  → limitGuard(limitKey) — Is the seat/resource limit reached?
  → quotaGuard() — Is the storage quota exceeded?
  ↓
Layer 2: RBAC (Organization)
  → requirePermission(permission) — Does the user's role allow this?
  → requireOrgPermission(permission) — Org-scoped permission check
  ↓
Layer 3: PBAC (Field-Level)
  → Policy engine evaluates field-level access rules
  → Dynamic policy documents per entity type
  ↓
Layer 4: DB ISOLATION (Infrastructure)
  → Per-org DB connection — no cross-org data visible
  → Optional RLS queryScoper as defense-in-depth
```

## RBAC System
### Roles
- **System Roles**: Owner, Admin, Doctor, Receptionist (seeded, not deletable)
- **Custom Roles**: Created by org admins with granular permissions

### Permission Format
```
module.action
# Examples: patients.create, appointments.view, finance.manage
```

### Files
| File | Purpose |
|------|---------|
| `backend/src/rbac/` | Role definitions, permission constants |
| `backend/src/middleware/requirePermission.js` | Permission check middleware |
| `backend/src/middleware/requireOrgPermission.js` | Org-scoped permission check |

## PBAC System
### Policy Engine
- Per-entity-type policy documents
- Evaluates field visibility, write access, action authorization
- Context-aware (user role, branch, patient status)

### Files
| File | Purpose |
|------|---------|
| `backend/src/platform/policies/` | Policy definitions and engine |
| `backend/src/platform/guardian/` | Guardian layer for invariant validation |

## Entitlement Layer
See [[EntitlementSystem]] for full details.

## Dependencies
- [[AuthSystem]] — Identity resolution
- [[EntitlementSystem]] — Module/limit/quota checks
- [[DatabaseIsolation]] — DB-level isolation
- [[RLSEngine]] — Optional query-level filtering

## Status
**ACTIVE** — Full zero-trust pipeline operational

---
#security #rbac #pbac #rls #zero-trust
