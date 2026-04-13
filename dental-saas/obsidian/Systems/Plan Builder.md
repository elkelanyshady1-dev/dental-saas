# Plan Builder

> **SaaS plan configuration with immutable versioning** — supports regional pricing, visibility gates, entitlement controls, and revenue simulation.

## Overview
The Plan Builder allows platform administrators to create and manage subscription plans with versioned pricing, regional overrides, entitlement limits, and lifecycle controls.

## Location
- **Frontend**: `frontend/src/platform/modules/plans/`
- **Backend**: `backend/src/platform/billing/pricing/`

## Key Concepts

### Immutable Versioning
- Each plan change creates a new version
- Versions transition: `draft` → `published`
- Published versions are **immutable** — never edited
- Frozen fields: `limits`, `modules`, `pricing`, `pricingV3`, `quotas`, `inflationPolicy`, `trialDays`
- Version duplication for creating new iterations

### Regional Pricing (v3)
- **Global base price** — default for all regions
- **Regional overrides** — per-region pricing with currency
- **Country overrides** — per-country fine-tuning
- Currency validation: region-authoritative display
- Auto-save before publish

### Entitlements Grid (Phase 4.0c)
The Plan Builder configures three enforcement axes for each plan version:

| Category | Fields | Convention |
|----------|--------|-----------|
| **Limits** | maxUsers, maxBranches, maxPatients | 0 = unlimited |
| **Quotas** | storageMB, imagesMB | 0 = unlimited |
| **Modules** | Toggle grid for each module | boolean |

#### UI State
```javascript
form.limits  = { maxUsers: 0, maxBranches: 0, maxPatients: 0 }
form.quotas  = { storageMB: 0, imagesMB: 0 }
form.modules = ["patients", "appointments", "finance"]
```

#### Helper Hints
- "0 = Unlimited" on all limit/quota inputs
- "500 MB ≈ 5,000 patient images" on storage input
- All inputs are `type="number"` — no freeform strings

### Visibility Gates
| Visibility | Access |
|-----------|--------|
| `public` | Anyone can see and subscribe |
| `sales` | Only visible to sales team |
| `internal` | Only platform admins |
| `restricted` | Locked, not available |

### Revenue Protection Guardrails
- Extreme discount prevention
- Currency mismatch detection
- Pricing anomaly alerts
- Pre-publish revenue impact simulation

## UI Components
- `PlanBuilderPage` — main layout and orchestration
- `SidebarComponents` — plan metadata and settings
- `RegionCardV3` — regional pricing editor
- Entitlements Grid — 5-card limits + quotas editor
- Side-by-side version comparison

## Backend Controller Alignment
- `platformPlanVersion.controller.js` receives `limits` and `quotas` as separate fields
- Direct field mapping — no aliasing (maxUsers is maxUsers, maxPatients is maxPatients)
- Numeric validation: `Number(value) || 0`

## Related
- [[Entitlement System]] — runtime enforcement of plan limits
- [[Billing Engine]] — subscription lifecycle
- [[Platform Plane]]

---
#billing #plans #pricing #entitlements
