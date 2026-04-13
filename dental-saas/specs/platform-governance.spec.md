# PLATFORM GOVERNANCE & RBAC SPECIFICATION

**Document Type:** Technical Design Specification (TDS)
**Version:** 1.1
**Generated From:** Repository Audit — March 2026
**Updated From:** SpecKit CI audit B6 gate + Gemini CLI resolution fix — March 2026
**Source Files:**
- `backend/src/rbac/orgPermissions.js`
- `backend/src/platform/models/PlatformRole.js`
- `backend/src/platform/models/PlatformCapability.js`
- `backend/src/platform/models/PlatformUser.js`
- `backend/src/middleware/platformProtect.js`
- `backend/src/middleware/orgProtect.js`
- `backend/src/middleware/requireOrgPermission.js`
- `backend/src/middleware/requirePlatformCapability.js`
- `backend/src/middleware/subscriptionGuard.js`
- `backend/src/middleware/branchScopeMiddleware.js`
- `backend/src/middleware/unifiedCapabilityMiddleware.js`
- `backend/src/core/authorization/permissionMatrix.js`
- `backend/src/core/authorization/scopedQueryBuilder.js`
- `backend/src/core/sovereignGuard.js`
- `backend/src/integrity/routerRegistry.js`
- `backend/src/integrity/routerTopologyAudit.js`
- `packages/platform-contract/`
- `backend/src/platform/controllers/platformController.js`
- `backend/src/platform/controllers/platformUserController.js`
- `backend/src/platform/controllers/platformOrganizationController.js`
- `backend/src/platform/controllers/platformAuditController.js`

---

## SECTION 1 — PURPOSE

The Platform Governance & RBAC domain is the architectural control layer that enforces:

1. **Platform Plane RBAC** — Capability-based access control for DentalSaaS internal operators
2. **Organization Plane RBAC** — Permission-based access control for clinic staff within their tenant
3. **Plane Isolation** — Hard architectural boundary preventing cross-plane context leakage
4. **Organization Lifecycle Management** — Tenant provisioning, archival, metadata management
5. **Audit & Forensics** — Immutable audit trail for all significant platform actions
6. **Sovereign Guard** — Runtime architecture verification that the codebase follows its declared invariants

---

## SECTION 2 — DOMAIN BOUNDARY

**Owns:**
- `PLATFORM_CAPABILITIES` contract (ESM + CJS dual exports in `packages/platform-contract/`)
- Platform capability resolver (`platformCapabilityResolver.js`)
- Org permission strings (`orgPermissions.js`)
- All authorization middleware for both planes
- Organization CRUD (platform admins manage tenant organizations)
- Platform user management (CRUD, invite, role management)
- Immutable platform audit log
- Feature flag system (`FeatureFlag` model, `platformFeatureController.js`)
- Subscription guard (org access blocking)
- Branch scope middleware (per-user branch restriction)
- Router topology audit (boot-time architectural verification)
- Sovereign guard (runtime architecture health check)

**Receives signals from:**
- Auth middleware — provides `req.user` with role/capabilities
- BillingEngine — triggers entitlement updates on plan change
- OrganizationEntitlement — provides `req.planCapabilities` to subscription guard

**Emits events to:**
- Audit log (distributed BullMQ queue for high-integrity sequential writes)
- `capabilities_denied` log entry when guard rejects access

**Does NOT own:**
- Authentication (token issuance) — delegated to Auth domain
- Subscription billing mechanics — delegated to Billing Engine
- Org-plane domain data (patients, appointments, etc.)

---

## SECTION 3 — DATA MODELS

### PlatformCapability (platform/models/PlatformCapability.js)
```
PlatformCapability {
  _id          ObjectId
  code         String (unique — matches PLATFORM_CAPABILITIES contract key)
  description  String
  isActive     Boolean
}
```

### PlatformRole (platform/models/PlatformRole.js)
```
PlatformRole {
  _id          ObjectId
  name         Enum: superadmin | finance_admin | operations_admin | analyst
  capabilities Array<String> (list of PLATFORM_CAPABILITIES codes this role has)
  isSystem     Boolean (true = cannot be deleted)
}
```

