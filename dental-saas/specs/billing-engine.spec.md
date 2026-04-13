# BILLING ENGINE SPECIFICATION

**Document Type:** Technical Design Specification (TDS)
**Version:** 1.1
**Generated From:** Repository Audit — March 2026
**Updated From:** Plan Projection Layer implementation (v1.1) — March 2026
**Source Files:**
- `backend/src/platform/billing/engines/SubscriptionEngine.service.js`
- `backend/src/platform/billing/engines/InvoiceEngine.service.js`
- `backend/src/platform/billing/engines/PaymentEngine.service.js`
- `backend/src/platform/billing/engines/LedgerEngine.service.js`
- `backend/src/platform/billing/orchestrator/BillingOrchestrator.service.js`
- `backend/src/platform/billing/models/OrgContract.model.js`
- `backend/src/platform/billing/models/PlatformInvoice.model.js`
- `backend/src/platform/billing/models/BillingLedger.model.js`
- `backend/src/platform/billing/models/LedgerTransaction.model.js`
- `backend/src/platform/billing/models/PaymentAttempt.model.js`
- `backend/src/platform/billing/models/PlanTemplate.model.js`
- `backend/src/platform/billing/models/PlanVersion.model.js`
- `backend/src/platform/billing/routes/platformFinance.routes.js`
- `backend/src/modules/billingDomain/services/stripe.webhook.service.js`
- `backend/src/platform/billing/models/OrganizationEntitlement.model.js`

---

## SECTION 1 — PURPOSE

The Platform Billing Engine is the enterprise financial control system governing the commercial relationship between the DentalSaaS platform and its tenant organizations. It manages:

- **Subscription lifecycle** — plan activation, upgrades, downgrades, renewal, cancellation
- **Invoice generation and lifecycle** — creation, payment, voiding, PDF export
- **Payment processing** — multi-provider adapters (Stripe, Paymob, PayPal, manual)
- **Double-entry ledger** — immutable accounting record of all financial events
- **Contract management** — OrgContract as the commercial agreement binding a plan version to an organization
- **Dunning management** — automated retry and grace period enforcement for failed payments
- **Revenue analytics** — MRR, ARR, churn metrics for platform operators

The billing system is exclusively part of the **Platform Plane**. Org-plane billing (diagnostic invoices, patient financial summaries) is a separate bounded context in the Org Plane (`modules/billingDomain/`).

---

## SECTION 2 — DOMAIN BOUNDARY

**Owns:**
- OrgContract lifecycle (draft → ready → pending_payment → active → grace → suspended → terminated)
- PlatformInvoice lifecycle (draft → open → paid → void → uncollectible)
- Payment processing via provider adapters
- Double-entry ledger recording of all financial events
- Plan catalog (PlanTemplate, PlanVersion) management
- Dunning state management (retry scheduling, grace period, suspension)
- Credit balance tracking per contract
- Revenue snapshot projections
- Organization entitlements (feature flags derived from active plan)

**Receives signals from:**
- Stripe webhook events (payment confirmation, failure, refund)
- Scheduler/cron jobs (renewal trigger, dunning retry, trial expiry)
- Platform operators (manual contract creation, payment application, void actions)
- BillingSettings (retry schedule configuration)

**Emits events to:**
- EventBus: `subscription.plan.changed`, `subscription.addon.added`, `subscription.addon.removed`, `invoice.overdue`
- Email queue: `email.invoice`, `email.refund`
- Organization entitlement updates (activates/deactivates plan features on org)

**Does NOT own:**
- Org-level diagnostic invoices (owned by `services/billingService.js` in org plane)
- Patient financial records (owned by PatientDomain)
- Inventory cost tracking (owned by InventoryDomain)

---

## SECTION 3 — DATA MODELS

