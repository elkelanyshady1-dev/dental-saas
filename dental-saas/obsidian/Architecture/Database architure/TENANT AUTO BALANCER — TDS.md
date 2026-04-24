# 📘 TENANT AUTO BALANCER — TDS

---

# 🎯 OBJECTIVE

- Assign new organizations to least-loaded cluster
- Support multiple clusters (A, B, C...)
- No runtime rebalancing (only at creation)
- Simple, deterministic, safe

---

# 🧩 DATA SOURCE

Cluster load is calculated from:

```text
platform_db.organizations
```

Grouped by:

```text
cluster field
```

---

# 🟦 1. CLUSTER CONFIG

```javascript
// src/core/db/clusterConfig.js

module.exports = {
  clusters: [
    {
      key: "A",
      maxOrgs: 500
    },
    {
      key: "B",
      maxOrgs: 500
    }
    // add more later
  ]
};
```

---

# 🧠 2. AUTO BALANCER SERVICE

```javascript
// src/core/db/autoBalancer.js

const { getPlatformConnection } = require("./platformConnection");
const getModel = require("./getModel");
const OrganizationModel = require("../../platform/models/Organization.model");
const { clusters } = require("./clusterConfig");

async function selectCluster() {
  const conn = getPlatformConnection();
  const Organization = getModel(conn, OrganizationModel);

  // 🔥 Count orgs per cluster
  const counts = await Organization.aggregate([
    {
      $group: {
        _id: "$cluster",
        count: { $sum: 1 }
      }
    }
  ]);

  const clusterLoad = {};

  // Initialize counts
  clusters.forEach(c => {
    clusterLoad[c.key] = 0;
  });

  // Fill actual counts
  counts.forEach(c => {
    clusterLoad[c._id] = c.count;
  });

  // 🔥 Pick least loaded cluster
  let selected = null;
  let minLoad = Infinity;

  for (const cluster of clusters) {
    const load = clusterLoad[cluster.key] || 0;

    if (load < minLoad && load < cluster.maxOrgs) {
      minLoad = load;
      selected = cluster.key;
    }
  }

  if (!selected) {
    throw new Error("No available cluster (capacity reached)");
  }

  return selected;
}

module.exports = {
  selectCluster
};
```

---

# 🧩 3. ORGANIZATION CREATION FLOW

```javascript
// src/platform/services/organization.service.js

const getModel = require("../../core/db/getModel");
const { getPlatformConnection } = require("../../core/db/platformConnection");
const OrganizationModel = require("../models/Organization.model");
const { selectCluster } = require("../../core/db/autoBalancer");

async function createOrganization(data) {
  const conn = getPlatformConnection();
  const Organization = getModel(conn, OrganizationModel);

  // 🔥 Assign cluster
  const cluster = await selectCluster();

  const org = await Organization.create({
    name: data.name,
    cluster
  });

  return org;
}

module.exports = {
  createOrganization
};
```

---

# 🧪 4. DEBUG / STATS ENDPOINT

```javascript
// src/platform/controllers/cluster.controller.js

const getModel = require("../../core/db/getModel");
const { getPlatformConnection } = require("../../core/db/platformConnection");
const OrganizationModel = require("../models/Organization.model");

async function getClusterStats(req, res) {
  const conn = getPlatformConnection();
  const Organization = getModel(conn, OrganizationModel);

  const stats = await Organization.aggregate([
    {
      $group: {
        _id: "$cluster",
        count: { $sum: 1 }
      }
    }
  ]);

  res.json(stats);
}

module.exports = {
  getClusterStats
};
```

---

# ⚠️ IMPORTANT RULES

```text
1. Cluster is assigned ONLY at org creation
2. Cluster NEVER changes automatically
3. Rebalancing = manual migration only
4. No runtime switching between clusters
```

---

# 🚀 FUTURE EXTENSIONS

## Add weight-based balancing

```javascript
// weight clusters differently
{ key: "A", weight: 1 }
{ key: "B", weight: 2 }
```

---

## Add region-based override

```javascript
if (org.region === "EU") return "EU_CLUSTER";
```

---

## Add metrics-based balancing (advanced)

```javascript
// CPU, connections, memory from monitoring
```

---

# 🎯 FINAL RESULT

|Feature|Status|
|---|---|
|Auto cluster assignment|✅|
|Multi-cluster ready|✅|
|Load-based balancing|✅|
|Simple + safe|✅|
|Migration-free scaling|✅|

---

# 🔥 FINAL INSIGHT

```text
Scaling SaaS is NOT about moving tenants.
It's about placing them correctly from day 1.
```

---

END OF TDS