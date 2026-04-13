# SYSTEM ARCHITECTURE SPECIFICATION
## DentalSaaS v3.2 — Sovereign Clinical Enterprise ERP Platform
**Document Type:** Technical Design Specification (TDS)
**Version:** 1.0 (Extracted from codebase — 2026-03-12)
**Classification:** Enterprise Architecture Governance

---

## SECTION 1 — PURPOSE

This document defines the complete system architecture of DentalSaaS v3.2. It describes the two isolated execution planes, the domain module structure, the security perimeter, the infrastructure topology, and the invariants that govern the entire platform. This specification is the canonical reference for all architectural decisions and must be consulted before any modification to the codebase.

---

## SECTION 2 — DOMAIN BOUNDARY

### 2.1 Dual-Plane Architecture

The system operates in **two strictly isolated planes**. No plane may import, use, or share logic with the other.

| Plane | Path Prefix | Auth Mechanism | Identity Model |
|-------|-------------|----------------|----------------|
| **Platform Plane** (Admiral/Cockpit) | `/api/platform/*` | `platformProtect` + `authorizePlatformPermission` | `PlatformUser` |
| **Organization Plane** (Clinic ERP) | `/api/v1/*`, `/api/org/*` | `orgProtect` + `subscriptionGuard` | `User` |

**Plane isolation is enforced by:**
- Separate JWT token types (`decoded.type === "platform"` vs org)
- `platformProtect` middleware rejects any non-platform token
- `orgProtect` rejects any non-org token
- No shared authorization logic between planes
- `authMiddleware` sanitizes `platformRole` from org-user tokens on hydration (v20.2)

### 2.2 Domain Module Structure

All business logic lives within domain boundaries:

```
backend/src/modules/
├── patientDomain/         — Sovereign Patient Aggregate (WRITE authority)
├── appointmentDomain/     — Appointment Engine + Status State Machine
├── billingDomain/         — Stripe Webhook + SaaS Billing
├── inventoryDomain/       — Stock Management + Cost Tracking
├── clinicalProtocolDomain/ — Protocol Enforcement Engine
├── communicationDomain/   — Email / SMS / WhatsApp
├── notificationDomain/    — Internal Notification System
├── financialDomain/       — ERP Financial Engine (in progress)
├── stageDomain/           — Clinical Stage Execution
├── orthodonticDomain/     — Orthodontic Specialty Engine
├── alignerProductionDomain/ — Aligner Workflow Engine
├── analyticsDomain/       — Corporate Analytics
├── intelligenceDomain/    — AI-driven insights
├── documentEngineDomain/  — PDF / Print automation
├── booking/               — Patient Booking Request Approval
├── patientPortal/         — Patient self-service portal
└── organization/          — Org-level RBAC + settings
```

**Cross-Domain Communication Rule:**
```
Event → EventBus → Subscriber → Local Action
```
No domain may directly mutate another domain's Mongoose collection.

### 2.3 Infrastructure Layer

```
├── queues/       — BullMQ: emailQueue, smsQueue, whatsappQueue, auditQueue, emailDLQ
├── workers/      — emailWorker, smsWorker, auditWorker, communication.worker, notification.worker
├── redis/        — Redis client (queue backing)
├── metrics/      — Prometheus metrics registry
├── edge/         — Edge router (CDN / multi-region routing)
└── bullBoard.js  — Queue monitoring dashboard
```

---

## SECTION 3 — DATA MODELS

### 3.1 Core Shared Models (`backend/src/shared/models/`)

