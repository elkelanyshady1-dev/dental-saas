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

## 2.1 THREE-LAYER DATABASE ARCHITECTURE (v9.1)
Full plan: `DB_3_LAYER_ARCHITECTURE_PLAN.md` (project root).

**Three physical clusters — never mix**:
1. **Platform** (`MONGO_URI_PLATFORM` → `platformConnection`) — orgs, users, tokens, plans, billing, clusters registry, regions, audit trails tied to users/orgs/contracts.
2. **Shared Infra** (`MONGO_URI_SHARED` → `sharedConnection`) — PURE INFRA only: communicationLogs, emailEvents, outbox, retry queues, rateLimitEntries, idempotencyKeys. NEVER business data, never auditable/billed data.
3. **Tenant Clusters** (`MONGO_URI_<CLUSTER_KEY>` → `clusterConnections`) — per-org DB, routed via region → cluster → `clusterConn.useDb("dental_org_<id>")`.

**Routing (Region → Cluster → Org DB)**:
- `org.country` → `org.region` → `org.cluster` (set ONCE at provisioning by `clusterAssignment.service.js`, never derived at runtime).
- Registry is ENV-seeded (`CLUSTER_REGISTRY`), DB-decorated (`clusters` collection for status/load). ENV is SSOT — platform DB outage cannot break routing.
- Cluster ordering is via **explicit `priority`** in ENV (`CLUSTER_PRIORITY_<KEY>`), never iteration order.

**Model registration — MANDATORY**:
- ❌ FORBIDDEN: `mongoose.model(...)` at file bottom, `mongoose.connect()` (dead — platform is a sibling connection), `default: mongoose.model(...)` exports.
- ✅ REQUIRED: models export `{ modelName, schema }` only. Compile via:
  - Tenant: `getModel(req.dbConnection, modelDef)`
  - Platform: `getPlatformModel(modelDef)` (wraps `getModel(platformConnection.get(), def)`)
  - Shared: `getSharedModel(modelDef)`
- `enforceDbIsolation(req)` at entry to every `_getModels(req)` helper.

**Country validation**:
- `backend/src/shared/schemas/country.schema.js` — `CountrySchema` (Zod) + `COUNTRY_CODES` are the SSOT for accepted countries. Used by registration controller, Guardian invariants, and frontend dropdown.
- Registration flow is two-step: `GET /api/meta/country` → IP-suggested code → user confirms → `POST /api/org/register` with `{ country }` in body. **IP is advisory; body is authoritative.**

**Cluster migration (Phase 8 seams wired Day-1)**:
- Org fields: `migrationState`, `writeLocked`, `targetCluster`, `migrationId`, `routingEpoch`, `routingVersion`.
- **Write lock has TWO layers** — skipping either is a data-corruption risk:
  1. `orgWriteLock.middleware.js` — HTTP 503 on new mutating requests.
  2. `assertWriteAllowed(org, orgId)` — DB-level guard called before EVERY tenant write. Has stale-context re-verification when `org.migrationState` is set.
- Cache key is `${cluster}:${orgId}:${routingEpoch}` — epoch bump on cutover invalidates ALL stale entries without coordinated eviction.

**Storage — R2 only in production**:
- `STORAGE_PROVIDER` MUST be `"r2"` when `NODE_ENV=production`. Boot refuses to start otherwise.
- Local/S3 providers are dev-only.

**Dev convenience**:
- `MONGO_URI_DEV_SINGLE` — one URI shared across platform/shared/tenant in non-prod. FORBIDDEN in prod (boot refuses).

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
