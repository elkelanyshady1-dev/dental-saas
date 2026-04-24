# 3-Layer Database Architecture — Foundation Refactor

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

Stored as the string `${cluster}:${orgId}` today (single-line change from the existing `shard:orgId`) but documented as the projection of:

```js
{ cluster: "MEA-EG-1", orgId: "…" }
```

Future additions (region, connectionOptions) slot into this struct without a cache refactor.

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
- `clusterConnections.js` — manages a `Map<clusterKey, { conn, lastUsed, openedAt }>`; `ensureCluster(key)` creates lazily on first use, `close(key)`, `closeAll()`, `getStats()`, and **`closeIdleConnections(maxIdleMs = 30*60*1000)`** that closes cluster-level connections idle beyond the threshold. A `setInterval(closeIdleConnections, 10 * 60 * 1000)` with `.unref()` runs in the background — same pattern as `dbManager`'s eviction sweep. Protects against leaked cluster connections if a cluster is drained or scaled down and never re-used.

  The signature exposes a `fallback` arg on `get(key, { fallback })` but Day-1 always passes `null`. Health tracking + auto-DOWN is deferred until there's a second cluster to fall back to (see "Fallback — DEFERRED" above).

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

  // Rebuild the cache on every metadata refresh cycle.
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
    // add entries as new clusters come online
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
- `dbManager.js` → cache key is `${cluster}:${orgId}:${routingEpoch}`, derived from the resolver. The entry struct carries `{ cluster, orgId, routingEpoch, ... }` explicitly so future dimensions (region, options) slot in without a cache refactor. `routingEpoch` is read from the org doc each time a connection is resolved (the org doc is already in `req.context` so this is free) — a cutover bumps the epoch, and subsequent lookups compute a new key that cannot collide with a stale entry. `createConnection()` now takes cluster from the resolver + `clusterConn.useDb(dbName)` instead of the global `mongoose.connection.useDb`. All cache/eviction/circuit-breaker/health-check logic stays as-is. New public API **`evictByOrg(orgId)`** removes every cache entry for an org across any cluster/epoch — used by the Phase 8 cutover for cache hygiene (correctness is already guaranteed by the epoch).
- `connectionResolver.js` → `resolveOrgConnection(orgId)` now accepts `orgId` OR `{ _id, cluster }` doc; if only orgId, async-looks-up the org from the platform DB. Wraps `clusterConnections.getWithFallback()` so a dead primary cluster fails over (when a fallback is configured).
- `dbResolver.js` → `getPlatformConnection()` now returns `platformConnection.get()` instead of `mongoose.connection`.

**Boot order change** (`server.js` + `config/db.js`):
Old: `await mongoose.connect(MONGO_URI)` → dbManager uses that.
New:
```
seedClusterRegistryFromEnv();        // pure, synchronous, no DB
await platformConnection.init();
await sharedConnection.init();
await clusterRegistry.refreshFromDb(); // decorate ENV entries with status/load (non-fatal on failure)
validateClusterRegistryVsDb();       // bidirectional sanity — see below
// cluster connections open lazily on first resolveOrgConnection(org)
```
`mongoose.connect()` is DELETED (no more global root). `mongoose.plugin(queryPerformancePlugin)` stays (it applies to all schemas regardless of connection).

