# Billing System - Grace Access Forensic Audit Report

**Date:** April 12, 2026  
**Scope:** Full forensic audit of the billing pipeline, grace access readiness, and null invoice activation failure  
**System:** DentalSaaS Platform Billing (Node.js / MongoDB / React)

---

## Executive Summary

The billing system is a **hybrid trial-and-billing-driven architecture** with a critical null-safety vulnerability in `contractActivation.service.js` that causes `Cannot read properties of null (_id)` when zero-value contracts are activated. Grace access (`accessType = "grace"`) does **not exist** in any form. The system is **PARTIALLY READY** for grace introduction -- the schema already supports `gracePeriodDays` and a `"grace"` contract status, but the activation pipeline must be patched first.

---

## 1. Current Access Type Detection

### Schema Fields Present (OrgContract.model.js)

| Field | Exists | Type | Default | Purpose |
|-------|--------|------|---------|---------|
| `trialDays` | YES | Number | 0 | Duration of trial period |
| `trialStartDate` | YES | Date | null | Computed at creation |
| `trialEndDate` | YES | Date | null | Computed as `effectiveFrom + trialDays` |
| `gracePeriodDays` | YES | Number | 7 | Dunning grace window |
| `contractStatus` | YES | Enum | -- | Includes `"grace"` as valid state |
| `lockedPrice` | YES | Number | required | Final price at contract signing |
| `dunning` | YES | Sub-doc | null | Retry state with `gracePeriodEndsAt` |

### Schema Fields NOT Present

| Field | Exists | Notes |
|-------|--------|-------|
| `isTrial` | NO | Trial status derived from `trialDays > 0` |
| `trialDaysOverride` | NO | Passed as API param, not stored |
| `isBillable` | NO | Inferred from `lockedPrice > 0` |
| `accessType` | NO | Does not exist anywhere in codebase |
| `finalPrice` | NO | Named `lockedPrice` in schema |
| `contractType` | NO | Origin tracked via `source` field |

### Classification

**[X] Hybrid system (INCONSISTENT)**  
Trial state is implicit (`trialDays > 0`), billing state is price-driven (`lockedPrice === 0` vs `> 0`). There is no unified access type abstraction. The contract status enum includes `"grace"` as a valid state (alongside `active`, `suspended`, etc.), but no code path currently transitions contracts into this state through a grace access flow.

---

## 2. Zero-Value Flow Trace

### Full Path: UI -> Controller -> Orchestrator -> Activation -> Ledger

**Step 1 - UI (ContractBuilderWizard.jsx)**  
The wizard sends `POST /api/platform/contracts/upgrade` with a payload that includes pricing overrides. If `customPriceOverride` is set to 0, or discounts reduce the price to 0, `finalPrice` becomes 0 after the pricing engine computes it.

**Step 2 - Controller (contractUpgrade.controller.js)**  
Passes validated payload to orchestrator's `upgradeSubscription()`.

**Step 3 - Orchestrator (BillingOrchestrator.service.js, lines 528-610)**  
Dedicated zero-value fast-path:
```
if (finalPrice === 0) {
    // Contract created with trialDays: trialDaysOverride ?? 0
    // activateContract called with invoiceId = null, skipInvoiceCheck: true
    // assertZeroValueSafety() runs post-commit
    // Returns { invoiceId: null }
}
```

Invoice creation is **explicitly skipped**. The orchestrator passes `null` as the invoice ID.

**Step 4 - Activation (contractActivation.service.js) -- CRASH POINT**  
When `skipInvoiceCheck: true` is passed, the invoice variable stays `null` (line 141: `let invoice = null`). However, the code proceeds to access `invoice._id` at multiple points without null guards, causing:

```
TypeError: Cannot read properties of null (reading '_id')
```

**Step 5 - Ledger (LedgerEngine.service.js)**  
Never reached for zero-value contracts because activation crashes first. If it were reached, the ledger engine accepts `amount: 0` entries without any guard.

---

## 3. Activation Service -- Null Invoice Safety Audit

**File:** `contractActivation.service.js`

### ROOT CAUSE IDENTIFIED: 5 Unsafe `invoice._id` Access Points

