# Frontend Capability System (RBAC v2)

## Purpose
A unified, capability-driven architecture that ensures the UI dynamically adapts to the user's permissions, plan entitlements, and individual feature flags without hardcoded role checks.

## Architecture Pipeline
```
AuthContext (user.roleId.permissions + organization.capabilities)
    ↓
CapabilityContext (flattens to capability mapping)
    ↓
FeatureContext (gated by subscription status and plan limits)
    ↓ Components
<Can permission="patients.update">   → RBAC Check
<FeatureGate module="orthodontics">  → Entitlement Check
<SubscriptionGate>                   → Status Check
```

## Layers of Enforcement

### 1. RBAC Layer (Permissions)
- Uses the `useCapability(key)` hook to check for specific action permissions.
- Data source: `user.roleId.permissions` (Set).

### 2. Feature Layer (Entitlements)
- Use `hasModule(key)` to check if the current organization's plan includes a specific module (e.g., Finance, Orthodontics, Inventory).
- Prevents users from seeing "Ghost Features" that are not part of their active subscription.
- Data source: `organization.capabilities.modules`.

### 3. Resource Layer (PBAC)
- Resource-level capability provider (`ResourceCapabilityProvider`) that checks if a user has access to a specific record (e.g., "Can I edit this specific invoice?").
- Used for fine-grained, context-aware actions.

## Key Components

| Component | Behavior |
| :--- | :--- |
| `<Can>` | Renders children only if a specific RBAC permission is present. |
| `<FeatureGate>` | Renders content only if the module is enabled in the organization's plan. |
| `<SubscriptionGate>` | Shows "Payment Required" or a CTA if the subscription is not `active` or `trial`. |

## Sidebar & Navigation (Dynamic Filtering)
The `Sidebar.jsx` and other layouts use the `module` key on navigation items to filter the entire nav tree based on `hasModule()`. Modules like **Orthodontics**, **Analytics**, and **Inventory** are hidden by default if not entitled.

## Developer Debugger
A floating debug panel (`CapabilityDebugger.jsx`) is available in development mode (Ctrl+Shift+D) to inspect:
- Current user info and active organization.
- Plan status and expiration.
- Flattened capability map.
- Active module entitlements and sub-feature flags.

## Dependencies
- [[AuthSystem]] — Source of raw user and org data.
- [[EntitlementSystem]] — Backend implementation of limits and gating.
- [[SecurityArchitecture]] — The overall RBAC/PBAC/RLS strategy.

## Status
**ACTIVE** — Phase 12 RBAC v2 fully deployed.

---
#frontend #rbac #entitlements #features #ui