### OrgContract
```
OrgContract {
  _id                ObjectId
  organizationId     ObjectId (ref: Organization, required)
  planVersionId      ObjectId (ref: PlanVersion, required — locked at creation)
  planCode           String (denormalized — never updated after creation)
  planVersionTag     String

  contractStatus     Enum: draft | ready | pending_payment | active | grace |
                           suspended | pending_activation | superseded |
                           terminated | expired | canceled | void

  effectiveFrom      Date (required)
  effectiveTo        Date | null (null = open-ended)
  nextBillingDate    Date | null (indexed — equals effectiveTo when set)

  trialDays          Number
  trialStartDate     Date | null
  trialEndDate       Date | null

  lockedPrice        Number (required, min: 0 — price locked at signing)
  currency           String (uppercase ISO 4217)
  billingInterval    Enum: monthly | yearly | biennial

  providerPriceId    String | null (Stripe price_id, Paymob plan ID, etc.)
  paymentProvider    Enum: stripe | paymob | paypal | manual | null
  providerSubscriptionId String | null

  autoRenew          Boolean (default: true)
  salesManaged       Boolean (false = auto-charge; true = invoice-only/manual)
  gracePeriodDays    Number (default: 7)
  creditBalance      Number (running credit total)

  renewalTerms       { inflationPercent, billingInterval }
  pricingOverride    { isCustom, lockedPrice, reason }
  appliedCoupon      { code, discountType, discountValue, validUntil, ... } | null
  scheduledChange    { newPlanVersionId, newPlanCode, effectiveDate, ... } | null
  pricingSnapshot    { regionCode, billingInterval, basePrice, perSeatAddition,
                       discountAmount, taxRate, taxAmount, ... } | null

  salesOwnerId       ObjectId (ref: PlatformUser)
  source             Enum: sales | self_serve | provisioning | null

  activatingInvoiceId   ObjectId (ref: PlatformInvoice)
  supersededById        ObjectId (ref: OrgContract) | null
  supersededAt          Date | null
  previousContractId    ObjectId (ref: OrgContract) | null

  dunning {
    retryCount         Number
    nextRetryAt        Date | null
    gracePeriodEndsAt  Date | null
    suspendedAt        Date | null
    lastFailureReason  String | null
  } | null

  createdBy          ObjectId (ref: PlatformUser, required)
  activatedBy        ObjectId (ref: PlatformUser) | null
  terminatedBy       ObjectId (ref: PlatformUser) | null
  terminatedAt       Date | null
  terminationReason  String | null

  metadata           Map<String, Mixed>
  version            Number (OAV — Optimistic Atomic Version guard)
  createdAt          Date
  updatedAt          Date
}
```

### PlatformInvoice
```
PlatformInvoice {
  _id                ObjectId
  organizationId     ObjectId (ref: Organization)
  contractId         ObjectId (ref: OrgContract)
  invoiceNumber      String (human-readable, unique, sequential)
  status             Enum: draft | open | paid | void | uncollectible
  lineItems          Array<{ description, amount, quantity, total }>
  subtotal           Number
  taxAmount          Number
  total              Number
  currency           String
  dueDate            Date
  paidAt             Date | null
  voidedAt           Date | null
  voidReason         String | null
  billingPeriod      { from: Date, to: Date }
  paymentAttempts    Array<ObjectId> (ref: PaymentAttempt)
  createdBy          ObjectId (ref: PlatformUser)
  createdAt          Date
  updatedAt          Date
}
```

### LedgerTransaction (Double-Entry)
```
LedgerTransaction {
  _id            ObjectId
  eventType      String (e.g. SUBSCRIPTION_PAYMENT, REFUND, CREDIT_APPLIED)
  organizationId ObjectId
  contractId     ObjectId
  invoiceId      ObjectId | null
  entries        Array<{
    accountId    ObjectId (ref: LedgerAccount)
    accountCode  String
    side         Enum: debit | credit
    amount       Number
    currency     String
  }>
  totalAmount    Number
  currency       String
  description    String
  metadata       Object
  createdAt      Date (immutable — no updatedAt)
}
```

