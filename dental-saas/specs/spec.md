# DENTAL SAAS — ROOT SYSTEM SPECIFICATION

**Document Type:** Technical Design Specification (TDS)
**Version:** 5.3
**Generated From:** Repository Audit — April 2026
**Updated From:** 3-LAYER DATABASE ARCHITECTURE — Steps 5c → 5d → 5e → 5f → v9.4.1 Hardening → v9.4.2 Lazy Binding (2026-04-24). Cumulative cutover from a single global `mongoose.connection` to physically separable Platform / Shared / per-Cluster Tenant connections; complete removal of `mongoose.model()` and `.default` patterns from runtime code; ESLint hard lockdown; ghost-model runtime detector; Phase 8 migration seams (`routingEpoch`, `writeLocked`, `migrationState`, `evictByOrg`, `assertWriteAllowed`) wired Day-1; legacy `MONGO_URI` retired in favour of strict 3-layer env contract. previous: ORTHODONTIC EVENT-SOURCED ARCHITECTURE REFACTOR v1.0 (2026-04-11) — P0→P1→P2 refactor enforcing single write path, deterministic replay, snapshot integrity, transactional audit trail, and undo correctness. previous: ORTHODONTIC RBAC ABSTRACTION v8.0 (2026-04-11).
**Audit Scope:** `backend/`, `frontend/`, `packages/`, `python-ai-engine/`
**Compliance Sections Added:** Orthodontic Domain Abstraction, Boot-Time Permission Registry Guard, Guardian Pointer Integrity, Mongoose Index Warning Reduction, Staff Avatar Persistence, Multi-part Photo Uploads, User Field Write Guards, React Query Staff Pipeline, Controller-Driven Auth, req.context SSoT, Throw-Pattern RBAC, Frontend Cache Governance, React Query Invalidation pipelines, Zero-Trust Cross-Tab Communication, Database-Level Visibility Filtering, Data Retention, Refund Policy, Financial Immutability, AI Data Privacy, Patient Anonymization (GDPR), Domain Naming Law (§41), Orthodontic Event-Sourced Architecture (§44), 3-Layer Database Architecture & Connection-Bound Models (§43)

---

## SECTION 1 — SYSTEM PURPOSE

DentalSaaS is a multi-tenant, enterprise-grade SaaS platform designed for dental clinics, orthodontic practices, and dental laboratories. It provides a complete clinical operations platform including patient management, appointment scheduling, billing, inventory management, orthodontic workflows, and AI-assisted diagnostics.

The system is architected around two operational planes, each responsible for different scopes of system authority:

- **Platform Plane** — Operated by DentalSaaS internal operators (superadmins, finance administrators, operations). Responsible for tenant lifecycle management, subscriptions, platform billing, contract management, plan catalog governance, and global platform configuration.
- **Organization Plane (Org Plane)** — Operated by clinic staff within their own tenant context. Responsible for managing patients, appointments, clinical records, billing operations, inventory, orthodontic cases, and internal communications.

Both planes share the same backend runtime process but remain logically isolated through independent authentication pipelines, middleware stacks, RBAC frameworks, and domain model boundaries.

This architecture allows single deployment efficiency while maintaining strict tenant isolation guarantees.

---

## SECTION 2 — SYSTEM COMPONENTS

### Backend (Node.js / Express)
| Component | Path | Description |
|-----------|------|-------------|
| App Entry | `backend/app.js` | Express application bootstrap, middleware pipeline initialization, and route mounting |
| Server | `backend/server.js` | HTTP server initialization, graceful shutdown logic, and process lifecycle management |
| Platform Plane | `backend/src/platform/` | Platform-scoped controllers, domain models, services, billing engines, and governance logic |
| Org Modules | `backend/src/modules/` | Domain modules supporting organization operations (patient, appointment, billing, inventory, etc.) |
| Organization Layer | `backend/src/organization/` | Organization authentication controllers, tenant user management, and tenant-scoped models |
| Shared Models | `backend/src/shared/models/` | Cross-domain models such as Organization, Branch, and shared metadata |
| Core | `backend/src/core/` | EventBus, domainEvents registry, authorization framework, sovereignGuard architecture verifier |
| Infrastructure | `backend/src/infrastructure/` | Redis connections, BullMQ queues, background workers, and Prometheus metrics |
| Integrity | `backend/src/integrity/` | Router registry, topology audit, route checksum, platform route manifest |
| RBAC | `backend/src/rbac/orgPermissions.js` | Canonical organization permission definitions |
| Event Contracts | `backend/src/eventContracts/` | Schema registry for type-safe domain events with emitter authorization |
| Packages | `packages/platform-contract/` | Shared ESM/CJS PLATFORM_CAPABILITIES contract used by both backend and frontend |
| UI Manifest | `backend/src/platform/uiManifest.js` | **SSOT** — pure-data UI contract for all org modules (Zero-Dependency) |
| UI Generator | `backend/scripts/generateUIEngine.js` | Script that generates `uiEngine.js` from `uiManifest.js` |
| UI Validator | `backend/scripts/validateUISync.js` | CI drift guard that validates `uiEngine.json` parity |

### Frontend (React / Vite)
| Component | Path | Description |
|-----------|------|-------------|
| Platform UI | `frontend/src/platform/` | Administrative interface for platform operators (Admiral / Cockpit UI) |
| Org UI | `frontend/src/org/` | Clinic-facing application used by doctors, assistants, and receptionists |
| Design System | `frontend/src/design-system/` | Shared UI primitives implementing the Hybrid Portability Pattern (tokens, UIGuard, contrastGuard) |
| Modules | `frontend/src/modules/` | Feature-specific UI modules such as patient management, patient portal, and public site |
| Services | `frontend/src/services/` | Axios API client with interceptor-based token refresh and CSRF double-submit |
| Context | `frontend/src/context/` | React contexts (AuthContext, BranchContext, SocketContext) |
| Platform Auth | `frontend/src/platform/auth/` | PlatformAuthProvider, PlatformAuthContext (isolated from org auth) |
| UI Engine | `frontend/src/core/` | `AutoRouter.jsx`, `AutoSidebar.jsx`, `PageLoader.jsx`, `OrgPermissionGuard.jsx` |
| UI Generated | `frontend/src/generated/` | `uiEngine.js` (Auto-generated), `uiEngine.json` (Snapshot) |
| Page Registry | `frontend/src/pages/org/index.js` | Named export map from page name → actual component |

### Python AI Engine
| Component | Path | Description |
|-----------|------|-------------|
| PointNet++ Models | `python-ai-engine/train/` | 3D tooth segmentation models based on PointNet2 and multitask architectures |
| Dataset Generation | `python-ai-engine/dataset/` | STL mesh preprocessing, labeling pipelines, and dataset generation |
| Geometry | `python-ai-engine/geometry/` | Arch curve detection, gingival margin detection, curvature analysis |
| Visualization | `python-ai-engine/visualization/` | 3D mesh rendering and segmentation overlay tools |
| MeshNet | `python-ai-engine/meshnet/` | Alternative mesh-based segmentation network architecture |
| Training Infrastructure | `python-ai-engine/train/` | Incremental training, hard-case mining, evaluation, model export (ONNX + TorchScript) |

The AI engine processes 3D dental mesh data (STL / PLY) to generate:
- tooth segmentation
- arch curve estimation
- gingival margin detection
- orthodontic stage analysis

---

## SECTION 3 — DOMAIN MAP

```
Platform Plane
├── Authentication (Platform)     → PlatformUser model, JWT (JWT_PLATFORM_SECRET), 2FA, TOTP
├── Organization Management       → Tenant lifecycle, archival, ISO country metadata
├── Platform Billing              → OrgContract, PlatformInvoice, LedgerEngine
│   ├── Subscription Engine       → plan activation, renewal, dunning
│   ├── Invoice Engine            → invoice generation, PDF rendering, voiding, payments
│   ├── Payment Engine            → Stripe / Paymob / manual payment adapters
│   └── Ledger Engine             → double-entry accounting system
├── Plan Catalog                  → PlanTemplate, PlanVersion, pricing strategies
├── Audit & Forensics             → Immutable SHA-256 hash-chained audit logging
├── Feature Flags                 → Runtime feature toggle system
├── Communication Inspector       → PII-safe email event tracking, delivery metrics
└── Platform RBAC                 → platformCapabilityResolver, PLATFORM_CAPABILITIES
```

```
Organization Plane
├── Authentication (Org)          → User model, JWT (JWT_ORG_SECRET), session management
├── Patient Domain                → Patient aggregate, clinical profile, patient portal
├── Appointment Engine            → Slot grid scheduling, overlap detection, status FSM
├── financeDomain                 → SOURCE OF TRUTH (Invoices, Payments, Ledger)
├── accountingDomain              → INTELLIGENCE LAYER (Revenue summaries, P&L, Dashboards)
├── Inventory Engine              → Stock items, OAV transactions, cost snapshots
├── UI Engine (Auto-Rendering)    → backend-driven routes, sidebar, and plan-gated loading
├── Notification Engine           → Event-driven in-app notifications via BullMQ
├── Communication Domain          → Email (Handlebars + SMTP), SMS, WhatsApp channels
├── Orthodontic Domain            → OrthodonticCase, stage metadata, AI scan integration
├── Intelligence Domain           → Risk scoring, doctor performance, clinical efficiency
├── Clinical Protocol Domain      → Treatment protocols
├── Stage Domain                  → Treatment stage progression
├── Document Engine               → Patient document storage and management
├── Aligner Production Domain     → Aligner production workflow
└── Patient Portal                → Self-service patient access interface
```

```
AI Engine (Python)
├── Segmentation Pipeline         → PointNet++ 3D tooth identification
├── Dataset Generator             → STL mesh → dataset conversion
├── Geometry Analysis             → Arch curve detection, gingival margin analysis
└── Training Infrastructure       → PyTorch training pipelines, hard-case mining, evaluation
```

---

## SECTION 4 — MULTI-TENANT DESIGN

### Isolation Model

> **Architecture Update (2026-03-28):** Migrated from shared-collection RLS to DB-per-org isolation.

- **Database:** Each organization has a dedicated MongoDB database (`dental_org_<orgId>`), resolved via `dbManager.getConnection(orgId)`. Queries are executed on the org-specific connection — cross-tenant access is impossible by design.
- **Model Resolution:** All org-plane services use `getModel(req.dbConnection, ModelDef)` to bind Mongoose models to the org-specific connection. Global `mongoose.model()` calls for org-scoped data are forbidden.
- **Query Isolation:** All organization-plane queries execute on the org-specific database connection, resolved via `dbContext` middleware from the verified JWT context. No `organizationId` injection or filtering is required — isolation is at the database level.
- **Branch Isolation:** Users may be scoped to one or more branches using `branchAccess` arrays. `branchContext.middleware.js` (Phase X consolidation) enforces branch-level filtering with hierarchical access:
  ```
  Platform users     → unrestricted (req.allowedBranches = null)
  Full access users  → unrestricted (hasFullBranchAccess = true)
  Restricted users   → filtered by branchAccess[]
  No branches        → 403 Forbidden
  ```
  > **Phase X Note:** `branchScopeMiddleware.js` was merged into `branchContext.middleware.js` and removed from all routes.
- **Cross-Tenant Leak Prevention:** DB-per-org provides physical isolation. Additionally, `organizationId` and `userId` are never trusted from request payloads — they are extracted exclusively from the authenticated JWT and populated into `req.context` to serve as the **Single Source of Truth**.
- **Context Enforcement:** Controllers MUST resolve all data via `req.context.dbConnection` and `req.context.userId`. Direct usage of `req.organizationId` or `req.user` is legacy and being removed.
- **Region Enforcement:** Token `regionCode` is validated against request routing region — mismatches return `409 REGION_MISMATCH`.

### Tenant Lifecycle
```
lead → trialing → active → grace → suspended → terminated/archived
```
- Managed by `SubscriptionEngine` and `BillingOrchestrator`
- Only one active `OrgContract` per organization enforced via MongoDB partial unique index

### Subscription Guard Architecture

During the Hybrid Billing migration, two subscription guards exist in parallel:

| Guard | File | Data Source | Status |
|-------|------|-------------|--------|
| Legacy Guard | `subscriptionGuard.js` | `Organization.subscription` subdocument | Active (to be removed Sprint 4) |
| New Guard | `orgSubscriptionGuard.js` | `OrgContract` + `PlanVersion` + legacy fallback | Active (will become sole guard) |

> **Phase X.2 Target:** Merge both guards into a single `requireEntitlement.js` that handles subscription validity + module entitlement in one pass.

**Legacy Guard (`subscriptionGuard.js`):**
- Reads subscription state from `Organization.subscription` subdocument
- Resolves plan via `planResolver` and builds capabilities via `planCapabilityBuilder`
- Manages grace period initialization, idempotent grace email enqueuing
- Sets `req.plan`, `req.planCapabilities`, `req.subscriptionInGrace`
- Sovereignly certified via `global.__SUBSCRIPTION_GUARD_LOADED__`

**New Guard (`orgSubscriptionGuard.js`):**
- Reads subscription state from `OrgContract` (primary) with `Organization.subscription` fallback
- Classifies state via `classifySubscriptionState()` into: `active`, `trial`, `grace`, `expired`, `unknown`
- Resolves entitlements via `entitlementResolver.service.js` (merges plan defaults + org overrides)
- Sets `req.subscriptionState`, `req.activeContract`, `req.planCapabilities`

**State Classification Priority (New Guard):**
```
1. Active OrgContract (contractStatus = "active")     → "active"
2. OrgContract expired but within grace window         → "grace"
3. Organization trial (trialEndDate / trialEndsAt)     → "trial"
4. Legacy subscription.status = "active" (no contract) → "active" (backward compat)
5. Suspended / canceled / expired / past_due            → "expired"
```

**Access Control Response Matrix:**
```
active      → full access → next()
trial       → full access (within trialEndDate) → next()
grace       → degraded access (req.inGracePeriod = true) → next()
expired     → 402 Payment Required
unknown     → 402 Payment Required
```

**Migration Timeline:**
| Sprint | Action |
|--------|--------|
| Sprint 1 | `orgSubscriptionGuard` created alongside legacy guard |
| Sprint 2 | Entitlement resolver wired into new guard |
| Sprint 3 | Unified capability middleware reads from new guard output |
| Sprint 4 | Legacy `subscriptionGuard.js` removed; `orgSubscriptionGuard` becomes sole guard |
| Sprint 4 | `Organization.subscription` subdocument deprecated (read-only, no longer written) |

### Subscription State Cache

To avoid database queries on every API request, subscription state is cached in Redis.

**Architecture:**
```
API Request
    ↓
orgSubscriptionGuard
    ↓
Redis Subscription Cache (sub:org:{organizationId})
    ↓ cache hit → use cached state
    ↓ cache miss → fallback to MongoDB
    ↓
OrgContract + PlanVersion lookup
    ↓
Populate Redis cache
    ↓
Continue request
```

**Cache Key Format:**
```
sub:org:{organizationId}
```

**Cache Payload:**
```json
{
  "state": "active",
  "reason": "active_contract",
  "contractId": "ObjectId",
  "planCode": "pro",
  "planVersionId": "ObjectId",
  "expiresAt": "2026-12-01T00:00:00Z",
  "graceUntil": null,
  "modules": { "patients": true, "orthodontics": true },
  "limits": { "maxUsers": 50, "maxBranches": 5 },
  "features": [],
  "cachedAt": "2026-03-12T12:00:00Z"
}
```

**TTL Policy:**
- Cache TTL: **60 seconds**
- Short TTL ensures stale state is bounded to one minute maximum
- Explicit invalidation supplements TTL for immediate consistency on mutations

**Cache Invalidation Events:**

When any of the following domain events occur, the cache is explicitly invalidated:

| Event | Trigger |
|-------|---------|
| `contract.activated` | New contract activated for the organization |
| `contract.updated` | Contract terms or status modified |
| `contract.cancelled` | Contract terminated or cancelled |
| `subscription.updated` | Legacy subscription status changed |
| `plan.changed` | Organization plan upgraded or downgraded |
| `addon.added` / `addon.removed` | Add-on entitlements changed |

**Invalidation mechanism:**
```
EventBus.on("contract.activated", ({ organizationId }) => {
    redis.del(`sub:org:${organizationId}`);
});
```
The next API request for that organization repopulates the cache from MongoDB.

### Subscription Guard Performance Impact

**Without caching (current):**
```
Every org-plane API request triggers:
  1. Organization.findById()       — ~5ms
  2. OrgContract.findOne()          — ~5ms
  3. PlanVersion.findById()         — ~5ms
  Total: ~15ms database overhead per request
```

**With Redis caching (target):**
```
Cache hit path:
  1. redis.get("sub:org:{orgId}")   — ~1ms
  Total: ~1ms overhead per request

Cache miss path (first request after invalidation):
  1. redis.get() miss               — ~1ms
  2. MongoDB lookups                — ~15ms
  3. redis.set() with 60s TTL       — ~1ms
  Total: ~17ms (amortized over 60s window)
```

**Expected improvement:**
- Database load reduced by **80–90%** for subscription-related queries
- Request latency reduction: **~14ms saved per cache-hit request**
- At 100 requests/second: **~8,500 fewer DB queries per minute**

### Post-Sprint 4 Target Architecture

After Sprint 4 completes the Hybrid Billing migration, the subscription data model simplifies to a clean three-entity chain:

```
Organization
    │
    ├── currentContractId ──→ OrgContract (authoritative commercial state)
    │                             │
    │                             └── planVersionId ──→ PlanVersion (plan definition + entitlements)
    │
    └── subscription { }   ← DEPRECATED (field retained for backward compat, no longer written)
```

**Changes in Sprint 4:**
- `Organization.subscription` subdocument becomes **read-only** — no new writes
- All subscription state reads come from `OrgContract.contractStatus` + `OrgContract.effectiveTo`
- Plan capabilities resolved from `PlanVersion.modules`, `PlanVersion.limits`, `PlanVersion.addons`
- Legacy `subscriptionGuard.js` **removed** from middleware chain
- `orgSubscriptionGuard.js` renamed to `subscriptionGuard.js` (becomes sole guard)
- SovereignGuard updated to certify the new guard instead of the legacy one
- Migration script marks all `Organization.subscription.status` fields as `"migrated"` for audit trail

**Data Flow (Post-Sprint 4):**
```
API Request → orgProtect → organizationMiddleware → subscriptionGuard
                                                         │
                                                    Redis Cache?
                                                    ┌─── hit ──→ use cached state
                                                    └─── miss ─→ OrgContract + PlanVersion lookup
                                                                     │
                                                                populate cache
                                                                     │
                                                              req.subscriptionState
                                                              req.planCapabilities
                                                              req.capabilities
                                                                     │
                                                                   next()
```

---

## SECTION 5 — AUTHENTICATION ARCHITECTURE

### Platform Plane Auth
- Short-lived JWT access tokens (`Authorization: Bearer`)
- **Signing:** Dedicated `JWT_PLATFORM_SECRET` (plane-isolated signing key)
- HTTP-only refresh cookies with CSRF token pair
- TOTP-based two-factor authentication
- AES-256-GCM encrypted TOTP secrets
- bcrypt-hashed recovery codes
- invite-based onboarding (`inviteToken`)
- account lockout after repeated 2FA failures (`failed2FAAttempts` + `twoFALockedUntil`)
- trusted IP bypass lists per platform operator
- Full DB hydration on every request (v21.0) — `PlatformUser` loaded from database, not token payload

### Organization Plane Auth
- JWT access tokens
- **Signing:** Dedicated `JWT_ORG_SECRET` (plane-isolated signing key)
- Login credentials:
  ```
  clinicCode + email + password
  ```
- Additional features:
  - session invalidation via `tokenVersion` (OAV — increment invalidates all active tokens)
  - multi-session tracking
  - individual session revocation
  - Magic Link login via email
  - OTP flows processed through BullMQ email queue
  - query token fallback (`?token=<JWT>`) for GET-only browser-direct endpoints (PDF/CSV export) — restricted to GET to mitigate CSRF
  - `platformRole` sanitization: any `platformRole` field on org tokens is stripped during hydration to prevent cross-plane privilege misuse
  - O(1) permission lookup via `Set<string>` built at auth time from `roleId.permissions`
  - Region enforcement: `decoded.regionCode` must match `req.regionCode` or → `409 REGION_MISMATCH`

### JWT Strategy (Audit Recommendation)

| Parameter | Current | Target |
|-----------|---------|--------|
| Algorithm | HS256 (symmetric) | RS256 (asymmetric key pair) |
| Key scope | Separate per plane (`JWT_PLATFORM_SECRET`, `JWT_ORG_SECRET`) | Separate per plane (RSA key pairs) |
| Token type isolation | `decoded.type === "platform"` / `"organization"` enforced by jwtManager + guards | Same |
| Rotation | Manual key rotation | Automated key rotation with JWKS endpoint |

### JWT Manager (`core/auth/jwtManager.js`)

Centralized module responsible for **all** JWT signing and verification operations. No service, controller, or middleware may call `jwt.sign()` or `jwt.verify()` directly.

**Signing Functions:**
```
signOrgToken(payload)       → signs with JWT_ORG_SECRET, injects type: "organization"
signPlatformToken(payload)  → signs with JWT_PLATFORM_SECRET, injects type: "platform"
```

**Verification Functions:**
```
verifyOrgToken(token)       → verifies with JWT_ORG_SECRET
verifyPlatformToken(token)  → verifies with JWT_PLATFORM_SECRET
verifyByType(token)         → deterministic routing (see below)
```

**Deterministic Verification Flow (v23.0):**
```
1. jwt.decode(token)           → read type field (no signature check)
2. if type === "organization"  → verify with JWT_ORG_SECRET
3. if type === "platform"      → verify with JWT_PLATFORM_SECRET
4. if unknown type             → reject
5. if primary fails            → try JWT_SECRET as migration fallback (logged)
```

**Plane Isolation Guarantee:**
- When `JWT_ORG_SECRET ≠ JWT_PLATFORM_SECRET`, tokens are cryptographically non-interchangeable
- An org token cannot be verified against the platform secret and vice versa
- This prevents any scenario where a clinic user's token grants platform admin access

**Migration Fallback:**
- If the type-specific secret fails AND `JWT_SECRET` is set and differs from the plane secret, verification is attempted with `JWT_SECRET`
- Successful fallback verification is logged with event `JWT_FALLBACK_VERIFICATION` for observability
- Fallback ensures backward compatibility with tokens issued before plane isolation was deployed
- Fallback is removed once all legacy tokens have expired (15m access token TTL)

**Org Token Payload:**
```json
{
  "type": "organization",
  "userId": "ObjectId",
  "roleId": "ObjectId",
  "organizationId": "ObjectId",
  "regionCode": "EG",
  "tokenVersion": 1
}
```

**Platform Token Payload:**
```json
{
  "type": "platform",
  "id": "ObjectId",
  "role": "superadmin",
  "regionCode": "GLOBAL",
  "tokenVersion": 0,
  "capabilityHash": "optional"
}
```

**Migration plan:**
1. Phase 1 (Complete) — Separate symmetric secrets per plane + centralized jwtManager
2. Phase 2 — Migrate to RS256 asymmetric key pairs with JWKS key endpoint
3. Phase 3 — Implement key rotation with overlapping validity windows

---

## SECTION 6 — RBAC ARCHITECTURE

### Platform RBAC
- Defined in `packages/platform-contract/`
- Single authority resolver: `platformCapabilityResolver.js`
- Middleware guards:
  ```
  platformProtect
  authorizePlatformPermission
  requirePlatformCapability
  ```
- Roles:
  ```
  superadmin
  finance_admin
  operations_admin
  analyst
  ```
- Capabilities follow the `PLATFORM_CAPABILITIES` contract using `VIEW_*` / `MANAGE_*` prefix patterns.
- **Capability Contract (9 capabilities):**
  ```
  VIEW_ORGANIZATIONS, MANAGE_ORGANIZATIONS
  MANAGE_SUBSCRIPTIONS
  VIEW_AUDIT_LOGS
  VIEW_PLATFORM_ANALYTICS
  MANAGE_PLATFORM_USERS
  MANAGE_PLATFORM_SETTINGS
  VIEW_COMMUNICATION_METRICS, MANAGE_COMMUNICATION
  ```
- **Observability:** All CAPABILITY_DENIED events produce a structured Pino log and a fire-and-forget AuditLog record.

### Organization RBAC (v8.0 — Single-Domain Abstraction & Safety Guards)
- Defined in:
  ```
  backend/src/rbac/orgPermissions.js
  backend/src/rbac/permissionRegistry.js
  backend/src/rbac/permissionHierarchy.js
  backend/src/rbac/writeGuards/user.write.js
  ```
- Permission format:
  ```
  <module>.<action>
  ```
- **Authorization Pattern:** Controllers enforce RBAC using the `authorize(req, "permission.name")` throw-pattern.
- **Apex Domain Abstraction (Phase 30):** Shifted away from granular feature permissions (e.g., `tads.manage`, `bonding.manage`) assigned directly to users. Instead, apex permissions (`orthodontics.full`, `orthodontics.read`) are issued, and transitively inherited to inner core system engine permissions via `PERMISSION_HIERARCHY`.
- **Boot-Time Guard Validation:** `authorize.js` includes a `PERMISSION_REGISTRY` guard. Any controller referencing a non-existent or phantom permission throws `500 INVALID_PERMISSION_CONFIG` at runtime, preventing silent access bypasses.
- **Field-Level Write Guards:** Mutations to user profiles are regulated by `fieldWriteGuardMiddleware("user")`. Defines explicit allow-lists for fields like `firstName`, `lastName`, `profileImage`, and `speciality` based on the requester's role.
- **Photo Upload Security:** `POST /api/v1/org/users/:id/avatar` is metadata-locked to ensure only authorized staff can update specific user assets.
- Roles:
  ```
  org_admin
  doctor
  assistant
  receptionist
  lab_technician
  ```
- Roles are automatically seeded during tenant provisioning.
- **Observability:** All ORG_PERMISSION_DENIED and FIELD_WRITE_DENIED events produce a structured Pino log and an immutable AuditLog record.

### Frontend Capability System (Phase 10 — Capability-Based UI)

The frontend enforces RBAC visibility using a capability-driven architecture. This ensures the UI dynamically adapts to the user's permissions without hardcoded role checks.

**Architecture:**
```
AuthContext (user.roleId.permissions)
    ↓
CapabilityContext (flattens to { "module.action": true })
    ↓
useCapability("patients.update") → boolean
    ↓
<Can permission="patients.update"> → conditional render
```

**Core Files:**
| File | Purpose |
|------|---------|
| `context/CapabilityContext.jsx` | Flattens nested permissions into flat capability map |
| `hooks/useCapability.js` | `useCapability(key)` + `useCapabilityCheck(keys[])` |
| `components/Can.jsx` | `<Can>` (render when allowed) + `<Cannot>` (render when denied) |

**Integration:**
- `CapabilityProvider` is wired into `OrgShell` (wraps all org routes)
- `<Can>` wraps action buttons: edit, delete, wallet, portal, communication
- `RequireOrgPermission` wraps route-level access (e.g., Security → `security.manage`)

**Rules (Sentinel-enforced):**
- ✅ `capabilities.includes()` pattern — via `useCapability` hook
- ❌ `role === "admin"` — FORBIDDEN (no raw role checks)
- ❌ Frontend must NEVER guess permissions — always rely on backend capabilities

### Frontend RBAC v2 (Phase 12 — Resource + Entitlement + Debug)

Upgraded capability system with three new layers:

**1. Feature Context (Subscription-Aware Module Gating):**
```
AuthContext → user.organization.capabilities (from /auth/profile, plan-pipeline resolved)
    ↓
FeatureContext
    ↓
hasModule("orthodontics") → boolean
hasFeature("orthodontics.aiAnalysis") → boolean
isSubscriptionActive → boolean
```

| File | Purpose |
|------|---------|
| `context/FeatureContext.jsx` | Module + feature + subscription state provider (v2: reads capabilities) |
| `components/FeatureGate.jsx` | `<FeatureGate>`, `<FeatureHidden>`, `<SubscriptionGate>` components |
| `hooks/useFeatureGate.js` | `useModuleEnabled()`, `useFeatureEnabled()`, `useSubscriptionStatus()`, `useModuleCheck()` |

**Data Source (Phase 12.1 — Feature Registry):**
- `/auth/profile` now returns `organization.capabilities.modules` (plan-pipeline resolved via `featureRegistry.normalizeModules()`)
- `organization.capabilities.features` provides sub-feature gating (e.g., `orthodontics.viewCases`, `orthodontics.aiAnalysis`)
- Backward compat: `organization.modules` still present, FeatureContext uses `capabilities.modules` as gold standard
- No additional API call required — piggybacks on existing auth hydration

**Provider Chain (OrgShell):**
```
AuthProvider → SocketProvider → BranchProvider → FeatureProvider → CapabilityProvider → QueryProvider → <routes>
```

**Module Gating in Sidebar:**
- `Sidebar.jsx` nav items carry an optional `module` key
- Items with `module` are filtered by `hasModule()` at render time
- Hidden modules: orthodontics, analytics, inventory, labs (when plan doesn't include them)

**Module Gating in Patient Tabs:**
- `PatientLayout.jsx` tabs carry an optional `module` key
- Orthodontic tab only renders when `hasModule("orthodontics")` returns true

**2. Resource Capability Context (PBAC-Aware):**
```
API Response → { data, capabilities: { canEdit, canDelete, visibleFields } }
    ↓
ResourceCapabilityProvider
    ↓
<ResourceCan action="canEdit"> → conditional render
<FieldVisible field="nationalId"> → field-level visibility
```

| File | Purpose |
|------|---------|
| `context/ResourceCapabilityContext.jsx` | Resource-level capability provider + `ResourceCan`, `FieldVisible` components |

**3. Developer Debug Panel (Dev Only):**
```
Ctrl+Shift+D → toggle CapabilityDebugger panel
```

| File | Purpose |
|------|---------|
| `components/CapabilityDebugger.jsx` | Floating dev panel showing capabilities, modules, features, subscription, user info |

- Only renders when `process.env.NODE_ENV !== "production"`
- Shows: user info, subscription status, flat capability map, module enablement, feature flags

**Loading Safety:**
- `FeatureProvider` returns `loading: true` while auth is loading → gates render nothing
- `PatientLayout` shows skeleton UI instead of spinner during auth/data loading
- All guard components (`FeatureGate`, `ResourceCan`, `RequireOrgPermission`) return `null` while loading

**Test Coverage:**
- Behavioral contract tests: `frontend/src/__tests__/rbac-v2.test.js` (54 tests)
- Covers: role capability checks, module gating (free/pro/enterprise), subscription status, combined RBAC + feature scenarios

### Security Rollout Control System (Phase 11 — Entitlement Alignment)

Full security lifecycle system: classification → alerting → entitlement enforcement → rollout control.

**Denial Classification Engine:**
```
classifyDenial(reason) →
  "expected"  — ownership, branch, time-of-day (working as designed)
  "critical"  — entitlement, RBAC, escalation (investigate immediately)
  "unknown"   — unclassified (needs rule mapping)
```

Each denial recorded in denialTracker now carries a `type` field. Dashboard displays breakdown by type.

**Entitlement Middleware (Phase A SSOT-Enforced):**
```
requireEntitlement(featureKey)
```
- **Resolution: SSOT-Only (Phase A Stabilization)**
  - `req.capabilities.modules[key]` — **sole resolution source** (from unifiedCapabilityMiddleware, normalized via featureRegistry)
  - Legacy fallbacks (`org.modules[key]`, `org.features[key].enabled`) have been **removed** — all resolution goes through the unified capability pipeline
  - In development: SSOT violation detector logs warnings if `req.capabilities` is missing (should never happen if middleware chain is correct)
- Core modules derived from `featureRegistry.CORE_MODULES` (patients, notifications, users, branches, clinical, settings) bypass checks
- Safety modes: `AUDIT` (log-only) → `ENFORCE` (block, **current default**)
- Env: `ENTITLEMENT_AUDIT_MODE=true|false` (default: `false` — enforcing)
- Records denials to denialTracker with reason `feature_disabled`
- Returns human-readable error messages per feature

**Sub-Feature Middleware (Phase 12.1, Phase A SSOT-Enforced):**
```
requireFeature(featureKey)
```
- Checks `req.capabilities.features[key]` — **SSOT-only** (from `buildFeatureCapabilities()` via featureRegistry)
- Feature keys are dot-notation: `orthodontics.aiAnalysis`, `finance.analytics`
- Legacy fallback (`org.features.get(key).enabled`) has been **removed** in Phase A
- Same audit mode support as `requireEntitlement`
- Example: `requireFeature("orthodontics.aiAnalysis")`

**Feature Registry (Phase 12.1 — Single Source of Truth):**

| File | Purpose |
|------|---------|
| `platform/featureRegistry.js` | Module definitions, schema key mappings, core module derivation, sub-feature capabilities |

The Feature Registry is the single source of truth for:
- **Module key normalization:** Maps PlanVersion schema keys (e.g., `orthodonticsAdv`) to canonical application keys (e.g., `orthodontics`)
- **Core module derivation:** `CORE_MODULES` Set derived from registry `isCore` flags (consumed by requireEntitlement)
- **Sub-feature derivation:** `buildFeatureCapabilities()` maps module state to feature-level booleans

**Normalization Pipeline:**
```
PlanVersion.modules (raw schema keys: orthodonticsAdv, communication.enabled)
    ↓ normalizeModules() via featureRegistry
planCapabilityBuilder (canonical keys: orthodontics, communication)
    ↓
subscriptionGuard → req.planCapabilities.modules = { orthodontics: true }
    ↓
unifiedCapabilityMiddleware → req.capabilities.modules = { orthodontics: true }
                            → req.capabilities.features = { orthodontics.viewCases: true, ... }
    ↓
requireEntitlement("orthodontics") → PASS
requireFeature("orthodontics.viewCases") → PASS
    ↓
/auth/profile → organization.capabilities.modules = { orthodontics: true }
    ↓
Frontend FeatureContext → hasModule("orthodontics") === true
```

**Entitlement Coverage Matrix (Phase 12 → Phase C Updated):**

| Route Group | Feature Key | Enforcement Location | Status |
|-------------|-------------|---------------------|--------|
| `/api/v1/org/procedures` | `clinical` | orgRuntime moduleLoader + route-level `router.use()` | ✅ Canonical |
| `/api/v1/org/treatments` | `clinical` | orgRuntime moduleLoader + route-level `router.use()` | ✅ Canonical |
| `/api/v1/org/invoices` | `finance` | orgRuntime moduleLoader + route-level `router.use()` | ✅ Canonical |
| `/api/v1/org/payments` | `finance` | orgRuntime moduleLoader + route-level `router.use()` | ✅ Canonical |
| `/api/v1/org/finance` | `finance` | orgRuntime moduleLoader + route-level `router.use()` | ✅ Canonical |
| `/api/v1/org/orthodontic-cases` | `orthodontics` | orgRuntime moduleLoader + route-level `router.use()` | ✅ Canonical |
| `/api/v1/org/users` | `users` (core) | orgRuntime moduleLoader | ✅ Canonical |
| `/api/v1/org/branches` | `branches` (core) | orgRuntime moduleLoader | ✅ Canonical |
| `/api/v1/org/roles` | `users` (core) | orgV1Routes.js inline handler | ✅ Canonical |
| `/api/v1/org/*` | Per-module via `requireEntitlement()` | orgRuntime engine (moduleLoader) | ✅ Canonical |
| `/api/v1/users` | — | 308 redirect → `/api/v1/org/users` | ⚠️ Legacy (redirect) |
| `/api/v1/branches` | — | 308 redirect → `/api/v1/org/branches` | ⚠️ Legacy (redirect) |
| `/api/v1/treatments` | — | 308 redirect → `/api/v1/org/treatments` | ⚠️ Legacy (redirect) |
| `/api/v1/invoices` | — | 308 redirect → `/api/v1/org/invoices` | ⚠️ Legacy (redirect) |
| `/api/v1/orthodontic-cases` | — | 308 redirect → `/api/v1/org/orthodontic-cases` | ⚠️ Legacy (redirect) |

> **Phase C Note:** All legacy `/api/v1/<module>` paths are now 308 Permanent Redirects.
> Frontend consumers have been migrated to canonical paths. Redirects will be converted to 410 Gone
> once telemetry confirms zero legacy traffic (see Section 34).

**Middleware Chain Order (Phase X — Stabilized):**
```
orgProtect → organizationContext → requireEntitlement(key)
    → branchContext → requireOrgPermission(P.XXX)
    → policyMiddleware → handler
```

> **Phase X Changes (2026-03-27):**
> - `requireFeature` removed from all production routes (replaced by `requireEntitlement`)
> - `branchScopeMiddleware` merged into `branchContext.middleware.js`
> - `permissionSet` consolidated to single source: `req.authContext.permissionSet` (no more `req.user.permissionSet`)
> - All `permissionSet.has()` calls guarded with `instanceof Set` type check
> - `CORE_MODULES` access via lazy `getCoreModules()` with null guard → 500 `ENTITLEMENT_ENGINE_INVALID` on failure
> - All route imports in `featureRegistry.js` lazy-loaded to prevent circular dependencies

**Phase 1 — Centralized Authorization Wrapper (`authorize.js`):**

| File | Purpose |
|------|---------|
| `middleware/authorize.js` | Deterministic auth chain builder: `requireEntitlement` → `requireFeature` → `requireOrgPermission` |

```javascript
// Usage in routes:
const { authorize } = require("../middleware/authorize");

// Full chain:     entitlement + feature + permission
router.get("/", ...authorize({ entitlement: "orthodontics", feature: "orthodontics.viewCases", permission: P.ORTHODONTICS_READ }), handler);

// Permission only (core modules):
router.get("/", ...authorize({ permission: P.PATIENTS_READ }), handler);
```

**Phase 1 — Legacy Middleware Deletion:**

The following middleware files were deleted during authorization stabilization. All routes have been migrated to `requireOrgPermission` and `requireEntitlement`:

| Deleted File | Replacement |
|-------------|-------------|
| `middleware/permissionMiddleware.js` | `middleware/requireOrgPermission.js` |
| `middleware/roleMiddleware.js` | `middleware/requireOrgPermission.js` (with `P.*` constants) |
| `middleware/moduleGuard.js` | `middleware/requireEntitlement.js` |
| `middleware/moduleMiddleware.js` | `middleware/requireEntitlement.js` |
| `orgRuntime/requireModule.js` | `middleware/requireEntitlement.js` |
| `middleware/orgRuntimeGate.js` | Removed (superseded by `requireEntitlement`) |

**Phase 1 — SSOT Enforcer (`ssotEnforcer.js`):**

| File | Purpose |
|------|---------|
| `middleware/ssotEnforcer.js` | Development-only: warns when deprecated `req.organization.modules` is accessed instead of `req.capabilities.modules` |

- Mounted AFTER `assertCapabilities` in `app.js` org middleware chain
- Uses JavaScript `Proxy` to detect property access on `req.organization.modules`
- Only active when `NODE_ENV !== "production"`
- Logs warnings with route path and requested module key for debugging

**Phase 1 — Boot-Time Auth Pipeline Validation (`validateAuthPipeline.js`):**

| File | Purpose |
|------|---------|
| `config/validateAuthPipeline.js` | Logs expected auth pipeline order and checks for leftover legacy middleware files at boot |

- Called in `server.js` after `validateSecurityModes()`
- Strict mode (`SECURITY_STRICT_BOOT=true`): crashes server if legacy files found (recommended for CI/staging/production)
- Non-strict mode: logs warnings only

**Phase A+ Fail-Fast Layer (`assertCapabilities.js`):**

| File | Purpose |
|------|---------|
| `middleware/assertCapabilities.js` | Returns 500 if `req.capabilities` is missing after capability resolution |

- Mounted AFTER `unifiedCapabilityMiddleware` in `app.js`
- Guarantees that all downstream authorization middleware (`requireEntitlement`, `requireFeature`, `requireOrgPermission`) always operate on a resolved capability object
- Prevents silent authorization bypass if the capability pipeline fails
- Boot-time loadability verified by `validateSecurityModes.js`

**Auth Health Endpoint (Phase A+ — Internal Monitoring):**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/internal/auth-health` | None (internal) | Exposes authorization enforcement state |

Response payload:
```json
{
  "status": "ok",
  "enforcement": {
    "entitlementAuditMode": false,
    "policyShadowMode": false,
    "devAuthMode": false,
    "securityStrictBoot": false,
    "authTraceEnabled": false
  },
  "timestamp": "2026-03-23T12:00:00Z"
}
```

### Zero-Trust API Gateway (Phase 13 — Composable Security)

The `zeroTrustGateway` module provides a composable factory function that assembles the correct middleware chain for any org-plane route with a single call. It does NOT replace existing middleware — it composes them into a deterministic sequence.

**File:** `backend/src/middleware/zeroTrustGateway.js`

**Why it exists:**
- Before: middleware ordering was manually specified per route across 60+ files
- This caused inconsistent ordering, missing guards, and subscription checks after RBAC
- Now: a single `zeroTrust(permission, featureKey)` call produces the correct chain

**Chain Composition (8 steps):**
```
zeroTrust("patients.read", "patients")
    ↓
[
  1. authMiddleware        — JWT via verifyByType() + DB hydration + permissionSet
  2. orgTypeGuard          — Reject non-org tokens (type !== "org")
  3. organizationContext   — Hydrate org + subscription + region failsafe
  4. subscriptionGuard     — Plan resolution + grace period + planCapabilities
  5. branchContext         — X-Branch-Id ownership validation (optional)
  6. requireOrgPermission  — O(1) permissionSet lookup + audit on denial
  7. requireEntitlement    — Plan-level module/feature gating (optional)
  8. auditGateway          — Debug logging (optional)
]
```

**API:**
```javascript
// Full chain with permission + entitlement
router.get("/patients", ...zeroTrust("patients.read", "patients"), controller.list);

// Permission only (core module — always entitled)
router.post("/patients", ...zeroTrust("patients.create"), controller.create);

// Skip branch context (org-wide read)
router.get("/roles", ...zeroTrust("users.read", "users", { skipBranch: true }), controller.list);

// Convenience aliases
router.get("/patients", ...zeroTrustRead("patients.read", "patients"), controller.list);
router.post("/patients", ...zeroTrustMutate("patients.create", "patients"), controller.create);
```

**Options:**
| Option | Default | Purpose |
|--------|---------|---------|
| `skipBranch` | `false` | Skip branch context (for org-wide reads) |
| `strictEntitlement` | `false` | Bypass audit mode for entitlement |
| `auditLog` | `false` | Log gateway passage for monitoring |

**Rules:**
- ❌ No route without gateway
- ❌ No direct controller access
- ❌ No manual permission checks in controllers
- ❌ No role string comparisons
- ✅ Every org request validated end-to-end

### Audit Interceptor (Phase 13 — Medical Compliance)

Automatic mutation audit logger that intercepts POST/PUT/PATCH/DELETE requests and creates SHA-256 hash-chained audit records via the existing `auditService`.

**File:** `backend/src/middleware/auditInterceptor.js`

**Modes:**
1. **Auto-audit** — Attach to router, logs all successful mutations:
   ```javascript
   router.use(autoAudit("Patient"));
   router.post("/", controller.create);   // → PATIENT_CREATED
   router.patch("/:id", controller.update); // → PATIENT_UPDATED
   ```
2. **Manual** — Fine-grained control in controllers:
   ```javascript
   await logAction(req, {
     action: "TREATMENT_PLAN_APPROVED",
     entity: "TreatmentPlan",
     entityId: plan._id,
     changes: { status: { from: "draft", to: "approved" } }
   });
   ```

**Safety:**
- Sensitive fields redacted (passwords, tokens, credit cards)
- Body snapshot limited to 2KB (prevents file upload audit bloat)
- Fire-and-forget — audit failure never blocks business operations
- Records integrate with existing SHA-256 hash chain (tamper-evident)

### Audit Timeline API (Phase 13 — Medical Compliance UI)

REST endpoints for viewing audit trail data in the frontend.

**Files:**
```
backend/src/modules/audit/
├── services/auditTimeline.service.js  — Query service (entity, user, org, stats)
├── controllers/auditTimeline.controller.js — HTTP handlers
└── routes/auditTimeline.routes.js     — 4 endpoints with Swagger docs
```

**Endpoints (mounted at `/api/v1/org/audit`):**
| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| `GET` | `/timeline` | `security.read` | Org-wide audit trail with filters |
| `GET` | `/entity/:entityId` | `security.read` | Entity-scoped timeline (per patient, etc.) |
| `GET` | `/user/:userId` | `security.read` | User activity history |
| `GET` | `/stats` | `security.read` | Aggregated statistics (7-day default) |

**Query Parameters:**
- `category` — patient, appointment, treatment, clinical, financial, admin, security
- `action` — Specific action filter
- `search` — Free-text in description
- `from` / `to` — Date range
- `page` / `limit` — Pagination (max 100 per page)

**Frontend Module:**
```
frontend/src/modules/org/audit/
├── api/audit.api.js                    — 4 API endpoints
├── hooks/useAuditTimeline.js           — React Query hooks
└── components/AuditTimeline.jsx        — Timeline component
```

**Component Usage:**
```jsx
// Entity-scoped (inside patient profile)
<AuditTimeline entityId={patientId} entityType="Patient" />

// User activity
<AuditTimeline userId={userId} mode="user" />

// Compact mode for sidebars
<AuditTimeline entityId={id} compact showHeader={false} maxHeight="300px" />
```

### Security Enforcement Engine (Phase 14 — Self-Enforcing Zero-Trust)

Upgrade from Phase 13 composable security to **self-enforcing zero-trust** where insecure routes are impossible to define.

**Part 1 — Route Registration Wrapper (secureRoute):**

**File:** `backend/src/core/security/secureRoute.js`

Eliminates the possibility of defining an insecure route. All route definitions MUST go through `secureRoute()`, which throws at boot time if security config is missing.

```javascript
// Before (vulnerable to forgetting middleware)
router.get("/patients", controller.list);  // ← NO GUARD

// After (impossible to define insecure route)
secureRoute(router, "get", "/patients", {
    permission: "patients.read",
    feature: "patients",
    skipBranch: true,
}, controller.list);
```

**Compile-Time Validation:**
- Missing `permission` → `GOVERNANCE_VIOLATION` error + process boot failure
- Missing handler → `GOVERNANCE_VIOLATION` error + process boot failure
- Invalid HTTP method → boot failure

**Middleware Chain Composition:**
```
secureRoute(router, method, path, config, handler)
    ↓
1. zeroTrust(permission, feature, options)  — full 8-step chain
2. autoAudit(entity)                        — for mutations (if entity specified)
3. config.middleware[]                       — validators, PBAC, field filters
4. handler                                  — controller function
```

**Route Registry:**
- All routes registered via `secureRoute()` are tracked in an internal registry
- `getRouteRegistry()` returns all routes for governance dashboard / startup audit
- `getRegistryStats()` returns method/feature/entity breakdowns

**Part 2 — Audit Intelligence Layer:**

**File:** `backend/src/modules/audit/services/auditAnalyzer.js`

Transforms raw audit logs into actionable security alerts via 7 anomaly detection rules:

| Rule | Severity | Detection |
|------|----------|-----------|
| `EXCESSIVE_MUTATIONS` | HIGH | >20 edits to same entity in 60 min |
| `BULK_DELETE_DETECTED` | CRITICAL | >5 deletions by one user in 30 min |
| `CROSS_BRANCH_ACCESS` | HIGH | User accessing data outside assigned branches |
| `OFF_HOURS_ACTIVITY` | MEDIUM | Critical mutations outside 6:00–23:00 UTC |
| `RAPID_FIRE_REQUESTS` | HIGH | >50 actions in 5 minutes (possible bot) |
| `PERMISSION_DENIAL_SPIKE` | HIGH | >10 denied requests in 15 min |
| `SENSITIVE_DATA_ACCESS` | MEDIUM | >15 financial/clinical ops by one user |

**API Endpoint:** `GET /api/v1/org/audit/alerts?hours=24`
**React Query Hook:** `useAuditAlerts({ hours: 24 })`

**Part 3 — Governance Engine:**

**File:** `backend/src/core/security/governanceEngine.js`

Continuous real-time monitoring for governance violations across the system.

**Violation Rules:**
```
MISSING_ZEROTRUST      — Route without zero-trust guard (CRITICAL)
UNAUTHORIZED_ACCESS    — Access attempt without authorization (HIGH)
RBAC_BYPASS_ATTEMPT    — Direct role comparison detected (HIGH)
PLANE_ISOLATION        — Cross-plane import detected (CRITICAL)
TENANT_ISOLATION       — Cross-tenant access attempt (CRITICAL)
CONFIG_DRIFT           — Configuration inconsistency detected (MEDIUM)
```

**In-Memory Buffer:** Circular buffer of 500 violations for dashboard access.
**API Endpoint:** `GET /api/v1/org/audit/governance`
**React Query Hook:** `useGovernanceStatus()`

**Part 4 — Real-Time Audit Streaming:**

Audit events are emitted via EventBus and broadcast to connected Socket.IO clients.

**Domain Events Added:**
```
AUDIT_EVENT_CREATED            — Emitted after each audit record creation
GOVERNANCE_VIOLATION_DETECTED  — Emitted when governance rule is violated
```

**Socket.IO Events:**
| Event | Room | Payload |
|-------|------|---------|
| `audit:event` | `org:{organizationId}` | `{ action, entity, entityId, actorId, timestamp }` |
| `governance:violation` | `org:{organizationId}` | `{ rule, severity, message, timestamp }` |

**Frontend Hook:** `useAuditStream(socket)` — Auto-invalidates React Query audit caches on new events.

**Part 5 — Audit Export (Legal Compliance):**

**API Endpoint:** `GET /api/v1/org/audit/export?from=ISO&to=ISO&category=`

**Constraints:**
- Max range: 90 days
- Max records: 10,000 per export
- Content-Disposition header triggers browser download
- Export action is itself audited (`AUDIT_EXPORT` event logged)

**Part 6 — Performance Guard:**

All audit operations use fire-and-forget patterns:
```
setImmediate(() => {
    logAction(req, data)
        .then(() => eventBus.emit(AUDIT_EVENT_CREATED, payload))
        .catch(() => {});  // Never blocks business operations
});
```

**New Backend Files:**
```
backend/src/core/security/secureRoute.js           — Route registration enforcer
backend/src/core/security/governanceEngine.js       — Governance violation monitor
backend/src/modules/audit/services/auditAnalyzer.js — Anomaly detection engine
```

**Updated Files:**
```
backend/src/core/domainEvents.js                    — Added AUDIT_EVENT_CREATED, GOVERNANCE_VIOLATION_DETECTED
backend/src/eventContracts/schemaRegistry.js        — Registered new events
backend/src/infrastructure/realtime/socketServer.js — Added audit + governance listeners
backend/src/middleware/auditInterceptor.js           — Added EventBus emission + setImmediate
backend/src/modules/audit/controllers/auditTimeline.controller.js — +3 endpoints
backend/src/modules/audit/routes/auditTimeline.routes.js          — +3 routes
frontend/src/modules/org/audit/api/audit.api.js     — +3 API methods
frontend/src/modules/org/audit/hooks/useAuditTimeline.js — +3 hooks + useAuditStream
```

**Rollout Control API:**
| Endpoint | Purpose |
|----------|---------|
| `GET /security/entitlements` | Org module/feature status |
| `GET /security/rollout-status` | Unified security system mode overview |

**Environment Variables (Phase A — Enforcement Active):**
```
POLICY_SHADOW_MODE=false       — Policy engine: ENFORCING
ENTITLEMENT_AUDIT_MODE=false   — Entitlements: ENFORCING
SECURITY_STRICT_BOOT=false     — Startup validation (set true for CI/staging/production)
```

**Rollout Sequence (Phase A Complete):**
1. ✅ Shadow mode ON, audit mode ON (initial deployment)
2. ✅ Verify denial classification is stable
3. ✅ Verify alerts are firing correctly
4. ✅ Set `ENTITLEMENT_AUDIT_MODE=false` (Phase A — SSOT enforcement)
5. ✅ Set `POLICY_SHADOW_MODE=false` (Phase A — PBAC enforcement)
6. ✅ `validateSecurityModes.js` startup guard added (prevents accidental production audit mode)

**Startup Security Validation (`validateSecurityModes.js`):**
- In production: crashes server if `ENTITLEMENT_AUDIT_MODE=true`, `POLICY_SHADOW_MODE=true`, or `DEV_AUTH_MODE=true` (when `SECURITY_STRICT_BOOT=true`)
- In development: logs warnings if enforcement is active (advisory only)
- Integrated into `server.js` boot sequence, runs before app module initialization

**New RBAC Permissions (Phase A):**
```
support.read     — View support tickets (assigned: org_admin, receptionist)
support.create   — Create support tickets (assigned: all roles)
storage.read     — View storage usage (assigned: org_admin)
```

### Security Control Center (Phase 7 — RBAC Governance UI)

An administrative introspection module that provides real-time visibility into the RBAC, PBAC, and field-level access control systems. Accessible only to `org_admin` users via `P.SECURITY_MANAGE`.

**Permissions Added:**
```
P.SECURITY_READ    = "security.read"
P.SECURITY_MANAGE  = "security.manage"
```
Assigned to: `org_admin` role only.

**API Endpoints (mounted at `/api/v1/org/security`):**
| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/overview` | KPIs: coverage%, permissions count, rules, 7-day chart |
| `GET` | `/permissions` | All P.* constants + ORG_ROLE_PERMISSIONS map |
| `GET` | `/matrix` | Route→permission matrix from `permissionMatrix.js` |
| `GET` | `/policies` | Policy definitions (serialized metadata, no functions) |
| `GET` | `/fields` | Field-level RBAC registry per resource × role |
| `GET` | `/coverage` | Write-permission policy coverage analysis |
| `GET` | `/logs` | Paginated audit logs with search/filter/date |
| `POST` | `/simulate` | Access simulation using real `evaluatePolicy()` |

**Security Hardening:**
- All endpoints guarded by `requireOrgPermission(P.SECURITY_MANAGE)` — no raw role checks
- Simulation uses `req.user` ONLY — body cannot override user identity
- No policy functions are ever serialized (metadata only: effect, priority, description)
- Simulation validates permission exists in `P` enum before evaluation
- Permission matrix reflects canonical `permissionMatrix.js` (single source of truth)
- All log queries scoped to `req.organizationId` (tenant isolation)

**Frontend Module:**
```
frontend/src/modules/org/security/
├── api/security.api.js          — 8 Axios endpoints
├── hooks/useSecurity.js         — 7 React Query hooks + 1 mutation
├── pages/SecurityPage.jsx       — 6-tab container
└── tabs/
    ├── OverviewTab.jsx          — KPIs + Recharts bar chart
    ├── PermissionsMatrixTab.jsx — dual view: Route Matrix + Role Matrix
    ├── PolicyEngineTab.jsx      — searchable policy rules viewer
    ├── FieldAccessTab.jsx       — resource × role field matrix
    ├── AccessLogsTab.jsx        — paginated audit logs
    └── DebugConsoleTab.jsx      — live policy simulation
```

### Global Security Middleware Enforcement (Phase 8 — Full Integration)

The `policyMiddleware` (PBAC) and `fieldFilterMiddleware` (Field RBAC) are now globally applied across all Org Plane routes:

**Middleware Chain (all write routes):**
```
orgProtect → organizationContext → requireOrgPermission(P.XXX) → policyMiddleware(P.XXX, getResource) → fieldWriteGuardMiddleware(resourceType) → handler
```

**Middleware Chain (all read routes with registered resources):**
```
orgProtect → organizationContext → requireOrgPermission(P.XXX) → fieldFilterMiddleware(resourceType) → handler
```

**Enforcement Matrix:**
| Route File | Field Filter (GET) | Policy Engine (write) | Write Guard |
|------------|-------------------|----------------------|-------------|
| `patientDomain.routes.js` | `patient` on list, profile, search, family, clinical | All create, update, delete, tags, bulk, intake-link | `patient` on create, update, quick-create, clinical update |
| `treatments.routes.js` | `treatment` on list, getById | Create, status update, plan create | `treatment` on create, status update, plan create |
| `procedures.routes.js` | `procedure` on list, getById | Create, update | `procedure` on create, update |
| `invoices.routes.js` | `invoice` on list, getById | Create, void | `invoice` on create |
| `payments.routes.js` | `payment` on list, getById | Create | `payment` on create |
| `users.routes.js` | `user` on list, getById | Create, update, delete | `user` on create, update |
| `orthodonticCase.routes.js` | `orthodonticCase` on list, getCase | Status update, workflow save | `orthodonticCase` on create, status update, workflow save |
| `branches.routes.js` | — | Create, update, delete | `branch` on create, update |
| `bookingApproval.routes.js` | — | Approve, reject | — |

**Policy Evaluator Enhancement:**
The evaluator now returns an `evaluatedRules` trace array with each decision, showing which rules were checked, their match status, and which rule produced the final decision.

**Security Metrics:**
- `policyCoverage` — % of write permissions with PBAC policies
- `matrixCoverage` — total guarded routes in permissionMatrix
- `fieldCoverage` — % of role×resource combinations with field access rules

### Production Hardening (Phase 9 — Performance + Security + Reliability)

**Redis Caching:**
```
security:overview:<orgId>     → 30s TTL (includes live audit counts)
security:coverage:<orgId>     → 5min TTL (rarely changes)
security:policies             → 5min TTL (only changes on deploy)
security:fields               → 5min TTL (static configuration)
security:matrix               → 5min TTL (static structure)
```
Graceful fallback: Redis failures are swallowed — endpoints compute directly from DB.

**Rate Limiting (three tiers):**
| Tier | Limit | Applied To |
|------|-------|-----------|
| Dashboard | 60 req/min | All `/security/*` routes |
| Simulation | 20 req/min | `POST /simulate` |
| Export | 5 req/min | `GET /logs/export`, `GET /policies/export` |

**Response Sanitization:**
- Simulation no longer exposes `userId`, raw `resource`, or internal context
- Only `role` + `permission` returned in simulation context
- No policy functions ever serialized

**Metadata Enrichment:**
All responses now include `meta.lastUpdated` (ISO timestamp) and contextual counts.

**Export Endpoints:**
| Method | Path | Format | Max Records |
|--------|------|--------|------------|
| `GET` | `/logs/export` | CSV | 5,000 |
| `GET` | `/policies/export` | JSON | All |

**Frontend Error Boundary:**
`SecurityErrorBoundary.jsx` wraps all tab content — rendering errors are caught and displayed with a retry button. Error details shown in development mode only.

**Performance:**
- Logs query hard-capped at 50 records per page (server-enforced)
- AuditLog model already has compound indexes: `{ organizationId: 1, createdAt: -1 }`, `{ action: 1, createdAt: -1 }`

### Security Rollout & Monitoring (Phase 10 — Safe Deployment)

**Shadow Mode (Safe Rollout):**
```
POLICY_SHADOW_MODE=true  → Log denials, do NOT enforce (request proceeds with next())
POLICY_SHADOW_MODE=false → Normal enforcement (403 on deny)
```

Shadow mode allows production observation of policy impact without UX breakage. All shadow denials are:
1. Logged via structured logging (`event: POLICY_SHADOW_DENY`)
2. Recorded in `denialTracker` for dashboard metrics
3. Written to `AuditLog` with `action: POLICY_SHADOW_DENY`, `success: true` (request succeeded)

**Implementation:**
| Component | File | Purpose |
|-----------|------|---------|
| Shadow Mode | `backend/src/rbac/shadowMode.js` | Flag management + shadow denial logger |
| Denial Tracker | `backend/src/rbac/denialTracker.js` | Per-endpoint/permission denial metrics (Redis + in-memory) |
| Bulk Checker | `backend/src/rbac/bulkPolicyChecker.js` | Per-item policy evaluation for bulk operations |
| policyMiddleware | `backend/src/rbac/policyMiddleware.js` | Shadow mode integration (v4.0) |

**Denial Monitoring Dashboard:**
| Metric | Storage | TTL |
|--------|---------|-----|
| `denied_requests_per_endpoint` | Redis hash + in-memory Map | 24h |
| `denied_requests_per_permission` | Redis hash + in-memory Map | 24h |
| `denials_by_role` | Redis hash + in-memory Map | 24h |
| `recent_denials` | Redis sorted set (last 200) | 24h |

API Endpoints (added to `/api/v1/org/security`):
| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/denials` | Top denied endpoints, permissions, roles, recent denials |
| `GET` | `/shadow-status` | Current shadow mode configuration |

**Frontend RBAC Sync:**
| Component | File | Purpose |
|-----------|------|---------|
| `CapabilityProvider` | `frontend/src/org/guards/CapabilityProvider.jsx` | Context provider flattening permissions into capabilities array |
| `<Can>` | `frontend/src/org/guards/Can.jsx` | Declarative permission guard (`permission`, `permissions`, `anyOf`) |
| `useCan` | `frontend/src/org/guards/Can.jsx` | Hook variant for non-JSX permission checks |

**Applied Guards:**
| Module | Permission Gates |
|--------|-----------------|
| Patient actions (edit) | `patients.update` |
| Patient financial display | `accounting.read` |
| Patient portal actions | `portal.manage` |
| Invoice creation | `invoices.create` |

**Frontend Hardening:**
| Component | File | Purpose |
|-----------|------|---------|
| `EmptyState` | `frontend/src/design-system/components/EmptyState.jsx` | Empty data display |
| `SafeDataRenderer` | `frontend/src/design-system/components/EmptyState.jsx` | Safe render wrapper for null/empty data |
| `isEmptyData` | `frontend/src/design-system/components/EmptyState.jsx` | Utility check for empty data |

Data safety patterns applied:
- Optional chaining (`?.`) on all aggregate data access
- Nullish coalescing (`??`) for numeric fallbacks (prevents display of `0` as empty)
- Fallback display names (`'Unknown Patient'`)

**Rollout Strategy:**
```
Phase 1 — Enable POLICY_SHADOW_MODE=true in production
Phase 2 — Monitor /security/denials dashboard for false positives
Phase 3 — Tune policies based on denial data
Phase 4 — Set POLICY_SHADOW_MODE=false to enforce
```

### Policy-Based Access Control — PBAC Engine (Phase 15 — Fine-Grained Authorization)

The PBAC engine adds resource-level, ownership, branch, and contextual rules on top of base RBAC (requireOrgPermission). Policies run AFTER requireOrgPermission() and BEFORE the controller handler.

**Files:**
```
backend/src/rbac/policyRegistry.js     — Policy definitions per permission
backend/src/rbac/policyMiddleware.js   — Express middleware evaluation engine
```

**Policy Structure:**
```javascript
{
  effect: "allow" | "deny",
  description: string,            // human-readable for audit logs
  condition: (ctx) => boolean,     // synchronous evaluator
  priority: number,               // higher = checked first
}
```

**Policy Context (ctx):**
```javascript
{
  user: req.user,                 // authenticated org user
  resource: object | null,        // fetched resource (from getResource)
  branchId: string | null,        // active branch context
  organizationId: string,         // from JWT
  method: string,                 // HTTP method
  path: string,                   // route path
  timestamp: Date,                // request time
}
```

**Coverage Status (100% write policy coverage):**

All write permissions (create, update, delete, manage) in `orgPermissions.js` have corresponding policy definitions:

| Module | create | update | delete | manage |
|--------|--------|--------|--------|--------|
| patients | ✅ | ✅ | ✅ | — |
| appointments | ✅ | ✅ | ✅ | — |
| recalls | ✅ | ✅ | ✅ | — |
| families | ✅ | ✅ | ✅ | — |
| accounting | ✅ | ✅ | ✅ | — |
| orthodontics | ✅ | ✅ | ✅ | — |
| users | ✅ | ✅ | ✅ | — |
| branches | ✅ | ✅ | ✅ | — |
| procedures | ✅ | ✅ | ✅ | — |
| treatments | ✅ | ✅ | ✅ | — |
| invoices | ✅ | ✅ | ✅ | — |
| payments | ✅ | ✅ | ✅ | — |
| portal | — | — | — | ✅ |
| security | — | — | — | ✅ |
| staff | — | — | — | ✅ |

**Reusable Helpers:**
- `isOwner(ctx)` — creator/owner check
- `isAssignedDoctor(ctx)` — assigned doctor check
- `isSameBranch(ctx)` — branch scope check
- `hasFullBranchAccess(ctx)` — org-admin-level branch access
- `hasRole(role)` — role comparator factory

### Field-Level Access Control (Phase 15 — Response Filtering)

Field-level RBAC strips sensitive fields from API responses based on the user's role. Applied in controllers AFTER data fetching, BEFORE response.

**Files:**
```
backend/src/rbac/fieldAccessRegistry.js  — Role → field whitelist definitions
backend/src/rbac/fieldFilter.js          — Filtering engine + middleware factory
```

**Access Model:**
```
["*"]        = full access (all fields)
[field, ...] = whitelist (only listed fields returned)
undefined    = no access (empty object returned)
```

**Resource Coverage (9 resources):**

| Resource | org_admin | doctor | assistant | receptionist | lab_technician |
|----------|-----------|--------|-----------|--------------|----------------|
| patient | `*` | `*` | whitelist | whitelist | minimal |
| invoice | `*` | clinical | summary | patient-facing | ✗ (denied) |
| orthodonticCase | `*` | `*` | status only | ✗ (denied) | fabrication |
| treatment | `*` | `*` | clinical | scheduling | ✗ (denied) |
| procedure | `*` | `*` | catalog | pricing | names only |
| payment | `*` | summary | minimal | patient-facing | ✗ (denied) |
| appointment | `*` | `*` | scheduling | scheduling | ✗ (denied) |
| branch | `*` | info | basics | contact | name only |
| user | `*` | basic | basic | basic | basic |

**Middleware Integration:**
```javascript
// Applied as Express middleware on GET routes
router.get("/", requireOrgPermission(P.PATIENTS_READ), fieldFilterMiddleware("patient"), controller.list);
```

**Security Properties:**
- Whitelist-based (only allowed fields pass through)
- Deep-safe (doesn't crash on null/undefined)
- Handles Mongoose documents and plain objects
- Supports arrays of resources (batch filtering)
- Full-access fast-path (skips filtering for `["*"]` roles)

### Field Write Guard (Phase 15 — Request Body Sanitization)

Write-side field protection that strips disallowed fields from incoming `req.body` BEFORE they reach controllers. Complements the read-side `fieldFilterMiddleware` to create a complete bidirectional field-level RBAC system.

**Files:**
```
backend/src/rbac/fieldWriteGuard.js  — Write guard engine + middleware factory
```

**Core Behavior:**
```
req.body → fieldWriteGuardMiddleware(resourceType) → stripped req.body → controller
```

- **Whitelist-based**: only explicitly allowed fields survive; all others are silently stripped
- **Non-blocking**: never rejects requests — strips fields as defense-in-depth
- **Audit-friendly**: logs stripped fields with `FIELD_WRITE_GUARD` structured event
- **Metadata attachment**: sets `req._writeGuard` for downstream introspection
- **Method-scoped**: only applies to POST, PUT, PATCH (skips GET, DELETE)

**Write Access Definitions (9 resources):**

| Resource | org_admin | doctor | assistant | receptionist | lab_technician |
|----------|-----------|--------|-----------|--------------|----------------|
| patient | `*` | `*` | contact, scheduling, tags | contact, scheduling, insurance | denied |
| invoice | `*` | clinical + billing fields | billing fields | billing fields | denied |
| appointment | `*` | `*` | scheduling fields | scheduling + insurance | denied |
| treatment | `*` | `*` | status, notes only | denied | denied |
| orthodonticCase | `*` | `*` | denied | denied | lab-specific fields |
| payment | `*` | denied | denied | basic recording | denied |
| procedure | `*` | catalog fields | denied | denied | denied |
| user | `*` | denied | denied | denied | denied |
| branch | `*` | denied | denied | denied | denied |

**Middleware Integration:**
```javascript
// Applied as Express middleware on write routes (after policyMiddleware, before controller)
router.put("/:id",
    requireOrgPermission(P.PATIENTS_UPDATE),
    policyMiddleware(P.PATIENTS_UPDATE, getResource),
    fieldWriteGuardMiddleware("patient"),    // strips disallowed fields
    controller.updatePatient
);
```

**Security Properties:**
- Whitelist-based (only allowed fields pass through — default-deny)
- Handles empty bodies gracefully (no-op)
- Full-access fast-path (roles with `["*"]` bypass filtering for performance)
- Role extraction via shared `extractRole()` from `fieldFilter.js`
- Introspection API: `getWriteResourceTypes()`, `getWriteFields(resource, role)`

**Exports:**
- `guardWriteFields(resourceType, user, body)` — Core validation function (returns `{ valid, invalidFields, role }`)
- `fieldWriteGuardMiddleware(resourceType)` — Express middleware factory
- `getWriteResourceTypes()` — Registry introspection
- `getWriteFields(resourceType, role)` — Per-role write field lookup
- `writeAccess` — Raw write access definitions object
- `flattenFieldPaths(obj, prefix)` — Deep field path flattener for nested object validation

### Authorization Observability Layer (Phase 19 — Full Auth Tracing)

Comprehensive observability layer that captures every authorization decision across all auth layers for each request, providing audit trails, debugging, and compliance traceability.

**Files:**
```
backend/src/middleware/authTraceMiddleware.js   — Per-request auth trace context + DEV debug injection
backend/src/utils/authAuditLogger.js           — Centralized structured auth trace logger
backend/src/rbac/policyDebugger.js             — Policy simulation engine (RBAC × Entitlement × PBAC × Field)
backend/scripts/permissionDriftCheck.js        — Frontend/Backend permission drift detection script
```

**Auth Trace Middleware:**

Initializes `req.authTrace` with `req.addAuthTrace()` function. Each auth layer emits a trace step:

| Layer | Middleware | Step Results |
|-------|-----------|-------------|
| RBAC | `requireOrgPermission` | ALLOW, DENY |
| ENTITLEMENT | `requireEntitlement` | ALLOW, DENY |
| PBAC | `policyMiddleware` | ALLOW, DENY, SKIP |
| FIELD_WRITE | `fieldWriteGuardMiddleware` | ALLOW, DENY, SKIP |
| FIELD_READ | `fieldFilterMiddleware` | ALLOW, FILTER_APPLIED, SKIP |

**Trace Step Format:**
```javascript
{
  layer: "RBAC",
  result: "ALLOW",
  permission: "patients.update",
  resource: "patient",
  reason: "Granted via permissionSet",
  details: { role: "doctor" },
  timestamp: 1711123456789,
  elapsed: 12  // ms since trace start
}
```

**Auth Audit Logger:**

Logs complete auth trace on `res.finish` event:
- `INFO` level — all steps ALLOW (successful request)
- `WARN` level — any step DENY (denial occurred)
- Structured `AUTH_TRACE` log entry with: requestId, userId, organizationId, role, method, path, statusCode, duration, stepCount, hasDenial, denialLayer, steps[]

**Auth Debug Response Injection (DEV only):**

When `AUTH_DEBUG=true` and `NODE_ENV !== "production"`, injects `_authTrace` into JSON response bodies containing the full trace for frontend debugging.

**Field Write Guard Strict Mode (v2.0):**

Phase 19 upgrade from silent stripping to strict rejection:
- **FIX-1**: REJECT with 403 + `invalidFields[]` (no silent stripping)
- **FIX-2**: Deep field validation via `flattenFieldPaths()` — prevents bypass via nested objects
- **FIX-3**: Role coverage enforcement — undefined role = denied (no fallthrough)
- **FIX-4**: Auth trace integration — emits FIELD_WRITE steps

**Policy Debugger Engine:**

Simulates the complete authorization decision chain without performing actual requests:

```javascript
const result = simulatePermission({
  permission: "patients.update",
  user: req.user,
  rolePermissions: role.permissions,
  planModules: capabilities.modules,
  resource: patient,
  branchId: req.branchId,
  organizationId: req.organizationId,
});
// result = {
//   rbac: { granted: true },
//   entitlement: { enabled: true },
//   pbac: { allowed: true, matchedRule: "Doctors can update their own patients", ruleTrace: [...] },
//   fieldAccess: { readMode: "full_access", writeMode: "full_access" },
//   final: true,
//   deniedAt: null
// }
```

**Debug Endpoints (Phase 19 extensions):**
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/debug/permissions/simulate` | Single-permission simulation (RBAC+Entitlement+PBAC+Field) |
| `GET` | `/debug/permissions/full-matrix` | Complete multi-layer debug matrix |

Both endpoints: DEV/STAGING only, `security.manage` guard.

**Permission Drift Detection Script:**

CLI tool (`node scripts/permissionDriftCheck.js`) that detects:
1. **GHOST permissions** — used in frontend but not in backend SSOT
2. **UNUSED permissions** — in backend SSOT but not referenced in frontend
3. **POLICY GAPS** — write permissions without PBAC policies
4. **FIELD GAPS** — modules missing read/write field access definitions

Supports `--json` (CI) and `--strict` (exit code 1 on drift).

**Environment Variables:**
| Variable | Default | Purpose |
|----------|---------|---------|
| `AUTH_DEBUG` | `false` | Inject auth trace into JSON responses (DEV only) |

**Updated Middleware Chain (Write Routes):**
```
authTraceMiddleware → orgProtect → organizationContext → requireEntitlement →
requireOrgPermission → policyMiddleware → fieldWriteGuardMiddleware → controller
                                                                        ↓
                                                              fieldFilterMiddleware (on response)
                                                                        ↓
                                                              res.on("finish") → logAuthTrace
```

Two validators run at application startup to catch RBAC configuration gaps before deployment. Controlled by `RBAC_STRICT_BOOT` environment variable.

**Files:**
```
backend/src/rbac/validators/policyCoverageValidator.js
backend/src/rbac/validators/fieldAccessValidator.js
```

**Policy Coverage Validator:**
- Ensures every write permission (create, update, delete, manage) has a policy in policyRegistry
- Deduplicates aliased permissions (e.g., FINANCE_READ === ACCOUNTING_READ)
- Strict mode throws on missing policies (blocks deployment)
- Default mode logs warnings

**Field Access Validator:**
- Ensures every resource type has field definitions for all org roles
- Verifies org_admin always has `["*"]` (full access)
- Logs debug info for roles with implicit denial (undefined = empty object)
- Strict mode throws on validation failure

**Environment Configuration:**
| Variable | Default | Effect |
|----------|---------|--------|
| `RBAC_STRICT_BOOT` | `false` | When `true`, validators throw on failure → blocks startup |

**Boot Sequence:**
```
server.js startup
    ↓
validatePolicyCoverage({ strict: RBAC_STRICT_BOOT })
    ↓
validateFieldAccess({ strict: RBAC_STRICT_BOOT })
    ↓
Server listen (only reached if validators pass)
```

### Authorization Intelligence & Control Plane (Phase 20 — Persistent Trace + Analytics + Anomaly Detection)

Upgrades the Phase 19 observability layer from ephemeral logging to persistent intelligence. Auth traces are stored in MongoDB, analyzed for patterns, and surfaced through analytics APIs for security dashboards.

**Files:**
```
backend/src/shared/models/AuthTrace.js                  — MongoDB model for persistent auth traces
backend/src/services/authTracePersistence.service.js     — Async non-blocking trace persistence with sampling
backend/src/services/authAnomalyDetector.js              — Anomaly detection engine (denial bursts, cross-org, role deviation)
backend/src/services/authAnalytics.service.js            — Aggregated analytics from persisted traces
backend/src/services/authIntelligenceBootstrap.js        — Boot-time registration of post-persist hooks
backend/src/middleware/authTraceMiddleware.js             — Updated: resource context injection + debug hardening
backend/src/rbac/fieldWriteGuard.js                      — Updated: configurable enforcement mode (strict/warn)
backend/src/jobs/authTraceCleanup.job.js                 — Retention policy enforcement cron job
backend/src/organization/security/security.routes.js     — New analytics + trace query endpoints
backend/src/organization/security/security.controller.js — New controller methods
```

**AuthTrace Model:**
```javascript
{
  requestId: String,        // correlation with request logs
  userId: ObjectId,         // acting user
  organizationId: ObjectId, // tenant scoping (MANDATORY)
  role: String,             // user role at time of request
  method: String,           // HTTP method
  path: String,             // route path
  statusCode: Number,       // HTTP response status
  duration: Number,         // total auth chain time (ms)
  stepCount: Number,        // number of auth layer checks
  hasDenial: Boolean,       // fast-filter for denial queries (indexed)
  denialLayer: String,      // which layer denied (RBAC, ENTITLEMENT, PBAC, FIELD_WRITE)
  resourceType: String,     // e.g., "patient", "treatment" (indexed)
  resourceId: String,       // specific resource ID
  ownerId: String,          // resource owner for ownership tracking
  steps: [{                 // full auth decision chain
    layer, result, permission, resource, reason, details, elapsed, timestamp
  }]
}
```
Indexes: `{ organizationId, createdAt }`, `{ organizationId, hasDenial, createdAt }`, `{ organizationId, resourceType }`, `{ requestId }` (unique).
TTL index: auto-expires at 30d (configurable via `AUTH_TRACE_RETENTION_DAYS`).

**Persistence Architecture:**
```
res.on("finish")
    ↓
persistTraceAsync(req)          — non-blocking (setImmediate)
    ↓
shouldPersist(hasDenial)        — sampling gate
    ↓
AuthTrace.create(doc)           — MongoDB write
    ↓
postPersistHooks[]              — anomaly detection, analytics
```

- **Non-blocking**: uses `setImmediate()` — NEVER delays HTTP response
- **Sampling**: `AUTH_TRACE_SAMPLE_RATE` (0.0–1.0, default 1.0)
- **Denial override**: `AUTH_TRACE_DENY_ALWAYS=true` — always stores denials regardless of sample rate
- **Kill switch**: `AUTH_TRACE_ENABLED=false` — disables all persistence

**Resource Context Injection:**
Route handlers can call `req.setAuthResource({ resourceType, resourceId, ownerId })` to enrich the trace with resource-level context. This enables resource-specific audit queries (e.g., "all auth decisions for patient X").

**Anomaly Detection Engine:**
Three detectors run as post-persist hooks:
1. **Excessive Denial Detector** — fires `security.alert` event when >5 denials from same user in 5-minute window
2. **Cross-Organization Detector** — fires alert when a user makes requests to 3+ different organizations in 5 minutes
3. **Role Behavior Detector** — fires alert when a user generates >10 PBAC denials in 10 minutes (possible privilege escalation probe)

**Enforcement Mode Control (Field Write Guard v2.1):**
| Mode | Behavior | Env Var |
|------|----------|---------|
| `strict` (default) | 403 on invalid fields | `FIELD_WRITE_GUARD_MODE=strict` |
| `warn` | Strip invalid fields + log warning + allow request | `FIELD_WRITE_GUARD_MODE=warn` |

**Analytics API Endpoints (mounted at `/api/v1/org/security/auth`):**
| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/analytics` | Aggregated dashboard: total traces, denial rate, top denied endpoints, hourly trends |
| `GET` | `/traces` | Paginated trace query with filters (hasDenial, userId, resourceType, date range) |
| `GET` | `/traces/:requestId` | Single trace lookup by request correlation ID |

All endpoints guarded by `requireOrgPermission(P.SECURITY_MANAGE)` + rate limited.

**Debug Middleware Hardening (v2.0):**
- Production safety gate: `NODE_ENV=production` → always skip (unchanged)
- Opt-in gate: `AUTH_DEBUG=true` required (unchanged)
- **NEW**: Role gate — only `org_admin` or `superadmin` can see debug output
- **NEW**: `X-Auth-Debug: enabled` response header for DevTools visibility
- **NEW**: Resource context (`resourceType`, `resourceId`) included in debug output

**Trace Retention Policy:**
| Component | Schedule | Configurable |
|-----------|----------|-------------|
| TTL index | Auto-expiry at model level | `AUTH_TRACE_RETENTION_DAYS` (default: 30) |
| Cleanup cron | Daily at 02:30 UTC | `CRON_AUTH_TRACE_CLEANUP`, `JOB_AUTH_TRACE_CLEANUP` |

**Environment Variables:**
| Variable | Default | Purpose |
|----------|---------|---------|
| `AUTH_TRACE_ENABLED` | `true` | Master switch for trace persistence |
| `AUTH_TRACE_SAMPLE_RATE` | `1.0` | Sampling rate (0.0–1.0) |
| `AUTH_TRACE_DENY_ALWAYS` | `true` | Always persist denials regardless of sample rate |
| `AUTH_TRACE_RETENTION_DAYS` | `30` | Trace retention period |
| `FIELD_WRITE_GUARD_MODE` | `strict` | Enforcement mode: strict or warn |
| `CRON_AUTH_TRACE_CLEANUP` | `30 2 * * *` | Cleanup job schedule |
| `JOB_AUTH_TRACE_CLEANUP` | (enabled) | Set to `false` to disable cleanup job |

---

## SECTION 7 — EVENT ARCHITECTURE

All domain events flow through a centralized in-process EventBus with schema validation.

Implementation:
```
core/eventBus.js  (extends Node.js EventEmitter)
```

### EventBus Schema Validation (v3.1)
Every event emission is validated at runtime by `eventContracts/schemaRegistry.js`:
- **Existence check** — unknown event types throw
- **Required fields check** — missing payload fields throw
- **Emitter authorization** — unauthorized emitters warn in dev, throw in production

### Idempotency Service (v3.4)
Event processing is wrapped in exactly-once semantics via `idempotency.service.js`:
```
EventProcessingLedger.findOneAndUpdate($setOnInsert)
  ↓ (atomic lock)
handler(session)
  ↓
session.commitTransaction()
```
- Uses MongoDB document-level WriteLock for atomic lock acquisition
- Handles duplicate key (`11000`) and write conflict (`112`) gracefully
- Returns `{ skipped: true, reason: "ALREADY_PROCESSED" }` on duplicate

### Event Registry (`core/domainEvents.js`)
| Category | Events |
|----------|--------|
| Patient | `patient.created`, `patient.updated`, `patient.deleted`, `patient.status.changed`, `patient.portal.activated`, `patient.booking.requested`, `patient.medical.updated`, `patient.file.uploaded`, `patient.doctor.assigned` |
| Appointment | `appointment.created`, `appointment.completed`, `appointment.requested`, `booking.approved`, `booking.rejected` |
| Clinical | `clinical.case.created` |
| Communication | `communication.queued`, `communication.sent`, `communication.failed` |
| Organization | `org.logo.updated`, `org.name.updated` |
| Billing | `invoice.overdue` |
| Security | `security.alert` |
| Subscription | `subscription.plan.changed`, `subscription.addon.added`, `subscription.addon.removed` |
| Email | `email.magic_link`, `email.password_reset`, `email.otp`, `email.invoice`, `email.refund`, `email.ticket_reply` |

### Event Consumers
- **NotificationEngine** — subscribes to patient, appointment, billing, and security events to create in-app notifications via BullMQ
- **CommunicationDomain** — subscribes to communication events and dispatches email, SMS, or WhatsApp messages
- **PatientDomain Subscribers** — `ownership.subscriber`, `appointment.subscriber`
- **AppointmentDomain Subscribers** — `booking.subscriber`

### Event Architecture Roadmap

The following migration path is planned for the event system to support distributed deployment:

```
Phase 1 — Current (In-Process)
  EventEmitter singleton (single Node.js process)
  + Schema validation
  + Emitter authorization
  + Idempotency via MongoDB
  Limitation: events lost on process crash

Phase 2 — Distributed Events (Redis Streams)
  EventEmitter → Redis Streams (durable, distributed)
  + Consumer groups for multi-instance event processing
  + Message acknowledgment (at-least-once delivery)
  + Stream history and replay capability
  + Zero additional infrastructure (Redis already deployed)

Phase 3 — Full Message Broker (NATS / RabbitMQ)
  Redis Streams → dedicated message broker
  + Dead-letter queues per event type
  + Routing keys and topic-based fan-out
  + Cross-service event delivery
  + Schema registry integration
```

### DomainEventOutbox
For critical financial and mutation events, a `DomainEventOutbox` model exists to provide transactional outbox pattern support. Events are written to the outbox within the same MongoDB session as the domain mutation for guaranteed delivery.

---

## SECTION 8 — INFRASTRUCTURE

### Queue System (BullMQ + Redis)
| Queue | Purpose | Retry Policy |
|-------|---------|-------------|
| `emailQueue` | Transactional email delivery via Nodemailer/SMTP | Exponential 5s × 5 attempts (5s → 10s → 20s → 40s → 80s) |
| `smsQueue` | SMS delivery | Exponential backoff |
| `whatsappQueue` | WhatsApp messaging | Exponential backoff |
| `emailDLQ` | Dead-letter queue for failed email jobs | Manual inspection + re-enqueue |
| `notificationQueue` | In-app notification persistence | Fixed retry |
| `inferenceQueue` | AI analysis requests (production) | Exponential backoff, max 3 attempts |

### Dynamic Worker Scaling
BullMQ workers support adaptive concurrency via `workerScaler.js`:
```
Queue Depth < 10    → concurrency 1   (idle)
Queue Depth < 50    → concurrency 2   (light load)
Queue Depth < 200   → concurrency 4   (moderate load)
Queue Depth ≥ 200   → concurrency 8   (burst)
```
- Polls queue depth every 10 seconds
- Gracefully degrades if BullMQ version does not support dynamic `worker.concurrency` setter
- For multi-instance deployments, replaced by Kubernetes HPA based on queue depth metrics

### Redis Infrastructure

Redis is a critical shared infrastructure component used across multiple subsystems:

| Responsibility | Usage | Status |
|----------------|-------|--------|
| BullMQ Queues | Job queue backing store for all email, SMS, WhatsApp, notification, and inference queues | Active |
| Rate Limiting | Request rate limiting middleware (login endpoints, booking, API throttling) | Active |
| Subscription Cache | Subscription state cache (`sub:org:{organizationId}`, 60s TTL) — avoids 3× DB queries per request | Active |
| Plan Resolution Cache | Resolved plan capabilities per organization | Planned |
| Session State | Refresh token metadata, CSRF token association | Active |
| Event Bus Migration | Redis Streams backing store for Phase 2 distributed events | Planned |

**Deployment Strategy:**
```
Development:
  Single Redis instance (localhost:6379)

Staging:
  Redis Sentinel (1 primary + 2 replicas)
  Automatic failover on primary failure

Production:
  Managed Redis cluster (AWS ElastiCache / Azure Cache for Redis)
  Multi-AZ deployment with automatic failover
  Cluster mode enabled for horizontal partitioning
  TLS encryption in transit
```

**Health Check Integration:**
- Redis connectivity must be validated in the `/api/health` endpoint
- Health check returns degraded status if Redis is unreachable but MongoDB is available
- Returns unhealthy status if both Redis and MongoDB are unreachable

**Failover Requirements:**
- Connection retry with exponential backoff on transient failures
- Queue workers must handle Redis reconnection without data loss
- Rate limiter must fail-open (allow requests) during Redis outage to avoid total lockout

### Observability
- **Prometheus metrics** exposed at `/metrics` (`METRICS_ENABLED=true`)
  - HTTP request duration histograms
  - Queue job processing time histograms
  - Database operation duration
  - Token region mismatch counter
  - Custom business metrics
- **Structured logging** using Pino (`src/utils/logger.js`) — JSON output
- **Request correlation** via `AsyncLocalStorage` and `X-Request-ID`
  - Frontend injects `X-Request-ID` via `crypto.randomUUID()` per request
  - Backend echoes `X-Request-ID` in all responses and error bodies
  - `requestId` present in all error payloads for support tracing
- **Audit logging** using `auditLogger` and `platformAuditLogger`
- **BullBoard** dashboard available at `/admin/queues` (guarded by `platformProtect + superAdminOnly`)
- **Governance report** endpoint at `/api/governance/report`

### Sovereign Guard
Architecture validation is executed at application startup:
- `sovereignGuard.js` verifies system architecture invariants:
  - Registry integrity — `MODULE_REGISTRY` must be frozen with matching SHA-256 hash
  - Subscription guard initialization — `subscriptionGuard` must be loaded
  - Org runtime registration — routes must be registered via `registerOrgRoutes()`
  - Patient aggregate activation — `PatientAggregateService` must be active
  - Event schema registry — must be populated and non-empty
  - Audit chain schema — `AuditLog` must have `currentHash`, `previousHash`, `branchId` fields
  - Domain isolation — legacy model files must not exist in production
- `routerTopologyAudit.js` validates route registration and detects nested mount conflicts
  - Strict mode (`ROUTE_TOPOLOGY_STRICT=true`) kills process on nesting violations

---

## SECTION 9 — API SURFACE

### Base Paths
| Plane | Base Path |
|-------|-----------|
| Platform | `/api/platform/v1/*` (versioned) |
| Platform (legacy) | `/api/platform/*` (unversioned routes during migration) |
| Org Auth | `/api/auth/*` or `/api/v1/auth/*` |
| Org Operations | `/api/v1/*` |
| Patient Portal | `/api/v1/patient/domain/portal/*` |
| Public | `/api/public/*` |
| Health | `/api/health` |
| Metrics | `/metrics` (Prometheus) |

### API Versioning Strategy

Platform APIs must include a version prefix to support backward-compatible evolution:
```
Current:  /api/platform/organizations       ← unversioned (legacy)
Target:   /api/platform/v1/organizations    ← versioned
```

**Rationale:** Without versioned platform endpoints, breaking changes to the platform API require coordinated frontend deployment. Versioned routes allow:
- Old and new API versions to coexist during migration
- Frontend and backend to be deployed independently
- API clients to pin to a specific version

**Migration plan:**
1. Mount new versioned routes at `/api/platform/v1/*`
2. Keep legacy unversioned routes active during transition
3. Deprecate unversioned routes with `Sunset` header
4. Remove legacy routes after frontend migration completes

### API Documentation (Swagger / OpenAPI)

- OpenAPI 3 specification generated from route schemas
- Swagger UI available at `/api/docs`
- `validateOpenApiResponse.js` middleware validates response payloads against OpenAPI schemas
- Used for internal platform APIs and organization APIs
- Enables API client generation and automated contract validation
- Access restricted to authenticated users in production

### Error Response Envelope

All API errors use a consistent envelope:
```json
{
    "success": false,
    "message": "Human-readable error message",
    "errorCode": "MACHINE_READABLE_CODE",
    "requestId": "uuid-for-support-tracing"
}
```
- `requestId` is always present for cross-system correlation
- Stack traces included only when `NODE_ENV === 'development'`
- Field-level errors for duplicate key violations include `field` and `code: DUPLICATE_FIELD`

### Data Storage

#### Schema Design
| Model | OAV | Immutable | Indexes | Notes |
|-------|-----|-----------|---------|-------|
| Organization | ✅ `version` | `regionCode` (post-initial-set) | 13 | Core tenant model |
| User | ✅ `version`, `tokenVersion` | — | 6 | Org-plane identity |
| AuditLog | — | ✅ Full (Mongoose pre-hook guards) | 17 | SHA-256 hash chain |
| OrgContract | ✅ `version` | ✅ Post-activation | 12+ | Hybrid Billing |
| PlatformUser | ✅ `tokenVersion` | — | — | Platform identity |

#### AuditLog Chain Integrity
The `AuditLog` model implements a SHA-256 hash chain for tamper detection:
- `currentHash` — SHA-256 hash of the current entry
- `previousHash` — references the prior entry's `currentHash`
- `{ organizationId, previousHash }` unique index prevents chain forks
- Mongoose pre-hook guards on `updateOne`, `findOneAndUpdate`, `deleteOne`, `deleteMany` throw `ImmutabilityViolation`
- `signatureVersion` field allows future hash algorithm upgrades

#### AuditLog Retention Strategy

AuditLog entries are append-only and grow unbounded. At scale (100M+ entries), the 17 indexes will impact write latency.

**Retention policy:**
```
Active Collection (auditlogs)
  └── Retains entries for 12 months (rolling window)
  └── Full index coverage for real-time queries

Archive Collection (auditlogs_archive)
  └── Entries older than 12 months migrated via scheduled job
  └── Reduced index set (organizationId + createdAt + action only)
  └── Read-only access for compliance queries

Archive Process:
  1. Nightly cron reads entries where createdAt < (now - 12 months)
  2. Bulk insert into auditlogs_archive
  3. Verify insert count matches source count
  4. Delete from active collection (exception to immutability for archival only)
  5. CronLock prevents duplicate execution
```

#### File Storage Engine

Provider-based storage abstraction for all file uploads (photos, STL, audio, documents).

**Service Location:** `core/storage/storageService.js` (aliased as `@core/storage/storageService`)

**Provider Resolution:**
```
process.env.STORAGE_PROVIDER → "local" (default) | "s3" | "gcs" (future)
```

**Supported Providers:**
| Provider | Class | Storage Location | URL Format |
|----------|-------|------------------|------------|
| `local` | `LocalProvider` | `backend/src/uploads/{category}/{orgId}/` | `/uploads/{category}/{orgId}/{fileName}` |
| `s3` | `S3Provider` | `s3://{bucket}/org/{orgId}/{category}/` | `https://{bucket}.s3.{region}.amazonaws.com/org/{orgId}/...` or CDN URL |

**Upload Result Schema (matches `fileMetaFields` on orthodontic models):**
```json
{
    "url": "/uploads/orthodontics/photos/orgId/1711929600-a1b2c3d4.jpg",
    "sizeBytes": 2048576,
    "mimeType": "image/jpeg",
    "storageProvider": "local",
    "originalName": "patient-xray.jpg",
    "storageKey": "/uploads/orthodontics/photos/orgId/1711929600-a1b2c3d4.jpg",
    "fileName": "1711929600-a1b2c3d4.jpg"
}
```

**Category Conventions:**
| Category | Used By |
|----------|---------|
| `orthodontics/photos` | Ortho case photos (intraoral, extraoral, ceph, panoramic) |
| `orthodontics/stl` | 3D scan files (STL, PLY, OBJ) |
| `orthodontics/audio` | Voice note recordings |
| `patients` | Patient profile photos |
| `logos` | Organization branding logos |

**SENTINEL:** The storage service does NOT enforce RBAC — callers must apply guards before invoking upload.

---

## SECTION 10 — SECURITY MODEL

- **Helmet.js** — secure HTTP headers on all responses
- **MongoSanitize** — protection against NoSQL injection attacks
- **Rate Limiting**
  - Org Login: 5 requests / 15 minutes (production)
  - Platform Login: rate limiter required (audit recommendation — not yet implemented)
  - Booking: 50 requests / 5 minutes
  - Platform API endpoints: general rate limiter recommended
- **CORS Policy**
  - Production: env-configured `ALLOWED_ORIGINS`
  - Development: `localhost:3000`
- **CSRF Protection**
  - Double-submit cookie pattern (`x-csrf-token` header)
  - CSRF token rotated on each token refresh
  - All mutation requests require valid CSRF token
- **Tenant Isolation** — `organizationId` injected server-side only, never from client payload
- **Token Type Isolation** — `platformProtect` rejects non-platform tokens; `orgProtect` rejects non-org tokens
- **Stripe Webhooks** — raw body parser mounted before JSON parser to preserve webhook signature integrity
- **Graceful Shutdown** — returns `503 Service Unavailable` with `Connection: close` during shutdown sequence
- **PII-Safe Logging** — Email addresses are hashed/masked before logging to queue inspection systems

---

## SECTION 11 — DOMAIN SPECIFICATIONS INDEX

| Domain | Spec File |
|--------|-----------|
| Authentication | `authentication.spec.md` |
| Patient Domain | `patient-domain.spec.md` |
| Appointment Engine | `appointment-engine.spec.md` |
| Platform Billing | `billing-engine.spec.md` |
| Inventory Engine | `inventory-engine.spec.md` |
| Notification & Communication | `notification-communication.spec.md` |
| Orthodontic AI Module | `orthodontic-ai.spec.md` |
| Platform Governance & RBAC | `platform-governance.spec.md` |
| System Architecture | `system-architecture.spec.md` |
| Intelligence & Analytics | `intelligence-analytics.spec.md` |

---

## SECTION 12 — STORAGE ARCHITECTURE

### Object Storage (File Assets)
- Patient photos, uploaded documents, and signed X-ray references use object storage (S3-compatible)
- Paths stored in MongoDB as relative references — never absolute host-bound URLs
- Signed URL generation is time-limited (configurable TTL per asset type, recommended ≤ 15 minutes)
- Organization logo uploads use dedicated `logoKey` field for storage-side lifecycle management
- **Tenant-namespaced storage prefixes** prevent cross-tenant path discovery:
  ```
  s3://<bucket>/<organizationId>/<domain>/<filename>
  ```

### AI Scan File Storage

**Current (Local Filesystem):**
- STL scan files per orthodontic case are stored on the application server filesystem under an organization-namespaced directory
- `scanFilePath` field on `OrthodonticCase` points to the base directory containing:
  ```
  points.npy         — sampled surface point cloud
  tooth_labels.npy   — per-point FDI label array
  base_plane.json    — detected occlusal base plane metadata
  ```
- Server controls path allocation — no user-supplied paths accepted

**Target Architecture (S3-Compatible Object Storage):**

Migration from local filesystem to object storage is required for horizontal scaling and data durability:
```
Upload STL
    ↓
Store in S3: s3://<bucket>/<organizationId>/scans/<caseId>/raw.stl
    ↓
Generate presigned download URL
    ↓
AI worker downloads via presigned URL
    ↓
AI worker stores results to S3: s3://<bucket>/<organizationId>/scans/<caseId>/results/
    ↓
Backend reads results from S3
    ↓
Cache in OrthodonticCase.lastToothAnalysis
```

**Benefits:**
- Scan files survive instance termination
- Multiple AI workers can process scans from any node
- No shared filesystem dependency (NFS/EFS eliminated)
- Organization-namespaced paths maintain tenant isolation

### Database (MongoDB)
- Single cluster, shared collections, tenant-isolated via `organizationId`
- Immutable append-only collections: `AuditLog`, `LedgerTransaction`, `InventoryTransaction`
- OAV-protected collections: `OrgContract`, `InventoryItem`, `Organization`, `User`
- Partial unique indexes enforce singleton contract states per tenant

---

## SECTION 13 — AI COMPUTE PLANE

### Inference Architecture

The AI inference system supports two operational modes:

**Mode A — Development (CLI Invocation)**
```
Node.js backend
    ↓
child_process.exec()
    ↓
Python CLI script
    ↓
JSON output → Parse → Cache in OrthodonticCase
```
- Single-process, synchronous blocking model
- Suitable for development and low-traffic deployments
- Each analysis spawns a new Python process (~15–60 second execution)

**Mode B — Production (Dedicated Inference Server)**
```
Node.js backend
    ↓
BullMQ inferenceQueue
    ↓
FastAPI inference server
    ↓
ONNX Runtime GPU workers
    ↓
Results written to S3 + MongoDB
    ↓
WebSocket progress event → frontend
```

#### Inference Queue (`inferenceQueue`)
- BullMQ queue for AI analysis requests
- Job payload includes: `organizationId`, `caseId`, `scanPath` (S3 presigned URL), `modelVersion`
- Worker processes jobs from the queue and invokes the FastAPI inference server
- Retry policy: exponential backoff, max 3 attempts
- Failed jobs routed to `inferenceDLQ` for manual inspection

#### GPU Memory Management
- FastAPI inference server manages GPU allocation per request
- Pre-request VRAM availability check prevents OOM crashes
- Concurrent inference limit based on available GPU memory:
  ```
  4 GB VRAM  → 1 concurrent inference
  10 GB VRAM → 2 concurrent inferences
  24 GB VRAM → 4 concurrent inferences
  ```
- Request queuing when GPU is at capacity

#### Request Batching
- Multiple scan analysis requests from the same organization can be batched
- Batch size limited by GPU memory (max 4 scans per batch on 24 GB VRAM)
- Batching reduces model load/unload overhead

#### Model Registry
| Model | Architecture | Task | Export Format |
|-------|-------------|------|--------------|
| PointNet++ Segmentation | 3-level SA + FP, MLPs | Tooth label prediction (FDI 11-48 + gingiva) | ONNX, TorchScript |
| MultiTask PointNet | Shared encoder + dual decoder | Segmentation + boundary detection | ONNX, TorchScript |
| Tooth Graph Segmentation | Graph-based post-processor | Label spatial smoothing | TorchScript |

- Models stored in a versioned registry (S3 or local model directory)
- Model hot-reloading supported — swap models without server restart
- Model version recorded per inference result for reproducibility

#### Health Checks
- FastAPI inference server exposes `/health` endpoint
- Reports: GPU availability, loaded model version, queue depth, memory utilization
- Integrated into `/api/health` aggregate health check

### Hardware Requirements
| Environment | Minimum Spec | Recommended |
|-------------|-------------|-------------|
| Development | CPU only | 8-core CPU, 16 GB RAM |
| Production Inference | NVIDIA GPU (4 GB VRAM) | RTX 3080 / A10 (10 GB VRAM) |
| Training | NVIDIA GPU (8 GB VRAM) | A100 / RTX 4090 (24 GB VRAM) |

### Training Pipeline
- `train_pointnet.py` — primary training loop (41 KB)
- `train_incremental.py` — continual learning from new scans (24 KB)
- `hard_mining/` — automatic difficulty weighting via IoU-based scoring
- `evaluate.py` — mIoU, per-class IoU, boundary error evaluation (19 KB)
- `export_model.py` — ONNX + TorchScript export (10 KB)
- Checkpoints saved per epoch; best model selected by validation mIoU
- Dataset split validation prevents train/test leakage

---

## SECTION 14 — FILE & IMAGING PIPELINE (STL, CBCT, X-ray)

### 3D Scan Ingestion (STL / PLY — Intraoral Scans)
```
Upload STL / PLY
    ↓
Validate mesh topology (watertight check, vertex count)
    ↓
Store raw scan to object storage (S3: /<organizationId>/scans/<caseId>/raw.stl)
    ↓
Normalize coordinate space (center + unit sphere scaling)
    ↓
Detect occlusal base plane (geometry detection or user input)
    ↓
Sample point cloud from surface (Poisson disk sampling)
    ↓
Store: points.npy + base_plane.json (object storage)
    ↓
Enqueue AI segmentation request (inferenceQueue)
    ↓
AI worker downloads scan via presigned URL
    ↓
Write results to OrthodonticCase.lastToothAnalysis
    ↓
Push progress event via WebSocket
```

### 2D Imaging (X-ray / CBCT References)
- X-ray image references stored as object storage paths (`xrayReferences[]` on `ClinicalRecord`)
- Raw DICOM / CBCT processing is **not currently implemented** — paths stored for external viewer integration
- Future: DICOM viewer integration planned via `DocumentEngineDomain`

### Patient Documents
- Signed consent forms, scanned referral letters, custom documents
- Uploaded via `DocumentsController` → stored to object storage → signed URL returned
- Soft-delete policy: document references retained in DB; object storage cleanup is async
- **Tenant-namespaced storage paths:**
  ```
  s3://<bucket>/<organizationId>/documents/<patientId>/<filename>
  ```

### File Security
- All file access routes require JWT authentication
- Signed URLs have short TTL (configurable, recommended ≤ 15 minutes)
- No unauthenticated permanent file URLs exist in the system
- Organization-namespaced storage prefixes prevent cross-tenant path discovery
- AI scan paths are server-controlled — user-supplied paths never accepted

---

## SECTION 15 — REAL-TIME EVENT DELIVERY

### Architecture

Real-time event delivery provides push-based communication from the backend to connected clients. This eliminates polling for time-sensitive updates.

```
Domain Event (EventBus)
    ↓
WebSocket Broadcaster
    ↓
Socket.IO Server
    ↓
Connected Clients (filtered by organizationId + userId)
```

### Transport
- **Protocol:** WebSocket (Socket.IO or native WS)
- **Authentication:** JWT validated on connection handshake — unauthenticated connections rejected
- **Tenant Isolation:** Each WebSocket connection is bound to `organizationId` and `userId` — events are broadcast only to authorized recipients
- **Room Model:**
  ```
  org:<organizationId>                → organization-wide broadcasts
  org:<organizationId>:branch:<id>    → branch-scoped broadcasts
  user:<userId>                       → user-specific notifications
  patient:<patientId>                 → patient portal updates
  ```

### Event Types
| Event Category | Example Events | Consumers |
|----------------|---------------|-----------|
| Notifications | `notification.created`, `notification.read` | All org users (filtered by recipient) |
| Appointments | `appointment.status.changed`, `appointment.created` | Calendar views, receptionist dashboard |
| AI Analysis | `analysis.progress`, `analysis.completed`, `analysis.failed` | Orthodontic case viewer |
| Patient Portal | `booking.confirmed`, `invoice.available` | Patient portal clients |
| System | `subscription.grace.entered`, `maintenance.scheduled` | Admin dashboard |

### Frontend Integration
- `SocketContext` (React Context) manages WebSocket lifecycle
- Connection established after authentication, torn down on logout
- Automatic reconnection with exponential backoff
- Events dispatched to component subscribers via context API

### Scaling Considerations
- **Single-instance:** In-process Socket.IO — all connections on one server
- **Multi-instance:** Socket.IO with Redis adapter — events broadcast across instances via Redis Pub/Sub
- **Connection limits:** Monitor active WebSocket connections via Prometheus gauge metric

---

## SECTION 16 — DEPLOYMENT ARCHITECTURE

### Container Topology

```
                    ┌──────────────────────┐
                    │     API Gateway       │
                    │  (Kong / Traefik /    │
                    │   AWS ALB)            │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼───────┐ ┌─────▼──────┐ ┌───────▼────────┐
     │  API Servers    │ │  Workers   │ │ AI Inference    │
     │  (Node.js)      │ │ (BullMQ)   │ │ (FastAPI)       │
     │  ─────────────  │ │ ────────── │ │ ──────────────  │
     │  Platform API   │ │ Email      │ │ ONNX Runtime    │
     │  Org API        │ │ SMS        │ │ GPU Workers     │
     │  Auth API       │ │ WhatsApp   │ │ Model Registry  │
     │  WebSocket      │ │ Notify     │ │ Health Check    │
     │  Swagger        │ │ Inference  │ │                 │
     └────────┬───────┘ └─────┬──────┘ └───────┬────────┘
              │                │                │
     ┌────────▼────────────────▼────────────────▼────────┐
     │               Supporting Services                  │
     │                                                    │
     │  ┌──────────────┐  ┌──────────┐  ┌─────────────┐ │
     │  │ MongoDB       │  │ Redis    │  │ Object      │ │
     │  │ Cluster       │  │ Cluster  │  │ Storage     │ │
     │  │ (Atlas /      │  │ (Sentinel│  │ (S3 /       │ │
     │  │  ReplicaSet)  │  │  / Cache)│  │  MinIO)     │ │
     │  └──────────────┘  └──────────┘  └─────────────┘ │
     └───────────────────────────────────────────────────┘
```

### Pod Configuration (Kubernetes)
| Pod | Replicas | Scaling Strategy | Node Pool |
|-----|----------|-----------------|-----------|
| `api-server` | 2–4 | HPA on CPU utilization + request count | General compute |
| `email-worker` | 1–2 | HPA on emailQueue depth | General compute |
| `sms-worker` | 1 | Static | General compute |
| `communication-worker` | 1 | Static | General compute |
| `ai-inference` | 1–2 | HPA on inferenceQueue depth | GPU node pool |
| `cron-scheduler` | 1 | Static (leader election via CronLock) | General compute |

### Stateful Services
| Service | Deployment | High Availability |
|---------|-----------|-------------------|
| MongoDB | Atlas (managed) or StatefulSet with WiredTiger | ReplicaSet (3 nodes) |
| Redis | ElastiCache (managed) or StatefulSet with Sentinel | Multi-AZ failover |
| Object Storage | S3 / MinIO | Cross-region replication |

### Configuration Management
| Type | Mechanism |
|------|-----------|
| Non-secret env vars | Kubernetes ConfigMap |
| Secrets | Kubernetes Secret (encrypted at rest) or external secret manager (AWS Secrets Manager, HashiCorp Vault) |
| AI model checkpoints | PersistentVolume (ReadOnlyMany) or S3 model registry |
| Feature flags | Database-backed (FeatureDefinition model) |

### Deployment Strategy
- **Rolling updates** for API servers (zero-downtime)
- **Blue-green deployment** for major version upgrades
- **Canary releases** supported via API gateway routing rules
- **Database migrations** run as Kubernetes Job before deployment
- **SovereignGuard** validates architecture invariants on every pod startup — pods that fail validation are killed and restarted

### Health Endpoints
```
/api/health          → aggregate health (MongoDB + Redis + AI server)
/metrics             → Prometheus metrics
/admin/queues        → BullBoard dashboard (superadmin only)
```

---

## SECTION 17 — DATA RETENTION POLICY

### Purpose

This section defines the data retention policies for all persisted data categories within DentalSaaS. Retention policies are designed to satisfy healthcare regulatory requirements (HIPAA-adjacent, EU MDR, regional health authority mandates), financial auditing standards (SOC 2, PCI-DSS adjacency), and enterprise SaaS contractual obligations.

All retention policies are enforced at the application layer via Mongoose schema Guards, TTL indexes, and scheduled archival jobs. No data category may be permanently deleted without satisfying the rules defined below.

### Data Classification Table

| # | Data Category | Models | Storage Location | Retention Period | Deletion Policy | Compliance Level |
|---|---------------|--------|-----------------|-----------------|----------------|-----------------|
| 1 | Patient Medical Records | `Patient`, `ClinicalRecord`, `Prescription`, `PatientPolicy` | MongoDB (shared collections, `organizationId`-scoped) | **7–10 years** after last treatment date | Soft delete only (`isActive: false`, `deletedAt` timestamp). Hard deletion requires administrative override + audit log entry. | **Critical** — Healthcare regulatory compliance |
| 2 | Appointments | `Appointment`, `BookingRequest` | MongoDB (`organizationId`-scoped) | **Minimum 5 years** from appointment date | Soft delete (`isActive: false`, `deletedAt`). Archived after retention window but never permanently purged. Cancelled/no-show appointments retained for analytics. | **High** — Clinical record adjacency |
| 3 | Platform Billing & Financial Records | `PlatformInvoice`, `OrgContract`, `LedgerTransaction`, `BillingLedger`, `PaymentAttempt`, `BillingAuditLog`, `LedgerAccount` | MongoDB (`platforminvoices`, `orgcontracts`, `ledgertransactions`, `billingledger` collections) | **10 years minimum** (indefinite for ledger entries) | **No deletion allowed.** All financial records are immutable append-only. Invoices, payments, and ledger entries cannot be modified or removed. Voiding creates compensating entries. | **Critical** — Financial regulatory compliance (SOC 2, tax audit) |
| 4 | Organization (Clinic) Billing Records | `PatientInvoice`, `PatientPayment`, `FinancialLedger`, `PaymentAllocation`, `PatientWallet`, `TreatmentInvoice` | MongoDB (`organizationId`-scoped) | **10 years minimum** from invoice issuance | Paid/voided invoices are immutable (Mongoose `pre('save')` guard prevents monetary field changes). No deletion. Draft invoices may be voided but not removed. | **Critical** — Financial regulatory compliance |
| 5 | Contracts & Subscriptions | `OrgContract`, `PlanTemplate`, `PlanVersion`, `OrganizationEntitlement`, `InvoiceSequence` | MongoDB (platform-scoped) | **Indefinite** (full contract chain preserved) | Terminal states (`superseded`, `terminated`, `expired`, `void`) are preserved permanently. Supersession chain (`previousContractId` → `supersededById`) must remain intact for audit trail reconstruction. | **High** — Commercial audit trail |
| 6 | Audit Logs | `AuditLog` | MongoDB (`auditlogs` / `auditlogs_archive` collections) | **Active: 12 months rolling** / **Archive: indefinite (long-term cold storage)** | Audit entries are **immutable** — Mongoose pre-hooks throw `ImmutabilityViolation` on any update/delete attempt. SHA-256 hash chain (`currentHash` → `previousHash`) provides tamper detection. Archival to `auditlogs_archive` after 12 months (reduced index set). | **Critical** — Regulatory compliance, forensic readiness |
| 7 | Billing Audit Logs | `BillingAuditLog` | MongoDB (`billingauditlogs` collection) | **Indefinite** | Append-only. Every refund request, approval, rejection, and processing step is logged. No modification or deletion permitted. | **Critical** — Financial forensics |
| 8 | AI Scan Data | `OrthodonticCase` (scanFilePath, `lastToothAnalysis`), `points.npy`, `tooth_labels.npy`, `base_plane.json` | Local filesystem (current) / S3 object storage (target) at `s3://<bucket>/<organizationId>/scans/<caseId>/` | **Patient lifetime + 7 years** after last treatment | Scans are organization-scoped. Deletion requires explicit administrative action. Raw STL files and processed numpy datasets are retained for the patient's clinical lifetime. Optional anonymized retention for AI training datasets (see Section 20). | **High** — Clinical data, AI reproducibility |
| 9 | Uploaded Documents | Document Engine (`DocumentTemplate`, `PrintLog`, `PrintSetting`), patient documents (consent forms, referral letters) | S3 object storage at `s3://<bucket>/<organizationId>/documents/<patientId>/` | **7–10 years** (aligned with patient medical records) | Soft-delete policy: document references retained in MongoDB; object storage cleanup is asynchronous and deferred. Documents linked to active patients are never deleted. | **High** — Healthcare documentation |
| 10 | Authentication Data | `User` (org), `PlatformUser` (platform), `PatientUser` (portal) | MongoDB | **Active users: indefinite** / **Deleted users: credentials removed immediately** | Active user records retained while the organization is active. On user deactivation, password hashes, TOTP secrets, and recovery codes are scrubbed immediately. Account metadata (userId, role snapshot, audit references) retained for audit trail integrity. | **High** — Security compliance |
| 11 | Refund Execution Records | `RefundExecutionRecord` | MongoDB (`refundexecutionrecords` collection) | **90 days** (TTL index on `createdAt`) | Automatic TTL-based expiration after 90 days. Completed refund records are summarized in `BillingAuditLog` and `BillingLedger` before expiry, ensuring permanent financial audit trail survives record expiration. | **Medium** — Operational (financial trail preserved in ledger) |
| 12 | System / Application Logs | Pino JSON logs, Prometheus metrics | Stdout/stderr (container logging), Prometheus `/metrics` endpoint | **Application logs: 30–90 days** / **Metrics: per retention policy of monitoring stack** | Log rotation managed by container runtime (Docker/Kubernetes log drivers). Logs older than retention window are purged automatically. No PII in application logs (PII-safe logging enforced). | **Medium** — Operational |
| 13 | Inventory Records | `InventoryItem`, `InventoryTransaction`, `CaseCostSnapshot` | MongoDB (`organizationId`-scoped) | **5 years minimum** | `InventoryTransaction` entries are append-only. Stock items may be deactivated but not deleted. Cost snapshots preserved for financial reconciliation. | **Medium** — Operational accounting |
| 14 | Communication Records | `CommunicationUsage`, email/SMS/WhatsApp queue metadata | MongoDB + BullMQ (Redis) | **Communication metadata: 2 years** / **Queue jobs: transient (Redis TTL)** | Email content is not stored — only delivery metadata (status, timestamps, PII-hashed addresses). Queue jobs expire per Redis/BullMQ TTL. Communication usage records archived after 2 years. | **Medium** — Delivery audit |
| 15 | Real-time Event Data | WebSocket connections, in-app notifications | In-memory (Socket.IO) + MongoDB (`Notification` model) | **Notifications: 12 months** / **WebSocket state: session-only** | Notifications older than 12 months archived. WebSocket connection state is ephemeral and not persisted. | **Low** — Operational |

### Retention Enforcement Mechanisms

```
Mechanism                    | Scope                         | Implementation
─────────────────────────────┼───────────────────────────────┼──────────────────────────
Mongoose immutability guards | AuditLog, BillingLedger,      | pre('updateOne'), pre('deleteOne')
                             | LedgerTransaction             | hooks throw ImmutabilityViolation
SHA-256 hash chain           | AuditLog, BillingLedger       | currentHash / previousHash fields
                             |                               | with unique compound index
TTL indexes                  | RefundExecutionRecord         | MongoDB TTL index (90 days)
Soft-delete pattern          | Patient, Appointment,         | isActive: false + deletedAt timestamp
                             | InventoryItem, Documents      |
Scheduled archival           | AuditLog                      | Nightly cron: active → archive collection
                             |                               | with CronLock idempotency
Financial immutability guard | PatientInvoice                | pre('save') blocks monetary field
                             |                               | changes on paid/voided invoices
OAV (Optimistic Atomic       | OrgContract, Organization,    | version field incremented on save
Versioning)                  | User, InventoryItem           | prevents concurrent overwrites
```

### Data Sovereignty

All data retention policies respect the `regionCode` field present on tenant-scoped documents. Cross-region data queries are filtered by `regionCode` indexes. Data residency requirements are enforced at the query layer — no cross-region data leakage is architecturally possible.

---

## SECTION 18 — REFUND POLICY

### Purpose

This section defines the system behavior and business rules governing refund operations within the DentalSaaS platform. The refund subsystem is implemented as a dedicated domain within the Platform Billing plane, with forensic-grade audit trails and strict state machine enforcement.

### Refund Scope

| Billing Domain | Refund Support | Model |
|---------------|---------------|-------|
| Platform SaaS Billing (subscription invoices) | ✅ Full refund lifecycle | `RefundExecutionRecord`, `PlatformInvoice`, `BillingLedger` |
| Organization Clinical Billing (patient invoices) | ⚠️ Voiding only (no refund state machine) | `PatientInvoice` (status → `voided`) |

**Note:** Organization-level clinical billing supports invoice voiding but does not implement a formal refund lifecycle. Patient payments marked as `refunded` in `PatientPayment.status` represent internal accounting adjustments, not provider-mediated refunds.

### Platform Refund Lifecycle

#### State Machine

All refund state transitions are enforced by `refundStateMachine.js`. No service or controller may change a refund status without passing through `assertValidRefundTransition()`.

```
  refund_requested
      │
      ▼
  refund_under_review ──────────► refund_rejected   (terminal)
      │
      ▼
  refund_approved
      │
      ▼
  refund_processing ────────────► refund_failed      (terminal)
      │
      ▼
  refund_completed               (terminal)
```

#### Refund Types

| Type | Description | Implementation |
|------|-------------|---------------|
| **Full refund** | Refund of entire invoice amount | `refundedAmountMinor >= totalAmountMinor` → `paymentStatus: "refunded"` |
| **Partial refund** | Refund of a portion of the invoice | `refundedAmountMinor < totalAmountMinor` → `paymentStatus: "partially_refunded"` |
| **Credit note** | Internal credit applied to contract balance | `PlatformInvoice.invoiceType: "credit_note"` — creates compensating invoice entry |

#### Refund Request Flow

```
1. Refund Request
   │  Customer/admin requests refund
   │  refundProcessor.requestRefund() creates RefundExecutionRecord
   │
   ▼
2. Policy Validation (refundPolicy.service.js)
   │  ├── Rule 1: Invoice must be in "paid" status
   │  ├── Rule 2: Within refund window (default: 30 days from payment)
   │  ├── Rule 3: Revenue recognition check (configurable)
   │  ├── Rule 4: Large refund threshold (> $1000 → manual approval)
   │  ├── Rule 5: Contract ratio guardrail (> 50% of lockedPrice → manual approval)
   │  └── Rule 6: Velocity check (max 3 refunds per org per 30 days → fraud flag)
   │
   ▼
3. Review & Approval
   │  ├── Auto-approve: if no flags triggered
   │  └── Manual approval: superadmin approves via approveRefund()
   │      OR rejects via rejectRefund() (terminal)
   │
   ▼
4. Provider Execution (refundProcessor.processRefund())
   │  ├── Provider call (Stripe refund / Paymob refund / manual)
   │  ├── Idempotency via providerRefundId (unique sparse index)
   │  └── On failure → refund_failed (terminal)
   │
   ▼
5. Financial Settlement (within MongoDB transaction)
   │  ├── PlatformInvoice.refundedAmountMinor updated
   │  ├── PlatformInvoice.amountPaid decreased
   │  ├── PlatformInvoice.paymentStatus → "refunded" or "partially_refunded"
   │  ├── RevenueSchedule proportional reversal (using stored exchange rate)
   │  ├── BillingLedger entry: eventType "payment.refunded" (immutable)
   │  └── BillingAuditLog entry: REFUND_PROCESSED
   │
   ▼
6. Completion
   RefundExecutionRecord.status → "refund_completed"
```

#### Refund Accounting Model

```
                    PlatformInvoice (immutable after issuance)
                          │
                    PaymentAttempt (records payment)
                          │
                    RefundExecutionRecord (tracks refund lifecycle)
                          │
                    ┌──────┴──────┐
                    │             │
            BillingLedger    LedgerTransaction
        (event: payment.refunded)  (double-entry compensating entries)
```

**Example:**
```
Invoice:    INV-202603-00042    →  $100.00 (totalAmountMinor: 10000)
Payment:    PAY-001             →  $100.00 captured
Refund:     REF-001             →  $40.00 partial refund

Result:
  PlatformInvoice.amountPaid         = $60.00
  PlatformInvoice.refundedAmountMinor = 4000
  PlatformInvoice.paymentStatus      = "partially_refunded"
  Revenue (post-refund)              = $60.00
```

#### Refund Accounting Rules

1. **Original invoices remain immutable.** No monetary fields on issued/paid invoices are ever modified except `refundedAmountMinor`, `amountPaid`, `amountRemaining`, and `paymentStatus`.
2. **Refunds create compensating financial entries.** Every refund writes an immutable `BillingLedger` entry with `eventType: "payment.refunded"`. The original payment entry is never modified.
3. **Revenue reversal is proportional.** When a refund is processed, the `RevenueSchedule` is adjusted proportionally between recognized and deferred revenue using the original exchange rate (no FX re-resolution).
4. **Revenue integrity invariant:** Post-refund `recognizedAmount + deferredAmount === totalAmount` is validated within the transaction. Violation aborts the transaction.

#### Refund Policy Configuration

Refund policy parameters are stored in `BillingSettings` (database singleton) and are configurable by platform administrators:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `refundWindowDays` | 30 | Days after invoice payment within which refund is allowed |
| `allowAfterRecognition` | `true` | Whether refunds are allowed after revenue recognition begins |
| `requireManualApproval` | `false` | Force manual approval for all refunds regardless of amount |
| `largeRefundThreshold` | 1000 | Amount (decimal) above which manual approval is required |
| `largeRefundRatioPct` | 50 | Percentage of contract value above which manual approval is required |
| `maxRefundsPerOrg` | 3 | Maximum refunds per organization within the velocity window |
| `maxRefundsPerOrgDays` | 30 | Velocity window (days) for fraud detection |

#### Refund Observability

Every refund state transition generates:
1. **BillingAuditLog entry** — captures `REFUND_REQUESTED`, `REFUND_APPROVED`, `REFUND_REJECTED`, `REFUND_PROCESSED`, `REFUND_FAILED` events with full metadata
2. **BillingLedger entry** — immutable financial event log entry on completion
3. **Structured Pino log** — with correlation IDs for operational monitoring
4. **Fraud flag logging** — velocity limit violations produce `WARN`-level log with organizationId

---

## SECTION 19 — FINANCIAL IMMUTABILITY RULES

### Purpose

This section defines the immutability guarantees enforced across all financial records in DentalSaaS. Financial immutability is a core architectural invariant — no financial record may be modified or deleted after creation.

### Immutable Financial Models

| Model | Collection | Immutability Enforcement | Scope |
|-------|-----------|------------------------|-------|
| `BillingLedger` | `billingledger` | Mongoose `pre('updateOne')`, `pre('findOneAndUpdate')`, `pre('deleteOne')`, `pre('deleteMany')` hooks throw `ImmutabilityViolation` | Platform |
| `LedgerTransaction` | `ledgertransactions` | Mongoose `pre('updateOne')`, `pre('findOneAndUpdate')`, `pre('replaceOne')`, `pre('updateMany')`, `pre('deleteOne')`, `pre('findOneAndDelete')`, `pre('deleteMany')` hooks throw | Platform |
| `AuditLog` | `auditlogs` | Mongoose `pre('updateOne')`, `pre('findOneAndUpdate')`, `pre('replaceOne')`, `pre('updateMany')`, `pre('deleteOne')`, `pre('findOneAndDelete')`, `pre('deleteMany')` hooks throw. `createdAt` field marked `immutable: true`. | Shared |
| `PatientInvoice` | (org billing) | `pre('save')` guard prevents modification of monetary fields (`subtotal`, `tax`, `discount`, `totalAmount`, etc.) on `paid` or `voided` invoices | Organization |
| `InventoryTransaction` | (org inventory) | Append-only by design (no update endpoints exposed) | Organization |

### Immutability Rules

#### Rule 1 — Issued Invoices Cannot Be Modified

**Platform Invoices (`PlatformInvoice`):**
- Once a `PlatformInvoice` transitions from `draft` to `issued` or beyond, core financial fields (`totalAmount`, `totalAmountMinor`, `subtotalAmount`, `taxAmount`, line items) are frozen.
- The `invoiceStateMachine.js` enforces valid status transitions: `draft → issued → open → partial → paid` (with `overdue → void | uncollectible` branches).
- Post-payment fields (`amountPaid`, `amountRemaining`, `refundedAmountMinor`, `paymentStatus`) are updated only by authorized services (`paymentApplicationService`, `refundProcessor`).

**Patient Invoices (`PatientInvoice`):**
- Mongoose `pre('save')` hook explicitly blocks modification of monetary fields on `paid` or `voided` invoices:
  ```
  Financial Guard: Cannot modify monetary fields on paid/voided invoice.
  ```
- Protected fields: `subtotal`, `tax`, `discount`, `insuranceCovered`, `totalAmount`, and all `*Minor` variants.

#### Rule 2 — Payments Cannot Be Edited

- `PaymentAttempt` records are created with a specific `paymentStatus` and transition through a strict state machine (`paymentStateMachine.js`).
- `PatientPayment` records support status transitions (`active → refunded → transferred`) but the original `amount` and `paymentMethod` fields are never modified.
- Payment records are referenced from `BillingLedger` entries which are themselves immutable.

#### Rule 3 — Refunds Must Create Compensating Transactions

Refunds **never modify** the original invoice or payment records. Instead:

```
Original Invoice (immutable)
    │
    ├── Original BillingLedger entry: "payment.succeeded" (immutable)
    │
    ├── Refund BillingLedger entry: "payment.refunded" (new, immutable)
    │
    ├── LedgerTransaction: double-entry debit/credit (new, immutable)
    │
    └── PlatformInvoice fields updated (only):
        ├── refundedAmountMinor (cumulative)
        ├── amountPaid (decreased)
        ├── amountRemaining (increased)
        └── paymentStatus → "refunded" | "partially_refunded"
```

#### Rule 4 — Voiding Creates Compensating Entries

Invoice voiding (for unpaid invoices only) follows the same compensating-entry pattern:
- `BillingLedger` receives an `invoice.voided` event entry
- Original invoice data is preserved with `status: "void"` and `voidedAt` timestamp
- `PatientInvoice` voiding records `voidedByUserId`, `voidedReason`, and `voidedAt`

#### Rule 5 — Ledger Hash Chain Integrity

Both `AuditLog` and `BillingLedger` implement SHA-256 hash chains:

```
Entry N:
  currentHash = SHA-256(previousHash + financial_fields + createdAt)
  previousHash = Entry(N-1).currentHash

Entry N+1:
  previousHash = Entry(N).currentHash
  currentHash = SHA-256(...)
```

**Tamper detection:** Modifying any entry invalidates all subsequent hashes. The `GuardianInvariantMonitor` (`LEDGER_HASH_CHAIN_VALID`) detects chain breaks.

**Fork prevention:** `AuditLog` enforces `{ organizationId, previousHash }` unique index — only one entry can follow a given hash, preventing chain forks.

#### Rule 6 — Double-Entry Ledger Balance Invariant

`LedgerTransaction` entries enforce balanced double-entry accounting:
```
SUM(debit) === SUM(credit)  (within 0.001 floating-point epsilon)
```
Unbalanced transactions are rejected at the schema validation layer before persistence.

### Models Subject to Immutability

```
Platform Plane:
  BillingLedger         → append-only, hash chain, no update/delete
  LedgerTransaction     → append-only, balanced double-entry, no update/delete
  BillingAuditLog       → append-only forensic log
  PlatformInvoice       → core fields frozen after issuance

Organization Plane:
  PatientInvoice        → monetary fields frozen on paid/voided
  FinancialLedger       → append-only (no update endpoints)
  InventoryTransaction  → append-only (no update endpoints)

Shared:
  AuditLog              → append-only, hash chain, no update/delete
```

---

## SECTION 20 — AI DATA PRIVACY

### Purpose

This section defines the privacy safeguards for AI-related data within DentalSaaS, covering scan storage, training dataset management, and patient data isolation in the AI compute plane.

### AI Data Categories

| Data Type | Storage | Contains PII | Organization-Scoped |
|-----------|---------|-------------|-------------------|
| Raw STL/PLY mesh files | Object storage (`s3://<bucket>/<organizationId>/scans/<caseId>/raw.stl`) | No direct PII (geometry only) | ✅ Yes |
| Sampled point clouds (`points.npy`) | Object storage (same path as raw scan) | No direct PII | ✅ Yes |
| Tooth label arrays (`tooth_labels.npy`) | Object storage (same path) | No direct PII | ✅ Yes |
| Base plane metadata (`base_plane.json`) | Object storage (same path) | No direct PII | ✅ Yes |
| Cached tooth analysis (`OrthodonticCase.lastToothAnalysis`) | MongoDB (via `organizationId`) | Indirect (linked to patient via `treatmentCaseId`) | ✅ Yes |
| Training datasets (aggregated) | Local filesystem (`python-ai-engine/datasets/`) | **Must be anonymized before use** | ❌ No (cross-org) |
| Model checkpoints | Local filesystem / S3 model registry | No PII | ❌ No |

### Privacy Safeguards

#### Safeguard 1 — Organization-Scoped Scan Isolation

All patient scan files are stored under organization-namespaced paths:
```
s3://<bucket>/<organizationId>/scans/<caseId>/
```
- The `organizationId` prefix ensures tenant isolation at the storage layer.
- Cross-tenant path discovery is architecturally impossible — file paths are server-controlled.
- No user-supplied paths are accepted for scan storage (enforced at the API layer).

#### Safeguard 2 — Training Dataset Anonymization

Before any scan data is used for AI model training:

1. **Patient identifiers must be removed.** The dataset generation pipeline (`python-ai-engine/dataset/`) processes raw STL meshes into numpy arrays. The generated datasets contain only:
   - Point cloud coordinates (`points.npy`)
   - FDI tooth labels (`tooth_labels.npy`)
   - Geometric metadata (normals, curvatures)

2. **No patient-identifiable metadata in training files.** Dataset files do not contain:
   - Patient names, IDs, or codes
   - Organization identifiers
   - Dates of treatment
   - Any clinical notes or diagnoses

3. **Anonymization is structural.** The STL → numpy conversion pipeline inherently strips all metadata. STL files contain only vertex/face geometry; no DICOM-style patient headers exist.

#### Safeguard 3 — Dataset Export Controls

When exporting datasets for external training or research:

1. **Organization identifiers must be stripped.** Directory names must not contain `organizationId` or `caseId` values.
2. **File naming must use opaque identifiers.** Replace case-based naming with hash-based or sequential identifiers:
   ```
   Before: /dataset/org_abc123/case_xyz789/points.npy
   After:  /dataset/sample_00001/points.npy
   ```
3. **Consent verification.** Dataset export requires explicit patient consent flag (future: `PatientPolicy.consentForAITraining`).

#### Safeguard 4 — Inference Result Isolation

AI inference results are written back to the `OrthodonticCase` model, which is scoped by `organizationId`. Results include:
- Tooth presence/absence status
- FDI label assignments
- Measurements and metadata

These results are accessible only within the originating organization's context — no cross-tenant inference result access is possible.

#### Safeguard 5 — Model Version Tracking

Every inference result records the model version used, ensuring:
- Reproducibility of AI decisions
- Auditability of which model generated which clinical output
- Rollback capability if a model version is found to produce incorrect results

### AI Data Retention

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| Raw STL scans | Patient lifetime + 7 years | Clinical data — follows medical record retention |
| Processed datasets (per-patient) | Patient lifetime + 7 years | Linked to clinical record |
| Anonymized training datasets | Indefinite | No PII — retained for model improvement |
| Model checkpoints | Indefinite | Versioned registry allows rollback |
| Inference results | Patient lifetime + 7 years | Cached in `OrthodonticCase.lastToothAnalysis` |

---

## SECTION 21 — PATIENT DATA ANONYMIZATION (GDPR / PRIVACY)

### Purpose

This section defines the policy and technical approach for handling patient data removal requests in compliance with GDPR Article 17 (Right to Erasure), regional healthcare privacy laws, and enterprise data governance requirements.

### Scope

Patient data anonymization applies to the **Organization Plane** only. Platform Plane data (contracts, invoices, audit logs) is governed by financial retention rules and is exempt from erasure requests.

### Anonymization vs. Deletion

DentalSaaS uses **anonymization** rather than hard deletion to satisfy both:
- **GDPR right to erasure** — patient is no longer identifiable
- **Healthcare compliance** — clinical data retained for regulatory minimum retention periods

### Anonymization Procedure

When a valid data removal request is received, the following fields are anonymized on the `Patient` model:

| Field | Original Value | Anonymized Value |
|-------|---------------|-----------------|
| `nameArabic` | "أحمد محمد" | `"[ANONYMIZED]"` |
| `nameEnglish` | "Ahmed Mohamed" | `"[ANONYMIZED]"` |
| `fullNameNormalized` | "ahmed mohamed" | `"[ANONYMIZED]"` |
| `nameTokens` | `["ahmed", "mohamed"]` | `[]` |
| `email` | "ahmed@example.com" | `null` |
| `phone` | "+971501234567" | `"[REDACTED]"` |
| `phoneRaw` | "0501234567" | `"[REDACTED]"` |
| `phoneE164` | "+971501234567" | `"[REDACTED]"` |
| `phoneDigits` | "971501234567" | `"000000000000"` |
| `secondaryPhone` | "+971509876543" | `null` |
| `address` | "123 Main St, Dubai" | `null` |
| `nationality` | "EG" | `null` |
| `nationalId` | "29012345678901" | `null` |
| `photo` | "s3://bucket/org/patients/photo.jpg" | `null` (S3 object deleted) |
| `insurance.provider` | "AXA" | `null` |
| `insurance.policyNumber` | "POL-123456" | `null` |
| `emergencyContact` | `{ name, phone, relation }` | `{ name: null, phone: null, relation: null }` |

### Retained Data (Post-Anonymization)

The following data is **retained** post-anonymization for clinical and regulatory compliance:

| Data | Reason |
|------|--------|
| `organizationId` | Tenant association for data governance |
| `patientCode` | Internal reference (non-PII — system-generated) |
| `gender` | Clinical relevance (no direct identification) |
| `dateOfBirth` | Clinical relevance (age-dependent treatment records) |
| `isActive: false` | Soft-delete indicator |
| `deletedAt` | Timestamp of anonymization |
| Clinical records | Mandatory healthcare retention (7–10 years) |
| Appointment history | Mandatory healthcare retention (5 years) |
| Financial records | Financial regulatory retention (10 years) |
| AI scan data | Anonymized — no patient link after anonymization |

### Related Entity Handling

When a patient is anonymized, the following related entities are processed:

| Entity | Action |
|--------|--------|
| `ClinicalRecord` | Retained (no PII in model — linked via anonymized `patientId`) |
| `Prescription` | Retained (clinical record) |
| `Appointment` | Retained (clinical record — patient name not stored directly) |
| `PatientInvoice` | Retained (financial record — immutable) |
| `PatientPayment` | Retained (financial record) |
| `PatientUser` (portal access) | **Deleted** — portal credentials removed, login disabled |
| `PortalInvite` | **Deleted** — pending invitations invalidated |
| `OrthodonticCase` | `scanFilePath` retained (geometry only, no PII). `lastToothAnalysis` retained. |
| Patient documents (S3) | **Deleted** — consent forms and uploaded documents containing PII are removed from object storage |
| `AuditLog` entries | **Retained** — audit entries referencing the patient remain (actorId/entityId preserved for compliance; patient name was never stored in AuditLog) |

### Anonymization Workflow

```
1. Anonymization Request
   │  Received via org admin UI or API
   │  Validated: user must have patients.delete permission
   │
   ▼
2. Eligibility Check
   │  ├── Patient has no pending appointments
   │  ├── Patient has no outstanding unpaid invoices
   │  └── Minimum retention period satisfied (configurable)
   │
   ▼
3. Create AuditLog Entry
   │  action: "PATIENT_ANONYMIZATION_REQUESTED"
   │  entityType: "Patient"
   │  entityId: patient._id
   │
   ▼
4. Execute Anonymization (within MongoDB transaction)
   │  ├── Anonymize Patient document fields
   │  ├── Delete PatientUser (portal access)
   │  ├── Delete PortalInvite
   │  ├── Queue S3 document deletion (async)
   │  └── Set patient.isActive = false, deletedAt = now
   │
   ▼
5. Create AuditLog Entry
   │  action: "PATIENT_ANONYMIZED"
   │  (irreversible — cannot be undone)
   │
   ▼
6. Confirmation
   Return anonymization confirmation with timestamp
```

### GDPR Data Subject Request Handling

| Request Type | DentalSaaS Response |
|-------------|-------------------|
| **Right to Access (Art. 15)** | Export patient data via API (clinical records, appointments, invoices, documents) |
| **Right to Rectification (Art. 16)** | Standard patient profile update via org UI |
| **Right to Erasure (Art. 17)** | Anonymization procedure (above) — PII removed, clinical data retained for legal obligation |
| **Right to Restriction (Art. 18)** | Set `patient.isActive = false` — data retained but processing restricted |
| **Right to Portability (Art. 20)** | Export patient data in structured JSON format via API |

### Data Processing Agreement (DPA) Support

DentalSaaS acts as a **Data Processor** on behalf of the dental organization (Data Controller). The platform provides:
- Tenant-isolated data storage (no cross-organization data access)
- Configurable data retention policies per organization
- Anonymization tools for GDPR compliance
- Audit trails for all data access and modifications
- Encryption in transit (TLS) and at rest (MongoDB encryption, S3 server-side encryption)

---

## SECTION 22 — COMPLIANCE SUMMARY

### Compliance Posture Matrix

| Domain | Standard / Regulation | Current Status | Gap |
|--------|----------------------|---------------|-----|
| **Financial Records** | SOC 2 Type II | ✅ Immutable ledgers, hash chains, double-entry accounting | None critical |
| **Audit Trails** | SOC 2, ISO 27001 | ✅ SHA-256 hash-chained audit logs, append-only enforcement | Archive rotation job needed for scale |
| **Patient Data Privacy** | GDPR Art. 17 | ⚠️ Framework defined, anonymization procedure specified | Implementation: anonymization service not yet built |
| **Healthcare Records** | Regional health authority mandates | ⚠️ Retention periods defined, soft-delete in place | Configurable per-region retention rules needed |
| **Payment Security** | PCI-DSS (adjacent) | ✅ No card data stored — delegated to Stripe/Paymob | Platform never handles raw card data |
| **AI Data Privacy** | GDPR Art. 22, EU AI Act | ⚠️ Structural anonymization in pipeline, training data controls defined | Consent flag mechanism not yet implemented |
| **Data Encryption** | ISO 27001, SOC 2 | ✅ TLS in transit, MongoDB at-rest encryption, AES-256-GCM for TOTP secrets | S3 server-side encryption configuration pending |
| **Refund Processing** | Financial regulations, SOC 2 | ✅ Full state machine, policy engine, fraud controls, compensating entries | Complete |
| **Tenant Isolation** | SOC 2, ISO 27001 | ✅ organizationId scoping, server-side injection, branch isolation | Complete |
| **Access Control** | RBAC best practices | ✅ Centralized capability resolver, permission-based guards, plane isolation | Complete |

### Implementation Priority

| Priority | Item | Section Reference |
|----------|------|------------------|
| **P0 — Critical** | Patient anonymization service implementation | Section 21 |
| **P0 — Critical** | AI training consent flag on PatientPolicy model | Section 20, Safeguard 3 |
| **P1 — High** | AuditLog archival cron job deployment | Section 17, Row 6 |
| **P1 — High** | Configurable per-region retention periods | Section 17 |
| **P1 — High** | S3 server-side encryption configuration | Section 22 |
| **P2 — Medium** | Organization-level patient data export API (GDPR Art. 15/20) | Section 21 |
| **P2 — Medium** | Financial ledger archival for entries > 10 years | Section 17, Row 3 |
| **P3 — Low** | Communication record archival (2-year TTL) | Section 17, Row 14 |

---

## SECTION 23 — CLINICAL CORE (Phase 2)

### 23.1 Patient Domain

The Patient Domain is implemented as a **Sovereign Aggregate** following DDD patterns. The aggregate service (`patient.aggregate.service.js`) is the ONLY authorized layer for mutating Patient records.

#### Model: Patient (`organization/patient/models/patient.model.js`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| organizationId | ObjectId → Organization | ✅ | Tenant isolation key |
| primaryBranchId | ObjectId → Branch | ✅ | Primary branch assignment |
| allowedBranchIds | [ObjectId → Branch] | ✅ | Multi-branch visibility (min 1) |
| patientCode | String | ✅ | Auto-generated: `PT-{YEAR}-{SEQ}` |
| nameArabic | String | | Arabic full name |
| nameEnglish | String | | English full name |
| fullNameNormalized | String | | Auto-computed lowercase search token |
| nameTokens | [String] | | Auto-computed search fragments |
| phone | String | | E.164 international format |
| phoneRaw | String | ✅ | Original input |
| phoneE164 | String | ✅ | Parsed E.164 via libphonenumber |
| phoneDigits | String | ✅ | Digits-only for fuzzy search |
| email | String | | Trimmed, lowercase |
| gender | String | | Enum: male, female |
| dateOfBirth | Date | | |
| address | String | | |
| insurance | Object | | { provider, policyNumber, expiryDate } |
| emergencyContact | Object | | { name, phone, relation } |
| isActive | Boolean | | Soft delete flag (default: true) |
| deletedAt | Date | | Soft delete timestamp |
| version | Number | | Optimistic concurrency control |

#### Indexes (Multi-Tenant Performance)

| Index | Purpose |
|-------|---------|
| `{ organizationId, patientCode }` unique | Tenant-scoped uniqueness |
| `{ organizationId, createdAt: -1 }` | Sorted listing |
| `{ organizationId, nameTokens }` | Token-based search |
| `{ organizationId, phoneDigits }` | Phone search |
| `{ organizationId, allowedBranchIds, createdAt: -1 }` | Branch-aware listing |
| `{ organizationId, primaryBranchId }` | Analytics |
| `{ organizationId, visibleToDoctors }` | v4.5 ownership scoping |

#### API: Patient Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| POST | /api/v1/patient/domain/internal/patients | patients.create | Create (v1.7.0 aggregate, transactional) |
| GET | /api/v1/patient/domain/internal/patients | patients.read | List (token search, paginated) |
| GET | /api/v1/patient/domain/ | patients.read | List (legacy) |
| POST | /api/v1/patient/domain/ | patients.create | Create (legacy) |
| GET | /api/v1/patient/domain/:id | patients.read | Profile (aggregate view) |
| PUT | /api/v1/patient/domain/:id | patients.update | Update |
| DELETE | /api/v1/patient/domain/:id | patients.delete | Soft delete |

#### Tenant Isolation Rules

- All queries MUST include `organizationId` filter
- `organizationId` is server-side injected from JWT — never client-supplied
- Soft delete sets `isActive = false` and `deletedAt = Date.now()`
- Soft delete atomically invalidates patient portal JWT (tokenVersion++)
- Branch access validated via `allowedBranchIds` array
- primaryBranchId must always be present in allowedBranchIds (pre-save hook enforced)

---

### 23.2 Appointment Engine

The Appointment Engine handles scheduling, status lifecycle, overlap prevention, and calendar visualization for dental clinics.

#### Model: Appointment (`organization/appointment/models/appointment.model.js`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| organizationId | ObjectId → Organization | ✅ | Tenant isolation key |
| branchId | ObjectId → Branch | ✅ | Branch context |
| patientId | ObjectId → Patient | ✅ | Patient reference |
| dentistId | ObjectId → User | ✅ | Dentist reference |
| chairId | ObjectId → Chair | ✅ | Dental chair reference |
| startTime | Date | ✅ | Appointment start |
| endTime | Date | ✅ | Appointment end (computed) |
| duration | Number (minutes) | ✅ | Must be multiple of org slot duration |
| status | String | | FSM-controlled (see below) |
| statusHistory | [{ status, changedBy, changedAt }] | | Audit trail |
| checkedInAt | Date | | Set on check-in transition |
| startedAt | Date | | Set on in-progress transition |
| completedAt | Date | | Set on completion transition |
| cancelledAt | Date | | Set on cancellation |
| waitingDuration | Number | | Computed: startedAt - checkedInAt (minutes) |
| notes | String | | Free-text notes |
| isActive | Boolean | | Soft delete flag |
| version | Number | | Optimistic concurrency |

#### Status FSM (Finite State Machine)

```
waiting-list → open
open → confirmed | cancelled | no-show
confirmed → checked-in | cancelled | no-show
checked-in → in-progress | cancelled
in-progress → completed | cancelled
delayed → confirmed | cancelled
completed → (terminal)
cancelled → (terminal)
no-show → (terminal)
```

All transitions are validated by `statusTransitions.js`. Invalid transitions return HTTP 400.

#### Overlap Detection (Dual Resource)

```
1. DENTIST overlap — searched across ALL branches in the org
   Query: same dentistId + time collision + active statuses

2. CHAIR overlap — searched WITHIN the specific branch
   Query: same branchId + chairId + time collision + active statuses

Active statuses: [open, confirmed, checked-in, in-progress]
```

Both checks run in parallel. If conflict detected and `force !== true`, returns HTTP 409 with conflict details.

#### Slot Scheduling Rules

- Slot duration: configurable per organization (default: 15 min)
- Working hours: configurable per organization (default: 08:00–20:00)
- Duration must be a multiple of slot duration
- Start time must align with slot grid
- Appointment must fall within working hours

#### API: Appointment Endpoints

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | /api/v1/appointments/availability | appointments.read | Slot grid (available/occupied) |
| GET | /api/v1/appointments/calendar | calendar.read | Calendar day view (multi-branch) |
| GET | /api/v1/appointments | appointments.read | List (date range, paginated) |
| GET | /api/v1/appointments/:id | appointments.read | Single appointment detail |
| POST | /api/v1/appointments | appointments.create | Create (slot-validated, overlap-checked) |
| PUT | /api/v1/appointments/:id | appointments.update | Update (re-validates overlap if time changes) |
| PATCH | /api/v1/appointments/:id/status | appointments.update | Status transition (FSM-validated) |
| DELETE | /api/v1/appointments/:id | appointments.delete | Cancel (FSM transition to cancelled) |

#### Event Bus Integration

| Event | Trigger | Consumers |
|-------|---------|-----------|
| appointment.created (APPOINTMENT_CREATED) | New appointment | NotificationDomain, CommunicationDomain |
| appointment.updated (APPOINTMENT_UPDATED) | Appointment modified | NotificationDomain |
| appointment.status_changed (APPOINTMENT_STATUS_CHANGED) | Status FSM transition | NotificationDomain, BillingService |
| appointment.completed | Status → completed | BillingService (auto-invoice), CommunicationDomain |

#### Billing Integration

When appointment status transitions to `completed`, the system automatically creates a diagnostic invoice via `createDiagnosticInvoice()` (fire-and-forget pattern — does not block the HTTP response).

---

## SECTION 24 — CLINICAL OPERATIONS (PHASE 3)

### 24.1 Tenant Isolation Model

All clinical and financial models enforce strict tenant isolation:

```
organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
}
```

**Data Isolation Rules:**
1. Client MUST NEVER send `organizationId` — injected by `orgProtect` middleware from JWT
2. All database queries MUST include `organizationId` filter
3. Services validate ownership: `resource.organizationId !== req.organizationId → 403 Forbidden`
4. Cross-tenant access always returns `403 Forbidden`

**Forbidden Pattern:**
```javascript
// WRONG — missing tenant isolation
Invoice.find({ patientId })
```

**Correct Pattern:**
```javascript
// CORRECT — always includes organizationId
Invoice.find({ patientId, organizationId: req.organizationId })
```

### 24.2 Finance Plane Separation

| Plane | Models | Routes | Purpose |
|-------|--------|--------|---------|
| **Platform** | PlatformInvoice, BillingLedger, OrgContract | `/api/platform/billing/*` | SaaS subscription billing |
| **Organization** | PatientInvoice, PatientPayment, FinancialLedger | `/api/v1/invoices`, `/api/v1/payments` | Clinic revenue from patients |

**Invariant:** Platform finance MUST NEVER read org invoices. Org finance MUST NEVER read platform invoices.

### 24.3 Procedure Catalog

**Model:** `Procedure` (`modules/procedures/models/Procedure.model.js`)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| organizationId | ObjectId | ✅ | Tenant isolation |
| code | String | ✅ | Auto-uppercased, unique per org |
| name | String | ✅ | |
| description | String | | |
| defaultPrice | Number | ✅ | Base price |
| defaultPriceMinor | Number | | v8.2 precision |
| currency | String | ✅ | Default: AED |
| category | String(enum) | ✅ | 13 categories |
| requiresTooth | Boolean | | FDI tooth required |
| applicableTeeth | [String] | | FDI tooth range |
| estimatedDuration | Number | | Minutes |
| isActive | Boolean | | Soft delete flag |
| version | Number | | Optimistic concurrency |

**Categories:** diagnostic, preventive, restorative, endodontic, periodontic, prosthodontic, orthodontic, oral_surgery, implant, cosmetic, pediatric, emergency, other

**Indexes:**
- `{ organizationId, code }` — unique
- `{ organizationId, category }`
- `{ organizationId, isActive }`
- `{ organizationId, name }` — text search

**API Endpoints:**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/v1/procedures` | procedures.read | List (paginated, filterable) |
| GET | `/api/v1/procedures/:id` | procedures.read | Get by ID |
| POST | `/api/v1/procedures` | procedures.create | Create |
| PUT | `/api/v1/procedures/:id` | procedures.update | Update (OAV) |
| DELETE | `/api/v1/procedures/:id` | procedures.delete | Soft delete |

### 24.4 Treatment Domain

**Model:** `Treatment` (`modules/treatments/models/Treatment.model.js`)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| organizationId | ObjectId | ✅ | Tenant isolation |
| branchId | ObjectId | ✅ | Branch scope |
| patientId | ObjectId | ✅ | |
| appointmentId | ObjectId | | Optional link |
| procedureId | ObjectId | ✅ | From Procedure catalog |
| toothNumber | String | | FDI notation |
| surfaces | [String(enum)] | | mesial, distal, buccal, lingual, occlusal, incisal |
| status | String(enum) | ✅ | FSM-controlled |
| notes | String | | |
| priceOverride | Number | | Override catalog price |
| performedBy | ObjectId | | Set on completion |
| performedAt | Date | | Set on completion |
| treatmentPlanId | ObjectId | | Plan reference |
| createdBy | ObjectId | ✅ | Audit |
| statusHistory | [Subdoc] | | Full audit trail |

**Treatment FSM:**

```
planned → in_progress → completed
    ↓          ↓
 cancelled  cancelled
```

| From | Allowed Transitions |
|------|-------------------|
| planned | in_progress, cancelled |
| in_progress | completed, cancelled |
| completed | (terminal) |
| cancelled | (terminal) |

**API Endpoints:**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/v1/treatments` | treatments.read | List (filterable) |
| GET | `/api/v1/treatments/:id` | treatments.read | Get by ID |
| POST | `/api/v1/treatments` | treatments.create | Create |
| PATCH | `/api/v1/treatments/:id/status` | treatments.update | FSM status change |

### 24.5 Treatment Plans

**Model:** `TreatmentPlan` (`modules/treatments/models/TreatmentPlan.model.js`)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| organizationId | ObjectId | ✅ | Tenant isolation |
| branchId | ObjectId | ✅ | |
| patientId | ObjectId | ✅ | |
| title | String | | Default: "Treatment Plan" |
| status | String(enum) | | draft, proposed, approved, in_progress, completed, cancelled |
| planItems | [PlanItem] | | Embedded subdocuments |
| estimatedTotal | Number | | Server-calculated pre-save |
| estimatedTotalMinor | Number | | v8.2 precision |
| createdBy | ObjectId | ✅ | |
| approvedBy | ObjectId | | |
| approvedAt | Date | | |

**PlanItem Schema:**

| Field | Type | Required |
|-------|------|----------|
| procedureId | ObjectId | ✅ |
| procedureName | String | ✅ |
| toothNumber | String | |
| surfaces | [String] | |
| estimatedPrice | Number | ✅ |
| priority | Number | |
| status | String(enum) | pending, in_progress, completed, cancelled, declined |
| treatmentId | ObjectId | Link to created Treatment |

**API Endpoints:**

| Method | Path | Permission |
|--------|------|-----------|
| GET | `/api/v1/treatments/plans` | treatments.read |
| GET | `/api/v1/treatments/plans/:id` | treatments.read |
| POST | `/api/v1/treatments/plans` | treatments.create |

### 24.6 Patient Invoice Engine

**Model:** `PatientInvoice` (`billingDomain/organizationFinance/models/PatientInvoice.model.js`)

**Existing implementation — 120 lines, enterprise-grade.**

Key features:
- **v8.2 Precision Extension** — all monetary fields have Minor Unit counterparts
- **Financial Immutability Guard** — pre-save middleware prevents monetary field modification on paid/voided invoices
- **Status FSM:** draft → issued → partially_paid → paid | voided
- **Geopolitical Sovereignty** — regionCode (immutable, uppercase) + index
- **FinancialOrchestrator** — 451-line transactional service handling:
  - Server-side total calculation
  - Diagnostic fee deduplication
  - Appointment validation
  - Payment allocation
  - Ledger entry creation
  - OAV version enforcement
  - Audit logging

**API Endpoints:**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/v1/invoices` | invoices.read | List (scoped read) |
| GET | `/api/v1/invoices/:id` | invoices.read | Get by ID |
| POST | `/api/v1/invoices` | invoices.create | Create via orchestrator |
| POST | `/api/v1/invoices/:id/void` | invoices.delete | Void (OAV enforced) |

### 24.7 Payment Engine

**Model:** `PatientPayment` (`billingDomain/organizationFinance/models/PatientPayment.model.js`)

**Existing implementation — 58 lines.**

Key features:
- Auto-allocation to invoice via `PaymentAllocation` model
- Invoice status auto-derivation via `deriveInvoiceStatus()`
- OAV version enforcement on linked invoice
- FinancialLedger entry creation per payment

**API Endpoints:**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/v1/payments` | payments.read | List (scoped) |
| GET | `/api/v1/payments/:id` | payments.read | Get by ID |
| POST | `/api/v1/payments` | payments.create | Record payment |

### 24.8 Financial Ledger

**Model:** `FinancialLedger` (`billingDomain/organizationFinance/models/FinancialLedger.model.js`)

Append-only ledger recording all financial mutations:
- INVOICE_CREATED
- INVOICE_VOIDED
- DIAGNOSTIC_FEE_CHARGED
- PAYMENT_RECORDED

All entries include: organizationId, patientId, branchId, performedByUserId, timestamp.

### 24.9 RBAC Extension

| Permission | org_admin | doctor | assistant | receptionist | lab_technician |
|-----------|-----------|--------|-----------|-------------|----------------|
| procedures.read | ✅ | ✅ | ✅ | ✅ | ❌ |
| procedures.create | ✅ | ✅ | ❌ | ❌ | ❌ |
| procedures.update | ✅ | ✅ | ❌ | ❌ | ❌ |
| procedures.delete | ✅ | ❌ | ❌ | ❌ | ❌ |
| treatments.read | ✅ | ✅ | ✅ | ✅ | ❌ |
| treatments.create | ✅ | ✅ | ❌ | ❌ | ❌ |
| treatments.update | ✅ | ✅ | ❌ | ❌ | ❌ |
| treatments.delete | ✅ | ❌ | ❌ | ❌ | ❌ |
| invoices.read | ✅ | ✅ | ✅ | ✅ | ❌ |
| invoices.create | ✅ | ✅ | ✅ | ✅ | ❌ |
| invoices.update | ✅ | ❌ | ✅ | ❌ | ❌ |
| invoices.delete | ✅ | ❌ | ❌ | ❌ | ❌ |
| payments.read | ✅ | ✅ | ✅ | ✅ | ❌ |
| payments.create | ✅ | ❌ | ❌ | ✅ | ❌ |
| payments.update | ✅ | ❌ | ❌ | ❌ | ❌ |
| payments.delete | ✅ | ❌ | ❌ | ❌ | ❌ |

### 24.10 Event Bus Integration

| Event | Trigger | Payload |
|-------|---------|---------|
| treatment.created | Treatment created | organizationId, treatmentId, patientId, procedureId, branchId |
| treatment.status_changed | FSM transition | organizationId, treatmentId, patientId, newStatus, previousStatus |
| treatment.completed | Treatment completed | organizationId, treatmentId, patientId, procedureId, branchId |
| financial_event (INVOICE_CREATED) | Invoice created | organizationId, patientId, branchId, amount, currency |
| financial_event (PAYMENT_RECORDED) | Payment recorded | organizationId, patientId, branchId, amount, currency |
| financial_event (INVOICE_VOIDED) | Invoice voided | organizationId, patientId, branchId, amount, currency |

---

## SECTION 25 — ORTHODONTIC INTELLIGENCE (PHASE 4)

### 25.1 Architecture Overview

The Orthodontic Intelligence module extends the Org Plane with:
1. **Orthodontic Case Management** — lifecycle FSM for orthodontic cases
2. **3D Scan Ingestion** — S3/object storage with processing pipeline
3. **AI Analysis Pipeline** — BullMQ → Python AI Engine → result persistence
4. **Tooth Segmentation** — PointNet++ FDI-numbered tooth detection
5. **Cephalometric Analysis** — landmark detection + angular/linear measurements
6. **Aligner Treatment Planning** — per-stage tooth movements, IPR, attachments

**PLANE ISOLATION:** This is an ORG-PLANE module. Platform plane MUST NOT import orthodontic models.

### 25.2 Orthodontic Case (Extended)

**Model:** `OrthodonticCase` (`orthodonticDomain/models/orthodonticCase.model.js`)

Pre-existing model (42 lines), extended with Phase 4 service layer.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| organizationId | ObjectId | ✅ | Tenant isolation |
| treatmentCaseId | ObjectId | ✅ | Clinical protocol link |
| malocclusionClass | String(enum) | ✅ | CLASS_I, CLASS_II_DIV_1, CLASS_II_DIV_2, CLASS_III |
| extractionPlan | String | | |
| estimatedDurationMonths | Number | | |
| retentionPlanned | String | | |
| scanFilePath | String | | AI engine scan directory |
| lastToothAnalysis | Subdoc | | Cached FDI analysis result |

**Case Lifecycle FSM:**

```
draft → diagnosis → treatment_planning → active → completed
```

| From | Allowed Transitions |
|------|-------------------|
| draft | diagnosis |
| diagnosis | treatment_planning, draft |
| treatment_planning | active, diagnosis |
| active | completed |
| completed | (terminal) |

**API Endpoints:**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/v1/orthodontic-cases` | orthodontics.read | List (paginated, filterable) |
| GET | `/api/v1/orthodontic-cases/:id` | orthodontics.read | Get by ID |
| POST | `/api/v1/orthodontic-cases` | orthodontics.create | Create |
| PATCH | `/api/v1/orthodontic-cases/:id/status` | orthodontics.update | FSM status change |

### 25.3 Scan File Storage

**Model:** `ScanFile` (`orthodontics/models/ScanFile.model.js`)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| organizationId | ObjectId | ✅ | Tenant isolation |
| caseId | ObjectId | ✅ | OrthodonticCase ref |
| patientId | ObjectId | ✅ | |
| branchId | ObjectId | ✅ | |
| fileType | String(enum) | ✅ | stl, ply, obj, dicom, npy, photo, cbct |
| fileKey | String | ✅ | S3/object storage key (unique) |
| originalFileName | String | | |
| fileSize | Number | | Bytes |
| archType | String(enum) | | upper, lower, both, full_face, unknown |
| localPath | String | | Resolved path for AI engine |
| processingStatus | String(enum) | | uploaded, queued, processing, processed, failed |
| uploadedBy | ObjectId | ✅ | |

**Storage Path Convention:**
```
org/{organizationId}/cases/{caseId}/scans/{fileKey}
```

**API Endpoints:**

| Method | Path | Permission |
|--------|------|-----------|
| GET | `/api/v1/orthodontic-cases/:caseId/scans` | orthodontics.read |
| POST | `/api/v1/orthodontic-cases/:caseId/scans` | orthodontics.create |

### 25.4 AI Analysis Pipeline

**Architecture:**

```
Node.js (API) → BullMQ aiAnalysisQueue → Python AI Engine Worker
                                              ↓
                                    ToothSegmentation / CephAnalysis (MongoDB)
```

**Queue:** `aiAnalysisQueue` (BullMQ)
- Connection: shared Redis via `redisClient.js`
- Retry: exponential backoff (10s, 20s, 40s)
- Timeout: 5 minutes per job
- Job types: `segmentation`, `ceph_analysis`

**Job Payload:**
```json
{
    "type": "TOOTH_SEGMENTATION | CEPH_ANALYSIS",
    "scanFileId": "ObjectId",
    "organizationId": "ObjectId",
    "caseId": "ObjectId",
    "modelVersion": "latest",
    "enqueuedAt": "ISO timestamp"
}
```

**API Endpoints:**

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/api/v1/orthodontic-cases/:caseId/analysis/segmentation` | orthodontics.create | Enqueue segmentation |
| GET | `/api/v1/orthodontic-cases/:caseId/analysis/segmentation` | orthodontics.read | Get results |
| POST | `/api/v1/orthodontic-cases/:caseId/analysis/cephalometric` | orthodontics.create | Enqueue ceph analysis |
| GET | `/api/v1/orthodontic-cases/:caseId/analysis/cephalometric` | orthodontics.read | Get results |

### 25.5 Tooth Segmentation

**Model:** `ToothSegmentation` (`orthodontics/models/ToothSegmentation.model.js`)

| Field | Type | Notes |
|-------|------|-------|
| organizationId | ObjectId | ✅ Required |
| caseId | ObjectId | ✅ Required |
| scanFileId | ObjectId | ✅ Required |
| modelVersion | String | AI model version |
| modelArchitecture | String | Default: PointNet++ |
| toothLabels | [ToothLabel] | Per-tooth: fdiNumber, status, confidence, centroid, bounding box, widths |
| boundaryEdges | [[Number]] | For mesh visualization |
| meanConfidence | Number | 0-1 |
| totalTeethDetected | Number | |
| missingTeeth | [Number] | FDI numbers |
| inferenceTimeMs | Number | |
| boltonAnalysis | Subdoc | anteriorRatio, overallRatio, excess |
| status | String(enum) | pending, completed, failed, outdated |

**FDI Numbering:**
- Maxillary: 11-18, 21-28
- Mandibular: 31-38, 41-48

### 25.6 Cephalometric Analysis

**Model:** `CephAnalysis` (`orthodontics/models/CephAnalysis.model.js`)

| Field | Type | Notes |
|-------|------|-------|
| organizationId | ObjectId | ✅ Required |
| caseId | ObjectId | ✅ Required |
| scanFileId | ObjectId | |
| analysisType | String(enum) | lateral_ceph, pa_ceph, cbct_3d, custom |
| modelVersion | String | |
| landmarks | [Landmark] | name, x, y, z, confidence, manuallyAdjusted |
| angles | Subdoc | SNA, SNB, ANB, FMA, IMPA, interincisalAngle, gonialAngle, wittsAppraisal |
| measurements | [Measurement] | name, value, unit, normalRange, interpretation |
| skeletalClassification | String(enum) | CLASS_I, CLASS_II, CLASS_III |
| growthPattern | String(enum) | normal, hyperdivergent, hypodivergent |
| diagnosisSummary | String | AI-generated |
| status | String(enum) | pending, completed, failed, reviewed |
| reviewedBy | ObjectId | |
| reviewedAt | Date | |

**Standard Angles:**

| Measurement | Normal Range | Unit |
|------------|-------------|------|
| SNA | 80-84° | degrees |
| SNB | 78-82° | degrees |
| ANB | 0-4° | degrees |
| FMA | 22-28° | degrees |
| Wits Appraisal | -1 to +1 mm | mm |

### 25.7 Aligner Treatment Planning

**Model:** `AlignerPlan` (`orthodontics/models/AlignerPlan.model.js`)

*Distinct from `AlignerProductionCase` (lab/B2B production tracking).*

| Field | Type | Notes |
|-------|------|-------|
| organizationId | ObjectId | ✅ Required |
| caseId | ObjectId | ✅ Required |
| patientId | ObjectId | ✅ Required |
| branchId | ObjectId | ✅ Required |
| stageCount | Number | Auto-calculated from stages |
| stages | [Stage] | Per-stage: movements, IPR, attachments |
| totalIpr | Number | Auto-calculated pre-save |
| estimatedDurationDays | Number | Auto-calculated |
| segmentationId | ObjectId | Link to ToothSegmentation |
| status | String(enum) | draft, proposed, approved, in_progress, completed, cancelled |
| createdBy | ObjectId | ✅ Required |

**Per-Stage Movement (6DOF per tooth):**
```javascript
{
    fdiNumber: 21,
    translation: { mesialDistal: 0.3, buccoLingual: 0.1, intrusion: 0.2, extrusion: 0 },
    rotation: { torque: 2.5, tipMesialDistal: 1.0, rotationBuccoLingual: 0 }
}
```

**API Endpoints:**

| Method | Path | Permission |
|--------|------|-----------|
| GET | `/api/v1/orthodontic-cases/:caseId/aligner-plans` | orthodontics.read |
| POST | `/api/v1/orthodontic-cases/:caseId/aligner-plans` | orthodontics.create |
| GET | `/api/v1/orthodontic-cases/aligner-plans/:id` | orthodontics.read |

### 25.8 Event Bus Integration

| Event | Trigger | Payload |
|-------|---------|---------|
| scan.uploaded | Scan registered | organizationId, caseId, scanFileId, fileType |
| analysis.started | AI job enqueued | organizationId, caseId, scanFileId, analysisType, jobId |
| analysis.completed | AI job finished | organizationId, caseId, scanFileId, analysisType, resultId |
| aligner.plan_created | Plan created | organizationId, caseId, planId, stageCount |

### 25.9 Pre-existing Python Bridge

Two existing controllers provide synchronous Python → Node.js bridges:

1. **orthodonticTeeth.controller.js** (274 lines) — spawns `meshnet/tooth_numbering/cli_runner.py`
2. **landmarks.controller.js** (314 lines) — spawns `meshnet/landmarks/landmark_cli.py`

These operate at `/api/v1/org/case/:caseId/teeth` and `/api/v1/org/case/:caseId/landmarks` respectively
and remain separate from the async BullMQ-based AI pipeline introduced in Phase 4.

### 25.10 RBAC (Pre-existing)

orthodontics.* permissions already existed in `orgPermissions.js`:

| Permission | org_admin | doctor | assistant | receptionist | lab_technician |
|-----------|:---------:|:------:|:---------:|:------------:|:--------------:|
| orthodontics.read | ✅ | ✅ | ✅ | ❌ | ❌ |
| orthodontics.create | ✅ | ✅ | ❌ | ❌ | ❌ |
| orthodontics.update | ✅ | ✅ | ❌ | ❌ | ❌ |
| orthodontics.delete | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## SECTION 26 — PATIENT PORTAL & REMOTE MONITORING (PHASE 5)

### 26.1 Architecture Overview

The Patient Portal extends the Org Plane with:
1. **Portal Authentication** — email+password, magic link, OTP (reuses `PatientUser` + `PortalInvite`)
2. **Aligner Progress Tracking** — per-stage 4-state FSM
3. **Photo Upload System** — 6 photo types, S3 storage, AI analysis pipeline
4. **Remote Monitoring Sessions** — patient submits → doctor reviews (4-state FSM)
5. **Patient Messaging** — bidirectional text/image messaging with read tracking
6. **Notification Integration** — reuses `notificationDomain` BullMQ infrastructure

**PLANE ISOLATION:** ORG-PLANE module. Platform plane MUST NOT import portal models.

**AUTH SEPARATION:**
- Patient routes: `patientProtect` → `organizationContext`
- Staff routes: `orgProtect` → `organizationContext` → `requireOrgPermission`

### 26.2 Pre-existing Portal Infrastructure

| Component | Lines | Location | Notes |
|-----------|-------|----------|-------|
| PatientUser model | 50 | `patientDomain/access/patientUser.model.js` | Reused without modification |
| PortalInvite model | 40 | `patientDomain/access/portalInvite.model.js` | Magic link + OTP storage |
| patientProtect middleware | 60 | `patientDomain/access/patientProtect.js` | JWT type=patient + tokenVersion |
| patientPortal.controller | 81 | `patientPortal/patientPortal.controller.js` | Dashboard, appointments, invoices |
| patientPortal.routes | 14 | `patientPortal/patientPortal.routes.js` | /api/patient/* (pre-existing) |
| notificationDomain | — | `notificationDomain/*` | Full BullMQ notification pipeline |

### 26.3 Portal Authentication

**Service:** `patientPortal/services/portalAuth.service.js`

| Method | Description | Security |
|--------|-------------|---------|
| loginWithPassword | email + bcrypt | Invalid credentials give identical error (enum prevention) |
| requestMagicLink | SHA-256 hashed token | 30-minute expiry |
| verifyMagicLink | Token lookup + usedAt | Single-use |
| requestOtp | 6-digit numeric OTP | 10-minute expiry, max 5 attempts |
| verifyOtp | SHA-256 hash comparison | Rate-limited via otpAttempts |
| logout | tokenVersion++ | Invalidates all existing JWTs |

**JWT payload (type=patient):**
```json
{
    "patientUserId": "ObjectId",
    "organizationId": "ObjectId",
    "patientId": "ObjectId",
    "type": "patient",
    "tokenVersion": 0
}
```

**API Endpoints (mounted at `/api/v1/portal/auth`):**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/portal/auth/login` | None | Password login |
| POST | `/portal/auth/magic-link/request` | None | Request magic link |
| POST | `/portal/auth/magic-link/verify` | None | Verify magic link |
| POST | `/portal/auth/otp/request` | None | Request OTP |
| POST | `/portal/auth/otp/verify` | None | Verify OTP |
| POST | `/portal/auth/logout` | patientProtect | Global logout |

### 26.4 Aligner Progress

**Model:** `AlignerProgress` (`patientPortal/models/AlignerProgress.model.js`)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| organizationId | ObjectId | ✅ | Tenant isolation |
| patientId | ObjectId | ✅ | |
| caseId | ObjectId | ✅ | OrthodonticCase ref |
| alignerPlanId | ObjectId | | AlignerPlan ref |
| stageNumber | Number | ✅ | Min 1 |
| status | String(enum) | | pending, active, completed, skipped |
| wearDurationDays | Number | | Default: 14 |
| patientPainLevel | Number | | 0–10 |
| patientWearHours | Number | | 0–24 |
| monitoringSubmitted | Boolean | | Default: false |

**Stage FSM:**
```
pending → active → completed
                 → skipped
```

**API Endpoints:**

| Method | Path | Auth |
|--------|------|------|
| GET | `/portal/progress` | patientProtect |
| PATCH | `/portal/progress/:id/activate` | patientProtect |
| PATCH | `/portal/progress/:id/complete` | patientProtect |

### 26.5 Photo Upload System

**Model:** `PatientPhoto` (`patientPortal/models/PatientPhoto.model.js`)

**Storage path:** `org/{organizationId}/patients/{patientId}/photos/{fileKey}`
(virtual `storagePath` computed on read)

| Photo Type | Description |
|-----------|-------------|
| front | Front face view |
| left | Left profile |
| right | Right profile |
| bite | Bite occlusion |
| upper | Upper arch |
| lower | Lower arch |

**AI Analysis Flow:**
```
POST /portal/photos
    → PatientPhoto created (aiAnalysisStatus: queued)
    → photoAnalysisQueue.add("photo_analysis", { ... })
    → HTTP 201 + jobId
    → Python AI worker processes
    → PatientPhoto.aiFindings updated
```

**AI Findings:**
- `alignerFit`: good | poor | unknown
- `toothMovement`: on_track | behind | unknown
- `confidence`: 0–1

**API Endpoints:**

| Method | Path | Auth |
|--------|------|------|
| POST | `/portal/photos` | patientProtect |
| GET | `/portal/photos` | orgProtect + portal.read |

### 26.6 Remote Monitoring Sessions

**Model:** `MonitoringSession` (`patientPortal/models/MonitoringSession.model.js`)

**Session FSM:**
```
submitted → under_review → approved
                         → revision_required → submitted (resubmit)
```

| Transition | Who | Action |
|-----------|-----|--------|
| submitted → under_review | Doctor begins review | pulls session into review |
| under_review → approved | Doctor approves | sends patient notification |
| under_review → revision_required | Doctor requires changes | sends patient revision details |
| revision_required → submitted | Patient resubmits | restarts cycle |

**API Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/portal/monitoring` | patientProtect | Submit session |
| GET | `/portal/monitoring` | orgProtect + portal.read | List sessions |
| GET | `/portal/monitoring/:id` | orgProtect + portal.read | Get with photos |
| PATCH | `/portal/monitoring/:id/review` | orgProtect + monitoring.review | Doctor review |

### 26.7 Patient Messaging

**Model:** `PatientMessage` (`patientPortal/models/PatientMessage.model.js`)

| Field | Notes |
|-------|-------|
| senderType | patient | doctor | system |
| messageType | text | image | system |
| isReadByPatient | Read tracking for patient |
| isReadByDoctor | Read tracking for doctor |
| attachments | Array of S3 keys |

**API Endpoints:**

| Method | Path | Auth |
|--------|------|------|
| POST | `/portal/messages` | patientProtect |
| POST | `/portal/messages/staff` | orgProtect + portal.manage |
| GET | `/portal/messages` | orgProtect + portal.read |

### 26.8 Photo Analysis Queue

**Queue:** `photoAnalysisQueue` (BullMQ)

| Setting | Value |
|---------|-------|
| Attempts | 3 |
| Backoff | Exponential — 5s, 10s, 20s |
| Timeout | 2 minutes per photo |
| On complete | Keep 300 / 24h |
| On fail | Keep 100 / 7d |

### 26.9 Notification Integration

Reuses pre-existing `notificationDomain`:

| Event | Trigger | Priority |
|-------|---------|---------|
| MONITORING_SUBMITTED | Patient submits session | normal |
| DOCTOR_REVIEW_COMPLETED | Doctor approves/revises | high |

### 26.10 Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| stage.reminder_sent | Stage completed | organizationId, patientId, caseId, stageNumber |
| photo.uploaded | Photo registered | organizationId, patientId, caseId, photoId, photoType |
| doctor.review_completed | Session reviewed | organizationId, patientId, sessionId, status |
| monitoring.submitted | Session created | (via notification service) |

### 26.11 RBAC

| Permission | org_admin | doctor | assistant | receptionist | lab_technician |
|-----------|:---------:|:------:|:---------:|:------------:|:--------------:|
| portal.read | ✅ | ✅ | ✅ | ✅ | ❌ |
| portal.manage | ✅ | ❌ | ❌ | ❌ | ❌ |
| monitoring.review | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## SECTION 27 — FRONTEND ARCHITECTURE AUDIT (ORG PLANE)

### 27.1 Audit Summary

**Date:** 2026-03-12
**Scope:** Organization Plane UI
**Compatibility Score:** 7.4 / 10 — COMPATIBLE with remediation
**Platform Plane:** NOT modified, verified isolated

### 27.2 Technology Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19.2 | UI framework |
| Vite | 7.3 | Build tool |
| Tailwind CSS | 3.4 | Styling |
| React Router | 7.13 | Routing |
| Axios | 1.13 | HTTP client |
| Zustand | 5.0 | State (available, limited use) |
| @tanstack/react-table | 8.21 | Table rendering |
| Vitest | 4.0 | Testing |
| Playwright | 1.58 | E2E testing |

### 27.3 Architecture Structure

| Directory | Purpose | Status |
|-----------|---------|--------|
| `app/` | Auth pages | ✅ |
| `layouts/org/` | OrgLayout, OrgHeader, OrgGlobalActionBar | ✅ |
| `design-system/` | Tokens, 11 components, barrel export | ✅ |
| `modules/` | Domain modules (6 modules) | ⚠️ Partial |
| `org/` | Org-internal modules, hooks | ⚠️ Split location |
| `pages/org/` | Page shells (8 pages) | ⚠️ Should be in modules |
| `services/` | Org-plane API layer | ⚠️ Incomplete |
| `platform/` | Isolated platform plane | ✅ |

### 27.4 Compliance Results

| Check | Result | Details |
|-------|--------|---------|
| Tenant Isolation | ✅ PASS | Zero `organizationId` in org request payloads |
| Plane Separation | ✅ PASS | Zero cross-plane imports |
| RBAC Enforcement | ⚠️ PARTIAL | 1 violation: `roleName === "doctor"` in CalendarPage |
| Route Centralization | ✅ PASS | All routes in `App.jsx` |
| Design System | ⚠️ PARTIAL | Duplicate components in `components/ui/` |
| API Layer | ⚠️ PARTIAL | Only 3/8+ domain services exist |

### 27.5 Module Structure Finding

Business code is scattered across 3 locations:
1. `modules/` — calendar, patientDomain, notificationDomain, settings
2. `org/modules/` — patients (tabs + profile layout)
3. `pages/org/` — 8 page shells

**Recommended:** Consolidate into `modules/` with per-domain subfolders.

### 27.6 Remediation Tasks

| Task | Priority | Effort |
|------|----------|--------|
| TASK-FE-AUDIT-001: Module Structure Consolidation | P1 | Medium |
| TASK-FE-AUDIT-002: API Layer Centralization | P1 | Medium |
| TASK-FE-AUDIT-003: RBAC Guard Hardening | P1 | Low |
| TASK-FE-AUDIT-004: Design System Deduplication | P2 | Low |
| TASK-FE-AUDIT-005: React Query Integration | P3 | Medium |

---

## SECTION 28 — FRONTEND ARCHITECTURE REFACTOR (ORG PLANE)

### 28.1 Overview

**Date:** 2026-03-12
**Scope:** Organization Plane UI normalization
**Platform UI:** NOT modified

### 28.2 Design System Consolidation

New primitives added to `design-system/components/`:
- `Input.jsx` — label, icon, error state, disabled
- `FeatureItem.jsx` — icon + title for feature lists
- `StatsBadge.jsx` — icon + number + label

Updated barrel export: `design-system/index.js` (v2.1)

Legacy `components/ui/` converted to thin re-exports from design system.
This preserves backward compatibility for platform imports that cannot be modified.

### 28.3 Domain API Services

| Service | Location | Auth Instance |
|---------|----------|---------------|
| `treatments.api.js` | `services/` | org api.js |
| `invoices.api.js` | `services/` | org api.js |
| `orthodontics.api.js` | `services/` | org api.js |
| `portalAuth.api.js` | `modules/patientDomain/portal/services/` | portalApi |
| `portalMonitoring.api.js` | `modules/patientDomain/portal/services/` | portalApi + staffApi |
| `portalMessages.api.js` | `modules/patientDomain/portal/services/` | portalApi + staffApi |

All services enforce: **organizationId is NEVER sent, derived from JWT.**

### 28.4 RequireOrgPermission Route Guard

**Location:** `org/guards/RequireOrgPermission.jsx`

```jsx
<RequireOrgPermission permission="patients.read">
  <PatientsPage />
</RequireOrgPermission>
```

Behavior:
- Uses `usePermission()` hook from `@/org/hooks/usePermission`
- Shows styled access-denied UI with dashboard fallback
- Prevents content flash during auth loading (returns null while loading)
- Platform uses `RequireCapability` — separate, isolated guard

### 28.5 Route Guard Application

| Route | Permission |
|-------|-----------|
| `/org/dashboard` | None (accessible to all authenticated) |
| `/org/patients` | `patients.read` |
| `/org/patients/new` | `patients.create` |
| `/org/calendar` | `appointments.read` |
| `/org/appointments` | `appointments.read` |
| `/org/finance` | `accounting.read` |
| `/org/inventory` | `inventory.read` |
| `/org/analytics` | `analytics.read` |
| `/org/settings` | `settings.read` |

### 28.6 RBAC Violation Fix

**Before:**
```js
const isDentist = roleName === "doctor";  // ❌ inline role check
```

**After:**
```js
const isDentist = usePermission("calendar.selfFilterOnly");  // ✅ permission-based
```

New permission `calendar.selfFilterOnly` added to `orgPermissions.js`.
Assigned to `doctor` role only.

---

## SECTION 29 — FRONTEND PHASE 1: ORG RUNTIME + GOVERNANCE + PROFILE

### 29.1 Overview

**Date:** 2026-03-12
**Scope:** Organization Plane UI — Runtime, Admin Governance, User Identity
**Platform UI:** NOT modified

### 29.2 Module Structure

```
modules/org/
├── users/
│   ├── api/users.api.js
│   ├── components/UsersTable.jsx
│   ├── components/CreateUserModal.jsx
│   ├── components/EditUserModal.jsx
│   ├── components/BranchAccessSelector.jsx
│   └── pages/UsersPage.jsx
├── branches/
│   ├── api/branches.api.js
│   ├── components/BranchTable.jsx
│   ├── components/BranchEditorModal.jsx
│   ├── components/WorkingHoursEditor.jsx
│   └── pages/BranchesPage.jsx
├── roles/
│   └── pages/RolesPage.jsx
└── profile/
    ├── api/auth.api.js
    ├── components/ChangePasswordForm.jsx
    ├── components/ActiveSessionsPanel.jsx
    └── pages/ProfilePage.jsx
```

### 29.3 API Services

| Service | Location | Endpoints |
|---------|----------|-----------|
| `users.api.js` | `modules/org/users/api/` | GET/POST/PATCH/DELETE /v1/users, GET /v1/roles |
| `branches.api.js` | `modules/org/branches/api/` | GET/POST/PATCH/DELETE /v1/branches |
| `auth.api.js` | `modules/org/profile/api/` | PATCH /auth/change-password, GET /auth/sessions, POST /auth/logout |

### 29.4 Routes Added

| Route | Guard | Page |
|-------|-------|------|
| `/org/settings/users` | `users.read` | UsersPage |
| `/org/settings/branches` | `branches.read` | BranchesPage |
| `/org/settings/roles` | `users.read` | RolesPage |
| `/org/profile` | None (self-access) | ProfilePage |

### 29.5 Sidebar Updates

Added admin navigation section with separator:
- Staff (UserGroupIcon) → `/org/settings/users`
- Branches (BuildingOfficeIcon) → `/org/settings/branches`
- Roles (ShieldCheckIcon) → `/org/settings/roles`

### 29.6 Profile System

- **ProfilePage**: tabbed UI (Profile / Security / Sessions)
- **ChangePasswordForm**: current + new + confirm validation
- **ActiveSessionsPanel**: session list, current device highlight, terminate/logout-all
- **OrgHeader**: enhanced profile dropdown with role badge, My Profile link

### 29.7 RBAC Role Matrix Viewer

Read-only permission matrix displaying 5 roles × 10 permission groups.
Data sourced from static mirror of `orgPermissions.js` ORG_ROLE_PERMISSIONS map.

---

## SECTION 30 — FRONTEND PHASE 2: PATIENT DOMAIN UI

### 30.1 Overview

**Date:** 2026-03-12
**Scope:** Patient Management UI for clinic staff
**Platform UI:** NOT modified

### 30.2 Module Structure

```
modules/org/patients/
├── api/patients.api.js              ← Canonical CRUD + clinical + documents
├── pages/
│   ├── PatientsPage.jsx             ← Enhanced directory (table/card toggle, search, pagination)
│   └── PatientProfilePage.jsx       ← Re-exports existing PatientLayout
└── components/
    ├── PatientsTable.jsx            ← Table view with avatars, codes, gender badges
    ├── PatientSearchBar.jsx         ← Search input component
    ├── CreatePatientModal.jsx       ← Quick inline registration
    └── tabs/
        └── TreatmentsTab.jsx        ← New tab for treatment records
```

### 30.3 API Service

**`patients.api.js`** wraps `/v1/patient/domain` endpoints:
- `list`, `get`, `create`, `update`, `delete` — patient CRUD
- `updateClinical` — clinical/medical history
- `getAppointments` — patient appointment history
- `getTreatments` — patient treatment records
- `getDocuments`, `uploadDocument`, `deleteDocument` — document vault

### 30.4 Enhanced Pages

**PatientsPage** (replaces `pages/org/Patients.jsx`):
- Table/card view toggle
- Search by name, phone, patient code
- Pagination with page navigation
- RBAC-gated create button

**PatientProfilePage**: Re-exports existing `PatientLayout` which provides:
- Aggregate data fetching with real-time socket updates
- Patient header with identity + risk badges + quick actions
- 7-tab navigation: Overview, Clinical, Orthodontic, Treatments, Appointments, Financial, Documents

### 30.5 Enhanced Tabs

| Tab | Status | Enhancement |
|-----|--------|-------------|
| Overview | Existing | Unchanged |
| Clinical | Existing | Unchanged |
| Orthodontic | Existing | Unchanged |
| **Treatments** | **NEW** | Fetches treatment records via API, displays procedure/tooth/cost/status |
| Appointments | **ENHANCED** | Now fetches real data via API, shows status badges, date/time, doctor |
| Financial | Existing | Unchanged |
| Documents | **ENHANCED** | Now supports upload/view/delete, file type icons, RBAC-gated actions |

### 30.6 Router Changes

- `/org/patients` → now serves `PatientsPage` from `modules/org/patients/`
- `/org/patients/:id/treatments` → new route for TreatmentsTab

---

## SECTION 31 — FRONTEND PHASE 3: APPOINTMENT & CALENDAR UI

### 31.1 Overview

**Date:** 2026-03-12
**Scope:** Clinic Scheduling Interface
**Platform UI:** NOT modified

### 31.2 Module Structure

```
modules/org/calendar/
├── api/appointments.api.js          ← CRUD + status + calendar + availability + doctors
├── pages/
│   └── CalendarPage.jsx             ← Enhanced scheduling page (filters, create/edit)
└── components/
    ├── CalendarView.jsx             ← Daily grid (time axis + chair columns + now indicator)
    ├── AppointmentCard.jsx          ← Time-positioned block with status colors
    ├── AppointmentStatusBadge.jsx   ← 10-status color map (xs/sm/lg sizes)
    ├── CreateAppointmentDrawer.jsx  ← Slide-in: slot picker, duration, notes, conflicts
    ├── EditAppointmentDrawer.jsx    ← Slide-in: details, status transitions, history
    ├── DoctorFilter.jsx             ← Doctor selector dropdown
    └── BranchFilter.jsx             ← Branch selector dropdown
```

### 31.3 API Service

**`appointments.api.js`** wraps `/appointments` endpoints:
- `list`, `get`, `create`, `update`, `delete` — appointment CRUD
- `updateStatus` — status transitions with backend validation
- `getCalendar` — day view aggregation by branch/chair
- `getAvailability` — time slot availability grid
- `getDoctors` — doctor listing for filter

### 31.4 Calendar Page Features

- **Daily schedule view** with branch-grouped chair columns
- **Date navigation** — previous/next day, date picker, Today button
- **Doctor filter** — dropdown (hidden for doctor role via self-filter)
- **Self-filter rule** — doctors only see their own appointments via `calendar.selfFilterOnly` permission
- **Now indicator** — red line showing current time
- **RBAC-gated create** — only users with `appointments.create` see "+ New Appointment"

### 31.5 Appointment Status System

| Status | Color | Transitions To |
|--------|-------|----------------|
| open | Blue | confirmed, cancelled, no-show |
| confirmed | Teal | checked-in, cancelled, no-show |
| checked-in | Cyan | in-progress, cancelled |
| in-progress | Purple | completed, cancelled |
| completed | Emerald | — (terminal) |
| delayed | Orange | confirmed, cancelled |
| cancelled | Red | — (terminal) |
| no-show | Pink | — (terminal) |
| waiting-list | Amber | open |

### 31.6 Conflict Detection

CreateAppointmentDrawer includes:
- Occupied slot visualization (greyed out, not clickable)
- Backend conflict response handling (dentist/chair conflicts)
- Force-create option with explicit user confirmation

### 31.7 Router Changes

- `/org/calendar` → now serves `CalendarPage` from `modules/org/calendar/`

---

## SECTION 32 — FRONTEND PHASE 4: CLINICAL CORE UI

### 32.1 Overview

**Date:** 2026-03-12
**Scope:** Clinical Treatment Interface for Dentists
**Platform UI:** NOT modified

### 32.2 Module Structure

```
modules/org/clinical/
├── api/treatments.api.js            ← CRUD + procedures + notes + documents
├── pages/
│   └── TreatmentsPage.jsx           ← Org-wide treatment records (search, filter, table)
└── components/
    ├── TreatmentStatusBadge.jsx     ← 5-status color map (xs/sm/lg)
    ├── TreatmentTimeline.jsx        ← Vertical timeline with status icons
    ├── ProcedureSelector.jsx        ← 14 default procedures; grouped by category; searchable
    ├── CreateTreatmentDrawer.jsx    ← Slide-in: procedure, tooth (FDI), status, cost, notes
    ├── ClinicalNotes.jsx            ← Notes list + add form (RBAC: clinical.update)
    └── XrayViewer.jsx               ← Image viewer: zoom, rotate, fullscreen, thumbnails
```

### 32.3 API Service

**`treatments.api.js`** wraps `/v1/treatments` endpoints:
- `list`, `get`, `create`, `update`, `delete` — treatment CRUD
- `getProcedures` — load procedure catalog from backend
- `getNotes` — patient clinical notes
- `addNote` — append clinical note
- `getDocuments` — patient document list (for X-ray viewer)

### 32.4 Treatments Page

**TreatmentsPage** (`/org/treatments`):
- Org-wide treatment list with search & status filter pills
- Table: Patient, Procedure, Tooth (#FDI), Doctor, Date, Status
- Paginated (25 per page)
- RBAC-gated "+ New Treatment" button (`treatments.create`)
- Click patient name or "View →" to navigate to patient profile

### 32.5 Treatment Timeline

Vertical timeline component used inside PatientProfile Treatments tab:
- Reverse-chronological sort
- Status icon per entry: ✓ completed, ⏰ in_progress, ✕ cancelled, ○ planned
- Shows: procedure name, tooth (#FDI), doctor, date, cost, notes
- RBAC-gated "+ Add Treatment" opens `CreateTreatmentDrawer`

### 32.6 Procedure Selector

14 default procedures grouped by category:
- **Preventive**: Cleaning & Scaling, Dental Sealant
- **Restorative**: Composite Filling
- **Endodontic**: Root Canal Treatment
- **Surgical**: Tooth Extraction, Dental Implant
- **Prosthetic**: Dental Crown, Bridge, Denture Fitting
- **Cosmetic**: Veneer, Whitening
- **Orthodontic**: Orthodontic Consultation
- **Diagnostic**: Dental X-Ray
- **General**: Other Procedure
- Loads from backend `/v1/procedures`, falls back to defaults

### 32.7 X-ray Viewer

- Supports: JPG, PNG, WebP, DCM, TIFF
- Controls: Zoom in/out, Rotate 90°, Reset, Fullscreen
- Multi-image thumbnail strip (auto-selects first image)
- Non-image documents shown as downloadable links

### 32.8 Router & Sidebar Changes

- `/org/treatments` → `TreatmentsPage` (new route, `treatments.read` guard)
- `Sidebar.jsx` → Added Treatments nav item (BeakerIcon, position 3)
- `TreatmentsTab` (patient profile) → Now embeds TreatmentTimeline + XrayViewer

---

## SECTION 33 — FRONTEND PHASE 5: FINANCE & BILLING UI

### 33.1 Overview

**Date:** 2026-03-12
**Scope:** Finance & Billing Interface for receptionists and clinic admins
**Platform UI:** NOT modified

### 33.2 Module Structure

```
modules/org/finance/
├── api/invoices.api.js            ← CRUD + payments + refund + revenue summary/breakdown
├── pages/
│   └── InvoicesPage.jsx           ← Finance hub: stats, chart, invoice table
└── components/
    ├── PaymentStatusBadge.jsx     ← 6-status color map (xs/sm/lg)
    ├── InvoiceViewer.jsx          ← Slide-in: items, totals, history, void/pay/refund
    ├── RecordPaymentModal.jsx     ← Modal: amount, 8 methods, reference, notes
    └── RevenueChart.jsx           ← Recharts AreaChart: billed vs collected (daily/monthly)
```

**Also added to clinical module:**
```
modules/org/clinical/components/TreatmentBillingPanel.jsx  ← Create invoice from treatment
```

### 33.3 API Service

**`invoices.api.js`** wraps `/v1/invoices`:
- `list`, `get`, `create`, `update`, `void` — invoice CRUD
- `getItems` — invoice line items
- `recordPayment` — POST /:id/payments
- `refund` — POST /:id/refund
- `getRevenueSummary` — totals for stats cards
- `getRevenueBreakdown` — time-series for chart

### 33.4 Invoices Page Features

**Finance hub** (`/org/invoices`):
- **Stats cards**: Total Billed, Total Collected, Outstanding, Overdue
- **Revenue chart**: Recharts AreaChart (daily/monthly toggle, billed vs collected)
- **Invoice table**: Invoice #, Patient, Date, Total, Paid, Balance, Status
- **Status filter pills**: all / pending / partial / paid / overdue / refunded / voided
- **Search**: patient name, invoice number
- **Pagination**: 20 per page
- **Row action**: opens InvoiceViewer

### 33.5 Invoice Viewer

Slide-in panel displaying full invoice detail:
- Patient info, branch, dates
- Line items table (Description, Qty, Unit Price, Total)
- Payment totals block (subtotal, discount, paid, balance)
- Payment history list
- Notes
- **Actions** (RBAC-gated): Record Payment, Issue Refund, Void
- **Print** support via `window.print()`

### 33.6 Payment Recording

**RecordPaymentModal** fields:
- Amount input with currency prefix
- "Pay full" shortcut to pre-fill balance
- 8 payment methods grid: Cash, Credit Card, Debit Card, Bank Transfer, Insurance, Cheque, Mobile Wallet, Other
- Optional reference number
- Optional notes

### 33.7 Payment Status System

| Status | Color |
|--------|-------|
| pending | Amber |
| paid | Emerald |
| partial | Blue |
| refunded | Purple |
| voided | Gray |
| overdue | Red |

### 33.8 Revenue Analytics

**RevenueChart** — Recharts `AreaChart`:
- Daily and monthly period toggle
- Billed (blue) vs Collected (green) dual-area
- Custom tooltip (amount + currency)
- Gradient fills
- Empty state with placeholder structure when API returns no data

### 33.9 Router & Sidebar Changes

- `/org/invoices` → `InvoicesPage` (new canonical route, `accounting.read` guard)
- `/org/finance` → legacy Finance page preserved unchanged
- `Sidebar.jsx` Finance nav item now points to `/org/invoices`

---

## SECTION 34 — FRONTEND PHASE 6: ORTHODONTICS & AI MODULE UI

### 34.1 Overview

**Date:** 2026-03-12
**Scope:** Orthodontic Case Management + AI Scan Visualization
**Platform UI:** NOT modified
**Bug fixed:** InvoicesPage naming collision resolved (OrgInvoicesPage alias)

### 34.2 Module Structure

```
modules/org/orthodontics/
├── api/orthodontics.api.js
├── pages/
│   ├── OrthodonticCasesPage.jsx       — case list: search, status filter, table
│   └── OrthodonticCasePage.jsx        — 3-tab detail: Overview / Scans & AI / Notes
└── components/
    ├── CaseStatusBadge.jsx            — 7 statuses
    ├── CreateOrthoDrawer.jsx          — slide-in new case form
    ├── ScanViewer3D.jsx               — canvas dental arch viewer with FDI arcs
    ├── ScanUploader.jsx               — drag-and-drop STL/PLY + progress + AI trigger
    ├── SegmentationOverlay.jsx        — AI result: tooth grid, confidence, measurements
    ├── StageTimeline.jsx              — vertical done/current/upcoming timeline
    ├── AlignerProgress.jsx            — SVG ring progress + mark complete
    └── CaseNotes.jsx                  — add/view notes (RBAC: orthodontics.update)
```

### 34.3 API Service

`orthodontics.api.js` wraps `/v1/orthodontic-cases`:
- `list`, `get`, `create`, `update` — case CRUD
- `getScans`, `uploadScan(onUploadProgress)` — scan upload with progress
- `requestAnalysis(caseId, scanId)` — trigger AI segmentation
- `getAlignerPlans`, `createAlignerPlan`, `updateAlignerPlan`
- `addNote` — PATCH case with note

### 34.4 3D Viewer Architecture

Canvas 2D (no Three.js dependency required):
- FDI quadrant arches rendered as curved stroke paths with per-tooth dots
- AI segmentation coordinate overlay
- Rotation/zoom/fullscreen controls
- Three.js upgrade: fully drop-in compatible (install `three`, swap canvas render)

### 34.5 Router & Sidebar Changes

- `/org/orthodontics` — OrthodonticCasesPage (orthodontics.read)
- `/org/orthodontics/:caseId` — OrthodonticCasePage (orthodontics.read)
- Sidebar: Orthodontics nav item added (SparklesIcon, position 4)
- Bug fix: OrgInvoicesPage alias prevents import collision with portal InvoicesPage

---

## SECTION 35 — FRONTEND PHASE 7: PATIENT PORTAL UI

### 35.1 Overview

**Date:** 2026-03-12
**Scope:** Patient Self-Service Portal
**Org UI:** NOT modified
**Platform UI:** NOT modified
**Auth:** Portal JWT (`patientToken`) — PortalAuthGuard — NOT org RBAC

### 35.2 Existing Foundation (Pre-existing)

Already implemented in `modules/patientDomain/portal/`:
- `PortalLayout.jsx` — sidebar nav, mobile drawer, logout
- `PortalLoginPage.jsx` — email/password form (was mock — now upgraded)
- `PortalDashboard.jsx` — stats + upcoming appointment + financial overview
- `BookingPage.jsx` — 4-step booking wizard (branch → date → slot → confirm)
- `InvoicesPage.jsx` — invoice table with status badges + download
- `portalAuth.api.js` — login, OTP, magic-link, logout
- `portalMessages.api.js` — patient send/list + staff API
- `portalMonitoring.api.js` — aligner progress, photos, monitoring sessions
- `patientDomain.api.js` — isolated axios instances (portalApi + staffApi)
- `AuthGuards.jsx` — PortalAuthGuard (JWT decode, type enforcement, expiry check)

### 35.3 New Phase 7 Files

```
modules/patientDomain/portal/
├── api/portal.api.js                   ← Canonical portal API service (Phase 7)
├── hooks/usePortalAuth.js              ← Portal auth hook (validate + logout)
├── pages/
│   ├── PortalLoginPage.jsx             ← UPGRADED: real API login + OTP dual-mode
│   ├── PortalAppointmentsPage.jsx      ← NEW: appointment cards (upcoming/past/all)
│   ├── PortalTreatmentsPage.jsx        ← NEW: treatment progress + aligner + photos
│   └── PortalMessagesPage.jsx          ← NEW: page wrapper for chat UI
├── components/
│   ├── AlignerPhotoUploader.jsx        ← NEW: multi-photo upload with preview grid
│   └── PortalMessages.jsx              ← NEW: chat bubble UI, auto-poll, Enter-to-send
└── layout/PortalLayout.jsx             ← UPGRADED: added Treatments + Messages nav
```

### 35.4 Portal Login Upgrade

Original was a mock `setTimeout`. Now upgraded to:
- **Password mode**: calls `portalAuthApi.login()` → stores `patientToken` → navigates to dashboard
- **OTP mode**: two-step (request code → verify code) via `portalAuthApi.requestOtp/verifyOtp()`
- Dual-mode tab switcher (Password / OTP Code)
- Error surface with API error propagation

### 35.5 Appointments Page

- Fetches from `GET /portal/appointments?filter=upcoming|past|all`
- Card-based layout with date block, doctor, branch, time, status badge
- Status badges: Confirmed / Scheduled / Pending / Completed / Cancelled / No Show

### 35.6 Treatments Page

Collapsible `TreatmentCard` components:
- Header: procedure type, doctor, start date, status badge
- Stage progress bar (multi-segment)
- Expandable section:
  - Stage timeline (done/current/upcoming)
  - Aligner progress bar (% complete, aligner count)
  - Doctor notes
  - AlignerPhotoUploader (when `requiresPhotoUpload=true`)

### 35.7 Aligner Photo Uploader

- Multi-file selection (JPEG/PNG/WebP/HEIC, up to 10 MB each)
- Drag-and-drop + click-to-browse
- Preview grid with per-photo remove button
- Upload each file in sequence with batched progress bar
- States: idle / uploading / done / error

### 35.8 Messaging System

- Chat-bubble layout (patient messages right/blue, clinic left/gray)
- Auto-scrolls to bottom on new messages
- 30-second auto-poll for new messages
- Enter-to-send (Shift+Enter for newline)
- Loading state + empty state

### 35.9 Auth Hook

`usePortalAuth.js`:
- Manual JWT decode (no dependency needed, `atob` + `JSON.parse`)
- Validates `type === "patient"` and `exp`
- `patient` payload payload + `isAuthenticated` + `logout()`

### 35.10 Router Changes

New routes added inside `PortalAuthGuard` layout:
- `/portal/appointments` → PortalAppointmentsPage
- `/portal/treatments` → PortalTreatmentsPage
- `/portal/messages` → PortalMessagesPage

### 35.11 Layout Changes

PortalLayout nav items added:
- **My Treatments** (ClipboardDocumentListIcon, `/portal/treatments`)
- **Messages** (ChatBubbleLeftRightIcon, `/portal/messages`)

### 35.12 Plane Isolation Verification

| Rule | Status |
|------|--------|
| No `modules/org/*` imports in portal files | ✅ PASS (comments only) |
| No `organizationId` in portal API payloads | ✅ PASS (comments only) |
| `patientToken` JWT carries patient identity | ✅ |
| PortalAuthGuard enforces `type === "patient"` | ✅ |

---

## SECTION 36 — BACKEND IMPORT ARCHITECTURE

### 36.1 Overview

**Audit Date:** 2026-03-12
**Scope:** Backend import path architecture (module-alias system)
**Verdict:** PARTIAL COMPATIBILITY — Safe to standardize with conditions

### 36.2 Module-Alias Configuration

**Library:** `module-alias` v2.3.4
**Bootstrap:** ✅ First line of `server.js` — loads before all application code.

**Current `_moduleAliases` in `package.json`:**

| Alias | Resolves To | Used By |
|-------|------------|---------|
| `@root` | `src/` | 0 files |
| `@platform` | `src/platform` | 2 files (platform plane only) |
| `@billing` | `src/platform/billing` | 3 files (platform billing controllers) |
| `@finance` | `src/platform/finance` | 0 files |
| `@projections` | `src/projections` | 0 files |
| `@services` | `src/services` | 0 files |
| `@shared` | `src/shared` | 0 files |
| `@utils` | `src/utils` | 1 file (platform plane) |
| `@core` | `src/core` | 0 files |
| `@contracts` | `../packages/platform-contract` | Platform billing |

**Missing critical alias:** `@modules`, `@middleware`, `@rbac`, `@infra`, `@events`, `@config` — the most-needed org-plane aliases are NOT defined.

### 36.3 Relative Import Depth Analysis

| Depth | Files Affected | Location Pattern |
|-------|---------------|-----------------|
| 1 (`./`) | ~All | Local references |
| 2 (`../../`) | Most module roots | `src/modules/<M>/*.js` |
| 3 (`../../../`) | 10 route files | `src/modules/<M>/routes/*.js` → middleware |
| 4 (`../../../../`) | 9 files | billingDomain services, orthodonticDomain, governance, platform/audit |
| 5 (`../../../../../`) | 1 file | Deep governance validator |

**Depth-4 files (highest pain):**
- `src/modules/billingDomain/organizationFinance/services/*.js` (4 files)
- `src/modules/orthodonticDomain/landmarks.controller.js`
- `src/platform/audit/utils/requestMetadata.js`
- `src/governance/validators/*.js` (3 files)

### 36.4 Alias Usage Analysis

All existing alias usage is **Platform Plane only**. Zero Organization Plane files use any alias. This means org-plane alias introduction carries zero collision risk.

### 36.5 Platform / Org Isolation Check

| Rule | Status |
|------|--------|
| `@platform` used only in platform plane | ✅ CLEAN |
| `@billing` used only in platform billing | ✅ CLEAN |
| No org module imports `@platform/*` | ✅ CLEAN |
| No org module imports `@billing/*` | ✅ CLEAN |
| Proposed `@modules` maps only `src/modules/` | ✅ SAFE |

### 36.6 Canonical Alias Map (Proposed Standard)

```json
"_moduleAliases": {
  "@root"       : "src",
  "@modules"    : "src/modules",
  "@middleware" : "src/middleware",
  "@rbac"       : "src/rbac",
  "@utils"      : "src/utils",
  "@shared"     : "src/shared",
  "@core"       : "src/core",
  "@infra"      : "src/infrastructure",
  "@events"     : "src/events",
  "@config"     : "src/config",
  "@platform"   : "src/platform",
  "@billing"    : "src/platform/billing",
  "@finance"    : "src/platform/finance",
  "@projections": "src/projections",
  "@services"   : "src/services",
  "@contracts"  : "../packages/platform-contract"
}
```

### 36.7 Import Guidelines

#### Org Plane Routes (depth-3)
```js
// Before:  require('../../../middleware/orgProtect')
// After:   require('@middleware/orgProtect')

// Before:  require('../../../rbac/orgPermissions')
// After:   require('@rbac/orgPermissions')
```

#### Cross-Module References
```js
// Before:  require('../../patientDomain/models/patient.model')
// After:   require('@modules/patientDomain/models/patient.model')
```

#### Deep Service References (depth-4)
```js
// Before:  require('../../../../middleware/orgProtect')
// After:   require('@middleware/orgProtect')

// Before:  require('../../../../utils/logger')
// After:   require('@utils/logger')
```

### 36.8 Migration Risk Analysis

| Area | Files | Risk | Notes |
|------|-------|------|-------|
| `modules/*/routes/*.js` | 10 | 🟡 LOW | Mechanical alias swap |
| `modules/billingDomain/services/` | 4 | 🟡 LOW | Depth-4 elimination |
| `modules/orthodonticDomain/` | 2 | 🟡 LOW | Already depth-fixed |
| `governance/validators/` | 3 | 🟠 MEDIUM | Must verify all targets |
| Workers + scripts | ~20 | 🔴 HIGH | Run standalone — need `require('module-alias/register')` header |
| Platform plane | ~6 | 🟡 LOW | Partially migrated already |

**Critical:** Standalone scripts (`seeders/`, `scripts/`, `governance/validators/`) bypass `server.js`. Must individually add `require('module-alias/register')` as first line before adopting aliases.

### 36.9 Recommendation

**PARTIAL COMPATIBILITY — SAFE TO STANDARDIZE WITH CONDITIONS:**

1. Add 6 new aliases to `package.json` (additive, non-breaking)
2. Migrate org routes first — highest benefit, lowest risk
3. Add `require('module-alias/register')` to standalone scripts before migrating them
4. Never rename existing `@platform`, `@billing` aliases

**Safe migration order:**
1. Add aliases to `package.json`
2. `modules/*/routes/*.js` (10 files)
3. `modules/billingDomain/services/` (4 files)
4. `modules/orthodonticDomain/` (2 files)
5. Governance validators (add register header first)

### 36.10 Org-Plane Alias Rules

| Rule | Enforcement |
|------|------------|
| Org modules MUST NOT use `@platform`, `@billing`, `@finance` | MANDATORY |
| Platform modules MUST NOT use `@modules` | MANDATORY |
| `@utils`, `@shared`, `@core`, `@middleware`, `@rbac` | Shared — both planes |
| New route files must use `@middleware` and `@rbac` | MANDATORY |
| Cross-module refs must use `@modules/<domain>/...` | MANDATORY |

### 36.11 Script Alias Bootstrap Requirement

**Rule:** All standalone scripts MUST include `require("module-alias/register");` as their very first line before any other imports.

**Applies to:**
- All files in `scripts/` (36 files — bootstrapped)
- `seedPlatformUser.js` at root (bootstrapped)
- All files in `src/governance/` (27 files — bootstrapped)

**Rationale:** Standalone scripts bypass `server.js` (which contains the global bootstrap). Without the header, `module-alias` is not registered and `@alias/...` imports will throw `MODULE_NOT_FOUND`.

**Template for new scripts:**
```javascript
require("module-alias/register");
// ... rest of imports
const logger = require("@utils/logger");
const Organization = require("@shared/models/Organization");
```

### 36.12 Migration Completion Status

| Area | Files Migrated | Status |
|------|---------------|--------|
| Org Plane routes | 13 | ✅ DONE |
| Org Plane controllers | 16 | ✅ DONE |
| Org Plane services | 13 | ✅ DONE |
| Org Plane other (queues, subscribers, workers) | 16 | ✅ DONE |
| Platform Plane (controllers, services, engines, models) | 93 | ✅ DONE |
| Standalone scripts bootstrap | 36 | ✅ DONE |
| Governance validators bootstrap | 27 | ✅ DONE |
| **Total** | **214** | ✅ COMPLETE |

### 36.13 Cross-Plane Isolation Verification

| Check | Result |
|-------|--------|
| Platform → `@modules/*` usage | ✅ ZERO violations |
| Org → `@platform/*` usage | ✅ ZERO violations |
| Org → `@billing/*` usage | ✅ ZERO violations |
| Alias resolution (15 aliases tested) | ✅ ALL PASS |

---

## Section 37 — Post-Alias System Audit

**Date:** 2026-03-12  
**Scope:** Full backend architecture validation after alias migration

### 37.1 Audit Summary

| # | Area | Status | Notes |
|---|------|--------|-------|
| 1 | Alias Configuration | ✅ PASS | 16 aliases, no duplicates |
| 2 | Bootstrap Order | ✅ PASS | All entrypoints (server, scripts, governance) bootstrapped |
| 3 | Alias Resolution | ✅ PASS | 15/15 resolve correctly |
| 4 | Import Residue | ✅ PASS | 1 allowed residual (`organization/` legacy path) |
| 5 | Plane Isolation | ✅ PASS | ZERO cross-plane violations |
| 6 | Tenant Isolation | ⚠️ REVIEW | 1 `req.body.organizationId` fallback in `patientAuth.controller.js` |
| 7 | Route Guards | ✅ PASS | 11 org routes + 2 platform routes guarded |
| 8 | RBAC Centralization | ⚠️ KNOWN | 7 inline `role === "superadmin"` in platform plane (documented exceptions) |
| 9 | EventBus | ✅ PASS | 36 emitters, 8 subscriber files |
| 10 | Queue System | ✅ PASS | 7 queues, 4 workers |
| 11 | Swagger | ✅ PASS | Annotations present on route files |
| 12 | Governance Guards | ✅ PASS | sovereignGuard operational at boot |
| 13 | File Storage | ✅ PASS | Signed URLs with expiry |
| 14 | AI Engine | ✅ PASS | spawn + lastToothAnalysis subdocument |

### 37.2 Known Exceptions

**Tenant Isolation Exception:**
`patientAuth.controller.js` line 34 uses `req.organizationId || req.body.organizationId` as a fallback for portal activation flow where JWT has not yet been issued.

**RBAC Inline Guards:**
7 occurrences of `role === "superadmin"` exist exclusively in Platform Plane controllers and services for identity-critical mutation protection (preventing deletion/modification of superadmin accounts). These are **not authorization checks** but **identity safety guards**.

### 37.3 Import Residue

| Path | Classification |
|------|---------------|
| `../../../../organization/billing/models/orgAddOn.model` in `invoice.service.js` | **Allowed** — `src/organization/` is a legacy directory not covered by any alias |

**Recommendation:** Add `@organization` alias in a future iteration.

---

## Section 38 — Architecture Hardening

**Date:** 2026-03-12

### 38.1 Tenant Isolation Fix — Portal Activation

**Problem:** `patientAuth.controller.js` used `req.organizationId || req.body.organizationId` as a fallback. The `/portal/activate` endpoint is **public** (no JWT), so `req.organizationId` is always `undefined`, meaning `req.body.organizationId` was silently trusted — a tenant injection vulnerability.

**Root Cause:** The service `activatePortal()` already read `organizationId` exclusively from `invite.organizationId` (the DB record). The controller needlessly passed an external value, which had no effect on correct invocations but was architecturally incorrect.

**Fix Applied:**

| Layer | Change |
|-------|--------|
| `patientAuth.controller.js` | Destructures and **strips** `organizationId` from `req.body` before calling service |
| `patientAuth.service.js` | Signature changed from `{ inviteToken, otp, password, organizationId }` to `{ inviteToken, otp, password }` — `organizationId` parameter removed |
| `patientAuth.service.js` | `PortalInvite.findOne()` now uses `{ tokenHash, usedAt: null }` only — `organizationId` filter removed (it was always `undefined` when the trusted path was followed) |

**Invariant Enforced:**
```
organizationId resolution for portal activation:
  source = invite.organizationId (DB record, set at invite creation)
  NEVER: req.body.organizationId, req.query.organizationId, req.params.organizationId
```

### 38.2 ESLint Architecture Guard

**Tool:** `eslint-plugin-boundaries`

**Backend (`eslint.config.js`):**

| Rule | Enforcement |
|------|------------|
| Org Plane → Platform | ❌ ERROR |
| Platform → Org Modules | ❌ ERROR |
| Portal → Org Modules | ❌ ERROR |
| Shared utilities → Any | ✅ ALLOWED |

**Frontend (`eslint.config.js`):**

| Rule | Enforcement |
|------|------------|
| Portal → Org Plane modules | ❌ ERROR |
| Org Plane → Platform modules | ❌ ERROR |
| `organizationId` in portal API payloads | ⚠️ WARN |

**Scripts:**
```bash
npm run lint              # Full architecture scan
npm run lint:org          # Org plane only
npm run lint:platform     # Platform plane only
npm run lint:fix          # Auto-fix safe issues
```

### 38.3 Patient Portal Isolation Rules

**Backend:**
- Portal activation accepts only: `inviteToken`, `otp`, `password`
- `organizationId` is always sourced from `invite.organizationId` (DB record)
- `PortalInvite.findOne()` uses globally-unique tokenHash — not filtered by organizationId

**Frontend:**
- Portal UI must live under `src/modules/patientDomain/portal/` or `src/modules/portal/`
- Portal may only import from: `src/api/`, `src/design-system/`, `src/shared/`
- Portal **MUST NOT** import from: `src/modules/` (org scope), `src/platform/`
- Portal API payloads **MUST NOT** include `organizationId`

**JWT Token Separation:**
- Portal JWT: `{ type: "patient", patientId, organizationId, patientUserId }`
- Org JWT: `{ type: "staff", userId, organizationId, role }`
- Platform JWT: `{ type: "platform", userId, role }`
- These token types must never be interchangeable

---

## Section 39 — Post-Hardening Architecture Audit

**Task:** TASK-BE-ARCH-AUDIT-002  
**Date:** 2026-03-12  
**Scope:** Full system validation after Architecture Hardening (Sections 38.1–38.3)

### 39.1 Audit Summary

| # | Area | Status | Notes |
|---|------|:------:|-------|
| 1 | Portal Tenant Isolation | ✅ FIXED | `organizationId` stripped in controller; removed from service signature |
| 2 | ESLint Guard (backend) | ✅ ACTIVE | 0 boundary errors on `src/modules/` scan |
| 3 | Frontend Portal Isolation | ✅ ACTIVE | 0 `@platform/` imports in org modules |
| 4 | JWT Token Separation | ✅ CLEAN | 3 types: `patient`, `platform`, staff |
| 5 | Alias System | ✅ UNCHANGED | 15/15 aliases resolve (from AUDIT-001) |
| 6 | Route Guards | ✅ UNCHANGED | All org + platform routes guarded |
| 7 | RBAC Centralization | ✅ CLEAN | 0 inline role checks in Org Plane |
| 8 | EventBus | ✅ CLEAN | `subscription.created` wired to canonicalEventProcessor |
| 9 | Queue System | ✅ CLEAN | 7 queues confirmed (documentCleanupQueue not implemented — allowed) |
| 10 | File Storage | ✅ CLEAN | Signed URLs via `getSignedUrl` under `patientProtect` |
| 11 | AI Engine | ✅ CLEAN | `child_process.spawn` + `lastToothAnalysis` |
| 12 | Governance Guards | ✅ CLEAN | `sovereignGuard` + `routerTopologyAudit` both confirmed |
| 13 | Swagger | ✅ UNCHANGED | No route changes in this cycle |

### 39.2 Documented Exceptions (Non-Violations)

| Pattern | Location | Classification |
|---------|----------|---------------|
| `req.query.organizationId` | Platform billing controllers (4 files) | ✅ **PLATFORM PLANE ONLY** — cross-org admin filter, protected by `platformProtect` |
| `req.body.organizationId` (delete) | `appointment.controller.js:543` | ✅ **DEFENSIVE STRIP** — removes it from body |
| `req.body.organizationId` (compare) | `verifyOrganizationAccess.js:64` | ✅ **CROSS-ORG GUARD** — validates against JWT org, not as auth source |
| `req.params.organizationId` | `verifyOrganizationAccess.js:63` | ✅ **CROSS-ORG GUARD** — validation only |
| `role === "superadmin"` (7 occurrences) | Platform plane controllers only | ✅ **IDENTITY SAFETY** — prevents superadmin deletion, not auth |

### 39.3 Pre/Post-Hardening Delta

| Area | Pre-Hardening | Post-Hardening |
|------|:---:|:---:|
| Portal Tenant Isolation | ⚠️ VULNERABLE | ✅ FIXED |
| ESLint Architecture Guard | ❌ ABSENT | ✅ ACTIVE |
| Frontend Portal Isolation | ❌ UNENFORCED | ✅ ENFORCED |
| All other areas | ✅ CLEAN | ✅ CLEAN |

---

## Section 40 — Organization Finance Engine

**Phase:** 6 — Finance Domain
**Plane:** Organization only — must NOT import `@platform` or platform billing
**Tenant Isolation:** `organizationId` always from `req.organizationId` (JWT-injected by `orgProtect`)

### 40.1 Model Inventory

All models reside in `billingDomain/organizationFinance/models/`:

| Model | Description |
|-------|-------------|
| `PatientInvoice` | Clinic invoice: treatments + charges, statuses, monetary immutability guard |
| `PatientPayment` | Payment records: method, amount, collector, status |
| `PaymentAllocation` | Links payments to specific invoices (partial/full allocation) |
| `PatientWallet` | Running balance per patient per org |
| `FinancialLedger` | Immutable audit ledger for all financial events |

### 40.2 Invoice Lifecycle

```
draft → issued → partially_paid → paid
  └──────────────────────────────→ voided (from any non-paid status)
```

**Financial Integrity Rules:**
- `paid` and `voided` invoices: monetary fields are **immutable** (enforced via `pre("save")`)
- Monetary fields locked: `subtotal`, `tax`, `discount`, `totalAmount` (+ minor-unit variants)
- `version` field incremented on every mutation — **Optimistic Atomic Versioning (OAV)**

### 40.3 Service Architecture

| Service | Location | Purpose |
|---------|----------|---------|
| `ledger.orchestrator.service.js` | `billingDomain/organizationFinance/services/` | `createInvoice()`, `recordPayment()`, `voidInvoice()`, `creditWallet()` |
| `invoiceStatus.service.js` | same | `deriveInvoiceStatus()` — recalculates from payment allocations |
| `clinicLedger.service.js` | same | Read facade: `listInvoices()`, `getInvoiceById()`, `listPayments()`, `getPaymentById()` |
| `financeSummary.service.js` | `financeDomain/services/` | Analytics: `getDailySummary()`, `getMonthlySummary()`, `getOutstandingBalances()` |

### 40.4 API Routes

| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| `GET` | `/api/v1/invoices` | `INVOICES_READ` | List invoices (paginated, filterable) |
| `GET` | `/api/v1/invoices/:id` | `INVOICES_READ` | Get invoice by ID |
| `POST` | `/api/v1/invoices` | `INVOICES_CREATE` | Create invoice (server-side total calculation) |
| `POST` | `/api/v1/invoices/:id/void` | `INVOICES_DELETE` | Void invoice (OAV + immutable ledger) |
| `GET` | `/api/v1/payments` | `PAYMENTS_READ` | List payments |
| `GET` | `/api/v1/payments/:id` | `PAYMENTS_READ` | Get payment by ID |
| `POST` | `/api/v1/payments` | `PAYMENTS_CREATE` | Record payment (auto-allocates to invoice) |
| `GET` | `/api/v1/finance/summary/daily` | `ACCOUNTING_READ` | Daily revenue + collections |
| `GET` | `/api/v1/finance/summary/monthly` | `ACCOUNTING_READ` | Monthly revenue + daily breakdown |
| `GET` | `/api/v1/finance/outstanding` | `ACCOUNTING_READ` | Ranked outstanding balance report |

### 40.5 Plane Isolation Invariants

- Finance modules MUST NOT import `@platform` or `@billing` SaaS billing
- All queries MUST include `organizationId: req.organizationId`
- `organizationId` MUST NOT be read from `req.body`, `req.query`, or `req.params`
- Events emitted as `financial_event` on `eventBus` — downstream consumers handle analytics

---

## Section 41 — Contract Timeline Integrity

**Phase:** Billing Hardening
**Plane:** Platform
**Invariant:** `CONTRACT_TIMELINE_INTEGRITY`

### 41.1 Problem Statement

Contract supersession used `new Date()` as the closing boundary for the outgoing contract's `effectiveTo`. However, the incoming contract's `effectiveFrom` was set at draft creation time — potentially minutes earlier. This caused timeline overlaps where both contracts covered the same period.

**Detected overlap:**
- Org: `69a9f380b90d57cce3168c0e`
- Contract A (superseded): `69a9f381b90d57cce3168c24` — ends `2026-03-07T02:39:48`
- Contract B (active): `69ab8d8e7e36b999bb79b671` — starts `2026-03-07T02:29:34`
- Overlap: ~10 minutes

### 41.2 Root Cause Fix

`contractActivation.service.js` Step 5 — supersession timeline close:

```diff
- previousContract.effectiveTo = new Date();
+ previousContract.effectiveTo = contract.effectiveFrom;
```

This guarantees: `prev.effectiveTo === next.effectiveFrom` — zero overlap, zero gap.

### 41.3 Enforcement Layers

| Layer | Location | Mechanism |
|-------|----------|-----------|
| **Pre-creation guard** | `contractEngine.service.js` | `CONTRACT_TIMELINE_OVERLAP` error if effectiveFrom falls within existing non-terminal contract |
| **Activation guard** | `contractActivation.service.js` | `effectiveTo = contract.effectiveFrom` on superseded contract (transactional) |
| **DB index** | `OrgContract.model.js` | `{ organizationId: 1, effectiveFrom: 1, effectiveTo: 1 }` compound index |
| **Startup guardian** | `startup.guardian.js` | `CONTRACT_TIMELINE_INTEGRITY` — O(n log n) sorted scan |
| **Auto-repair (dev)** | `guardianAutoRepair.js` | `repairContractTimeline()` — aligns effectiveTo to successor.effectiveFrom |
| **Migration script** | `scripts/fixContractOverlap.js` | One-time fix for pre-existing overlaps |

### 41.4 Invariant Rules

1. **Only one active contract per organization** — DB partial unique index enforces
2. **Contracts must never overlap** — `prev.effectiveTo <= next.effectiveFrom`
3. **Contracts must never have gaps** — `prev.effectiveTo === next.effectiveFrom` (in supersession chain)
4. **Previous contract must end exactly when next begins** — zero overlap, zero gap
5. **All supersession transitions occur in DB transaction** — `startTransaction()` → update prev → create new → `commitTransaction()`
6. **effectiveTo on superseded contracts must always be set** — guardian warns on `null`

### 41.5 Contract Gap Integrity (`CONTRACT_GAP_INTEGRITY`)

**Complementary to:** `CONTRACT_TIMELINE_INTEGRITY` (overlap detection)

**Scope:** Only contracts linked via the supersession chain (`supersededById` / `previousContractId`).
Unlinked contracts (first contract for an org, post-termination restart) are NOT expected to be gapless — the org may have been inactive between them.

**Algorithm:**
1. Fetch all superseded contracts with `effectiveTo` set and `supersededById` non-null
2. Batch-load successors in a single query (avoids N+1)
3. For each pair: if `successor.effectiveFrom > prev.effectiveTo` → gap violation

**Enforcement layers:**

| Layer | Location | Mechanism |
|-------|----------|-----------|
| **Activation service** | `contractActivation.service.js` | `prev.effectiveTo = contract.effectiveFrom` (prevents gaps at source) |
| **Startup guardian** | `startup.guardian.js` | `CONTRACT_GAP_INTEGRITY` check (detects existing gaps) |
| **Auto-repair (dev)** | `guardianAutoRepair.js` | `repairContractGaps()` — adjusts `successor.effectiveFrom` to close gaps |
| **Migration script** | `scripts/fixContractGaps.js` | One-time fix for pre-existing gaps |

**Repair direction:** Adjusts the SUCCESSOR's `effectiveFrom`, not the previous's `effectiveTo`.
Rationale: `prev.effectiveTo` was set by the activation service at time of transition — it is the authoritative boundary.

---

## Section 42 — Platform Plane Architecture Audit

**Date:** 2026-03-12
**Scope:** Full Platform Plane governance layer

### 42.1 Audit Results Summary

| Category | Status | Issues |
|----------|--------|--------|
| Route Guard Enforcement | ⚠️ | 2 unguarded admin endpoints |
| RBAC Centralization | ✅ | Identity safety checks only (valid) |
| Tenant Isolation | ✅ | Zero `req.body.organizationId` in platform |
| Plane Isolation | ✅ | Zero cross-plane imports |
| Billing Invariants | ✅ | 8 enforced invariants |
| Guardian System | ✅ | 6 auto-repairable, Phase 1-2-3 operational |
| Frontend Data Safety | ⚠️ | 2 pages missing `Array.isArray` guard |
| Swagger Coverage | ✅ | All 12 route files annotated |
| ISO Country | ✅ | Codes only, no display names stored |
| Observability | ✅ | All required auth events logged |

### 42.2 Critical Issues — RESOLVED ✅

1. **`/admin/debug/email`** — ~~No authentication guard~~ → **FIXED (v23.1)**: `platformProtectMw + superAdminOnlyMw` added. Returns HTTP 404 in `NODE_ENV=production`.
2. **`/admin/queues`** — ~~Bull Board mounted without `platformProtect`~~ → **FIXED (v23.1)**: `platformProtectMw + superAdminOnlyMw` added before `getBullBoardRouter()`.

### 42.3 Warnings — RESOLVED ✅

1. **`OrganizationUsersPage.jsx`** — ~~`setOrganizations(res.data)` without `Array.isArray` guard~~ → **FIXED (v23.1)**: `Array.isArray` normalization applied.
2. **`PlatformUsersPage.jsx`** — ~~`setUsers(res.data)` without `Array.isArray` guard~~ → **FIXED (v23.1)**: `Array.isArray` normalization applied.

### 42.4 Guardian Invariant Matrix

| Invariant | Check | Auto-Repair | Migration Script |
|-----------|-------|-------------|------------------|
| `UNIQUE_ACTIVE_CONTRACT_PER_ORG` | DB index | N/A | N/A |
| `CONTRACT_TIMELINE_INTEGRITY` | ✅ | ✅ | `fixContractOverlap.js` |
| `CONTRACT_GAP_INTEGRITY` | ✅ | ✅ | `fixContractGaps.js` |
| `CONTRACT_PRICING_SNAPSHOT_PRESENT` | ✅ | ✅ | N/A |
| `CONTRACT_STATUS_VALID` | ✅ | N/A | N/A |
| `ORG_CURRENT_CONTRACT_POINTER_INTEGRITY` | ✅ | N/A | N/A |
| `PLAN_REGION_PRICE_COMPLETENESS` | ✅ | N/A | N/A |
| `PLAN_VERSION_VISIBILITY_ENUM` | ✅ | ✅ | N/A |
| `DEPRECATED_PUBLIC_PLAN` | ✅ | ✅ | N/A |
| `ORG_WITHOUT_ACTIVE_CONTRACT` | ✅ | ✅ | N/A |
| `BILLING_LEDGER_INTEGRITY` | ✅ | N/A | N/A |

### 42.5 Platform Security Fixes (v23.1 — 2026-03-12)

**AUDIT-002 — `/admin/debug/email` guard**
```javascript
// app.js
app.get("/admin/debug/email", platformProtectMw, superAdminOnlyMw, async (req, res) => {
    if (process.env.NODE_ENV === "production") {
        return res.status(404).json({ message: "Not available in production" });
    }
    // ... existing debug logic
});
```

**AUDIT-003 — Bull Board guard**
```javascript
// app.js
app.use("/admin/queues", platformProtectMw, superAdminOnlyMw, getBullBoardRouter());
```

**AUDIT-001 — Frontend `Array.isArray` normalization**
```javascript
// OrganizationUsersPage.jsx
setOrganizations(Array.isArray(res.data) ? res.data : (res.data?.data || []));

// PlatformUsersPage.jsx
setUsers(Array.isArray(res.data) ? res.data : (res.data?.data || []));
```

**Platform Plane Audit Status:** ✅ ALL ISSUES RESOLVED — 2026-03-12

---

## SECTION 42.6 — PHONE-BASED GEO ROUTING + OTP SIGNUP PRICING GATE

**Added:** 2026-03-13
**Version:** v22.0
**Task Reference:** TASK-FEATURE-GEO-OTP-001

### Overview

In v22.0, the organization signup flow was enhanced to:

1. **Verify phone number via OTP** before allowing organization creation
2. **Derive region from phone country** rather than IP geolocation
3. **Lock `organization.regionCode`** at creation time from the verified phone number
4. **Gate pricing behind OTP verification** — plan prices are hidden until the user verifies their phone

### Onboarding Flow

```
Visitor → /signup
    │
    ▼
Step 1: Enter email + phone
    │
    ▼
POST /public/request-otp
    ├── Extract country from phone (libphonenumber-js)
    ├── Validate phone (E.164 format)
    ├── Generate 6-digit OTP
    ├── Hash OTP → PhoneVerificationToken (TTL: 10 min)
    └── Send via SMS (smsQueue) or email fallback (emailQueue)
    │
    ▼
Step 2: Enter OTP
    │
    ▼
POST /public/verify-otp
    ├── Validate OTP against hashed token
    ├── Extract country: phone → ISO (e.g. "+20" → "EG")
    ├── Resolve region: ISO → regionCode (e.g. "EG" → "MENA")
    ├── Generate pricingToken (32-byte hex, 10-min TTL, in-memory store)
    └── Return: { country, region, pricingToken }
    │
    ▼
Step 3: Choose plan
    │
GET /public/plans?country=EG
    Headers: X-Pricing-Token: <pricingToken>
    ├── Token valid → return full pricing (currency, monthlyPrice, annualPrice)
    └── Token absent → return plan names/features only (prices null, pricingLocked: true)
    │
    ▼
Step 4: Complete account details
    │
    ▼
POST /public/signup
    ├── Validate pricingToken (consumePricingToken — one-time use)
    ├── Extract country + region from token
    ├── Set organization.regionCode = resolveRegionCode(phoneCountry)
    ├── Set organization.country = phoneCountry
    ├── Store phoneNumber + phoneVerified + phoneVerifiedAt on User
    └── Organization created with regionCode locked
```

### Region Mapping

```
+20  → EG → MENA
+971 → AE → MENA
+966 → SA → MENA
+44  → GB → EU
+1   → US → US
+81  → JP → APAC
```

Resolved by `resolveRegionCode()` in `pricingRegionResolver.js`.

### New Components

| Component | Path | Role |
|-----------|------|------|
| `phoneCountryExtractor.js` | `backend/src/core/geo/` | Phone → ISO country via `libphonenumber-js` |
| `otpController.js` | `backend/src/organization/controllers/` | OTP lifecycle + pricing token store |
| OTP routes | `platformPublicRoutes.js` v22.0 | `POST /public/request-otp`, `POST /public/verify-otp` |
| 4-step wizard | `frontend/src/modules/public-site/SignupPage.jsx` | Phone → OTP → Plan → Details |

### Data Model Changes

**User model (v26.0):**
```
phoneNumber:    String (E.164, nullable)
phoneVerified:  Boolean (default: false)
phoneVerifiedAt: Date (nullable)
```

**Organization model:** No schema changes. `regionCode` field already existed with immutability guard.

**PhoneVerificationToken model:** No changes. Model was already full-featured (phoneNumber, hashed otp, expiresAt, attempts, isUsed).

### Pricing Token Lifecycle

```
verify-otp
    └── generate pricingToken (crypto.randomBytes(32).hex)
    └── store in pricingTokenStore (in-process Map, TTL: 10 min)
    └── return to frontend

GET /public/plans (with X-Pricing-Token header)
    └── validatePricingToken() → { valid, data }
    └── showPricing = valid
    └── prices hidden if invalid

POST /public/signup (final step)
    └── consumePricingToken() → validates AND deletes (one-time use)
    └── country + region extracted from token data
    └── organization created with regionCode from token
```

> **Note on Token Store:** The current implementation uses an in-process `Map` with TTL cleanup every 60s. For multi-instance deployments, replace with Redis-backed store using `SET key value EX 600`. The interface (`validatePricingToken`, `consumePricingToken`) is already designed for drop-in Redis replacement.

### Security Properties

| Property | Implementation |
|----------|---------------|
| OTP brute-force protection | Max 5 attempts per token; token exhausted on 5th failure |
| OTP request flooding | IP rate limit: 10 requests per 10 minutes (`otpLimiter`) |
| Pricing token one-time use | `consumePricingToken()` deletes on first use |
| Pricing token expiry | 10-minute TTL with auto-cleanup |
| Phone number enumeration | OTP SMS send errors don't reveal delivery status |
| Region spoofing resistance | Phone country is extracted server-side (not from client input) |

### Guardian Invariant Impact

| Invariant | Impact |
|-----------|--------|
| CONTRACT_TIMELINE_INTEGRITY | ✅ None — operates on contract dates only |
| UNIQUE_ACTIVE_CONTRACT_PER_ORG | ✅ None — operates on contract count per org |
| PLAN_REGION_PRICE_COMPLETENESS | ✅ None — validates plan catalog data, not org data |
| CONTRACT_PRICING_SNAPSHOT_PRESENT | ✅ None — validates contract fields at provisioning time |
| ORG_CURRENT_CONTRACT_POINTER_INTEGRITY | ✅ None — validates org.currentContractId linkage |
| CONTRACT_CONTINUITY_INTEGRITY | ✅ None — validates contract gap/overlap timeline |

**All guardian invariants: ZERO IMPACT**

### Sovereign Guard Impact

All sovereign guard checks (registry integrity, bypass protection, domain isolation, router certification, event schema registry, audit chain) operate on deployment-time structural invariants.

**Sovereign guards: ZERO IMPACT**

---

## SECTION 42.7 — DEVELOPMENT AUTHENTICATION MODE (DEV_AUTH_MODE)

**Added:** 2026-03-13
**Version:** v22.1
**Task Reference:** TASK-DEV-AUTH-001

### Overview

`DEV_AUTH_MODE` is a centralized development bypass system that disables external service dependencies (SMS OTP, email verification, payment checks, rate limiters) during local development. It enables developers to test the full signup flow without requiring a live SMS provider, email server, or payment gateway.

### Activation

Both environment variables must be set simultaneously:

```env
NODE_ENV=development
DEV_AUTH_MODE=true
```

The flag is **computed once at boot** in `src/config/authConfig.js`:

```javascript
const DEV_AUTH_MODE =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_MODE === "true";
```

In production `NODE_ENV` is never `"development"` — so `DEV_AUTH_MODE` is always `false` regardless of what `DEV_AUTH_MODE` env variable is set to.

### Centralized Config Module

| File | Path |
|------|------|
| `authConfig.js` | `backend/src/config/authConfig.js` |

Exports:
- `DEV_AUTH_MODE` — boolean flag
- `devPassThrough` — Express no-op middleware replacing rate limiters in dev

Pattern follows `platformMode.js` — all dev-mode checks must import from here. Raw `process.env.NODE_ENV === "development"` checks are forbidden in auth/signup flows.

### Bypass Behaviour per Subsystem

| Subsystem | File | DEV_AUTH_MODE=true behaviour |
|-----------|------|------------------------------|
| `POST /public/request-otp` | `otpController.js` | Returns success immediately — no MongoDB write, no SMS, no email |
| `POST /public/verify-otp` | `otpController.js` | Accepts fixed OTP `123456` — issues `pricingToken` with 24h TTL |
| `POST /public/signup` | `publicController.js` | If `pricingToken` missing or expired → derives country/region from phone directly |
| Rate limiters (all) | `platformPublicRoutes.js` | All limiters replaced with `devPassThrough` (no-op) |

### Pricing Token TTL in Dev

In production: `pricingToken` TTL = **10 minutes**

In dev (`DEV_AUTH_MODE=true`): `pricingToken` TTL = **24 hours**

This prevents the "Phone verification expired" error that occurs when the in-memory token store is wiped by a server restart between signup steps.

### Developer Flow (DEV_AUTH_MODE=true)

```
Step 1  Enter any valid E.164 phone (e.g. +201234567890)
        request-otp → returns instantly, no DB/SMS

Step 2  Enter OTP: 123456
        verify-otp  → issues pricingToken (24h TTL)
                      country/region derived from phone server-side

Step 3  Plan selection
        GET /public/plans with X-Pricing-Token → full pricing shown

Step 4  Fill account details → submit
        signup → if pricingToken valid: normal path
                 if token expired/missing: derives region from phone → continues
        Organization created with regionCode locked ✅
```

### Security Guarantees

| Guard | Mechanism |
|-------|-----------|
| Dual-key activation | Both `NODE_ENV=development` AND `DEV_AUTH_MODE=true` required |
| Production safety | `NODE_ENV` is never `"development"` in production |
| No implicit activation | `DEV_AUTH_MODE=true` alone does nothing without `NODE_ENV=development` |
| Logged always | Every bypass emits a `logger.warn` — bypass usage is always visible in logs |
| No DB side-effects | Bypass does not create PhoneVerificationToken records in dev |

### Files Changed

| File | Change |
|------|--------|
| `src/config/authConfig.js` | **NEW** — centralized DEV_AUTH_MODE config |
| `src/organization/controllers/otpController.js` | Uses `DEV_AUTH_MODE` (was raw `NODE_ENV` check) |
| `src/organization/controllers/publicController.js` | Uses `DEV_AUTH_MODE` (was raw `NODE_ENV` check) |
| `src/shared/routes/platformPublicRoutes.js` | Rate limiters swapped for `devPassThrough` when `DEV_AUTH_MODE` |
| `backend/dev.env.example` | **NEW** — documents required env vars for dev setup |

---

### Phase 15 — RBAC Schema Sync Recovery

**Problem:**
Schema drift between the canonical permission contract (`orgPermissions.js`, 14 modules / 48 permissions) and the Mongoose Role schema + seed (`Role.js` + `roleInitializer.js`, 10 modules / 36 permissions). Mongoose strict mode silently discarded permission data for 7 missing modules: procedures, treatments, invoices, payments, portal, monitoring, security. This caused ORG_ADMIN users to be denied access to portal buttons, treatment pages, invoice pages, and security features.

**Root Cause Chain:**
```
orgPermissions.js defines portal.manage ✅
  → Role.js schema has NO portal field ❌ (Mongoose strict mode strips it)
  → roleInitializer never seeds portal ❌
  → MongoDB Role document has no portal ❌
  → authMiddleware builds permissionSet → "portal.manage" NEVER added ❌
  → Frontend CapabilityContext → capabilities["portal.manage"] = undefined ❌
  → <Can permission="portal.manage"> → HIDDEN ❌
```

**Fixes Applied:**

| Fix | File | Change |
|-----|------|--------|
| Schema Extension | `Role.js` | Added 7 modules + `calendar.selfFilterOnly` to Mongoose schema |
| Seed Sync | `roleInitializer.js` | Updated all 5 roles to include 7 new modules matching `ORG_ROLE_PERMISSIONS` |
| Migration | `scripts/migrateRolePermissions.js` | Idempotent patch for existing Role documents in MongoDB |
| Route Normalization | `patientDomain.routes.js` | Changed `POST /:id/intake-link` from `P.PATIENTS_UPDATE` to `P.PORTAL_MANAGE` |
| Matrix Sync | `permissionRules.js`, `permissionMatrix.js` | Updated intake-link entries to `P.PORTAL_MANAGE` |
| Entitlement Gate | `PatientLayout.jsx` | Wrapped portal buttons with `<FeatureGate module="portal">` |
| CI Validation | `scripts/validatePermissionSync.js` | Drift detection script comparing schema ↔ contract ↔ seed |

**Architecture Invariant (new):**
- `orgPermissions.js` is the SINGLE source of truth for all org-plane permissions
- `Role.js` schema MUST contain every module defined in `orgPermissions.js`
- `roleInitializer.js` MUST seed values matching `ORG_ROLE_PERMISSIONS`
- CI MUST run `validatePermissionSync.js` to prevent future drift

**Three-Layer Authorization Model (confirmed):**
```
Layer 1: Entitlement (plan-level)    — <FeatureGate module="portal">
Layer 2: RBAC (role-level)           — <Can permission="portal.manage">
Layer 3: Policy (resource-level)     — policyMiddleware(P.PORTAL_MANAGE, ...)
```
All three layers must pass for a user to access a feature.

---

### Phase 16 — Permission Auto-Sync Engine

**Problem:**
Phase 15 revealed that manual synchronization between `orgPermissions.js` (SSOT), `Role.js` (Mongoose schema), and `roleInitializer.js` (seed) was the root cause of permission drift. The fix was to eliminate manual synchronization entirely by auto-generating schema, seeds, and types from the SSOT.

**Architecture:**

```
┌───────────────────────────────────────┐
│       orgPermissions.js (SSOT)        │
│   P enum + ORG_ROLE_PERMISSIONS       │
│              + ORG_ROLES              │
└──────────────┬────────────────────────┘
               │
               ▼
┌───────────────────────────────────────┐
│      permissionRegistry.js            │
│   deriveModuleMap()                   │
│   generateSchemaDefinition()          │
│   generateRoleSeed()                  │
│   generateAllRoleSeeds()              │
│   flattenPermissions()                │
│   flattenPermissionsToObject()        │
│   generatePermissionKeys()            │
└───┬───────┬───────┬───────┬───────────┘
    │       │       │       │
    ▼       ▼       ▼       ▼
 Role.js  Seeds  CI/Val  Frontend
 (schema) (init) (drift) (keys.json)
```

**Data Flow — Adding a New Permission Module:**
```
1. Developer edits orgPermissions.js:
   - Adds P.INVENTORY_READ = "inventory.read" (etc.)
   - Adds ORG_ROLE_PERMISSIONS entries for each role

2. On server restart:
   - permissionRegistry.deriveModuleMap() detects "inventory" module
   - Role.js schema automatically includes inventory: { read: Boolean, ... }
   - roleInitializer.js generates correct seeds for new orgs

3. CI pipeline:
   - npm run validate:permissions → PASSES (engine self-validates)

4. Existing orgs:
   - npm run check:permission-drift → DETECTS missing "inventory" fields
   - npm run migrate:permissions → PATCHES all Role documents

5. Frontend sync:
   - npm run generate:permission-keys → Updates permissionKeys.json
```

**Generated Outputs:**

| Output | Source Function | Consumer |
|--------|----------------|----------|
| Mongoose schema definition | `generateSchemaDefinition()` | `Role.js` |
| Role permission seeds | `generateRoleSeed(roleName)` | `roleInitializer.js` |
| Flat permission set | `flattenPermissions()` | `authMiddleware.js` (O(1) lookup) |
| Flat permission object | `flattenPermissionsToObject()` | Frontend API responses |
| Permission key array | `generatePermissionKeys()` | Frontend type validation |
| Module→actions map | `deriveModuleMap()` | CI validators, migration scripts |

**CI Scripts:**

| Script | Purpose | Exit Code |
|--------|---------|-----------|
| `validate:permissions` | End-to-end engine validation (7 checks) | 0=pass, 1=fail |
| `check:permission-drift` | Live DB drift detection | 0=clean |
| `check:permission-drift --fix` | Live DB auto-repair | 0=fixed |
| `migrate:permissions` | Patch all existing Role documents | 0=done |
| `migrate:permissions:dry` | Preview migration without writes | 0=preview |
| `generate:permission-keys` | Export keys to frontend JSON | 0=generated |

**Architecture Rules (Enforced):**
1. `orgPermissions.js` = ONLY source of truth for org-plane permissions
2. `Role.js` MUST NOT manually define permission fields — uses `generateSchemaDefinition()`
3. `roleInitializer.js` MUST NOT hardcode permission objects — uses `generateRoleSeed()`
4. CI MUST run `validate:permissions` to prevent auto-sync engine regression
5. Adding a permission module = editing ONE file (orgPermissions.js), zero other file changes needed
6. Schema drift is now structurally impossible (not just detected — prevented)

---

### Phase 17 — Auth System Hardening

**Date:** 2026-03-22
**Status:** ✅ COMPLETE
**Objective:** Transform Phase 16 Auto-Sync Engine into a self-healing, runtime-safe, fully observable authorization system.

#### 17.1 Architecture Overview

```
┌───────────────────────────────────────────┐
│       orgPermissions.js (SSOT)            │
│   P enum + ORG_ROLE_PERMISSIONS           │
│           + ORG_ROLES                     │
└──────────────┬────────────────────────────┘
               │
               ▼
┌───────────────────────────────────────────┐
│      permissionRegistry.js                │
│   PERMISSION_VERSION (v2)                 │
│   deriveModuleMap() / deriveModules()     │
│   generateSchemaDefinition()              │
│   generatePermissionKeys()                │
└───┬───────┬───────┬───────┬───────┬───────┘
    │       │       │       │       │
    ▼       ▼       ▼       ▼       ▼
 Role.js  Seeds  Validator AutoHeal Debug
 (schema) (init) (boot)   (boot)   (API)
```

#### 17.2 Permission Validator (Feature 1)

**Backend:**
- `backend/src/rbac/permissionValidator.js` — Boot-time SSOT validation
- `assertValidPermission(key)` — throws if key not in SSOT (called once at route mount)
- `isValidPermission(key)` — soft check (no throw)
- `getValidPermissionKeys()` — returns immutable Set of all valid keys
- Integrated into `requireOrgPermission.js` — catches typo'd permission strings at boot

**Frontend:**
- `frontend/src/utils/permissionValidator.js` — Render-time SSOT validation
- `validatePermissionKey(key, source)` — console.error in dev, silent in prod
- Deduplicated warnings via `warnedKeys` Set (no console spam on re-renders)
- Integrated into `<Can>`, `<Cannot>`, `useCapability()`, `useCapabilityCheck()`
- Source: `frontend/src/generated/permissionKeys.json` (generated by backend script)

#### 17.3 Entitlement Sync Validator (Feature 2)

- `backend/src/core/entitlements/validateEntitlementSync.js`
- `validatePlanModuleSync(planModules, options)` — cross-layer check
- `getEntitlementModules()` — returns modules that should appear in plans
- `ENTITLEMENT_EXEMPT_MODULES` — infrastructure modules always available:
  - staff, security, monitoring, calendar, users, branches, recalls, families
- Strict mode: throws on missing modules
- Audit mode: warn-only with structured logging

#### 17.4 Auto Self-Healing Engine (Feature 3)

- `backend/src/core/auth/autoFixPermissions.js`
- Runs on every server boot (after DB connect, before listen)
- Scans ALL Role documents in MongoDB
- For each role: adds missing SSOT module/action fields with default `false`
- SAFETY: Missing permissions always default to `false` (DENIED) — never auto-grants
- Stamps `permissionVersion` on healed roles
- Only saves roles that were actually modified
- Fully idempotent — safe to run on every boot
- Structured logging: `AUTO_HEAL_ROLE_FIXED`, `AUTO_HEAL_COMPLETE`
- Performance: single `find({})` + conditional saves

**Wired into:**
- `backend/server.js` boot sequence (non-fatal — logs error if fails, continues boot)

#### 17.5 Role Versioning System (Feature 4)

- `PERMISSION_VERSION` constant in `permissionRegistry.js` (starts at 2)
- `permissionVersion` field added to `Role.js` Mongoose schema (default: PERMISSION_VERSION)
- Auto-heal upgrades roles where `permissionVersion < PERMISSION_VERSION`
- Version bumped when SSOT shape changes (new modules, renamed actions, removed actions)

**Lifecycle:**
```
1. Developer adds P.INVENTORY_READ to orgPermissions.js
2. Developer bumps PERMISSION_VERSION from 2 → 3
3. On next server boot: autoFixPermissions() detects version < 3
4. All Role documents patched with inventory field, stamped version=3
5. No migration script needed — self-heals automatically
```

#### 17.6 Permission Debug Panel (Feature 5)

**Backend API:**
- `backend/src/core/auth/permissionDebug.controller.js`
- `GET /api/v1/org/debug/permissions` — returns RBAC × Entitlement × Final matrix
- Guarded: `security.manage` capability
- Production safety: returns 403 in `NODE_ENV=production`
- Returns: user info, permissionVersion, roleVersion, versionMatch, matrix, moduleSummary

**Frontend:**
- `frontend/src/components/CapabilityDebugger.jsx` — v3.0 with tabs
- Overview tab: user info, subscription, resolution summary, capabilities, modules, features
- Permission Matrix tab: every SSOT key grouped by module, color-coded
  - R = RBAC (granted/denied)
  - E = Entitlement (enabled/blocked)
  - Final = R ∧ E
- Module status indicators: ● (all granted), ◐ (partial), ○ (none)
- Toggle: Ctrl+Shift+D (dev only)

#### 17.7 Files Created

| File | Purpose |
|------|---------|
| `backend/src/rbac/permissionValidator.js` | Boot-time SSOT key validation |
| `backend/src/core/entitlements/validateEntitlementSync.js` | Cross-layer plan module sync check |
| `backend/src/core/auth/autoFixPermissions.js` | Boot-time self-healing engine |
| `backend/src/core/auth/permissionDebug.controller.js` | Debug API controller |
| `backend/src/core/auth/permissionDebug.routes.js` | Debug API routes |
| `frontend/src/utils/permissionValidator.js` | Frontend SSOT key validation |

#### 17.8 Files Modified

| File | Change |
|------|--------|
| `backend/src/rbac/permissionRegistry.js` | Added PERMISSION_VERSION, deriveModules() |
| `backend/src/shared/models/Role.js` | Added permissionVersion field |
| `backend/src/middleware/requireOrgPermission.js` | Integrated assertValidPermission() |
| `backend/server.js` | Wired autoFixPermissions() into boot |
| `backend/src/routes/orgV1Routes.js` | Mounted debug routes |
| `frontend/src/components/Can.jsx` | Integrated validatePermissionKey() |
| `frontend/src/hooks/useCapability.js` | Integrated validatePermissionKey() |
| `frontend/src/components/CapabilityDebugger.jsx` | v3.0 with permission matrix |

---

### Phase 18 — Auth System Hardening (Route Guards, RBAC Expansion, Frontend Cleanup)

**Date:** 2026-03-22
**Status:** ✅ COMPLETE
**Objective:** Close all remaining authorization gaps across backend route guards, RBAC SSOT coverage, frontend capability exposure, and settings UI. Deliver a fully unified, verified, and controllable authorization system.

#### 18.1 Sub-Phase Summary

| # | Sub-Phase | Scope | Status |
|---|-----------|-------|--------|
| 1 | Route Guard Enforcement | Backend `orgV1Routes.js` | ✅ |
| 2 | RBAC SSOT Expansion | `orgPermissions.js` + PERMISSION_VERSION bump | ✅ |
| 3 | Capability Contract Verification | Platform `PLATFORM_CAPABILITIES` alignment | ✅ |
| 4 | Feature Flag System Verification | `featureRegistry.js` + `unifiedCapabilityMiddleware.js` | ✅ |
| 5 | Frontend Architecture Cleanup | `EntitlementContext` deprecation, Sidebar RBAC | ✅ |
| 6 | Settings Panel UI | RBAC-aware navigation cards | ✅ |
| 7 | SpecKit Synchronization | `spec.md`, `plan.md`, `tasks.md` updates | ✅ |

#### 18.2 Backend Route Guard Enforcement (Sub-Phase 1)

**Problem:** Several org-plane route mounts in `orgV1Routes.js` lacked granular `requireOrgPermission` guards, relying solely on `orgProtect` (authentication-only, no authorization).

**Fix:** Applied `requireOrgPermission(P.*)` guards to all previously unguarded route mounts:

| Route Mount | Guard Applied |
|-------------|---------------|
| `/api/v1/inventory/*` | `P.INVENTORY_READ` |
| `/api/v1/lab/*` | `P.LAB_READ` |
| `/api/v1/communication/*` | `P.COMMUNICATION_READ` |
| `/api/v1/analytics/*` | `P.ANALYTICS_READ` |
| `/api/v1/dashboard/*` | `P.DASHBOARD_READ` |

**Files Modified:**
- `backend/src/routes/orgV1Routes.js`

#### 18.3 RBAC SSOT Expansion (Sub-Phase 2)

**Problem:** `orgPermissions.js` lacked permission constants for 5 modules that had existing backend routes: `inventory`, `lab`, `communication`, `analytics`, `dashboard`.

**Fix:** Added 15 new permission constants to `orgPermissions.js`:

```
inventory.read, inventory.create, inventory.update
lab.read, lab.create, lab.update
communication.read, communication.send
analytics.read, analytics.export
dashboard.read, dashboard.customize
```

**PERMISSION_VERSION bumped:** `2 → 3` in `permissionRegistry.js`

**Auto-Heal Impact:** On next server boot, `autoFixPermissions.js` detects `permissionVersion < 3` on all existing Role documents and patches them with the new module fields (defaulting to `false` — DENIED).

**Files Modified:**
- `backend/src/rbac/orgPermissions.js`
- `backend/src/rbac/permissionRegistry.js`

#### 18.4 Capability Contract Verification (Sub-Phase 3)

**Verification Result:** ✅ ALL CLEAR

All platform-plane routes import `PLATFORM_CAPABILITIES` exclusively from `@contracts/platformContract.cjs.js`. No raw capability strings detected. Governance validators (`validateCapabilities.js`, `validateRoleMatrix.js`, `validateSwaggerAnnotations.js`) all validate against the canonical contract.

#### 18.5 Feature Flag System Verification (Sub-Phase 4)

**Verification Result:** ✅ MATURE

The feature flag infrastructure is fully operational:

| Component | Status |
|-----------|--------|
| `featureRegistry.js` — Platform-level registry with CRUD + hierarchy | ✅ |
| `FeatureFlag.model.js` — MongoDB model with scope + targets + TTL | ✅ |
| `featureFlagMiddleware.js` — Injects `req.featureFlags` into request | ✅ |
| `unifiedCapabilityMiddleware.js` — Merges entitlements + flags → `req.capabilities` | ✅ |
| `requireEntitlement.js` — Route-level entitlement gate | ✅ |
| `featureRegistry.routes.js` — Platform admin CRUD API (guarded) | ✅ |

#### 18.6 Frontend Architecture Cleanup (Sub-Phase 5)

**Changes:**

1. **EntitlementContext Deprecation:**
   - `frontend/src/context/EntitlementContext.jsx` refactored to a thin shim delegating to `FeatureContext`
   - All hooks (`useEntitlements`, `useModuleEnabled`, `useFeatureEnabled`) now proxy to `useFeatures()`
   - No consumers exist — shim prevents breakage from lazy-loaded code

2. **Sidebar RBAC Integration:**
   - `frontend/src/components/dashboard/Sidebar.jsx` now uses `usePermission` for per-item visibility
   - Module entitlement gating via `useFeatures` integrated
   - Admin section items (Staff, Branches, Roles) gated by `users.read`, `branches.read`, `branches.read`

**Files Modified:**
- `frontend/src/context/EntitlementContext.jsx`
- `frontend/src/components/dashboard/Sidebar.jsx`

#### 18.7 Settings Panel UI (Sub-Phase 6)

**New Component:** `frontend/src/pages/org/Settings.jsx`

**Design:**
- Three sections: Administration & Access, Security & Monitoring, Configuration
- Each navigation card gated by `usePermission` (only visible with required capability)
- Colored accent bars per category (blue=admin, orange=security, green=config)
- Badge support for "New" and "Coming Soon" indicators
- Mobile-responsive grid layout

**RBAC Guard Map:**

| Card | Required Permission |
|------|-------------------|
| Staff Management | `users.read` |
| Branches | `branches.read` |
| Roles & Permissions | `users.read` |
| Security Center | `security.manage` |
| Auth Analytics | `security.manage` |
| Organization Branding | `branches.update` |

**Files Created:**
- `frontend/src/pages/org/Settings.jsx`

#### 18.8 Three-Layer Authorization Model (Updated)

After Phase 18, the three-layer model is fully enforced:

```
Layer 1: Entitlement (plan-level)
  └── unifiedCapabilityMiddleware → req.capabilities.modules
  └── Frontend: <FeatureGate module="portal">

Layer 2: RBAC (role-level)
  └── requireOrgPermission(P.PATIENTS_READ) — backend route guard
  └── Frontend: <Can permission="patients.read">
  └── Sidebar: usePermission("patients.read") visibility

Layer 3: Policy (resource-level)
  └── policyMiddleware(P.PATIENTS_READ, { resource, action })
  └── Field-level access: policyEngine.checkFieldAccess()
```

All three layers must pass for a user to access a feature. Missing permissions default to `false` (DENIED).

#### 18.9 Architecture Invariants (Phase 18 Additions)

1. **All org-plane route mounts MUST have `requireOrgPermission` guards** — no authentication-only routes
2. **Every permission constant in `orgPermissions.js` MUST have a corresponding route guard** — orphan permissions are violations
3. **`EntitlementContext` is DEPRECATED** — all new code must use `FeatureContext` / `useFeatures()`
4. **Sidebar items MUST be gated by both entitlement AND RBAC** — `useFeatures` + `usePermission`
5. **Settings page cards MUST be gated by `usePermission`** — no ungated admin navigation

---

### Phase 24 — Features & Modules Control Center (System Intelligence Panel)

**Date:** 2026-03-23
**Status:** ✅ COMPLETE
**Objective:** Build a production-ready "Features & Modules Control Center" — a system intelligence panel that provides full visibility into module states, feature flags, RBAC permissions, entitlement layers, and route guard coverage. Inspired by Stripe, Dentroin, and Notion design patterns.

#### 24.1 Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  FeaturesControlCenter.jsx (Page Orchestrator)               │
│                                                              │
│  Data Sources:                                               │
│    useFeatures() → modules, features, subscription           │
│    useCapabilities() → capabilities (flat permission map)    │
│    moduleRegistry.js → SSOT for module metadata              │
│                                                              │
│  Computed State:                                              │
│    moduleStates[] → enabled | disabled | locked | flagged    │
│    featureRows[] → status, controlSource, riskLevel          │
│    insights{} → activeModules, flagImpact, roleCount, etc.   │
│    warnings[] → plan/permission/flag conflicts               │
│    matrixData{} → roles × permissions (granted/denied/inh.)  │
│                                                              │
│  Child Components:                                           │
│    ControlCenterHeader                                       │
│    SystemWarningBanner                                       │
│    SystemInsightCards                                         │
│    ModulesGrid                                               │
│    FeaturesTable                                             │
│    FeatureInspectorDrawer                                    │
│    EntitlementMatrix                                         │
└──────────────────────────────────────────────────────────────┘
```

#### 24.2 Module Registry (SSOT)

`moduleRegistry.js` serves as the single source of truth for module and feature metadata:

| Field | Type | Purpose |
|-------|------|---------|
| `key` | String | Module identifier (matches FeatureContext keys) |
| `name` | String | Display name |
| `description` | String | Module description |
| `icon` | String | Emoji icon |
| `category` | Enum | clinical / admin / billing / ai |
| `dependencies` | String[] | Required module keys |
| `features` | Object[] | Sub-features with flags and risk levels |
| `riskLevel` | Enum | low / medium / high / critical |

#### 24.3 Module State Resolution

Each module's state is computed from three layers:

```
moduleRegistry.modules[key]
    ↓
FeatureContext.hasModule(key) → Plan entitlement check
    ↓
FeatureContext.hasFeature(key) → Feature flag check
    ↓
State resolution:
  - "enabled"  → plan includes module, no override flags
  - "disabled" → plan excludes module, no lock
  - "locked"   → plan excludes module, upgrade required
  - "flagged"  → feature flag override active
```

#### 24.4 Feature Control Layer

The FeaturesTable renders each feature with its full authorization context:

| Column | Source | Values |
|--------|--------|--------|
| Status | Computed | ● Active (green) / ● Inactive (red) |
| Control Source | FeatureContext | Plan / Admin Toggle / Feature Flag |
| Risk Level | moduleRegistry | Low / Medium / High / Critical |
| Inspect | Action | Opens FeatureInspectorDrawer |

#### 24.5 Feature Inspector Drawer

A slide-in panel that visualizes the complete authorization decision chain for any feature:

```
Decision Chain:
  Step 1: Plan Entitlement    → ✅ PASS / ❌ FAIL
  Step 2: Admin Override       → ✅ PASS / ❌ FAIL
  Step 3: Feature Flag         → ✅ PASS / ❌ FAIL
  Step 4: RBAC Permission     → ✅ PASS / ❌ FAIL

Final Decision:
  ✅ ALLOWED (all layers pass)
  ❌ DENIED (first failing layer shown)
  ⚠️ PARTIAL (some sub-features denied)

JSON Preview:
  Raw permission/entitlement state for debugging
```

#### 24.6 Entitlement Matrix

Interactive role × permission visualization:

| Cell State | Icon | Meaning |
|-----------|------|---------|
| Granted | ✓ (green) | Role has explicit permission |
| Denied | — (gray) | Role does not have permission |
| Inherited | ◆ (blue) | Permission inherited from parent role |

Features:
- Sticky header row and first column for scrollable matrices
- Column/row highlight on hover
- Cell-level interaction for inspection
- Responsive with horizontal scroll

#### 24.7 System Insight Cards

Four KPI cards providing at-a-glance system health:

| Card | Metric | Source |
|------|--------|--------|
| Modules Active | X/Y enabled modules | FeatureContext |
| Feature Flags Impact | Override count or "No overrides" | FeatureContext |
| Role Complexity | Number of custom roles | CapabilityContext |
| Route Guard Coverage | Percentage of guarded routes | Computed |

#### 24.8 System Warning Banner

Detects and surfaces configuration conflicts:
- Missing module dependencies (e.g., orthodontics requires patients)
- Permission/entitlement mismatches
- Stale feature flag overrides
- Expandable detail view with per-conflict explanations

#### 24.9 Component File Map

| Component | Path | Purpose |
|-----------|------|---------|
| `FeaturesControlCenter` | `modules/org/features/pages/` | Page orchestrator |
| `ControlCenterHeader` | `modules/org/features/components/` | Title, plan badge, health indicator |
| `SystemWarningBanner` | `modules/org/features/components/` | Configuration conflict alerts |
| `SystemInsightCards` | `modules/org/features/components/` | 4 KPI insight cards |
| `ModulesGrid` | `modules/org/features/components/` | Module card grid with toggles |
| `FeaturesTable` | `modules/org/features/components/` | Feature table with inspect action |
| `FeatureInspectorDrawer` | `modules/org/features/components/` | Auth decision chain visualizer |
| `EntitlementMatrix` | `modules/org/features/components/` | Role × permission matrix |
| `moduleRegistry` | `modules/org/features/data/` | Module/feature metadata SSOT |
| `features-control-center.css` | `modules/org/features/styles/` | Complete design system (1057 lines) |

#### 24.10 Architecture Compliance

| Rule | Status |
|------|--------|
| Module placement (`modules/org/features/`) | ✅ |
| Layout: renders inside DashboardLayout | ✅ |
| RBAC: `security.manage` route guard | ✅ |
| Tenant isolation: no organizationId sent | ✅ |
| Plane isolation: no platform imports | ✅ |
| Capability checks: `capabilities.includes()` | ✅ |
| No role === "..." comparisons | ✅ |
| RTL support: CSS logical properties | ✅ |
| Design system: dedicated CSS file | ✅ |

#### 24.11 Design System

CSS file (`features-control-center.css`, 1057 lines) implements:
- Custom properties for theming (dark-mode, glass effects)
- Component-specific styles with BEM-like naming (`fcc-*`)
- Micro-animations (pulse, shimmer, slide-in)
- Full RTL support via CSS logical properties
- Responsive breakpoints (768px, 1024px)
- Stripe/Notion-inspired glassmorphism and card shadows

---

### Phase 26 — Features Control Center Backend Refactor (Modular Architecture)

**Date:** 2026-03-23
**Status:** ✅ COMPLETE
**Objective:** Refactor the monolithic `featuresControl.controller.js` (31KB) into a modular, production-grade backend system with separated services, controllers, validators, and routes. Integrate with existing RBAC, Entitlement, Feature Flags, PBAC, and Observability layers.

#### 26.1 Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│  featuresControl.routes.js (Router — 8 endpoints)            │
│    GET  /modules      → modulesCtrl.getModules               │
│    GET  /modules/usage → modulesCtrl.getUsage                │
│    PATCH /modules/:key → modulesCtrl.toggleModule            │
│    GET  /features     → featuresCtrl.getFeatures             │
│    GET  /permissions  → permissionsCtrl.getPermissions       │
│    GET  /conflicts    → conflictsCtrl.getConflicts           │
│    POST /inspect      → inspectorCtrl.inspect                │
│    POST /inspect/batch → inspectorCtrl.inspectBatch          │
├───────────────────────────────────────────────────────────────┤
│  Controllers (thin HTTP handlers)                            │
│    modules.controller.js | features.controller.js            │
│    permissions.controller.js | conflicts.controller.js       │
│    inspector.controller.js                                   │
├───────────────────────────────────────────────────────────────┤
│  Services (pure business logic)                              │
│    modules.service.js     → state resolution + toggle        │
│    features.service.js    → decision chain computation       │
│    permissions.service.js → role × permission matrix          │
│    conflictEngine.service.js → multi-layer conflict scan     │
│    inspector.service.js   → auth pipeline simulation         │
├───────────────────────────────────────────────────────────────┤
│  Validators                                                  │
│    featuresControl.validators.js — input validation          │
├───────────────────────────────────────────────────────────────┤
│  Barrel Export                                               │
│    index.js — re-exports all layers for clean imports        │
└───────────────────────────────────────────────────────────────┘
```

#### 26.2 Service Layer

| Service | File | Responsibility |
|---------|------|----------------|
| `modules.service.js` | `services/` | Module state resolution (enabled/disabled/locked/flagged), usage analytics, module toggle with dependency validation and audit logging |
| `features.service.js` | `services/` | Feature decision chain computation — resolves each feature through Plan → Admin → Flag → RBAC pipeline |
| `permissions.service.js` | `services/` | Live role × permission matrix — loads Role documents from MongoDB, derives modules from SSOT |
| `conflictEngine.service.js` | `services/` | Multi-layer conflict detection — dependency gaps, permission mismatches, stale flags, RBAC gaps |
| `inspector.service.js` | `services/` | Auth decision simulation — evaluates RBAC → Entitlement → PBAC → Field Access for given permission/role |

#### 26.3 Controller Layer

Each controller is a thin HTTP handler that:
1. Extracts parameters from `req`
2. Calls the corresponding service
3. Returns the result with `res.json()`
4. Catches errors and returns structured error responses

| Controller | Endpoints |
|-----------|-----------|
| `modules.controller.js` | `getModules`, `getUsage`, `toggleModule` |
| `features.controller.js` | `getFeatures` |
| `permissions.controller.js` | `getPermissions` |
| `conflicts.controller.js` | `getConflicts` |
| `inspector.controller.js` | `inspect`, `inspectBatch` |

#### 26.4 Validator

`featuresControl.validators.js` exports 4 Express middleware validators:

| Validator | Route | Rules |
|-----------|-------|-------|
| `validateToggleModule` | `PATCH /modules/:key` | `key` must be non-empty string; `enabled` must be boolean |
| `validateInspect` | `POST /inspect` | `permission` required string; `role` optional string; `resourceId` optional string |
| `validateInspectBatch` | `POST /inspect/batch` | `items` required array (max 50); each item has `permission` (required), `role`/`resourceId` (optional) |
| `validateUsageQuery` | `GET /modules/usage` | `from`/`to` optional ISO date strings |

#### 26.5 Route Table

| Method | Path | Guard | Controller | Description |
|--------|------|-------|------------|-------------|
| GET | `/modules` | `SECURITY_READ` | `modulesCtrl.getModules` | Module state resolution |
| GET | `/modules/usage` | `SECURITY_READ` | `modulesCtrl.getUsage` | Usage analytics |
| PATCH | `/modules/:key` | `SECURITY_MANAGE` | `modulesCtrl.toggleModule` | Module enable/disable |
| GET | `/features` | `SECURITY_READ` | `featuresCtrl.getFeatures` | Feature decision chains |
| GET | `/permissions` | `SECURITY_READ` | `permissionsCtrl.getPermissions` | Role × permission matrix |
| GET | `/conflicts` | `SECURITY_READ` | `conflictsCtrl.getConflicts` | Conflict detection |
| POST | `/inspect` | `SECURITY_MANAGE` | `inspectorCtrl.inspect` | Single auth simulation |
| POST | `/inspect/batch` | `SECURITY_MANAGE` | `inspectorCtrl.inspectBatch` | Batch auth simulation |

#### 26.6 Inspector Service (Auth Pipeline Simulation)

The inspector service simulates the full authorization decision pipeline:

```
Input: { permission, role, resourceId? }
    ↓
Step 1: RBAC Check — role has permission in SSOT?
    ↓
Step 2: Entitlement Check — module enabled in org subscription?
    ↓
Step 3: PBAC Check — policy rules allow for resource context?
    ↓
Step 4: Field Access Check — field-level restrictions apply?
    ↓
Output: {
    finalDecision: "ALLOW" | "DENY",
    chain: [{ layer, result, reason }],
    metadata: { evaluatedAt, totalDuration }
}
```

Batch mode processes up to 50 items in parallel and returns aggregate summary.

#### 26.7 Conflict Engine

The conflict engine scans for multi-layer configuration issues:

| Conflict Type | Detection Logic | Severity |
|--------------|----------------|----------|
| Missing dependency | Module A requires B, but B is disabled | critical |
| Permission mismatch | RBAC grants permission for disabled module | warning |
| Stale flag override | Feature flag targets non-existent feature | warning |
| RBAC gap | Module enabled but no role has its permissions | info |
| Circular dependency | Module dependency cycle detected | critical |
| Entitlement drift | Plan includes module not in registry | info |

#### 26.8 Integration Points

| System | Integration |
|--------|------------|
| RBAC | `orgPermissions.js` P enum, `permissionRegistry.js` SSOT |
| Entitlement | `Organization.modules` from DB, plan module check |
| Feature Flags | `FeatureFlag` model queries |
| PBAC | `policyRegistry.js`, `policyEvaluator` for simulation |
| Observability | `authTracePersistence.service` for trace logging |
| Audit | `auditService.createAuditRecord()` for module toggle audit trail |
| Shadow Mode | `shadowMode.js` integration for PBAC simulation |

#### 26.9 Swagger Documentation

All 8 endpoints are documented with full OpenAPI 3.0 JSDoc annotations:
- Request parameters, query params, and request bodies
- Response schemas with property types and enums
- Security requirements (`bearerAuth`)
- Error responses (400, 401, 403)

Swagger tag: `Features Control`

#### 26.10 File Map

| File | Path | Purpose |
|------|------|---------|
| `featuresControl.routes.js` | `organization/featuresControl/` | Router with 8 endpoints + Swagger JSDoc |
| `modules.controller.js` | `organization/featuresControl/controllers/` | Modules HTTP handler |
| `features.controller.js` | `organization/featuresControl/controllers/` | Features HTTP handler |
| `permissions.controller.js` | `organization/featuresControl/controllers/` | Permissions HTTP handler |
| `conflicts.controller.js` | `organization/featuresControl/controllers/` | Conflicts HTTP handler |
| `inspector.controller.js` | `organization/featuresControl/controllers/` | Inspector HTTP handler |
| `modules.service.js` | `organization/featuresControl/services/` | Module state resolution + toggle |
| `features.service.js` | `organization/featuresControl/services/` | Feature decision chains |
| `permissions.service.js` | `organization/featuresControl/services/` | Permission matrix |
| `conflictEngine.service.js` | `organization/featuresControl/services/` | Conflict detection |
| `inspector.service.js` | `organization/featuresControl/services/` | Auth pipeline simulation |
| `featuresControl.validators.js` | `organization/featuresControl/validators/` | Input validation |
| `index.js` | `organization/featuresControl/` | Barrel export |

#### 26.11 Architecture Compliance

| Rule | Status |
|------|--------|
| Module placement (`organization/featuresControl/`) | ✅ |
| RBAC: `SECURITY_READ` / `SECURITY_MANAGE` guards | ✅ |
| Tenant isolation: organizationId from JWT context only | ✅ |
| Plane isolation: no platform imports | ✅ |
| Audit logging: via `auditService.createAuditRecord()` | ✅ |
| Swagger documentation: all 8 endpoints | ✅ |
| Service/controller separation: pure services, thin controllers | ✅ |
| Input validation: Express middleware validators | ✅ |
| Path aliases: `@utils`, `@services`, `@shared` | ✅ |
| No raw capability strings | ✅ |

---

## SECTION 27 — PHASE A+ AUTHORIZATION HARDENING

**Status:** ✅ COMPLETE (March 2026)
**Priority:** P0 — Critical
**Depends on:** Phase A Authorization Stabilization

### 27.1 Overview

Phase A+ extends Phase A stabilization with additional reliability layers:
1. **Fail-fast middleware** (`assertCapabilities.js`) guaranteeing `req.capabilities` presence
2. **Auth trace enhancements** — capability snapshots in trace data
3. **Feature flag dev visibility** — development-only flag logging
4. **Auth health endpoint** — internal monitoring of enforcement state
5. **Organization schema annotations** — `modules` and `features` fields soft-deprecated
6. **Boot-time middleware integrity** — `validateSecurityModes.js` validates middleware loadability

### 27.2 Org-Level Schema Deprecation

`Organization.modules` and `Organization.features` are **soft-deprecated** (Phase A+, March 2026):
- These fields are NO LONGER the SSOT for authorization decisions
- The authoritative source is: `req.capabilities` (resolved by `unifiedCapabilityMiddleware`)
- Fields remain for: platform admin UI writes, legacy reads, provisioning defaults
- Phase C removed `moduleRegistry.js` entirely — all consumers migrated to `featureRegistry.js`

### 27.3 Architecture Compliance

| Rule | Status |
|------|--------|
| Fail-fast guarantee (assertCapabilities) | ✅ |
| Boot-time middleware integrity (validateSecurityModes) | ✅ |
| Auth trace capability snapshots | ✅ |
| Dev-only feature flag logging | ✅ |
| Auth health internal endpoint | ✅ |
| Organization.modules/features soft-deprecated | ✅ |
| No new routes require Swagger (internal endpoint) | ✅ |

---

## SECTION 28 — Phase A++ Authorization Elite Hardening

**Status:** ✅ COMPLETE (March 2026)
**Priority:** P0 — Critical
**Depends on:** Phase A+ Authorization Hardening (§27)

### 28.1 Overview

Phase A++ extends Phase A+ with enterprise-grade observability, security, and performance instrumentation:

1. **Capability hashing** — SHA-256 fingerprint of resolved capabilities for consistency checking
2. **Capability versioning** — `req.capabilitiesVersion = 1` for future schema evolution
3. **Auth trace sampling** — Probabilistic logging of successful requests (100% for errors/denials)
4. **Trace performance instrumentation** — Per-request `durationMs` and `routeGroup` for latency analysis
5. **Feature flag cache metrics** — Hit/miss counters exported via `getCacheStats()`
6. **Auth health endpoint security** — `x-internal-key` header validation when `INTERNAL_API_KEY` is set
7. **Enhanced middleware integrity** — Boot-time checks expanded to `authTraceMiddleware` + `featureFlagMiddleware`

### 28.2 Capability Hashing (`capabilityHash.js`)

| File | Purpose |
|------|---------|
| `utils/capabilityHash.js` | Generates SHA-256 hex digest of capabilities object |

```
hashCapabilities(capabilities) → "a1b2c3..." (first 16 hex chars)
```

- Deterministic: same capabilities produce same hash
- Compact: suitable for logging, caching keys, and cache invalidation signals
- Injected as `req.capabilityHash` by `unifiedCapabilityMiddleware`

### 28.3 Auth Trace Enhancements

**Sampling (Phase A++):**
```
AUTH_TRACE_SAMPLE_RATE = 0.2 (20% of successful requests)
```
- 100% of errors/denials (`statusCode >= 400` or any DENY step) always logged
- Successful requests sampled at configurable rate
- Reduces database load while maintaining full failure visibility

**Performance Instrumentation:**
- `req.authTrace.durationMs` — Total request processing time
- `req.authTrace.routeGroup` — Extracted from URL path (e.g., `patients`, `appointments`)
- `req.capabilityHash` — Compact capability fingerprint in trace data
- `req.capabilitiesVersion` — Schema version for future evolution

### 28.4 Feature Flag Cache Metrics

```javascript
const { getCacheStats } = require("@platform/flags/featureFlagMiddleware");
getCacheStats(); // → { hits: 42, misses: 3 }
```

- Global hit/miss counters for Redis/memory cache operations
- Exposed via `/api/internal/auth-health` response in `featureFlagCache` field
- Enables monitoring of cache efficiency and cold-start detection

### 28.5 Auth Health Endpoint Security (Phase A++)

| Feature | Before (A+) | After (A++) |
|---------|-------------|-------------|
| Authentication | None (internal) | `x-internal-key` header when `INTERNAL_API_KEY` is set |
| `authTraceEnabled` field | Not included | ✅ Included |
| Feature flag cache stats | Not included | ✅ Included via `featureFlagCache` |

When `INTERNAL_API_KEY` env var is set, the endpoint returns 403 for requests without a matching `x-internal-key` header. In development (no `INTERNAL_API_KEY`), the endpoint remains open.

### 28.6 Middleware Integrity Check (Phase A++)

Boot-time loadability validation expanded:

| Middleware | Phase Added |
|-----------|-------------|
| `assertCapabilities` | A+ |
| `unifiedCapabilityMiddleware` | A+ |
| `authTraceMiddleware` | **A++** |
| `featureFlagMiddleware` | **A++** |

Object exports (e.g., `{ featureFlagMiddleware, getCacheStats }`) are accepted as valid — the check validates loadability, not export shape.

### 28.7 Environment Variables (Phase A++)

| Variable | Default | Purpose |
|----------|---------|---------|
| `INTERNAL_API_KEY` | (unset) | When set, auth-health endpoint requires matching `x-internal-key` header |
| `AUTH_TRACE_SAMPLE_RATE` | `0.2` | Fraction of successful requests to persist auth traces (0.0–1.0) |

### 28.8 Architecture Compliance

| Rule | Status |
|------|--------|
| Capability hashing (SHA-256 fingerprint) | ✅ |
| Capability versioning (`req.capabilitiesVersion`) | ✅ |
| Auth trace sampling (100% denials, sampled successes) | ✅ |
| Auth trace performance instrumentation (durationMs, routeGroup) | ✅ |
| Feature flag cache metrics (`getCacheStats`) | ✅ |
| Auth health endpoint security (`x-internal-key`) | ✅ |
| Enhanced middleware integrity (4 middleware checked at boot) | ✅ |
| No frontend changes | ✅ |
| No API contract changes | ✅ |
| No schema-breaking changes | ✅ |

---

## SECTION 29 — PHASE B: RUNTIME MODULE ENGINE

**Status:** ✅ COMPLETE (March 2026)
**Priority:** P0 — Critical
**Depends on:** Phase A++ Authorization Elite Hardening (§28)

### 29.1 Overview

Phase B transforms the backend from a static route-mounting architecture to a dynamic, registry-driven module execution engine. The `MODULE_REGISTRY` (v2.0) becomes the Single Source of Truth (SSOT) for all org-plane business modules — defining their mount paths, middleware strategies, plan eligibility, dependencies, and categories.

**Key principles:**
1. ALL modules are mounted unconditionally at boot time — no database reads during mounting
2. Access control is enforced at REQUEST TIME via `requireModule()` middleware
3. Routes are never mounted or unmounted at runtime — the registry is static and immutable
4. Self-contained modules manage their own middleware chains — the loader skips shared middleware for these
5. Zero business logic changes, zero schema changes, zero UI redesign

### 29.2 Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  MODULE_REGISTRY (v2.0) — SSOT: 20 Modules                   │
│    key, featureKey, entitlementKey, allowedPlans, isCore,      │
│    mountPath, routeFactory, category, selfContained,          │
│    dependencies, description                                  │
└──────────────────────┬────────────────────────────────────────┘
                       │ Boot-time
                       ▼
┌───────────────────────────────────────────────────────────────┐
│  moduleLoader.js (v1.0) — Boot Execution Engine               │
│    1. validateDependencies()  → all deps exist in registry    │
│    2. validateMountPaths()    → no duplicate mount paths       │
│    3. for each (registryKey, moduleDef):                      │
│       a. Environment gate (skip debug in production)          │
│       b. router.use(mountPath, requireModule(key), routes)    │
│       c. Track mounted/skipped counts                         │
│    4. Set global.__ORG_RUNTIME_REGISTERED__ = true            │
│    5. Emit boot summary log                                   │
└──────────────────────┬────────────────────────────────────────┘
                       │ Request-time
                       ▼
┌───────────────────────────────────────────────────────────────┐
│  requireModule(registryKey) — Request-Time Enforcement        │
│    1. Lookup module in registry                               │
│    2. Core modules → pass through                             │
│    3. Plan-gated modules → check org.modules[key] === true    │
│    4. ❌ DENY → 403 MODULE_DISABLED                           │
└───────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌───────────────────────────────────────────────────────────────┐
│  moduleLifecycle.service.js — State Management                │
│    enableModule()   → plan check + dep check + DB write       │
│    disableModule()  → reverse dep check + DB write            │
│    getModuleStatus()→ full registry × org state projection    │
│    bulkSetModules() → atomic plan upgrade/downgrade           │
└───────────────────────────────────────────────────────────────┘
```

### 29.3 Module Registry v2.0 (`moduleRegistry.js`)

The registry defines 20 modules across 5 categories:

| Category | Modules | Count |
|----------|---------|-------|
| **core** | patients, notifications, users, branches, authorization | 5 |
| **clinical** | procedures, treatments, booking, bookingApproval | 4 |
| **financial** | invoices, payments, finance | 3 |
| **intelligence** | analytics, orthodonticCases | 2 |
| **admin** | security, featuresControl, audit, debug | 4 |

**New fields added in v2.0:**

| Field | Type | Purpose |
|-------|------|---------|
| `entitlementKey` | String | Key for `requireEntitlement()` middleware |
| `category` | String | Domain classification (core/clinical/financial/intelligence/admin) |
| `selfContained` | Boolean | Whether module applies its own orgProtect/organizationContext |
| `dependencies` | String[] | Registry keys this module depends on |

**Self-contained modules** (apply their own middleware internally):
- `users`, `branches`, `procedures`, `treatments`, `invoices`, `payments`, `finance`, `orthodonticCases`

**Non-self-contained modules** (rely on parent router's middleware chain):
- `patients`, `notifications`, `authorization`, `booking`, `bookingApproval`, `analytics`, `security`, `featuresControl`, `audit`, `debug`

**Derived constants:**
- `CORE_MODULE_KEYS` — Set of core module registry keys
- `PLAN_GATED_KEYS` — Set of plan-gated module registry keys
- `SELF_CONTAINED_KEYS` — Set of self-contained module registry keys
- `MODULE_CATEGORIES` — Category → module key mapping

**Accessor functions:**
- `getModule(key)` — Returns module definition (null-safe)
- `listModuleKeys()` — Returns all registry keys
- `getModulesByCategory()` — Returns modules grouped by category
- `getModuleByMountPath(path)` — Reverse lookup by mount path
- `getRegistryManifest()` — Serializable manifest (strips function refs)

### 29.4 Module Loader (`moduleLoader.js`)

The boot-time execution engine that replaces `registerOrgRoutes.js`:

**Boot sequence:**
1. `validateDependencies()` — Verifies all module dependency references exist in registry (throws on invalid)
2. `validateMountPaths()` — Ensures no two modules share the same mount path (throws on collision)
3. For each module in `MODULE_REGISTRY`:
   a. Environment gate — skips `debug` module in production
   b. Invokes `routeFactory()` to get the Express Router
   c. Mounts: `router.use("/{mountPath}", requireModule(registryKey), moduleRouter)`
   d. Tracks mounted module in `_mountedModules` array
4. Sets `global.__ORG_RUNTIME_REGISTERED__ = true` for SovereignGuard
5. Sets `_isLoaded = true` (idempotent — rejects duplicate calls)
6. Emits structured boot summary log

**What the loader does NOT do:**
- ✗ Does not dynamically load code from filesystem or database
- ✗ Does not conditionally mount based on DB state
- ✗ Does not modify platform routes
- ✗ Does not bypass orgProtect, subscriptionGuard, or requireEntitlement
- ✗ Does not install or uninstall modules at runtime

**Diagnostic API:**
- `getLoaderHealth()` — Returns `{ isLoaded, mountedCount, skippedCount, totalRegistered, mounted[], skipped[], manifest[] }`
- `isLoaded()` — Returns boolean boot status

### 29.5 Module Lifecycle Service (`moduleLifecycle.service.js`)

Service layer for enabling/disabling modules per organization:

| Operation | Validations | Side Effects |
|-----------|-------------|--------------|
| `enableModule(orgId, key, opts)` | Module exists, not core, plan eligible, deps enabled | `Organization.modules.{key} = true`, audit log |
| `disableModule(orgId, key, opts)` | Module exists, not core, no reverse deps blocking | `Organization.modules.{key} = false`, audit log |
| `getModuleStatus(orgId)` | Org exists | Returns full registry × org state projection |
| `bulkSetModules(orgId, map, opts)` | Per-module validation (skips core) | Atomic `$set` on `modules.*`, audit log |

**Governance rules:**
1. Module toggles are platform-admin-only operations (org_admin can READ, not WRITE)
2. Core modules cannot be disabled (`CORE_MODULE_NO_TOGGLE` error)
3. Plan-gated modules only enable if org's plan allows (`MODULE_PLAN_RESTRICTED` error)
4. Forward dependency check: all deps must be enabled before enabling a module
5. Reverse dependency check: cannot disable a module if other enabled modules depend on it (override with `force: true`)
6. All operations are idempotent (re-enabling an enabled module returns `changed: false`)
7. All mutations increment `Organization.version` and set `modulesUpdatedAt`

### 29.6 Route Architecture Refactoring (`orgV1Routes.js` v3.0)

**Previous (pre-Phase B):** Static mounts with hardcoded `router.use()` calls per module
**Current (Phase B):** Single `loadOrgModules(router)` call mounts all modules from registry

**Routes retained as non-module (infrastructure):**
- `POST /dashboard/action` — `DASHBOARD_MANAGE` guard
- `GET /dashboard/overview` — `DASHBOARD_READ` guard
- `GET /command/search` — AUTH_ONLY
- `GET /context/branches` — AUTH_ONLY
- `POST /context/switch` — AUTH_ONLY
- `GET /context/actions` — AUTH_ONLY
- `GET /context/modules` — AUTH_ONLY
- `GET /capabilities` — AUTH_ONLY
- `GET /settings/profile` — AUTH_ONLY
- `PUT /settings/logo` — AUTH_ONLY
- `PATCH /settings/organization` — Rate-limited
- `POST /billing/checkout-session` — `ACCOUNTING_CREATE` guard

**New diagnostic endpoints (Phase B):**

| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/runtime/manifest` | AUTH_ONLY | Module registry manifest (serializable, no function refs) |
| GET | `/runtime/health` | `DASHBOARD_READ` | Boot-time diagnostic snapshot (mounted/skipped counts, mount paths) |

### 29.7 Legacy Deprecation Strategy (`app.js`)

Eight legacy static mounts in `app.js` are preserved for backward compatibility but now emit deprecation warnings:

| Legacy Path | Superseded By | Module |
|-------------|---------------|--------|
| `/api/v1/users` | `/api/v1/org/users` | users |
| `/api/v1/branches` | `/api/v1/org/branches` | branches |
| `/api/v1/procedures` | `/api/v1/org/procedures` | procedures |
| `/api/v1/treatments` | `/api/v1/org/treatments` | treatments |
| `/api/v1/invoices` | `/api/v1/org/invoices` | invoices |
| `/api/v1/payments` | `/api/v1/org/payments` | payments |
| `/api/v1/finance` | `/api/v1/org/finance` | finance |
| `/api/v1/orthodontic-cases` | `/api/v1/org/orthodontic-cases` | orthodonticCases |

**Deprecation behavior:**
- Requests to legacy paths are still served (zero downtime)
- Deprecation warning logged with structured metadata
- Future phase will remove these legacy mounts after frontend migration completes

### 29.8 Files Created

| File | Purpose |
|------|---------|
| `backend/src/orgRuntime/moduleLoader.js` | Boot-time module execution engine (v1.0) |
| `backend/src/orgRuntime/moduleLifecycle.service.js` | Module enable/disable/status/bulk operations |

### 29.9 Files Modified

| File | Change |
|------|--------|
| `backend/src/orgRuntime/moduleRegistry.js` | **DELETED (Phase C)** — was shim re-exporting from featureRegistry.js; all consumers now import directly |
| `backend/src/routes/orgV1Routes.js` | v3.0: replaced static mounts with `loadOrgModules(router)`; added `/runtime/manifest` and `/runtime/health` endpoints |
| `backend/app.js` | Added deprecation markers and structured logging to 8 legacy static mounts |

### 29.10 Architecture Compliance

| Rule | Status |
|------|--------|
| Module Registry is SSOT for org-plane modules | ✅ |
| All routes mounted unconditionally at boot time | ✅ |
| Access enforced at request time via `requireModule()` | ✅ |
| Self-contained modules manage own middleware | ✅ |
| Boot-time dependency validation (throws on invalid) | ✅ |
| Boot-time mount path collision detection | ✅ |
| Environment gating (debug excluded in production) | ✅ |
| Core modules always accessible | ✅ |
| Plan eligibility enforced on module toggle | ✅ |
| Forward and reverse dependency chains validated | ✅ |
| Audit logging for all module state mutations | ✅ |
| No business logic changes | ✅ |
| No schema changes | ✅ |
| No frontend changes | ✅ |
| Plane isolation (no platform imports) | ✅ |
| Tenant isolation (organizationId from JWT only) | ✅ |
| Swagger documentation for new endpoints | ✅ |
| Zero-downtime migration via legacy deprecation | ✅ |

### 29.11 Architecture Invariants (Phase B Additions)

1. **MODULE_REGISTRY is the SSOT** — all module metadata (mount path, plan eligibility, dependencies) must be defined in the registry
2. **Adding a module requires a code change** — no dynamic code loading, no marketplace, no plugin uploads
3. **Routes are mounted unconditionally** — access control is always at request time, never at mount time
4. **Self-contained flag is immutable once set** — changing a module from self-contained to non-self-contained (or vice versa) requires middleware audit
5. **Legacy paths are deprecated but functional** — removing them requires frontend migration verification first
6. **`requireModule()` MUST be the first middleware** in every module's chain at the org router level
7. **`global.__ORG_RUNTIME_REGISTERED__`** must be set by the module loader — SovereignGuard depends on this flag

---

## SECTION 30 — PHASE B.1: UNIFIED REGISTRY CONSOLIDATION

Phase B.1 eliminates the dual-registry architecture by making `FEATURE_REGISTRY` the single source of truth (SSOT) for all module definitions. `MODULE_REGISTRY` is now dynamically generated from `FEATURE_REGISTRY` at require-time, and `requireModule()` uses `req.capabilities` as the sole access decision source.

### 30.1 Architecture — Before vs After

**Before (Phase B / §29):**
```
FEATURE_REGISTRY (featureRegistry.js)         MODULE_REGISTRY (moduleRegistry.js)
├── Entitlement keys                           ├── Runtime module definitions
├── Schema key mappings                        ├── basePath, routeFactory
├── Core module flags                          ├── selfContained, dependencies
└── Sub-feature capabilities                   └── allowedPlans, categories
                                               TWO independent files, manual sync
```

**After (Phase B.1):**
```
FEATURE_REGISTRY (featureRegistry.js) — SINGLE SOURCE OF TRUTH
├── Entitlement keys + schema mappings
├── Core module flags + sub-feature capabilities
├── Runtime fields: basePath, routeFactory, selfContained
├── Category, dependencies, description
└── Dynamically generates → MODULE_REGISTRY (frozen at require-time)
                          → CORE_MODULE_KEYS, PLAN_GATED_KEYS, SELF_CONTAINED_KEYS
                          → MODULE_CATEGORIES, accessor functions
```

### 30.2 FEATURE_REGISTRY Entry Shape

Each entry in `FEATURE_REGISTRY` now serves THREE roles:

```javascript
{
    // ── Entitlement Pipeline ──
    label:        "Orthodontics",          // Human-readable name
    module:       "orthodontics",          // Canonical application key
    schemaKey:    "orthodonticsAdv",       // PlanVersion.modules field name
    isCore:       false,                   // Core modules bypass entitlement checks
    plans:        ["pro", "enterprise"],   // Plan tiers that include this module
    features:     { viewCases: {...}, aiAnalysis: {...} },  // Sub-features

    // ── Runtime Module Engine ──
    basePath:      "orthodontic-cases",    // URL path segment under /api/v1/org/
    routeFactory:  () => orthodonticCaseRoutes,  // Express Router factory
    selfContained: true,                   // true = module applies own middleware
    category:      "intelligence",         // core | clinical | financial | intelligence | admin
    dependencies:  ["patients"],           // Registry keys this module depends on
    description:   "Orthodontic cases ...", // Admin UI description
}
```

### 30.3 Runtime-Only Entries

Sub-mount modules that share a parent module's entitlement key exist as separate `FEATURE_REGISTRY` entries but are NOT seeded as independent `ModuleDefinition` records:

| Registry Key | Parent Module | Shared schemaKey | Purpose |
|-------------|---------------|------------------|---------|
| `procedures` | `clinical` | `clinical` | Procedure catalog CRUD |
| `treatments` | `clinical` | `clinical` | Treatment plan lifecycle |
| `invoices` | `finance` | `finance` | Invoice management |
| `payments` | `finance` | `finance` | Payment processing |
| `bookingApproval` | `booking` | `booking` | Staff-side booking approval |
| `authorization` | `patients` | `patients` | Permission introspection |

The `featureRegistrySeeder` skips these entries (registry key ≠ canonical module key).

### 30.4 Dynamic MODULE_REGISTRY Generation

`MODULE_REGISTRY` is built from `FEATURE_REGISTRY` entries that have both `basePath` and `routeFactory`:

```javascript
for (const [registryKey, def] of Object.entries(FEATURE_REGISTRY)) {
    if (!def.basePath || !def.routeFactory) continue;
    _moduleRegistryEntries[registryKey] = Object.freeze({
        key:           def.module,
        featureKey:    `module.${def.module}`,
        entitlementKey: def.module,
        allowedPlans:  def.plans,
        isCore:        def.isCore,
        mountPath:     def.basePath,
        category:      def.category || "other",
        selfContained: !!def.selfContained,
        dependencies:  def.dependencies || [],
        description:   def.description || def.label,
        routeFactory:  def.routeFactory,
    });
}
```

### 30.5 Access Control — Capability-First (requireModule v2.0)

`requireModule()` now uses `req.capabilities.modules` as the SSOT:

```
requireModule(registryKey)
    ├── Guard 1: req.user.type === "org"
    ├── Guard 2: req.organization exists
    ├── Guard 3: subscription not suspended
    ├── Guard 4: Core module → pass unconditionally
    ├── Guard 5: req.capabilities.modules[key] === true (SSOT)
    │            ↳ This is the MERGED result of plan entitlements + org flags
    │            ↳ computed by unifiedCapabilityMiddleware
    └── Fallback: org.modules[key] (safety net, logs warning)
```

### 30.6 Boot-Time Registry Validation

`registryValidator.js` validates `FEATURE_REGISTRY` at boot before modules are mounted:

| # | Check | Failure Mode |
|---|-------|-------------|
| 1 | Duplicate `basePath` values | ERROR — would cause Express routing conflicts |
| 2 | Routable module without `routeFactory` | ERROR — route cannot be mounted |
| 3 | `routeFactory` without `basePath` | WARNING — function exists but unreachable |
| 4 | Empty or missing `plans` array | ERROR — no plan can enable this module |
| 5 | Dependency references non-existent key | ERROR — dependency chain broken |
| 6 | Self-referencing dependency | ERROR — circular dependency |
| 7 | Circular dependency chain (DFS) | ERROR — transitive A→B→C→A cycle |
| 8 | Conflicting `isCore` flags for same module key | ERROR — shared module key with inconsistent core flag |
| 9 | Unrecognized plan tier name | WARNING — catches typos (valid: basic, pro, enterprise) |

### 30.6.1 Runtime Dependency Enforcement

`requireEntitlement.js` now enforces module dependencies at request time (Phase C):

```
requireEntitlement(featureKey)
    ├── Core module → ALLOW (bypass)
    ├── capModules[featureKey] === true → check dependencies:
    │     ├── All deps enabled → ALLOW
    │     └── Missing deps → DENY (403 DEPENDENCY_NOT_MET)
    └── capModules[featureKey] !== true → DENY (403 FEATURE_NOT_ENABLED)
```

Dependencies are resolved from `FEATURE_REGISTRY[featureKey].dependencies`. Core dependencies (isCore=true) are always satisfied. Non-core dependencies must be enabled in `req.capabilities.modules`.

### 30.7 Backward Compatibility

| Consumer | Migration Path |
|----------|---------------|
| `moduleRegistry.js` | **Deleted (Phase C)** — all 7 consumers rewired to import from `featureRegistry.js` directly |
| `moduleLoader.js` | Now imports `FEATURE_REGISTRY` and runs `validateRegistry()` at boot |
| `requireModule.js` | **Deleted (Phase 1)** — superseded by `requireEntitlement()` |
| `orgRuntimeGate.js` | **Deleted (Phase 1)** — superseded by `requireEntitlement()` |
| `featureRegistrySeeder.js` | Skips runtime-only entries (registry key ≠ module key) |
| `orgRuntimeController.js` | `getEnabledModules` reads `req.capabilities.modules` (SSOT), not `org.modules` |
| `validateAuthPipeline.js` | Flags `moduleRegistry.js` as deleted legacy file at boot |

### 30.8 Architecture Invariants (Phase B.1 + Phase C Additions)

1. **FEATURE_REGISTRY is the SSOT** — all module metadata lives here; MODULE_REGISTRY is derived
2. **Adding a module requires editing FEATURE_REGISTRY** — `moduleRegistry.js` no longer exists
3. **req.capabilities.modules is the access authority** — `requireEntitlement` performs a single check + dependency enforcement
4. **Core modules bypass all entitlement checks** — no plan validation, no org flags check
5. **Runtime-only entries share parent schemaKey** — never seeded independently
6. **registryValidator runs at boot** — 9 integrity checks prevent malformed registry from accepting traffic
7. **Module dependencies are enforced at runtime** — `requireEntitlement` blocks access if deps are disabled
8. **No dual-registry drift is possible** — the shim has been deleted; there is only one registry

---

## SECTION 31 — PHASE B.2: MODULE RUNTIME MATURITY & ARCHITECTURE OPTIMIZATION

### 31.1 Module Lifecycle Management

Phase B.2 introduces a formal lifecycle management layer on top of the Phase B.1 registry system. Modules now have explicit `enable`, `disable`, `install`, and `uninstall` lifecycle transitions with extensible hook support.

**Files:**

| File | Purpose |
|------|---------|
| `orgRuntime/moduleLifecycle.service.js` | Core lifecycle operations (enable/disable with Organization model update) |
| `orgRuntime/lifecycleHooks.js` | Extensible hook registry for module-specific side effects |

**Lifecycle Hook Architecture:**
```
moduleLifecycle.enableModule(orgId, moduleKey)
    ↓
1. Organization.findByIdAndUpdate({ modules[key] = true })
    ↓
2. lifecycleHooks.triggerHook(moduleKey, "onEnable", { orgId })
    ↓
3. eventBus.emit("module.enabled", { organizationId, moduleKey })
    ↓
4. moduleStateSync updates OrganizationModuleState (async, TTL-gated)
```

**Hook Registry Design:**
- Hooks are registered per-module, per-lifecycle-event in `LIFECYCLE_HOOKS` map
- Separate from the frozen `FEATURE_REGISTRY` to maintain immutability
- Each hook is `async` and wrapped in try/catch — failures are logged but never propagate
- Hook types: `onEnable`, `onDisable`, `onInstall`, `onUninstall`

**Module Hook Registration Example:**
```javascript
registerLifecycleHook("orthodontics", {
    onEnable: async ({ organizationId }) => {
        // Initialize default orthodontic settings
    },
    onDisable: async ({ organizationId }) => {
        // Archive active cases, notify practitioners
    },
});
```

### 31.2 Module State Tracking

Tracks the historical enablement state of every module per organization. This enables platform-level analytics (module adoption, churn) and audit trail for entitlement changes.

**Model: `OrganizationModuleState`**

| Field | Type | Purpose |
|-------|------|---------|
| `organizationId` | ObjectId | Tenant reference |
| `moduleKey` | String | Module identifier from FEATURE_REGISTRY |
| `enabled` | Boolean | Current enablement state |
| `enabledAt` | Date | Last time module was enabled |
| `disabledAt` | Date | Last time module was disabled |
| `lastSyncedAt` | Date | Last TTL-gated sync timestamp |
| `lastChangedBy` | String | Actor who triggered the change |

**Files:**

| File | Purpose |
|------|---------|
| `orgRuntime/models/OrganizationModuleState.model.js` | Mongoose model with compound unique index |
| `orgRuntime/moduleStateSync.service.js` | TTL-gated sync from `req.capabilities.modules` |
| `orgRuntime/subscribers/moduleState.subscriber.js` | EventBus listener for explicit lifecycle events |

**Dual Sync Strategy:**

1. **TTL-Gated Sync (Request Flow):** `unifiedCapabilityMiddleware` calls `syncModuleState()` on every org request. The sync service maintains a `Map<orgId, lastSyncTime>` and only writes to MongoDB if >5 minutes have elapsed. Uses `bulkWrite` with `updateOne` upserts for efficiency.

2. **Event-Driven Sync (Admin Actions):** When `module.enabled` or `module.disabled` events are emitted (from lifecycle service or platform admin actions), the subscriber immediately updates `OrganizationModuleState`.

### 31.3 Module Lifecycle Domain Events

Three new domain events registered in `domainEvents.js` and `schemaRegistry.js`:

| Event | When Emitted | Required Fields | Authorized Emitters |
|-------|-------------|-----------------|---------------------|
| `module.enabled` | Module activated for an org | `organizationId`, `moduleKey` | `moduleLifecycle.service`, `lifecycleHooks` |
| `module.disabled` | Module deactivated for an org | `organizationId`, `moduleKey` | `moduleLifecycle.service`, `lifecycleHooks` |
| `module.installed` | Module first provisioned for an org | `organizationId`, `moduleKey` | `moduleLifecycle.service`, `lifecycleHooks` |

### 31.4 Auth Trace Intelligence (Phase B.2 Enrichment)

The `authTraceMiddleware` now produces two additional data blocks on every traced request:

**Decision Summary (`req.authTrace.summary`):**
```json
{
  "outcome": "ALLOWED",
  "totalSteps": 4,
  "layerVerdicts": {
    "RBAC": { "allow": 1, "deny": 0, "filter": 0 },
    "ENTITLEMENT": { "allow": 1, "deny": 0, "filter": 0 },
    "PBAC": { "allow": 1, "deny": 0, "filter": 0 },
    "FIELD_READ": { "allow": 0, "deny": 0, "filter": 1 }
  },
  "denialReasons": [],
  "moduleAccessed": "patients"
}
```

**Timing Breakdown (`req.authTrace.timing`):**
```json
{
  "totalMs": 23,
  "layers": {
    "RBAC": { "firstMs": 2, "lastMs": 2, "count": 1, "durationMs": 0 },
    "ENTITLEMENT": { "firstMs": 5, "lastMs": 5, "count": 1, "durationMs": 0 },
    "PBAC": { "firstMs": 12, "lastMs": 18, "count": 2, "durationMs": 6 }
  }
}
```

**Use Cases:**
- Dashboard drill-down: which layer denied this request?
- Performance monitoring: which auth layer is slowest?
- Anomaly detection: unusual denial patterns per module

### 31.5 Global Queue Observability

Unified health metrics for all BullMQ queues in the system.

**Files:**

| File | Purpose |
|------|---------|
| `infrastructure/queues/queueMetrics.service.js` | Global queue registry + parallel metrics collection |
| `infrastructure/queues/queueMetrics.boot.js` | Boot-time registration of all known queues |

**Registered Queues:**

| Queue | Source |
|-------|--------|
| `authTraceQueue` | Auth trace async persistence |
| `emailQueue` | Transactional email delivery |
| `communicationQueue` | SMS/WhatsApp/push delivery |

**Metrics Per Queue:**
- `waiting` — jobs awaiting processing
- `active` — currently processing
- `completed` — successfully finished
- `failed` — errored out
- `delayed` — scheduled for future processing
- `isPaused` — queue paused state

**Aggregate Summary:**
```json
{
  "totalQueues": 3,
  "healthy": 3,
  "errored": 0,
  "totalWaiting": 12,
  "totalActive": 2,
  "totalCompleted": 1584,
  "totalFailed": 3,
  "totalDelayed": 0
}
```

### 31.6 Billing Domain Pre-Split

Preparation for decomposing the billing domain into independent bounded contexts.

**Boundary Manifest (`modules/billingDomain/index.js`):**

Defines the public API surface of the billing domain. Cross-domain access must go through this index.

**Current Bounded Contexts:**

| Context | Path | Responsibility |
|---------|------|---------------|
| `organizationFinance` | `billingDomain/organizationFinance/` | Patient invoices, payments, ledger |
| `platformBilling` | `billingDomain/services/` | Stripe webhooks, add-on aggregates, trial monitoring |

**Invariants:**
1. Patient invoices NEVER touch platform billing models
2. Platform billing NEVER reads patient payment records
3. Ledger operations are always transactional (MongoDB sessions)
4. `organizationId` comes from JWT context — never from payload

**Split Roadmap:**
- Phase C: Full separation into invoiceEngine, paymentEngine, ledgerEngine
- Phase D: Independent deployment boundaries (future microservice boundary)

### 31.7 Guard Usage Documentation

Architecture Decision Record created at `docs/architecture/ADR-001-authorization-guard-architecture.md`.

Documents:
- All 4 guard layers (Authentication, RBAC, Entitlement, PBAC)
- Middleware composition order (12 steps)
- Auth-only routes bypass list
- Guard matrix (HTTP method → capability pattern)
- Module runtime engine (5 components)
- Tracing architecture (decision summary + timing breakdown)

### 31.8 Architecture Invariants (Phase B.2 Additions)

1. **Lifecycle hooks are separate from FEATURE_REGISTRY** — frozen entries remain immutable
2. **Module state sync is TTL-gated** — max 1 DB write per 5 minutes per organization
3. **Event subscribers are idempotent** — repeated events produce the same state
4. **Auth trace enrichment is non-blocking** — failures never affect the request
5. **Queue metrics collection is fault-isolated** — one queue failure doesn't block others
6. **Billing domain boundary is enforced at the index level** — cross-domain import violations are detectable
7. **Domain events are schema-validated** — moduleLifecycle events pass through schemaRegistry validation

---

## SECTION 32 — PHASE 1: AUTHORIZATION PIPELINE STABILIZATION

Phase 1 refactors the backend authorization system to enforce a single, deterministic pipeline. Legacy middleware is deleted, all route files are migrated to the canonical guards, and new infrastructure is added for centralized authorization composition and boot-time validation.

### 32.1 Problem Statement

The authorization system had accumulated multiple legacy middleware files that were partially deprecated but still imported in various route files:

| Legacy File | Original Purpose | Replacement |
|-------------|-----------------|-------------|
| `permissionMiddleware.js` | Role-based permission check | `requireOrgPermission` |
| `moduleGuard.js` | Module entitlement gate | `requireEntitlement` |
| `moduleMiddleware.js` | Module access control | Orphaned — no imports |
| `orgRuntimeGate.js` | Runtime module gate | `requireEntitlement` |
| `requireModule.js` | Module access check (v1) | `requireEntitlement` |

This created:
- Inconsistent authorization enforcement across routes
- Multiple code paths for the same authorization decision
- Drift between the intended pipeline and actual execution order
- Risk of silent authorization bypass

### 32.2 Canonical Authorization Pipeline (Post-Stabilization)

```
Global middleware (mounted on /api/v1/org router):
  1. subscriptionGuard
  2. authMiddleware (protect)
  3. featureFlagMiddleware
  4. branchContextMiddleware
  5. unifiedCapabilityMiddleware → req.capabilities
  6. assertCapabilities (fail-fast)
  7. ssotEnforcer (dev warning)

Per-route middleware (via authorize() or direct):
  8. requireEntitlement(module)   → plan-level module gate
  9. requireFeature(feature)      → sub-feature gate (optional)
 10. requireOrgPermission(perm)   → RBAC permission check
 11. policyMiddleware(resource)   → PBAC context check (optional)
```

### 32.3 authorize.js — Centralized Authorization Wrapper

**File:** `backend/src/middleware/authorize.js`

A single function that composes the deterministic authorization chain. All org-plane routes SHOULD use this wrapper to ensure consistent middleware ordering.

**Signature:**
```javascript
authorize({ module, feature, permission }) → RequestHandler[]
```

**Parameters:**
| Parameter | Type | Required | Purpose |
|-----------|------|----------|---------|
| `module` | string | No | Module entitlement key (e.g., `"patients"`) |
| `feature` | string | No | Sub-feature key (e.g., `"orthodontics.aiAnalysis"`) |
| `permission` | string | No | RBAC permission (e.g., `"patients.read"`) |

At least one parameter must be provided. Returns a spread-ready middleware array:

```javascript
router.get("/patients",
    ...authorize({ module: "patients", permission: "patients.read" }),
    controller.list
);
```

**Pipeline Composition:**
1. If `module` provided → `requireEntitlement(module)`
2. If `feature` provided → `requireFeature(feature)`
3. If `permission` provided → `requireOrgPermission(permission)`

### 32.4 ssotEnforcer.js — SSOT Violation Detector

**File:** `backend/src/middleware/ssotEnforcer.js`

Development-only middleware that detects code paths still accessing the deprecated `req.organization.modules` field instead of `req.capabilities.modules`.

**Behavior:**
| Environment | Action |
|-------------|--------|
| `production` | No-op (zero overhead, immediate `next()`) |
| `development`/`staging` | Logs `SSOT_ENFORCER_WARNING` if `req.organization.modules` is present |

**Mount Order:** After `assertCapabilities`, before per-route guards.

**Log Output:**
```json
{
  "event": "SSOT_ENFORCER_WARNING",
  "organizationId": "...",
  "endpoint": "GET /api/v1/org/patients",
  "hasCapabilities": true
}
```

### 32.5 validateAuthPipeline.js — Boot-Time Pipeline Validator

**File:** `backend/src/config/validateAuthPipeline.js`

Runs at server startup to:
1. Log the expected 11-step authorization pipeline order (visual box format)
2. Check for the existence of 6 legacy middleware files that should have been deleted

**Legacy Files Checked:**
| File | Expected State |
|------|---------------|
| `requireModule.js` | DELETED |
| `moduleRegistry.js` | DELETED |
| `orgRuntimeGate.js` | DELETED |
| `permissionMiddleware.js` | DELETED |
| `moduleMiddleware.js` | DELETED |
| `moduleGuard.js` | DELETED |

**Strict Mode:** When `SECURITY_STRICT_BOOT=true`, any existing legacy file causes the server to crash with an error. In non-strict mode, a warning is logged.

### 32.6 Route Migration Summary

All route files were migrated from legacy guards to the canonical pipeline:

| Route File | Before | After |
|-----------|--------|-------|
| `recallRoutes.js` | `permissionMiddleware` | `requireOrgPermission` |
| `familyRoutes.js` | `permissionMiddleware` | `requireOrgPermission` |
| `appointmentRoutes.js` | `permissionMiddleware` | `requireOrgPermission` |
| `organizationRoutes.js` | `roleMiddleware` | `requireOrgPermission(P.STAFF_MANAGE)` |
| `addOnRoutes.js` | `roleMiddleware` | `requireOrgPermission(P.ACCOUNTING_*)` |
| `moduleLoader.js` | `requireModule` | `requireEntitlement` |
| `registerOrgRoutes.js` | `requireModule` | `requireEntitlement` (deprecated) |

### 32.7 Files Created (Phase 1)

| File | Purpose |
|------|---------|
| `backend/src/middleware/authorize.js` | Deterministic auth chain builder |
| `backend/src/middleware/ssotEnforcer.js` | Dev-only SSOT violation detector |
| `backend/src/config/validateAuthPipeline.js` | Boot-time pipeline order logging + legacy file check |

### 32.8 Files Deleted (Phase 1)

| File | Reason |
|------|--------|
| `backend/src/middleware/permissionMiddleware.js` | Superseded by `requireOrgPermission` |
| `backend/src/middleware/moduleGuard.js` | Superseded by `requireEntitlement` |
| `backend/src/middleware/moduleMiddleware.js` | Orphaned — no imports |
| `backend/src/middleware/orgRuntimeGate.js` | Superseded by `requireEntitlement` |
| `backend/src/orgRuntime/requireModule.js` | Superseded by `requireEntitlement` |

### 32.9 Files Modified (Phase 1)

| File | Change |
|------|--------|
| `backend/src/routes/recallRoutes.js` | `permissionMiddleware` → `requireOrgPermission` |
| `backend/src/routes/familyRoutes.js` | `permissionMiddleware` → `requireOrgPermission` |
| `backend/src/routes/appointmentRoutes.js` | `permissionMiddleware` → `requireOrgPermission` |
| `backend/src/routes/organizationRoutes.js` | `roleMiddleware` → `requireOrgPermission` with `P.*` constants |
| `backend/src/routes/addOnRoutes.js` | `roleMiddleware` → `requireOrgPermission` with `P.*` constants |
| `backend/src/orgRuntime/moduleLoader.js` | `requireModule` → `requireEntitlement` |
| `backend/src/orgRuntime/registerOrgRoutes.js` | Updated to use `requireEntitlement`, marked deprecated |
| `backend/app.js` | Mounted `ssotEnforcer` in org middleware chain |
| `backend/server.js` | Added `validateAuthPipeline()` boot-time call |
| `backend/src/middleware/assertCapabilities.js` | Comment updated (removed `moduleGuard` reference) |

### 32.10 Architecture Compliance

| Rule | Status |
|------|--------|
| Single deterministic pipeline | ✅ |
| No legacy guard middleware exists | ✅ |
| All routes use `requireOrgPermission` with `P.*` constants | ✅ |
| `authorize()` wrapper available for composed chains | ✅ |
| Boot-time pipeline validation at startup | ✅ |
| Dev-only SSOT violation detector active | ✅ |
| Zero router-level middleware changes | ✅ |
| No frontend changes required | ✅ |
| Plane isolation maintained | ✅ |
| Tenant isolation maintained | ✅ |

### 32.11 Architecture Invariants (Phase 1 Additions)

1. **One pipeline, one path** — all org-plane authorization flows through `requireEntitlement → requireFeature → requireOrgPermission` (no alternatives exist)
2. **`authorize()` is the recommended entry point** — routes SHOULD use `authorize({ module, permission })` for consistency
3. **Legacy middleware must not be re-created** — `validateAuthPipeline` detects and warns/fails if any re-appear
4. **SSOT enforcement is mandatory in development** — `ssotEnforcer` must be mounted to prevent `req.organization.modules` regression
5. **Strict boot mode is CI-mandatory** — `SECURITY_STRICT_BOOT=true` should be set in CI/CD to catch legacy file resurrection
6. **Permission constants are mandatory** — all routes must use `P.*` constants from `orgPermissions.js`, never raw permission strings

---

## SECTION 33 — PHASE B CRITICAL CLEANUP (PRE-REGISTRY ENFORCEMENT)

**Date:** 2026-03-23
**Prerequisite for:** Module Registry Unification (Phase B), featureRegistry consolidation
**Status:** ✅ COMPLETE

### 33.1 Problem Statement

Before proceeding with Phase B module registry enforcement, four architectural violations needed to be eliminated:
1. Possible reads of `req.organization.modules` (legacy DB fallback)
2. `createOrganization` route violating plane isolation (org plane → should be platform)
3. Dead middleware file (`roleMiddleware.js`) left in codebase after Phase 1 migration
4. Potential authorization inconsistencies across route files

### 33.2 Task 1 — `req.organization.modules` Audit (SSOT Enforcement)

**Result:** ✅ NO RUNTIME VIOLATIONS FOUND

Full codebase scan for `req.organization.modules` and `organization.modules` identified only two occurrences, both **intentional**:

| File | Line | Usage | Action |
|------|------|-------|--------|
| `middleware/ssotEnforcer.js` | 46 | Detection logic — reads `org.modules` to **warn** about legacy usage | ✅ Correct — this is the enforcer's purpose |
| `middleware/requireEntitlement.js` | 18 | JSDoc comment documenting the **removed** legacy fallback | ✅ Correct — documentation only |

**Invariant enforced:** No runtime business logic reads `req.organization.modules`. All module access goes through `req.capabilities.modules` (SSOT).

### 33.3 Task 2 — `createOrganization` Plane Violation Fix

**Problem:** `POST /` on `organizationRoutes.js` exposed `createOrganization` — a platform-level action — in the org plane with `orgProtect` + `requireOrgPermission(P.STAFF_MANAGE)` guards.

**Resolution:** Route and import **removed** from `organizationRoutes.js`.

**Canonical endpoint already exists:**
```
POST /api/platform/organizations
Guards: platformProtect → superAdminOnly → authorizePlatformPermission(MANAGE_ORGANIZATIONS) → validate(provisionOrgSchema)
Handler: createOrganizationProvisioned
```

**Files modified:**
| File | Change |
|------|--------|
| `backend/src/routes/organizationRoutes.js` | Removed `createOrganization` import and `router.post("/", ...)` route definition |

**Remaining routes in `organizationRoutes.js`:**
- `PUT /appointment-settings` — org admin settings
- `GET /settings` — read org CMS settings
- `PUT /settings` — update org CMS settings
- `POST /billing/portal` — billing portal URL generation

### 33.4 Task 3 — `roleMiddleware.js` Removal

**Problem:** `roleMiddleware.js` was a legacy role-based authorization middleware superseded by `requireOrgPermission` in Phase 1. Zero imports remained after Phase 1 migration.

**Resolution:**
- File content replaced with **tombstone** that throws on import
- Added to `validateAuthPipeline.js` REMOVED_FILES array for boot-time detection

**Tombstone content:**
```javascript
throw new Error("roleMiddleware.js is DELETED. Use requireOrgPermission instead.");
```

**Boot-time validation:** `validateAuthPipeline.js` now checks for 7 legacy files (was 6):
```
requireModule.js, moduleRegistry.js, orgRuntimeGate.js,
permissionMiddleware.js, moduleMiddleware.js, moduleGuard.js,
roleMiddleware.js  ← NEW
```

### 33.5 Task 4 — Authorization Consistency Scan

**Result:** ✅ ALL ROUTES CONSISTENT

Scan of all `requireOrgPermission(`, `requireEntitlement(`, and `requireFeature(` usages confirmed:
- All org-plane routes use `P.*` permission constants
- All module-gated routes include `requireEntitlement()` at router or mount level
- No route skips entitlement when a module context exists
- No raw role comparisons (`role === "admin"`) found in route files
- Authorization remains deterministic across the codebase

### 33.6 Architecture Compliance

| Check | Status |
|-------|--------|
| No `req.organization.modules` in runtime logic | ✅ |
| No plane violations in org route files | ✅ |
| No dead middleware files with functional code | ✅ |
| Authorization deterministic across all routes | ✅ |
| Boot-time validation updated | ✅ |
| SpecKit synchronized | ✅ |

---

## SECTION 34 — POLICY-BASED ACCESS CONTROL (PBAC) COMPLETION

**Phase:** D — Security Hardening
**Priority:** P0 — Critical
**Date Completed:** 2026-03-24
**Depends on:** §6 (RBAC Architecture), §33 (Authorization Stabilization)

### 34.1 Problem Statement

RBAC alone provides coarse-grained authorization — a user with `patients.update` permission can update **any** patient in any branch. This is insufficient for a multi-branch dental SaaS where:

- **Cross-branch isolation** — A receptionist at Branch A should not modify patients belonging to Branch B
- **Resource ownership** — A doctor should only update treatments they are assigned to
- **Status-based immutability** — Paid invoices and completed payments must be edit-locked
- **Role-based escalation prevention** — Users should not be able to escalate their own role
- **Domain-specific access patterns** — Lab technicians need access to orthodontic cases they're assigned to, but not patient financial records

PBAC adds a **resource-level policy evaluation layer** on top of the existing RBAC permission check, enabling fine-grained access control without modifying the core permission model.

### 34.2 Final Authorization Pipeline

The complete org-plane authorization chain, from request to handler:

```
Request
  ↓
orgProtect (JWT verification, user hydration)
  ↓
organizationContext (inject organizationId, branchId)
  ↓
subscriptionGuard (contract status, entitlements)
  ↓
featureFlagMiddleware (runtime feature toggles)
  ↓
unifiedCapabilityMiddleware (merge plan + org capabilities)
  ↓
assertCapabilities (fail-fast: 500 if req.capabilities missing)
  ↓
ssotEnforcer (dev-only: warn on legacy data path access)
  ↓
requireEntitlement(key) (module gating: patients, orthodontics, etc.)
  ↓
requireFeature(subFeatureKey) (sub-feature gating: orthodontics.aiAnalysis)
  ↓
requireOrgPermission(P.XXX) (RBAC: does user's role have this permission?)
  ↓
policyMiddleware(P.XXX, getResource?) (PBAC: policy evaluation against context)
  ↓
fieldFilterMiddleware / fieldWriteGuardMiddleware (field-level access control)
  ↓
Controller / Handler
```

**Key invariant:** `policyMiddleware` ALWAYS runs AFTER `requireOrgPermission`. A user must first pass the role-based check before policy-level conditions are evaluated.

### 34.3 PBAC Architecture

The PBAC engine consists of four components:

| Component | File | Responsibility |
|-----------|------|---------------|
| **Policy Registry** | `backend/src/rbac/policyRegistry.js` | Defines policy rules per permission (the "what") |
| **Policy Conditions** | `backend/src/rbac/policyConditions.js` | Reusable condition functions (the "how") |
| **Policy Evaluator** | `backend/src/rbac/policyEvaluator.js` | Priority-sorted rule evaluation engine (the "engine") |
| **Policy Middleware** | `backend/src/rbac/policyMiddleware.js` | Express middleware connecting evaluator to routes (the "bridge") |

**Supporting infrastructure:**

| Component | File | Responsibility |
|-----------|------|---------------|
| **Coverage Validator** | `backend/src/rbac/validators/policyCoverageValidator.js` | Boot-time check: all permissions have policies |
| **Field Filter** | `backend/src/rbac/fieldFilter.js` | Response field filtering based on role |
| **Field Write Guard** | `backend/src/rbac/fieldWriteGuard.js` | Request body field restriction based on role |

```
policyMiddleware(permission, getResource?)
    │
    ├── Fetch resource (optional, via getResource callback)
    │
    ├── Build context: { user, resource, branchId, organizationId, method, path, timestamp }
    │
    ├── policyEvaluator.evaluatePolicy(permission, context)
    │   │
    │   ├── Lookup rules from policyRegistry[permission]
    │   ├── Sort by priority (highest first)
    │   ├── Evaluate each condition
    │   │   ├── First "deny" match → DENY (immediate)
    │   │   ├── First "allow" match → ALLOW
    │   │   └── No match → IMPLICIT DENY
    │   │
    │   └── No policy defined?
    │       ├── Write permission → STRICT DENY
    │       └── Read permission → ALLOW (base RBAC sufficient)
    │
    ├── Shadow mode? → Log decision, allow request
    └── Enforce mode? → Block if denied
```

### 34.4 Policy Rule Model

Each policy rule follows this structure:

```javascript
{
    effect: "allow" | "deny",          // What happens when condition matches
    description: string,               // Human-readable — used in audit logs
    condition: (ctx) => boolean,       // Synchronous evaluator (from policyConditions.js)
    priority: number,                  // Higher = checked first
}
```

**Priority conventions:**

| Range | Usage | Example |
|-------|-------|---------|
| 110+ | Hard deny (status-based immutability) | Cannot update paid invoices |
| 100 | org_admin full access | Admins bypass branch/ownership checks |
| 90 | Domain role (doctor with scope) | Doctor can update own treatments |
| 85 | Specialized role (lab tech) | Lab tech can update assigned cases |
| 80 | Branch-scoped access | Receptionist in same branch |

**Evaluation semantics:**
1. Rules are sorted by priority (descending)
2. First matching `deny` rule → **DENY** (immediately, no further evaluation)
3. First matching `allow` rule → **ALLOW**
4. No matching rule → **IMPLICIT DENY** (fail-closed)

### 34.5 Policy Condition Library

All conditions are centralized in `policyConditions.js`. **No inline role checks or ad-hoc comparisons are permitted in policy definitions.**

**Role conditions:**

| Condition | Logic |
|-----------|-------|
| `isOrgAdmin` | `user.roleId.name === "org_admin"` |
| `isDoctor` | `user.roleId.name === "doctor"` |
| `isAssistant` | `user.roleId.name === "assistant"` |
| `isReceptionist` | `user.roleId.name === "receptionist"` |
| `isLabTechnician` | `user.roleId.name === "lab_technician"` |
| `hasRole(role)` | Higher-order: any role name |

**Ownership conditions:**

| Condition | Logic |
|-----------|-------|
| `isOwner` | `resource.createdBy === user._id` (or `userId`, `doctorId`) |
| `isAssignedDoctor` | `resource.doctorId === user._id` (or `assignedDoctor`) |
| `isOwnerOrAssigned` | `isOwner OR isAssignedDoctor` |

**Branch conditions:**

| Condition | Logic |
|-----------|-------|
| `isSameBranch` | `resource.branchId === ctx.branchId` |
| `hasFullBranchAccess` | `user.hasFullBranchAccess === true` |
| `hasBranchAccess` | `hasFullBranchAccess OR isSameBranch` |
| `listOrSameBranch` | No resource (list) → allow; resource → `isSameBranch` |
| `listOrBranchAccess` | No resource (list) → allow; resource → `hasBranchAccess` |

**Status conditions:**

| Condition | Logic |
|-----------|-------|
| `resourceHasStatus(...statuses)` | `statuses.includes(resource.status)` |
| `isDraft` | `resourceHasStatus("draft")` |
| `isFinalized` | `resourceHasStatus("finalized", "reconciled", "paid", "voided", "completed", "refunded")` |

**Combinators:**

| Combinator | Logic |
|-----------|-------|
| `allOf(...fns)` | AND — all conditions must match |
| `anyOf(...fns)` | OR — at least one must match |
| `not(fn)` | Negation |

### 34.6 Policy Coverage Matrix

All policies defined in `policyRegistry.js`:

| Module | Read | Create | Update | Delete | Other |
|--------|------|--------|--------|--------|-------|
| Patients | ✅ `patients.read` | ✅ `patients.create` | ✅ `patients.update` | ✅ `patients.delete` | — |
| Appointments | ✅ `appointments.read` | ✅ `appointments.create` | ✅ `appointments.update` | ✅ `appointments.delete` | — |
| Invoices | ✅ `invoices.read` | ✅ `invoices.create` | ✅ `invoices.update` | ✅ `invoices.delete` | — |
| Payments | ✅ `payments.read` | ✅ `payments.create` | ✅ `payments.update` | ✅ `payments.delete` | — |
| Procedures | ✅ `procedures.read` | ✅ `procedures.create` | ✅ `procedures.update` | ✅ `procedures.delete` | — |
| Treatments | ✅ `treatments.read` | ✅ `treatments.create` | ✅ `treatments.update` | ✅ `treatments.delete` | — |
| Orthodontics | ✅ `orthodontics.read` | ✅ `orthodontics.create` | ✅ `orthodontics.update` | ✅ `orthodontics.delete` | — |
| Users | ✅ `users.read` | ✅ `users.create` | ✅ `users.update` | ✅ `users.delete` | — |
| Branches | ✅ `branches.read` | ✅ `branches.create` | ✅ `branches.update` | ✅ `branches.delete` | — |
| Recalls | ✅ `recalls.read` | ✅ `recalls.create` | ✅ `recalls.update` | ✅ `recalls.delete` | — |
| Families | ✅ `families.read` | ✅ `families.create` | ✅ `families.update` | ✅ `families.delete` | — |
| Accounting | ✅ `accounting.read` | ✅ `accounting.create` | ✅ `accounting.update` | ✅ `accounting.delete` | — |
| Inventory | ✅ `inventory.read` | ✅ `inventory.create` | ✅ `inventory.update` | ✅ `inventory.delete` | — |
| Lab | ✅ `lab.read` | ✅ `lab.create` | ✅ `lab.update` | ✅ `lab.delete` | — |
| Portal | ✅ `portal.read` | — | — | — | ✅ `portal.manage` |
| Monitoring | — | — | — | — | ✅ `monitoring.review` |
| Security | ✅ `security.read` | — | — | — | ✅ `security.manage` |
| Staff | — | — | — | — | ✅ `staff.manage` |
| Communication | ✅ `communication.read` | — | — | — | ✅ `communication.send`, `communication.manage` |
| Analytics | ✅ `analytics.read` | — | — | — | ✅ `analytics.export` |
| Dashboard | ✅ `dashboard.read` | — | — | — | ✅ `dashboard.manage` |
| Support | ✅ `support.read` | ✅ `support.create` | — | — | — |
| Storage | ✅ `storage.read` | — | — | — | — |
| Calendar | ✅ `calendar.read` | — | — | — | ✅ `calendar.multiBranch`, `calendar.selfFilter` |

### 34.7 Route-Level Enforcement Matrix

Routes that have `policyMiddleware` wired:

| Route File | Endpoints | Permission(s) | Resource Fetcher |
|-----------|-----------|---------------|------------------|
| `patientDomain.routes.js` | 14 write+read routes | `patients.*`, `portal.manage` | `Patient.findById(req.params.id)` |
| `orthodonticCase.routes.js` | 8 routes | `orthodontics.*` | `OrthodonticCase.findById(req.params.id)` |
| `treatments.routes.js` | 4 write routes | `treatments.*` | `Treatment.findById(req.params.id)` |
| `procedures.routes.js` | 3 write routes | `procedures.*` | `Procedure.findById(req.params.id)` |
| `payments.routes.js` | 1 write route | `payments.create` | — |
| `users.routes.js` | 3 write routes | `users.*` | `User.findById(req.params.id)` |
| `authorization.routes.js` | 4 routes | `staff.manage` | — |
| `finance.routes.js` | 3 read routes | `accounting.read` | — |
| `analytics.routes.js` | 1 read route | `accounting.read` | — |
| `auditTimeline.routes.js` | 7 read routes | `security.read` | — |
| `portalMonitoring.routes.js` | 6 staff-facing routes | `portal.read`, `portal.manage`, `monitoring.review` | — |

**Routes intentionally excluded from `policyMiddleware`:**
- Patient-facing routes (`patientProtect`) — not subject to org RBAC/PBAC
- Auth routes (`/auth/*`, `/me*`, `/capabilities`) — authentication-only, pre-authorization
- Public routes (intake, portal activation) — no authentication required

### 34.8 Enforcement Modes

| Mode | Env Variable | Behavior |
|------|-------------|----------|
| **Shadow** | `POLICY_SHADOW_MODE=true` | Evaluate policies, **log** decisions, **allow** all requests regardless of policy verdict |
| **Enforce** | `POLICY_SHADOW_MODE=false` | Evaluate policies, **enforce** decisions — deny blocks the request with `403` |

**Shadow mode log format:**
```json
{
    "event": "POLICY_SHADOW_MODE",
    "permission": "patients.update",
    "allowed": false,
    "effect": "implicit_deny",
    "reason": "No matching policy rule — implicit deny",
    "userId": "ObjectId",
    "method": "PUT",
    "path": "/api/v1/patient/domain/:id",
    "resourceId": "ObjectId"
}
```

**Cutover procedure:**
1. Deploy with `POLICY_SHADOW_MODE=true`
2. Monitor logs for unintended denials (>48h observation window)
3. Fix any false denials (missing conditions or incorrect policies)
4. Set `POLICY_SHADOW_MODE=false` to activate enforcement
5. Monitor 403 responses for regression

### 34.9 Strict-Deny Semantics

The `policyEvaluator` implements **strict-deny for write operations**:

```
Permission has no policy defined?
    ├── Write permission (.create, .update, .delete, .manage, .review, .send, .export)
    │   └── DENIED — "strict_deny" — no unprotected writes allowed
    └── Read permission (.read)
        └── ALLOWED — "no_policy" — base RBAC is sufficient for reads
```

**Write suffixes enforced:** `.create`, `.update`, `.delete`, `.manage`, `.review`, `.send`, `.export`

This ensures that any new permission added to the system is automatically denied for write operations until an explicit policy is defined, preventing accidental over-permission.

### 34.10 Boot-Time Coverage Validation

`policyCoverageValidator.js` runs at server startup to verify policy coverage:

```javascript
// Modes:
validatePolicyCoverage("write");  // Default: check write permissions only
validatePolicyCoverage("all");    // Full: check all permissions
```

**Write mode (default):** Warns if any write permission lacks a policy definition.
**All mode:** Warns if any permission (read or write) lacks a policy definition.

This validator supplements the runtime strict-deny by catching coverage gaps at boot time rather than at request time.

### 34.11 PBAC Invariants

The following invariants MUST be maintained:

| # | Invariant | Enforcement |
|---|-----------|-------------|
| 1 | All policy conditions MUST use `policyConditions.js` helpers — no inline role checks | Code review + CI |
| 2 | `policyMiddleware` MUST appear AFTER `requireOrgPermission` in the guard chain | Route validation |
| 3 | All write permissions MUST have policy definitions in `policyRegistry.js` | `policyCoverageValidator` at boot |
| 4 | Write operations without policy → DENIED (strict mode) | `policyEvaluator` runtime |
| 5 | `org_admin` role MUST have priority 100 "allow" in every policy | Policy review |
| 6 | Patient-facing routes (`patientProtect`) MUST NOT use `policyMiddleware` | Plane isolation |
| 7 | Shadow mode MUST be enabled for initial deployment | Deployment checklist |
| 8 | All policy decisions MUST be logged (shadow or enforce) | `policyMiddleware` observability |
| 9 | Status-based deny rules MUST have priority ≥ 110 (checked before allows) | Policy definition |
| 10 | New permissions MUST have corresponding policies before merging | CI/CD `policyCoverageValidator` |

### 34.12 Architecture Compliance

| Check | Status |
|-------|--------|
| All write routes have `policyMiddleware` | ✅ |
| All read policies defined for branch isolation | ✅ |
| Policy conditions centralized (no inline checks) | ✅ |
| Status-based immutability enforced (invoices, payments, lab) | ✅ |
| Role escalation prevention (users.update self-role) | ✅ |
| Shadow mode active for initial rollout | ✅ |
| Boot-time coverage validation wired | ✅ |
| Strict-deny for unprotected writes | ✅ |
| Patient-facing routes excluded | ✅ |
| SpecKit synchronized | ✅ |

---

## SECTION 35 — FIELD-LEVEL SECURITY (FLS) COMPLETION

**Phase:** E — Data Protection Hardening
**Priority:** P0 — Security Critical
**Date Completed:** 2026-03-24
**Depends on:** §6 (RBAC Architecture), §34 (PBAC Completion)

### 35.1 Problem Statement

After completing RBAC (permission-level) and PBAC (resource-level) authorization, field-level security remained partially implemented. Several modules had no field access definitions, meaning their full data payload was returned to all roles regardless of sensitivity. This created data overexposure risks:

- Financial fields (cost, pricing) visible to roles that should not see them
- Patient communication message bodies visible to administrative staff
- Lab order tracking/cost data exposed to non-lab roles
- Inventory operational data visible to receptionists who only need item names

### 35.2 FLS Architecture

FLS sits at the bottom of the authorization pipeline — after RBAC and PBAC have determined *whether* the user can access the resource, FLS determines *which fields* of that resource are visible.

```
Request
  ↓
orgProtect → requireOrgPermission → policyMiddleware
  ↓
fieldFilterMiddleware (READ → strips response fields)
fieldWriteGuardMiddleware (WRITE → rejects unauthorized request fields)
  ↓
Controller
  ↓
Response + capabilities.visibleFields (metadata for frontend)
```

**Two enforcement layers:**

| Layer | Direction | File | Behavior |
|-------|-----------|------|----------|
| **Field Filter** | READ (response) | `rbac/fieldFilter.js` | Strips fields from `res.json()` based on role whitelist |
| **Field Write Guard** | WRITE (request) | `rbac/fieldWriteGuard.js` | Rejects/strips fields from `req.body` based on role whitelist |

### 35.3 Field Access Registry (Read-Side)

**File:** `backend/src/rbac/fieldAccessRegistry.js`

The registry defines which fields each role can **see** for each resource type. Every entry follows the same structure:

```javascript
resourceType: {
    org_admin: ["*"],              // Full access (INVARIANT)
    doctor: ["_id", "name", ...],  // Whitelist
    assistant: ["_id", ...],       // Narrower whitelist
    receptionist: [...],           // Most restrictive
    lab_technician: [...],         // Domain-specific
    // Omitted role = empty object returned (deny)
}
```

**Coverage Matrix (15 resource types):**

| Resource | org_admin | doctor | assistant | receptionist | lab_technician |
|----------|-----------|--------|-----------|--------------|----------------|
| patient | `*` | Full clinical | Demographics | Demographics | Name only |
| appointment | `*` | Clinical view | Scheduling | Scheduling | ✗ |
| invoice | `*` | Summary | Summary | Summary | ✗ |
| payment | `*` | Summary | Summary | Summary | ✗ |
| treatment | `*` | Full clinical | Read-only | ✗ | ✗ |
| procedure | `*` | Full clinical | Read-only | Read-only | ✗ |
| user | `*` | Staff directory | Limited | Limited | Minimal |
| branch | `*` | ✗ | ✗ | ✗ | ✗ |
| orthodonticCase | `*` | Full clinical | Limited | ✗ | Case data |
| inventory | `*` | Item lookup | Stock levels | Names only | Lab supplies |
| lab | `*` | Clinical orders | Status only | ✗ | Full access |
| communication | `*` | Full messages | No message body | No message body | ✗ |
| analytics | `*` | Clinical metrics | Operational | Scheduling | ✗ |
| support | `*` | Own tickets | Own tickets | Own tickets | Minimal |
| dashboard | `*` | Clinical dashboard | Operational | Scheduling | Lab dashboard |

### 35.4 Field Write Guard (Write-Side)

**File:** `backend/src/rbac/fieldWriteGuard.js`

The write guard defines which fields each role can **submit** in create/update operations.

**Enforcement modes:**

| Mode | Env Variable | Behavior |
|------|-------------|----------|
| **Strict** | `FIELD_WRITE_GUARD_MODE=strict` | Reject entire request (403) if any unauthorized field present |
| **Warn** | `FIELD_WRITE_GUARD_MODE=warn` | Strip unauthorized fields, log warning, allow request |

**Write coverage:** All resource types with write operations have corresponding `writeAccess` definitions. Resources without write definitions (analytics read-only views) intentionally lack entries.

### 35.5 Route-Level Enforcement

**Read-side enforcement (fieldFilterMiddleware):**

| Route File | Resource Type | Applied To |
|-----------|--------------|------------|
| `patients.routes.js` | `patient` | GET list, GET by ID |
| `appointments.routes.js` | `appointment` | GET list, GET by ID |
| `invoices.routes.js` | `invoice` | GET list, GET by ID |
| `payments.routes.js` | `payment` | GET list, GET by ID |
| `treatments.routes.js` | `treatment` | GET list, GET by ID |
| `procedures.routes.js` | `procedure` | GET list, GET by ID |
| `users.routes.js` | `user` | GET list, GET by ID |
| `branches.routes.js` | `branch` | GET list, GET by ID |
| `orthodonticCase.routes.js` | `orthodonticCase` | GET list, GET by ID |
| `booking.routes.js` | `appointment` | GET /slots (patient portal) |
| `bookingApproval.routes.js` | `appointment` | GET /pending (staff) |

**Write-side enforcement (fieldWriteGuardMiddleware):**

| Route File | Resource Type | Applied To |
|-----------|--------------|------------|
| `patients.routes.js` | `patient` | POST, PUT, PATCH |
| `appointments.routes.js` | `appointment` | POST, PUT, PATCH |
| `invoices.routes.js` | `invoice` | POST, PUT |
| `treatments.routes.js` | `treatment` | POST, PUT |
| `users.routes.js` | `user` | POST, PUT |
| `branches.routes.js` | `branch` | POST, PUT |
| `bookingApproval.routes.js` | `appointment` | POST approve/reject |

### 35.6 Capabilities.visibleFields Pipeline

The `fieldFilterMiddleware` now injects field visibility metadata into API responses, enabling the frontend to dynamically adapt UI based on what the backend allows:

**Response shape (when fields are filtered):**
```json
{
    "data": [/* filtered records */],
    "capabilities": {
        "visibleFields": ["_id", "name", "phone", "dateOfBirth"],
        "resource": "patient"
    }
}
```

**Response shape (when no filtering — full access):**
```json
{
    "data": [/* all fields */]
}
```

**Frontend consumption pattern:**
```jsx
import { ResourceCapabilityProvider, FieldVisible } from "@/context/ResourceCapabilityContext";

function PatientsPage() {
    const [data, setData] = useState(null);
    const [capabilities, setCapabilities] = useState(null);

    // Fetch stores capabilities from response
    const res = await api.list();
    setCapabilities(res.data.capabilities);

    return (
        <ResourceCapabilityProvider capabilities={capabilities}>
            <FieldVisible field="phone">
                <PhoneColumn />
            </FieldVisible>
        </ResourceCapabilityProvider>
    );
}
```

### 35.7 Frontend Integration

**Hook:** `frontend/src/hooks/useFieldVisibility.js`

| Export | Purpose |
|--------|---------|
| `useFieldVisibility(apiResponse)` | Hook: returns `isFieldVisible(field)` function |
| `extractVisibleFields(capabilities)` | Utility: extract field list from capabilities |
| `buildColumnFilter(capabilities)` | Utility: filter table column definitions |

**Context:** `frontend/src/context/ResourceCapabilityContext.jsx`

| Export | Purpose |
|--------|---------|
| `ResourceCapabilityProvider` | Context provider wrapping pages with FLS data |
| `FieldVisible` | Component: conditionally renders children based on field visibility |
| `useResourceCapability` | Hook: access capabilities from context |

**Integrated pages:**
- `PatientsPage.jsx` — phone column wrapped in `<FieldVisible field="phone">`

### 35.8 Boot-Time Validation

**File:** `backend/src/rbac/validators/fieldAccessValidator.js` (v2.0)

Validates at server startup:

| Check | Behavior on Failure |
|-------|-------------------|
| Required resource types present | ERROR |
| org_admin has `["*"]` for every resource | ERROR |
| No empty arrays `[]` (must use `undefined` for deny) | ERROR |
| Write guard consistency (resources in both registries) | WARN |

**Environment variables:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `FIELD_ACCESS_STRICT` | `false` | Crash boot on validation failure |
| `FIELD_WRITE_GUARD_MODE` | `strict` | Write guard enforcement mode |

**Required resource types (MUST have registry entries):**
```
patient, appointment, invoice, payment, treatment, procedure,
user, branch, orthodonticCase, inventory, lab, communication,
analytics, support, dashboard
```

### 35.9 FLS Invariants

| # | Invariant | Enforcement |
|---|-----------|-------------|
| 1 | `org_admin` MUST have `["*"]` for every resource in both registries | Boot-time validator |
| 2 | Empty arrays `[]` are INVALID — use `undefined` (omission) for "no access" | Boot-time validator |
| 3 | Every new module MUST be added to `REQUIRED_RESOURCE_TYPES` in validator | Code review |
| 4 | Read-side filtering MUST NOT block — always returns filtered data, never 403 | Middleware design |
| 5 | Write-side guard in strict mode MUST return 403 — never silently strip fields | Middleware design |
| 6 | `capabilities.visibleFields` MUST be injected for filtered responses | Middleware tests |
| 7 | Frontend MUST use `FieldVisible` or `isFieldVisible()` — never hard-code role checks | Code review |
| 8 | Patient-facing routes use field filter but NOT write guard (patient portal context) | Route architecture |
| 9 | `fieldFilterMiddleware` MUST appear AFTER `requireOrgPermission` in guard chain | Route validation |
| 10 | Field access definitions MUST cover all 5 org roles or intentionally omit (deny) | Boot-time validator |

### 35.10 Architecture Compliance

| Check | Status |
|-------|--------|
| 100% module coverage in field access registry | ✅ |
| All read routes have fieldFilterMiddleware | ✅ |
| All write routes have fieldWriteGuardMiddleware | ✅ |
| capabilities.visibleFields pipeline active | ✅ |
| Frontend hook + context + component created | ✅ |
| Boot-time validator v2.0 wired | ✅ |
| Strict mode available for CI/production | ✅ |
| PatientsPage integrated with FLS frontend | ✅ |
| SpecKit synchronized | ✅ |


---

## SECTION 36 — QUERY-LEVEL SECURITY (RLS) — ZERO-TRUST DATA ACCESS

> ⚠️ **DEPRECATED (2026-03-28):** The entire RLS system described in Sections 36–38 has been **permanently removed**.
>
> - `src/core/rls/` directory deleted (~4,200 LOC, 19 files)
> - `secureModel`, `queryScoper`, `rlsAssertions`, `rlsValidationEngine` no longer exist
> - ESLint `no-restricted-modules` rules block any reintroduction
>
> **Replacement Architecture:**
> - **Tenant Isolation:** DB-per-org (each org has a dedicated MongoDB database)
> - **Model Resolution:** `getModel(req.dbConnection, ModelDef)` — see `system-architecture.spec.md` §6.7
> - **Authorization Guards:** Guard System V2 (pre/post/field guards) — see `system-architecture.spec.md` §6.7
> - **Background Jobs:** `dbManager.getConnection(orgId)` + `getModel(conn, Def)`
>
> The sections below are preserved as **historical reference only**. Do not implement any patterns described here.

### 36.1 Overview (HISTORICAL)

Phase F introduced Row-Level Security (RLS) — an automatic, non-bypassable query scoping layer that enforced tenant isolation at the database query level. This system was fully decommissioned on 2026-03-28 in favor of database-level tenant isolation (DB-per-org).

**Security Lineage:**
```
Phase D → WHO can act     (PBAC — Policy-Based Access Control)
Phase E → WHAT they see   (FLS — Field-Level Security)
Phase F → WHAT data is fetched (RLS — Query-Level Security)
```

**Core Principle:**
- ❌ Controllers MUST NOT enforce security
- ✅ Security MUST be enforced BEFORE database queries

### 36.2 Architecture

```
Request
→ Auth (JWT verification)
→ Entitlement (subscription check)
→ RBAC (role permission check)
→ PBAC (policy evaluation)
→ RLS Context Middleware (req.rls attached)
→ Controller (reads req.rls implicitly via secureModel)
→ secureModel → queryScoper → MongoDB (pre-filtered)
```

**Pipeline Position:**
```
orgProtect → organizationContext → subscriptionGuard → featureFlagMiddleware
    → branchContextMiddleware → unifiedCapabilityMiddleware → assertCapabilities
    → ssotEnforcer → ██ rlsContext ██ → orgV1Routes → controllers
```

### 36.3 RLS Context Middleware

**File:** `backend/src/middleware/rlsContext.js`

**Purpose:** Attaches a frozen, tamper-proof RLS context to every org-scoped request.

**Context Shape (req.rls):**
```javascript
{
    organizationId: ObjectId,       // ALWAYS present — from verified JWT
    branchId: ObjectId | null,      // From X-Branch-Id header (validated)
    userId: ObjectId | null,        // Authenticated user identity
    role: string | null,            // User's role name
    branchAccess: ObjectId[],       // Multi-branch access list
    hasFullBranchAccess: boolean,   // org_admin bypasses branch filtering
    visibilityOverrides: Object,    // Per-domain scope overrides
    resolvedAt: number,             // Unix timestamp for audit correlation
}
```

**Security Properties:**
- `req.rls` is `Object.freeze()`'d — controllers CANNOT mutate the scope
- `organizationId` comes exclusively from verified JWT — never from client input
- Missing `organizationId` returns 500 (middleware pipeline misconfiguration)

### 36.4 Query Scoper Engine

**File:** `backend/src/core/rls/queryScoper.js`

**Exported Functions:**
- `applyRLSFilter(query, req, options)` — Injects RLS filters into a query object
- `applyRLSAggregate(pipeline, req, options)` — Prepends $match stage to aggregation pipeline

**Scoping Modes:**

| Mode | Option | Filter Applied |
|------|--------|---------------|
| Org-scoped (default) | — | `{ organizationId }` |
| Branch-scoped | `{ branchScoped: true }` | `{ organizationId, branchId }` |
| Ownership-scoped | `{ ownershipScoped: true }` | `{ organizationId, $or: [ownerId, assignedTo, createdBy] }` |
| Visibility-scoped | `{ visibilityScoped: true }` | `{ organizationId, visibleToDoctors: userId }` |
| Custom owner | `{ ownerField: "doctorId" }` | `{ organizationId, doctorId: userId }` |

**Invariants:**
1. `organizationId` is ALWAYS injected — cannot be overridden by the caller
2. `req.rls` MUST exist — throws 500 if missing
3. `branchScoped` requires `branchId` — throws 400 if missing (unless `skipBranchCheck`)
4. `hasFullBranchAccess` users (org_admin) bypass branch filtering
5. Returns a NEW object — never mutates the input query

### 36.5 Secure Model Wrapper

**File:** `backend/src/core/rls/secureModel.js`

**Purpose:** Wraps Mongoose model operations so ALL queries are automatically RLS-protected.

**Usage Pattern:**
```javascript
const secureModel = require("@core/rls/secureModel");
const SecurePatient = secureModel(Patient);

// All operations require `req` as second argument — RLS context injected automatically
const patients = await SecurePatient.find({ status: "active" }, req, { branchScoped: true })
    .populate("doctorId", "name")
    .sort({ createdAt: -1 })
    .lean();

// findById wraps to findOne with organizationId lock
const patient = await SecurePatient.findById(patientId, req);

// create() injects organizationId automatically
const newPatient = await SecurePatient.create({ name: "John" }, req, { injectBranch: true });

// aggregate() prepends mandatory $match stage
const stats = await SecurePatient.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } }
], req);
```

**Wrapped Operations:**

| Method | Signature | Notes |
|--------|-----------|-------|
| `find` | `(query, req, options?)` | Returns chainable Mongoose Query |
| `findOne` | `(query, req, options?)` | Returns chainable Mongoose Query |
| `findById` | `(id, req, options?)` | Wraps to findOne with _id + org filter |
| `countDocuments` | `(query, req, options?)` | Returns chainable Mongoose Query |
| `updateOne` | `(query, update, req, options?)` | Prevents cross-tenant mutation |
| `updateMany` | `(query, update, req, options?)` | Prevents cross-tenant bulk mutation |
| `findOneAndUpdate` | `(query, update, req, options?, mongooseOpts?)` | Atomic update |
| `deleteOne` | `(query, req, options?)` | Prevents cross-tenant deletion |
| `deleteMany` | `(query, req, options?)` | Prevents cross-tenant bulk deletion |
| `aggregate` | `(pipeline, req, options?)` | Prepends $match stage |
| `create` | `(data, req, options?)` | Injects organizationId into document |
| `exists` | `(query, req, options?)` | RLS-scoped existence check |
| `distinct` | `(field, query, req, options?)` | RLS-scoped distinct values |

**Chaining Support:**
secureModel preserves Mongoose's chainable API. All query methods return Mongoose Query objects, so `.populate()`, `.sort()`, `.select()`, `.skip()`, `.limit()`, `.lean()` all work identically.

**Default Options:**
```javascript
// Pre-configure a model with default RLS options
const SecureTreatment = secureModel(Treatment, { branchScoped: true });
// Now every operation on SecureTreatment auto-applies branch scoping
```

### 36.6 Aggregation Pipeline Protection

**Problem:** MongoDB `aggregate()` bypasses Mongoose middleware and does not apply model-level filters.

**Solution:** `applyRLSAggregate()` and `secureModel.aggregate()` prepend an immutable `$match` stage as the FIRST pipeline stage:

```javascript
// Input pipeline:
[{ $group: { _id: "$status", count: { $sum: 1 } } }]

// After RLS injection:
[
    { $match: { organizationId: req.rls.organizationId } },  // ← PREPENDED
    { $group: { _id: "$status", count: { $sum: 1 } } }
]
```

**Branch-scoped aggregation:**
```javascript
SecureModel.aggregate([...pipeline], req, { branchScoped: true });
// → prepends { $match: { organizationId, branchId } }
```

### 36.7 RLS Validation & CI Enforcement

**File:** `backend/src/core/rls/rlsValidator.js`

**Boot-Time Validation:**
- Called in `server.js` after RBAC validators
- Scans all files in `src/modules/` and `src/organization/` for raw Mongoose query patterns
- In advisory mode (`RLS_STRICT=false`): logs warnings
- In strict mode (`RLS_STRICT=true`): crashes boot on violations

**CI Script:** `backend/scripts/checkRLSCompliance.js`
```bash
# Advisory mode (warnings only)
npm run validate:rls

# Strict mode (exit 1 on violations)
npm run validate:rls:strict
```

**Detected Patterns:**
- `Model.find({...})`
- `Model.findOne({...})`
- `Model.findById(...)`
- `Model.aggregate([...])`
- `Model.updateOne({...})`
- `Model.updateMany({...})`
- `Model.deleteOne({...})`
- `Model.deleteMany({...})`
- `Model.findOneAndUpdate({...})`
- `Model.countDocuments({...})`

**Exempt Directories:**
- `platform/` — has its own authorization model
- `scripts/`, `seeds/`, `migrations/` — administrative scripts
- `*.test.js`, `*.spec.js` — test files
- `infrastructure/` — workers, queues, cron
- `core/auth/`, `core/rls/` — RLS system itself
- `middleware/` — middleware definitions
- `shared/models/` — model definitions (not queries)

**Safe Markers (line-level exemption):**
```javascript
// @rls-exempt — this query is intentionally raw
const result = await Model.find({ organizationId }); // rls-safe
```

**Runtime Detection (dev-only):**
```javascript
// Optional monkey-patch that logs warnings for raw queries
enableRuntimeDetection(mongoose);
```

### 36.8 Migration Strategy

**Phase 1 — Infrastructure (COMPLETE):**
- [x] `rlsContext.js` middleware created and integrated into app.js pipeline
- [x] `queryScoper.js` engine created
- [x] `secureModel.js` wrapper created
- [x] `rlsValidator.js` boot-time scanner created
- [x] CI script (`checkRLSCompliance.js`) created
- [x] npm scripts (`validate:rls`, `validate:rls:strict`) added
- [x] `.env` — `RLS_STRICT=false` (advisory mode during migration)

**Phase 2 — Exemplar Migration (COMPLETE):**
- [x] `treatments.service.js` — migrated to secureModel
- [x] `orgV1Routes.js` `/roles` — migrated from raw Role.find() to SecureRole.find()

**Phase 3 — Module Migration:**

| Module | Service Files | Priority | Status |
|--------|--------------|----------|--------|
| patients | patient.list.service.js | P0 | ✅ DONE |
| appointments | appointment.service.js, slot.service.js | P0 | ✅ DONE |
| procedures | procedures.service.js | P0 | ✅ DONE |
| users | users.service.js | P0 | ✅ DONE |
| branches | branches.service.js | P0 | ✅ DONE |
| treatments | treatments.service.js | P0 | ✅ DONE (Phase 2) |
| invoices | invoice.service.js, invoiceStatus.service.js | P0 | TODO |
| orthodontics | orthodonticCase.service.js | P1 | TODO |
| inventory | inventory.service.js, inventory.read.service.js | P1 | TODO |
| finance | financeSummary.service.js | P1 | TODO |
| booking | booking.service.js, bookingApproval.service.js | P1 | TODO |
| documents | template.service.js, receiptPrint.service.js, invoicePrint.service.js | P2 | TODO |
| analytics | analytics.service.js | P2 | TODO |
| communication | usage.service.js | P2 | TODO |
| clinical | clinical.read.service.js | P2 | TODO |
| aligner | alignerProduction.aggregate.service.js | P2 | TODO |

**Phase 4 — CI Enforcement (Phase F.1 ACTIVATED):**
- [x] Enable `RLS_STRICT=true` in development (`.env`)
- [x] CI audit script created (`scripts/auditRLS.js`)
- [x] npm scripts: `audit:rls`, `audit:rls:strict`
- [x] E2E tenant isolation tests: `tests/security/tenantIsolation.e2e.test.js`
- [ ] Enable `RLS_STRICT=true` in staging environment
- [ ] Verify zero violations for 7 days in staging
- [ ] Enable `RLS_STRICT=true` in production

### 36.9 Canonical Auth Pipeline (Post-Phase F)

```
orgProtect → organizationContext → subscriptionGuard → featureFlagMiddleware
    → branchContextMiddleware → unifiedCapabilityMiddleware → assertCapabilities
    → ssotEnforcer
    → rlsContext                                              ← Phase F NEW
    → requireEntitlement → requireFeature
    → requireOrgPermission(P.XXX) → policyMiddleware(P.XXX)
    → fieldFilterMiddleware(resourceType)  [READ]              ← Phase E
    → fieldWriteGuardMiddleware(resourceType) [WRITE]          ← Phase E
    → handler
    → secureModel(Model).find(query, req)                      ← Phase F NEW
    → Response + capabilities.visibleFields                    ← Phase E
```

### 36.10 Environment Configuration

| Variable | Values | Default | Purpose |
|----------|--------|---------|---------|
| `RLS_STRICT` | `true` / `false` | `false` | Boot-time: crash on raw query violations |

### 36.11 Architecture Invariants

| # | Invariant | Enforcement |
|---|-----------|-------------|
| 1 | ALL org-plane queries MUST include `organizationId` | queryScoper auto-injection |
| 2 | Controllers/services MUST NOT use raw `Model.find()` | rlsValidator boot scan |
| 3 | `secureModel` is the ONLY data access interface | Code review + CI |
| 4 | RLS context MUST execute BEFORE controller logic | app.js pipeline position |
| 5 | Aggregation pipelines MUST include `$match` as first stage | `applyRLSAggregate` |
| 6 | `req.rls` is frozen — controllers CANNOT mutate scope | `Object.freeze()` |
| 7 | Branch/ownership rules MUST be consistent across modules | secureModel default options |
| 8 | RLS validator MUST run in dev/CI boot | server.js boot sequence |
| 9 | `organizationId` in req.rls comes from JWT, never client | rlsContext middleware |
| 10 | Platform plane queries are exempt from org RLS | Exempt directory list |

### 36.12 Architecture Compliance

| Check | Status |
|-------|--------|
| rlsContext middleware created | ✅ |
| queryScoper engine created | ✅ |
| secureModel wrapper created | ✅ |
| Integrated into app.js org pipeline | ✅ |
| Boot-time validator wired in server.js | ✅ |
| CI script created | ✅ |
| npm scripts added | ✅ |
| Treatments service migrated (exemplar) | ✅ |
| orgV1Routes /roles migrated | ✅ |
| Advisory mode active (migration safe) | ✅ → Strict |
| RLS_STRICT available for strict enforcement | ✅ |
| SpecKit synchronized | ✅ |
| P0 modules migrated (users, branches, procedures, patients, appointments) | ✅ Phase F.1 |
| CI audit script (auditRLS.js) | ✅ Phase F.1 |
| E2E tenant isolation tests | ✅ Phase F.1 |
| RLS_STRICT=true activated | ✅ Phase F.1 |

---

## SECTION 37 — Phase F.1: RLS Activation (Data Isolation Enforcement)

### 37.1 Overview

Phase F.1 completes the activation of Row-Level Security across all P0 modules, transitioning from advisory mode to strict enforcement. This phase delivers the final piece of the 4-layer security stack:

```
WHO can act       → RBAC   (requireOrgPermission, Phase 1)
WHAT they can see  → FLS    (fieldFilter + fieldWriteGuard, Phase E)
WHICH records      → RLS    (secureModel + queryScoper, Phase F.1) ✅
WHEN they can act  → PBAC   (policyMiddleware, Phase D)
```

### 37.2 Migration Pattern

All P0 service modules were refactored from raw Mongoose model queries to `secureModel` wrappers:

```javascript
// ❌ BEFORE (raw model — organizationId manually injected)
const patients = await Patient.find({ organizationId, isActive: true });

// ✅ AFTER (secureModel — organizationId auto-injected from req.rls)
const SecurePatient = secureModel(Patient);
const patients = await SecurePatient.find({ isActive: true }, req);
```

**Interface Change:** Service methods now accept `req` instead of `organizationId`. Controllers pass the Express request object for RLS context propagation.

### 37.3 Migrated Modules

| Module | Service File | Controller File | Status |
|--------|-------------|----------------|--------|
| Users | `users.service.js` | `users.controller.js` | ✅ DONE |
| Branches | `branches.service.js` | `branches.controller.js` | ✅ DONE |
| Procedures | `procedures.service.js` | `procedures.controller.js` | ✅ DONE |
| Treatments | `treatments.service.js` | _(Phase 2)_ | ✅ DONE |
| Appointments | `appointment.service.js` | _(dual-path)_ | ✅ DONE |
| Slots | `slot.service.js` | — | ✅ DONE |
| Patients | `patient.list.service.js` | — | ✅ DONE |

### 37.4 Dual-Path Architecture (Event-Driven Safety)

For modules with both HTTP and event-driven code paths (e.g., appointments), a dual-path approach is used:

```
HTTP Request → req available → SecureAppointment.find({}, req)    ← RLS enforced
Event Handler → no req       → Appointment.find({ organizationId }) ← @rls-exempt
```

The `@rls-exempt` marker is mandatory for legitimate bypasses:
- Internal event handlers (no `req` context available)
- MongoDB transactions with explicit sessions (incompatible with secureModel API)
- Cross-domain reads with explicit `organizationId` parameter

### 37.5 CI Enforcement

**Audit Script:** `scripts/auditRLS.js`

```
npm run audit:rls           # Advisory mode (warnings only)
npm run audit:rls:strict    # Strict mode (exit 1 on violations — CI gate)
```

The script:
1. Scans `src/modules/`, `src/organization/`, `src/services/` for `.js` files
2. Detects raw Mongoose query patterns (find, findOne, findById, aggregate, etc.)
3. Respects `@rls-exempt`, `// rls-safe`, and `Secure*` safe markers
4. Exempts platform, test, seed, migration, middleware, model, and validator files
5. Reports violations grouped by module with line numbers and code snippets
6. In strict mode, exits with code 1 to block CI pipelines

### 37.6 E2E Tests

**Test File:** `tests/security/tenantIsolation.e2e.test.js`

7 test suites covering:
1. **Query Scoper Invariants** — organizationId always injected, cannot be overridden, throws on missing req.rls
2. **Aggregate Pipeline Protection** — $match prepended, pipeline cannot be bypassed
3. **secureModel Wrapper** — all 13 wrapped operations verified
4. **Cross-Tenant Prevention** — findById/updateOne/deleteOne cannot access foreign org data
5. **Static Analysis** — RLS validator correctly identifies violations and exemptions
6. **Module Compliance** — scans actual P0 service files for zero violations
7. **Context Immutability** — req.rls is frozen (Object.freeze) and cannot be mutated

### 37.7 Environment Configuration

| Variable | Value | Purpose |
|----------|-------|---------|
| `RLS_STRICT` | `true` | Boot-time crash on raw query violations in P0 modules |

### 37.8 Architecture Invariants (Post-F.1)

With Phase F.1 complete, the following security invariants are structurally enforced:

| # | Invariant | Enforcement |
|---|-----------|-------------|
| 1 | Every org query scoped by organizationId | secureModel auto-injection |
| 2 | Cross-tenant access is impossible | queryScoper overrides caller-supplied orgId |
| 3 | RLS context is immutable | Object.freeze(req.rls) |
| 4 | Raw queries are detected at boot + CI | rlsValidator + auditRLS.js |
| 5 | Event-driven bypasses are annotated | @rls-exempt markers |
| 6 | Aggregate pipelines are scoped | $match prepended as first stage |

---

## SECTION 38 — Phase F.3+++: RLS DISTRIBUTED HARDENING & OBSERVABILITY

### 38.1 Overview

Phase F.3+++ transitions the RLS system from a single-instance security model to a **production-grade distributed architecture**. This enables horizontal scaling (k8s/PM2 cluster mode) with zero-trust enforcement guarantees across all instances, including background queue processors.

```
Phase F.1  → secureModel + queryScoper (single-instance enforcement)
Phase F.3  → rlsLogger + rlsContextStore (observability + AsyncLocalStorage)
Phase F.3+ → rlsMetricsRoute (in-memory metrics dashboard)
Phase F.3+++→ Distributed Redis metrics, persistent audit trail, circuit breaker,
              cross-instance hash verification, queue guards, snapshot signing,
              and real-time security dashboard
```

**Architecture Plane:** Platform / Security
**Dependencies:** Redis (ioredis), MongoDB, BullMQ

### 38.2 Distributed Metrics Store

**File:** `core/rls/rlsMetricsStore.js`

Replaces in-memory counters with Redis-backed persistent metrics. All metric writes are **fire-and-forget** — Redis failure degrades to in-memory only, never blocks the request pipeline.

**Redis Key Structure:**
```
rls:metrics:total        — Hash: { queriesScoped, contextMissing, violationsBlocked, ... }
rls:metrics:byModule     — Hash: { "moduleName:event": count }
rls:metrics:latency      — Hash: { totalMs, count, maxMs }
rls:metrics:instances    — Hash: { "hostname:pid": lastSeenTimestamp }
```

**Operations:**
| Method | Redis Command | Purpose |
|--------|---------------|---------|
| `increment(metric)` | `HINCRBY` | Atomic distributed counter |
| `incrementModule(mod, event)` | `HINCRBY` | Per-module event tracking |
| `recordLatency(ms)` | Pipeline: `HINCRBYFLOAT` + Lua `MAX` | Latency percentile tracking |
| `heartbeat()` | `HSET` | Instance liveness (30s interval) |
| `getDistributedMetrics()` | `HGETALL` × 4 | Aggregated cross-instance read |

**Degradation Guarantees:**
- Redis unavailable → in-memory only (logged once, retried every 30s)
- Redis write failure → silent skip (fire-and-forget)
- Redis read failure → local snapshot fallback
- Heartbeat timer uses `unref()` to prevent process hang

### 38.3 Persistent Violation Audit Trail

**File:** `core/rls/RLSViolation.model.js`
**Collection:** `rlsViolations`

MongoDB-backed compliance-grade violation logging. All violations are persisted with auto-cleanup after 365 days.

**Violation Types (11):**
| Type | Severity | Trigger |
|------|----------|---------|  
| `RLS_CONTEXT_MISSING` | CRITICAL | `req.rls` was absent |
| `RLS_BRANCH_VIOLATION` | HIGH | Branch-scoped query without branchId |
| `RLS_HASH_DRIFT` | CRITICAL | Same user had different hash in-session |
| `RLS_HASH_MISMATCH` | HIGH | Cross-service hash inconsistency |
| `RLS_ASYNC_VIOLATION` | HIGH | Queue job without RLS context |
| `RLS_SIGNATURE_INVALID` | CRITICAL | HMAC verification failed |
| `RLS_DISTRIBUTED_MISMATCH` | CRITICAL | Cross-instance hash inconsistency |
| `RLS_CIRCUIT_BREAKER` | CRITICAL/HIGH | Circuit breaker state change |
| `RLS_QUEUE_MISSING` | HIGH | Queue processor missing RLS |
| `RLS_LATENCY_ALERT` | MEDIUM | Context resolution exceeded threshold |
| `RLS_UNKNOWN` | HIGH | Unclassified violation |

**Indexes:**
| Index | Purpose |
|-------|---------|
| `{ organizationId: 1, createdAt: -1 }` | Tenant-scoped queries |
| `{ violationType: 1, createdAt: -1 }` | Type-based analysis |
| `{ severity: 1, createdAt: -1 }` | Priority dashboards |
| `{ resolved: 1, severity: 1, createdAt: -1 }` | Active monitoring |
| `{ createdAt: 1 }` TTL 365d | Auto-cleanup |

**Security:** No PII stored. Only `organizationId`, `userId`, `endpoint`, `rlsHash` (truncated to 12 chars), and diagnostic metadata.

### 38.4 Distributed Hash Consistency

**File:** `core/rls/rlsDistributedHash.js`

Detects split-brain RLS context resolution across multiple API instances.

**Configuration:**
| Variable | Default | Purpose |
|----------|---------|---------|  
| `RLS_HASH_TTL` | `120` | Hash record TTL in seconds |
| `RLS_HASH_STRICT` | `false` | Block on mismatch instead of warn |

**Middleware:** `rlsDistributedHashMiddleware` placed after `rlsContext` in the pipeline.

### 38.5 Circuit Breaker

**File:** `core/rls/rlsCircuitBreaker.js`

Three-state circuit breaker that degrades service when RLS violation rates exceed thresholds.

**State Machine:**
```
CLOSED --(rate > 1%)--> DEGRADED --(violations > 50)--> OPEN
  ^                        |                               |
  |                        | (rate < 0.5%)                 | (5 min elapsed)
  +------------------------+                               |
  ^                                                        |
  +-------------------(auto-recovery)----------------------+
```

**Route Blocking Matrix:**
| State | Health/Metrics | Normal Routes | Sensitive Routes |
|-------|---------------|---------------|------------------|
| CLOSED | Pass | Pass | Pass |
| DEGRADED | Pass | Pass | Block 503 |
| OPEN | Pass | Block 503 | Block 503 |

**Sensitive Route Patterns:**
- `/billing/`, `/payment`, `/refund`, `/invoice`
- `/patient.*(create|update|delete)`
- `/user.*(role|permission)`
- `/export`, `/report.*download`
- `/ledger`, `/subscription`

**Configuration (ENV):**
| Variable | Default | Purpose |
|----------|---------|---------|
| `RLS_CB_ENABLED` | `true` | Enable circuit breaker |
| `RLS_CB_DEGRADED_THRESHOLD` | `0.01` | 1% violation rate triggers DEGRADED |
| `RLS_CB_OPEN_THRESHOLD` | `50` | 50 violations trigger OPEN |
| `RLS_CB_RECOVERY_MS` | `300000` | 5 min auto-recovery from OPEN |
| `RLS_CB_WINDOW_MS` | `60000` | 1 min sliding window for rate calc |

### 38.14 Architecture Invariants (Post-F.10 — Complete)

| # | Invariant | Enforcement |
|---|-----------|-------------|
| INV-17 | SYSTEM_CONTEXT_VERIFICATION | HMAC-SHA256 with timing-safe comparison |
| INV-18 | PUBLIC_TOKEN_BINDING | JWT plane isolation |
| INV-19 | NON_NULL_ORG_CONTEXT | Fail-closed on null context |
| INV-21 | BOOTSTRAP_RLS_ENFORCEMENT | secureModel required at boot |
| INV-22 | DEEP_PIPELINE_RLS | `$lookup`/`$facet` organizationId scoping |
| INV-23 | PIPELINE_IMMUTABILITY | Clone-before-transform |
| INV-26 | RLS_TAXONOMY_ENFORCEMENT | Taxonomy guard + CI validator |
| INV-27 | FIELD_LEVEL_SECURITY | Read filter + Write guard + CI parity |
| INV-28 | RUNTIME_DRIFT_DETECTION | Request-scoped marker assertion |
| INV-29 | SECURE_FLOW_ENFORCEMENT | All org-plane requests must traverse: secureModel → FLS → taxonomy → drift detection. Missing layer triggers `SECURE_FLOW_VIOLATION`. |

**7-Layer Enforcement Chain:**
```
Layer 1 — CONTEXT        req.rls / createSystemContext (HMAC-signed)
Layer 2 — EXECUTION      secureModel (fail-closed, org-scoped)
Layer 3 — QUERY          aggregateSecurity (deep pipeline hardening)
Layer 4 — OUTPUT         projectionSanitizer (terminal field control)
Layer 5 — POLICY         FLS: fieldFilter (read) + fieldWriteGuard (write)
Layer 6 — GOVERNANCE     taxonomy + CI + audit + anomaly detection
Layer 7 — DRIFT          secureFlowAssertion (runtime chain validation)
```

### 38.15 Phase F.10.2 — Operational Monitoring & Enforcement Escalation

**Escalation Protocol:**
```
AUDIT → WARN → ENFORCE → STRICT
  dev    staging   prod     lockdown
```

**Step 1 — Staging Deployment (WARN mode):**
```env
SECURE_FLOW_MODE=warn
SECURE_FLOW_ALERT_THRESHOLD=5
NODE_ENV=staging
```

**Step 2 — Baseline Monitoring (1–2 sprint cycles):**
- Track: `dental_saas_secure_flow_violation_total` → target: 0 violations/min
- Track: `dental_saas_secure_flow_assertion_total{outcome=pass}` → confirm assertions running
- Investigate ANY `SECURE_FLOW_VIOLATION` log entry immediately

**Step 3 — Escalation to ENFORCE:**
- Prerequisites: 0 violations for full sprint + CI gate green
- Action: Set `SECURE_FLOW_MODE=enforce` in production
- Effect: Violations logged as ERROR (alerts fire), responses still allowed

**Step 4 — Optional STRICT Lockdown:**
- Prerequisites: 0 violations for multi-week period + team trained
- Action: Set `SECURE_FLOW_MODE=strict` in production
- Effect: Missing markers → 403 response blocked

**Incident Response Procedure:**
```
IF violations reappear after escalation:
  1. Switch → SECURE_FLOW_MODE=warn (immediate, no deploy needed if env-var based)
  2. Identify affected routes via Prometheus or logs
  3. Patch missing enforcement layer in route/service
  4. Re-run CI: npm run validate:security-chain:strict
  5. Re-enable enforce mode after CI passes
```

**Prometheus Metrics (3 counters):**
| Metric | Labels | Purpose |
|--------|--------|---------|
| `dental_saas_secure_flow_violation_total` | `route`, `mode`, `marker` | Total violation count |
| `dental_saas_secure_flow_route_violation_rate` | `route` | Violations per route per minute |
| `dental_saas_secure_flow_assertion_total` | `outcome` | Pass/fail/blocked assertion counts |

**Alert Configuration:**
| Parameter | Value | Description |
|-----------|-------|-------------|
| `SECURE_FLOW_ALERT_THRESHOLD` | `5` | Violations per minute per route before CRITICAL alert |
| Alert event | `SECURE_FLOW_ALERT` | Emitted via `logger.error` when threshold exceeded |
| Alert window | 60 seconds | Sliding window for rate calculation |

**Environment Configuration (Phase F.10.2):**
| Variable | Default | Purpose |
|----------|---------|---------|
| `SECURE_FLOW_MODE` | `warn` | Enforcement mode (audit/warn/enforce/strict) |
| `SECURE_FLOW_ALERT_THRESHOLD` | `5` | Violations/min before CRITICAL alert |

### 38.6 Queue RLS Guard

**File:** `core/rls/rlsQueueGuard.js`

Ensures all BullMQ background jobs carry and validate RLS context. Prevents cross-tenant data leakage in asynchronous processing pipelines.

**Producer Side:**
```javascript
const { enrichJobWithRLS } = require("@core/rls");

// In route handler:
const jobData = enrichJobWithRLS(req, { patientId, action: "process" });
await emailQueue.add("send", jobData);
// jobData.__rlsContext = { organizationId, userId, branchId, hash, traceId }
```

**Consumer Side:**
```javascript
const { guardQueueProcessor } = require("@core/rls");

const processor = guardQueueProcessor(async (job) => {
    // job.__rlsContext is verified — safe to use
    // job.__rlsContext.organizationId guaranteed to match
}, { moduleName: "email", required: true });

emailWorker.process(processor);
```

**Enforcement Modes:**
| Mode | Missing Context | Mismatched Context |
|------|----------------|-------------------|
| `ENFORCE` | Block job (throw) | Block job (throw) |
| `WARN` | Log warning, continue | Log warning, continue |
| `AUDIT` | Record violation only | Record violation only |

**ENV:** `RLS_QUEUE_MODE` (default: `ENFORCE`)

### 38.7 Snapshot Signing

**File:** `core/rls/rlsSnapshotSigner.js`

HMAC-SHA256 signing for RLS context snapshots. Prevents context tampering during inter-service communication and API gateway forwarding.

**Signature Format:**
```
rlsig_v1:<hex_hmac>
```

**Signing Input:**
```
organizationId|userId|branchId|hash
```

**Verification Flow (Middleware):**
```
Request with X-RLS-Signature header
    ↓
rlsSignatureMiddleware
    ↓
Recompute HMAC from req.rls
    ↓
Compare with header value
    ↓
IF mismatch → 403 + RLS_SIGNATURE_INVALID violation recorded
IF no secret configured → SKIP (warning logged once at boot)
```

**ENV:** `RLS_SIGNING_SECRET` — Required for production. Without this, signing is disabled with a boot-time warning.

### 38.8 Audit Dashboard

**File:** `core/rls/rlsAuditDashboard.js`
**Mount Point:** `/api/v1/rls/metrics/audit/*`
**Access:** Platform-only (internal)

Real-time security monitoring dashboard API.

**Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/audit/summary` | Violation summary for an organization (last N days) |
| GET | `/audit/violations` | Searchable violation list (type, severity, date range) |
| GET | `/audit/violations/:id` | Single violation detail |
| GET | `/audit/trends` | Global violation trends (platform-wide) |
| GET | `/audit/risk-score` | Module-level risk scoring |
| GET | `/audit/circuit-breaker` | Current circuit breaker state |
| POST | `/audit/circuit-breaker/reset` | Manual circuit breaker reset |

**Risk Score Algorithm:**
```
score = (violations × 10) + (drifts × 8) + (mismatches × 6) + (fallbacks × 2)
```
- `CRITICAL`: score ≥ 50
- `HIGH`: score ≥ 20
- `MEDIUM`: score ≥ 5
- `LOW`: score < 5

### 38.9 Integration Points

**Middleware Pipeline Position:**
```
orgProtect → rlsContext → rlsSignatureMiddleware (optional)
    → rlsDistributedHashMiddleware (optional)
    → rlsCircuitBreakerMiddleware
    → subscriptionGuard → ... → handler
    → queryScoper (at query time, dual-writes to Redis)
```

**queryScoper Dual-Write:**
All metrics emitted by queryScoper are simultaneously written to:
1. Local in-memory counters (for zero-latency local reads)
2. Redis distributed store (for cross-instance aggregation)

**Traceability:**
`req.rlsTraceId` (UUID v4) is generated in `rlsContext.js` and propagated through:
- All log entries
- All violation records
- All Redis metric increments
- Queue job payloads

### 38.10 Environment Configuration (Complete)

| Variable | Default | Purpose |
|----------|---------|---------|
| `RLS_STRICT` | `true` | Crash on raw query violations in P0 modules |
| `RLS_AUTO_KILL` | `false` | Force-restart on violation threshold exceeded |
| `RLS_CB_ENABLED` | `true` | Enable circuit breaker |
| `RLS_CB_DEGRADED_THRESHOLD` | `0.01` | Violation rate for DEGRADED state |
| `RLS_CB_OPEN_THRESHOLD` | `50` | Violation count for OPEN state |
| `RLS_CB_RECOVERY_MS` | `300000` | Auto-recovery time (5 min) |
| `RLS_CB_WINDOW_MS` | `60000` | Sliding window for rate calc (1 min) |
| `RLS_SIGNING_SECRET` | _(none)_ | HMAC signing key (required for production) |
| `RLS_QUEUE_MODE` | `ENFORCE` | Queue guard mode (ENFORCE/WARN/AUDIT) |
| `RLS_HASH_TTL` | `120` | Distributed hash TTL (seconds) |
| `RLS_HASH_STRICT` | `false` | Block on distributed hash mismatch |

### 38.11 Architecture Invariants (Post-F.3+++)

| # | Invariant | Enforcement |
|---|-----------|-------------|
| 1 | Metrics survive instance restart | Redis persistence |
| 2 | Violations are durably audited | MongoDB with TTL |
| 3 | Cross-instance hash drift is detected | Distributed hash checker |
| 4 | Violation storms trigger graceful degradation | Circuit breaker |
| 5 | Queue jobs carry tenant context | Queue guard (ENFORCE) |
| 6 | RLS context cannot be tampered | HMAC signing |
| 7 | Security posture is observable in real-time | Audit dashboard |
| 8 | All security events are correlated | req.rlsTraceId |
| 9 | Redis failure never crashes the system | Non-blocking fire-and-forget |
| 10 | Health endpoints always respond | Circuit breaker exempt patterns |

### 38.12 File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `rlsMetricsStore.js` | 296 | Redis-backed distributed metrics |
| `RLSViolation.model.js` | 312 | Persistent violation audit trail |
| `rlsDistributedHash.js` | ~200 | Cross-instance hash consistency |
| `rlsCircuitBreaker.js` | 346 | Three-state circuit breaker |
| `rlsQueueGuard.js` | ~250 | BullMQ RLS context enforcement |
| `rlsSnapshotSigner.js` | ~200 | HMAC-SHA256 context signing |
| `rlsAuditDashboard.js` | ~300 | Platform security dashboard API |

### 38.13 Secure Flow Drift Detection (Phase F.10)

Runtime assertion engine that validates the complete security enforcement chain was applied to every org-plane request. Detects architectural drift where a route handler bypasses one or more security layers.

**Security Chain (required markers per request):**
```
1. Context Layer          → req.rls populated (JWT-derived, frozen)
2. Execution Layer        → secureModel used (markSecureModelUsed)
3. Field-Level Security   → fieldFilter applied (read) / fieldWriteGuard applied (write)
4. Taxonomy Layer         → annotation validated (optional, runtime)
```

**Marker Flow:**
| Marker | Stamped By | File |
|--------|-----------|------|
| `secureModelUsed` | `markSecureModelUsed(ctx)` | `core/rls/secureModel.js` |
| `flsReadApplied` | `markFLSReadApplied(req)` | `rbac/fieldFilter.js` |
| `flsWriteApplied` | `markFLSWriteApplied(req)` | `rbac/fieldWriteGuard.js` |
| `taxonomyValidated` | `markTaxonomyValidated(req)` | `core/rls/secureFlowAssertion.js` |

**Middleware Mounting (app.js):**
```
subscriptionGuard → protect → featureFlagMiddleware → branchContext
    → unifiedCapability → assertCapabilities → ssotEnforcer
    → rlsContext → secureFlowMiddleware() → orgV1Routes
```

`secureFlowMiddleware()` hooks into `res.on("finish")` to assert all required markers were stamped before the response completed. It NEVER blocks the response in warn/audit mode.

**Enforcement Modes:**
| Mode | Env Value | Behavior |
|------|-----------|----------|
| Warn | `SECURE_FLOW_MODE=warn` | Log at WARN level (default, recommended for rollout) |
| Enforce | `SECURE_FLOW_MODE=enforce` | Log at ERROR level, trigger alerts |
| Audit | `SECURE_FLOW_MODE=audit` | Log at INFO level (silent, dev only) |
| Strict | `enforceSecureFlowStrict()` | Pre-response block via `res.json()` override |

**Exempt Routes (built-in, not subject to drift detection):**
- `/api/health` — Health checks
- `/api/public` — Public endpoints
- `/api/platform` — Platform plane (separate security model)
- `/metrics` — Prometheus metrics
- `/admin/queues` — Queue dashboard
- `/.well-known` — OIDC/discovery

**Violation Event Schema:**
```json
{
  "event": "SECURE_FLOW_VIOLATION",
  "mode": "warn",
  "route": "GET /api/v1/org/patients",
  "violations": ["SECURE_MODEL_BYPASS: secureModel was not used in this request"],
  "statusCode": 200,
  "userId": "ObjectId",
  "organizationId": "ObjectId",
  "timestamp": "2026-03-25T04:00:00Z"
}
```

**Source Files:**
| File | Lines | Purpose |
|------|-------|---------| 
| `secureFlowAssertion.js` | 326 | Marker functions, assertion engine, middleware |

### 38.14 Architecture Invariants (Post-F.10 — Complete)

| # | Invariant | Enforcement |
|---|-----------|-------------|
| INV-17 | SYSTEM_CONTEXT_VERIFICATION | HMAC-SHA256 with timing-safe comparison |
| INV-18 | PUBLIC_TOKEN_BINDING | JWT plane isolation |
| INV-19 | NON_NULL_ORG_CONTEXT | Fail-closed on null context |
| INV-21 | BOOTSTRAP_RLS_ENFORCEMENT | secureModel required at boot |
| INV-22 | DEEP_PIPELINE_RLS | `$lookup`/`$facet` organizationId scoping |
| INV-23 | PIPELINE_IMMUTABILITY | Clone-before-transform |
| INV-26 | RLS_TAXONOMY_ENFORCEMENT | Taxonomy guard + CI validator |
| INV-27 | FIELD_LEVEL_SECURITY | Read filter + Write guard + CI parity |
| INV-28 | RUNTIME_DRIFT_DETECTION | Request-scoped marker assertion |
| INV-29 | SECURE_FLOW_ENFORCEMENT | All org-plane requests must traverse: secureModel → FLS → taxonomy → drift detection. Missing layer triggers `SECURE_FLOW_VIOLATION`. |

**7-Layer Enforcement Chain:**
```
Layer 1 — CONTEXT        req.rls / createSystemContext (HMAC-signed)
Layer 2 — EXECUTION      secureModel (fail-closed, org-scoped)
Layer 3 — QUERY          aggregateSecurity (deep pipeline hardening)
Layer 4 — OUTPUT         projectionSanitizer (terminal field control)
Layer 5 — POLICY         FLS: fieldFilter (read) + fieldWriteGuard (write)
Layer 6 — GOVERNANCE     taxonomy + CI + audit + anomaly detection
Layer 7 — DRIFT          secureFlowAssertion (runtime chain validation)
```

---

## SECTION 39 — SETTINGS HUB (Organization Settings Integration)

**Added:** 2026-03-26 — Pre-Implementation Hardening
**Phase:** Architectural Safeguards (bridge contracts + security guards — no feature routes yet)
**Plane:** Bridge layer (Org → Platform, read-only + ticket write)

### 39.1 Architecture Overview

The Settings Hub exposes platform-level billing and support services to organization users via a **bridge pattern** — stateless adapter services that translate org-scoped requests into platform-domain operations and map the results to contract-compliant DTOs.

```
Org User (JWT: org context)
    │
    ▼
Org API Route (/api/v1/org/settings/billing/* or /settings/support/*)
    │ authorize() + requireEntitlement() + requireOrgPermission()
    │
    ▼
Bridge Service (src/services/bridges/)
    │ assertOrgContext(req, resourceOrgId)
    │ Platform service call (read-only for billing, read+write for support)
    │
    ▼
DTO Transformer (src/services/bridges/utils/transformers.js)
    │ Strips platform internals
    │ Coerces types (ObjectId → string, Date → ISO)
    │
    ▼
Contract-Compliant Response (no raw Mongoose documents)
```

**Invariants:**
- ✔ Bridge services NEVER expose platform schema or internal IDs
- ✔ organizationId ALWAYS comes from JWT (never request body/params)
- ✔ Bridge services NEVER import org-plane models
- ✔ Platform services NEVER import org-plane models
- ✔ DTO transformers are the ONLY boundary between planes
- ✔ Comments on support tickets are append-only (no edits, no deletes)

### 39.2 Bridge Contract Layer

| Contract File | Endpoints | Direction |
|--------------|-----------|-----------|
| `specs/contracts/bridges/orgBilling.contract.js` | `getActiveSubscription`, `getInvoiceHistory`, `getUsageQuotas`, `createPortalSession` | Read-only |
| `specs/contracts/bridges/orgSupport.contract.js` | `createTicket`, `listTickets`, `getTicketDetail`, `addComment` | Read + Write |

### 39.3 Org Context Guard

| File | Exports | Purpose |
|------|---------|---------|
| `core/security/assertOrgContext.js` | `assertOrgContext(req, resourceOrgId)`, `extractOrgId(req)`, `orgContextMiddleware()` | Anti-IDOR guard for bridge services |

**Security Codes:**
- `ORG_CONTEXT_MISSING` → 403 (no org in JWT context)
- `ORG_CONTEXT_MISMATCH` → 403 (resource belongs to different org)

### 39.4 DTO Sanitization Layer

| File | Transformers |
|------|-------------|
| `services/bridges/utils/transformers.js` | `mapSubscription`, `mapInvoice`, `mapUsageQuota`, `mapTicket`, `mapTicketDetail` |

**Sanitization Rules:**
- Platform-internal fields (provider IDs, internal notes, system messages) are NEVER included
- organizationId is NEVER in output
- All ObjectIds coerced to strings
- All dates coerced to ISO strings
- `conversationThread` system messages filtered; `actorType` mapped to `authorRole`

### 39.5 RBAC — New Permission

| Permission | String | Added In |
|-----------|--------|----------|
| `SUPPORT_WRITE` | `support.write` | Settings Hub pre-hardening |

**Role Assignments:**
| Role | `support.write` |
|------|----------------|
| org_admin | ✅ |
| doctor | ✅ |
| assistant | ✅ |
| receptionist | ✅ |
| lab_technician | ❌ |

### 39.6 PBAC — Support Write Policy

```
[P.SUPPORT_WRITE]:
  - org_admin → can write on ALL org tickets (priority 100)
  - staff → can write on OWN tickets only (isOwner, priority 80)
```

### 39.7 FLS — New Resources

| Resource | Purpose | Roles |
|----------|---------|-------|
| `subscription` | Platform billing DTO | org_admin (full), doctor (plan+features), assistant/receptionist (plan+status), lab_tech (none) |
| `supportTicket` | Ticket detail with conversation | org_admin (full+SLA), doctor/assistant/receptionist (full-SLA), lab_tech (basic, no comments) |

### 39.8 Ticket Model Update

Added compound index for efficient org-scoped listing:
```javascript
ticketSchema.index({ organizationId: 1, createdAt: -1 });
```

### 39.9 Implementation Status

| Component | Status |
|-----------|--------|
| Bridge contracts | ✅ Defined |
| Org context guard | ✅ Implemented |
| DTO transformers | ✅ Implemented |
| DTO enforcement wrapper | ✅ Implemented |
| RBAC permission | ✅ Registered |
| PBAC policy | ✅ Registered |
| FLS resources | ✅ Registered |
| Ticket index | ✅ Added |
| Billing bridge service | ✅ Implemented |
| Support bridge service | ✅ Implemented |
| Billing API routes | ✅ Implemented (3 endpoints) |
| Support API routes | ✅ Implemented (4 endpoints) |
| Bridge rules file | ✅ Created |
| Frontend API layer | ✅ Implemented |
| Frontend query keys | ✅ Registered |
| Frontend billing hooks | ✅ Implemented |
| Frontend support hooks | ✅ Implemented |
| Frontend DTO types | ✅ Documented |
| Frontend rules file | ✅ Created |
| Frontend UI pages | ✅ Implemented (Phase H.4) |

### 39.10 Frontend Architecture

```
Component → useSettingsBilling/useSettingsSupport (React Query)
    → settingsApi (centralized api client)
        → /api/v1/org/settings/* (backend bridge routes)
```

**Data Layer:**
| File | Purpose |
|------|---------|
| `services/settings.api.js` | API client (uses centralized `api` from `@/services/api`) |
| `lib/query/queryKeys.js` | `QK.settingsBilling` + `QK.settingsSupport` key factories |
| `modules/org/settings/hooks/useSettingsBilling.js` | Subscription, invoices, usage hooks |
| `modules/org/settings/hooks/useSettingsSupport.js` | Ticket list, detail, create, comment hooks |
| `types/settings.types.js` | JSDoc DTO shape definitions |

**Permission Gating:**
- Uses existing `usePermission("billing.read")` from `@/org/hooks/usePermission`
- Route-level guard via `RequireOrgPermission`
- Backend enforces via `authorize()` — frontend gating is UX-only

### 39.11 UI Components

**Reusable Components:**
| Component | File | Description |
|-----------|------|-------------|
| `StatusBadge` | `components/StatusBadge.jsx` | Color-coded badge for ticket/invoice/subscription status |
| `PriorityTag` | `components/PriorityTag.jsx` | Priority indicator with colored dot |
| `TicketCard` | `components/TicketCard.jsx` | Ticket list item with status, priority, date |
| `ChatBubble` | `components/ChatBubble.jsx` | Chat bubble (left=agent, right=user) |

**Page Components:**
| Page | Route | Permission | Screens |
|------|-------|-----------|---------|
| `SupportPage` | `/org/settings/support` | `support.read` | Ticket list, empty state, new ticket form, ticket detail |
| `BillingPage` | `/org/settings/billing` | `billing.read` | Plan card, usage bars, payment card, invoice table |

**Settings Page Integration:**
- Billing & Support section added to Settings page
- Navigation cards gated by `billing.read` and `support.read`

---

## SECTION 40 — FRONTEND CACHE GOVERNANCE & VISIBILITY SYNC

**Date Added:** March 2026  
**Focus:** Platform to Public Plane synchronization, React Query Strict Mode, and Zero-Trust Cross-Tab Communication.

### 40.1 Architecture Overview

The system strictly decouples the **Platform Plane** (source of truth & mutation) from the **Public Marketing Plane** (consumer). Visibility settings (`public`, `sales`, `internal`) manipulated in the Plan Builder must reflect on the local tab and across all active application tabs with sub-second latency, without bypassing security constraints.

### 40.2 React Query Governance (Server State Law)

To ensure the frontend is never out of sync with the backend database:
- **No Local State for Server Data:** `useState` is forbidden for API data. The UI must render directly from the React Query cache via `useQuery`.
- **Query Key Registry Law:** All queries use a single source of truth at `@/lib/query/planQueryKeys.js` (e.g., `PLAN_QUERY_KEYS.publicPlans(country)` and `PLAN_QUERY_KEYS.ALL_PUBLIC`). Hardcoded strings are blocked.
- **Mandatory Cache Invalidation:** After ANY mutation affecting Plan Versions (Save Draft, Publish, Duplicate, Deprecate), the modifying plane MUST call `queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.ALL_PUBLIC })`. Manual `refetch()` commands are forbidden.

### 40.3 Cross-Tab Sync (BroadcastChannel)

Instant multi-tab synchronization is achieved via a **Zero-Trust BroadcastChannel** mapped to `'plans'` (`@/lib/realtime/planChannel.js`).

**Rules:**
1. **Zero-Trust Events:** Broadcasts MUST strictly carry an enum `type` ONLY (e.g., `PLAN_UPDATED`, `PLAN_DEPRECATED`). Data payloads (`{ plans: [...] }`) are forbidden to prevent state drift and security leaks across planes.
2. **Platform Plane Emits:** The source of truth (Platform Builder, Plans List) calls `emitPlanUpdate(type)` immediately following the initial mutation request and local cache invalidation.
3. **Public Plane Listens:** The consumer (Pricing page, Layouts) uses `usePlanChannelListener` to intercept the signal and implicitly fire a local `queryClient.invalidateQueries(ALL_PUBLIC)`. The React Query engine orchestrates the `GET` refetch automatically.

### 40.4 Database-Level Visibility Enforcement

The frontend is forbidden from maintaining visibility filters natively (`plans.filter(p => p.visibility === 'public')`).

All visibility enforcement occurs purely inside backend projection handlers (`status: "active", visibility: "public"`). Consumers only ever witness a sanitized array of valid pricing entities.

---

## SECTION 41 — DOMAIN NAMING LAW (Billing / Finance / Accounting)

**Date Added:** 2026-03-30
**Authority:** Domain Glossary v1.0 (`docs/domain-glossary.md`)
**Enforcement:** `permissionValidator.js`, Route header comments, `orgPermissions.js` annotations

### 41.1 Problem Statement

The word "billing" refers to two completely different concepts in this system. Failure to separate them causes:
- Permission misuse (`billing.read` guard used in analytics routes)
- Cognitive confusion between clinic transactions and SaaS subscription management
- Architectural drift in future implementations

### 41.2 Canonical Domain Definitions

| Term | Semantic | Domain | Permission |
|---|---|---|---|
| `billingDomain` | Clinic Finance Engine (patient invoices, payments, ledger) | `modules/billingDomain/` | `invoices.*`, `payments.*`, `accounting.read` |
| `billing` / `billing.read` | SaaS Subscription Access (org's own plan, quotas, platform invoices) | `routes/org/settingsBilling.routes.js` | `billing.read` |
| `accountingDomain` | Analytics & Intelligence Layer (revenue summaries, P&L, dashboards) | `modules/accountingDomain/` *(planned)* | `accounting.read` |

### 41.3 Permission Mapping Law (ABSOLUTE)

```
Clinic Invoice CRUD        →  invoices.*
Clinic Payment CRUD        →  payments.*
Clinic Finance Analytics   →  accounting.read    ← /org/finance/* endpoints
SaaS Subscription Reads    →  billing.read       ← /settings/billing/* endpoints ONLY
Ledger Views               →  ledger.read
Refund Operations          →  refunds.*
```

### 41.4 Collision Matrix (Zero-Tolerance)

| Violation | Correct |
|---|---|
| `billing.read` guarding `/org/finance/*` | `accounting.read` guarding `/org/finance/*` |
| `accounting.read` guarding `/settings/billing/*` | `billing.read` guarding `/settings/billing/*` |
| `accountingDomain` importing `billingDomain` services directly | `accountingDomain` consuming via `eventBus` only |

### 41.5 Enforcement Artifacts

- `docs/domain-glossary.md` — Full collision matrix and definitions
- `backend/src/modules/billingDomain/README.md` — Clinic Finance Engine identity
- `backend/src/modules/accountingDomain/README.md` — Analytics Layer identity
- `backend/src/utils/permissionValidator.js` — Runtime guard (throws in test/strict env)
- `backend/src/rbac/orgPermissions.js` — `BILLING_READ` annotated with SaaS-only scope
- `billingDomain/analytics/routes/billingAnalytics.routes.js` — Header enforcing `ACCOUNTING_READ`
- `routes/org/settingsBilling.routes.js` — Header confirming `billing.read` validity

---

## SECTION 42 — FULL AUTO UI ENGINE (v1.0)

**Date Added:** 2026-03-31
**Status:** IMPLEMENTED (Production Bootstrap Phase)
**Goal:** Eliminate manual route/sidebar drift by making the backend the Source of Truth for frontend navigation.

### 42.1 Architecture Overview

The UI Engine is a codegen-assisted runtime that synchronizes backend module metadata with frontend routing and navigation. It ensures that any new module added to the backend is automatically wired into the frontend with zero-trust security guards (RBAC + Entitlements) already in place.

```
[Backend] uiManifest.js (Pure Data SSOT)
    │
    ▼ npm run generate:ui (scripts/generateUIEngine.js)
    │
[Frontend] src/generated/uiEngine.js (Frozen Constants: ROUTES, SIDEBAR, PAGES)
    │
    ▼ [Runtime Components]
    ├── AutoRouter  (generates <Route> tree)
    └── AutoSidebar (generates sidebar from SIDEBAR constant)
```

### 42.2 Source of Truth (uiManifest.js)

The `backend/src/platform/uiManifest.js` is the canonical descriptor for the organization plane interface. It is a zero-dependency CommonJS file safe for build-time execution.

**Metadata Schema:**
| Field | Purpose |
|-------|---------|
| `key` | FeatureRegistry key (e.g., `patients`) |
| `module` | FeatureGate key (used for plan entitlement checks) |
| `isCore` | Boolean — if true, bypasses plan checks (always available) |
| `ui.icon` | Heroicon name (from `@heroicons/react/24/outline`) |
| `ui.route` | URL segment relative to `/org` |
| `ui.page` | Component name in `src/pages/org/index.js` |
| `ui.permission` | RBAC permission required (null = authenticated org user only) |
| `ui.order` | Sorting order for sidebar items |
| `ui.children` | Array of child routes (inherited module gates, hidden from nav by default) |

### 42.3 UI Engine Components

| Component | Role | Security Layer |
|-----------|------|----------------|
| `AutoRouter.jsx` | Replaces manual `<Route>` declarations in `App.jsx` | Entitlement + RBAC via `OrgPermissionGuard` |
| `AutoSidebar.jsx` | Replaces hardcoded sidebar links | Runtime visibility filtering (RBAC + Module) |
| `PageLoader.jsx` | Resolves name → component via Registry | Type-safe lookup; returns fallback on registry miss |
| `OrgPermissionGuard.jsx` | Dual-layer security wrapper | 1. `useCapability` (RBAC) 2. `FeatureGate` (Plan) |

### 42.4 Documentation & Workflow

**Page Registration:**
All org-plane pages must be exported from `frontend/src/pages/org/index.js`. This central registry allows `PageLoader` to resolve component strings to actual code chunks.

**Generator Script:**
```bash
# From backend/
npm run generate:ui
```
This updates the `uiEngine.js` artifact and `uiEngine.json` snapshot.

**CI Drift Guard:**
```bash
# From backend/
npm run validate:ui-drift
```
Detects if `uiEngine.json` deviates from `uiManifest.js` (e.g., if a developer updated the manifest but forgot to regenerate the frontend artifact). Blocks deployment on mismatch.

### 42.5 Invariants

1. **Zero Raw Routes:** No manual `<Route>` shall be added for modules present in the `uiManifest`.
2. **Zero Hardcoded Nav:** Sidebar links must derive purely from the `SIDEBAR` constant.
3. **Fail-Closed Routing:** If a page name in the manifest is missing from the registry, `PageLoader` returns a developer-friendly error fallback instead of crashing the router.
4. **Entitlement-First:** All plan-gated routes (`isCore: false`) MUST be wrapped in a `<FeatureGate>` via the `AutoRouter`.
5. **No Cross-Plane Imports:** The UI Engine (Org Plane) must NEVER import Platform Plane pages or vice versa.

---

## §43 — PATIENT DTO STANDARDIZATION & VALIDATION LAYER (Phase 9)

> **Added:** 2026-03-31 | **Architecture:** Contract-Driven (DTO SSOT)

### 43.1 Architecture Model

```
DB Model → DTO Builder → API Response → Frontend Render
             ↑
         Validation Layer (Zod)
```

**Principle:** Backend is the Single Source of Truth. Frontend is a dumb renderer that consumes pre-computed fields (especially `displayName`). No domain logic lives in the UI.

### 43.2 DTO Layer (`backend/src/dto/patient.dto.js`)

| Export | Purpose | Consumers |
|--------|---------|-----------|
| `resolveDisplayName(p)` | Centralized name resolution (SSOT) | All DTOs + standalone usage |
| `buildPatientListDTO(p)` | List/directory view shape | `patient.list.service.js` |
| `buildPatientSearchDTO(p, matchType)` | Search result shape | `patient.search.controller.js` |
| `buildPatientCoreDTO(p)` | Aggregate core sub-object | `patient.aggregate.service.js` |
| `buildPatientSummaryDTO(p)` | Minimal shape for notifications | `intake.controller.js` |

**Display Name Resolution Chain:**
```
nameEnglish (trimmed) → nameArabic (trimmed) → fullNameNormalized → patientCode → "—"
```

### 43.3 Validation Layer (`backend/src/validation/patient.schema.js`)

| Schema | Endpoint | Key Rule |
|--------|----------|----------|
| `createPatientSchema` | `POST /patient/domain` | At least one name field required (`.refine()`) |
| `updatePatientSchema` | `PUT /patient/domain/:id` | Partial update passthrough |
| `quickCreatePatientSchema` | `POST /patient/domain/quick` | `fullName` + `phone` + `primaryBranchId` required |

**Name Integrity Invariant:**
```javascript
.refine(data =>
  data.nameEnglish?.trim() || data.nameArabic?.trim() ||
  data.name?.trim() || data.fullName?.trim(),
  { message: "At least one name field is required" }
)
```

### 43.4 Frontend Strict Render Mode

All frontend patient components MUST consume `patient.displayName` directly. Inline domain logic is forbidden.

**Guard Pattern (dev-mode only):**
```javascript
if (!patient.displayName) console.error("[DTO_VIOLATION] Missing displayName", patient._id);
```

**Migrated components:**
- `PatientWorkspace.jsx` (PatientRowCard)
- `PatientsPage.jsx` (PatientRow)
- `WorkspaceContextPanel.jsx` (LargeAvatar + main panel)
- `PatientContextPanel.jsx`
- `PatientExpandedRow.jsx`
- `PatientRegistrationWizard.jsx` (DuplicateBanner + FamilySuggestionCard)
- `OrthodonticTab.jsx`
- `OrgHeader.jsx` (defensive fallback for command search)

### 43.5 Invariants

1. **DTO SSOT:** No service or controller may compute `displayName` inline — must use `resolveDisplayName()`.
2. **Validation Before Write:** All patient create/update mutations pass through Zod validation before reaching the service layer.
3. **Frontend Dumb Render:** Frontend trusts `displayName` from the API response; fallback chains in UI components are forbidden.
4. **Name Integrity:** The `createPatientSchema` `.refine()` rule prevents empty-name patient records at the API boundary.
5. **Trim Safety:** `_detectNameLanguage()` in `patientCreate.service.js` trims all name inputs to prevent whitespace-only names.

---

## §44 — ORTHODONTIC EVENT-SOURCED ARCHITECTURE REFACTOR

**Version:** 1.0 (2026-04-11)
**Depends on:** §34 (Orthodontic Module), §36 (RLS), §43 (Patient DTO)
**Replaces:** Ad-hoc `logEvent` fire-and-forget pattern, non-deterministic entity ID generation, silent localStorage hydration, partial undo stack

---

### 44.1 Architecture Goal

The orthodontic clinical chart must operate as a **true event-sourced system**. Every state transition must flow through a single, deterministic write path:

```
UI → dispatchClinicalAction → reducer (pure) → logEventSync → projection → snapshot
```

All state must be reproducible by replaying the event log. No state may be silently derived, inferred, or lost.

---

### 44.2 Single Write Path (P0)

#### 44.2.1 Deterministic Replay — No Fallback IDs

All entity-creation events (`ELASTIC_APPLIED`, `POWERCHAIN_APPLIED`, `ACCESSORY_ADDED`, `LIGATURE_ADDED`, `IPR_ADDED`, `SPACE_MARKER_ADDED`, `TAD_INSERTED`, `BONDING_APPLIED`) require a stable, caller-supplied `payload._id`.

**Enforced in both reducers (backend + frontend):**

```js
// Both backend/shared/clinicalReducer.js and frontend/utils/clinicalReducer.ts
if (!entityId) {
  throw Object.assign(
    new Error("INVALID_EVENT_PAYLOAD: Missing stable ID for <EVENT_TYPE>"),
    { code: 'MISSING_ENTITY_ID', eventType: '<EVENT_TYPE>' }
  );
}
```

The previous `id: payload._id ?? \`replay-${Date.now()}\`` fallback pattern is **permanently banned**. Non-deterministic IDs make replay produce different state on each run — a fundamental event-sourcing violation.

#### 44.2.2 Transactional Event Logging (`logEventSync`)

All service-layer mutations use `logEventSync` (blocking, transactional) instead of `logEvent` (fire-and-forget, deprecated).

**Pattern (all orthodontic services):**

```js
const session = await req.dbConnection.startSession();
try {
  await session.withTransaction(async () => {
    const [entity] = await Model.create([{ ...fields }], { session });
    await clinicalEventService.logEventSync(req, {
      type: 'ENTITY_TYPE',
      payload: { _id: entity._id.toString(), ...fields },
    }, { session });
  });
} finally {
  await session.endSession();
}
```

**Affected services:** `tad.service.js`, `bonding.service.js`, `clinicalAction.service.js`, `sequence.service.js`.

**Critical constraint:** Always use `req.dbConnection.startSession()` (per-org DB). Never `mongoose.startSession()` (shared DB — wrong tenant).

#### 44.2.3 Contract Enforcement at Write Time (`validateClinicalEvent`)

`clinicalEvent.service.js` exports `validateClinicalEvent(event)` which is called inside both `logEvent` and `logEventSync` before any DB write:

```js
const ENTITY_ID_REQUIRED_TYPES = new Set([
  "ELASTIC_APPLIED", "POWERCHAIN_APPLIED", "ACCESSORY_APPLIED",
  "ACCESSORY_ADDED", "LIGATURE_ADDED", "IPR_ADDED",
  "SPACE_MARKER_ADDED", "TAD_INSERTED", "BONDING_APPLIED",
]);

function validateClinicalEvent(event) {
  if (!event.eventId) throw { code: "EVENT_ID_REQUIRED", statusCode: 400 };
  if (!event.type)    throw { code: "EVENT_TYPE_REQUIRED", statusCode: 400 };
  if (ENTITY_ID_REQUIRED_TYPES.has(event.type) && !event.payload._id)
    throw { code: "MISSING_ENTITY_ID", statusCode: 422 };
}
```

#### 44.2.4 Snapshot Hash Stability (`_stableStringify`)

`snapshot.service.js` uses an inline recursive key-sorted serialisation function to produce deterministic SHA-256 hashes regardless of property insertion order:

```js
function _stableStringify(val) {
  if (val === null || typeof val !== 'object' || Array.isArray(val))
    return JSON.stringify(val);
  const sortedKeys = Object.keys(val).sort();
  const parts = sortedKeys.map((k) => `${JSON.stringify(k)}:${_stableStringify(val[k])}`);
  return `{${parts.join(',')}}`;
}
```

`json-stable-stringify` npm package is NOT used (network policy blocks npm installs in the target environment).

#### 44.2.5 Hydration Lock (`useHydrationLock`)

`frontend/hooks/useHydrationLock.ts` — ref-backed boolean that prevents React Query server refetches from overwriting active, unsaved chart edits.

- **Engaged:** on first `saveToHistory()` call (user has begun editing)
- **Released:** only after successful `handleSaveSnapshot` or explicit user reset
- **Guards:** all four `HYDRATE_SNAPSHOT` useEffects in `SnapshotEditor` check `isHydrationLocked()` before dispatching

#### 44.2.6 Draft Recovery Consent (`DraftRecoveryModal`)

localStorage chart drafts are **never silently hydrated**. When a draft is found, it is surfaced via `DraftRecoveryModal` for explicit user confirmation. Silent auto-apply is permanently banned.

#### 44.2.7 Undo Correctness — DB-Backed Side Effects (`useUndoHistory`)

`frontend/hooks/useUndoHistory.ts` — parallel `historyRef` + `undoSideEffectsRef` stacks (capped at 20). When a `TAD_INSERTED` action is undone:

1. Optimistically removes the TAD from local chart state via `dispatch({ type: 'REMOVE_TAD' })`
2. Calls `removeTadFromDb(tadDbId)` to delete the record from DB
3. React Query invalidation re-hydrates the TAD list from authoritative server state

Pure in-memory rollback without the DB delete is **permanently banned** for TAD undo.

---

### 44.3 Structural Fixes (P1)

#### 44.3.1 WorkflowRecordSet Extraction (P1-1)

`WorkflowRecordSet` is now a standalone collection (previously embedded in `WorkflowSnapshot.recordSets[]`):

```
WorkflowRecordSet {
  _id, organizationId, caseId, snapshotId,
  legacyId,   // carried-over client id from embedded doc
  name, type, version, date, chiefComplaint, audioUrl,
  records[], stlFiles[], problemList, treatmentPlan,
  createdAt, updatedAt
}
```

**Indexes:** `{ caseId, createdAt }`, `{ snapshotId }`, `{ organizationId }`, `{ caseId, legacyId }`

**Migration:** `backend/src/modules/orthodontics/clinical/migrations/extractWorkflowRecordSets.js`
- Idempotent (skips existing docs keyed by `snapshotId + legacyId`)
- `WorkflowSnapshot.recordSets[]` preserved until service layer fully migrated
- Run per-org: `DB_URI="..." node extractWorkflowRecordSets.js`

#### 44.3.2 Visit Requires Snapshot Guard (P1-2)

`visitSession.service.js` `endVisit()` now enforces `VISIT_REQUIRES_SNAPSHOT` (422) when:
- No `snapshotId` passed, AND
- No `ClinicalSnapshot` exists for the visit in DB, AND
- Caller did not set `opts.noSnapshot: true`

The previous "log warning and allow close" path is replaced by a hard block. The `noSnapshot` escape hatch is for notes-only visits and automated test teardown only.

#### 44.3.3 Duplicate `getEventsAfterSnapshot` Removed (P1-3)

`clinicalEvent.service.js` previously contained a duplicate implementation of `getEventsAfterSnapshot`. The authoritative implementation lives exclusively in `eventReplay.service.js`.

The duplicate was replaced with a deprecated shim that:
- Delegates to `eventReplay.service.getEventsAfterSnapshot(...args)`
- Emits `console.warn` in non-production environments
- Will be removed once all callers are updated to import from `eventReplay.service`

#### 44.3.4 Reducer Parity Test (P1-4)

`backend/src/modules/orthodontics/shared/__tests__/clinicalReducer.parity.test.js` — two Jest suites:

- **Suite 1 (always runs):** 22 backend reducer unit tests — all event types, idempotency, pure-function invariants, `MISSING_ENTITY_ID` throws, full sequence replay.
- **Suite 2 (conditional):** Frontend ↔ backend parity tests — feeds identical event sequences to both reducers and asserts `expect(feState).toEqual(beState)`. Skipped with instructions if `frontend/dist/clinicalReducer.js` is not compiled.

**To enable Suite 2:**
```bash
cd frontend && npx tsc --outDir dist --module commonjs --esModuleInterop true \
  src/org/modules/patients/components/orthodontic-chart/utils/clinicalReducer.ts
```

---

### 44.4 Architecture Cleanup (P2)

#### 44.4.1 SnapshotEditor Decomposition (P2-1)

`SnapshotEditor.tsx` (4780+ lines) was partially decomposed. Two hooks extracted:

| Hook | File | Extracted Logic |
|------|------|-----------------|
| `useHydrationLock` | `hooks/useHydrationLock.ts` | Hydration lock ref, `isHydrationLocked()`, `lockHydration()`, `unlockHydration()` |
| `useUndoHistory` | `hooks/useUndoHistory.ts` | `historyRef`, `undoSideEffectsRef`, `saveToHistory(sideEffect?)`, `undo()`, `resetHistory()`, `canUndo` |

`SnapshotEditor` updated to import both hooks. All 9 inline usages of `hydrationLockedRef.current`, `historyRef.current = []`, and `setCanUndo(false)` replaced with hook API calls. `undoWithLog()` wrapper added for the action log side-effect (UX concern, not part of the hook).

#### 44.4.2 BroadcastChannel Centralisation (P2-2)

The inline `new BroadcastChannel(...)` `useEffect` in `SnapshotEditor` (35 lines) was replaced with `useCaseTabChannel(caseId)` from `src/lib/realtime/caseTabChannel.ts`.

`caseTabChannel.ts` follows the same singleton-and-zero-trust pattern as `planChannel.js`:
- Per-case channel name: `case_tab_{caseId}`
- Events: `TAB_OPENED`, `TAB_CLOSED` — `tabId` only, no clinical data
- Zero-trust validation: unknown event types logged and rejected; extra payload keys hard-rejected
- `TAB_CLOSED` message sent on unmount before `channel.close()`
- Graceful no-op when `BroadcastChannel` API is unavailable

---

### 44.5 Invariants

1. **Single Write Path:** All clinical state mutations flow through `dispatchClinicalAction → logEventSync`. No direct DB writes without event logging.
2. **No Fallback IDs:** Entity-creation events must carry stable `payload._id` supplied by the caller. `Date.now()`-based IDs are permanently banned.
3. **Transactional Logging:** All service-layer mutations use `req.dbConnection.startSession()` + `session.withTransaction()`. Never `mongoose.startSession()`.
4. **Hydration Lock:** React Query refetches are blocked while `isHydrationLocked() === true`. Lock released only after snapshot save or explicit reset.
5. **Draft Consent:** localStorage chart drafts are never auto-applied. User must confirm via `DraftRecoveryModal`.
6. **Undo Integrity:** Undoing a `TAD_INSERTED` action deletes the TAD from DB. Pure in-memory rollback is not sufficient.
7. **Reducer Parity:** Backend and frontend reducers must produce identical output for identical input. Divergence is a data-integrity bug caught by the parity test suite.
8. **Visit Snapshot Gate:** A visit cannot be closed without a linked clinical snapshot unless `noSnapshot: true` is explicitly set.
9. **No Inline BroadcastChannel:** All `new BroadcastChannel(...)` instantiations must go through a centralized singleton module in `src/lib/realtime/`.

4 — ORTHODONTIC EVENT-SOURCED ARCHITECTURE REFACTOR & AUDIT

**Version:** 1.0 (2026-04-11) with Audit Findings
**Depends on:** §34 (Orthodontic Module), §36 (RLS), §43 (Patient DTO)
**Audit Date:** 2026-04-11
**Audit Scope:** 92 backend files, 151 frontend files (243 total)

---

### 44.1 Event-Sourced Architecture Foundation

The orthodontic domain operates on a deterministic, replay-safe event-sourcing architecture enforcing a single write path:

```
UI Action
  ↓
dispatchClinicalAction(event)
  ↓
reducer(state, event)  [PURE FUNCTION]
  ↓
logEventSync(req, event)  [ATOMIC TRANSACTION]
  ↓
projection(events) → snapshot
  ↓
React Query invalidation
  ↓
Frontend render
```

**Critical invariant:** Every clinical mutation (TAD insertion, bonding application, sequence step completion, etc.) must persist to both the MongoDB database AND the clinical event log within a single transaction. No silent failures allowed.

---

### 44.2 Transaction Coverage (Compliance Audit 2026-04-11)

**Total transactional mutation paths: 24/24 (100% coverage)**

#### 4 Critical Transaction Gaps (DISCOVERED & FIXED)

During the audit, 6 function-level transaction gaps were identified where `logEventSync` calls were not wrapped in MongoDB transactions. If the event log failed, DB changes persisted without audit trail entries, violating event-sourcing invariants.

| Service | Function | Issue | Fix Applied | Status |
|---------|----------|-------|------------|--------|
| `clinicalAction.service.js` | `_createAction()` | 14 action types across 7 domains | Wrapped in `req.dbConnection.startSession() + session.withTransaction()` | ✅ FIXED |
| `clinicalAction.service.js` | `_removeAction()` | 14 action types across 7 domains | Wrapped in transaction | ✅ FIXED |
| `bonding.service.js` | `applyBonding()` | Bulk bracket operations without atomic guarantee | Wrapped in transaction | ✅ FIXED |
| `sequence.service.js` | `upsertSequencePlan()` | Plan mutations not transactional | Wrapped in transaction | ✅ FIXED |
| `sequence.service.js` | `updateProgress()` | Step completion tracking without audit guarantee | Wrapped in transaction | ✅ FIXED |
| `tad.service.js` | `failTad()` | TAD failure status change without event log guarantee | Wrapped in transaction | ✅ FIXED |

#### Per-Service Transactional Breakdown

| Service | Functions | Count | Status |
|---------|-----------|-------|--------|
| `tad.service.js` | insertTad, markForRemoval, removeTad, failTad, reinsertTad | 5 | ✅ PASS |
| `bonding.service.js` | applyBonding, debondTooth, repositionBracket | 3 | ✅ PASS |
| `clinicalAction.service.js` | _createAction (7 domains), _removeAction (7 domains) | 14 | ✅ PASS |
| `sequence.service.js` | upsertSequencePlan, updateProgress | 2 | ✅ PASS |

**Fix Pattern Applied Uniformly:**
```javascript
const session = await req.dbConnection.startSession();
try {
  await session.withTransaction(async () => {
    // DB mutation (array syntax for Model.create)
    const [doc] = await Model.create([{...}], { session });
    // Transactional event log
    await logEventSync(req, {...}, { session });
  });
} finally {
  await session.endSession();
}
```

**Session Origin Compliance:**
- ✅ 20/20 session creations use `req.dbConnection.startSession()` (per-org isolation)
- ✅ 0 instances of forbidden `mongoose.startSession()` (would use platform DB)

---

### 44.3 Rules Engine v5.0 Compliance Matrix

#### Backend Compliance (92 files audited)

| Check | Result | Details |
|-------|--------|---------|
| Per-org DB isolation | ✅ PASS | `enforceDbIsolation()` in all 21 service entry points |
| Session origin | ✅ PASS | `req.dbConnection.startSession()` 20/20 times, never `mongoose.startSession()` |
| `organizationId` source | ✅ PASS | Always from `req.context`, 0 instances of `req.body.organizationId` |
| `logEventSync` (transactional) | ✅ FIXED | All mutation services use `logEventSync`, now wrapped in transactions |
| RBAC at controller | ✅ PASS | 86 `authorize(req, permission)` calls across all controllers |
| Plane isolation | ✅ PASS | 0 cross-plane imports (no platform/patient module requires in orthodontic/) |
| DTO compliance | ✅ PASS | All responses go through DTO builders in controllers |
| Route security | ✅ PASS | 9 route files, all behind auth middleware |

#### Frontend Compliance (151 files audited)

| Check | Result | Details |
|-------|--------|---------|
| React Query for server state | ✅ PASS | 0 `useState(apiData)` violations, all hooks use `useQuery`/`useMutation` |
| No manual `refetch()` | ✅ PASS | 0 instances of `refetch()` or `window.location.reload()` |
| Query key registry | ✅ PASS | Centralized query keys used throughout orthodontic hooks |
| BroadcastChannel zero-trust | ✅ PASS | 1 channel (`caseTabChannel.ts`), type-only events, `ALLOWED_KEYS` whitelist |
| BroadcastChannel singleton | ✅ PASS | 1 `new BroadcastChannel()` call (in factory only) |
| Hydration lock pattern | ✅ PASS | `useHydrationLock` hook prevents React Query refetch overwriting edits |
| Capability-based UI | ✅ PASS | No `role === 'admin'` checks, uses `useCapability()` throughout |

#### Cross-Cutting Concerns (243 files total)

| Check | Result | Details |
|-------|--------|---------|
| Event sourcing write path | ✅ PASS | UI → dispatch → reducer → logEventSync → projection → snapshot |
| Deterministic replay | ✅ PASS | Stable entity IDs at write time, 0 `Date.now()` fallbacks |
| `validateClinicalEvent` contract | ✅ PASS | All events pass entity ID validation before persistence |
| Draft recovery consent | ✅ PASS | `DraftRecoveryModal`, no silent localStorage hydration |
| Undo side effects | ✅ PASS | `useUndoHistory` with parallel stacks + TAD DB rollback |
| Multi-tab conflict detection | ✅ PASS | `useCaseTabChannel` warns on duplicate case opens |

---

### 44.4 Files Modified During Audit (2026-04-11)

| File | Changes |
|------|---------|
| `backend/src/modules/orthodontics/services/clinicalAction.service.js` | Wrapped `_createAction()` and `_removeAction()` in MongoDB transactions |
| `backend/src/modules/orthodontics/services/bonding.service.js` | Wrapped `applyBonding()` in MongoDB transaction |
| `backend/src/modules/orthodontics/services/sequence.service.js` | Wrapped `upsertSequencePlan()` and `updateProgress()` in MongoDB transactions |
| `backend/src/modules/orthodontics/services/tad.service.js` | Wrapped `failTad()` in MongoDB transaction |

---

### 44.5 Audit Conclusion

The orthodontic domain is now **fully compliant** with Rules Engine v5.0. The 6 transaction gaps discovered during this comprehensive audit (243 files scanned) were the only violations found. All fixes follow the established pattern and were applied atomically — no partial fixes or workarounds.

**Key Metrics:**
- 0 plane isolation violations
- 0 React Query violations  
- 0 deprecated `logEvent` calls
- 0 `mongoose.startSession()` usage
- 0 `organizationId`-from-body violations
- 86 RBAC authorization points
- 21 `enforceDbIsolation` guards
- 20 per-org transaction sessions
- 1 singleton BroadcastChannel with zero-trust events
- 24/24 clinical mutation paths transactional

The event-sourcing architecture is deterministic, transactionally complete, and ready for distributed deployment.

---


## §45 — ORTHODONTICS DOMAIN RBAC MIGRATION (Phase 30 FINAL)

**Version:** 1.0 (2026-04-11)
**Depends on:** §44 (Orthodontic Event-Sourced Architecture), §34 (Orthodontic Module)
**Supersedes:** Phase 14 engine-level inheritance model

---

### 45.1 Migration Summary

Phase 30 FINAL migrates the orthodontics domain from a granular 14-permission engine model to a flat **two-permission domain model**. All controllers, the feature registry, the P enum, permissionHierarchy, authorize.js, and role definitions now use exactly two strings:

| Permission | Assigned To | Covers |
|------------|-------------|--------|
| `orthodontics.full` | doctor, org_admin | All clinical mutations (TADs, bonding, sequences, cases, visits, snapshots) |
| `orthodontics.read` | assistant, lab_technician | Read-only view of all ortho data |

### 45.2 Removed Permissions (18 strings deleted)

All of the following were removed from the P enum, permissionHierarchy, authorize.js PERMISSION_INHERITANCE, featureRegistry, orgPermissions.js, and all Role documents via migration script:

```
orthodontics.manage    orthodontics.create    orthodontics.update
orthodontics.delete    orthodontics.settings  orthodontics.write
bonding.manage         bonding.read           bonding.settings
tads.manage            tads.read              tads.settings
sequence.manage        sequence.read
clinical.read          portal.monitoring      ai.ortho_analysis
patients.write         (from cast-analysis feature registry entry)
```

### 45.3 Files Modified

| File | Change |
|------|--------|
| `backend/src/rbac/orgPermissions.js` | Stripped 16 internal engine constants. PERMISSION_VERSION → 5. Only `ORTHO_FULL` + `ORTHO_READ` remain. Removed BONDING_FULL_ACCESS, TADS_FULL_ACCESS, SEQUENCE_FULL_ACCESS groups. |
| `backend/src/rbac/permissionHierarchy.js` | Removed entire ortho engine hierarchy block. Retained only non-ortho manage→read derivations (accounting, security, communication, dashboard, documents). |
| `backend/src/utils/authorize.js` | Stripped PERMISSION_INHERITANCE engine entries. PERMISSION_REGISTRY now built exclusively from P enum values. Added boot-time hierarchy key validation. |
| `backend/src/platform/featureRegistry.js` | Updated 12 feature capability entries. Replaced `bonding.manage`, `tads.manage`, `sequence.manage`, `orthodontics.create/update`, `clinical.read`, `portal.monitoring`, `ai.ortho_analysis`, `patients.write`, `orthodontics.write`. |
| `backend/src/modules/orthodontics/controllers/*.js` (8 files) | All `authorize()` calls migrated to `orthodontics.full` or `orthodontics.read`. |
| `backend/src/modules/orthodontics/clinical/controllers/*.js` (2 files) | Same migration. |
| `backend/src/modules/orthodontics/core/controllers/case.controller.js` | Same migration. |
| `backend/src/modules/ortho-todos/controllers/orthoTodo.controller.js` | Same migration. |
| `backend/src/modules/supervisor/controllers/invitation.controller.js` | JSDoc updated: `orthodontics.create` → `orthodontics.full`. |
| `backend/src/organization/featuresControl/featuresControl.controller.js` | Permission map updated to two-permission model. |
| `backend/src/organization/featuresControl/services/features.service.js` | Features list updated to two-permission model. |
| `backend/src/middleware/authorize.js` | Example updated: `orthodontics.create` → `orthodontics.full`. |
| `backend/src/modules/orthodontics/utils/ownership.guard.test.js` | TEST 6 rewritten to reflect flat model. |
| `backend/src/tests/orthodonticCases.test.js` | RBAC section rewritten. |

### 45.4 New Files

| File | Purpose |
|------|---------|
| `backend/src/rbac/migrations/migrateOrthoDomainRbac.js` | Idempotent DB migration script — removes legacy perms from all org Role documents and replaces with `orthodontics.full` / `orthodontics.read` |
| `backend/src/rbac/migrations/__tests__/migrateOrthoDomainRbac.test.js` | 52-check test matrix covering access control, legacy perm absence, role invariants, P enum cardinality |

### 45.5 Architecture Invariants (Post-Migration)

1. **Two-Permission Law:** The orthodontics domain has exactly 2 RBAC permission strings. No exceptions.
2. **Zero Hierarchy Resolution:** `authorize(req, "orthodontics.full")` and `authorize(req, "orthodontics.read")` are direct Set lookups. No hierarchy traversal for ortho.
3. **Drift Guard:** `authorize.js` PERMISSION_REGISTRY is built exclusively from `Object.values(P)`. Any controller calling `authorize()` with a string not in P throws 500 at first call.
4. **Role Assignment:** `doctor` and `org_admin` receive `orthodontics.full`. `assistant` and `lab_technician` receive `orthodontics.read`. `receptionist` receives no ortho permission.
5. **DB Migration:** Run `migrateOrthoDomainRbac.js` with `DRY_RUN=false` before deploying to replace all legacy permission strings in existing Role documents.

### 45.6 Test Matrix Results (Phase 9)

```
52 checks: PASSED=52  FAILED=0

Scenario                              Expected   Result
doctor creates TAD                    ALLOWED    ✅
assistant creates TAD                 DENIED     ✅
assistant reads case                  ALLOWED    ✅
receptionist accesses ortho.full      DENIED     ✅
receptionist accesses ortho.read      DENIED     ✅
lab_technician reads ortho            ALLOWED    ✅
lab_technician mutates ortho          DENIED     ✅
org_admin creates TAD                 ALLOWED    ✅
18 legacy perms absent from P enum               ✅ (all 18)
18 legacy perms absent from hierarchy            ✅ (all 18)
Role model invariants                            ✅ (all 6)
P enum cardinality (exactly 2)                   ✅
```

---



---

## §46 — Orthodontics RBAC Phase 30: Route Layer & Infrastructure Migration

**Date:** 2026-04-11
**Status:** ✅ COMPLETE — Server crash resolved, all deleted P constants purged from route layer and RBAC infrastructure

### Context

Phase 30 FINAL (§45) deleted 16 internal P-enum constants and replaced them with a two-permission model (`orthodontics.full` / `orthodontics.read`). Phase 2 of that migration correctly updated the *controller layer* (string literals via `authorize(req, "...")`), but the *route layer* and *RBAC infrastructure* still referenced deleted P constants via `requireOrgPermission(P.ORTHODONTICS_READ)` etc. — causing a server boot crash:

```
Error: [requireOrgPermission] Invalid permission argument: "undefined"
  at requireOrgPermission (requireOrgPermission.js:45)
  at Object.<anonymous> (orthodonticCase.routes.js:72)
```

### Files Modified

| File | Change | Occurrences |
|------|--------|-------------|
| `modules/orthodontics/routes/orthodonticCase.routes.js` | `P.ORTHODONTICS_READ` → `P.ORTHO_READ`; `P.ORTHODONTICS_CREATE/UPDATE/DELETE` → `P.ORTHO_FULL`; `P.ORTHO_MANAGE` → `P.ORTHO_FULL` | 29 |
| `rbac/permissionMatrix.js` | Same constant replacements in orthodontics route→permission map | 5 |
| `rbac/permissionRules.js` | Updated CRUD block: `READ` → `P.ORTHO_READ`, `CREATE/UPDATE/DELETE` → `P.ORTHO_FULL` | 4 |
| `rbac/policies/clinical.policy.js` | Merged 4 granular policy blocks into 2: `[P.ORTHO_FULL]` + `[P.ORTHO_READ]` | Full rewrite of ortho section |
| `organization/featuresControl/services/conflictEngine.service.js` | `orthodontics` module entry: 4 granular constants → `[P.ORTHO_READ, P.ORTHO_FULL]` | 4 |

### Not Impacted (already clean)

- `bonding.routes.js`, `tad.routes.js`, `sequence.routes.js`, `visitSession.routes.js`, `clinicalAction.routes.js`, `sharedCase.routes.js` — these routes use only `requireEntitlement()` guard with no `requireOrgPermission()` calls.

### Policy Consolidation (clinical.policy.js)

The four granular PBAC policies were merged per the two-permission model:

| Old Keys | New Key | Rules |
|----------|---------|-------|
| `orthodontics.create`, `orthodontics.update`, `orthodontics.delete` | `orthodontics.full` | org_admin (100), doctor (90), lab_tech+assigned (85) |
| `orthodontics.read` | `orthodontics.read` | org_admin (100), doctor+branch (90), lab_tech+branch (85) |

### Boot Verification (12 checks — all passing)

```
ok: ORTHO_FULL correct
ok: ORTHO_READ correct
ok: ORTHODONTICS_CREATE gone
ok: ORTHODONTICS_READ gone
ok: ORTHO_MANAGE gone
ok: org_admin has orthodontics.full
ok: org_admin no longer has orthodontics.manage
ok: permissionMatrix loaded
ok: permissionRules loaded
ok: clinical.policy has orthodontics.full
ok: clinical.policy has orthodontics.read
ok: old orthodontics.create policy gone
=== ALL RBAC BOOT CHECKS PASSED ===
```

### Architecture Invariants Confirmed

1. **SSOT**: `orgPermissions.js` P enum is the single source of truth — zero `undefined` constants at boot.
2. **Two-layer coverage**: Both route layer (`requireOrgPermission`) and controller layer (`authorize`) now use only `P.ORTHO_FULL` / `P.ORTHO_READ`.
3. **Policy alignment**: `clinical.policy.js` keys exactly match the P enum values in use.
4. **Zero drift**: Full codebase scan confirmed no remaining references to deleted constants.

### PowerShell Migration Command (DB Role documents)

```powershell
$env:DRY_RUN="false"; node backend/src/rbac/migrations/migrateOrthoDomainRbac.js
```

---

## SECTION 43 — 3-LAYER DATABASE ARCHITECTURE & CONNECTION-BOUND MODELS (v9.0 → v9.4.2)

**Status:** COMPLETE.
**Window:** 2026-04-12 → 2026-04-24.
**Branch:** `backend-architecture-v9.1`.
**Tags landed:** `refactor-step-5d-complete`, `refactor-step-5e-a-complete`, `v9.3-models-fully-bound`, `v9.4-fully-bound-final`, `refactor-step-5f-audit-fixes`, `refactor-env-3layer-cutover`, `refactor-step-5f-hardening-h1-h10`, `refactor-boot-fix-lazy-binding`, `refactor-boot-clean-v9.4.1`.

### 43.1 Goal

Move the backend from a single global `mongoose.connection` (one cluster, one URI) to a **physically separable** 3-layer Mongo topology while preserving all domain logic and re-binding every model to an explicit connection.

| Plane | Connection | URI Env | Stores |
|---|---|---|---|
| **Platform** | `platformConnection` (sibling) | `MONGO_URI_PLATFORM` | Organizations, PlatformUser, tokens, plans, billing, ShareLink, audit trails tied to users/orgs/contracts |
| **Shared Infra** | `sharedConnection` (sibling) | `MONGO_URI_SHARED` | `communicationLogs`, `emailEvents`, `outbox`, retry queues, idempotency keys, `RateLimitEntry`, `SideEffectOutbox` |
| **Tenant Cluster(s)** | `clusterConnections.get(key)` → `useDb("dental_org_<id>")` | `MONGO_URI_<CLUSTER_KEY>` (e.g. `MONGO_URI_MEA_EG_1`) | Per-org clinical / treatment / financial data |

### 43.2 Routing — Region → Cluster → Org DB

```
Org doc:  { _id, country, region, cluster, routingEpoch, ... }

resolveOrgConnection(orgId):
  1. clusterEntry = clusterRegistry.get(org.cluster)        // ENV-seeded, DB-decorated
  2. clusterRoot   = clusterConnections.getSync(clusterKey) // pooled, lazy-opened
  3. return clusterRoot.useDb(`dental_org_${orgId}`, { useCache: true, noListener: true })
```

**Hybrid registry rule (load-bearing):**

| Source | Holds |
|---|---|
| **ENV** (source of truth, never required at runtime) | `MONGO_URI_<KEY>`, `CLUSTER_PRIORITY_<KEY>`, `CLUSTER_REGION_<KEY>` |
| **DB** (`clusters` collection on platform plane, refreshed every 5 min) | `status`, `load`, `capacity`, `lastHealthCheck` |

ENV is the single source of routing truth — a platform DB outage cannot break tenant routing. DB layer only decorates the registry with status/load (used by the provisioning picker, not the request path).

### 43.3 Step Map (full breadth)

| Step | Tag | Scope |
|---|---|---|
| **5c** (Commits 1–4) | `refactor-step-5c-*` | Removed `organizationId` field from every tenant schema (orthodontics, patient/portal/supervisor/notification, billing/inventory/treatments/stage/clinical, organization core, ShareLink → platform). |
| **5d** | `refactor-step-5d-complete` | Deleted `mongoose.connect()`, switched the cluster path on, made `platformConnection` / `sharedConnection` / `clusterConnections` the sole connection holders. |
| **5e-A** | `refactor-step-5e-a-complete` | Flipped tenant ESLint guards from WARN → ERROR (architecture invariants are now CI-blocking). |
| **5e-B** (Commits A1, A2, B, C, D) | `v9.3-models-fully-bound` | AST-codemod migrated every `.default` import call site (≈283P + 12S + 16T flagged) to `getPlatformModel(Def)` / `getSharedModel(Def)` / request-scoped `getModel(req.dbConnection, Def)`. |
| **5f** (Commits A, B, C, E, F) | `v9.4-fully-bound-final` | Removed `default: mongoose.model(...)` from 153 model files; migrated 4 direct-export models + EmailEvent (5 files + 8 consumers); converted plural model files / DLQ / inline schema / `DistributedLock` lazy-bind; resolved 16 tenant TODO sites with `resolveOrgConnection`; lifted ESLint exemptions; added ghost-model runtime detector. |
| **Audit Fixes** | `refactor-step-5f-audit-fixes` | C1: removed `requireModel.js` + `billingModelValidator.js`, migrated 3 billing engines. C2: replaced `mongoose.connection` in `replayEngine`, `retryService`, `dlq.service` with `platformConnection.get()`. C3: implemented `dbManager.evictByOrg(orgId)` for both 2-segment and 3-segment cache keys. |
| **Env Cutover** | `refactor-env-3layer-cutover` | Removed legacy `MONGO_URI`. New required env: `MONGO_URI_PLATFORM`, `MONGO_URI_SHARED`, `MONGO_URI_MEA_EG_1`. Removed all cross-layer fallback chains. |
| **H1–H10 Hardening** | `refactor-step-5f-hardening-h1-h10` | Centralised env validation (`@config/validateEnv`), boot-time connection health guard, ghost detector verified, write-guard ESLint rule, CI grep script `scripts/ci-arch-invariants.sh`, deprecated proxy deletes, doc cleanup. |
| **Lazy Binding** | `refactor-boot-fix-lazy-binding` + `refactor-boot-clean-v9.4.1` | AST codemod converted 148 files / 274 module-scope bindings to lazy getters; `lazyModelProxy.js` Proxy helper for shared re-export shims; `BillingInvoice.js` Proxy with `SCHEMA_ALIASES`; `sovereignGuard.js` audit-chain check now reads schema directly from Def. |

### 43.4 Model Binding Contract (final shape)

**Models** export only `{ modelName, schema }` — no compiled Model leaks at module load.

**Bindings** happen at three plane-aware getters, all resolved at runtime (never module scope):

| Plane | API | Notes |
|---|---|---|
| Platform | `getPlatformModel(def)` | Wraps `getModel(platformConnection.get(), def)` |
| Shared Infra | `getSharedModel(def)` | Wraps `getModel(sharedConnection.get(), def)` |
| Tenant — request-scoped | `getModel(req.dbConnection, def)` | Inside `_getModels(req)` helper or controller body |
| Tenant — worker / async | `getModel(await resolveOrgConnection(orgId), def)` | Used by listeners, schedulers, jobs |

**Forbidden patterns** (CI-enforced via ESLint `no-restricted-syntax` + `scripts/ci-arch-invariants.sh`):

```
mongoose.model(...)         ❌  (only the 4 connection factories may call .model())
mongoose.connection         ❌  (global root no longer exists post-5d)
require(...).default        ❌  (model files no longer export a default key)
const X = getXModel(Def)    ❌  at module scope (binds before init() resolves)
organizationId schema field ❌  inside src/modules/**/models/** or src/organization/**/models/**
```

### 43.5 Phase 8 Migration Seams (wired Day-1, tooling deferred)

| Seam | Location | Purpose |
|---|---|---|
| `Organization.migrationState` | `src/shared/models/Organization.js:534` | `PREPARING → SYNCING → CUTOVER_PENDING → CUTOVER → VERIFYING → COMPLETE / FAILED` |
| `Organization.targetCluster` | same, line 540 | Set during PREPARING |
| `Organization.writeLocked` | same, line 547 | Two-layer enforcement: `orgWriteLock.middleware.js` + `assertWriteAllowed(org, orgId)` |
| `Organization.routingEpoch` | same, line 524 | Bumped on cutover; part of dbManager cache key (`${cluster}:${orgId}:${epoch}`) → automatic cache invalidation, no coordinated eviction needed |
| `Organization.migrationId` | same, line 553 | Correlates with `MigrationLog` entries |
| `Organization.routingVersion` | same, line 514 | Records which assignment algorithm placed this org (Day-1 = `1`, priority-first-ACTIVE) |
| `assertWriteAllowed(org, orgId)` | `src/core/db/assertWriteAllowed.js` | Stale-context re-verification when `org.migrationState !== null`; zero overhead in steady state |
| `orgWriteLock.middleware.js` | `src/middleware/` | 503 `Retry-After: 5` on mutating methods when `org.writeLocked === true` |
| `dbManager.evictByOrg(orgId)` | `src/core/db/dbManager.js` | Matches both 2-seg (`shard:orgId`) and 3-seg (`cluster:orgId:epoch`) keys; reuses `evictEntry` for consistent close + log |
| `MigrationLog` model | `src/platform/migration/MigrationLog.model.js` | Append-only audit, platform plane, never moves |

The actual migration **service** (state machine + sync engine) and admin **dashboard** UI are deferred follow-ups — every supporting primitive is in place.

### 43.6 ENV Contract (v9.4)

**Production (required):**

```
MONGO_URI_PLATFORM=mongodb+srv://…/platform
MONGO_URI_SHARED=mongodb+srv://…/shared
MONGO_URI_MEA_EG_1=mongodb+srv://…/mea-eg-1   # one per cluster key
CLUSTER_PRIORITY_MEA_EG_1=1                   # explicit ordering
STORAGE_PROVIDER=r2                           # boot-guarded in production
```

**Dev (single-URI shortcut):**

```
MONGO_URI_DEV_SINGLE=mongodb://localhost:27017
```

When `MONGO_URI_DEV_SINGLE` is set in non-production, every layer reuses it. `clusterRegistry` synthesises a `default` MEA cluster from the shared URI when no `CLUSTER_KEYS` are configured. Production refuses to boot if `MONGO_URI_DEV_SINGLE` is set.

**Removed (legacy, retired in v9.4):** `MONGO_URI` (bare). All cross-layer fallback chains (`MONGO_URI_PLATFORM || MONGO_URI`) eliminated.

### 43.7 Boot Sequence (final)

```
1. validateEnv()                     // throws if any of the 3 MONGO_URI_* vars missing
2. seedClusterRegistryFromEnv()      // pure, synchronous
3. await platformConnection.init()   // sibling mongoose.createConnection
4. await sharedConnection.init()
5. await clusterRegistry.refreshFromDb()  // non-fatal — ENV is SSOT
6. validateClusterRegistryVsDb()     // bidirectional sanity
7. (clusters open lazily on first resolveOrgConnection)
8. SovereignGuard runs (now reads schema from Def, never binds models)
9. /api/health/db reports { platform, shared, clusters[] }
10. Server listens
```

### 43.8 Verification Gates (all green)

| Gate | Command | Result |
|---|---|---|
| `mongoose.model(` calls in runtime code | `grep -rn "mongoose\.model(" src/` | **0** |
| `default:` mongoose fallback in src/ | `grep -rn "default:\s*mongoose\." src/` | **0** |
| `module.exports = mongoose.model(...)` direct | `grep -rE "^module\.exports = mongoose\.model" src/` | **0** |
| `require().default` in runtime code | `grep -rn "require([^)]*)\.default" src/` (excl tests/scripts) | **0** (only doc comments) |
| Module-scope `getPlatformModel/getSharedModel/getModel` | `grep -rE "^const \w+ = getXModel\(" src/` | **0** |
| `TODO(5e-B-manual)` flags | `grep -rn "TODO(5e-B-manual)" src/` | **0** |
| Premature `platformConnection.get()` at boot | tracer probe | **0** |
| `ci-arch-invariants.sh` | `bash scripts/ci-arch-invariants.sh` | **ALL CHECKS PASSED** |
| Live boot | `npm run dev` | `🚀 LISTENING on port 5000` + `event: DB_READY` + ✅ SovereignGuard |
| `platformConnection.isReady` after boot | runtime check | `true` |
| `sharedConnection.isReady` after boot | runtime check | `true` |

### 43.9 Forbidden / Allowed Reference Card

| Operation | Forbidden | Allowed |
|---|---|---|
| Compile a Model | `mongoose.model(name, schema)` | `getPlatformModel(def)` · `getSharedModel(def)` · `getModel(conn, def)` |
| Open a connection | `mongoose.connect(uri)` · `mongoose.connection` | `platformConnection.init()` · `sharedConnection.init()` · `clusterConnections.getSync(key)` |
| Read tenant data | global model · `Model.find({organizationId})` | request: `getModel(req.dbConnection, Def)` · worker: `getModel(await resolveOrgConnection(id), Def)` |
| Re-export a platform model from `shared/models/*` | `module.exports = getPlatformModel(Def)` (eager) | `module.exports = makeLazyPlatformModel(Def)` (Proxy in `@core/db/lazyModelProxy`) |
| Read schema metadata at boot (e.g. SovereignGuard) | `getPlatformModel(Def).schema` | `Def.schema` (or `Def.__def?.schema` for lazy proxies) |

### 43.10 Carry-Over (next milestones)

1. **Phase 8 implementation** — `migration.service.js` (state machine + sync engine), `POST /api/admin/migration/*` routes, React `MigrationDashboard` UI, integration tests proving zero-data-loss cutover.
2. **Test-suite migration** — ~24 test files still use `.default` imports (ESLint-exempt; functional only inside test runs).
3. **Phase 10 cleanup** — delete confirmed-dead proxies (`organization/models/Lead.js`), prune stale tenant docstrings still mentioning `organizationId`.
4. **Optional ESLint rule** `no-module-scope-model-binding` — currently enforced via `scripts/ci-arch-invariants.sh`; could be promoted to a custom AST rule once the patterns settle.

