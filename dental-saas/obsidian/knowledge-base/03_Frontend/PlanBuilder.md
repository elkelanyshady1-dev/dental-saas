# Plan Builder Page

## Purpose
Platform admin interface for creating and editing subscription plans with versioned pricing, entitlement limits, and lifecycle controls.

## Location
- **Frontend**: `frontend/src/platform/modules/plans/PlanBuilderPage.jsx`
- **Backend**: `backend/src/platform/billing/controllers/platformPlanVersion.controller.js`

## Features

### Immutable Versioning
- Each plan change creates a new version
- Versions transition: `draft` → `published`
- Published versions are **immutable** — frozen fields:
  - `limits`, `modules`, `pricing`, `pricingV3`, `quotas`, `inflationPolicy`, `trialDays`
- Duplication supported for creating new iterations

### Entitlements Grid
5-card layout for configuring plan limits and quotas:
| Card | Field | Type | Hint |
|------|-------|------|------|
| MAX USERS | `limits.maxUsers` | number | 0 = Unlimited |
| MAX BRANCHES | `limits.maxBranches` | number | 0 = Unlimited |
| MAX PATIENTS | `limits.maxPatients` | number | 0 = Unlimited |
| STORAGE QUOTA | `quotas.storageMB` | number | 500 MB ≈ 5,000 images |
| IMAGES QUOTA | `quotas.imagesMB` | number | Sub-quota for images |

### Regional Pricing (v3)
- Global base price → Regional overrides → Country overrides
- Currency validation: region-authoritative display
- Auto-save before publish

### Visibility Gates
| Value | Access |
|-------|--------|
| `public` | Anyone can subscribe |
| `sales` | Sales team only |
| `internal` | Platform admins only |
| `restricted` | Locked |

### Revenue Protection
- Extreme discount prevention
- Currency mismatch detection
- Pre-publish revenue impact simulation

## State Structure
```javascript
form = {
  modules: ["patients", "appointments", "finance", ...],
  limits: { maxUsers: 0, maxBranches: 0, maxPatients: 0 },
  quotas: { storageMB: 0, imagesMB: 0 },
  pricing: { monthly: Number, yearly: Number },
  pricingV3: { regions: [...], countryOverrides: [...] },
}
```

## Components
- `PlanBuilderPage` — Main layout + orchestration
- `SidebarComponents` — Plan metadata, settings
- `RegionCardV3` — Regional pricing editor
- Entitlements Grid — 5-card limits + quotas editor

## Dependencies
- [[PricingEngine]] — Pricing resolution logic
- [[EntitlementSystem]] — Backend enforcement of configured limits
- [[BillingSystem]] — Subscription lifecycle

## Status
**ACTIVE** — v3 pricing + entitlements grid deployed

---
#frontend #plans #pricing #builder