### PaymentAttempt
```
PaymentAttempt {
  _id            ObjectId
  organizationId ObjectId
  invoiceId      ObjectId (ref: PlatformInvoice)
  contractId     ObjectId (ref: OrgContract)
  provider       Enum: stripe | paymob | paypal | manual
  providerChargeId String | null
  amount         Number
  currency       String
  status         Enum: initiated | authorized | captured | failed | refunded | disputed
  failureReason  String | null
  attemptedAt    Date
  settledAt      Date | null
  metadata       Object
}
```

### PlanVersion
```
PlanVersion {
  _id              ObjectId
  templateId       ObjectId (ref: PlanTemplate)
  planCode         String (lowercase, unique per template)
  versionTag       String (e.g. "v2.0")
  status           Enum: draft | published | deprecated | archived
  visibility       Enum: public | sales | internal | restricted
  features         Array<String> (feature capability codes)
  limits           Object (e.g. { maxBranches, maxUsers, maxPatients })
  pricing          Array<{
    region         String (ISO country code)
    currency       String
    monthly        Number
    yearly         Number
    biennial       Number | null
    perSeat        Number
  }>
  publishedAt      Date | null
  deprecatedAt     Date | null
  createdBy        ObjectId (ref: PlatformUser)
  createdAt        Date
  updatedAt        Date
}
```

### OrganizationEntitlement
```
OrganizationEntitlement {
  _id              ObjectId
  organizationId   ObjectId (ref: Organization, required, unique)
  contractId       ObjectId (ref: OrgContract)
  planCode         String
  planVersionId    ObjectId
  features         Array<String> (resolved feature set from plan + addons)
  limits           Object
  activeSince      Date
  updatedAt        Date
}
```

---

## SECTION 4 — SERVICE RESPONSIBILITIES

### BillingOrchestrator (`orchestrator/BillingOrchestrator.service.js`)
- Central coordinator — the ONLY entry point for multi-step billing operations
- **activateContract** — Activate-Before-Invoice pattern: activates subscription then generates invoice atomically using MongoDB sessions
- **upgradeContract** — Atomic plan upgrade: creates new contract, supersedes old, generates prorated invoice
- **renewContract** — Handles contract renewal at period end; applies inflation, updates entitlements
- **createContract** — Creates draft contract from plan selection and commercial terms
- **terminateContract** — Terminates active contract with reason, triggers final invoice

### SubscriptionEngine (`engines/SubscriptionEngine.service.js`)
- **activate** — Transitions contract from `pending_payment` / `ready` to `active`, sets `effectiveTo` and `nextBillingDate`
- **suspend** — Transitions to `suspended` during dunning failure
- **terminate** — Transitions to `terminated` with audit trail
- **scheduleChange** — Sets `scheduledChange` sub-document for deferred plan switch at renewal
- **supersede** — Marks old contract as `superseded`, links to new contract via `supersededById`
- **updateEntitlements** — Syncs `OrganizationEntitlement` from active plan features

### InvoiceEngine (`engines/InvoiceEngine.service.js`)
- **generate** — Creates `PlatformInvoice` from contract data with computed line items
- **void** — Transitions invoice to `void` (only from `draft` status)
- **markUncollectible** — Transitions open invoice to `uncollectible` after dunning exhaustion
- **applyPayment** — Records payment, transitions invoice to `paid`, triggers ledger entries
- **generatePdf** — Renders invoice as PDF (Handlebars template + PDF renderer)
- **sequenceNumber** — Generates human-readable sequential invoice number via `InvoiceSequence` model

### PaymentEngine (`engines/PaymentEngine.service.js`)
- **charge** — Initiates charge via configured provider adapter
- **refund** — Initiates refund via provider
- **confirmWebhook** — Processes incoming payment confirmation from webhook
- Provider adapters: Stripe, Paymob, PayPal, Manual (pluggable)

### LedgerEngine (`engines/LedgerEngine.service.js`)
- **record** — Creates a balanced double-entry `LedgerTransaction` for any financial event
- **getBalance** — Computes account balance from ledger entries
- Enforces debit/credit balance invariant before persistence

