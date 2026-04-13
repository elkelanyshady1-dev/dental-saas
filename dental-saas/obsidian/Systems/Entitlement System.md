# Entitlement & Quota System

> **Production-grade entitlement enforcement** — modules, seat limits, storage quotas, and real-time usage tracking across the full stack.

## Status
- **Phase 5.5 Hardened** (2026-04-03)
- Registry-Driven Resolution implemented
- Mismatch between Routing Key and Entitlement Module resolved

## Architecture (Registry-Driven)

```
requireEntitlement(featureKey)   ← e.g. "orthodontic-cases"
     ↓
FEATURE_REGISTRY[featureKey]     ← Resolve definition (SSOT)
     ↓
def.module                       ← Canonical module (e.g. "orthodontics")
     ├─ CORE_MODULES.has?        → ALLOW (patients, appointments, etc.)
     └─ req.capabilities         → ALLOW if capModules[def.module] === true
           ↓
     effectivePlanBuilder        ← Normalized via planCapabilityBuilder
           ↓
     PlanVersion.modules         ← Keys: clinical, orthodontics, billing...
```

> [!IMPORTANT]
> **Resolution Rule**: Always resolve by `def.module`. 
> - `registryKey` = Routing ("orthodontic-cases")
> - `module`      = Entitlement ("orthodontics")
> - `schemaKey`   = billing ("orthodonticsAdv")

## Three Enforcement Axes

### 1. Module Gating (`requireEntitlement`)
Controls access to entire feature domains.
- **File**: `backend/src/middleware/requireEntitlement.js`
- Enforces via `req.capabilities.modules[key]`
- CORE_MODULES bypass (patients, appointments always enabled)
- Runtime dependency checks (booking requires patients)
- Audit mode via `ENTITLEMENT_AUDIT_MODE=true`

### 2. Seat Limits (`limitGuard`)
Prevents creation beyond plan-defined maximums.
- **File**: `backend/src/middleware/limitGuard.js`
- Checks `req.capabilities.limits[key]` vs `OrgUsage` counters
- Supports: `maxUsers`, `maxBranches`, `maxPatients`
- Convention: 0/null/-1 = unlimited
- Fail-open safety, auth tracing
- HTTP 403 with structured error body

### 3. Storage Quotas (`quotaGuard`)
Pre-upload storage enforcement.
- **File**: `backend/src/core/storage/middleware/quotaGuard.js`
- Resolution: `quotas.storageMB` → `limits.maxStorageMB` → unlimited
- Checks Content-Length before multer accepts the file
- HTTP 413 with remaining capacity details

## Schema

### PlanVersion Limits
```javascript
limits: {
  maxUsers: Number,      // 0 = unlimited
  maxBranches: Number,
  maxPatients: Number,   // Phase 4.0b
  maxStorageMB: Number   // @deprecated → use quotas.storageMB
}
```

### PlanVersion Quotas (Phase 4.0b)
```javascript
quotas: {
  storageMB: Number,  // Total storage allowed (MB)
  imagesMB: Number    // Sub-quota for images (MB)
}
```

### OrganizationEntitlement Overrides
```javascript
limits: { maxUsers, maxBranches, maxPatients, maxStorageMB }
quotas: { storageMB, imagesMB }
```

## Usage Tracking

### OrgUsage Model
- **File**: `backend/src/core/usage/OrgUsage.model.js`
- Tracks: `usersCount`, `branchesCount`, `patientsCount`, `storageUsedMB`
- Atomic `$inc` with upsert, clamp-to-zero safety

### Service API
```javascript
const orgUsage = require("@core/usage/orgUsage.service");

// After user creation
await orgUsage.incrementUsers(orgId);

// After patient deletion
await orgUsage.decrementPatients(orgId);

// Query usage
const usage = await orgUsage.getOrgUsage(orgId);
```

### REST API
- `GET /api/v1/org/usage` — Returns usage + limits for dashboard
- Response: `{ users: {used, limit}, patients, branches, storage }`

## Plan Builder UI

### Entitlements Grid (5 cards)
| Field | Type | Hint |
|-------|------|------|
| MAX USERS | number | 0 = Unlimited |
| MAX BRANCHES | number | 0 = Unlimited |
| MAX PATIENTS | number | 0 = Unlimited |
| STORAGE QUOTA | number (MB) | 500 MB ≈ 5,000 images |
| IMAGES QUOTA | number (MB) | Sub-quota for images |

### State Structure
```javascript
form.limits  = { maxUsers, maxBranches, maxPatients }
form.quotas  = { storageMB, imagesMB }
```

## Route Protection Map

| Route | Guard |
|-------|-------|
| `POST /users/` | `limitGuard("maxUsers")` |
| `POST /patient/domain/` | `limitGuard("maxPatients")` |
| `POST /patient/domain/internal/patients` | `limitGuard("maxPatients")` |
| `POST /patient/domain/quick` | `limitGuard("maxPatients")` |
| File upload routes | `quotaGuard()` |
| All module routes | `requireEntitlement(moduleName)` |

## Frontend Dashboard
- **Component**: `OrgUsageDashboard.jsx`
- Color-coded progress bars (green → amber → red)
- Handles unlimited plans (shows "∞")
- Auto-refresh every 60s

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/middleware/requireEntitlement.js` | Module access enforcement |
| `backend/src/middleware/limitGuard.js` | Seat limit enforcement |
| `backend/src/core/storage/middleware/quotaGuard.js` | Storage quota enforcement |
| `backend/src/core/usage/OrgUsage.model.js` | Usage counter model |
| `backend/src/core/usage/orgUsage.service.js` | Usage tracking service |
| `backend/src/platform/billing/services/entitlementResolver.service.js` | Plan + override merger |
| `backend/src/core/subscription/effectivePlanBuilder.js` | Add-on benefit aggregation |
| `backend/src/core/storage/storageUsage.service.js` | Storage byte tracking |
| `frontend/src/organization/components/OrgUsageDashboard.jsx` | Usage dashboard UI |

## Related
- [[Plan Builder]]
- [[Billing Engine]]
- [[Security Architecture]]
- [[Feature Registry]]

---
#entitlements #quotas #limits #phase-4
