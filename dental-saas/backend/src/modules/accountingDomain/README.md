# accountingDomain — Analytics & Intelligence Layer
**Location:** `backend/src/modules/accountingDomain/` *(PROPOSED — TDS v1.0)*
**Plane:** Organization (ORG) only
**Status:** PLANNED (Phase 2 of TDS v1.0)

---

## 🎯 PURPOSE

`accountingDomain` is the **Analytical Projection Layer** — the authoritative read-side domain for all financial reporting, dashboards, and business intelligence.

It derives all its data from event streams emitted by other domains. It **NEVER** writes financial transactions.

---

## 🧠 CORE PRINCIPLE

```
Finance = WRITE  →  billingDomain
Accounting = READ →  accountingDomain
```

All data flows from `billingDomain` → eventBus → `accountingDomain` projections.

---

## 🧱 WHAT THIS DOMAIN WILL OWN

| Sub-domain | Responsibility |
|---|---|
| `projections/` | RevenueSummary, ExpenseSummary, ProfitLoss, CashFlow |
| `services/` | Revenue aggregation, expense tracking, P&L calculation |
| `routes/` | Analytics endpoints, report generation |
| `listeners/` | Event bus consumers (finance, inventory, lab) |

---

## 🔗 DATA SOURCES (Event-Driven)

```
billingDomain   → invoice.created, payment.received, refund.processed
inventoryDomain → inventory.purchase.created
labDomain       → lab.case.completed
```

**Forbidden:** Direct service imports from `billingDomain`.
**Required:** All data received via `eventBus` only.

---

## 🔐 PERMISSIONS

```
accounting.read     → View all finance analytics and summaries
accounting.reports  → Generate and export reports
accounting.analytics → Advanced dashboard access
```

---

## 🚨 CRITICAL NAMING DISTINCTION

| Term | Context |
|---|---|
| `accountingDomain` | **THIS MODULE** — Analytics/Reports |
| `billingDomain` | Clinic Finance (invoices/payments) — write side |
| `billing.read` | SaaS Subscription permission — **NOT related to this domain** |

---

## 🧾 ARCHITECTURAL INVARIANTS

1. `accountingDomain` MUST NOT import `billingDomain` services directly.
2. `accountingDomain` MUST NOT perform any write operations on invoice/payment models.
3. All data consumed via `eventBus` — no direct DB cross-queries.
4. Projections are **append-only** — derived state only.
5. Uses `accounting.read` permission — never `billing.read`.