#### Organization
```
Organization {
  _id, name, normalizedName, slug,
  ownerId (→ User),
  country (ISO 3166-1 alpha-2, enforced by regex),
  regionCode (EU | US | MEA | APAC | null, IMMUTABLE after creation),
  billingCountry, billingCurrency (ISO, locked on first contract),
  subscription {
    status (trial | active | suspended | expired | canceled | past_due),
    trialEndsAt, currentPeriodStart, currentPeriodEnd,
    gracePeriodEnd, gracePeriodDays (default:7),
    autoRenew, paymentProvider (stripe | paymob | paypal),
    providerCustomerId, providerSubscriptionId,
    planVersion, lastPlanChangeAt, scheduledPlanChange,
    salesOwnerId (→ PlatformUser)
  },
  modules { patients, notifications, appointments, accounting,
            booking, analytics, inventory, orthodontics, labs },
  features (Map<String, {enabled, overridden}>),
  isActive, isArchived, archivedAt,
  currentContractId (→ OrgContract),
  trialStartDate, trialEndDate, trialConsumed,
  contacts [{role, ownerName, phone}],
  crm { notes[{text, createdBy, createdAt}], tags[], tasks[{title, status, dueDate}] },
  appointmentSettings { slotDuration (15|30|45|60), workingHours {start, end} },
  organizationSettings { isPublicLandingEnabled, branding {primaryColor, logo} },
  logoUrl, logoKey, defaultLanguage (en|ar), isVerified,
  version (OAV),
  timestamps
}
```
**Invariants:** `regionCode` is immutable after creation. `country` must be ISO alpha-2. `normalizedName` auto-derived. `graceEndsAt` is forbidden (use `gracePeriodEnd`).

#### User (Org-Plane Identity)
```
User {
  _id, firstName, lastName, name (virtual sync),
  email (unique), password (bcrypt, select:false),
  roleId (→ Role), organizationId (→ Organization),
  dataScope { level (organization|branch|personal), branches[], permissions },
  branchAccess (→ Branch[]), hasFullBranchAccess,
  visibilityOverrides { patients, finance, appointments, inventory },
  canManageOverrides,
  isActive, deletedAt,
  tokenVersion (OAV — JWT invalidation),
  version (OAV),
  mustChangePassword, passwordResetToken, passwordResetExpires,
  lastLogin, profileImage, phone, whatsapp, jobTitle, department,
  timestamps
}
```

#### AuditLog (Append-Only Immutable)
```
AuditLog {
  _id, organizationId, regionCode, branchId (immutable),
  userId, actorId, actorType (platform_user|tenant_user|system),
  action, entity, entityType, entityId,
  ipAddress, userAgent, statusCode, success,
  details (Mixed), metadata (Mixed),
  correlationId, sessionId, requestId,
  previousHash, currentHash (SHA chain), signatureVersion,
  actorFirstName, actorLastName, actorRole (write-time snapshot),
  description, geoLocation, browser, os, device,
  createdAt (immutable)
}
```
**Invariants:** `updateOne`, `findOneAndUpdate`, `replaceOne`, `updateMany`, `deleteOne`, `findOneAndDelete`, `deleteMany` all throw `ImmutabilityViolation`. `{ previousHash: 1 }` unique index enforces chain integrity within the per-org database.

#### Branch
```
Branch {
  _id, organizationId, name, isActive, timestamps
}
```

#### Role
```
Role {
  _id, organizationId, name,
  permissions: { [module]: { [action]: Boolean } },
  timestamps
}
```

### 3.2 Platform-Plane Models (`backend/src/platform/models/`)

#### PlatformUser
```
PlatformUser {
  _id, firstName, lastName, name (virtual sync),
  email (unique), password (bcrypt, select:false),
  role (superadmin | finance_admin | operations_admin | analyst),
  isActive, tokenVersion, mustChangePassword,
  passwordResetExpires, twoFactorEnabled,
  twoFactorSecretEncrypted (AES-256-GCM, select:false),
  recoveryCodes [{codeHash, used, usedAt}],
  failed2FAAttempts, lastFailed2FAAt, twoFALockedUntil,
  trustedIPs [{ip, lastUsedAt}],
  lastLogin, inviteToken (select:false), inviteTokenExpires,
  profileImage, phone, whatsapp, jobTitle, department,
  timestamps
}
```

---

## SECTION 4 — SERVICE RESPONSIBILITIES

### 4.1 Authentication Service
- **Org-Plane:** `organization/controllers/authController.js`
  - Register, login, refresh, logout, forgot/reset/change password, session mgmt
- **Platform-Plane:** Dedicated platform auth controller
- **Token management:** `RefreshToken` model with rotation + CSRF double-submit cookie

### 4.2 Sovereign Patient Aggregate Service
- **File:** `modules/patientDomain/core/patient.aggregate.service.js`
- **Authority:** The ONLY authorized layer for mutating Patient domain state
- **Pattern:** Atomic MongoDB transactions (with snapshot isolation) + post-commit events
- **Operations:** createPatient, updatePatient, changePrimaryBranch, updateBranchAccess, setPortalEnabled, softDeletePatient, changeStatus, updateMedicalHistory, updatePolicy, assignDoctor

