# Enterprise Architecture — Phase 4, 5, 6, 7 & 8 Shipped

This walkthrough recaps the successful deployment of the Enterprise Billing, Dunning engine, Grace tracking, and Email Delivery systems.

---

## Phase 8: Enterprise Email + Invoice Delivery System
- **Email Service Layer**: Deployed [emailService.js](file:///c:/Clinic%20system%20project/dental-saas/backend/services/emailService.js) supporting dynamic HTML templates for Invoices, Grace periods, Retries, and Suspensions. Generates automated PDF invoice attachments using `pdfkit`. Integrates with the [EmailLog](file:///c:/Clinic%20system%20project/dental-saas/backend/controllers/platformBillingController.js#118-133) schema for full auditable history and idempotency protection against duplicate emails per billing cycle.
- **Transactional Hooks**: Injected non-blocking fail-safe hooks seamlessly into the [scanSubscriptions](file:///c:/Clinic%20system%20project/dental-saas/backend/services/subscriptionMonitor.js#14-262) and [scanPendingInvoices](file:///c:/Clinic%20system%20project/dental-saas/backend/services/subscriptionMonitor.js#263-387) engine flows. If an email dispatch fails, it silently logs but *does not* rollback the core revenue or subscription transactions.
- **UI History Ledger**: Built an 'Email Notification History' datatable within the [OrganizationDetailsPage.jsx](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/OrganizationDetailsPage.jsx) Billing tab highlighting every inbound notification with explicit Sent/Failed tracking.

---

## Phases 15, 16, 17, 18 & 19: Enterprise Proration & Credit Ledger
- **Stateless Proration Engine**: Implemented `prorationService.calculateProration()` to evaluate mid-cycle proportional plan upgrades/downgrades perfectly, outputting `unusedCredit`, `newPlanCharge`, and `finalAmount`.
- **Credit Balance Consumption**: Extended the Mongoose [Organization](file:///c:/Clinic%20system%20project/dental-saas/backend/controllers/platformSubscriptionController.js#295-314) schema to hold `creditBalance`. Transactions (both Cron and Mid-Cycle) safely deduct `finalAmount` from existing credits. If a proration downgrade yields a surplus, it automatically deposits a credit balance.
- **Atomic Change Target**: Added explicit `proration-preview` and `change-plan` handlers to [platformSubscriptionController.js](file:///c:/Clinic%20system%20project/dental-saas/backend/controllers/platformSubscriptionController.js) wrapped identically in Mongoose Sessions to enforce zero double-entry errors. Emits `PRORATION` specific mock invoices.
- **UI Proration Preview**: Extended the [BillingTab](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/OrganizationDetailsPage.jsx#912-1020) view natively with a "Change Plan" select menu triggering an intelligent, rich Preview Modal indicating cost offsets and credit applications before finalizing.

---

## Phases 20, 21 & 22: Distributed Cron Locking & Plan Upgrade Scheduling
- **MongoDB-Based Leader Lock**: Implemented [cronLockService.js](file:///c:/Clinic%20system%20project/dental-saas/backend/services/cronLockService.js) and [CronLock.js](file:///c:/Clinic%20system%20project/dental-saas/backend/models/CronLock.js) to enable multi-instance safe background jobs without needing Redis. Ensures that [scanSubscriptions](file:///c:/Clinic%20system%20project/dental-saas/backend/services/subscriptionMonitor.js#14-262) and [scanPendingInvoices](file:///c:/Clinic%20system%20project/dental-saas/backend/services/subscriptionMonitor.js#263-387) run exactly once globally.
- **Next-Cycle Upgrade Scheduling Engine**: Added `scheduledPlanChange` safely to the Subscription schema natively. Introduced backend route endpoints (`POST /schedule-plan-change`, `DELETE`) to reserve future-date plan swaps at cycle ends.
- **Cron-Injected Scheduling logic**: The atomic renewal transaction now processes waiting `scheduledPlanChange` properties safely before invoking pricing rules.
- **Immediate vs Scheduled Flexibility**: Evolved the Frontend Proration Preview modal to expose dual actions: Administrators can cleanly `Confirm Change` immediately (triggering a Proration calculation) OR `Schedule for Next Cycle` directly.

---

## Phases 23, 24 & 25: Enterprise Revenue Intelligence 📊
- **Strict Ledger-Driven Analytics**: Implemented [revenueIntelligenceService.js](file:///c:/Clinic%20system%20project/dental-saas/backend/services/revenueIntelligenceService.js) applying complex MongoDB Aggregation directly to the [Invoice](file:///c:/Clinic%20system%20project/dental-saas/backend/services/emailService.js#141-162) ledger to perfectly compute `MRR`, `ARR`, and `NRR`. Divorced analytics from fluctuating Subscription state fields.
- **Predictive Forecast Engine**: Simulates 30/60/90-day renewal revenues perfectly respecting Active Scheduled Plan Changes, active inflations, custom overrides, and coupons.
- **Revenue at Risk Detailing**: Computes real-time monetary risk sums specifically isolating organizations in dunning / grace limits / unpaid pending invoices.
- **Dashboard Upgrade**: Restructured [PlatformRevenueDashboard.jsx](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/PlatformRevenueDashboard.jsx) to render executive summary KPIs (ARR, NRR, Churn Rate), dynamic 30/60/90 Forecast blocks, and an intelligent MRR Movement snapshot (New / Expansion / Contraction / Churn) for comprehensive SaaS intelligence.

---

## Phases 2, 3 & 4: Dunning Engine & Transactional Renewals
- **Enterprise Ledger Schema**: Deployed [Invoice.js](file:///c:/Clinic%20system%20project/dental-saas/backend/models/Invoice.js) schema featuring complex pricing state capture (`basePrice`, `inflationApplied`, `couponDiscount`) and dunning fields (`retryCount`, `maxRetries`, `nextRetryAt`). Extended `Organization.subscription` to hold `gracePeriodDays`, `graceEndsAt`, and pricing overrides.
- **Transaction Safety**: Implemented a robust Mongoose transactional boundary inside [subscriptionMonitor.js](file:///c:/Clinic%20system%20project/dental-saas/backend/services/subscriptionMonitor.js) to ensure atomic invoice generation, plan extension, and coupon application.
- **Enterprise Repricing**: Fixed pricing evaluation priority: Base Price -> Custom Pricing -> Inflation -> Coupon logic, enforcing that enterprise inflation executes first.
- **Retry Dunning Daemon**: Added the [scanPendingInvoices()](file:///c:/Clinic%20system%20project/dental-saas/backend/services/subscriptionMonitor.js#263-387) cron job running every 6 hours. Programmatically retries `pending/failed` invoices, honoring max retries and deferring subscription suspension exactly until `graceEndsAt` lapses. Includes granular audit trails (`SUBSCRIPTION_RETRY_EXHAUSTED` vs `SUBSCRIPTION_RETRY_FAILED`).

## Phases 6 & 7: Platform Billing API & Frontend UI
- **API Endpoints**: Added `GET /invoices` and `PATCH /invoices/status` behind `pBillingRead` and `pBillingUpdate` role assignments (mapped to `finance_admin` and `analyst`).
- **Precision Time Sync**: Injected exact `serverNow` into payload structures to ensure perfectly synchronized Grace Period countdowns irrespective of client timezone or browser clocks.
- **Billing Components**: Shipped a dedicated [BillingTab](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/OrganizationDetailsPage.jsx#912-1020) directly into [OrganizationDetailsPage.jsx](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/OrganizationDetailsPage.jsx). Features live, color-coded invoice ledger grids, base price monitoring, and aggressive, cascading red/amber warning banners dynamically triggered by grace limits or Dunning exhaustion.

---

# Enterprise Architecture — Phase 2 & 3 Shipped

This walkthrough recaps the successful deployment of Phase 2 (Analytics & Cron) and Phase 3 (Platform Role-Based Control) of the multi-tenant SaaS architecture for the platform governance layer.

---

## Phase 3: Platform Role-Based Control (Enterprise Mode)

### 1. Robust Server-Side Authorization
- **Model Hardening**: Removed dynamic `permissions` array from [PlatformUser](file:///c:/Clinic%20system%20project/dental-saas/backend/controllers/platformUserController.js#38-46). Roles are now strictly locked to an enum: `["superadmin", "finance_admin", "operations_admin", "analyst"]`.
- **Authorization Guard**: Refactored [authorizePlatformPermission.js](file:///c:/Clinic%20system%20project/dental-saas/backend/middleware/authorizePlatformPermission.js) and [platformRoutes.js](file:///c:/Clinic%20system%20project/dental-saas/backend/routes/platformRoutes.js) to eliminate dynamic user overrides. Replaced ambiguous routing constraints like `"organizations.read"` with hardcoded enterprise strings (`"platform.analytics.organizations"`, `"platform.analytics.revenue"`). Superadmins receive universal access via `*`.
- **Security Protections**: Implemented specific checks in [platformUserController.js](file:///c:/Clinic%20system%20project/dental-saas/backend/controllers/platformUserController.js) to fundamentally prevent superadmin self-demotion or taking a system down by deleting the final superadmin. `GET /users/:id` explicitly blocks unprivileged internal snooping.

### 2. Platform Audit Logic
- **Data Integrity**: Upgraded [AuditLog.js](file:///c:/Clinic%20system%20project/dental-saas/backend/models/AuditLog.js) with `actorId` and `actorType: { enum: ["platform_user", "tenant_user", "system"] }` to cleanly and permanently separate platform administration events from clinic tenant events.
- **Automated Tracking**: Created and installed [platformAuditLogger.js](file:///c:/Clinic%20system%20project/dental-saas/backend/middleware/platformAuditLogger.js) in [app.js](file:///c:/Clinic%20system%20project/dental-saas/backend/app.js) to inherently record any `POST/PUT/PATCH/DELETE` request directed at the core platform infrastructure by a recognized `platformUser`.

### 3. Frontend Enterprise UI Rendering
- **Access Control Utility**: Mapped the backend `roleDefaults` into [PlatformLayout.jsx](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/PlatformLayout.jsx) via [hasPlatformPermission(perm)](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/PlatformLayout.jsx#20-27) to dynamically evaluate Sidebar interactions safely based exclusively on the current fixed role.
- **Clickable Dashboards**: Re-engineered [PlatformUsersPage.jsx](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/PlatformUsersPage.jsx). Eliminated ad-hoc modal editing workflows, shifting to exact enum selections.
- **Dedicated Detailing**: Created [PlatformUserDetailsPage.jsx](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/PlatformUserDetailsPage.jsx) (`/platform/users/:id`), split cleanly into [Overview](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/OrganizationDetailsPage.jsx#202-247) (rendering effective derived role permissions) and an `Audit History` (querying isolated `actorId` tables gracefully).

---

## Phase 2: Platform Revenue & Subscription Automation

### 1. Platform Revenue Analytics
- **Backend**: Implemented `GET /api/platform/analytics/revenue`. 
  - Computes active, projected, and trailing revenue indicators using a hardcoded `PLAN_PRICING` mapping (preventing DB leakage).
- **Frontend**: Shipped [PlatformRevenueDashboard.jsx](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/PlatformRevenueDashboard.jsx).
  - Accessed via the new Sidebar link underneath "Activity Analytics".
  - Features MRR, Projected MRR, expiring org tracking, and a dynamic Recharts pie chart for revenue distribution across plans.

### 2. Automated Subscription Warning System (Cron)
- **Service**: Implemented [subscriptionMonitor.js](file:///c:/Clinic%20system%20project/dental-saas/backend/services/subscriptionMonitor.js) to continuously poll organizations via `computeSubscriptionHealth`.
- **Cron Job**: Hooked up `node-cron` in [server.js](file:///c:/Clinic%20system%20project/dental-saas/backend/server.js) to run daily at midnight.
- **Idempotency**: 
  - **Warnings**: Ensures organizations only get 1 audit warning every 5 days for "Expiring Soon".
  - **Suspension**: Skips suspension if `org.subscription.status === "suspended"`.
  - **Immutability**: Emits `SUBSCRIPTION_AUTO_SUSPENDED` audit logs and executes a soft suspension (`isActive = false`) via `$set` without ever touching dependent branches or models.
- **Frontend Context**: Banners explicitly surface across [OrganizationDetailsPage.jsx](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/OrganizationDetailsPage.jsx) based directly on `org.subscriptionHealth`, cascading visual red/amber blocks before hard UI elements.

### 3. Tenant-Level Clinical Analytics
- **Double Scoping**: Reinforced `organizationId` scoping. For branch-level clinical queries, guarantees `{ organizationId, branchId }` execution.
- **Backend Refactor**: Refitted [getOrganizationAnalytics](file:///c:/Clinic%20system%20project/dental-saas/backend/controllers/platformOrganizationController.js#76-117) and [getBranchAnalytics](file:///c:/Clinic%20system%20project/dental-saas/backend/controllers/platformOrganizationController.js#673-707).
  - Pulls counts natively from `Patient` and `Appointment` models.
  - Exposes an aggregate array for `appointmentsByBranch` in near real-time.
- **Frontend**: Extended [OrganizationDetailsPage](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/OrganizationDetailsPage.jsx#17-201) and [BranchDetailsPage](file:///c:/Clinic%20system%20project/dental-saas/frontend/src/modules/platform/BranchDetailsPage.jsx#7-190) with a bespoke **"Analytics"** tab highlighting cross-month comparisons through bold metric grids and data tables.
