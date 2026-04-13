# AUTHENTICATION SPECIFICATION

**Document Type:** Technical Design Specification (TDS)
**Version:** 1.0
**Generated From:** Repository Audit — March 2026
**Source Files:**
- `backend/src/routes/authRoutes.js`
- `backend/src/organization/controllers/authController.js`
- `backend/src/platform/controllers/platformAuthController.js`
- `backend/src/platform/models/PlatformUser.js`
- `backend/src/organization/models/` (User model)
- `backend/src/middleware/orgProtect.js`
- `backend/src/middleware/platformProtect.js`

---

## SECTION 1 — PURPOSE

The Authentication domain is responsible for establishing and maintaining verified identity for both system planes:

1. **Platform Plane Auth** — Authenticates DentalSaaS internal operators (superadmin, finance, operations, analyst). Governs access to the Platform Control Panel (Admiral/Cockpit UI).
2. **Organization Plane Auth** — Authenticates clinic staff (org_admin, doctor, assistant, receptionist, lab_technician) within their tenant. Governs access to the clinic operations application.

These two planes use **entirely separate** authentication systems. There is zero shared code or state between them. Platform tokens cannot access org routes and vice versa.

---

## SECTION 2 — DOMAIN BOUNDARY

**Owns:**
- JWT token issuance and validation
- Refresh token lifecycle (HTTP-only cookies)
- Session management (create, list, revoke, revoke-all)
- Password management (change, forgot, reset)
- Platform 2FA (TOTP-based) for superadmin accounts
- Magic Link / OTP email flows (via email queue)
- Invite-based platform user onboarding
- Token version management (global session invalidation on password change)

**Receives signals from:**
- HTTP request headers (`Authorization: Bearer <token>`)
- HTTP-only cookies (`refresh_token`, `csrf_token`)
- MongoDB (User/PlatformUser documents for credential validation)
- BullMQ email queue (for magic link and password reset email delivery)

**Emits events to:**
- EventBus: `patient.login.success`, `patient.login.failed` (patient portal auth)
- Audit log entries on: `LOGIN_SUCCESS`, `TOKEN_REFRESH`, `LOGOUT`, `CAPABILITY_DENIED`

**Does NOT own:**
- Role/permission assignment (delegated to RBAC layer)
- Organization status checks (delegated to `subscriptionGuard`)
- Patient portal authentication (handled by `patientAuth.controller.js` as a sub-domain)

---

## SECTION 3 — DATA MODELS

### PlatformUser (Platform Plane)
```
PlatformUser {
  _id              ObjectId
  firstName        String | null
  lastName         String | null
  name             String (required, synced from firstName+lastName via pre-save hook)
  displayName      Virtual — computed from firstName/lastName
  email            String (required, unique index)
  password         String (bcrypt hash, hidden from select, regex-validated)
  role             Enum: superadmin | finance_admin | operations_admin | analyst
  isActive         Boolean (default: true)
  tokenVersion     Number (incremented on password change for global session kill)
  mustChangePassword Boolean
  passwordResetExpires Date

  // 2FA
  twoFactorEnabled            Boolean
  twoFactorSecretEncrypted    String (AES-256-GCM, never sent to client)
  recoveryCodes               Array<{ codeHash, used, usedAt }>
  failed2FAAttempts           Number
  lastFailed2FAAt             Date
  twoFALockedUntil            Date
  trustedIPs                  Array<{ ip, lastUsedAt }>

  // Invite
  inviteToken        String (hashed, never sent to client)
  inviteTokenExpires Date

  // Identity
  profileImage String | null
  phone        String | null
  whatsapp     String | null
  jobTitle     String | null
  department   String | null

  lastLogin    Date | null
  createdAt    Date
  updatedAt    Date
}
```

### User (Organization Plane — Derived from code structure)
```
User {
  _id              ObjectId
  organizationId   ObjectId (ref: Organization, required — tenant isolation)
  name             String
  email            String
  password         String (bcrypt hash)
  roleId           ObjectId (ref: Role)
  branchAccess     Array<ObjectId> (ref: Branch)
  hasFullBranchAccess Boolean
  tokenVersion     Number
  isActive         Boolean
  sessions         Array<{ sessionId, deviceInfo, createdAt, lastUsedAt }>
  createdAt        Date
  updatedAt        Date
}
```

