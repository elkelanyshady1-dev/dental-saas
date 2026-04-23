# 3-Layer Database Architecture — Foundation Refactor

> **Project-local copy** of the approved plan. Source of truth during implementation.
> Changes to the plan should be made here and kept in sync with `~/.claude/plans/claude-prompt-atomic-walrus.md` if that file still exists.

## Context

The backend at `C:\Clinic system project\dental-saas\backend` runs today as a single MongoDB cluster where:

- **Platform data** (Organizations, PlatformUser, Plans, Billing, Tokens) lives in the "global" DB reached via `mongoose.connection`.
- **Tenant data** (patients, appointments, cases, ledger, inventory, etc.) lives in per-org DBs reached via `mongoose.connection.useDb("dental_org_<id>")`.
- **Shared infra data** (CommunicationLog, EmailEvent, outbox, retry logs, metrics, idempotency keys) is mixed into the platform DB.

A solid foundation for per-org isolation already exists — `dbManager.js`, `getModel.js`, `dbIsolation.guard.js`, `connectionResolver.js`, `shardConfig.js`, and a Region Registry (`Region.model.js` + `regionRegistry.js` with 4 regions: EU/US/MEA/APAC, each with its own `dbUri`). However, everything still resolves through ONE root mongoose connection, and `shardResolver` hard-codes `"shard-1"`. We cannot truly distribute tenants across clusters, and we cannot move shared infra off the platform cluster.

This refactor splits the system into three **physically separable** MongoDB clusters while preserving all current features, models, and business logic. It also aligns model registration with the `getModel(connection, modelDef)` pattern already introduced for per-org models so global `mongoose.model()` pollution is finally removed.

### Decisions (user-confirmed)

1. **Scope** — Foundation-only. Keep every current tenant model. Delete only clearly duplicate/dead files (three Patient copies, stale outbox duplicates, unused providers).
2. **Topology** — Hybrid **region → cluster** addressing:
   - Region = geographic/compliance boundary (MEA, EU, US, APAC). Chosen by user location.
   - Cluster = load group within a region (e.g., `MEA-EG-1`, `MEA-EG-2`). Clinic is assigned to the least-loaded cluster at provisioning time. New clusters can be added to a region without cross-region traffic.

---

## Target Architecture

### Layer 1 — Platform Cluster (`MONGO_URI_PLATFORM`)
Dedicated `mongoose.createConnection(MONGO_URI_PLATFORM)`, no longer the global mongoose root.

Collections (move to / stay on platform cluster):
- `organizations`, `platformUsers`, `platformRoles`, `platformCapabilities`, `platformConfig`
- Token collections: `refreshTokens`, `verificationTokens`, `magicTokens`, `otps`, `passwordResetTokens`, `sessions`
- Billing: `plans`, `planVersions`, `planTemplates`, `orgContracts`, `orgAddOns`, `organizationEntitlements`, `billingLedger`, `billingSettings`, `billingControl`, `billingAuditLog`, `billingTimeline`, `ledgerAccounts`, `ledgerTransactions`, `paymentAttempts`, `platformInvoices`, `invoiceSequences`, `featureFlags`, `revenueSnapshotProjections`, `subscriptionMutationRecords`
- Domain: `regions`, `clusters` (new), `addOns`, `coupons`, `campaigns`, `revenueAnalytics`, `featureDefinitions`, `moduleDefinitions`, `emailTemplates`
- Platform ops: `guardianAuditLogs`, `kashierEvents`, `stripeEvents`, `cronLocks`, `leads`, `siteContent`

### Layer 2 — Shared Infra Cluster (`MONGO_URI_SHARED`)
Dedicated `mongoose.createConnection(MONGO_URI_SHARED)`. **Pure infra only — no auditable or business-linked data.** The test: if ops or compliance ever need to query it per-org, export it, or tie it to a contract, it DOES NOT belong here.

Collections moved from platform → shared:
- `communicationLogs`, `communicationMetrics`, `communicationRetryLog`
- `emailEvents`
- `coreOutbox` / `domainEventOutbox`, `sideEffectOutbox` (retry queue infrastructure — not audit)
- `idempotencyKeys`
- `rateLimitEntries` (if persisted)

**Explicitly KEPT on platform cluster** (ops feedback — these are auditable/business-linked, not infra):
- `authTraces`, `permissionChangeLogs` — security audit trails, tied to users/orgs, exported for compliance.
- `billingEventLog`, `refundExecutionRecord` — financial audit, must sit next to platform billing.
- Platform-level `AuditLog` — same reason.
- `orgUsage`, `orgStorageAlertState`, `organizationStorageUsage` — billed/metered per-org, not infra. Stay on platform.

### Layer 3 — Tenant Clusters (`MONGO_URI_TENANT_<KEY>`, dynamic)
One connection per cluster (e.g., `MONGO_URI_TENANT_MEA_EG_1`), each mapped to a cluster entry in the registry. Org DB is reached via `clusterConn.useDb("dental_org_<orgId>")` with `useCache: true`.

Every current tenant model stays as-is (foundation-only). `organizationId` fields that exist purely for tenant filtering become redundant and will be removed selectively (see Phase 4). Fields that are genuine audit/reference markers stay.

