# Billing Tasks
## DentalSaaS v3.2 — Billing Domain — Missing & Incomplete Functionality
**Generated from SpecKit Analysis — 2026-03-12**

---

## LEGEND
- `[ ]` Open / not implemented
- `[~]` Partial / incomplete
- `[x]` Confirmed implemented
- `[!]` Critical gap / compliance risk

---

## PLATFORM BILLING — STRIPE INTEGRATION

- [x] Stripe webhook endpoint (raw body preserved before express.json())
- [x] Stripe signature verification
- [x] Idempotency check via StripeEvent model
- [x] canonical event processor architecture (v13.0)
- [~] StripeProvider.normalizeToCanonical() — exists but not audited in this sprint
- [x] handleDisputeCreated — idempotent ticket creation
- [x] handlePaymentIntentSucceeded — idempotent PI matching to PlatformInvoice
- [ ] **[!] stripe.webhook.service.js must be deleted (dead code — risk of accidental reactivation)**
- [ ] **Webhook event replay / retry mechanism for failed processing**
- [ ] **Webhook verification failure alerts (monitoring integration)**
- [ ] **paymob provider integration (placeholder in paymentProvider enum)**
- [ ] **paypal provider integration (placeholder in paymentProvider enum)**

---

## PLATFORM BILLING — INVOICE ENGINE

- [x] PlatformInvoice model (authoritative v13.0)
- [x] Dunning fields (retryCount, maxRetries, nextRetryAt, lastRetryAt, failureReason)
- [ ] **Dunning cron job (retry engine not confirmed implemented)**
- [ ] **Invoice PDF generation**
- [ ] **Invoice email delivery on creation/payment**
- [ ] **Invoice void workflow**
- [ ] **Credit note generation after void**
- [ ] **Multi-currency invoice (currencyAtBilling captured but conversion logic?)**

---

## PLATFORM BILLING — SUBSCRIPTION STATE MACHINE

- [x] Subscription status enum (trial | active | suspended | expired | canceled | past_due)
- [x] Trial monitoring service (trialMonitor.service.js)
- [x] Grace period fields (gracePeriodEnd, gracePeriodDays)
- [x] subscriptionGuard middleware enforces access control
- [x] Scheduled plan change fields exist in schema
- [ ] **[!] Trial expiry → expired transition: confirm atomic state change with AuditLog**
- [ ] **Grace period expiry → suspended: confirm cron job exists**
- [ ] **Suspension → re-activation workflow (payment capture → active)**
- [ ] **past_due dunning workflow (retry → suspend flow)**
- [ ] **Cancellation workflow (immediate vs. end-of-period)**
- [ ] **Subscription upgrade atomic pipeline (Activate-Before-Invoice) — verify atomicity**
- [ ] **Subscription downgrade workflow with proration policy**
- [ ] **Refund workflow on downgrade (per NO_PRORATION_POLICY.md)**

---

## PLATFORM BILLING — COMMERCIAL TERMS (OrgContract)

- [x] OrgContract model referenced (currentContractId on Organization)
- [~] Commercial fields migrated from Organization.subscription to OrgContract in Sprint 4
- [ ] **OrgContract plan version immutability (spec says immutable once activated)**
- [ ] **OrgContract regional pricing (billingCountry + billingCurrency lock on first contract)**
- [ ] **Plan catalog (Plan.model.js) public listing endpoint**
- [ ] **Plan version comparison and upgrade simulation**
- [ ] **Commercial override (admin price overrides) — documented in billing KI**

---

## PLATFORM BILLING — MUTATION LEDGER

- [x] SubscriptionMutationRecord model (type, idempotencyKey unique, amountMinor)
- [x] Used in dispute handling (DISPUTE type)
- [ ] **SubscriptionMutationRecord coverage for UPGRADE, DOWNGRADE, CANCEL, ACTIVATE types**
- [ ] **SubscriptionMutationRecord immutability enforcement (no update/delete guards)**
- [ ] **Ledger integrity audit endpoint (platform admin — view full ledger)**

---

## PLATFORM BILLING — DISPUTE MANAGEMENT

