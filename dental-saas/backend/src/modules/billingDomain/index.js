/**
 * index.js — Billing Domain Boundary Manifest
 * Phase G+C — Billing Domain Restructure + Double-Entry Ledger
 *
 * PURPOSE:
 * Defines the public API surface of the billingDomain module.
 * All cross-domain access to billing functionality MUST go through this index.
 *
 * ── ARCHITECTURE (Post-Phase G) ──────────────────────────────────────────
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  billingDomain/                      (ORG PLANE ONLY)       │
 *   │  ├── organizationFinance/            Patient Invoice Engine │
 *   │  │   ├── models/                     PatientInvoice, Wallet │
 *   │  │   └── services/                   Invoice, Ledger, Stat  │
 *   │  ├── models/                        Domain models          │
 *   │  │   └── JournalEntry.model.js      Double-entry journal    │
 *   │  ├── constants/                     Shared constants        │
 *   │  │   └── accounts.js                Chart of accounts       │
 *   │  ├── services/                      Domain services         │
 *   │  │   ├── journal.service.js         Journal entry factory   │
 *   │  │   └── ledger.query.service.js    Read-side queries (RLS) │
 *   │  ├── routes/                        Consolidated routes     │
 *   │  │   ├── invoices.routes.js         /api/v1/org/invoices    │
 *   │  │   └── payments.routes.js         /api/v1/org/payments    │
 *   │  ├── analytics/                     Billing Analytics (RM)  │
 *   │  │   ├── routes/billingAnalytics.routes.js                  │
 *   │  │   └── services/billingSummary.service.js  (RLS-compliant)│
 *   │  ├── projections/                   CQRS Read Models        │
 *   │  │   ├── snapshot/                  Event-sourced snapshots │
 *   │  │   │   ├── FinancialSnapshot.model.js                     │
 *   │  │   │   ├── FinancialEventLedger.model.js                  │
 *   │  │   │   └── financialSnapshot.subscriber.js                │
 *   │  │   └── printViews/                Invoice/payment DTOs    │
 *   │  │       └── financial.projection.js                        │
 *   │  └── validators/                    Request validation      │
 *   └──────────────────────────────────────────────────────────────┘
 *
 *   Platform billing is at: platform/billing/ (SEPARATE PLANE)
 *
 * ── INVARIANTS ──────────────────────────────────────────────────────────
 * 1. Patient invoices NEVER touch platform billing models
 * 2. Platform billing NEVER reads patient payment records
 * 3. Ledger operations are always transactional (MongoDB sessions)
 * 4. organizationId comes from JWT context — never from payload
 * 5. All aggregation queries use secureModel (RLS-enforced)
 * 6. Events use canonical domainEvents constants (no raw strings)
 * 7. JournalEntries are IMMUTABLE (cannot be updated or deleted)
 * 8. Every journal entry MUST balance (totalDebit === totalCredit)
 *
 * ── SPLIT HISTORY ───────────────────────────────────────────────────────
 * Phase G: financeDomain → billingDomain/analytics/ (read model normalization)
 *          financialDomain → billingDomain/projections/snapshot/ (CQRS projection)
 *          invoices/, payments/ → billingDomain/routes/ (shell elimination)
 *          billingDomain/services/ (platform) → platform/billing/ (plane isolation)
 *
 * PLANE: Org-plane ONLY. Platform billing is at platform/billing/.
 */

"use strict";

// ── Organization Finance (Patient-Facing Billing) ───────────────────────────

const invoiceService = require("./organizationFinance/services/invoice.service");
const invoiceStatusService = require("./organizationFinance/services/invoiceStatus.service");
const ledgerOrchestrator = require("./organizationFinance/services/ledger.orchestrator.service");
const clinicLedger = require("./organizationFinance/services/clinicLedger.service");

// ── Billing Analytics (Read Model — formerly financeDomain) ─────────────────

const billingSummaryService = require("./analytics/services/billingSummary.service");

// ── Financial Projections (Read Model — formerly financialDomain) ────────────

const financialProjection = require("./projections/printViews/financial.projection");

// ── Double-Entry Ledger (Phase C — Accounting Layer) ────────────────────────

const journalService = require("./services/journal.service");
const ledgerQueryService = require("./services/ledger.query.service");
const { ACCOUNTS, ACCOUNT_META } = require("./constants/accounts");

// ── Public API Surface ──────────────────────────────────────────────────────

module.exports = {
    // Patient Invoice Engine (ORG PLANE)
    invoiceService,
    invoiceStatusService,
    ledgerOrchestrator,
    clinicLedger,

    // Read Models
    billingSummaryService,
    financialProjection,

    // Double-Entry Ledger (Phase C)
    journalService,
    ledgerQueryService,
    ACCOUNTS,
    ACCOUNT_META,

    // Refund Engine (Phase D)
    refundService: require("./refunds/refund.service"),

    // Ledger Hardening
    financialCircuit: require("./guards/financialCircuit.guard"),
    reconciliationService: require("./integrity/reconciliation.service"),
    integrityChecker: require("./integrity/integrityChecker.service"),
    driftAlertService: require("./integrity/driftAlert.service"),
    reconciliationJob: require("./jobs/reconciliation.job"),
    journalRetryWorker: require("./resilience/journalRetry.worker"),

    // Metadata
    DOMAIN: "billing",
    VERSION: "4.0.0",
    PLANE: "organization",
    BOUNDED_CONTEXTS: [
        "organizationFinance",
        "billingAnalytics",
        "financialProjections",
        "doubleEntryLedger",
        "refunds",
        "ledgerHardening",
    ],
};