### Organization (shared/models/Organization.js — Derived from code structure)
```
Organization {
  _id                    ObjectId
  name                   String (required)
  slug                   String (unique — used as clinicCode)
  country                String (ISO 3166-1 alpha-2 code — e.g. "EG", "SA", "AE")
                         // NEVER store display names — ISO code only (Sentinel §4)
  phone                  String
  email                  String
  logo                   String (URL)
  isActive               Boolean
  isArchived             Boolean
  archivedAt             Date | null
  archivedBy             ObjectId (ref: PlatformUser) | null
  archiveReason          String | null

  features               Array<String> (active feature flags from entitlement)
  subscription {
    status               Enum: trialing | active | grace | suspended | canceled
    planCode             String
    planVersionId        ObjectId
    trialEndDate         Date | null
    nextBillingDate      Date | null
    contractId           ObjectId (ref: OrgContract)
  }
  appointmentSettings {
    slotDuration         Number (minutes)
    workingHours { start: String, end: String }
  }
  adminContact           Object (name, email, phone — CRM contact)
  tags                   Array<String> (CRM tagging)
  notes                  String (CRM notes)
  createdAt              Date
  updatedAt              Date
}
```

### PlatformAuditLog (Derived from code structure)
```
PlatformAuditLog {
  _id              ObjectId
  actorId          ObjectId (ref: PlatformUser)
  actorRole        String
  action           String (e.g. "ORGANIZATION_ARCHIVED", "USER_ROLE_CHANGED")
  resourceType     String (e.g. "Organization", "PlatformUser")
  resourceId       ObjectId
  ipAddress        String
  userAgent        String
  requestId        String (X-Request-ID / correlation ID)
  before           Object (previous state snapshot — audit diff)
  after            Object (new state snapshot — audit diff)
  metadata         Object
  createdAt        Date (immutable)
}
```

---

## SECTION 4 — SERVICE RESPONSIBILITIES

### PlatformController (`platformController.js`)
- **getCapabilities** — Returns the full list of platform capabilities for the authenticated user's role
- **getFeatureFlags** — Returns all active feature flags (used by frontend at boot)
- **getSystemHealth** — Returns basic system health status

### PlatformOrganizationController (`platformOrganizationController.js` — 51KB)
Most complex controller in the platform. Responsibilities:
- **list** — Paginated organization listing with search, country filter, status filter
- **get** / **getById** — Detailed org view including subscription, contract chain, entitlements
- **create** — Provisions new organization (slug generation, initial admin user seeding, trial contract creation)
- **update** — Updates org metadata (name, country, contact, tags, notes)
- **archive** / **unarchive** — Sovereign lifecycle controls (soft-archive with reason)
- **updateLogo** — Uploads org logo to object storage, emits `org.logo.updated`
- **getContractHistory** — Returns org's full contract supersession chain
- **manageCrmNotes** — CRUD for org CRM notes and tags
- **assignSalesOwner** — Assigns a platform user as sales owner for an org

### PlatformUserController (`platformUserController.js` — 44KB)
- **list** — Paginated platform user listing
- **get** / **getById** — Platform user detail
- **create** / **update** — Platform user CRUD with role assignment
- **invite** — Generates invite token, sends invite email
- **revokeSession** / **revokeAllSessions** — Platform user session management
- **changeRole** — Updates platform user role with capability reload
- **deactivate** / **reactivate** — Platform user account lifecycle
- **resetPassword** — Admin-initiated platform user password reset

### PlatformAuditController (`platformAuditController.js`)
- **list** — Paginated, filterable audit log listing (by action, resource, actor, date range)
- **get** — Single audit log entry detail
- **frontendEvent** — AUTH_ONLY endpoint for frontend-recorded audit events (Sentinel §3 exception)

### PlatformFeatureController (`platformFeatureController.js`)
- **list** — Returns all feature flags
- **create** / **update** — Feature flag management
- **toggle** — Enable/disable a feature flag globally or per-organization

---

## SECTION 5 — PLATFORM CAPABILITIES CONTRACT

**Source:** `packages/platform-contract/`

The `PLATFORM_CAPABILITIES` object is the single source of truth for all platform permissions. Exported in both ESM and CJS formats for compatibility.

### Capability Naming Convention
- `VIEW_*` — Read operations (GET routes)
- `MANAGE_*` — Mutation operations (POST, PUT, PATCH, DELETE routes)

### Capability → Role Matrix
| Capability | superadmin | finance_admin | operations_admin | analyst |
|------------|-----------|--------------|-----------------|---------|
| `VIEW_ORGANIZATIONS` | ✓ | ✓ | ✓ | ✓ |
| `MANAGE_ORGANIZATIONS` | ✓ | — | ✓ | — |
| `VIEW_PLATFORM_USERS` | ✓ | — | ✓ | — |
| `MANAGE_PLATFORM_USERS` | ✓ | — | — | — |
| `VIEW_SUBSCRIPTIONS` | ✓ | ✓ | ✓ | ✓ |
| `MANAGE_SUBSCRIPTIONS` | ✓ | ✓ | — | — |
| `VIEW_AUDIT_LOGS` | ✓ | ✓ | ✓ | ✓ |
| `VIEW_PLATFORM_ANALYTICS` | ✓ | ✓ | ✓ | ✓ |
| `MANAGE_FEATURE_FLAGS` | ✓ | — | ✓ | — |
| `VIEW_FEATURE_FLAGS` | ✓ | ✓ | ✓ | ✓ |