### 4.3 Appointment Engine
- **File:** `modules/appointmentDomain/appointment.controller.js`
- **Operations:** getAvailability, createAppointment, updateAppointmentStatus, getAppointments, updateAppointment, deleteAppointment, getCalendarDay
- **Child services:** overlapDetection, statusTransitions, billingService (invoice trigger on completion)

### 4.4 Billing Domain
- **Stripe Webhook Service:** `modules/billingDomain/services/stripe.webhook.service.js` (deprecated, reference only)
- **Canonical Processor:** `StripeProvider.normalizeToCanonical()` → `canonicalEventProcessor.handleCanonicalEvent()`
- **Models:** PlatformInvoice, SubscriptionMutationRecord, Ticket, DomainEventOutbox

### 4.5 Inventory Service
- **File:** `modules/inventoryDomain/services/inventory.service.js`
- **Single exported function:** `deductStockForStage(organizationId, caseId, consumptionItems, actorId, isInternalEvent, session)`
- **Pattern:** OAV (Optimistic Aggregate Versioning) enforced on every stock mutation
- **Side effects:** creates `InventoryTransaction`, updates `CaseCostSnapshot`

### 4.6 Platform Capability Resolver
- **File:** `services/platformCapabilityResolver.js`
- **Authority:** The ONLY function that may resolve platform capabilities
- **Input:** `{ role: PlatformUser.role }`
- **Output:** `{ capabilitySet: Set<String> }`
### 4.7 Audit Service
- **File:** `services/auditService.js`
- **Implementation:** Distributed BullMQ-based queue (`auditQueue`) with sequential worker (`auditWorker`, `concurrency: 1`).
- **Guarantee:** Cryptographic hash-chain integrity per organization. Sequential processing prevents "Audit Chain Split" errors in multi-user environments.
- **Self-Healing:** Inline E11000 collision recovery (re-reads chain tail and retries within the same job) + boot-time stale index deletion.

---

## SECTION 5 — API CONTRACTS

### 5.1 Route Mount Map

| Route Prefix | Handler | Guard |
|---|---|---|
| `/api/health` | `healthRoutes` | None |
| `/api/public/*` | `platformPublicRoutes` | None |
| `/api/v1/auth/*` | `authRoutes` | None (rate-limited) |
| `/api/v1/organizations/*` | `organizationRoutes` | `orgProtect` |
| `/api/v1/patient/domain/*` | `patientDomainRoutes` | `protect` |
| `/api/v1/patient/booking/*` | `bookingRoutes` | `bookingLimiter` |
| `/api/v1/org/*` | `orgV1Routes` | `subscriptionGuard + protect + unifiedCapabilityMiddleware` |
| `/api/v1/org/entitlements/*` | `orgEntitlementRoutes` | `subscriptionGuard + protect + orgProtect + organizationContext` |
| `/api/platform/*` | `platformRoutes` | `platformProtect + authorizePlatformPermission` |
| `/api/auth/*` | `authRoutes` (legacy) | `loginLimiter` (on /login) |
| `/admin/queues` | BullBoard | `platformProtect + superAdminOnly` |
| `/admin/test-queue` | Queue test | `platformProtect + superAdminOnly` |
| `/admin/queue-health` | Queue health | `platformProtect + superAdminOnly` |
| `/metrics` | Prometheus | `METRICS_ENABLED==true` env guard |

### 5.2 Guard Matrix (Platform Plane)

| HTTP Method | Required Capability Prefix |
|-------------|---------------------------|
| GET | `VIEW_*` |
| POST | `MANAGE_*` |
| PATCH | `MANAGE_*` |
| PUT | `MANAGE_*` |
| DELETE | `MANAGE_*` |

**AUTH_ONLY exceptions** (no capability check required):
- `/auth/*`, `/capabilities`, `/feature-flags`, `/me*`, `/audit/frontend-event`, `/performance-metric`

---

## SECTION 6 — SECURITY RULES