### StripeWebhookService (`billingDomain/services/stripe.webhook.service.js`)
- Validates Stripe webhook signature (raw body hash)
- Routes events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `invoice.paid`, `customer.subscription.deleted`
- Calls PaymentEngine and BillingOrchestrator based on event type

---

## SECTION 5 — API CONTRACTS

### Platform Finance Routes (`/api/platform/billing/*`)

**Invoices**
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET  | `/api/platform/billing/invoices` | List invoices (paginated, filtered) | `platformProtect` + `VIEW_ORGANIZATIONS` |
| GET  | `/api/platform/billing/invoices/export` | Export invoices as CSV | `platformProtect` + `VIEW_ORGANIZATIONS` |
| GET  | `/api/platform/billing/invoices/:id` | Get invoice detail | `platformProtect` + `VIEW_ORGANIZATIONS` |
| GET  | `/api/platform/billing/invoices/:id/pdf` | Get invoice as PDF (inline or download) | `platformProtect` + `VIEW_ORGANIZATIONS` |
| GET  | `/api/platform/billing/invoices/:id/payments` | List payment attempts for invoice | `platformProtect` + `VIEW_ORGANIZATIONS` |
| GET  | `/api/platform/billing/invoices/:id/public` | Public invoice page (unauthenticated) | None (AUTH_ONLY exception) |
| POST | `/api/platform/billing/invoices/:id/pay` | Apply payment to invoice | `platformProtect` + `MANAGE_SUBSCRIPTIONS` |
| POST | `/api/platform/billing/invoices/:id/void` | Void draft invoice | `platformProtect` + `MANAGE_SUBSCRIPTIONS` |
| POST | `/api/platform/billing/invoices/:id/uncollectible` | Mark invoice uncollectible | `platformProtect` + `MANAGE_SUBSCRIPTIONS` |

**Ledger**
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET  | `/api/platform/billing/ledger` | Read ledger (paginated) | `platformProtect` + `VIEW_AUDIT_LOGS` |
| GET  | `/api/platform/billing/ledger/export` | Export ledger as CSV | `platformProtect` + `VIEW_AUDIT_LOGS` |
| GET  | `/api/platform/billing/ledger/transaction/:id` | Get single ledger transaction | `platformProtect` + `VIEW_AUDIT_LOGS` |

**Payments**
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET  | `/api/platform/billing/payments` | List payment attempts | `platformProtect` + `VIEW_PLATFORM_ANALYTICS` |
| GET  | `/api/platform/billing/payments/export` | Export payments as CSV | `platformProtect` + `VIEW_PLATFORM_ANALYTICS` |

**Revenue & Credits**
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| GET  | `/api/platform/billing/revenue` | Revenue analytics (MRR, ARR, churn) | `platformProtect` + `VIEW_PLATFORM_ANALYTICS` |
| GET  | `/api/platform/billing/organizations/:orgId/credits` | Organization credit balance | `platformProtect` + `VIEW_ORGANIZATIONS` |

### Contract Management (Derived from code structure — `/api/platform/organizations/:orgId/contract/*`)
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| POST | `.../contract` | Create new contract draft | `platformProtect` + `MANAGE_SUBSCRIPTIONS` |
| POST | `.../contract/activate` | Activate draft contract | `platformProtect` + `MANAGE_SUBSCRIPTIONS` |
| POST | `.../contract/upgrade` | Upgrade active contract | `platformProtect` + `MANAGE_SUBSCRIPTIONS` |
| POST | `.../contract/terminate` | Terminate active contract | `platformProtect` + `MANAGE_SUBSCRIPTIONS` |
| GET  | `.../contract/chain` | Get contract supersession chain | `platformProtect` + `VIEW_ORGANIZATIONS` |

### Webhook
| Method | Path | Purpose | Guard |
|--------|------|---------|-------|
| POST | `/api/public/stripe/webhook` | Stripe event webhook | Stripe signature validation (raw body) |