- [x] Ticket model (category:dispute, priority:HIGH, slaDeadline:12h)
- [x] Ticket created automatically on charge.dispute.created webhook
- [x] Ticket linked to invoice + mutation record
- [ ] **[!] Dispute response deadline monitoring (SLA enforcement)**
- [ ] **Dispute investigation workflow (status transitions: OPEN → IN_PROGRESS → RESOLVED)**
- [ ] **Dispute evidence submission to Stripe API**
- [ ] **Dispute outcome recording (won/lost)**

---

## ORGANIZATION BILLING — DIAGNOSTIC INVOICES

- [~] `createDiagnosticInvoice(appointmentId)` called on appointment completion (fire-and-forget)
- [ ] **BillingInvoice model schema audit (confirm items, tax, discount, currency fields)**
- [ ] **Diagnostic invoice PDF generation**
- [ ] **Multi-procedure invoice (multiple line items per appointment)**
- [ ] **Diagnostic invoice payment recording (cash, card, bank, insurance)**
- [ ] **Insurance split billing (patient portion + insurance portion)**
- [ ] **Multi-currency payment support (base + foreign + exchange rate)**
- [ ] **Invoice void and credit note**
- [ ] **Patient invoice history endpoint**
- [ ] **Treasury assignment on payment (per roadmap: UserTreasury domain)**

---

## SECURITY ENFORCEMENT

- [x] Stripe raw body preserved for signature verification
- [x] SubscriptionGuard scoped to org routes only (not global)
- [x] Platform capability enforcement on billing routes
- [ ] **[!] Admin billing mutation endpoints need MANAGE_BILLING capability confirmed on all routes**
- [ ] **[!] Stripe WEBHOOK_SECRET rotation procedure documented**
- [ ] **Billing event log sanitization (no PII in BillingEventLog.payload)**

---

## AUDIT LOGGING

- [x] AuditLog on DISPUTE_TICKET_CREATED (within transaction)
- [ ] **AuditLog on INVOICE_CREATED (platform invoices)**
- [ ] **AuditLog on SUBSCRIPTION_ACTIVATED**
- [ ] **AuditLog on SUBSCRIPTION_SUSPENDED**
- [ ] **AuditLog on SUBSCRIPTION_CANCELLED**
- [ ] **AuditLog on REFUND_INITIATED**
- [ ] **AuditLog on TRIAL_EXPIRED**
- [ ] **AuditLog on PLAN_UPGRADE**

---

## OBSERVABILITY

- [x] Queue health endpoint (/admin/queue-health)
- [x] BullBoard queue dashboard (/admin/queues)
- [ ] **Billing-specific Prometheus metrics (invoice count, dispute rate, payment failure rate)**
- [ ] **Alert on high dispute rate threshold**
- [ ] **Alert on failed payment threshold**
- [ ] **BillingEventLog retention policy (TTL index)**

---

## TESTS

- [ ] Add unit test: Stripe signature verification failure → 400
- [ ] Add unit test: Duplicate webhook idempotency → 200 skipped
- [ ] Add unit test: dispute.created → Ticket created with 12h SLA
- [ ] Add unit test: payment_intent.succeeded → PlatformInvoice updated
- [ ] Add unit test: trial expiry → status === "expired"
- [ ] Add unit test: subscriptionGuard blocks suspended org
- [ ] Add unit test: subscriptionGuard allows grace period access
- [ ] Add unit test: createDiagnosticInvoice called on appointment.completed
- [ ] Add unit test: createDiagnosticInvoice NOT called twice (idempotency guard)
- [ ] Add integration test: full subscription lifecycle (trial → active → suspended → reactivated)
- [ ] Add integration test: dispute ticket creation with correlation ID propagation

---

## MISSING FEATURES (Per Roadmap)

- [ ] **Treasury Domain (UserTreasury — per roadmap Phase 4.3)**
  - [ ] openingBalance, collectedPayments[], transferredAmount, closingBalance
  - [ ] End-of-day reconciliation workflow
  - [ ] Transfer to owner/accountant workflow
- [ ] **Deferred Revenue Accounting (for orthodontics/aligners — Phase 13)**
  - [ ] Per-stage revenue recognition
  - [ ] Deferred revenue liability tracking
- [ ] **Insurance Receivables dashboard**
- [ ] **Voucher payment method**
