# Domain Naming Enforcement (Finance/Billing)
**Status:** ACTIVE (Rules Engine v5.0)
**Version:** 1.0
**Date:** 2026-03-30

---

## 🚨 CORE PROBLEM

The word **"billing"** has two distinct meanings in this system that must never be confused:

| Term | What it means |
|---|---|
| `billingDomain` | Clinic Finance Engine (patient invoices, payments, ledger) |
| `billing.read` | SaaS Subscription Access (org's own plan/usage) |

This causes **cognitive confusion**, **incorrect permission usage**, and **architectural drift** when not enforced.

---

## 📖 CANONICAL DEFINITIONS

### `billingDomain` = Clinic Finance Engine
- Patient Invoices, Payments, Refunds, Ledger
- **Analytics permission:** `accounting.read`
- **NEVER uses:** `billing.read`

### `billing.read` = SaaS Subscription Only
- Org views its own SaaS plan, invoices, and usage quotas
- **Route:** `settingsBilling.routes.js`
- **NEVER in:** `/org/finance/*` routes

### `accountingDomain` = Analytics Layer (Planned)
- Revenue reports, P&L, dashboards
- **Permission:** `accounting.read`

---

## ✅ VALIDATION STATUS (2026-03-30)

| Check | Status |
|---|---|
| `billing.read` in finance analytics routes | ✅ NOT PRESENT |
| `accounting.read` in finance analytics routes | ✅ CORRECT |
| `billing.read` in SaaS billing routes | ✅ CORRECT |
| Frontend: `billing.read` gating subscription page | ✅ CORRECT |
| Frontend: `accounting.read` gating clinic finance | ✅ CORRECT |
| `billingDomain/README.md` created | ✅ DONE |
| `accountingDomain/README.md` created | ✅ DONE |
| `docs/domain-glossary.md` created | ✅ DONE |
| `permissionValidator.js` runtime guard created | ✅ DONE |
| Route header comments added | ✅ DONE |
| `orgPermissions.js` BILLING_READ comment fixed | ✅ DONE |

---

## 🔗 Related Files

- `docs/domain-glossary.md` — Full collision matrix
- `backend/src/modules/billingDomain/README.md` — Clinic Finance Engine docs
- `backend/src/modules/accountingDomain/README.md` — Analytics Layer docs
- `backend/src/utils/permissionValidator.js` — Runtime guard
- `backend/src/rbac/orgPermissions.js` — BILLING_READ definition
- `backend/src/modules/billingDomain/analytics/routes/billingAnalytics.routes.js`
- `backend/src/routes/org/settingsBilling.routes.js`
