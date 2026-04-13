# Database Connection Manager

## Purpose
Manage MongoDB connection lifecycle for per-org database isolation.

## Components

### dbManager
- Manages connection pool for per-org databases
- Connection format: `dental_org_<organizationId>`
- Lazy creation — connection opened on first request
- Callers must call `releaseConnection()` in platform contexts
- File: `backend/src/core/db/dbManager.js`

### dbResolver
- Resolves platform connection (shared `saasdental` DB)
- `getPlatformConnection()` — returns platform connection
- File: `backend/src/core/db/dbResolver.js`

### getModel
- Binds a model definition to a specific connection
- `getModel(connection, modelDefinition)` → Mongoose Model
- Ensures model is registered on the correct DB
- File: `backend/src/core/db/getModel.js`

## Usage Patterns

### In Org Middleware (automatic)
```javascript
// orgSubscriptionGuard sets req.dbConnection
const Patient = getModel(req.dbConnection, PatientDef);
const patients = await Patient.find({});
```

### In Platform Controller (manual)
```javascript
const conn = dbManager.getConnection(orgId);
try {
    const Branch = getModel(conn, BranchDef);
    // ... use model
} finally {
    dbManager.releaseConnection(orgId);
}
```

### Platform Models
```javascript
const conn = getPlatformConnection();
const OrgContract = getModel(conn, OrgContractDef);
```

## Connection Naming
| Database | Purpose |
|----------|---------|
| `saasdental` | Platform models (orgs, plans, contracts, platform users) |
| `dental_org_<id>` | Per-org clinical data |
| `dental_supervisor` | Supervisor plane data |

## Dependencies
- [[MultiTenancy]] — Architectural pattern
- [[AuthMiddleware]] — Connection binding via orgSubscriptionGuard

## Status
**ACTIVE** — Pool-based connection management

---
#database #connections #infrastructure