### 6.1 JWT Architecture
- **Access Token:** Short-lived, Bearer header, signed with `JWT_SECRET`
- **Refresh Token:** HTTP-only cookie, CSRF double-submit pattern (`x-csrf-token` header must match `csrf_token` cookie)
- **Token Type Field:** `decoded.type === "platform"` | `"org"`
- **Geo Token Enforcement (v14.1):** Org tokens MUST carry `regionCode`; mismatch returns HTTP 409 `REGION_MISMATCH`
- **tokenVersion (OAV):** Incrementing on password change / security events instantly invalidates all issued tokens

### 6.2 Rate Limiting
- Login (prod): 5 attempts per 15 min per IP
- Login (dev): 20 attempts per 1 min per IP
- Booking: 50 requests per 5 min per IP

### 6.3 Request Hardening
- `helmet()` — sets secure HTTP headers
- `express-mongo-sanitize` — prevents NoSQL injection
- `mongoSanitize` applied globally
- ETag disabled globally (v19.3) to prevent blank-page 304 artifacts
- `trust proxy 1` for correct IP resolution behind load balancers

### 6.4 RBAC — Org Plane
- Role-based permission matrix loaded from `Role.permissions`
- Permission Set built as `Set<"module.action">` for O(1) RBAC lookup on each request
- `visibilityOverrides` allow per-user data scope: `ALL | BRANCH | OWN`
- Branch access: `branchAccess[]` list OR `hasFullBranchAccess: true`

### 6.5 RBAC — Platform Plane
- Four roles: `superadmin`, `finance_admin`, `operations_admin`, `analyst`
- `platformCapabilityResolver.js` is the ONLY function that maps roles to capabilities
- `authorizePlatformPermission(capability)` middleware enforces capability at route level
- CAPABILITY_DENIED events produce: pino log entry + AuditLog record

### 6.6 PlatformUser 2FA (Superadmin)
- TOTP secret stored AES-256-GCM encrypted
- Recovery codes stored as bcrypt hashes
- Lockout after `failed2FAAttempts` threshold

### 6.7 Tenant Isolation — DB-per-Org Architecture (v2)

**Phase:** v2.0 (Guard System — migrated 2026-03-28)
**Module:** `src/core/guards/`, `src/infrastructure/dbManager.js`, `src/core/db/getModel.js`

> **Migration Note (2026-03-28):** The system migrated from an RLS-based architecture
> (`secureModel` + `queryScoper` + `organizationId` injection) to a DB-per-org model.
> ~4,200 LOC of RLS infrastructure was removed. `src/core/rls/` no longer exists.
> RLS is permanently deprecated. ESLint rules block any reintroduction.

#### Architecture

Tenant isolation is enforced at the **database connection level**. Each organization has a dedicated MongoDB database (`dental_org_<orgId>`). All queries execute only within the scoped connection — cross-tenant access is impossible by design.

```
Request → orgProtect (JWT) → dbContext middleware → req.dbConnection
                                                         ↓
                                              getModel(req.dbConnection, ModelDef)
                                                         ↓
                                              Model.find(query)  (scoped to org DB)
                                                         ↓
                                              MongoDB (dental_org_<orgId>)
```

#### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| `dbManager` | `infrastructure/dbManager.js` | Connection pool manager — one pool per org |
| `getModel` | `core/db/getModel.js` | Registers Mongoose model on a specific connection |
| `dbContext` | `middleware/dbContext.js` | Resolves `req.dbConnection` from `req.organizationId` |
| `tenantAssertions` | `core/guards/tenantAssertions.js` | Defense-in-depth: asserts `req.dbConnection` exists |
| `guardRunner` | `core/guards/guardRunner.js` | Pre/post/field guard execution engine |
| `routeGuard` | `core/guards/routeGuard.wrapper.js` | Route-level guard enforcement wrapper |

#### Guard System V2

Authorization is handled via explicit guards applied at the route level:

| Guard Type | When | Purpose |
|------------|------|---------|
| **Pre-query** | Before DB query | Modify query filters (branch, ownership) |
| **Post-query** | After DB query | Validate returned data (existence, ownership) |
| **Field-level** | Before response | Control field projection (FLS) |
| **Access** | Route entry | Permission and entitlement checks |

```javascript
// Example: Guarded patient route
router.get("/patients", guardedRoute(
  {
    pre: [scopeToDoctor(), scopeToBranch()],
    field: [restrictFields("patient")],
    access: ["PATIENT_READ"],
  },
  async (req, res) => {
    const Patient = getModel(req.dbConnection, PatientDef);
    const query = req.applyPreGuards({});
    const proj  = req.applyFieldGuards({});
    const patients = await Patient.find(query).select(proj).lean();
    res.json(patients);
  }
));
```