---

## SECTION 6 — SECURITY RULES

- **Platform Plane isolation:** All billing management routes require `platformProtect`. Org-plane users cannot access platform billing routes.
- **Capability-based access:** `VIEW_ORGANIZATIONS` for reading finance data; `MANAGE_SUBSCRIPTIONS` for mutations. Analyst-role users get VIEW only.
- **Immutable ledger:** `LedgerTransaction` records have no `updatedAt` field and no update operations permitted. The ledger is append-only.
- **OAV (Optimistic Atomic Versioning):** `OrgContract.version` is incremented on every save. Concurrent contract mutation attempts fail gracefully via version mismatch.
- **MongoDB sessions:** BillingOrchestrator uses MongoDB sessions for all multi-document atomic operations (contract + invoice creation, upgrade pipeline).
- **Stripe raw body:** Stripe webhook endpoint mounts `express.raw()` before `express.json()` to preserve body integrity for HMAC signature validation.
- **Partial unique indexes:** MongoDB enforces only one `active`, one `pending_payment`, and one `pending_activation` contract per organization at the database level — not just application level.
- **PDF token access:** PDF download endpoint accepts `?token=<JWT>` query parameter as an alternative to `Authorization` header, for browser `window.open()` scenarios. Same validation applies.
- **Credit balance integrity:** Credit balance is tracked on `OrgContract.creditBalance` and reconciled against `LedgerTransaction` entries — not recalculated on every request.

---

## SECTION 7 — EVENTS

| Event | When Emitted | Consumers |
|-------|-------------|-----------|
| `subscription.plan.changed` | Contract upgraded/downgraded | Audit log, email notification to org admin |
| `subscription.addon.added` | Addon activated on org | Entitlement update, audit log |
| `subscription.addon.removed` | Addon deactivated | Entitlement update, audit log |
| `invoice.overdue` | Invoice past due date (dunning trigger) | NotificationEngine ("Invoice Overdue" notification) |
| `email.invoice` | Invoice generated or paid | Email queue → Nodemailer → SMTP |
| `email.refund` | Refund processed | Email queue → Nodemailer → SMTP |

---

## SECTION 8 — INVARIANTS

- Only ONE contract per organization may have `contractStatus = "active"` at any time (partial unique index enforced at DB level).
- Only ONE contract per organization may have `contractStatus = "pending_payment"` at any time.
- `lockedPrice` is set at contract creation and NEVER modified after activation.
- `pricingSnapshot` is write-once; read-only after creation.
- Every double-entry `LedgerTransaction` must balance: sum of debit entries must equal sum of credit entries.
- Invoice `total` must equal the sum of all line item `total` fields.
- A `paid` invoice cannot be voided.
- A `void` invoice cannot transition to `paid`.
- `OrgContract.version` must be incremented on every save (enforced by pre-save hook).
- `effectiveFrom` must be chronologically before `effectiveTo` when `effectiveTo` is not null.
- `dunning.retryCount` must not exceed the configured maximum retry attempts from `BillingSettings`.

---

## SECTION 9 — FAILURE CONDITIONS

| Condition | HTTP Status | Message |
|-----------|-------------|---------|
| Invoice not found | 404 | Invoice not found |
| Cannot void paid invoice | 409 | Invalid state transition |
| Cannot mark active contract uncollectible | 409 | Invalid state transition |
| Duplicate active contract | 409 | Organization already has an active contract |
| Payment provider charge fails | 402 | Payment failed: \<provider reason\> |
| Stripe webhook signature invalid | 400 | Invalid Stripe signature |
| Ledger balance mismatch | 500 | Ledger integrity violation |
| OAV version mismatch | 409 | Contract was modified by another process |
| Invoice number sequence failure | 500 | Could not generate invoice number |
| Invalid plan version | 400 | Plan version not found or not published |
| Organization not found | 404 | Organization not found |

---

## SECTION 10 — PERFORMANCE CONSIDERATIONS