---

## Routing: Region → Cluster → Org DB

```
Org record: { _id, region: "MEA", cluster: "MEA-EG-1", ... }

resolveOrgConnection(org):
  1. clusterEntry = clusterRegistry.get(org.cluster)     // from ENV (static), DB layered on top (dynamic)
  2. clusterConn  = getClusterConnection(clusterEntry)   // reuse or mongoose.createConnection(uri)
                                                         //   on failure → fallbackCluster if configured
  3. return clusterConn.useDb(`dental_org_${org._id}`, { useCache: true })
```

### Hybrid Registry Rule (ops feedback)

```
Connection info (URI, fallback)  →  ENV   (source of truth, no circular dep)
Dynamic metadata (status, load)  →  DB    (decorates the registry entries)
```

- `CLUSTER_REGISTRY` is a JS object seeded from ENV at boot — no DB read required to route a request. Prevents the "platform DB down → can't route tenants" circular failure.
- A `clusters` collection in the platform DB is layered ON TOP — it carries `{ status: ACTIVE|DRAINING|DOWN, load, capacity, lastHealthCheck, createdAt }` per cluster key. Used only by the org-provisioning picker and by `/health/db`; never on the request path.
- **Region Registry** (`regions` collection) keeps geographic/compliance metadata + provider keys (Stripe, Paymob) — unchanged role.
- `shardResolver.js` becomes `clusterResolver.js` — given an org doc (or orgId + platform-conn lookup), returns the cluster key. Backward-compat export `resolveShard(orgId)` can stay while call sites are migrated.

### Cache key shape (dbManager)

Stored as the string `${cluster}:${orgId}:${routingEpoch}` (see Phase 8). The entry struct carries `{ cluster, orgId, routingEpoch, ... }` explicitly so future dimensions (region, options) slot in without a cache refactor.

### Fallback — DEFERRED (future work)

Day-1: **no runtime fallback, no health tracker, no auto-DOWN flip**. With one cluster, there is nothing to fall back to, and adding the machinery introduces behavior we can't exercise yet. If the cluster is down, requests fail — ops pages.

When cluster #2 exists, wire:
- `clusterConnections.getWithFallback(key, fallback)`
- In-memory `clusterHealth` tracker: `{ failures, lastFailure, windowStart }`. Auto-DOWN if `failures > 5` in a 60s window, with a 60s cool-down.
- `X-Cluster-Fallback: true` response header when degradation is active.

The API surface of `clusterConnections` already exposes the `fallback` arg slot (always passed as `null` Day-1) so flipping this on later is an internal-only change.

---

## Scope Boundaries

