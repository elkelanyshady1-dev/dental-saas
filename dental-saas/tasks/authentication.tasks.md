# Authentication Tasks
## DentalSaaS v3.2 — Auth Domain — Missing & Incomplete Functionality
**Generated from SpecKit Analysis — 2026-03-12**

---

## LEGEND
- `[ ]` Open / not implemented
- `[~]` Partial / incomplete
- `[x]` Confirmed implemented
- `[!]` Critical security gap

---

## SECURITY ENFORCEMENT

- [x] JWT access token issuance on login
- [x] HTTP-only refresh cookie on login
- [x] CSRF double-submit cookie + header validation on refresh
- [x] tokenVersion OAV — increment on password change
- [x] Region enforcement (regionCode in org tokens)
- [x] Platform role sanitization on org token hydration (v20.2)
- [x] Query token support for GET-only export endpoints (v20.3)
- [x] Rate limiting on login endpoint (prod + dev profiles)
- [ ] **[!] Rate limiting on /register endpoint (missing)**
- [ ] **[!] Rate limiting on /forgot-password endpoint (enumeration risk)**
- [x] Password enumeration prevention in forgot-password (always returns 200)
- [x] bcrypt hash validation on password field (schema validator)
- [x] Superadmin 2FA (TOTP + recovery codes + lockout)
- [ ] **Org-plane 2FA not implemented (staff users have no MFA)**
- [x] Invite-based PlatformUser onboarding (inviteToken)
- [ ] **Invite-based org user onboarding not implemented**
- [ ] **Session fingerprinting (device binding on refresh tokens)**
- [ ] **Anomaly detection on login (geo/device change alert)**
- [x] Trusted IP list for PlatformUser

---

## AUDIT LOGGING

- [x] AuditLog record on CAPABILITY_DENIED
- [~] LOGIN_SUCCESS event — confirm AuditLog record (not just pino log)
- [~] TOKEN_REFRESH event — confirm AuditLog record (not just pino log)
- [~] LOGOUT event — confirm AuditLog record (not just pino log)
- [ ] **Audit log for PASSWORD_RESET_REQUESTED**
- [ ] **Audit log for PASSWORD_RESET_COMPLETED**
- [ ] **Audit log for PASSWORD_CHANGED**
- [ ] **Audit log for SESSION_REVOKED**
- [ ] **Audit log for 2FA_FAILED**
- [ ] **Audit log for 2FA_LOCKED**

---

## SESSION MANAGEMENT

- [x] Single session revocation (revokeSession)
- [x] Revoke all sessions (revokeAllSessions)
- [x] Session listing endpoint (/sessions GET)
- [ ] **Session device info not persisted on RefreshToken (userAgent, ipAddress)**
- [ ] **Session listing should show browser/OS/device parsed metadata**
- [ ] **Automatic session expiry cleanup job (cron to prune expired tokens)**
- [ ] **Session count limit per user (prevent session farming)**

---

## PLATFORM AUTH

- [x] Platform login endpoint
- [x] Platform token type enforcement
- [x] Platform user DB hydration on auth
- [x] 2FA TOTP implementation for Superadmin
- [ ] **Platform token refresh not clearly isolated from org refresh**
- [ ] **PlatformUser invite flow — token expiry + resend endpoint**
- [ ] **Force password change on first login (mustChangePassword enforcement in middleware)**

---

## VALIDATION RULES

- [x] Email uniqueness enforced at DB level
- [ ] **Email format validation missing in auth controller (schema-only)**
- [ ] **Password strength policy not enforced (length, complexity)**
- [ ] **clinicCode lookup validation — invalid code should return same message as wrong password (enumeration prevention)**

---

## TESTS

- [ ] Add unit test: login with correct credentials → tokens issued
- [ ] Add unit test: login with wrong password → 401
- [ ] Add unit test: login with inactive user → 401
- [ ] Add unit test: refresh with valid cookie + CSRF → new token issued
- [ ] Add unit test: refresh with mismatched CSRF → 403
- [ ] Add unit test: tokenVersion mismatch → 401
- [ ] Add unit test: platform token on org route → 403
- [ ] Add unit test: org token on platform route → 403
- [ ] Add unit test: region mismatch → 409
- [ ] Add unit test: query token on POST → rejected
- [ ] Add integration test: full login → refresh → logout cycle
- [ ] Add integration test: password reset full flow
- [ ] Add integration test: revoke-all-sessions invalidates all JWTs
- [ ] Add test: 2FA lockout after N failed attempts (PlatformUser)
- [ ] Add test: rate limiter blocks after threshold

---

## MISSING FEATURES (Per Roadmap)

- [ ] **Social login / SSO integration (not in current plan but noted)**
- [ ] **Magic link login for patient portal (patientPortal — separate auth flow)**
- [ ] **Automatic staff account deactivation after period of inactivity**
