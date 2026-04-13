# billingDomain — Clinic Finance Engine
**Location:** `backend/src/modules/billingDomain/`
**Plane:** Organization (ORG) only
**Version:** 4.0.0

---

## 🎯 PURPOSE

`billingDomain` is the **Clinic Finance Engine** — the authoritative write-side domain for all **patient-facing financial transactions** within an organization.

It handles every money movement between the clinic and its patients.

---

## 🧱 WHAT THIS DOMAIN OWNS

| Sub-domain | Responsibility |
|---|---|
| `organizationFinance/` | Patient Invoices, Payments, Wallet |
| `analytics/` | Revenue summaries, outstanding balances (READ MODEL) |
| `projections/snapshot/` | CQRS projections: FinancialSnapshot, EventLedger |
| `projections/printViews/` | Invoice/payment DTOs for print/export |
| `services/` | Double-Entry Journal factory, Ledger query |
| `refunds/` | Refund lifecycle and validation |
| `guards/` | Circuit breaker (financial resilience) |
| `integrity/` | Reconciliation, integrity checks, drift alerts |
| `resilience/` | Journal retry worker |
| `jobs/` | Scheduled reconciliation |

---

## 🔐 PERMISSIONS USED BY THIS DOMAIN

```
invoices.read    / invoices.create  / invoices.update  / invoices.delete
payments.read    / payments.create  / payments.update  / payments.delete
refunds.read     / refunds.create
ledger.read
accounting.read  ← for analytics/summary endpoints only
```

---

## 🚨 CRITICAL NAMING DISTINCTION

### ❌ DO NOT CONFUSE WITH:

| Term | Context | Domain |
|---|---|---|
| `billingDomain` | **Clinic Finance** (patient invoices/payments) | THIS MODULE |
| `billing` / `billing.read` | **SaaS Subscription** (org's own plan/subscription) | `settingsBilling.routes.js` via bridge |
| `accountingDomain` | **Analytics Layer** (reports, P&L) | FUTURE: `modules/accountingDomain/` |

### ❌ NEVER use `billing.read` to guard clinic finance analytics
### ✅ ALWAYS use `accounting.read` for `/api/v1/org/finance/*` endpoints

---

## 🌐 API SURFACE

```
GET  /api/v1/org/invoices          → invoices.read
POST /api/v1/org/invoices          → invoices.create
POST /api/v1/org/payments          → payments.create
POST /api/v1/org/refunds           → refunds.create
GET  /api/v1/org/finance/*         → accounting.read  (analytics endpoints)
```

---

## 🔗 PLANE ENFORCEMENT

- **This module is ORG PLANE only.**
- Platform billing is at `platform/billing/` — completely separate plane.
- Cross-plane imports are **FORBIDDEN** and trigger a boot-time validator violation.

---

## 🧾 ARCHITECTURAL INVARIANTS

1. Patient invoices NEVER touch platform billing models.
2. Platform billing NEVER reads patient payment records.
3. Ledger operations are always transactional (MongoDB sessions).
4. `organizationId` ALWAYS comes from JWT context — NEVER from payload.
5. All aggregation queries use `secureModel` (RLS-enforced).
6. `JournalEntries` are IMMUTABLE (no updates or deletes).
7. Every journal entry MUST balance (`totalDebit === totalCredit`).
8. `accounting.read` is the ONLY permission for analytics endpoints — `billing.read` is **forbidden** here.