### Session Record (Derived from code structure)
```
Session {
  sessionId     String (UUID)
  deviceInfo    String
  ip            String
  createdAt     Date
  lastUsedAt    Date
  isRevoked     Boolean
}
```

---

## SECTION 4 — SERVICE RESPONSIBILITIES

### Org Auth Controller (`organization/controllers/authController.js`)
- **register** — Creates org users (requires organization context)
- **loginUser** — Validates `clinicCode` + `email` + `password`, issues JWT access token + refresh cookie
- **refresh** — Validates refresh cookie + CSRF token, issues new access token
- **logout** — Revokes current session from session array
- **forgotPassword** — Generates reset token, enqueues password reset email
- **resetPassword** — Validates reset token, updates password, increments `tokenVersion`
- **changePassword** — Validates current password, updates hash, increments `tokenVersion`
- **getSessions** — Returns active session list for authenticated user
- **revokeSession** — Soft-revokes a specific session by ID
- **revokeAllSessions** — Global logout: increments `tokenVersion` to invalidate all existing JWTs

### Platform Auth Controller (`platform/controllers/platformAuthController.js`)
- **login** — Validates email + password for PlatformUser, initiates 2FA if enabled
- **verify2FA** — Validates TOTP code against AES-256-GCM decrypted secret
- **refresh** — Platform token refresh with CSRF pair
- **logout** — Revokes platform session
- **setup2FA** — Generates TOTP secret, encrypts and stores
- **disable2FA** — Removes 2FA configuration
- **getRecoveryCodes** — Returns unhashed recovery codes one-time
- **invite** — Creates invite token for new platform user onboarding
- **acceptInvite** — Validates invite token, allows password setup

---

## SECTION 5 — API CONTRACTS

### Organization Plane Auth (`/api/auth/*`)
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| POST | `/api/auth/register` | Register new org user | None |
| POST | `/api/auth/login` | Login with clinicCode + email + password | Rate limited (5/15min prod) |
| POST | `/api/auth/refresh` | Refresh access token via cookie | CSRF validation |
| POST | `/api/auth/logout` | Revoke current session | `orgProtect` |
| POST | `/api/auth/forgot-password` | Request password reset email | None |
| POST | `/api/auth/reset-password` | Reset password via token | None |
| POST | `/api/auth/change-password` | Change password (authenticated) | `orgProtect` |
| GET  | `/api/auth/sessions` | List active sessions | `orgProtect` |
| POST | `/api/auth/sessions/revoke-all` | Revoke all sessions (global logout) | `orgProtect` |
| POST | `/api/auth/sessions/:id/revoke` | Revoke specific session | `orgProtect` |
| GET  | `/api/auth/profile` | Get authenticated user profile | `orgProtect` |

### Platform Plane Auth (Derived from code structure — `/api/platform/auth/*`)
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| POST | `/api/platform/auth/login` | Platform user login | Rate limited |
| POST | `/api/platform/auth/2fa/verify` | Verify TOTP code | None (stateless 2FA flow) |
| POST | `/api/platform/auth/refresh` | Refresh platform token | CSRF validation |
| POST | `/api/platform/auth/logout` | Platform logout | `platformProtect` |
| GET  | `/api/platform/me` | Get current platform user profile | `platformProtect` |
| POST | `/api/platform/auth/2fa/setup` | Setup 2FA | `platformProtect` |
| POST | `/api/platform/auth/2fa/disable` | Disable 2FA | `platformProtect` |
| POST | `/api/platform/users/invite` | Invite new platform user | `platformProtect` + `MANAGE_PLATFORM_USERS` |
| POST | `/api/platform/auth/invite/accept` | Accept invite and set password | None |

---

## SECTION 6 — SECURITY RULES

