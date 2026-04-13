# Accounting Domain (Intelligence & Projection)
**Domain:** `accountingDomain`
**Status:** PROPOSED (TDS v1.0)

## 🧱 Overview
The Accounting Domain is the **Analytical Projection Layer** for all financial and operational data. It consumes event streams to build high-performance read models (Projections).

## 🧭 Responsibilities
- **Revenue Summaries:** Daily, monthly, and yearly revenue tracking.
- **Profit & Loss (P&L):** Tracking income vs expenses (from Finance, Inventory, and Labs).
- **Dashboards:** Advanced visualizations and business intelligence.
- **Projections:** Asynchronous, non-blocking models for fast querying.

## 🔐 Security
- `accounting.read`
- `accounting.reports`
- `accounting.analytics`

## 🔗 Integration Layer
- **Consumes:** `financeDomain` (Revenue/Refunds), `inventoryDomain` (Purchases), `labDomain` (Lab Expenses).
- **Forbidden:** No invoice creation or direct ledger writes.
- **Forbidden:** No direct services calls to `financeDomain`.

---

## 🚨 Architectural Rule
> Accounting = **READ** domain. 
> Visual density and query performance are prioritized.