| Line | Code | Severity | Context |
|------|------|----------|---------|
| **264** | `contract.activatingInvoiceId = invoice._id` | CRITICAL | Direct assignment from null |
| **295** | `if (!invoice.contractId)` | CRITICAL | Guard itself crashes on null |
| **373** | `invoiceId: invoice._id` (logger.info) | CRITICAL | Logging fails |
| **396** | `activatingInvoiceId: invoice._id` (auditService) | HIGH | Deferred but still crashes |
| **459** | `invoiceId: invoice._id` (writeLedgerEntry) | HIGH | Ledger write fails |

### Safe Patterns Already in the File

Line 203 uses a correct pattern: `if (invoice && String(invoice.organizationId) !== ...)` -- this proves the developer was aware of potential null but missed subsequent access points.

### Verdict: **NOT SAFE (current crash)**

### Required Fixes

```javascript
// Line 264:
contract.activatingInvoiceId = invoice?._id || null;

// Line 295:
if (invoice && !invoice.contractId) {

// Line 373:
invoiceId: invoice?._id || null,

// Line 396 (in setImmediate):
activatingInvoiceId: invoice?._id || null,

// Line 459 (in setImmediate):
invoiceId: invoice?._id || null,
```

---

## 4. Trial System Analysis

### trialDaysOverride Flow

**UI Entry Point:** `ContractBuilderWizard.jsx`, Step 2 (Configure), lines 289-304

```jsx
<input
    id="trial-days-override"
    type="number"
    min="0"
    max="365"
    value={config.trialDaysOverride ?? ''}
    placeholder={`Plan default: ${selectedPlan?.trialDays ?? 0} days`}
    onChange={e => onChange('trialDaysOverride', e.target.value ? Number(e.target.value) : null)}
/>
```

**State:** `config.trialDaysOverride` (initialized as `null`)

### Validation Assessment

| Check | Result |
|-------|--------|
| HTML `min` attribute | 0 |
| HTML `max` attribute | 365 |
| Backend Zod validation | Not confirmed (needs verification) |
| Type coercion | `Number()` or `null` |
| Max limit enforced server-side? | Unknown -- needs backend validation trace |

### Classification: **[?] HTML-only validation (danger if no backend validation)**

The HTML `max="365"` is trivially bypassed. Backend Zod schema for the upgrade endpoint must be verified for a `trialDaysOverride` max constraint. If missing, an attacker could pass `trialDaysOverride: 99999`.

### API Payload (lines 725-740)

```javascript
POST /api/platform/contracts/upgrade
{
    organizationId,
    planVersionId,
    billingInterval,
    paymentMethod,
    paymentTerms,
    autoRenew,
    contractStartDate,
    contractEndDate,
    trialDaysOverride,      // number or undefined
    discountPercent,
    discountAmount,
    customPriceOverride,
    couponCode,
    entitlementOverrides,
}
```

---

## 5. Contract Builder UI -- Override Entry Points

### Current UI Override Capabilities

| Field | Present in UI | Bound to State | In API Payload |
|-------|--------------|----------------|----------------|
| `trialDaysOverride` | YES (Step 2) | `config.trialDaysOverride` | YES |
| `discountPercent` | YES (Step 3) | `overrides.discountPercent` | YES |
| `discountAmount` | YES (Step 3) | `overrides.discountAmount` | YES |
| `customPriceOverride` | YES (Step 3) | `overrides.customPriceOverride` | YES |
| `couponCode` | YES (Step 3) | `overrides.couponCode` | YES |
| `entitlementOverrides` | YES (Step 3) | `overrides.entitlementOverrides` | YES |
| `graceDays` | NO | -- | -- |
| `useGrace` | NO | -- | -- |
| `accessType` | NO | -- | -- |

### Classification

**[X] UI supports trial override only**  
**[X] No support for grace override (expected)**  
**[ ] Hidden misuse of trial as grace -- NOT detected**

The trial system is cleanly separated. No evidence of trial fields being misused as a grace mechanism.

---

## 6. Orchestrator Decision Logic

**File:** `BillingOrchestrator.service.js`

