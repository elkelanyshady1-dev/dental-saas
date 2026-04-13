# Entitlement System

## Purpose
Enforce plan-based access control across three axes: modules, seat limits, and storage quotas.

## Resolution Chain
```
PlanVersion (schema)
  ↓ merge
OrganizationEntitlement (per-org overrides)
  ↓ merge
effectivePlanBuilder (add-on benefits)
  ↓ cache (60s TTL)
req.capabilities (populated by orgSubscriptionGuard)
  ↓ enforce
requireEntitlement / limitGuard / quotaGuard
```

## Three Enforcement Axes

### 1. Module Gating (requireEntitlement)
| What | How |
|------|-----|
| Purpose | Block access to disabled features |
| Middleware | `requireEntitlement(moduleName)` |
| Source | `req.capabilities.modules[key]` |
| Core bypass | patients, appointments always enabled |
| File | `backend/src/middleware/requireEntitlement.js` |

### 2. Seat Limits (limitGuard)
| What | How |
|------|-----|
| Purpose | Prevent creation beyond plan maximums |
| Middleware | `limitGuard(limitKey)` |
| Source | `req.capabilities.limits[key]` vs `OrgUsage` counters |
| Convention | 0/null/-1 = unlimited |
| File | `backend/src/middleware/limitGuard.js` |

### 3. Storage Quotas (quotaGuard)
| What | How |
|------|-----|
| Purpose | Block uploads exceeding storage quota |
| Middleware | `quotaGuard()` |
| Source | `req.capabilities.quotas.storageMB` |
| File | `backend/src/core/storage/middleware/quotaGuard.js` |

## Schema

### PlanVersion
```javascript
modules: { patients: Boolean, appointments: Boolean, finance: Boolean, ... }
limits:  { maxUsers: Number, maxBranches: Number, maxPatients: Number }
quotas:  { storageMB: Number, imagesMB: Number }
```

### OrganizationEntitlement (overrides)
```javascript
limitOverrides: { maxUsers, maxBranches, maxPatients, maxStorageMB }
quotaOverrides: { storageMB, imagesMB }
```

## Usage Tracking
- Model: `OrgUsage` — tracks usersCount, branchesCount, patientsCount, storageUsedMB
- Service: `orgUsage.service.js` — atomic $inc with upsert
- API: `GET /api/v1/org/usage` — returns usage + limits
- Dashboard: `OrgUsageDashboard.jsx` — color-coded progress bars

## Subscription State Cache (Redis)
To optimize performance and reduce database load, organization subscription state is cached in Redis.
- **Cache Key**: `sub:org:{organizationId}`
- **TTL**: 60 seconds (short-lived for consistency)
- **Invalidation**: Triggered by events like `contract.activated`, `subscription.updated`, or `plan.changed`.
- **Latency Savings**: Reduces DB lookups by ~15ms per request by avoiding sequential `Organization`, `OrgContract`, and `PlanVersion` reads.

## State Classification (orgSubscriptionGuard)
Subscription state is classified into five mutually exclusive categories:
- **`active`**: Active `OrgContract` (status: "active") or legacy fallback.
- **`trial`**: Organization within its `trialEndDate` period.
- **`grace`**: Contract expired but within the technical grace window.
- **`expired`**: Blocked (Suspended, Canceled, or Past Due).
- **`unknown`**: Fallback (402 Payment Required).

## Route Protection Map
| Route | Guard |
|-------|-------|
| `POST /users/` | `limitGuard("maxUsers")` |
| `POST /patient/domain/*` | `limitGuard("maxPatients")` |
| `POST /platform/orgs/:id/branches` | Manual entitlement check |
| File uploads | `quotaGuard()` |
| All module routes | `requireEntitlement(module)` |

## Key Files
| File | Purpose |
|------|---------|
| `backend/src/platform/billing/services/entitlementResolver.service.js` | Plan + override merger |
| `backend/src/core/subscription/effectivePlanBuilder.js` | Add-on benefit aggregation |
| `backend/src/core/usage/OrgUsage.model.js` | Usage counter model |
| `backend/src/core/usage/orgUsage.service.js` | Usage tracking service |
| `backend/scripts/recalculateOrgUsage.js` | Data reconciliation |

## Dependencies
- [[PlanManagement]] — Plan schema definitions
- [[BillingSystem]] — Subscription lifecycle
- [[SecurityArchitecture]] — Enforcement pipeline

## Status
**ACTIVE** — Phase 4.1 hardened (2026-03-29)

---
#entitlements #quotas #limits #enforcement