### Indexes (OrgContract)
- `{ organizationId: 1, contractStatus: 1 }` — Active contract lookup per org
- `{ contractStatus: 1, effectiveTo: 1 }` — Renewal engine daily cron (O(log n))
- `{ dunning.nextRetryAt: 1 }` — Dunning processor hourly cron (O(log n))
- `{ dunning.gracePeriodEndsAt: 1 }` — Grace period expiry cron
- `{ contractStatus: 1, trialDays: 1, trialEndDate: 1 }` — Trial activation cron
- `{ supersededById: 1 }, { previousContractId: 1 }` — Contract chain traversal
- **Partial unique indexes** — One active, one pending_payment, one pending_activation per org

### Indexes (PlatformInvoice)
- `{ organizationId: 1, status: 1 }` — Invoice list per org
- `{ organizationId: 1, createdAt: -1 }` — Invoice history
- `{ invoiceNumber: 1 }` (unique) — Invoice number lookup

### Indexes (LedgerTransaction)
- `{ organizationId: 1, createdAt: -1 }` — Ledger list per org
- `{ contractId: 1 }` — Contract-level ledger view
- `{ invoiceId: 1 }` — Invoice-level transaction lookup

### Operational Notes
- **Renewal cron:** Queries `{ contractStatus: "active", effectiveTo: { $lte: now + 1 day } }` — must be index-bound for performance at scale.
- **Dunning cron:** Runs hourly, scanning `dunning.nextRetryAt`. Uses sparse index strategy to avoid scanning non-dunning contracts.
- **CSV export:** Streams response using Node.js `res.write()` pipeline — does not buffer entire result set in memory.
- **PDF generation:** Rendered with Handlebars + PDF library. Consider caching rendered PDFs in object storage for repeated downloads.

---

## SECTION 11 — PLAN PROJECTION LAYER (v1.1)

### Purpose

The Plan Projection Layer is a **read-only transformation service** (`backend/src/platform/billing/services/planProjection.service.js`) that serves as the **single source of truth (SSOT)** for all derived display and routing fields on a `PlanVersion` document.

Prior to this layer, `status` and `visibility` were independently evaluated by every consumer (controllers, frontend components), causing status/visibility mismatches and inconsistent badge logic across the platform and marketing planes.

### Architecture Rule

```
PlanVersion (DB) → planProjection.service.js → Consumers (API / UI)
```

**FORBIDDEN:** Direct `PlanVersion` → UI usage without projection.
**REQUIRED:** All consumers receive projected fields from the service.

### Derived Fields Contract

| Field | Type | Definition |
|-------|------|-----------|
| `isActive` | boolean | `status === "active"` |
| `isDraft` | boolean | `status === "draft"` |
| `isDeprecated` | boolean | `status === "deprecated"` |
| `isPublic` | boolean | `visibility === "public"` |
| `isSales` | boolean | `visibility === "sales"` |
| `isInternal` | boolean | `visibility === "internal"` |
| `isLive` | boolean | `isActive && isPublic` — the ONLY definition of "publicly purchasable" |
| `showInMarketing` | boolean | Identical to `isLive` — authoritative gate for `GET /public/plans` |
| `displayStatus` | string | `LIVE / SALES / INTERNAL / DRAFT / ARCHIVED` — UI badge label |
| `visibilityLabel` | string | `PUBLIC / SALES / INTERNAL` — display string |

### displayStatus Matrix

| status | visibility | displayStatus |
|--------|-----------|---------------|
| active | public | LIVE |
| active | sales | SALES |
| active | internal | INTERNAL |
| draft | any | DRAFT |
| deprecated | any | ARCHIVED |

### Three-Layer Invariant Stack

| Layer | Mechanism | Enforcement |
|-------|-----------|------------|
| **Database** | `PlanVersion.find({ status: "active", visibility: "public" })` | Primary leak prevention |
| **Projection Service** | `showInMarketing = isActive && isPublic` | Authoritative derived gate per version |
| **Runtime Assertion** | CRITICAL log if `showInMarketing && (visibility !== "public" \|\| status !== "active")` | Projection logic self-check |

