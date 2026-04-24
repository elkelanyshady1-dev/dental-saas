# Changelog

All notable architectural milestones for DentalSaaS.

---

## v9.2 — Physical Multi-Tenancy (Per-Org DB) — 2026-04-24

Tag: `v9.2-per-org-db-complete` → commit `323ad52`

### What changed

Moved tenant isolation from logical (query-level `organizationId` filtering) to
physical (per-org MongoDB database). The system now runs on three separable
MongoDB clusters:

- **Platform** (`MONGO_URI_PLATFORM`) — organizations, platform users, plans,
  billing, tokens, ShareLinks, cluster registry.
- **Shared infra** (`MONGO_URI_SHARED`) — cross-org logs/infra only
  (communication logs, email events, outbox, idempotency keys).
- **Tenant clusters** (`MONGO_URI_<CLUSTER_KEY>`) — per-org DBs, routed via
  region → cluster → `clusterConn.useDb("dental_org_<orgId>")`.

### Commits in this milestone

| Commit  | Scope |
|---------|-------|
| `495fef6` | 3-layer DB foundation — sibling connections, cluster registry + resolver, migration seams, ESLint WARN rules |
| `9b5d323` | Orthodontics (+ OrthodonticCase 1b) — `organizationId` stripped from all schemas, indexes, queries |
| `84578f4` | Patient / Portal / Supervisor / Notification — 4 domains swept atomically with Patient cross-scope model |
| `44af15f` | Billing / Inventory / Treatments / Stage / Clinical — 7 domains + cross-scope Procedure + orgAddOn |
| `323ad52` | Organization core + ShareLink → platform migration (final) |

### Why it matters

- **True isolation** — a compromised query can no longer leak data across orgs,
  because the DB connection IS the tenant boundary.
- **Horizontal scale** — new tenant clusters can be added without touching any
  business code (registry + ENV only).
- **Simpler code** — ~550+ `organizationId: req.context.organizationId` filters
  removed; compound indexes simplified from `{orgId, X, Y}` to `{X, Y}`.
- **No `mongoose.model()` pollution** on new models — `getModel(connection, def)`
  is the only binding path (ESLint WARNs on new violations).

### Breaking changes

None for external API consumers. Internal surface changes:
- `req.dbConnection` now resolves via `clusterConnections.getSync(cluster).useDb(...)`
  when `DB_USE_CLUSTER_LAYER=true`. Legacy path (via `mongoose.connection.useDb`)
  is still the default for backward compatibility — Step 5d will flip this on.
- Public ShareLink lookups (`GET /api/v1/public/share-links/:token`) now hit the
  platform DB first, then resolve the org's cluster.
- New ENV contract: `MONGO_URI_PLATFORM`, `MONGO_URI_SHARED`,
  `MONGO_URI_<CLUSTER_KEY>`, `CLUSTER_PRIORITY_<CLUSTER_KEY>`.
- Dev convenience: `MONGO_URI_DEV_SINGLE` collapses all three layers to one URI
  (forbidden in production — enforced at boot).

### Verification

- Two-cluster isolation test (in-memory Mongo × 2): orgs on distinct ports,
  cross-cluster reads return 0 documents.
- ShareLink round-trip: token created on platform, resolved to tenant DB,
  target resource reached; `sharelinks` collection confirmed absent from
  tenant DBs.
- Schema audit: `organizationId` ABSENT from ~70 tenant schemas across
  orthodontics, billing, inventory, treatments, stage, clinical, patient,
  portal, supervisor, notification, and organization-core domains.
- Branch filtering (`branchId`) intact everywhere.

### Follow-ups

- **Step 5d** — flip `DB_USE_CLUSTER_LAYER` default-on, remove
  `mongoose.connect()` remnants.
- **Step 5e** — raise ESLint rules from WARN to ERROR (block regressions).
- Per-cluster backup policy + health endpoint coverage.
- Phase 8 migration tooling (org cluster moves) lands when first needed.

### Tooling shipped

- `backend/scripts/codemods/remove-tenant-organizationId.codemod.js` — regex pass
  for schema field blocks, compound index prefixes, and simple query filters.
- `backend/scripts/codemods/remove-tenant-organizationId.ast.codemod.js` — Babel
  AST pass, use-aware via `scope.getBinding(name).references` — prevented
  ~65 destructure-binding breakages that a naive regex would have caused.

### Rollback anchors

- `refactor-step-5c-orthodontics-complete` → `9b5d323`
- `refactor-step-5c-commit-2`               → `84578f4`
- `refactor-step-5c-commit-3`               → `44af15f`
- `refactor-step-5c-complete`               → `323ad52`
- `v9.2-per-org-db-complete`                → `323ad52` (milestone)
