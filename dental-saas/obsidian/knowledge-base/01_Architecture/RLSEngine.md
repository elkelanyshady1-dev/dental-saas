# RLS Engine

## Purpose
Apply row-level security as defense-in-depth layer on top of per-org DB isolation.

## Architecture
```
Request → AuthMiddleware → orgSubscriptionGuard → req.dbConnection
                                                → req.rls.organizationId
                                                → req.capabilities
```

## Modes
| DB_MODE | RLS Behavior |
|---------|-------------|
| `shared` | **Required** — `secureModel` enforces `organizationId` filtering on every query |
| `hybrid` | Optional — `secureModel` OR connection-bound model allowed |
| `per-org` | **Not required** — DB isolation handles it. `secureModel` is defense-in-depth |

## Components

### secureModel (Deprecated for per-org)
- Wraps Mongoose model with automatic `organizationId` injection
- In per-org mode: optional defense-in-depth layer
- File: `backend/src/core/scoping/secureModel.js`

### queryScoper
- Scopes queries with tenant context
- File: `backend/src/core/scoping/queryScoper.js`

### systemContext
- For background jobs that run outside request context
- Provides organizationId without JWT
- File: `backend/src/core/scoping/systemContext.js`

## Boot Validation
- `RLS_STRICT_BOOT=true` → validates all raw queries at startup
- `rlsValidationEngine` scans codebase for violations
- File: `backend/src/core/security/rlsValidationEngine.js`

## Dependencies
- [[MultiTenancy]]
- [[AuthMiddleware]]
- [[DatabaseIsolation]]

## Status
**PARTIALLY DEPRECATED** — secureModel optional in per-org mode, DB isolation is primary

---
#architecture #rls #security #isolation