### Rule 6 — Runtime Invariant Assertion

Every call to `projectPlanVersion()` runs a post-computation assertion:
```js
if (showInMarketing && (visibility !== "public" || status !== "active")) {
    logger.error({ rule: "PROJECTION-INVARIANT-VIOLATION", ... })
}
```
This fires on every projection, ensuring the logic itself can never silently corrupt the marketing feed.

### Consumers

| Consumer | How It Uses the Projection Layer |
|----------|----------------------------------|
| `platformPlanVersion.controller.js` | `listPlanVersions` — runs `projectPlanVersionList()` on every enriched version before the API response |
| `platformPlanVersion.controller.js` | `getPlanVersionById` — runs `projectPlanVersion()` on the single returned version |
| `publicController.js` (`getPublicPlans`) | Uses `projectPlanVersionList()` then filters by `v.showInMarketing === true` as the authoritative gate |
| `PlanCard.jsx` (v3.0) | Pure consumer — reads `displayStatus`, `isActive`, `isDraft`, `isDeprecated` from server; no local derivation |
| `PlansListPage.jsx` (v9.0) | Pure consumer — uses `v.isLive`, `v.isDraft`, `v.isActive`, `v.isDeprecated` for filters and navigation |

### Selective Field-Level Immutability

Active `PlanVersion` documents enforce selective immutability:
- **Locked fields** (contract layer — block changes after activation): pricing, limits, modules, trialDays
- **Mutable fields** (distribution layer): `visibility` — can be changed on active versions via PATCH
- **Basis**: Stripe/Shopify pattern — visibility is not a contract term; it is a distribution channel control

### CI Enforcement — B6 Gate

`scripts/auditSpecFlow.js` enforces 5 sub-gates (B6.1–B6.5) to prevent projection bypass regressions:

| Gate | Pattern Blocked | Scope |
|------|----------------|-------|
| B6.1 | `.status === "active/draft/deprecated"` in plan UI | Plan module frontend files |
| B6.2 | `.visibility === "public/sales/internal"` in plan UI | Plan module frontend files |
| B6.3 | `resolveBadge(` in plan UI | Plan module frontend files |
| B6.4 | `getOverallBadge(` in plan UI | Plan module frontend files |
| B6.5 | `showInMarketing =` computed in plan UI | Plan module frontend files |

Any violation causes a hard CI block with error code `B6:PROJECTION_*`.

### Frontend Implementation (PlanCard v3.0 / PlansListPage v9.0)

**Removed in v3.0/v9.0 (projection bypass patterns):**
- `resolveBadge()` — local badge derivation function
- `getOverallBadge()` — local status × visibility derivation
- `BADGE_CONFIG["active:public"]` style keying
- All `v.status === "active"` / `v.visibility === "public"` string comparisons

**Replaced with:**
- `DISPLAY_STATUS_BADGE` maps server `displayStatus` string directly to CSS class + label
- `getTimelineDotClass(v)` uses `v.isActive`, `v.isDraft`, `v.isDeprecated` (projected booleans)
- All filter counts (`livePublicCount`, `draftCount`) use `v.isLive`, `v.isDraft`
- Navigation logic (`onEditPlan`, `onNewEdition`) uses `v.isActive`, `v.isDraft`

### Source Files

| File | Role |
|------|------|
| `backend/src/platform/billing/services/planProjection.service.js` | Projection service — SSOT |
| `backend/src/platform/billing/controllers/platformPlanVersion.controller.js` | Platform API consumer |
| `backend/src/organization/controllers/publicController.js` | Public API consumer |
| `frontend/src/platform/modules/plans/components/PlanCard.jsx` | UI consumer (v3.0) |
| `frontend/src/platform/modules/plans/PlansListPage.jsx` | UI consumer (v9.0) |
| `scripts/auditSpecFlow.js` | CI enforcement (B6 gate) |