#### Data Access Pattern

```javascript
// Model resolution (per-org)
const Patient = getModel(req.dbConnection, PatientDef);

// Direct query — no wrappers needed (DB is org-scoped)
const patient = await Patient.findById(id).lean();

// With session (for transactions)
const session = await req.dbConnection.startSession();
session.startTransaction();
const invoice = await Invoice.findById(id).session(session);
```

### 6.8 Field-Level Security (FLS) — Role-Based Data Output Control

**Phase:** F.10 (Field-Level Security Engine Launch)
**Module:** `src/rbac/`

#### Architecture

All API responses and mutations are governed by a role-based field filtering layer that sits between the database output and the client response. FLS controls WHICH fields within query results are visible or writable.

```
Database Query Result (org-scoped via dbConnection)
    ↓
Guard System (pre/post/field guards)
    ↓
fieldFilterMiddleware (role-based field filtering)
    ↓
res.json() → Client
```

#### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| `fieldAccessRegistry` | `rbac/fieldAccessRegistry.js` | SSOT: 15 resource types × 5 roles (67 entries) |
| `fieldFilter` | `rbac/fieldFilter.js` | `fieldFilterMiddleware` + `filterFields` + `filterDocument` + `filterAggregateResults` |
| `fieldWriteGuard` | `rbac/fieldWriteGuard.js` | `fieldWriteGuardMiddleware` + `guardWriteFields` (strict/warn modes) |
| `fieldAccessValidator` | `rbac/validators/fieldAccessValidator.js` | Boot-time + CI validation |
| `checkFieldAccessCompliance` | `scripts/checkFieldAccessCompliance.js` | CI enforcement (100% resource coverage) |
| `policyDebugger` | `rbac/policyDebugger.js` | Full FLS integration in authorization debug matrix |

#### Enforcement Modes

| Mode | Read | Write |
|------|------|-------|
| **Wildcard (`"*"`)** | All fields visible | All fields writable |
| **Whitelist** | Only listed fields visible | Only listed fields accepted |
| **Implicit Deny** | No entry = no access | No entry = all writes rejected |

#### Security Enforcement Chain (v2)

```
Layer 1: Isolation     → DB-per-org connection (primary boundary)
Layer 2: Context       → req.rls / req.dbConnection (tenant context)
Layer 3: Authorization → RBAC + PBAC (role/policy checks)
Layer 4: Guards        → Guard System V2 (pre/post/field)
Layer 5: FLS           → fieldFilter + fieldWriteGuard
Layer 6: Governance    → CI enforcement + audit
```

---

## SECTION 7 — EVENT EMISSIONS

### 7.1 Core EventBus Events (`core/domainEvents.js`)

| Event Constant | Emitted By | Consumers |
|---|---|---|
| `PATIENT_CREATED` | PatientAggregateService | NotificationSubscriber, OwnershipSubscriber |
| `PATIENT_UPDATED` | PatientAggregateService | AppointmentSubscriber |
| `PATIENT_DELETED` | PatientAggregateService | PortalKillSwitch |
| `PATIENT_STATUS_CHANGED` | PatientAggregateService | NotificationSubscriber |
| `PATIENT_BRANCH_UPDATED` | PatientAggregateService | ProjectionSubscriber |
| `PATIENT_MEDICAL_UPDATED` | PatientAggregateService | RiskEngine |
| `PATIENT_POLICY_UPDATED` | PatientAggregateService | PolicyProjection |
| `APPOINTMENT_CREATED` | AppointmentController | BookingSubscriber, NotificationSubscriber |
| `APPOINTMENT_UPDATED` | AppointmentController | CalendarProjection |
| `APPOINTMENT_STATUS_CHANGED` | AppointmentController | BillingTrigger, NotificationSubscriber |
| `patient.doctor.assigned` | PatientAggregateService | OwnershipSubscriber |

### 7.2 Outbox Events
- `DomainEventOutbox` model stores events for durable delivery
- Used in: dispute ticket created, payment webhook processing
- Status: `PENDING` | `PROCESSED`