### IN
- Three explicit Mongoose connections (platform, shared, per-cluster) with lifecycle management.
- Cluster registry + `resolveOrgConnection(org)` that routes via region → cluster.
- Migrate **all** shared-infra collections off the platform cluster.
- Finish the `{ modelName, schema }` export pattern across every tenant model so `getModel()` is the only way they get compiled; delete leftover `mongoose.model(...)` calls in tenant model files (179 call sites across all planes — scope is tenant + mis-placed infra only; platform models stay on their own connection but are still connection-bound, not global).
- Remove redundant `organizationId` fields from tenant schemas (selective — keep where it's a legitimate reference).
- ESLint rule blocking `mongoose.model(` and blocking `organizationId:` inside any file under `src/modules/**/models/**` or `src/organization/**/models/**`.
- Runtime guard `enforceDbIsolation(req)` enforced in every tenant service `_getModels()` entry point (partial today — expand).
- Production R2 guard: boot-time throw if `NODE_ENV=production && STORAGE_PROVIDER !== "r2"`.
- `GET /api/health/db` returning `{ platform, shared, clusters: [{ key, region, status, activeOrgConnections }] }`.
- Delete clearly dead files: duplicate Patient (3 copies → 1), duplicate Lead / SiteContent / TreatmentCategory / TreatmentProcedure, stale outbox duplicates, `PaymobProvider.js` (already deleted per git status).

### OUT (explicitly NOT doing)
- Deleting RBAC (Role/Permission), Branches, OrganizationSettings, Family, Recall, Supervisor plane, Booking module, LabDomain, StageDomain, DocumentEngine, patient-portal extras, or any of the 26 "extra" orthodontic models. All stay.
- Consolidating billing models (PatientInvoice/Wallet/Payment/Refund/Quotation) into just FinancialLedger + Summary. All stay.
- Changing any controller/service business logic beyond what's required to plug into the new connection layer.
- Moving from BullMQ to a different queue, or touching QStash paths (already handled by Phase 6).

---

## Phased Work Plan

### Phase 1 — Connection Layer (the spine)
**New files** (`backend/src/core/db/`):
- `platformConnection.js` — `mongoose.createConnection(MONGO_URI_PLATFORM)`, exports `init()`, `get()`, `close()`.
- `sharedConnection.js` — `mongoose.createConnection(MONGO_URI_SHARED)`, same shape.
- `clusterConnections.js` — manages a `Map<clusterKey, { conn, lastUsed, openedAt }>`; `ensureCluster(key)` creates lazily on first use, `close(key)`, `closeAll()`, `getStats()`, and **`closeIdleConnections(maxIdleMs = 30*60*1000)`** that closes cluster-level connections idle beyond the threshold. A `setInterval(closeIdleConnections, 10 * 60 * 1000)` with `.unref()` runs in the background — same pattern as `dbManager`'s eviction sweep. Protects against leaked cluster connections if a cluster is drained or scaled down and never re-used. The signature exposes a `fallback` arg on `get(key, { fallback })` but Day-1 always passes `null`. Health tracking + auto-DOWN is deferred until there's a second cluster to fall back to (see "Fallback — DEFERRED" above).

- **Connection pool sizes** — set explicitly at creation:
  - Platform: `mongoose.createConnection(uri, { maxPoolSize: 20 })` — control-plane traffic is low-volume.
  - Shared: `{ maxPoolSize: 30 }` — bursty write patterns for logs/outbox.
  - Per tenant cluster: `{ maxPoolSize: 100 }` — high-concurrency clinical traffic.
  All three override-able via `MONGO_POOL_<PLATFORM|SHARED|CLUSTER>_MAX` if ops needs to tune.

- `clusterRegistry.js` — **ENV-first** registry. On boot, reads `CLUSTER_REGISTRY` (a constant seeded from `MONGO_URI_<clusterKey>` env vars, one entry per key). Exposes `get(key)`, `getByRegion(region)` (returns a list sorted by priority ONCE at compute time — callers never sort), `all()`. Cached per-region sorted lists are invalidated and recomputed only on metadata refresh, never per request. Separately, on an interval (same pattern as `regionRegistry`), refreshes dynamic metadata (`status`, `load`) from the platform DB's `clusters` collection and rebuilds the sorted-per-region cache. If the platform DB is down, the routing table remains valid from ENV — only provisioning-time picker is degraded.

  ```js
  // clusterRegistry.getByRegion — sort once, serve many:
  function getByRegion(region) {
      if (cache.has(region)) return cache.get(region);

      const list = Object.values(CLUSTER_REGISTRY)
          .filter(c => c.region === region)
          .map(c => ({ ...c, status: clusterMeta[c.key]?.status ?? c.status }))
          .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

      cache.set(region, list);
      return list;
  }
  ```

  ```js
  // Shape seeded from ENV at boot (never requires DB):
  CLUSTER_REGISTRY = {
    "MEA-EG-1": {
      uri:      process.env.MONGO_URI_MEA_EG_1,
      region:   "MEA",
      priority: Number(process.env.CLUSTER_PRIORITY_MEA_EG_1 ?? 100),
      fallback: null,
    },
  };
  // Layered on top from DB (refreshed every 5 min, stale-safe):
  clusterMeta["MEA-EG-1"] = { status: "ACTIVE", load: 0.42, capacity: 200, lastHealthCheck };
  ```

  **Explicit priority** is the ordering SSOT. `clusterRegistry.getByRegion(region)` does not guarantee insertion order (objects/maps/DB-decorated arrays can all shuffle). `priority` removes that implicit dependency — lower number wins, defaults to 100 when unset. A single cluster has no ambiguity either way, but the field exists Day-1 so adding cluster #2 doesn't require touching the assignment logic.

- **Dev single-URI mode** — if `MONGO_URI_DEV_SINGLE` is set AND `NODE_ENV !== "production"`, every connection (platform, shared, every cluster entry) reuses that one URI. Keeps local dev to one Mongo instance; no need to stand up three clusters on a laptop. Production refuses to boot if `MONGO_URI_DEV_SINGLE` is set — that's a misconfiguration.

**Refactored files**:
- `shardConfig.js` → renamed to `clusterConfig.js` (or kept as thin alias during transition). Replace env-hardcoded `SHARDS` with a lookup into `CLUSTER_REGISTRY`.
- `shardResolver.js` → `clusterResolver.js`. `resolveCluster(org)` reads `org.cluster` (new field). When called in async contexts with only an orgId, looks up the org from the platform DB.
- `connectionFactory.js` → `buildConnectionKey({ cluster, orgId })`, `getClusterUri(cluster)` via registry. Backward-compatible aliases for `shard`.
- `dbManager.js` → cache key is `${cluster}:${orgId}:${routingEpoch}`, derived from the resolver. `createConnection()` now takes cluster from the resolver + `clusterConn.useDb(dbName)` instead of the global `mongoose.connection.useDb`. All cache/eviction/circuit-breaker/health-check logic stays as-is. New public API **`evictByOrg(orgId)`** removes every cache entry for an org across any cluster/epoch — used by the Phase 8 cutover for cache hygiene (correctness is already guaranteed by the epoch).
- `connectionResolver.js` → `resolveOrgConnection(orgId)` now accepts `orgId` OR `{ _id, cluster }` doc; if only orgId, async-looks-up the org from the platform DB. Wraps `clusterConnections.getWithFallback()` so a dead primary cluster fails over (when a fallback is configured).
- `dbResolver.js` → `getPlatformConnection()` now returns `platformConnection.get()` instead of `mongoose.connection`.

**Boot order change** (`server.js` + `config/db.js`):
```
seedClusterRegistryFromEnv();        // pure, synchronous, no DB
await platformConnection.init();
await sharedConnection.init();
await clusterRegistry.refreshFromDb(); // decorate ENV entries with status/load (non-fatal on failure)
validateClusterRegistryVsDb();       // bidirectional sanity
// cluster connections open lazily on first resolveOrgConnection(org)
```
`mongoose.connect()` is DELETED (no more global root). `mongoose.plugin(queryPerformancePlugin)` stays (it applies to all schemas regardless of connection).

**Bidirectional registry validation** (`validateClusterRegistryVsDb`):
- For each `org.cluster` referenced in the Organizations collection → must exist in `CLUSTER_REGISTRY` (ENV). FATAL — refuse to boot.
- For each key in `CLUSTER_REGISTRY` (ENV) → warn if the platform DB's `clusters` collection has no corresponding metadata row. NON-FATAL (auto-create a default row with `status: ACTIVE, load: 0` during boot, then warn — ENV is truth, DB is decoration).
- For each key in the `clusters` DB collection → warn if no matching ENV var. NON-FATAL (cluster exists in metadata but has no URI — can't route there).

### Phase 2 — Shared Infra Migration (tightened scope)

For each shared-infra model, change three things:
1. **Export shape** — if it still does `mongoose.model(...)` at the bottom, replace with `module.exports = { modelName, schema }` and a companion helper `getSharedModel()` that binds to `sharedConnection.get()`.
2. **Call sites** — replace `require("…/CommunicationLog.model").default` with a helper (e.g., `getSharedModels().CommunicationLog`) that returns the bound model on the shared connection.
3. **Move helpers** to `backend/src/shared-infra/models/` (or keep paths; the binding is what matters).

**Moved to shared cluster** (pure infra — no per-org audit/export/billing semantics):
- `platform/models/CommunicationLog.model.js`, `CommunicationMetrics.model.js`, `CommunicationRetryLog.model.js`, `EmailEvent.model.js`
- `shared/models/DomainEventOutbox.js`, `platform/outbox/SideEffectOutbox.model.js`, `core/outbox/Outbox.model.js`
- `core/IdempotencyKey.model.js`
- Rate-limit persistence (if used)

**Explicitly stays on platform** (moved BACK per ops feedback — auditable / business-linked):
- `shared/models/AuthTrace.js` — security audit, user/org-linked, exported for compliance.
- `shared/models/PermissionChangeLog.js` — RBAC audit, must live next to Roles.
- `shared/models/BillingEventLog.js`, `shared/models/RefundExecutionRecord.js` — financial audit, lives with platform billing.
- Platform `AuditLog.js` — same reason.
- `core/usage/OrgUsage.model.js`, `core/usage/OrgStorageAlertState.model.js`, `core/storage/models/organizationStorageUsage.model.js` — metered/billed per-org; belong next to OrgContract.
- Accounting domain `FailedEvent.model.js`, `EventProcessingLog.model.js` — projection error stream per-org; stays tenant/platform as currently wired. Not moved.

### Phase 3 — Model Registration Migration

For every tenant model under `backend/src/modules/**` and `backend/src/organization/**`:
- Confirm the file exports `{ modelName, schema }`. (Most already do, plus a `default` that triggers `mongoose.model(...)`.)
- Delete the `default: mongoose.models[X] || mongoose.model(X, schema)` line.
- Every service/controller call site that imports the model must route through `getModel(req.dbConnection, ModelDef)`. Most tenant services already use this pattern; sweep the rest.

Platform models stay `{ modelName, schema }` too, but are compiled on `platformConnection.get()` via a `getPlatformModel(def)` helper (trivial wrapper around `getModel`).

**Scale**: Inventory shows ~179 `mongoose.model(` call sites. We ratchet this down to 0. ESLint in Phase 5 enforces the rule going forward.

### Phase 4 — organizationId Removal (Tenant)

Scan every tenant schema for `organizationId:` fields. For each occurrence, mark one of:
- **REMOVE** — field is only used for tenant filtering (`{ organizationId: req.context.organizationId }`). Per-org DB makes it redundant and a leak risk.
- **KEEP** — field is a legitimate cross-reference (e.g., stored alongside an audit entry that also replicates to the shared audit cluster). Rare.

Pair each schema edit with the matching service/controller sweep so queries stop filtering by `organizationId`. ESLint rule in Phase 5 locks it down.

Memory note (`feedback_scoping_permissions.md`): this is exactly the class of change the user wants flagged. The per-file keep/remove table will be produced at implementation time and surfaced for approval BEFORE edits land — not buried in the diff.

### Phase 5 — Enforcement

- **ESLint** (`backend/eslint.config.js`):
  - `no-restricted-syntax` blocking `CallExpression[callee.object.name='mongoose'][callee.property.name='model']` in every file under `backend/src/**` (exceptions: `connectionFactory.js`, `getModel.js`, `platformConnection.js`, `sharedConnection.js`, `clusterConnections.js` — the only places a connection may bind a model).
  - `no-restricted-syntax` blocking `organizationId` as a schema field key inside `src/modules/**/models/**` and `src/organization/**/models/**`.
  - `no-restricted-imports` blocking `import mongoose from "mongoose"` in service/controller files (they must go through `getModel` + the connection resolver).
  - **Write-guard rule** — any file under `src/modules/**/services/**` and `src/organization/**/services/**` that calls a mutating Mongoose method (`.create`, `.insertMany`, `.updateOne`, `.updateMany`, `.findOneAndUpdate`, `.deleteOne`, `.deleteMany`, `.findOneAndDelete`, `.bulkWrite`, `.save`) MUST also call `assertWriteAllowed` in the same function.
- **Runtime guards**: `enforceDbIsolation(req)` in every tenant service's `_getModels(req)`. Sweep for call sites that accept `req` but skip the guard.
- **R2 boot guard** — added to `server.js` immediately after the existing Redis kill-switch block.

### Phase 6 — Health Check

Extend `backend/src/routes/healthRoutes.js`. Day-1 response:
```
GET /api/health/db →
{
  platform: "connected" | "disconnected",
  shared:   "connected" | "disconnected",
  clusters: [
    {
      key: "MEA-EG-1",
      region: "MEA",
      status: "connected" | "disconnected",
      activeOrgConnections: 120,
      idleOrgConnections:    18,
      reuseRate:             "87.34%",
      avgResolutionTimeMs:   12.4
    }
  ],
  shutdownInProgress: false
}
```
HTTP 503 if platform or shared is disconnected. `fallbackUsedLastHour`, `avgConnectionLifetimeMs`, `status: DRAINING|DOWN` are deferred until health tracking lands with cluster #2.

### Phase 7 — Org Provisioning: Cluster Assignment (DETERMINISTIC, Day-1)

Day-1 rules — **simple, deterministic, no DB reads, no load math, no async fallback, AND IP is a suggestion, not a source of truth**:

```
IP  → suggestedCountry  (surfaced to user, editable)
User confirms country  → region  → priority-ordered first-ACTIVE cluster  → persist
```

Why not use IP directly: VPN, roaming, office-behind-proxy, and compliance-relevant residency all make IP an unreliable routing signal. The user picks; we persist that choice. `org.country` is stored alongside `org.region` + `org.cluster` so the reason for the routing decision is auditable.

**New service** — `backend/src/platform/provisioning/clusterAssignment.service.js`:
```js
function getSuggestedCountry(req) {
    return (
        req.headers["cf-ipcountry"] ||
        req.headers["x-country"] ||
        "EG"
    ).toUpperCase();
}

const EU = new Set(["FR","DE","IT","ES","NL","BE","AT","IE","PT","GR","SE","DK","FI","PL"]);
const US = new Set(["US","CA"]);

function mapCountryToRegion(country) {
    if (country === "EG") return "MEA";
    if (EU.has(country))  return "EU";
    if (US.has(country))  return "US";
    return "MEA";
}

function assignCluster(region) {
    const regionClusters = clusterRegistry.getByRegion(region);  // pre-sorted
    for (const cluster of regionClusters) {
        if ((cluster.status ?? "ACTIVE") === "ACTIVE") {
            return cluster.key;
        }
    }
    throw new Error(`[Provisioning] No ACTIVE clusters in region ${region}`);
}

const ROUTING_VERSION = 1;

async function provisionOrg(data) {
    const country = data.country;
    const region  = mapCountryToRegion(country);
    const cluster = assignCluster(region);

    return Organization.create({
        ...data,
        country, region, cluster,
        routingVersion: ROUTING_VERSION,
    });
}
```

### Two-step API flow

**Step 1 — `GET /api/meta/country`** (new endpoint)
- Reads `getSuggestedCountry(req)` from headers.
- Response: `{ "suggestedCountry": "EG" }`
- No auth required; no side effects; idempotent.

**Step 2 — `POST /api/org/register`** (existing endpoint, updated contract)
- Body: `{ name, country, ... }` — `country` becomes REQUIRED, ISO-3166-1 alpha-2.
- Validated by Zod with a strict allowlist — see `country.schema.js`.
- Service: `provisionOrg(data)` runs the confirmed-country → region → cluster pipeline and persists.
- IP is NEVER consulted at this step.

**country.schema.js** — single source of truth for accepted country codes.

### Why explicit priority (not array order)

Registry iteration order is not a stable contract — `getByRegion()` may someday filter a Map, merge DB-decorated rows, or be refactored. If ordering is implicit, a silent change in that function silently changes which cluster a new org lands on. Explicit `priority` means the assignment decision is reproducible by reading ENV alone.

### Why `status ?? "ACTIVE"`

Day-1 the registry is seeded from ENV and has NO `status` field on entries until the async DB-metadata decoration runs. A strict `=== "ACTIVE"` check would silently return "no clusters available" during the boot window before the DB refresh completes. Nullish-default to `"ACTIVE"` makes ENV-only operation the safe path.

### Phase 8 — Org Migration Between Clusters (zero downtime, no data loss)

Moving an org from one cluster to another is an **operational** action (not Day-1 product work), but the foundation has to support it without a rewrite.

**Design goals**: no writes lost, no reads return stale data after cutover, bounded (< 5s) write-pause window, revert-able at any point before cutover.

**State machine on `Organization.migrationState`** (default `null`):
```
null ─→ "PREPARING" ─→ "SYNCING" ─→ "CUTOVER_PENDING" ─→ "CUTOVER" ─→ "VERIFYING" ─→ "COMPLETE" ─→ null
                           ↓                ↓                ↓            ↓
                           └────── "FAILED" (any stage — safe: src still authoritative) ──
```

**Stage-by-stage**:

1. **PREPARING** — write `{ migrationState: "PREPARING", targetCluster }`. Create target DB + pre-build indexes. Source cluster keeps serving 100% of traffic.

2. **SYNCING** — initial dump+restore OR MongoDB Change Streams from source.

   **Sync invariant (DATA LOSS TRAP — must be enforced by tooling):**
   ```
   If using change streams for catch-up:
     1. Capture resumeToken BEFORE the initial dump starts.
     2. Perform the dump.
     3. Replay change stream FROM the captured resumeToken.

   OR

   Dump-only strategy:
     1. Freeze writes (enter CUTOVER_PENDING with writeLocked=true).
     2. Dump. 3. Verify. 4. Cutover.

   NEVER: dump first, then start a change stream afterward.
   ```

3. **CUTOVER_PENDING** — lag < threshold. Schedule cutover window.

4. **CUTOVER** — the only stage with a brief write pause:
   - Set `Organization.writeLocked = true`. Middleware rejects new mutating requests; `assertWriteAllowed(org)` at DB layer stops in-flight requests already past middleware.
   - Wait for in-flight requests to drain.
   - Catch up final tail.
   - Atomic swap + epoch bump:
     ```js
     findOneAndUpdate(
       { _id },
       {
         $set:   { cluster: targetCluster, migrationState: "VERIFYING", routingVersion },
         $inc:   { routingEpoch: 1 },       // KEY: invalidates ALL old cache entries
         $unset: { writeLocked: 1 }
       }
     )
     ```
   - `dbManager.evictByOrg(orgId)` as cleanup (epoch already guarantees correctness).

5. **VERIFYING** — parity check. Target serves all traffic.

6. **COMPLETE** — clear `migrationState`. Source DB marked read-only, dropped after grace period.

**New foundation pieces** (baked in Day-1):
- **`routingEpoch`** on `Organization` — incremented on every cutover. Part of dbManager cache key. Defeats split-brain without coordinated cache invalidation.
- **`dbManager.evictByOrg(orgId)`** — removes all cache entries for an org (cleanup, not correctness-critical).
- **`Organization.writeLocked`** + two enforcement layers (middleware + `assertWriteAllowed`).
  - **Stale-context guard** in `assertWriteAllowed`: if `org.migrationState` is set, re-verify lock from DB (zero overhead in steady state).
- **`MigrationLog`** collection on platform DB.
- **`migrationId`** on Organization — correlates with MigrationLog entries.

### Phase 9 — Snap Editor + Visit System (hybrid Mongo + R2 delta snapshots)

Sits on top of the completed 3-layer foundation. Deliberately consolidates five fragmented orthodontics collection types into a single unified record store.

**Collections (tenant DB)**:
- `cases` — current materialized snapshot, fast-path read.
- `visits` — timeline entries, append-only.
- `caseRecords` — **unified** store. Replaces: `treatmentPlans`, `planVersions`, `drafts`, `snapshotDeltas`, `recordsets`, plus `TreatmentPlan`, `TreatmentPlanVersion`, `CaseRecordSet`, `WorkflowRecordSet`, `ClinicalSnapshot`, `VisitDraft`.

**Hybrid storage rule**:
```
if (jsonSize(record) < 50 * 1024)  → store in Mongo (caseRecords.data)
else                                → upload to R2, keep only r2Key in Mongo
```

R2 key layout: `/org_{orgId}/cases/{caseId}/snapshots/{visitId}.json` — prefix for blast-radius isolation. `orgId` never persisted into tenant docs (that would re-introduce the `organizationId` leak the refactor removes).

**Core services**:
- `snapshot.utils.js` — `buildDelta(prev, next)`, `applyDelta(current, delta)` (pure).
- `r2.service.js` — AWS SDK S3 client for Cloudflare R2.
- `createVisitWithSnapshot.service.js` — critical atomic flow (transaction-scoped).

**Files to create**:
- `backend/src/modules/cases/models/Case.model.js`
- `backend/src/modules/visits/models/Visit.model.js`
- `backend/src/modules/caseRecords/models/CaseRecord.model.js`
- `backend/src/modules/visits/services/createVisitWithSnapshot.service.js`
- `backend/src/services/r2.service.js`
- `backend/src/utils/snapshot.utils.js`

**Compliance (non-negotiable)**:
- Per-org DB isolation — every model via `getModel(req.dbConnection, modelDef)`.
- No `mongoose.model(` — models export `{ modelName, schema }`.
- No `organizationId` field on any of the three schemas.
- Transaction scope — DB writes in one Mongo transaction on `req.dbConnection`. R2 upload BEFORE commit; on rollback, cleanup via outbox.
- **Dependency**: Phase 9 depends on Phase 5 (ESLint rules active). Landing it earlier would cement new violations.

### Phase 10 — Dead/Duplicate Cleanup

Delete-only list (no behavioral change intended):
- Duplicate Patient: keep `organization/patient/models/patient.model.js`; delete `shared/models/Patient.js` and any `org/models/Patient.js`. Fix imports.
- Duplicate Lead / SiteContent: keep the platform copy only.
- Duplicate TreatmentCategory / TreatmentProcedure (between `modules/treatments` and `modules/treatment-catalog`): keep `modules/treatments/infrastructure/models/*`; delete the other.
- `backend/src/platform/billing/providers/PaymobProvider.js` — already `D` in git status.

---

## Critical Files (map)

### Create
- `backend/src/core/db/platformConnection.js`
- `backend/src/core/db/sharedConnection.js`
- `backend/src/core/db/clusterConnections.js` (with `getWithFallback`)
- `backend/src/core/db/clusterRegistry.js` (ENV-seeded; DB-decorated)
- `backend/src/core/db/clusterResolver.js` (replaces `shardResolver.js`)
- `backend/src/core/db/clusterConfig.js` (replaces `shardConfig.js`)
- `backend/src/core/db/getPlatformModel.js` — `(def) => getModel(platformConnection.get(), def)`
- `backend/src/core/db/assertWriteAllowed.js` — Phase 8 seam
- `backend/src/platform/domain/models/Cluster.model.js` — `{ key, region, status, capacity, load, lastHealthCheck, createdAt }`. **No `uri` field** — URIs live in ENV only.
- `backend/src/platform/domain/models/MigrationLog.model.js` — Phase 8 audit
- `backend/src/shared-infra/models/getSharedModel.js`
- `backend/src/platform/provisioning/clusterAssignment.service.js` — Phase 7
- `backend/src/routes/meta.routes.js` — `GET /api/meta/country`
- `backend/src/shared/schemas/country.schema.js` — `CountrySchema`, `COUNTRY_CODES`
- `backend/src/middleware/orgWriteLock.middleware.js` — Phase 8 seam

### Modify
- `backend/server.js` — new boot order; R2 prod guard; `MONGO_URI_DEV_SINGLE`-in-prod guard; sibling close on shutdown.
- `backend/src/config/db.js` — init sibling connections alongside legacy `mongoose.connect()` (Step 1); delete `mongoose.connect()` (Step 5).
- `backend/src/core/db/dbManager.js` — `createConnection()` uses cluster connection; cache key `cluster:orgId:routingEpoch`; new `evictByOrg(orgId)` public API.
- `backend/src/core/db/connectionResolver.js` — accepts org doc or async-loads org → cluster; uses `clusterConnections`.
- `backend/src/core/db/dbResolver.js` — `getPlatformConnection()` returns `platformConnection.get()`.
- `backend/src/core/db/connectionFactory.js` — `cluster` terminology.
- `backend/src/shared/models/Organization.js` — add `cluster`, `routingVersion`, `routingEpoch`, `migrationState`, `writeLocked`, `targetCluster`, `migrationId`. Guardian invariants enforce validity.
- Org register route controller — consume `country` from `req.body` via Zod.
- `backend/src/routes/healthRoutes.js` — expand `/db` endpoint.
- `backend/eslint.config.js` — add `no-restricted-syntax` rules.
- `backend/app.js` — mount `/api/meta` routes; insert `orgWriteLock` middleware in org chain.

### Delete
- `backend/src/core/db/shardConfig.js`, `shardResolver.js` (after migration).
- Duplicate Patient/Lead/SiteContent/TreatmentCategory/TreatmentProcedure.
- `backend/src/platform/billing/providers/PaymobProvider.js`.

---

## Reuse Map

- `backend/src/core/db/getModel.js` — exactly the pattern the prompt specifies. Zero changes.
- `backend/src/core/db/dbIsolation.guard.js` — exactly the runtime guard the prompt specifies.
- `backend/src/core/db/dbManager.js` cache/LRU/TTL/semaphore/health-check/circuit-breaker logic — all retained.
- `backend/src/infrastructure/regions/regionRegistry.js` — its load/refresh/validate pattern is the template for `clusterRegistry`.
- `backend/src/core/db/ensureTenantIndexes.js`, `indexValidator.js`, `queryPerformance.js`, `Semaphore.js` — untouched.
- `Region.model.js` keeps its role; `Cluster.model` is a new sibling collection.

---

## Verification

1. **Boot** — `npm start` succeeds. `mongoose.connect()` is gone (outside tests).
2. **Two-step org registration** —
   - `GET /api/meta/country` with no headers → `{ suggestedCountry: "EG" }`.
   - Same endpoint with `cf-ipcountry: DE` → `{ suggestedCountry: "DE" }`.
   - `POST /api/org/register` without `country` → Zod 400.
   - `POST /api/org/register` with `{ name, country: "EG" }` from a DE IP → org persists with `country: "EG", region: "MEA", cluster: "MEA-EG-1"`.
   - `dbManager.getStats()` shows the cluster connection opened on first tenant request.
   - Guardian boot check passes.
3. **Tenant isolation** — org A patient not readable via org B connection; mis-matched cluster URI reads empty.
4. **Auth tokens** — OTP lands in platform DB (not tenant, not shared).
5. **Send email** — `CommunicationLog` + `EmailEvent` docs land on shared cluster.
6. **File upload** — production boot with `STORAGE_PROVIDER !== "r2"` throws. With `=r2`, boots. Uploads reach R2.
7. **Financial update** — ledger + summary update atomically.
8. **Health** — `curl /api/health/db` returns platform/shared/cluster statuses + per-cluster active connection counts.
9. **ESLint** — fails on reintroduced `mongoose.model(` or `organizationId` in tenant schema.
10. **Guardian / startup validators** pass.
11. **Load sim** — 50 orgs across 3 clusters, parallel requests, no cross-cluster leakage.

---

## Implementation Rollout Order (5-step incremental)

**Step 1 — Dual-root infra (no behavioral change)** ✅ **DONE**
- Create `platformConnection.js`, `sharedConnection.js`. Platform still resolves through existing `mongoose.connection` (same URI initially).
- Boot both; every existing code path keeps working.
- Verify: `/api/health/db` returns both statuses.

**Step 2 — Cluster layer (wired, unused)** ✅ **DONE**
- Create `clusterConnections.js`, `clusterRegistry.js`, `clusterResolver.js`, `Cluster.model.js`, `MigrationLog.model.js`, `getPlatformModel.js`, `assertWriteAllowed.js`, `orgWriteLock.middleware.js`, `country.schema.js`, `clusterAssignment.service.js`, `meta.routes.js`.
- Introduce `org.cluster` + `routingVersion` + `routingEpoch` + migration seam fields; defaults applied to existing orgs on first save.
- `dbManager.createConnection` STILL uses `mongoose.connection.useDb` — cluster path is wired but not active.
- Verify: registry seeds, resolver routes via `org.cluster`, meta route exposes suggested country, write-lock middleware returns 503 when `writeLocked`.

**Step 3 — Flip ONE module (patients)**
- Make `dbManager` route through `clusterConnections` for a single module (patients) via a feature flag or scoped change.
- Run the full patient test suite + manual smoke.
- Real test of isolation before wider migration.

**Step 4 — Verify isolation**
- Tenant A read under cluster A, then explicitly ask for the same patient on cluster B → empty.
- Force a cluster-connect failure → fallback kicks in (when configured), response header stamped.

**Step 5 — Migrate remaining modules + shared-infra move**
- Flip the rest of the modules through `clusterConnections` (remove the feature flag).
- Move shared-infra models to `sharedConnection` in their own commits, module by module.
- ESLint rules flip to ERROR at the end of Step 5.

Each step is independently shippable and revert-able. Commits: backend + frontend split where applicable; within backend, one commit per step.

---

## ENV Contract (what operators set)

Production:
```
MONGO_URI_PLATFORM=mongodb+srv://…/platform
MONGO_URI_SHARED=mongodb+srv://…/shared-infra

MONGO_URI_MEA_EG_1=mongodb+srv://…/mea-eg-1          # one per cluster key
CLUSTER_PRIORITY_MEA_EG_1=1                          # explicit assignment order (lower = higher priority)

# When cluster #2 comes online:
# MONGO_URI_MEA_EG_2=mongodb+srv://…/mea-eg-2
# CLUSTER_PRIORITY_MEA_EG_2=2

STORAGE_PROVIDER=r2                                  # enforced by boot guard
```

Dev (simplified):
```
MONGO_URI_DEV_SINGLE=mongodb://localhost:27017       # all three layers reuse this
STORAGE_PROVIDER=r2                                  # or local; prod guard doesn't fire in dev
```

Boot refuses to start if `MONGO_URI_DEV_SINGLE` is set AND `NODE_ENV === "production"`.
Boot refuses to start if any referenced `org.cluster` value has no matching `MONGO_URI_<key>` ENV.

---

## Risks / Open Questions (for implementation time, not blockers)

- **One cluster at launch** — Day-one there will be exactly one cluster (`MEA-EG-1`). Code is cluster-aware but behaviorally single-cluster.
- **Platform models using `mongoose.models[modelName] || mongoose.model(...)`** — common pattern today (e.g., `Region.model.js`). These need `getPlatformModel(def)` once platform connection is a sibling, not the global root. Sweep at Phase 3.
- **queryPerformance plugin** — a `mongoose.plugin(...)` global call. It affects schemas on any connection, so it will still apply.
- **Orthodontic `ensureTreatmentPlanIndexes`** boot-time fire-and-forget inside `dbManager.createConnection()` — must still run on the new tenant connection path.
- **organizationId decision table** — Phase 4 will produce a per-file keep/remove table for explicit approval BEFORE edits land.
- **Fallback policy** — DEFERRED Day-1. API surface wired, always `null` until cluster #2.
- **Load tracking + health auto-DOWN** — DEFERRED Day-1. Schema stubs exist (`load`, `status`) but not consumed on the request path.