### Decision Branching in `upgradeSubscription()` (lines 444-743)

```
1. Pricing computed via pricingEngine
2. Admin discounts applied (discountPercent or discountAmount)
3. finalPrice calculated

IF finalPrice === 0:
    -> Contract created (trialDays: trialDaysOverride ?? 0)
    -> activateContract(contractId, null, actorId, { skipInvoiceCheck: true })
    -> assertZeroValueSafety({ price: 0, invoice: null })
    -> return { invoiceId: null }

IF finalPrice > 0:
    -> Contract created with initialStatus: "pending_payment"
    -> Invoice generated via inv().generateInvoice()
    -> Invoice issued via inv().issueInvoice()
    -> assertUpgradeIntegrity({ contract, invoice, price })
    -> return { invoiceId: invoice._id }
```

### Integrity Guards

The `upgradeIntegrityGuard.js` file provides post-commit assertions:

`assertZeroValueSafety()` (lines 122-149): Validates that zero-value plans have `invoice === null`. Throws if a non-null invoice exists for price 0.

`assertUpgradeIntegrity()` (lines 57-105): Validates paid plans have valid invoices with matching amounts. Tolerance check for price consistency.

### Classification: **[X] Clean branching for zero vs paid, but missing grace abstraction**

The orchestrator has no concept of "grace" access. A future grace path would need to be a third branch alongside zero-value and paid.

---

## 7. Ledger & Billing Safety

### LedgerEngine (LedgerEngine.service.js)

**Zero-value guard:** NONE. The engine accepts `amount: 0` entries:
```javascript
amount: entry.amount || 0,
amountMinor: Math.round((entry.amount || 0) * 100),
```

**Hash-chaining:** Implemented with SHA-256. Each entry links to the previous via `previousHash`. Chain verification available via `verifyChain(orgId)`.

### Reconciliation Checks (billingReconciliation.service.js)

The reconciliation service performs 7 checks including:

- CHECK 6: `ZERO_VALUE_HAS_INVOICE` (CRITICAL) -- detects zero-value contracts that incorrectly have invoices
- Hash chain verification
- Stale pending_payment detection (48-hour window)
- Orphaned invoice detection

### Anomaly Monitor (billingAnomalyMonitor.js)

RULE_2: Detects zero-amount invoices on non-trial contracts and triggers a **billing kill switch**:
```javascript
if (!isTrial && amountMinor === 0) {
    await activateBillingKillSwitch(reason, ...);
}
```

### Classification: **[X] Risk of zero-entry pollution (but detected by reconciliation)**

Ledger entries for zero amounts are written but flagged. No automatic prevention, only detection.

---

## 8. Audit Log Context Integrity

### OrgId "000000000000000000000000" Pattern

This is the **SYSTEM_ACTOR** constant, intentionally used for automated/system operations. Found in:

| File | Usage |
|------|-------|
| `refundProcessor.service.js` | Automated refund processing |
| `checkoutOrchestrator.service.js` | Self-serve actor |
| `canonicalEventProcessor.js` | Webhook event processing |
| `paymentStatusService.js` | Automated payment updates |
| `platformSubscriptionService.js` | System subscriptions |

### Context Preservation

The audit system uses BullMQ with **concurrency: 1** (single-threaded worker) to prevent hash chain splits. OrgId is preserved through the queue:
```javascript
const orgId = data.organizationId ? data.organizationId.toString() : "platform";
```

### Classification: **[X] Context preserved**

The "000000000000000000000000" orgId is intentional (SYSTEM_ACTOR), not corruption. All async audit paths preserve organizationId correctly.

---

## 9. System Risk Classification

### Architecture State: **[X] Hybrid (INCONSISTENT)**

| Aspect | Mechanism | Risk |
|--------|-----------|------|
| Trial detection | Implicit (`trialDays > 0`) | Medium -- no explicit flag |
| Billable detection | Implicit (`lockedPrice > 0`) | Medium -- no explicit flag |
| Zero-value handling | Dedicated fast-path in orchestrator | Low -- clean separation |
| Activation null safety | BROKEN for zero-value | CRITICAL -- crashes |
| Grace period | Dunning-only (`gracePeriodDays`) | Medium -- no access-type grace |
| Contract status | Includes `"grace"` enum value | Low -- ready for use |
| Ledger zero-guard | None (accepts 0) | Low -- detected by reconciliation |