### 7.3 Worker Infrastructure
- `emailWorker` processes `emailQueue` (BullMQ → Nodemailer)
- `smsWorker` processes `smsQueue`
- `communication.worker` handles cross-channel routing
- `notification.worker` handles internal platform notifications
- Dead letter queue: `emailDLQ` for failed email jobs

---

## SECTION 8 — INVARIANTS

1. **Plane Isolation:** Platform plane must never import org-plane models, middleware, or RBAC logic.
2. **RBAC Centralization:** `platformCapabilityResolver.js` is the single capability resolver. No inline role checks anywhere.
3. **Capability Contract:** No capability string may be used that does not exist in the `PLATFORM_CAPABILITIES` contract.
4. **ISO Country:** `Organization.country` must be 2-letter ISO 3166-1 alpha-2. Display names must never be stored.
5. **regionCode Immutability:** `Organization.regionCode` is immutable after creation (Mongoose pre-save guard).
6. **AuditLog Immutability:** No update or delete operations allowed. Chain-hash enforced. `{ previousHash: 1 }` unique per database. Sequential processing enforced via BullMQ.
7. **Patient Sovereignty:** Only `PatientAggregateService` may mutate Patient state. Cross-domain writes are forbidden.
8. **OAV Enforcement:** All aggregate mutations must carry `version` for optimistic concurrency. Mismatch throws `VersionConflictError`.
9. **Token Version:** Password change and security events must increment `tokenVersion` to invalidate active JWTs.
10. **Stripe Raw Body:** Stripe webhook route must be mounted BEFORE `express.json()` to preserve raw body for signature verification.
11. **Domain Isolation:** No domain module may import another domain's Mongoose models directly.
12. **Subscription Guard Scope:** `subscriptionGuard` is mounted only on org routes — never globally.
13. **DB-per-Org Isolation (v2):** All org-plane database queries MUST use `getModel(req.dbConnection, ModelDef)`. Direct `mongoose.model()` calls for org-scoped data are forbidden. Each organization operates on a dedicated database (`dental_org_<orgId>`).
14. **Tenant Context Source:** `req.dbConnection` (resolved from verified JWT via `dbContext` middleware) is the primary tenant isolation boundary. `req.rls` provides supplementary context (userId, branchId, role).
15. **Guard Enforcement (v2):** Route handlers accessing org-scoped data SHOULD use `guardedRoute()` with explicit pre/post/field guards. Unguarded routes MUST be documented with justification.
16. **Tenant Assertions:** Critical-path services (finance, patient, clinical) MUST call `assertTenantContext(req)` from `@core/guards/tenantAssertions` to verify `req.dbConnection` before any database operation.
17. **Background Job Isolation:** Background jobs that access org-scoped data MUST resolve their own connection via `dbManager.getConnection(orgId)` and use `getModel(conn, Def)` for model access. Global mongoose models are FORBIDDEN for org data in background contexts. All audit writes MUST use the `auditQueue` for sequential consistency.
18. **Public Token Binding:** Public endpoints (intake, portal activation) that operate without JWT authentication MUST derive `organizationId` exclusively from server-side token records (e.g., `PatientIntakeToken.organizationId`). User-supplied `organizationId` is FORBIDDEN on public routes. All public endpoints MUST be rate-limited.
19. **Non-Null Connection Context:** `dbContext` middleware MUST fail-closed when connection resolution yields a NULL or invalid connection. Missing `req.dbConnection` throws a hard `500` error. No database operation may execute without a verified tenant connection.
20. **RLS Removal (v2):** The `src/core/rls/` directory has been permanently deleted (Phase 4, 2026-03-28). ESLint `no-restricted-modules` rules block any reintroduction of `secureModel`, `queryScoper`, or `rlsAssertions`. ~4,200 LOC removed.
21. **Reserved.**
22. **Aggregation Pipeline Safety:** All aggregation pipelines MUST be deep-cloned before transformation. In per-org mode, `organizationId` scoping is implicit (queries run on org-specific DB). Branch and ownership scoping is applied via pre-query guards.
23. **Reserved.**
24. **Reserved.**
25. **Reserved.**
26. **Reserved.**
27. **Field-Level Security (Phase F.10):** All API responses MUST pass through a role-based field filtering layer (`fieldFilter.js → fieldFilterMiddleware`) before being returned to the client. All mutations MUST pass through a write guard (`fieldWriteGuard.js → fieldWriteGuardMiddleware`) that validates request bodies against role-specific whitelists. Aggregate pipeline outputs MUST use `filterAggregateResults()` for post-pipeline field stripping. The `fieldAccessRegistry.js` is the SSOT for read permissions (15 resource types × 5 roles, 67 role entries). Coverage is CI-enforced by `checkFieldAccessCompliance.js` in strict mode. Any new resource type MUST be registered in both `fieldAccessRegistry.js` and `fieldWriteGuard.js` and added to `REQUIRED_RESOURCE_TYPES` in `fieldAccessValidator.js`.

