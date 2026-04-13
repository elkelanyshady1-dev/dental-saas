# Multi-Tenancy Architecture

## Purpose
Define the database-per-tenant isolation strategy that ensures complete data separation between organizations.

## Strategy
Database-per-tenant (`DB_MODE = per-org`)

## Isolation Model
```
Platform DB (saasdental)
├── organizations
├── platformusers
├── planversions
├── orgentitlements
└── orgusages

Per-Org DB (dental_org_<orgId>)
├── users
├── branches
├── patients
├── treatments
└── ... (clinical data)
```

## Branch Isolation (req.branchContext)
Users are isolated at the branch level via `branchContext.middleware.js` (merged from legacy `branchScopeMiddleware.js`):
- **Unrestricted**: Platform users and Org admins (with `hasFullBranchAccess: true`) see all data.
- **Restricted**: Regular users are filtered by `branchAccess[]`.
- **403 Forbidden**: Users with zero branches assigned are blocked from org routes.

## Connection Resolution
```javascript
// Platform models → global connection
const { getPlatformConnection } = require("@core/db/dbResolver");

// Org models → per-request connection
const conn = req.dbConnection;        // Set by orgSubscriptionGuard
const Model = getModel(conn, ModelDef);
```

## Key Rules
1. **NEVER** use `mongoose.model()` directly for org-scoped data
2. **ALWAYS** resolve via `getModel(connection, definition)`
3. Platform models use `getPlatformConnection()`
4. Org models use `req.dbConnection`
5. No `organizationId` filtering needed — DB isolation handles it

## Model Registration Pattern
```javascript
module.exports = {
    modelName: "Patient",
    schema: patientSchema,
    default: mongoose.models["Patient"] || mongoose.model("Patient", patientSchema),
};
```

## Dependencies
- [[DBConnectionManager]] — Connection pooling + lifecycle
- [[AuthMiddleware]] — Sets `req.dbConnection` via org resolution
- [[SecurityArchitecture]] — Defense-in-depth RLS (optional in per-org mode)

## Migration History
| Version | Mode | Status |
|---------|------|--------|
| v1-v3 | Shared DB + RLS filtering | Deprecated |
| v4+ | Per-org DB + optional RLS | **Active** |

## Risks
- Connection pooling overhead for many organizations
- Schema migration must run per-database

## Status
**STABLE** — All org data fully isolated

---
#architecture #multitenancy #database #isolation