- **Plane Isolation:** Platform tokens (`PlatformUser`) cannot authenticate org routes. Org tokens (`User`) cannot authenticate platform routes. Separate middleware stacks: `platformProtect` vs `orgProtect`.
- **Token Version Guard:** `tokenVersion` embedded in JWT. On password change or `revokeAllSessions`, the stored `tokenVersion` is incremented. Any existing JWT with an older `tokenVersion` is rejected — even if it hasn't expired.
- **CSRF Protection:** Refresh endpoints require `x-csrf-token` header matching the `csrf_token` cookie value. This prevents cross-site token refresh attacks.
- **2FA Lockout:** Superadmin accounts lock after multiple failed 2FA attempts. `twoFALockedUntil` is checked before allowing verification.
- **Secret Encryption:** TOTP secrets are encrypted at rest with AES-256-GCM. The raw secret is never persisted in plaintext.
- **Rate Limiting:** Login endpoint: 5 requests/15min (prod), 20/1min (dev). Booking endpoints: 50/5min.
- **Password Validation:** Passwords stored as bcrypt hashes. Schema-level regex enforces that only valid bcrypt hash patterns are stored (`/^\$2[aby]\$\d{2}\$.{53}$/`).
- **HTTP-Only Cookies:** Refresh tokens are set as `HttpOnly; Secure; SameSite=Strict` cookies — inaccessible to JavaScript.
- **clinicCode Resolution:** Login credential resolution includes a `clinicCode` field that maps to an organization slug, preventing cross-tenant credential overlap.

---

## SECTION 7 — EVENTS

| Event | Trigger | Consumer |
|-------|---------|---------|
| `patient.login.success` | Patient portal login succeeds | Audit log, notification engine |
| `patient.login.failed` | Patient portal login fails | Audit log, security monitoring |
| `security.alert` | Suspicious auth activity detected | Notification engine (high priority) |
| `email.magic_link` | Magic link email requested | Email queue worker → SMTP delivery |
| `email.password_reset` | Password reset token generated | Email queue worker → SMTP delivery |

---

## SECTION 8 — INVARIANTS

- `tokenVersion` in a valid JWT must always equal the value stored in the database at validation time.
- Platform users cannot authenticate via org auth routes (`/api/auth/*`).
- `organizationId` is never set from request body — always from validated JWT.
- `clinicCode` must resolve to an active organization at login time.
- The `password` field is always excluded from MongoDB responses (`select: false`).
- TOTP secrets are always encrypted before persistence; decrypted only at verification time.
- A platform user cannot remain in `mustChangePassword: true` state and access non-password-change endpoints.

---

## SECTION 9 — FAILURE CONDITIONS

| Condition | HTTP Status | Message |
|-----------|-------------|---------|
| Invalid credentials | 401 | Unauthorized |
| Account inactive | 401 | Account is disabled |
| Invalid clinicCode | 401 | Organization not found |
| Token expired | 401 | Token expired |
| Invalid token version | 401 | Session invalidated |
| CSRF mismatch | 403 | CSRF validation failed |
| 2FA lockout active | 403 | Account temporarily locked |
| Invalid 2FA code | 401 | Invalid 2FA code |
| Rate limit exceeded | 429 | Too many attempts |
| Missing required field | 400 | Validation error |
| Reset token expired | 400 | Reset token has expired |

---

## SECTION 10 — PERFORMANCE CONSIDERATIONS

- **Indexes:** `PlatformUser.email` (unique). `User.email + organizationId` (composite, for login lookup).
- **Token Validation:** JWT `verify()` is synchronous and O(1). No database lookup required for token signature validation.
- **tokenVersion Check:** Requires single indexed document lookup per request. Cached in process via `req.user` after `orgProtect` middleware.
- **2FA Verification:** TOTP window allows ±1 step (30-second window) to handle clock skew without additional overhead.
- **Session Array:** Stored inline in the User document. For high-session-count users, an array cap or pagination may be required in future (not currently implemented).
- **Bcrypt:** Password comparison uses bcrypt with a cost factor (rounds) set at environment level. Cost factor ≥ 10 recommended for production.
