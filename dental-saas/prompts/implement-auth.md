# Implement Authentication Prompt
## DentalSaaS v3.2 — AI-Assisted Implementation Prompt
**Domain:** Authentication & Session Management
**Classification:** Platform Architecture — Security Critical

---

## CONTEXT

You are building the authentication system for **DentalSaaS**, a multi-tenant dental clinic SaaS platform. The platform has **two strictly isolated identity planes**:

1. **Platform Plane** — SaaS operators (`PlatformUser` model, `platformProtect` middleware)
2. **Organization Plane** — Clinic staff (`User` model, `orgProtect` middleware)

The existing codebase is live in production. You must **never modify** existing working authentication logic. You may only **add** or **harden** specific gaps identified below.

You are operating in **ENTERPRISE DETERMINISTIC GOVERNANCE MODE**. Before writing any code, output the Sentinel Pre-Check.

---

## ARCHITECTURE CONSTRAINTS (MANDATORY)

1. **Platform/Org isolation is absolute.** The org-plane auth flow must never import Platform models. The platform auth flow must never import org-plane models.
2. **tokenVersion OAV is sacred.** Any new security event (new device detected, suspicious login) must increment `tokenVersion` to invalidate all existing JWTs.
3. **CSRF double-submit cookie pattern is mandatory** on all refresh token endpoints.
4. **Audit log entries are required** for every auth event: LOGIN_SUCCESS, TOKEN_REFRESH, LOGOUT, PASSWORD_CHANGED, SESSION_REVOKED.
5. **Rate limiting is required** on all unauthenticated auth endpoints.
6. **bcrypt is the only permitted password hashing algorithm.** Min cost factor: 12.
7. **JWT secrets from environment only** (`process.env.JWT_SECRET`). No hardcoded secrets.
8. **Region enforcement:** Org tokens must carry `regionCode`. Missing or mismatched region → reject.

---

## IMPLEMENTATION TARGET

### Target 1: Add Missing Audit Records

The following auth events fire pino logs but NOT AuditLog DB records. Add AuditLog creation using `auditService.createAuditRecord()`:

```javascript
// Required for each event:
await auditService.createAuditRecord({
  organizationId: user.organizationId || "000000000000000000000000",
  branchId: "000000000000000000000000",  // system when no branch context
  actorId: user._id,
  actorType: "tenant_user",
  action: "LOGIN_SUCCESS",               // or TOKEN_REFRESH, LOGOUT, etc.
  entity: "Session",
  entityId: user._id,
  ipAddress: req.ip,
  userAgent: req.headers["user-agent"],
  correlationId: req.correlationId,
  success: true
});
```

Events to cover:
- `LOGIN_SUCCESS` — in `loginUser` after token issuance
- `TOKEN_REFRESH` — in `refresh` after new token issued
- `LOGOUT` — in `logout` after session revoked
- `PASSWORD_CHANGED` — in `changePassword` after update
- `PASSWORD_RESET_COMPLETED` — in `resetPassword` after update
- `SESSION_REVOKED` — in `revokeSession` and `revokeAllSessions`

### Target 2: Add Rate Limiting to Register and Forgot-Password

Add rate limiters in `app.js` (or via route-level middleware) for:

```javascript
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isProd ? 10 : 100,
  message: "Too many registration attempts from this IP"
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 3 : 20,
  message: "Too many password reset requests from this IP"
});

// Apply:
v1Router.use("/auth/register", registerLimiter);
v1Router.use("/auth/forgot-password", forgotPasswordLimiter);
```

### Target 3: Enforce mustChangePassword in Middleware

After JWT validation in `authMiddleware.js`, add a check for `user.mustChangePassword`. If `true`, return a specific error that the frontend can handle:

```javascript
if (user.mustChangePassword && !req.path.includes("/change-password")) {
  return res.status(403).json({
    success: false,
    error: {
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "You must change your password before continuing."
    }
  });
}
```

This should apply to both org users and platform users. Exclude the `/change-password` and `/auth` paths from this check to prevent infinite loops.

---

## FILE LOCATIONS

| File | Purpose |
|------|---------|
| `backend/src/organization/controllers/authController.js` | Org auth logic |
| `backend/src/middleware/authMiddleware.js` | Core JWT validation |
| `backend/src/middleware/platformProtect.js` | Platform token gating |
| `backend/src/middleware/orgProtect.js` | Org token gating |
| `backend/src/services/auditService.js` | AuditLog creation |
| `backend/src/shared/models/RefreshToken.js` | Session storage |
| `backend/app.js` | Rate limiter mounting |

---

## OUTPUT FORMAT

For each implementation target:
1. Output Sentinel Pre-Check
2. Show exact file diffs (no full rewrites)
3. Confirm audit log fields populated correctly
4. Confirm no cross-plane contamination

---

## TESTING

After implementing, provide:
1. Unit test for each audit event
2. Integration test for rate limiter behavior
3. Unit test for mustChangePassword middleware enforcement
