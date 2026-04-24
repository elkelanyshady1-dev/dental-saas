# 📘 DENTAL SAAS — ARCHITECTURE ROADMAP (LOAD-BASED MULTI-CLUSTER)

## Objective

Build a **clean, scalable SaaS backend** with:

- Hybrid multi-tenant DB
- Load-based multi-cluster routing
- Dual cluster (platform + tenant clusters)
- U-CAP file storage (R2)
- Zero legacy patterns

---

# 🧭 PHASE 0 — HARD RESET (0.5–1 Day)

## Goal

Remove ALL legacy patterns completely (no migration, no compatibility)

---

## Actions

### Delete:

- ALL `.default` exports
- `shared/models/*`
- Duplicate outbox models
- Legacy file models (`modules/files`)
- Proxy models
- `localProvider`, `s3Provider`
- `express.static('/uploads')`

---

### Remove ALL fields:

```id="bad_fields"
url
localPath
storagePath
scanFilePath
s3Key
```

---

## ✅ Output

- Clean codebase
- No legacy leakage risk

---

# 🧭 PHASE 1 — DUAL + MULTI-CLUSTER FOUNDATION (2 Days)

## Goal

Support:

- Platform cluster (single)
- Multiple tenant clusters (load-based)

---

## 1.1 ENV Setup

```env
MONGO_URI_PLATFORM=
MONGO_URI_TENANT_A=
MONGO_URI_TENANT_B=
```

---

## 1.2 Cluster Config

```javascript
module.exports = {
  clusters: {
    "cluster-a": { uri: process.env.MONGO_URI_TENANT_A },
    "cluster-b": { uri: process.env.MONGO_URI_TENANT_B }
  }
};
```

---

## 1.3 Cluster Connection Manager

```javascript
const connections = {};

function getClusterConnection(clusterKey) {
  if (!connections[clusterKey]) {
    const uri = clusterConfig.clusters[clusterKey].uri;
    connections[clusterKey] = mongoose.createConnection(uri);
  }
  return connections[clusterKey];
}
```

---

## 1.4 Org Routing (LOAD-BASED)

```javascript
Organization {
  name,
  cluster: "cluster-a"
}
```

---

## 1.5 Resolve Org Connection

```javascript
async function resolveOrgConnection(orgId) {
  const org = await Organization.findById(orgId);

  const clusterConn = getClusterConnection(org.cluster);

  return clusterConn.useDb(`org_${orgId}`);
}
```

---

## 1.6 Platform Connection

```javascript
const platformConn = mongoose.createConnection(MONGO_URI_PLATFORM);
```

---

## ✅ Output

- Multi-cluster ready
- Infinite scaling capability

---

# 🧭 PHASE 2 — MODEL SYSTEM (1–2 Days)

## Goal

100% connection-bound models

---

## Standard

```javascript
module.exports = {
  modelName: "X",
  schema: { ... }
}
```

---

## Rules

- ❌ No `mongoose.model()`
- ❌ No `.default`
- ❌ No global models

---

## Structure

```id="model_structure"
src/platform/models/
src/modules/.../models/
```

---

## ✅ Output

- Safe multi-tenant model layer

---

# 🧭 PHASE 3 — U-CAP FILE SYSTEM (1 Day)

## Goal

Single file abstraction (R2)

---

## File Model

```javascript
File {
  orgId
  patientId
  type
  fileKey
}
```

---

## R2 Key Format

```id="r2_format"
org_<orgId>/patients/<patientId>/<type>/<fileId>
```

---

## Rules

- ❌ No URLs in DB
- ❌ No local storage
- ✅ Signed URLs only

---

## ✅ Output

- Clean storage abstraction
- Scalable file handling

---

# 🧭 PHASE 4 — OUTBOX SYSTEM (1 Day)

## Goal

Single event system

---

## Keep ONLY

```id="outbox_keep"
Platform → EventOutbox
Optional → OrgOutbox
```

---

## Delete ALL others

---

## Worker Rule

```javascript
getModel(connection, EventOutboxDef)
```

---

## ✅ Output

- Reliable event processing

---

# 🧭 PHASE 5 — AUTH & TOKENS (1 Day)

## Goal

Centralized auth

---

## Rules

- Tokens ONLY in platform DB
- No fallback logic
- All tokens hashed

---

## ✅ Output

- Secure auth system

---

# 🧭 PHASE 6 — SCHEMA CONSOLIDATION (2 Days)

## Goal

Reduce DB complexity

---

## Merge

- Orthodontic models → 1 aggregate
- Clinical → 1 collection
- Financial → 1 collection

---

## Target

```id="target_collections"
10–15 collections per org
```

---

## ✅ Output

- Efficient DB
- Scalable queries

---

# 🧭 PHASE 7 — LOAD-BASED CLUSTER ALLOCATION (0.5 Day)

## Goal

Automatically assign clusters

---

## Simple Strategy

```javascript
function assignCluster() {
  return currentLoad(clusterA) < threshold ? "cluster-a" : "cluster-b";
}
```

---

## Store in org

```javascript
cluster: "cluster-a"
```

---

## Future Ready

- Add more clusters without refactor
- Add region later if needed

---

## ✅ Output

- Auto-scaling tenant distribution

---

# 🧭 PHASE 8 — ENFORCEMENT (0.5 Day)

## Goal

Prevent regressions

---

## Add ESLint rules

- Block `.default`
- Block `mongoose.model`

---

## Runtime Guards

- Require orgId in workers
- Reject invalid DB usage

---

## ✅ Output

- Long-term stability

---

# 🧭 PHASE 9 — VALIDATION (1 Day)

## Tests

- Multi-cluster routing
- Tenant isolation
- File upload/download
- Auth flow
- Worker processing

---

## Load Test

- 100–500 orgs simulated

---

## ✅ Output

- Production confidence

---

# 🎯 FINAL STATE

- ✅ Load-based multi-cluster system
- ✅ Hybrid DB architecture
- ✅ U-CAP storage
- ✅ Single outbox system
- ✅ Clean schema
- ✅ Zero legacy patterns

---

# ⏱️ TIMELINE

|Phase|Time|
|---|---|
|Phase 0|1 day|
|Phase 1|2 days|
|Phase 2|2 days|
|Phase 3|1 day|
|Phase 4|1 day|
|Phase 5|1 day|
|Phase 6|2 days|
|Phase 7|0.5 day|
|Phase 8|0.5 day|
|Phase 9|1 day|

👉 **Total: ~10 days (realistically 7–8 focused days)**

---

# 🚀 FINAL VERDICT

```id="final_score"
FROM: ~55 / 100
TO:   90–95 / 100

STATUS: ✅ READY TO BUILD (MULTI-CLUSTER READY)
```