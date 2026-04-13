# Auth Middleware

## Purpose
Validate JWT and attach user context to every request.

## Input
- `Authorization: Bearer <JWT>` header

## Output
- `req.user` — decoded user object
- `req.organizationId` — tenant ID
- `req.dbConnection` — per-org DB connection (set by orgSubscriptionGuard)
- `req.platformUser` — platform admin context (platform routes only)

## Flow
```
1. Extract token from Authorization header
2. Verify JWT signature + expiry
3. Detect plane from token payload (org, platform, patient, supervisor)
4. Load user from appropriate DB
5. Check tokenVersion matches (session invalidation)
6. Attach to req object
```

## Error Responses
| Scenario | Code | Error |
|----------|------|-------|
| No token | 401 | `AUTH_TOKEN_MISSING` |
| Expired | 401 | `AUTH_TOKEN_EXPIRED` |
| Invalid | 401 | `AUTH_TOKEN_INVALID` |
| User not found | 401 | `AUTH_USER_NOT_FOUND` |
| Version mismatch | 401 | `AUTH_SESSION_REVOKED` |

## File
`backend/src/middleware/authenticate.js`

## Dependencies
- [[AuthSystem]]
- [[DatabaseIsolation]] — for user lookup in correct DB

## Issues
- Possible token refresh race condition during concurrent requests

## Status
**ACTIVE**

---
#auth #middleware #backend
