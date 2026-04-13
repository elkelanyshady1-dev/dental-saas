# DentalSaaS — AI Development Instructions (Rules Engine v5.0)

## 1. SPEC-KIT MODE (MANDATORY HARD GATE)
All features must follow the **Spec → Plan → Tasks → Implementation → Spec Sync** flow.
- **Blockers**: No spec, no plan, no task card, or missing DTO contracts.

## 2. ARCHITECTURAL LEY LINES
- **Plane Isolation**: Strictly Platform | Organization | Patient Portal | Supervisor. No cross-plane DB access or imports.
- **Tenant Isolation**: DB-per-org. `organizationId` MUST come ONLY from `req.context` (JWT). No filters inside org DB.
- **Single Source of Truth**: 
  - Backend: `req.context` (userId, organizationId, permissions, roleName).
  - Frontend: React Query server state (No `useState(apiData)`).

## 3. ZERO-TRUST SECURITY STACK
- **Auth**: JWT-driven only.
- **RBAC**: `authorize(req, permission)` at controller level. No middleware RBAC gates.
- **PBAC**: `buildSmartQuery(req.context)` for row-level security.
- **FLS**: `fieldFilter(req.context.roleName)` for data masking.

## 4. DTO & DATA CONTRACTS
- All responses MUST go through DTO builders. Backend is authoritative.
- Frontend must never compute domain data (e.g., `displayName` is a DTO field, not computed locally).
- All mutations must pass Zod validation before DB write.

## 5. AUTH & TOKEN MODEL
- **JWT Content**: userId, organizationId, roleName, permissions[].
- **Storage**: 
  - Platform: in-memory
  - Org: sessionStorage
  - Patient: localStorage
- **Banned**: `req.user.role`, `req.organization`, `req.authContext`, `permissionCache`.

## 6. DEVELOPMENT GOVERNANCE
1. Check **G1/G2/G3** gates before writing code.
2. Maintain **DTO** integrity. Use builders for all responses.
3. Enforce **React Query** for all data fetching. No manual `refetch()` or `window.location.reload()`.
4. Automated Audit logging via `autoAudit()`.

---
🚨 **VIOLATIONS BLOCK OUTPUT**.
❌ Output blocked by Rules Engine v5.0 if any core principle (context, DTO, React Query, Isolation) is violated.
