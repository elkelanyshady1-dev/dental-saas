# Finance Domain Consolidation — Phase 1 Complete
**Status:** DONE
**Completed:** 2026-03-30
**Type:** Architectural Remediation (Phase G)

---

## 🎯 Objective
Eliminate architectural drift by consolidating 4 fragmented finance-related modules into the canonical `billingDomain`.

---

## ✅ Modules Deleted

| Module | Contents | Migration Target |
|---|---|---|
| `modules/financeDomain/` | `routes/finance.routes.js` (unmounted orphan), `services/financeSummary.service.js` (duplicate) | `billingDomain/analytics/` already had canonical equivalent |
| `modules/financialDomain/` | `models/FinancialSnapshot.model.js`, `models/FinancialEventLedger.model.js`, `subscribers/financialSnapshot.subscriber.js` | Already migrated to `billingDomain/projections/snapshot/` |
| `modules/invoices/` | `routes/invoices.routes.js` (unmounted orphan), `validators/` | Routes already in `billingDomain/routes/invoices.routes.js` |
| `modules/payments/` | `routes/payments.routes.js` (unmounted orphan), `validators/` | Routes already in `billingDomain/routes/payments.routes.js` |

---

## 🔧 Broken Imports Fixed

| File | Old Broken Path | Fixed To |
|---|---|---|
| `projections/financial/financial.projection.js` | `financeDomain/organizationFinance/models/*` | `billingDomain/organizationFinance/models/*` |
| `projections/financial/financial.projection.js` | `financeDomain/projections/snapshot/FinancialSnapshot.model` | `billingDomain/projections/snapshot/FinancialSnapshot.model` |
| `projections/caseMargin.projection.js` | `financeDomain/projections/snapshot/FinancialSnapshot.model` | `billingDomain/projections/snapshot/FinancialSnapshot.model` |
| `modules/analyticsDomain/projections/risk.projection.js` | `financeDomain/projections/snapshot/FinancialSnapshot.model` | `billingDomain/projections/snapshot/FinancialSnapshot.model` |

---

## 🔧 Governance Updated

- `validateCrossPlaneIsolation.js` — Removed `financialDomain` from both classification regexes (module deleted)

---

## 🏗️ Canonical Source of Truth

```
modules/billingDomain/
├── organizationFinance/models/   ← PatientInvoice, PatientPayment, PaymentAllocation, Wallet
├── routes/                       ← invoices.routes.js, payments.routes.js
├── analytics/                    ← billingSummary.service.js (replaces financeSummary.service)
│   └── routes/                   ← billingAnalytics.routes.js (ACCOUNTING_READ guard)
└── projections/
    ├── snapshot/                 ← FinancialSnapshot, FinancialEventLedger, subscriber
    └── printViews/               ← financial.projection.js (invoice/payment DTOs)
```
