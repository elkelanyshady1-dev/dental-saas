# 🛡️ Org DDD Audit — Structural Integrity Report

**Date**: 2026-03-30
**Version**: v2.0
**Overall Score**: 67/100 (MODERATE)

---

## Scorecard

| Check | Score | Status |
|---|---|---|
| V1 — Bounded Contexts | 7/10 | 🟡 3 domain overlaps |
| V2 — Cross-Domain Imports | 6/10 | 🟡 4 frontend violations |
| V3 — Platform Leakage | 5/10 | 🔴 3 backend violations |
| V4 — Route Mapping | 9/10 | 🟢 Strong |
| V5 — Service Layer | 4/10 | 🔴 42+ direct DB calls |
| V6 — Capability Alignment | 7/10 | 🟡 3 misalignments |
| V7 — Data Ownership | 9/10 | 🟢 Clean |
| V8 — Org Isolation | 9/10 | 🟢 Strong |
| V9 — Event-Driven | 6/10 | 🟡 Only 1 event |
| V10 — Fat Modules | 5/10 | 🔴 5 files > 20KB |

---

## Critical Findings

### 🔴 Domain Confusion — 3 Overlapping Finance Domains
- `modules/financeDomain/` — routes/services
- `modules/financialDomain/` — models/services/subscribers
- `modules/billingDomain/` — full enterprise engine (15 dirs)

**Action**: Consolidate ALL into `billingDomain/`

### 🔴 Duplicate Orthodontics Module
- `modules/orthodonticDomain/` (teeth + landmarks controllers)
- `modules/orthodontics/` (full module with queues + routes)

**Action**: Merge into single `orthodonticDomain/`

### 🔴 Service Layer Bypass (SYSTEMIC)
42+ direct DB calls across 8 controllers in `organization/controllers/`.
Top offenders:
- `publicController.js` — 18+ direct DB ops (28KB)
- `familyController.js` — 15+ direct DB ops
- `authController.js` — 6+ direct DB ops (24KB)

### 🔴 Platform Leakage
- `authController.js:545` imports `@platform/models/CommunicationMetrics.model`
- `featuresControl.controller.js:633` imports `../../shared/models/Organization`

### 🟡 Capability Misalignment (Settings.jsx)
```
canAnalytics = useCapability("security.manage")  → should be analytics.read
canFeatures  = useCapability("security.manage")  → should be dashboard.manage
```

---

## Strengths
- ✅ Module Runtime Engine (`moduleLoader.js`) — boot-time validation
- ✅ Enterprise RBAC (`orgPermissions.js`) — boot-validated groups
- ✅ Org Isolation — DB-per-tenant + middleware stacking + RLS
- ✅ Data Ownership — no cross-write violations
- ✅ Self-contained modules (users, branches, treatments, procedures)

---

## Migration Roadmap

| Phase | Priority | Effort | Goal |
|---|---|---|---|
| 1 | CRITICAL | 2d | Consolidate 3 finance domains + merge ortho |
| 2 | HIGH | 3-5d | Service layer for 8 controllers |
| 3 | HIGH | 1d | Remove platform leakage |
| 4 | MEDIUM | 1d | Fix frontend cross-domain imports |
| 5 | MEDIUM | 30m | Fix 3 capability misalignments |
| 6 | LOW | 3-5d | Expand event bus |
| 7 | LOW | 3-5d | Split fat controllers |

---

## Related
- [[Organization Plane]]
- [[Platform Plane]]

## Tags
#audit #ddd #architecture #org-plane #zero-trust
