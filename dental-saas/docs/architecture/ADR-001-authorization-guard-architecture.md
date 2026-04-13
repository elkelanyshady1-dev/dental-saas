# ADR-001: Authorization Guard Architecture

**Status:** Accepted  
**Date:** 2026-03-23  
**Phase:** B.2 — Runtime Maturity & Architecture Optimization  
**Context:** DentalSaaS Platform  

## Summary

This ADR documents the authorization guard architecture used across the Dental SaaS platform, covering all four guard layers, their composition rules, and enforcement order.

## Decision Drivers

- Multi-tenant security requires layered authorization
- 150+ org-plane screens need consistent guard patterns
- Platform/Org plane isolation is architecturally enforced
- RBAC, entitlement, and policy (PBAC) layers must compose without conflict

## Guard Layers

### Layer 1: Authentication (JWT Verification)

| Guard | Plane | Location | Purpose |
|-------|-------|----------|---------|
| `authMiddleware` | Shared | `middleware/authMiddleware.js` | JWT verification, user population |
| `orgProtect` | Org | `middleware/orgProtect.js` | Enforces `token.type === "org"` |
| `platformProtect` | Platform | `middleware/platformProtect.js` | Enforces platform JWT |

**Rule:** Every request MUST pass through one authentication guard. No route is auth-free except health checks.

### Layer 2: RBAC (Role-Based Access Control)

| Guard | Plane | Location | Purpose |
|-------|-------|----------|---------|
| `requireOrgPermission(P.xxx)` | Org | `middleware/requireOrgPermission.js` | Permission check from role definition |
| `authorizePlatformPermission` | Platform | `middleware/authorizePlatformPermission.js` | Platform capability check |

**Permission Format:** `module.action` (e.g., `patients.create`, `accounting.read`)

**Guard Matrix:**

| HTTP Method | Required Capability Pattern |
|-------------|---------------------------|
| GET | `VIEW_*` / `*.read` |
| POST | `MANAGE_*` / `*.create` |
| PATCH/PUT | `MANAGE_*` / `*.update` |
| DELETE | `MANAGE_*` / `*.delete` |

### Layer 3: Entitlement (Plan/Feature Gating)

| Guard | Plane | Location | Purpose |
|-------|-------|----------|---------|
| `requireModule(key)` | Org | `orgRuntime/requireModule.js` | Module enablement check |
| `requireEntitlement(key)` | Org | `middleware/requireEntitlement.js` | Feature entitlement check |
| `subscriptionGuard` | Org | `middleware/subscriptionGuard.js` | Plan-level access gate |

**Rule:** Module access is checked at request time, not mount time. All routes are always mounted.

### Layer 4: Policy (PBAC — Policy-Based Access Control)

| Guard | Plane | Location | Purpose |
|-------|-------|----------|---------|
| `policyMiddleware` | Org | `modules/authorization/middleware/policy.middleware.js` | Context-aware field/resource policy |
| `fieldWriteGuardMiddleware` | Org | `modules/authorization/middleware/fieldWriteGuard.middleware.js` | Field-level write restrictions |
| `fieldFilterMiddleware` | Org | `modules/authorization/middleware/fieldFilter.middleware.js` | Field-level read filtering |

## Middleware Composition Order

```
Request Flow:
  ┌─────────────────────────────────────────────────────────┐
  │  1. authMiddleware          (JWT decode + user populate) │
  │  2. orgProtect              (plane isolation)            │
  │  3. organizationContext     (load org from DB)           │
  │  4. subscriptionGuard       (plan capabilities)          │
  │  5. featureFlagMiddleware   (feature overrides)          │
  │  6. unifiedCapabilityMiddleware  (merged capabilities)   │
  │  7. requireModule(key)      (module enablement)          │
  │  8. requireOrgPermission    (RBAC check)                 │
  │  9. policyMiddleware        (PBAC check)                 │
  │ 10. fieldWriteGuard         (write restrictions)         │
  │ 11. Controller              (business logic)             │
  │ 12. fieldFilter             (response filtering)         │
  └─────────────────────────────────────────────────────────┘
```

## Auth-Only Routes

These routes bypass RBAC/entitlement guards (only authentication required):

```
/auth/*                 — login, register, token refresh
/capabilities           — capability snapshot for frontend
/feature-flags          — feature flag configuration
/me*                    — user profile self-read
/audit/frontend-event   — client-side audit logging
/performance-metric     — client-side performance reporting
```

## Tracing

All auth decisions are captured by `authTraceMiddleware`:
- Each guard step emits `req.addAuthTrace({ layer, result, permission, reason })`
- Traces include a **decision summary** (Phase B.2) with per-layer verdicts
- Traces include a **timing breakdown** (Phase B.2) with per-layer latency
- 100% of denials are persisted; successes are sampled at 20%
- Traces are persisted asynchronously via BullMQ queue

## Module Runtime Engine

Phase B introduced the module runtime engine:

1. **moduleRegistry** — centralized registry of all org modules
2. **moduleLoader** — boot-time mounting with dependency validation
3. **requireModule** — request-time module access enforcement
4. **moduleLifecycle** — enable/disable with lifecycle hooks (Phase B.2)
5. **moduleStateSync** — async state tracking with TTL cache (Phase B.2)

## Consequences

### Positive
- Layered defense prevents any single guard bypass from granting access
- Auth trace provides full observability into every decision
- Module runtime engine enables dynamic feature toggles without deploys
- Event-driven state tracking provides platform-level analytics

### Negative
- Middleware chain adds ~5-15ms per request (acceptable for security)
- Trace persistence adds Redis queue overhead (~2ms)
- Module state sync adds periodic DB writes (TTL-gated to 1 per 5min per org)

## Related Documents
- `specs/spec.md` — system specification
- `specs/plan.md` — implementation roadmap
- `orgRuntime/moduleRegistry.js` — module registry source
- `orgRuntime/moduleLifecycle.service.js` — lifecycle management
- `middleware/authTraceMiddleware.js` — trace enrichment
