# Auth System

## Purpose
Validate JWTs and establish user context across all 4 planes.

## Identity Models
| Plane | Model | Token Type | DB |
|-------|-------|-----------|-----|
| Platform | `PlatformUser` | PlatformJWT | Platform |
| Organization | `User` | OrgJWT | Per-org |
| Supervisor | `Supervisor` | SupervisorJWT | Platform |
| Patient Portal | `PatientUser` | PatientJWT | Per-org |

## Auth Flow
```
Client → Authorization: Bearer <JWT>
  ↓
AuthMiddleware (verifyByType) → decode token type (no signature check)
  ↓
1. If type === "organization" → verify with JWT_ORG_SECRET
2. If type === "platform"     → verify with JWT_PLATFORM_SECRET
3. If unknown type            → reject (401)
4. (Migration fallback)       → if specific secret fails, try legacy JWT_SECRET (logged)
  ↓
Plane-specific handler:
  Platform   → verify PlatformUser, set req.platformUser
  Org        → verify User, set req.user, req.organizationId, req.dbConnection
  Supervisor → verify Supervisor, set req.supervisor
  Portal     → verify PatientUser, set req.user (type: "patient")
```

## Middleware Chain (Org Plane)
```
authenticate → orgSubscriptionGuard → entitlementResolver → route handler
```

## Key Files
| File | Purpose |
|------|---------|
| `backend/src/middleware/authenticate.js` | JWT validation + plane routing |
| `backend/src/middleware/orgSubscriptionGuard.js` | Org status + DB connection |
| `backend/src/middleware/requireEntitlement.js` | Module access gating |
| `backend/src/middleware/limitGuard.js` | Seat limit enforcement |
| `backend/src/core/auth/` | Token generation, refresh, magic links |

## Token Structure
```javascript
// Org JWT payload
{
  userId: ObjectId,
  organizationId: ObjectId,
  roleId: ObjectId,
  type: "org",
  tokenVersion: Number
}
```

## Session Invalidation
- `tokenVersion` field on User model
- Increment on: password change, force logout, deactivation
- JWT validation checks version match

## Dependencies
- [[DatabaseIsolation]] — req.dbConnection resolution
- [[SecurityArchitecture]] — RBAC after auth
- [[EntitlementSystem]] — capabilities injection

## Status
**ACTIVE** — Multi-plane auth fully operational

---
#auth #jwt #middleware #security
