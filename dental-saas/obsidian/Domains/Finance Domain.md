# Finance Domain (Transactional SSOT)
**Domain:** `financeDomain`
**Status:** Canonical (Merging `billingDomain` + legacy `financialDomain`)

## 🧱 Overview
The Finance Domain is the system's **Source of Truth for Transactions**. It handles all mutations related to money moving in or out of the organization.

## 🧭 Responsibilities
- **Invoices:** Creation, modification, and state management of patient invoices.
- **Payments:** Recording payments, splitting across invoices, and handling refunds.
- **Ledger:** Atomic bookkeeping entries for every transaction (Journal Entries).
- **Events:** Emitting immutable financial facts to the rest of the system.

## 🔐 Security
- `invoices.read` / `invoices.create`
- `payments.read` / `payments.create`
- `refunds.create`
- `ledger.read`

## 🔗 Integration Layer
- **Exports:** Financial Events (via EventBus).
- **Forbidden:** No analytics or report generation.
- **Forbidden:** No direct cross-calls to `accountingDomain`.

---

## 🚨 Architectural Rule
> Finance = **WRITE** domain. 
> Integrity is prioritized over querying flexibility.