> **Note:** This matrix is derived from code structure. The authoritative source is `packages/platform-contract/`. Consult the contract for the complete and current capability list.

---

## SECTION 6 — ORGANIZATION RBAC (ORG PLANE)

### Permission String Format
```
<module>.<action>
```

### Canonical Permission Set (`orgPermissions.js`)
| Module | Permissions |
|--------|------------|
| Patients | `patients.read`, `patients.create`, `patients.update`, `patients.delete` |
| Appointments | `appointments.read`, `appointments.create`, `appointments.update`, `appointments.delete` |
| Recalls | `recalls.read`, `recalls.create`, `recalls.update`, `recalls.delete` |
| Families | `families.read`, `families.create`, `families.update`, `families.delete` |
| Accounting | `accounting.read`, `accounting.create`, `accounting.update`, `accounting.delete` |
| Orthodontics | `orthodontics.read`, `orthodontics.create`, `orthodontics.update`, `orthodontics.delete` |
| Calendar | `calendar.read`, `calendar.multiBranchView` |
| Staff | `staff.manage` |

### Role → Permission Matrix
| Permission | org_admin | doctor | assistant | receptionist | lab_technician |
|------------|-----------|--------|-----------|-------------|---------------|
| `patients.*` | All | R,C,U | R | R,C | R |
| `appointments.*` | All | R,C,U | R,C,U | R,C,U | — |
| `accounting.*` | All | — | — | R | — |
| `orthodontics.*` | All | R,C,U | — | — | R,U |
| `calendar.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `calendar.multiBranchView` | ✓ | — | — | — | — |
| `staff.manage` | ✓ | — | — | — | — |

---

## SECTION 7 — MIDDLEWARE STACK

### Platform Plane Middleware Chain
```
Request
  → platformProtect         (JWT validation for PlatformUser)
  → requirePlatformCapability(CAP.X)   (capability check against resolver)
  → Controller
```

### Organization Plane Middleware Chain
```
Request
  → orgProtect              (JWT validation for org User)
  → organizationContext     (loads Organization, injects req.organization + req.organizationId)
  → subscriptionGuard       (checks org subscription status — blocks suspended/terminated orgs)
  → branchScopeMiddleware   (injects req.allowedBranches, req.activeBranchId)
  → unifiedCapabilityMiddleware (builds req.capabilities from plan + role entitlements)
  → requireOrgPermission(P.X)  (permission check)
  → Controller
