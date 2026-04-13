# Frontend Architecture Foundation (v5.0 — v5.3)

## SECTION 1 — CORE PRINCIPLE
The frontend follows a **Consumption-Only** model for governance. It must never attempt to compute visibility or plan eligibility locally.

- **Frontend does NOT decide**: Visibility scopes, Plan limits, or Module availability.
- **Frontend DOES decide**: How to render UI based on backend-provided capability flags.
- **Backend Source of Truth**: 
    - Permissions: `GET /api/v1/org/me/permissions`
    - Pricing/Plans: `GET /api/public/pricing`

## SECTION 2 — RECOMMENDED FOLDER STRUCTURE
```
src/
├── core/
│   ├── api/            # Scoped API clients with X-Branch-Id
│   ├── auth/           # JWT & Session persistence
│   ├── permissions/    # PermissionContext hooks
│   ├── subscription/   # PlanCapability hooks
│   └── branch/         # Branch context state
├── layouts/            # Governance-aware layouts (Sidebar/Topbar)
├── modules/            # Capability-gated feature modules
├── platform/           # Plan control & billing UI
└── public/             # Marketing & Dynamic Pricing
```

## SECTION 3 — PROVIDER PATTERN
Governance is enforced via React Context providers injected at the root:

1.  **PermissionProvider**:
    - Calls `GET /api/v1/org/me/permissions` on mount/login.
    - Exposes a `usePermissions()` hook.
    - Provides specific capability booleans (e.g., `canViewFinance`).

2.  **PlanProvider**:
    - Consumes plan capabilities resolved by the backend.
    - Exposes a `usePlanUsage()` hook for limit tracking.

3.  **BranchProvider**:
    - Manages `activeBranchId` in state.
    - Injects `X-Branch-Id` header into all `core/api` requests.
    - **Trigger**: Refetches permissions via `PermissionProvider` whenever the branch changes.

## SECTION 4 — NAVIGATION RULES
UI components (like Sidebar items) must be gated by specific capability flags, NOT roles.

**✅ Correct Pattern:**
```javascript
if (plan.modules.inventory && capabilities.canManageInventory) {
  return <InventoryMenuItem />;
}
```

**❌ Forbidden Pattern:**
```javascript
if (user.role === "org_owner") {
  return <InventoryMenuItem />;
}
```

## SECTION 5 — FORBIDDEN PATTERNS
- ❌ **Hardcoded Role Logic**: (`role === "admin"`)
- ❌ **Hardcoded Plan Names**: (`plan === "Pro"`)
- ❌ **Manual Branch Filtering**: Frontend must never filter datasets by `branchId`; it must rely on ScopedQuery enforcement.
- ❌ **Direct orgId Exposure**: Frontend must never store or manually inject `organizationId`. It is always derived from the JWT on the backend.

## SECTION 6 — UPGRADE UX HANDLING
When the backend returns a `PLAN_LIMIT_EXCEEDED` error:
1.  Frontend must catch the error globally (via Axios interceptor).
2.  Display an **Upgrade Modal**.
3.  Redirect to the Billing/Plan page.
4.  Do NOT allow the user to retry the failed creation without an upgrade.

---
*This document defines the interface between Backend Governance and Frontend Compliance.*
