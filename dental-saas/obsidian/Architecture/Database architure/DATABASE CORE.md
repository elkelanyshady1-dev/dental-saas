# 📘 DATABASE CORE — TDS IMPLEMENTATION

---

# 🎯 OBJECTIVE

- Dual cluster support (Platform + Tenant)
- Load-based cluster routing (future-proof)
- Strict isolation (NO global mongoose.model)
- Connection pooling (LRU + reuse)
- Safe for 1000+ organizations

---

# 🧩 ENV CONFIG

```env
MONGO_URI_PLATFORM=mongodb+srv://...
MONGO_URI_TENANT_CLUSTER_A=mongodb+srv://...
MONGO_URI_TENANT_CLUSTER_B=mongodb+srv://... # optional future
```

---

# 🟦 1. PLATFORM CONNECTION

```javascript
// src/core/db/platformConnection.js

const mongoose = require("mongoose");

let platformConnection = null;

async function initPlatformConnection() {
  if (platformConnection) return platformConnection;

  platformConnection = await mongoose.createConnection(
    process.env.MONGO_URI_PLATFORM,
    {
      maxPoolSize: 20
    }
  );

  console.log("✅ Platform DB connected");

  return platformConnection;
}

function getPlatformConnection() {
  if (!platformConnection) {
    throw new Error("Platform DB not initialized");
  }
  return platformConnection;
}

module.exports = {
  initPlatformConnection,
  getPlatformConnection
};
```

---

# 🟩 2. TENANT CLUSTER MANAGER (LOAD-BASED READY)

```javascript
// src/core/db/tenantCluster.js

const mongoose = require("mongoose");

const clusters = {};

async function initTenantClusters() {
  clusters["A"] = await mongoose.createConnection(
    process.env.MONGO_URI_TENANT_CLUSTER_A,
    { maxPoolSize: 100 }
  );

  console.log("✅ Tenant Cluster A connected");

  // Future:
  if (process.env.MONGO_URI_TENANT_CLUSTER_B) {
    clusters["B"] = await mongoose.createConnection(
      process.env.MONGO_URI_TENANT_CLUSTER_B,
      { maxPoolSize: 100 }
    );
    console.log("✅ Tenant Cluster B connected");
  }
}

function getClusterConnection(clusterKey) {
  const conn = clusters[clusterKey];
  if (!conn) throw new Error(`Cluster ${clusterKey} not found`);
  return conn;
}

module.exports = {
  initTenantClusters,
  getClusterConnection
};
```

---

# 🧠 3. CONNECTION RESOLVER (ORG → CLUSTER)

```javascript
// src/core/db/connectionResolver.js

const { getClusterConnection } = require("./tenantCluster");
const { getPlatformConnection } = require("./platformConnection");

async function resolveOrgConnection(org) {
  // org.cluster = "A" | "B"
  const baseConn = getClusterConnection(org.cluster);

  const dbName = `dental_org_${org._id}`;

  return baseConn.useDb(dbName, {
    useCache: true
  });
}

module.exports = {
  resolveOrgConnection,
  getPlatformConnection
};
```

---

# 🚀 4. DB MANAGER (LRU + CACHE)

```javascript
// src/core/db/dbManager.js

const LRU = require("lru-cache");
const { resolveOrgConnection } = require("./connectionResolver");

const connectionCache = new LRU({
  max: 500, // scale to 1000 orgs
  ttl: 1000 * 60 * 30 // 30 min
});

async function getOrgConnection(org) {
  const key = org._id.toString();

  if (connectionCache.has(key)) {
    return connectionCache.get(key);
  }

  const conn = await resolveOrgConnection(org);

  connectionCache.set(key, conn);

  return conn;
}

function getStats() {
  return {
    activeConnections: connectionCache.size
  };
}

module.exports = {
  getOrgConnection,
  getStats
};
```

---

# 🧩 5. GET MODEL (CRITICAL — NO GLOBAL LEAK)

```javascript
// src/core/db/getModel.js

function getModel(connection, modelDef) {
  const { modelName, schema } = modelDef;

  if (!connection.models[modelName]) {
    connection.model(modelName, schema);
  }

  return connection.models[modelName];
}

module.exports = getModel;
```

---

# 🛡️ 6. DB CONTEXT MIDDLEWARE

```javascript
// src/middleware/dbContext.js

const { getOrgConnection } = require("../core/db/dbManager");

async function dbContext(req, res, next) {
  try {
    const org = req.org; // from auth middleware

    if (!org) {
      throw new Error("Missing org context");
    }

    const conn = await getOrgConnection(org);

    req.dbConnection = conn;

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = dbContext;
```

---

# 🧪 7. USAGE EXAMPLE (IMPORTANT)

```javascript
// src/modules/patient/services/patient.service.js

const getModel = require("../../core/db/getModel");
const PatientModel = require("../models/Patient.model");

async function getPatients(req) {
  const Patient = getModel(req.dbConnection, PatientModel);

  return Patient.find({});
}
```

---

# 🚨 RULES (NON-NEGOTIABLE)

```text
❌ NEVER use mongoose.model()
❌ NEVER import .default models
❌ ALWAYS use getModel(connection, modelDef)
❌ ALWAYS use req.dbConnection for org data
```

---

# 🎯 RESULT

|Feature|Status|
|---|---|
|Multi-tenant isolation|✅|
|Dual cluster ready|✅|
|Load-based routing ready|✅|
|No data leakage|✅|
|Scalable to 1000+ orgs|✅|

---

# 🚀 NEXT STEP

- Add ESLint rule to block mongoose.model
- Add health checks + metrics
- Add cluster auto-balancer

---

END OF TDS