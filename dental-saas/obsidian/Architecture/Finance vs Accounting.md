# Finance vs Accounting Architecture
billingDomain = FINANCE DOMAIN (WRITE SIDE)
**Version:** TDS v1.0
**Core Concept:** Bounded Context Separation (Write vs Read)

| Context | Purpose | Responsibility | Ownership | Modality |
|---------|---------|----------------|-----------|----------|
| **Finance** | Source of Truth | Transactions | Invoices, Payments, Ledger | **WRITE** |
| **Accounting** | Intelligence | Analytics | P&L, Revenue, Reports | **READ** |

## 🧱 Architectural Pattern: Event-Driven Projections

All communication from **Finance** (Transactional) to **Accounting** (Analytical) MUST occur via the `eventBus`.

1. **Finance Domain** performs a mutation (e.g., `Payment.create`).
2. **Finance Domain** emits an event (`payment.received`).
3. **Accounting Domain** listener receives the event.
4. **Accounting Domain** updates its projection models (e.g., `RevenueSummary.update`).

### 🚨 Banned Patterns (Zero-Trust Architectural Violations)
- ❌ **Direct Import:** `AccountingService` importing `FinanceService` to calculate revenue.
- ❌ **Shared Models:** `AccountingDomain` using `PatientInvoice` model directly for queries.
- ❌ **Direct Writes:** `AccountingDomain` updating `PatientInvoice.status`.
- ❌ **Cross-Domain Middleware:** Finance middleware checking Accounting permissions.

## 🔗 Implementation Roadmap
1. Merge duplicates into `financeDomain`.
2. Create `accountingDomain`.
3. Implement `eventBus` for cross-domain updates.
4. Align permissions and frontend routes.