---

## SECTION 8.1 — SECURITY ENFORCEMENT MATRIX (v2 — DB-per-Org)

| Operation Type | Context Source | Verification | Enforcement |
|---|---|---|---|
| **Authenticated API** | `req.dbConnection` (via dbContext) | JWT signature + `tokenVersion` | DB-level isolation (per-org database) |
| **Background Job** | `dbManager.getConnection(orgId)` | Explicit orgId from job payload | Connection-level isolation + `getModel(conn, Def)` |
| **Public Endpoint** | Token record (server-side) | Token validation + expiry check | Connection resolved from token's `organizationId` |
| **Platform Admin** | `req.user.role === 'superadmin'` | Platform JWT secret | Uses platform DB (separate from org DBs) |
| **API Response (read)** | `req.user.role` | `fieldAccessRegistry` lookup | `fieldFilterMiddleware` strips unauthorized fields |
| **API Mutation (write)** | `req.user.role` | `fieldWriteGuard` whitelist | `fieldWriteGuardMiddleware` rejects unauthorized fields |
| **Guard-protected route** | `guardedRoute()` wrapper | Pre/post/field guards | Guards applied before/after DB operations |

### CI/CD Gates

| Gate | Script | Mode | Failure Action |
|---|---|---|---|
| Field Access Compliance | `npm run validate:field-access` | Advisory | Warning log |
| Field Access Strict | `npm run validate:field-access:strict` | CI-blocking | Build fails |
| ESLint Architecture | `npx eslint src/` | CI-blocking | Blocks legacy RLS imports |

### Attack Vectors Mitigated (v2)

| Vector | Mitigation | Invariant |
|---|---|---|
| Cross-tenant data access | DB-per-org isolation (separate databases) | INV-13 |
| Unauthorized org ID injection | `dbContext` resolves connection from verified JWT only | INV-14 |
| Public endpoint org injection | Token-bound organizationId (server-side) | INV-18 |
| NULL connection bypass | `dbContext` fail-closed enforcement (hard error) | INV-19 |
| Legacy RLS reintroduction | ESLint `no-restricted-modules` on `@core/rls/*` | INV-20 |
| Unauthorized field in API response | Role-based `fieldFilterMiddleware` on all GET routes | INV-27 |
| Unauthorized field mutation | `fieldWriteGuardMiddleware` whitelist enforcement | INV-27 |
| FLS coverage drift | CI-blocking `checkFieldAccessCompliance.js` | INV-27 |

---

## SECTION 9 — FAILURE CONDITIONS

| Condition | HTTP Status | Error Code |
|---|---|---|
| No token provided | 401 | `UNAUTHORIZED` |
| Invalid/expired token | 401 | `UNAUTHORIZED` |
| Platform user not found | 401 | `UNAUTHORIZED` |
| Platform user inactive | 401 | `UNAUTHORIZED` |
| Org user not found or inactive | 401 | `UNAUTHORIZED` |
| `tokenVersion` mismatch | 401 | `UNAUTHORIZED` |
| Token missing `regionCode` | 401 | `INVALID_TOKEN_CONTEXT` |
| Region mismatch | 409 | `REGION_MISMATCH` |
| Non-platform token on platform route | 403 | `FORBIDDEN` |
| Platform capability denied | 403 | (message includes capability name) |
| Aggregate version mismatch (OAV) | 409 | `VersionConflictError` |
| Scheduling conflict | 409 | `warning: true, conflicts: {dentist, chair}` |
| Server shutting down | 503 | "Server shutting down" |
| Domain violation (deprecated model in prod) | 500 | `DomainViolation` |
| AuditLog mutation attempt | 500 | `ImmutabilityViolation` |
| Stripe webhook signature failure | 400 | Stripe SDK error |
