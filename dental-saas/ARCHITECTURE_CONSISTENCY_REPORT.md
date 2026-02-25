# Architecture Consistency Report

**Date:** February 2026
**Target:** DentalSaaS Multi-Organization Platform

This report is the result of a comprehensive CTO-level code analysis comparing the documented architecture against the actual implemented system.

---

## 🟢 1. What Matches & Is Implemented Correctly

### 1.1 Multi-Tenant & Branch Isolation
- **Verified:** Secure tenant separation is strictly enforced.
- **Mechanism:** `req.organizationId` is injected purely from the verified JWT in `authMiddleware.js`.
- **Protection:** All controllers actively strip `req.body.organizationId` from client payloads. Queries enforce `.find({ organizationId: req.organizationId })`.
- **Branching:** The `Appointment` model correctly requires both `organizationId` and `branchId`. `Patient` ties strictly to the organization (with `firstVisitBranchId` for tracking).

### 1.2 Authentication & Security
- **Verified:** Proper execution of `tokenVersion` security logic. Invalidating a token natively drops all active sessions without requiring distributed cache blacklists.
- **Verified:** Strict separation between `Platform` (`/api/platform`) and `Organization` (`/api/app`) route contexts.
- **Verified:** Dynamic RBAC building. `authMiddleware` converts complex role objects into a flat O(1) `permissionSet` (e.g., `patients.read`), which `authorizePermission` checks instantly.

### 1.3 Subscription & Trial Engine
- **Verified:** `subscriptionGuard.js` correctly evaluates `trialEndsAt` and `currentPeriodEnd`.
- **Verified:** A robust `gracePeriodDays` mechanism gracefully degrades functionality instead of hard-locking immediately, supported by `emailService` notifications.
- **Verified:** Module gating (`requireFeature` middleware) prevents users from bypassing tiered subscription paywalls at the route level.

### 1.4 Scalability Architecture (Background Jobs)
- **Verified:** The system excellently handles horizontally scaled cron jobs. `server.js` binds `node-cron` with a `cronLockService` (Distributed Lock) enforcing leader-election, meaning multiple node instances will not duplicate pending invoice runs or subscription telemetry sweeps.

---

## 🔴 2. Architectural Drift & Deviations (What Deviates)

### 2.1 Service Layer Purity Violation (Fat Controllers)
- **Documented:** "Controllers must never contain business logic; they only orchestrate."
- **Reality:** Almost all business logic lives directly inside controllers (`patientController.js`, `appointmentController.js`, `platformOrganizationController.js`).
- **Impact:** There is no `patientService.js` or `appointmentService.js`. Mongoose imports and DB aggregations are hardcoded within controllers, breaking the "Clean Architecture" abstraction. 

### 2.2 Inconsistent Soft-Delete Strategy
- **Documented Requirements:** Models contain `isActive: true` boolean fields to avoid data destruction.
- **Reality:** `patientController.deletePatient` executes `await patient.deleteOne()`. This performs a destructive HARD DELETE, violating audit requirements in medical software. 

### 2.3 File Storage Strategy
- **Reality:** While not explicitly documented previously, file storage (Patient photos) currently relies on local disk storage via Multer mapping to `express.static("/uploads")`. 
- **Risk:** This breaks stateless horizontal scaling. If Node #1 stores the image, Node #2 will return a 404 for that image unless a shared volume exists.

### 2.4 Missing API Versioning
- **Reality:** Routes are mounted directly logically (`/api/platform`, `/api/patients`) but entirely lack version prefixing (`/api/v1/...`).

---

## ⚠️ 3. Risk Assessment & Required Refactoring

1. **High Priority Refactor:** Convert Hard Deletes to Soft Deletes across all operational controllers (Appointments, Patients, Users).
2. **Medium Priority Refactor:** Extract Mongoose logic from massive controllers into `services/` to restore code reusability and decoupling for background/CLI usage.
3. **Infrastructure Update:** Migrate `Multer` localized upload logic to an S3-compatible service bucket to preserve stateless auto-scaling capabilities.
4. **Maintenance:** Pre-emptively namespace routes to `/api/v1` before opening the platform API to third-party dental labs and vendors. 