---

## 10. Readiness for Grace System

### VERDICT: **[X] PARTIAL (needs targeted fixes before introduction)**

### What's Already in Place

1. Contract status enum already includes `"grace"` as a valid state
2. `gracePeriodDays` field exists (default: 7) on OrgContract
3. Dunning sub-document supports `gracePeriodEndsAt`
4. BillingSettings has global `gracePeriodDays` configuration
5. Reconciliation and anomaly detection are robust
6. Hash-chained audit trail is solid

### What Must Be Fixed First

**P0 (Blocker):**
1. Patch 5 null-safety bugs in `contractActivation.service.js` (lines 264, 295, 373, 396, 459)
2. Add optional chaining: `invoice?._id || null` at all access points

**P1 (Required for Grace):**
3. Add `accessType` enum to OrgContract schema: `"trial" | "paid" | "grace" | "zero_value"`
4. Add grace-specific fields: `graceStartDate`, `graceEndDate`, `graceReason`
5. Create third orchestrator branch for grace access (alongside zero-value and paid)
6. Add backend Zod validation for `trialDaysOverride` max limit (currently HTML-only `max="365"`)
7. Add `graceDaysOverride` to ContractBuilder UI (Step 2, alongside trial days)

**P2 (Recommended):**
8. Add explicit `isBillable` computed field or virtual to OrgContract
9. Add ledger guard to skip zero-value entries (prevent pollution)
10. Add `accessType` to ledger entries for cleaner audit trail
11. Unify trial/grace/zero-value detection into a single `resolveAccessType()` utility

---

## Appendix A: Key File Locations

| Component | Path |
|-----------|------|
| Contract Model | `backend/src/platform/billing/models/OrgContract.model.js` |
| Invoice Model | `backend/src/platform/billing/models/PlatformInvoice.model.js` |
| Ledger Model | `backend/src/platform/billing/models/BillingLedger.model.js` |
| Orchestrator | `backend/src/platform/billing/orchestrator/BillingOrchestrator.service.js` |
| Activation Service | `backend/src/platform/billing/services/contractActivation.service.js` |
| Contract Engine | `backend/src/platform/billing/services/contractEngine.service.js` |
| Integrity Guard | `backend/src/platform/billing/utils/upgradeIntegrityGuard.js` |
| Ledger Engine | `backend/src/platform/billing/engines/LedgerEngine.service.js` |
| Reconciliation | `backend/src/platform/billing/services/billingReconciliation.service.js` |
| Anomaly Monitor | `backend/src/platform/billing/services/billingAnomalyMonitor.js` |
| Audit Service | `backend/src/services/auditService.js` |
| Audit Worker | `backend/src/infrastructure/workers/auditWorker.js` |
| Contract Builder UI | `frontend/src/platform/contracts/ContractBuilderWizard.jsx` |
| Billing Settings | `backend/src/platform/billing/models/BillingSettings.model.js` |

## Appendix B: Contract Status State Machine

```
draft -> ready -> pending_payment -> active -> grace -> suspended -> terminated
                                  -> active -> expired
                                  -> active -> superseded
         ready -> canceled
         draft -> void
pending_activation -> active (legacy path)
```

## Appendix C: Zero-Value vs Paid Flow Comparison

```
ZERO-VALUE (finalPrice === 0):
  UI -> Controller -> Orchestrator (fast-path)
    -> Contract created (trialDays from override)
    -> activateContract(null invoice, skipInvoiceCheck)
    -> [CRASH at invoice._id access] <-- ROOT CAUSE
    -> assertZeroValueSafety (post-commit)

PAID (finalPrice > 0):
  UI -> Controller -> Orchestrator (full pipeline)
    -> Contract created (pending_payment)
    -> Invoice generated
    -> Invoice issued
    -> assertUpgradeIntegrity (post-commit)
    -> Awaits payment -> paymentApplicationService -> activation
```
