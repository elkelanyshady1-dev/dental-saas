# Feature Registry

> **Entitlement-based feature gating** — controls which features are available to each organization based on their plan.

## Location
- `backend/src/platform/featureRegistry.js`

## How It Works
1. Organization subscribes to a **Plan** (via [[Billing Engine]])
2. Each plan defines **entitlements**: modules, limits, and quotas
3. The [[Entitlement System]] enforces these at runtime across three axes:
   - **Module gating** — `requireEntitlement(key)` controls feature access
   - **Seat limits** — `limitGuard(key)` blocks creation beyond plan limits
   - **Storage quotas** — `quotaGuard()` blocks uploads beyond storage limit
4. Features are gated at both API and UI levels

## Entitlement Resolution Chain
```
PlanVersion → OrganizationEntitlement → entitlementResolver → effectivePlanBuilder
```

## Status
- **v5.5 Hardened** (2026-04-03)
- Decoupled `registryKey` from `module` entitlement.
- Unified `isCore` invariants across clinical module.

## Routing vs Entitlement Architecture
The registry serves as the translation layer between the URL/Request and the Plan Capability.

| Field | Purpose | Example |
|-------|---------|---------|
| `key` | **Routing/Interface**. Used in URLs and `requireEntitlement`. | `orthodontic-cases` |
| `module` | **Entitlement**. The canonical key in `req.capabilities`. | `orthodontics` |
| `schemaKey` | **Billing**. The key used in `PlanVersion` schema. | `orthodonticsAdv` |

> [!CAUTION]
> **Avoid Collision**: Never assume `key === module`. The `requireEntitlement` middleware MUST resolve the definition to find the true entitlement module.

## Runtime Enforcement
| Middleware | What It Checks | Resolution Flow |
|-----------|---------------|-----------------|
| `requireEntitlement(key)` | Module enabled? | `key` → `def.module` → `capModules[module]` |
| `limitGuard(key)` | Under seat limit? | Direct `key` check in `req.capabilities.limits` |
| `quotaGuard()` | Under storage quota? | Global capacity check |

## Usage Tracking
- `OrgUsage` model tracks users/patients/branches/storage counters
- `GET /api/v1/org/usage` exposes usage + limits to frontend
- `OrgUsageDashboard.jsx` renders progress bars

## Integration
- Used by [[Security Architecture]] as the first enforcement layer
- Feeds into RBAC → PBAC pipeline
- Frontend checks via `useOrgCapabilities()` hook

## Related
- [[Entitlement System]]
- [[Plan Builder]]
- [[Billing Engine]]
- [[Security Architecture]]

---
#platform #features #entitlements