```

### Branch Scope Middleware
- Builds `req.allowedBranches` from `user.branchAccess`
- If `user.hasFullBranchAccess = true` → `req.allowedBranches = null` (all branches allowed)
- If restricted → `req.allowedBranches = user.branchAccess` (array of allowed branch IDs)
- Injects `req.activeBranchId` from request headers or session state

### Subscription Guard
- Reads `Organization.subscription.status` from org document
- Blocked contractStatuses: `suspended`, `terminated`, `archived`
- Returns `402 Payment Required` if suspended; `403 Forbidden` if terminated/archived

### Unified Capability Middleware
- Merges `req.planCapabilities` (from subscription plan features) with `user.permissions` (from role)
- Produces `req.capabilities` — the effective capability set for the request

---

## SECTION 8 — SOVEREIGN GUARD & TOPOLOGY AUDIT

### Sovereign Guard (`core/sovereignGuard.js`)
- Runs at application boot (`verifyArchitecture(app)` in `app.js`)
- Verifies critical architectural invariants:
  - No platform middleware imported from org-plane paths
  - No org middleware imported from platform-plane paths
  - Key files exist and export expected functions
  - No raw capability strings in route files
- Emits warnings for violations found. Critical violations abort startup.

### Router Topology Audit (`integrity/routerTopologyAudit.js`)
- Runs at boot (`auditRouterTopology()`)
- Inspects the Express router stack for:
  - Routes without guard middleware
  - Duplicate route registrations
  - Missing Swagger annotations (warning only)
- Logs audit report to structured logger

### Router Registry (`integrity/routerRegistry.js`)
- `registerRouter(name, basePath)` — records each router mount point
- Used by topology audit to map route paths to registered routers

---

## SECTION 9 — API CONTRACTS

### Platform Organization Routes
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET    | `/api/platform/organizations` | List all tenant orgs | `platformProtect` + `VIEW_ORGANIZATIONS` |
| POST   | `/api/platform/organizations` | Create/provision new org | `platformProtect` + `MANAGE_ORGANIZATIONS` |
| GET    | `/api/platform/organizations/:id` | Get org detail | `platformProtect` + `VIEW_ORGANIZATIONS` |
| PATCH  | `/api/platform/organizations/:id` | Update org metadata | `platformProtect` + `MANAGE_ORGANIZATIONS` |
| POST   | `/api/platform/organizations/:id/archive` | Archive org | `platformProtect` + `MANAGE_ORGANIZATIONS` |
| POST   | `/api/platform/organizations/:id/unarchive` | Unarchive org | `platformProtect` + `MANAGE_ORGANIZATIONS` |
| GET    | `/api/platform/organizations/:id/contracts` | Org contract history | `platformProtect` + `VIEW_SUBSCRIPTIONS` |

### Platform User Routes
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET    | `/api/platform/users` | List platform users | `platformProtect` + `VIEW_PLATFORM_USERS` |
| POST   | `/api/platform/users` | Create platform user | `platformProtect` + `MANAGE_PLATFORM_USERS` |
| GET    | `/api/platform/users/:id` | Get user detail | `platformProtect` + `VIEW_PLATFORM_USERS` |
| PATCH  | `/api/platform/users/:id` | Update user | `platformProtect` + `MANAGE_PLATFORM_USERS` |
| POST   | `/api/platform/users/:id/invite` | Re-send invite | `platformProtect` + `MANAGE_PLATFORM_USERS` |
| POST   | `/api/platform/users/:id/deactivate` | Deactivate user | `platformProtect` + `MANAGE_PLATFORM_USERS` |

### Audit Routes
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET  | `/api/platform/audit` | List audit log entries | `platformProtect` + `VIEW_AUDIT_LOGS` |
| GET  | `/api/platform/audit/:id` | Get audit entry detail | `platformProtect` + `VIEW_AUDIT_LOGS` |
| POST | `/api/platform/audit/frontend-event` | Record frontend audit event | `platformProtect` (AUTH_ONLY — no capability check) |

### Feature Flags
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET  | `/api/platform/feature-flags` | Get all feature flags | `platformProtect` (AUTH_ONLY) |
| POST | `/api/platform/feature-flags` | Create feature flag | `platformProtect` + `MANAGE_FEATURE_FLAGS` |
| PATCH | `/api/platform/feature-flags/:id` | Toggle/update feature flag | `platformProtect` + `MANAGE_FEATURE_FLAGS` |

---

## SECTION 10 — SECURITY RULES

- **PLATFORM_CAPABILITIES is absolute:** No raw string used as a capability guard. All guards reference `PLATFORM_CAPABILITIES.X` constants. New capabilities must be added to the contract first.
- **No inline role checks:** `role === "superadmin"` is forbidden in controllers and services. All role resolution goes through `platformCapabilityResolver.js`.
- **Platform/Org plane isolation:** Platform middleware (`platformProtect`) must never be imported in org-plane routes. Org middleware (`orgProtect`) must never be imported in platform routes. `sovereignGuard` validates this at boot.
- **ISO country invariant:** `organization.country` stores ISO alpha-2 code only. Display name mapping must happen in the frontend. Backend validation rejects non-ISO country values.
- **Audit log immutability & Sequence:** `PlatformAuditLog` and `AuditLog` records are append-only. Organization audit logs use BullMQ for sequential processing (`concurrency: 1`) to ensure hash-chain integrity across multi-instance deployments.
- **Archival (soft-sovereign):** Archived organizations cannot be hard-deleted. Archival creates an audit record and blocks subscription guard access.
- **Observability requirement:** Every `CAPABILITY_DENIED` event must produce an audit log entry. Denial without logging is a governance violation.

---

## SECTION 11 — INVARIANTS

- Every `/api/platform/*` route must use `platformProtect`.
- Every `/api/platform/*` mutation route (POST/PATCH/PUT/DELETE) must use `authorizePlatformPermission` or `requirePlatformCapability` unless explicitly listed as AUTH_ONLY.
- GET routes on platform use `VIEW_*` capabilities; mutation routes use `MANAGE_*` capabilities.
- AUTH_ONLY exceptions: `/auth/*`, `/capabilities`, `/feature-flags`, `/me*`, `/audit/frontend-event`, `/performance-metric`.
- No org-plane middleware imported in platform routes and vice versa.
- `organization.country` must always be a valid ISO 3166-1 alpha-2 code.
- Platform capability codes must exist in `PLATFORM_CAPABILITIES` before being referenced in route guards.
- Frontend must use `capabilities.includes('CAPABILITY_NAME')` — never `capabilities['CAPABILITY_NAME']`.

---

## SECTION 12 — SPEC-KIT CI ENFORCEMENT & DEVELOPER TOOLING (v1.1)

### Overview

SpecKit is the CI-grade spec governance system that enforces SPEC-FIRST development across the entire codebase. It verifies spec gate compliance (G1/G2/G3) and blocks architectural regressions via code pattern scanning (B1–B6).

### Enforcement Script

**File:** `scripts/auditSpecFlow.js`

Runs on every push/pull request via `.github/workflows/spec-governance.yml`. Exit code 1 = CI block.

```
Usage:
  node scripts/auditSpecFlow.js            # human-readable
  node scripts/auditSpecFlow.js --json     # machine-readable (CI annotations)
  node scripts/auditSpecFlow.js --summary  # one-line pass/fail
```

### Gate Structure

| Gate | Purpose | Failure Action |
|------|---------|----------------|
| G1 | `specs/spec.md` + all module spec files exist and are non-empty | BLOCK |
| G2 | `specs/plan.md` exists and non-empty | BLOCK |
| G3 | `specs/tasks.md` exists and non-empty | BLOCK |
| B1 | Zero-Trust Auth violations (localStorage platformToken, generic "token" key) | BLOCK |
| B2 | Raw fetch() bypassing interceptors (manual `localStorage.getItem` for tokens) | BLOCK |
| B3 | React Query violations (hardcoded keys, `new QueryClient()`, `window.reload`) | BLOCK |
| B4 | Cross-plane frontend import violations (Platform → Org or Org → Platform imports) | BLOCK |
| B5 | BroadcastChannel data payload leaks (events carrying plan data instead of type-only) | BLOCK |
| B6 | **Plan Projection Layer bypass** (raw status/visibility string comparisons in plan UI) | BLOCK |

### B6 — Plan Projection Layer Bypass (Added v1.1)

Scans `frontend/src/platform/modules/plans/` and `frontend/src/modules/public-site/`:

| Sub-gate | Pattern Blocked |
|----------|----------------|
| B6.1 | `.status === "active/draft/deprecated"` in plan UI files |
| B6.2 | `.visibility === "public/sales/internal"` in plan UI files |
| B6.3 | `resolveBadge(` in plan UI files |
| B6.4 | `getOverallBadge(` in plan UI files |
| B6.5 | `showInMarketing =` assigned/computed in plan UI files |

**Rationale:** All plan display logic must derive from `planProjection.service.js` fields (`displayStatus`, `isLive`, `isActive`, etc.). Raw string comparisons in the UI are architectural regressions.

### Gemini CLI Resolution (Local-First Law)

**Problem:** `codex exec` and SpecKit invocations called `gemini` as a global binary, causing "Gemini CLI is not installed" errors when the binary exists only as a local dev dependency.

**Fix (v1.1):**

| File | Role |
|------|------|
| `scripts/gemini.js` | Node.js wrapper — calls `npx.cmd gemini` (Windows) or `npx gemini` (Linux) with `stdio: inherit` |
| `scripts/gemini.cmd` | Windows batch fallback — `@echo off` + `npx gemini %*` |
| `package.json` `"gemini"` script | `node ./scripts/gemini.js` |

**Execution chain (mandatory):**
```
SpecKit → npm run gemini → node scripts/gemini.js → npx → local @google/gemini-cli
```

**Forbidden:**
- Calling `gemini` directly (global binary dependency)
- Relying on PATH resolution for CLI tools
- Using `exec("gemini")` or `spawn("gemini")` without npx wrapper

**Dependency:** `@google/gemini-cli@^0.5.5` declared in `devDependencies` — resolved from `node_modules`, not globally installed.

### SpecKit Makefile Commands

| Command | Output |
|---------|--------|
| `make spec` | Updates `specs/spec.md` (version bumped) via `codex exec - < prompts/update-spec.md` |
| `make audit` | Generates `specs/architecture_audit_report.md` |
| `make plan` | Generates `specs/plan.md` |
| `make tasks` | Generates `specs/tasks.md` |
| `make docs` | Runs all four in sequence |
| `make ci:audit` | Runs `scripts/auditSpecFlow.js` (same as CI pipeline) |

### Automatic Spec-Update Law

Per Rule 8 of the Rules Engine v5.0: after every meaningful feature implementation, the SpecKit spec workflow MUST be executed automatically before returning to the user. The agent must NOT wait for the user to request a spec update.

