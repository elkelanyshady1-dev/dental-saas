# 🛡️ ORG FINANCE + ACCOUNTING ARCHITECTURE
**Technical Design Specification (TDS v1.0)**

---

## 🧱 1. SYSTEM INTENT
🎯 **Goal**
Establish two clean bounded contexts:
- **financeDomain**     → SOURCE OF TRUTH (transactions)
- **accountingDomain**  → DERIVED INTELLIGENCE (income, expenses, reports)

🧠 **Core Principle**
- **Finance** = WRITE DOMAIN
- **Accounting** = READ / PROJECTION DOMAIN

---

## 🧭 2. DOMAIN BOUNDARIES

### 🟢 2.1 financeDomain (Transactional Core)
**Responsibility:**
- Invoices
- Payments
- Refunds
- Ledger entries (double-entry)
- Financial events (immutable)

**Owns:**
- `PatientInvoice`
- `PatientPayment`
- `JournalEntry`
- `LedgerEvent`
- `Refund`

**MUST NOT:**
- ❌ Perform analytics
- ❌ Aggregate revenue
- ❌ Generate reports

---

### 🔵 2.2 accountingDomain (Analytical Layer)
**Responsibility:**
- Revenue summaries
- Expense tracking
- Profit/Loss
- Financial dashboards
- Cross-domain aggregation

**Consumes data from:**
- `financeDomain` (revenue)
- `inventoryDomain` (purchases)
- `labDomain` (lab expenses)

**Owns:**
- `RevenueSummary`
- `ExpenseSummary`
- `ProfitLossSnapshot`
- `CashFlowProjection`

**MUST NOT:**
- ❌ Create invoices
- ❌ Process payments
- ❌ Modify ledger

---

## 🔗 3. DOMAIN INTERACTION MODEL

**EVENT-DRIVEN FLOW (MANDATORY)**
`financeDomain` → emits → `accountingDomain` consumes

**EVENTS (REQUIRED)**
- `invoice.created`
- `payment.received`
- `refund.processed`
- `expense.recorded` (from inventory/lab)

**Example Flow:**
```javascript
// financeDomain
eventBus.emit("payment.received", {
  orgId,
  amount,
  invoiceId,
  timestamp
});

// accountingDomain listener
eventBus.on("payment.received", async (event) => {
  await accountingService.updateRevenue(event);
});
```

---

## 🧱 4. DIRECTORY STRUCTURE

### 📁 financeDomain
`modules/financeDomain/`
- `routes/`
  - `invoices.routes.js`
  - `payments.routes.js`
  - `refunds.routes.js`
- `services/`
  - `invoice.service.js`
  - `payment.service.js`
  - `ledger.service.js`
- `models/`
  - `PatientInvoice.model.js`
  - `PatientPayment.model.js`
  - `JournalEntry.model.js`
- `events/`
  - `finance.events.js`

### 📁 accountingDomain
`modules/accountingDomain/`
- `routes/`
  - `reports.routes.js`
  - `profitLoss.routes.js`
- `services/`
  - `accounting.service.js`
  - `revenue.service.js`
  - `expense.service.js`
- `projections/`
  - `RevenueSummary.model.js`
  - `ExpenseSummary.model.js`
  - `ProfitLoss.model.js`
- `listeners/`
  - `finance.listener.js`
  - `inventory.listener.js`
  - `lab.listener.js`

---

## 🔐 5. PERMISSION MODEL

### financeDomain
- `invoices.read`
- `invoices.create`
- `payments.read`
- `payments.create`
- `refunds.create`
- `ledger.read`

### accountingDomain
- `accounting.read`
- `accounting.reports`
- `accounting.analytics`

**🚫 FORBIDDEN**
- `finance.read` ❌
- `billing.read` ❌

---

## ⚙️ 6. API DESIGN

### financeDomain APIs
- `GET    /api/v1/org/invoices`
- `POST   /api/v1/org/invoices`
- `POST   /api/v1/org/payments`
- `POST   /api/v1/org/refunds`

### accountingDomain APIs
- `GET /api/v1/org/accounting/summary`
- `GET /api/v1/org/accounting/profit-loss`
- `GET /api/v1/org/accounting/expenses`
- `GET /api/v1/org/accounting/cashflow`

---

## 🧠 7. DATA FLOW ARCHITECTURE

1. **[User Action]**
2. **financeDomain** (WRITE)
3. **eventBus** (emits event)
4. **accountingDomain** (READ/AGGREGATE)
5. **Projection Models Updated**
6. **Frontend Queries accounting APIs**

---

## 🚨 8. ENFORCEMENT RULES

**❌ FORBIDDEN**
- `accountingDomain` importing `finance` services directly
- `financeDomain` calling `accountingDomain`
- shared mutable state between domains

**✅ REQUIRED**
- event-driven communication
- immutable ledger
- projection-based analytics

---

## 📊 10. SUCCESS CRITERIA
- ✔ Single transactional domain (`financeDomain`)
- ✔ Separate analytical domain (`accountingDomain`)
- ✔ Event-driven updates
- ✔ No cross-domain imports
- ✔ Clean permission model
- ✔ No duplicate routes

---

## 🧾 FINAL LAW
If:
- accounting writes data → ❌ **BLOCK**
- finance aggregates data → ❌ **BLOCK**
- direct coupling exists → ❌ **BLOCK**

Then system violates DDD.