**Bidirectional registry validation** (`validateClusterRegistryVsDb`):
- For each `org.cluster` referenced in the Organizations collection → must exist in `CLUSTER_REGISTRY` (ENV). FATAL — refuse to boot.
- For each key in `CLUSTER_REGISTRY` (ENV) → warn if the platform DB's `clusters` collection has no corresponding metadata row. NON-FATAL (auto-create a default row with `status: ACTIVE, load: 0` during boot, then warn — ENV is truth, DB is decoration).
- For each key in the `clusters` DB collection → warn if no matching ENV var. NON-FATAL (cluster exists in metadata but has no URI — can't route there).
  This runs once at boot; also exposed via a dev-only endpoint `/api/internal/clusters/validate` for ops.

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
  - **Write-guard rule** — any file under `src/modules/**/services/**` and `src/organization/**/services/**` that calls a mutating Mongoose method (`.create`, `.insertMany`, `.updateOne`, `.updateMany`, `.findOneAndUpdate`, `.deleteOne`, `.deleteMany`, `.findOneAndDelete`, `.bulkWrite`, `.save`) MUST also call `assertWriteAllowed` in the same function. Implemented as a `no-restricted-syntax` rule over MemberExpression call names; false positives suppressible with a `// eslint-disable-next-line write-guard/required -- reason` comment that the linter reviews on commit.
- **Runtime guards**: `enforceDbIsolation(req)` in every tenant service's `_getModels(req)`. Sweep for call sites that accept `req` but skip the guard.
- **R2 boot guard** — add to `server.js` immediately after the existing Redis kill-switch block:
  ```
  if (process.env.NODE_ENV === "production" && process.env.STORAGE_PROVIDER !== "r2") {
      throw new Error("R2 REQUIRED in production");
  }
  ```

### Phase 6 — Health Check
Extend `backend/src/routes/healthRoutes.js`. Surface the metrics `dbManager.getStats()` already computes — don't recompute.

Day-1 response (scoped to what we actually have):
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
      reuseRate:             "87.34%",   // from dbManager.getStats()
      avgResolutionTimeMs:   12.4        // from dbManager.getStats()
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
// 1. IP-based country SUGGESTION ONLY (never authoritative).
//    Exposed via GET /api/meta/country so the frontend can pre-select
//    the country dropdown; user must confirm (or change) before submit.
function getSuggestedCountry(req) {
    return (
        req.headers["cf-ipcountry"] ||
        req.headers["x-country"] ||
        "EG"
    ).toUpperCase();
}

// 2. Country → Region mapping (static table; add entries as we expand)
const EU = new Set(["FR", "DE", "IT", "ES", "NL", "BE", "AT", "IE", "PT", "GR", "SE", "DK", "FI", "PL"]);
const US = new Set(["US", "CA"]);

function mapCountryToRegion(country) {
    if (country === "EG") return "MEA";
    if (EU.has(country))  return "EU";
    if (US.has(country))  return "US";
    return "MEA";
}

// 3. Cluster assignment — O(n) scan of an already-sorted list.
//    Sorting is done ONCE at registry level (see clusterRegistry.getByRegion),
//    not per request. Re-sorting per request would burn CPU at provisioning
//    peaks and could return inconsistent order if a registry refresh
//    interleaves with a provisioning request.
//    status defaults to "ACTIVE" when undefined — ENV-seeded entries lack
//    a status until the DB metadata refresh decorates them.
function assignCluster(region) {
    const regionClusters = clusterRegistry.getByRegion(region);  // pre-sorted

    for (const cluster of regionClusters) {
        if ((cluster.status ?? "ACTIVE") === "ACTIVE") {
            return cluster.key;
        }
    }

    throw new Error(`[Provisioning] No ACTIVE clusters in region ${region}`);
}

// 4. Provisioning entry point — uses the CONFIRMED country from the
//    request body. Never reads IP headers here; country must be present
//    and pass Zod validation at the controller boundary.
// routingVersion = 1 ≡ "priority-first-ACTIVE" algorithm (Day-1).
// Bump this when the algorithm changes (load-based, geo-latency, etc.).
const ROUTING_VERSION = 1;

async function provisionOrg(data) {
    const country = data.country;           // user-confirmed, required
    const region  = mapCountryToRegion(country);
    const cluster = assignCluster(region);

    return Organization.create({
        ...data,
        country,
        region,
        cluster,
        routingVersion: ROUTING_VERSION,
    });
}
```

### Two-step API flow

**Step 1 — `GET /api/meta/country`** (new endpoint)
- Reads `getSuggestedCountry(req)` from headers.
- Response: `{ "suggestedCountry": "EG" }`
- No auth required; no side effects; idempotent.
- Route file: `backend/src/routes/meta.routes.js` (new).

**Step 2 — `POST /api/org/register`** (existing endpoint, updated contract)
- Body: `{ name, country, ... }` — `country` becomes REQUIRED, ISO-3166-1 alpha-2.
- Validated by Zod with a strict allowlist — see `country.schema.js` below.
- Service: `provisionOrg(data)` runs the confirmed-country → region → cluster pipeline and persists.
- IP is NEVER consulted at this step; the only country source is the request body.

**New file** — `backend/src/shared/schemas/country.schema.js`:
```js
const { z } = require("zod");

// Keep this set in sync with mapCountryToRegion() — only codes we intend
// to serve should be accepted. Unknown codes default to MEA routing, but
// we want the user to see "Unsupported country" rather than silently land
// in the wrong region.
const COUNTRY_CODES = new Set([
    "EG",                                                       // MEA anchor
    "US", "CA",                                                 // US region
    "FR", "DE", "IT", "ES", "NL", "BE", "AT",
    "IE", "PT", "GR", "SE", "DK", "FI", "PL",                   // EU region
]);

const CountrySchema = z.string()
    .length(2, "Country must be ISO-3166-1 alpha-2 (2 characters)")
    .transform(val => val.toUpperCase())
    .refine(val => COUNTRY_CODES.has(val), {
        message: "Unsupported country code",
    });

module.exports = { CountrySchema, COUNTRY_CODES };
```

**Controller integration** — in the org registration controller:
```js
const { CountrySchema } = require("@shared/schemas/country.schema");

async function registerOrg(req, res) {
    const parsed = CountrySchema.safeParse(req.body.country);
    if (!parsed.success) {
        return res.status(400).json({
            error: parsed.error.errors[0].message,
            field: "country",
        });
    }

    const org = await provisionOrg({
        ...req.body,
        country: parsed.data,   // normalized uppercase
    });

    res.json(org);
}
```
`COUNTRY_CODES` becomes the single source of truth for accepted countries across the Zod schema, the Guardian invariant, and the frontend dropdown (served via `/api/meta/countries` or bundled).

### Frontend UX contract (informative — frontend change not in this refactor's scope)

1. On register page mount, call `GET /api/meta/country`.
2. Pre-select the country dropdown with `suggestedCountry`. Render detected flag for context.
3. Dropdown is editable — user confirms or changes.
4. On submit, send the selected country in the body. Never trust the IP-derived value silently.

### Organization schema additions

`backend/src/organization/models/Organization.js`:
```js
country:        { type: String, required: true, uppercase: true, length: 2, index: true },
region:         { type: String, required: true, uppercase: true, index: true },
cluster:        { type: String, required: true, index: true },
routingVersion: { type: Number, required: true, default: 1 }   // see below
```

**`routingVersion`** — records WHICH assignment algorithm produced this org's cluster. Day-1 = `1` (priority-first-ACTIVE). When we switch to load-based picking, new orgs get `2`. Later, geo-latency picking → `3`. Makes it trivial to answer "why did this org land here?" years from now, and gives us a migration toggle if we ever need to re-assign orgs that were placed under an old algorithm.

Guardian invariants:
- `country` must be in `COUNTRY_CODES` (the same set Zod validates against — single source of truth).
- `region` must equal `mapCountryToRegion(country)`. (Catches manual DB edits.)
- `cluster` must exist in `CLUSTER_REGISTRY` AND `clusterRegistry.getByRegion(region)` must contain it. (Catches cross-region misassignment.)
- `routingVersion` must be a known version number (≥1).

### Why this matters (design intent)

- **Compliance-friendly**: users in regulated markets (EU, KSA, etc.) must explicitly assert residency — IP guesses don't meet that bar.
- **VPN/travel-safe**: a clinic in Egypt registering from a hotel in Dubai won't get silently routed to the wrong region.
- **No post-hoc re-assignment**: cluster is set once at registration and never drifts. Migration to another cluster is a deliberate platform operation, never an accident of detection.

### Why explicit priority (not array order)

Registry iteration order is not a stable contract — `getByRegion()` may someday filter a Map, merge DB-decorated rows, or be refactored. If ordering is implicit, a silent change in that function silently changes which cluster a new org lands on. Explicit `priority` means the assignment decision is reproducible by reading ENV alone, without tracing internal registry implementation. Cheap to add Day-1, immovable guarantee Day-2+.

### Why `status ?? "ACTIVE"`

Day-1 the registry is seeded from ENV and has NO `status` field on entries until the async DB-metadata decoration runs. A strict `=== "ACTIVE"` check would silently return "no clusters available" during the boot window before the DB refresh completes — a real footgun. Nullish-default to `"ACTIVE"` makes ENV-only operation the safe path, with DB metadata only narrowing it (e.g., flipping to `"DRAINING"` later).

### What this deliberately is NOT (non-goals for Day-1)

- No load-based routing, no `c.load < 0.85` capacity guard.
- No DB read during provisioning (registry is in-memory, seeded from ENV).
- No async fallback / failover.
- No multi-cluster selection logic beyond first-ACTIVE.

### Forward compatibility

When cluster #2 comes online and scaling matters, this is the ONLY change:
```js
return assignClusterByLoad(region);   // new picker — same signature
```
No other system changes required. `org.cluster` is already persisted, routing already reads it, the registry already has `load` + `status` fields ready to read.

### What still holds Day-1

- `org.cluster` IS persisted to the DB. Non-negotiable — required for routing, migrations, future scaling.
- Guardian invariant: every Organization doc has a non-null `cluster` that exists in `CLUSTER_REGISTRY`. Asserted by `runStartupGuardian`.
- `/health/db` still reports per-cluster status (just with fewer fields — see Phase 6 update).

Call sites:
- `backend/src/organization/services/organizationProvisioning.service.js` (or wherever org create happens today) — calls `assignCluster(org.region)` and writes the result to `org.cluster` BEFORE any tenant-DB write. This is the only place `org.cluster` is set.
- Covered by a guardian invariant: every Organization doc must have a non-null `cluster` that exists in `CLUSTER_REGISTRY`; `runStartupGuardian` asserts this on boot.

### Phase 8 — Org Migration Between Clusters (zero downtime, no data loss)

Moving an org from one cluster to another is an **operational** action (not Day-1 product work), but the foundation has to support it without a rewrite. We build the seams now; the tooling lands when first needed (capacity rebalance, cluster decommission, compliance-driven relocation).

**Design goals**: no writes lost, no reads return stale data after cutover, bounded (< 5s) write-pause window, revert-able at any point before cutover.

**State machine on `Organization.migrationState`** (new field — default `null`):
```
null ─→ "PREPARING" ─→ "SYNCING" ─→ "CUTOVER_PENDING" ─→ "CUTOVER" ─→ "VERIFYING" ─→ "COMPLETE" ─→ null
                           ↓                ↓                ↓            ↓
                           └────── "FAILED" (any stage — safe: src still authoritative) ──
```
Each state transition is a platform-DB mutation on the `Organization` doc, written via an atomic `findOneAndUpdate` with the expected current state in the filter (optimistic lock — prevents concurrent migration attempts).

**Stage-by-stage**:

1. **PREPARING** — write `{ migrationState: "PREPARING", targetCluster }` on the org. Create the target DB (`clusterConn.useDb("dental_org_<id>")` on the target); pre-build indexes via `ensureTenantIndexes`. Source cluster keeps serving 100% of traffic; no impact.

2. **SYNCING** — initial dump+restore OR MongoDB Change Streams from source. Concrete choice deferred to implementation; both are compatible with the state machine. During SYNCING, source is authoritative, target is catching up. Acceptable lag: O(seconds).

3. **CUTOVER_PENDING** — lag < threshold (e.g., < 1s). Schedule a cutover window; alert ops. Still fully readable/writable on source.

4. **CUTOVER** — the only stage with a brief (target < 3s) write pause:
   - **Set the write lock** on the org (`Organization.writeLocked = true`). Middleware rejects new mutating requests with 503 `Retry-After: 5`; writes ALREADY past middleware are stopped at the DB layer by `assertWriteAllowed(org)` (see below).
   - Wait for in-flight requests to drain (reuse the existing shutdown-draining pattern from `setShuttingDown`).
   - Catch up the final tail (remaining change-stream events).
   - **Atomic cluster swap + epoch bump**:
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
   - **Flush the dbManager cache** for this org: `dbManager.evictByOrg(orgId)`. This is now cleanup, not correctness-critical — the epoch bump already guarantees that any request post-swap resolves to a NEW cache key and never collides with a stale entry.
   - New requests read the swapped `org` doc → new `routingEpoch` → new cache key → new cluster. In-flight requests holding a reference to the OLD org doc keep using the OLD cache key, which still points at the OLD cluster DB (which is still readable during the grace period). Zero split-brain, zero data corruption.
   - Reads that were in flight to the source during the lock window complete normally; new reads go to the target.

5. **VERIFYING** — sample-based parity check (document count per collection + spot-check checksums on a random sample). Can run async. Target now serves all traffic.

6. **COMPLETE** — clear `migrationState`, mark source DB read-only (or drop after grace period). Emit audit log.

**New foundation pieces** (baked in Day-1 even though Phase 8 lands later):

- **`routingEpoch`** on `Organization` (new field, default `1`) — incremented on every cutover. Part of the dbManager cache key (`${cluster}:${orgId}:${routingEpoch}`), making the cache automatically immune to cutover races. Old in-flight requests retain their old `org` doc (including old epoch) and keep reading from the old cluster's cached connection; new requests resolve with the new epoch and land on the new cluster. No coordinated cache invalidation is required for correctness.
- **`dbManager.evictByOrg(orgId)`** — removes every cache entry whose key starts with `*:orgId:*`. No longer on the correctness path thanks to `routingEpoch`, but still useful: bounds cache size after cutover and acts as an emergency cache flush tool.
- **`Organization.writeLocked`** field + two layers of enforcement:
  1. **Middleware** — `backend/src/middleware/orgWriteLock.middleware.js`, mounted in the org middleware chain in `app.js` (between `orgSubscriptionGuard` and `rlsContext`). On non-GET/HEAD methods, checks `req.context.organization.writeLocked` and returns 503 `Retry-After: 5` with code `ORG_WRITE_LOCKED`. This stops NEW requests.
  2. **DB-level guard** — `backend/src/core/db/assertWriteAllowed.js` exports `assertWriteAllowed(org)` that throws a 503 `ORG_WRITE_LOCKED` error when `org.writeLocked === true`. Every tenant service's write path calls it immediately before the write. This stops IN-FLIGHT requests that passed middleware BEFORE the lock was set.

     Enforcement site: tenant services all resolve models through a small `_getModels(req)` helper today — we co-locate the `assertWriteAllowed(req.context.organization)` call there, guarded by the mongoose schema method names (`.create|.updateOne|.findOneAndUpdate|…`). ESLint rule added: any file under `src/modules/**/services/**` that calls a mutating Model method must also call `assertWriteAllowed` in the same function.

- **`MigrationLog`** collection on platform DB — immutable audit of every transition (`{ migrationId, orgId, from, to, sourceCluster, targetCluster, actor, at, reason }`). Stays platform-side (next to billing audits). Never moves.
- **`migrationId`** field on `Organization` (nullable string) — set when `migrationState` becomes `"PREPARING"`, cleared when `"COMPLETE"`. Matches the `migrationId` in `MigrationLog` so every log entry, every error, and every audit can be correlated back to a single migration session. Critical for debugging partial failures.
- **`routingVersion`** bump at CUTOVER — old orgs on the retired algorithm can be migrated with a new version stamp so the "why is this org here?" question is always answerable from a single doc read.

**Safety properties**:

- If any stage before CUTOVER fails, source cluster is untouched — revert is free (delete target DB, clear `migrationState` + `targetCluster` + `migrationId`).
- **No split-brain writes during cutover** — the write lock has two layers:
  - Middleware stops new mutating requests.
  - `assertWriteAllowed(org)` at the DB boundary stops in-flight requests that are past middleware. Any attempt to write after the lock is set throws 503 before the Mongoose call is issued.
- **No split-brain reads/writes after cutover** — `routingEpoch` is part of the cache key, so stale connections cached under the old epoch become unreachable to new requests (they compute a new key from the refreshed org doc). In-flight requests holding the old org doc complete cleanly against the old cluster's still-present data. `evictByOrg` runs as cleanup, not as a correctness gate.
- The write-lock window is the ONLY period where clients see 503s. < 3s budget is enforceable by timing out the drain; a slightly longer read-only window is preferable to a data-loss event.

**Non-goals Day-1**:
- The migration tooling itself (CLI, admin endpoint, sync engine). These land when first needed.
- Multi-cluster reads during steady state — org is always on exactly one cluster at a time. Cross-cluster reads only exist during the brief sync window and are implementation detail of the migration engine.

### Phase 9 — Dead/Duplicate Cleanup
Delete-only list (no behavioral change intended):
- Duplicate Patient: keep `organization/patient/models/patient.model.js`; delete `shared/models/Patient.js` and any `org/models/Patient.js`. Fix imports.
- Duplicate Lead / SiteContent: keep the platform copy only.
- Duplicate TreatmentCategory / TreatmentProcedure (between `modules/treatments` and `modules/treatment-catalog`): keep `modules/treatments/infrastructure/models/*`; delete the other.
- `backend/src/platform/billing/providers/PaymobProvider.js` — already `D` in git status, confirm and commit the delete.

---

## Critical Files (map)

### Create
- `backend/src/core/db/platformConnection.js`
- `backend/src/core/db/sharedConnection.js`
- `backend/src/core/db/clusterConnections.js` (with `getWithFallback`)
- `backend/src/core/db/clusterRegistry.js` (ENV-seeded; DB-decorated)
- `backend/src/core/db/clusterResolver.js` (replaces `shardResolver.js`)
- `backend/src/core/db/clusterConfig.js` (replaces `shardConfig.js` — or keep name, add back-compat alias)
- `backend/src/platform/domain/models/Cluster.model.js` — `{ key, region, status, capacity, load, lastHealthCheck, createdAt }`. **No `uri` field** — URIs live in ENV only (hybrid registry rule).
- `backend/src/shared-infra/models/getSharedModel.js` — `(modelDef) => getModel(sharedConnection.get(), modelDef)`
- `backend/src/platform/provisioning/clusterAssignment.service.js` — `assignCluster(region)`, `provisionOrg(data)`, `getSuggestedCountry(req)` (Phase 7)
- `backend/src/routes/meta.routes.js` — exposes `GET /api/meta/country` returning `{ suggestedCountry }` (Phase 7)
- `backend/src/shared/schemas/country.schema.js` — `CountrySchema` (Zod), `COUNTRY_CODES` (allowlist, SSOT for country validation + Guardian invariants) (Phase 7)
- `backend/src/middleware/orgWriteLock.middleware.js` — 503 `Retry-After` on mutating methods when `org.writeLocked === true` (Phase 8 seam — mounted in the org middleware chain Day-1, never fires Day-1 because no org is ever locked)
- `backend/src/core/db/assertWriteAllowed.js` — `assertWriteAllowed(org)` throws 503 `ORG_WRITE_LOCKED` if `org.writeLocked`. Called by every tenant service's write path to catch in-flight requests the middleware already let through (Phase 8 seam — enforced Day-1 by ESLint rule so the habit is established before it matters).
- `backend/src/platform/migration/MigrationLog.model.js` — append-only audit of cluster migrations, keyed by `migrationId` (Phase 8 seam — platform-side, never moves)

### Modify
- `backend/server.js` — new boot order (platform.init → shared.init → clusterRegistry.load); R2 prod guard.
- `backend/src/config/db.js` — delete `mongoose.connect()`; keep `mongoose.plugin(queryPerformancePlugin)`; delegate to `platformConnection.init()`.
- `backend/src/core/db/dbManager.js` — `createConnection()` uses cluster connection; cache key `cluster:orgId`; new `evictByOrg(orgId)` public API.
- `backend/src/core/db/connectionResolver.js` — accepts org doc or async-loads org → cluster; uses `clusterConnections`.
- `backend/src/core/db/dbResolver.js` — `getPlatformConnection()` returns `platformConnection.get()`.
- `backend/src/core/db/connectionFactory.js` — `cluster` terminology.
- `backend/src/infrastructure/regions/regionRegistry.js` — no functional change; reuse as the template for `clusterRegistry`.
- `backend/src/organization/models/Organization.js` — add `country`, `region`, `cluster`, `routingVersion` (all required, indexed where appropriate), plus Phase 8 seams: `migrationState` (nullable enum), `writeLocked` (bool, default false), `targetCluster` (nullable string), `routingEpoch` (int, default 1, incremented on cutover — part of the dbManager cache key), `migrationId` (nullable string — correlates with `MigrationLog` entries). Guardian invariants: `country` in `COUNTRY_CODES`; `region` matches `mapCountryToRegion(country)`; `cluster` exists in `CLUSTER_REGISTRY` AND is in that region; `migrationState` is one of the enum values or null; `routingEpoch ≥ 1`.
- Org provisioning service (wherever new orgs are created today) — accept `country` from the request body (Zod-validated, required) and call `provisionOrg(data)`. Do NOT read IP headers at this step.
- Org register route controller — consume `country` from `req.body` via Zod; never fall back to IP-derived country.
- `backend/src/routes/healthRoutes.js` — expand `/db` endpoint.
- `backend/eslint.config.js` — add `no-restricted-syntax` rules (mongoose.model, organizationId in tenant models).
- All shared-infra model files (list in Phase 2) — rebind to `sharedConnection`.
- All tenant model files that still have a `default: mongoose.model(...)` line — delete that line; ensure `{ modelName, schema }` export is present.
- All tenant services that currently do `const Model = require("…/foo.model").default` — switch to `getModel(req.dbConnection, FooDef)`.

### Delete
- `backend/src/core/db/shardConfig.js` (if not repurposed as alias), `shardResolver.js` (after migration).
- Duplicate Patient/Lead/SiteContent/TreatmentCategory/TreatmentProcedure as listed in Phase 7.
- `backend/src/platform/billing/providers/PaymobProvider.js` (already pending).

---

## Reuse Map (what we keep, don't rewrite)

- `backend/src/core/db/getModel.js` — exactly the pattern the prompt specifies. Zero changes.
- `backend/src/core/db/dbIsolation.guard.js` — exactly the runtime guard the prompt specifies.
- `backend/src/core/db/dbManager.js` cache/LRU/TTL/semaphore/health-check/circuit-breaker logic — all retained. Only the CREATE path swaps its input connection.
- `backend/src/infrastructure/regions/regionRegistry.js` — its load/refresh/validate pattern is the exact shape `clusterRegistry` will take.
- `backend/src/core/db/ensureTenantIndexes.js`, `indexValidator.js`, `queryPerformance.js`, `Semaphore.js` — untouched.
- `Region.model.js` keeps its role for geographic/compliance metadata + provider keys; Cluster is a new sibling collection, not a replacement.

---

## Verification

1. **Boot** — `npm start` succeeds with only the three MONGO_URI_* vars set (platform + shared + one cluster). `mongoose.connect()` is gone; look for `grep -n "mongoose.connect(" backend/` returning nothing outside tests.
2. **Two-step org registration** —
   - `GET /api/meta/country` with no headers → `{ suggestedCountry: "EG" }` (default).
   - Same endpoint with `cf-ipcountry: DE` → `{ suggestedCountry: "DE" }`.
   - `POST /api/org/register` WITHOUT `country` in the body → Zod 400.
   - `POST /api/org/register` with `{ name, country: "EG" }` from a `DE` IP → org persists with `country: "EG", region: "MEA", cluster: "MEA-EG-1"` (confirmed country wins, IP is ignored).
   - `dbManager.getStats()` shows the cluster connection opened on first tenant request and a new `cluster:orgId` cache entry.
   - Guardian boot check passes: every org has a cluster present in `CLUSTER_REGISTRY`.
3. **Tenant isolation** — write a patient via org A's connection; read with org B's connection; assert empty. Then force-resolve org A's DB from a mis-matched cluster URI and assert nothing is readable.
4. **Auth tokens** — send OTP, confirm `otps` doc lands in the platform DB (not tenant, not shared).
5. **Send email** — verify `CommunicationLog` + `EmailEvent` docs land on shared cluster, not platform or tenant.
6. **File upload** — production-mode boot with `STORAGE_PROVIDER` unset or `=local` throws at startup. With `=r2`, boots. Uploads reach R2.
7. **Financial update** — ledger + summary still update atomically in the same request (same tenant DB) — regression test.
8. **Health** — `curl /api/health/db` returns platform/shared/cluster statuses + per-cluster active connection counts.
9. **ESLint** — `npm run lint` fails cleanly on any reintroduced `mongoose.model(` or `organizationId` in a tenant schema.
10. **Guardian / startup validators** pass (runStartupGuardian, validatePolicyCoverage, validateFieldAccess, permission drift — all existing boot checks) — i.e., no regression in platform invariants.
11. **Load sim** — script that creates 50 orgs across 3 clusters, fires parallel requests, confirms connection cache respects MAX_CONNECTIONS per cluster, no cross-cluster leakage, no stuck `pendingConnections`.

---

## Implementation Rollout Order (migrate incrementally — do NOT do it all at once)

The refactor is wide. Landing it in one PR risks a non-bootable main. Split into five sequential merges:

**Step 1 — Dual-root infra (no behavioral change)**
- Create `platformConnection.js`, `sharedConnection.js`. Platform still resolves through the existing `mongoose.connection` (they point at the same URI initially).
- Boot both; every existing code path keeps working.
- Verify: `/api/health/db` returns both statuses.

**Step 2 — Cluster layer (wired, unused)**
- Create `clusterConnections.js`, `clusterRegistry.js`, `clusterResolver.js`, `Cluster.model.js`, `assignCluster.service.js`.
- Introduce `org.cluster` field; backfill all existing orgs to the single default cluster.
- `dbManager.createConnection` STILL uses `mongoose.connection.useDb` — cluster path is wired but not active.
- Verify: new orgs provision with a cluster assignment; existing orgs routed exactly as before.

**Step 3 — Flip ONE module (patients)**
- Make `dbManager` route through `clusterConnections` for a single module (patients) via a feature flag or scoped change.
- Run the full patient test suite + manual smoke.
- This is the real test of isolation and fallback before wider migration.

**Step 4 — Verify isolation**
- Tenant A read under cluster A, then explicitly ask for the same patient on cluster B (test harness) → empty, as expected.
- Force a cluster-connect failure → fallback kicks in, response header stamped, health tracker increments.

**Step 5 — Migrate remaining modules + shared-infra move**
- Flip the rest of the modules through `clusterConnections` (remove the feature flag).
- Move shared-infra models to `sharedConnection` in their own commits, module by module (communicationLogs first, then outbox, then idempotencyKeys).
- ESLint rules flip to ERROR at the end of Step 5.

Each step is independently shippable and independently revert-able. Commits per memory `feedback_commit_granularity.md`: backend + frontend split where applicable; within backend, one commit per step.

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

- **One cluster at launch** — Day-one there will be exactly one cluster (`MEA-EG-1`). Code is cluster-aware but behaviorally single-cluster; `assignCluster(region)` returns `MEA-EG-1` deterministically (first-ACTIVE, alphabetical tie-break). Adding a second cluster is a registry insert + env var — no code change. Switching to load-aware picking is a one-line swap in the provisioning service when that day comes.
- **Platform models using `mongoose.models[modelName] || mongoose.model(...)`** — common pattern today (e.g., `Region.model.js` line 64). These need `getPlatformModel(def)` once platform connection is a sibling, not the global root. Sweep at Phase 3.
- **queryPerformance plugin** — a `mongoose.plugin(...)` global call. It affects schemas on any connection, so it will still apply. Confirm during verification.
- **Orthodontic `ensureTreatmentPlanIndexes`** boot-time fire-and-forget inside `dbManager.createConnection()` — must still run on the new tenant connection path. Kept.
- **organizationId decision table** — Phase 4 will produce a per-file keep/remove table (Patient: REMOVE, AuditLog: KEEP, etc.) for explicit approval BEFORE edits land, per memory guidance `feedback_scoping_permissions.md`.
- **Fallback policy** — DEFERRED Day-1. With a single cluster there is nothing to fall back to. The API surface is wired (`fallback` arg exists on `clusterConnections.get`) but always `null` until cluster #2 exists; policy + response header stamping land then.
- **Load tracking + health auto-DOWN** — DEFERRED Day-1 for the same reason. Stubs exist in the registry schema (`load`, `status`) but are not consumed on the request path.