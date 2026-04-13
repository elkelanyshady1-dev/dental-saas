# DentalSaaS — Domain Glossary
**Version:** 1.0
**Authority:** SpecKit / Cursor Rules Engine v5.0
**Last Updated:** 2026-03-30

---

## 🧾 PURPOSE

This glossary establishes the **canonical naming convention** for all financial and billing-related domains. It exists to prevent semantic collision, permission misuse, and architectural drift.

**This is a HARD GATE document.** Any implementation that contradicts the definitions below must be BLOCKED.

---

## 📖 TERM DEFINITIONS

### 1. `billingDomain`
**Type:** Backend module (`src/modules/billingDomain/`)
**Plane:** Organization
**Semantic:** **Clinic Finance Engine** — patient-facing transactions

| Handles | Does NOT Handle |
|---|---|
| Patient invoices | SaaS subscription data |
| Patient payments | Platform plan details |
| Cash refunds | External billing providers |
| Double-entry ledger | Usage quotas from platform |
| Financial analytics (via analytics/ sub-domain) | |

**Correct permission for analytics:** `accounting.read`
**Wrong permission for analytics:** ~~`billing.read`~~

---

### 2. `billing` / `billing.read` (Permission)
**Type:** RBAC Permission string
**Plane:** Organization → Platform Bridge
**Semantic:** **SaaS Subscription Access** — org's own plan/subscription with the platform

| Used For | NOT Used For |
|---|---|
| `GET /settings/billing/subscription` | Clinic invoice analytics |
| `GET /settings/billing/invoices` (SaaS) | Patient payment reporting |
| `GET /settings/billing/usage` (quota) | Finance dashboard access |

**Route file:** `settingsBilling.routes.js`
**Bridge service:** `orgBillingBridge.service.js`

> ℹ️ `billing.read` is administered by `org_admin` only. It does NOT appear in the doctor/receptionist/assistant role grants.

---

### 3. `accountingDomain`
**Type:** Backend module (`src/modules/accountingDomain/`) — **PLANNED (TDS v1.0)**
**Plane:** Organization
**Semantic:** **Analytics & Intelligence Layer** — derived financial reporting

| Handles | Does NOT Handle |
|---|---|
| Revenue summaries | Invoice creation |
| Profit/Loss reports | Payment processing |
| Expense tracking | Ledger writes |
| Financial dashboards | Raw transactional data |

**Data source:** Event bus from `billingDomain`, `inventoryDomain`, `labDomain`
**Correct permission:** `accounting.read`

---

## 🚨 COLLISION MATRIX

| Term | Often Confused With | WRONG | RIGHT |
|---|---|---|---|
| `billingDomain` | SaaS billing | Using `billing.read` in finance routes | Use `accounting.read` |
| `billing.read` | Clinic analytics | Guarding `/org/finance/*` | Only for `/settings/billing/*` |
| `accounting.read` | SaaS billing | Guarding subscription page | Only for clinic analytics |
| `accountingDomain` | `billingDomain` | Direct service imports | Event bus only |

---

## ✅ CANONICAL PERMISSION MAPPING

```
Clinic Invoice CRUD      →  invoices.*
Clinic Payment CRUD      →  payments.*
Clinic Finance Analytics →  accounting.read
SaaS Subscription Reads  →  billing.read
Ledger Views             →  ledger.read
Refund Operations        →  refunds.*
```

---

## 🔐 ENFORCEMENT RULES (ABSOLUTE)

1. `billing.read` MUST ONLY appear in: `settingsBilling.routes.js`, `BillingPage.jsx`, `Settings.jsx` (for Subscription card), `App.jsx` (settings/billing route)
2. `accounting.read` MUST appear in all `/org/finance/*` route guards
3. `billingDomain` MUST NOT be imported from platform plane modules
4. `accountingDomain` MUST NOT directly import from `billingDomain` services

---

## 📁 FILE REFERENCES

| Domain | Backend Location | Permission |
|---|---|---|
| Clinic Finance Write | `modules/billingDomain/routes/` | `invoices.*`, `payments.*` |
| Clinic Finance Read | `modules/billingDomain/analytics/routes/` | `accounting.read` |
| SaaS Billing | `routes/org/settingsBilling.routes.js` | `billing.read` |
| Analytics Intelligence | `modules/accountingDomain/` *(planned)* | `accounting.read` |
