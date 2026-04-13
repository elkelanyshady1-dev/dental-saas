/**
 * index.js — AccountingDomain Public API Surface (v3 — Phase 3.5 Hardened)
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │  accountingDomain/                                    (ORG PLANE ONLY)      │
 * │  ────────────────────────────────────────────────────────────────────────── │
 * │  PURPOSE: Analytical Projection Layer (READ MODEL)                          │
 * │  WRITE SIDE: billingDomain (invoices, payments, ledger)                     │
 * │                                                                              │
 * │  Data Flow:                                                                  │
 * │    billingDomain → eventBus → listeners → batchProcessor → projections       │
 * │                                        ↘ DLQ (on failure)                   │
 * │                                                                              │
 * │  Phase 3.5 Additions:                                                        │
 * │    observability/  accounting.metrics.js    (9 counters + structured logs)  │
 * │    dlq/            FailedEvent.model.js     (DLQ schema)                    │
 * │    services/       dlqRetry.service.js      (retry + summary + listing)     │
 * │    utils/          batchProcessor.js        (backpressure-safe batching)    │
 * │                                                                              │
 * │  Event Schemas Registered: accounting.updated.v1, accounting.rebuild.v1,    │
 * │                             accounting.dlq.v1  (in eventSchemas.js)         │
 * │                                                                              │
 * │  PERMISSIONS:                                                                │
 * │    accounting.read    → analytics reads + health                            │
 * │    accounting.manage  → rebuild + DLQ admin + retry                        │
 * │    accounting.reports → premium reports (future)                           │
 * │                                                                              │
 * │  API SURFACE (mounted at /api/v1/org/accounting):                           │
 * │    GET  /daily, /monthly, /outstanding, /health                             │
 * │    POST /rebuild, /dlq/retry                                                │
 * │    GET  /dlq                                                                 │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * ARCHITECTURAL INVARIANTS (ALL MUST HOLD):
 *   1. NEVER import billingDomain services directly
 *   2. NEVER write to invoice/payment/ledger models
 *   3. All domain data consumed via eventBus ONLY
 *   4. Projections are append-only ($inc + $set only — no $pull/$unset on data fields)
 *   5. accounting.* permissions only — never billing.read
 *   6. All events MUST carry eventId (idempotency prerequisite)
 *   7. Every failed event MUST land in DLQ — never silently dropped
 *   8. schemaVersion MUST be present on all projection writes
 *
 * @module accountingDomain
 */

"use strict";

const logger = require("@utils/logger");

// ─── Event Listeners (v3 — hardened) ─────────────────────────────────────────
const invoiceCreatedListener  = require("./listeners/invoiceCreated.listener");
const paymentReceivedListener = require("./listeners/paymentReceived.listener");

// ─── Services ─────────────────────────────────────────────────────────────────
const clinicAnalyticsService  = require("./services/clinicAnalytics.service");
const replayService           = require("./services/replay.service");
const dlqRetryService         = require("./services/dlqRetry.service");

// ─── Observability ────────────────────────────────────────────────────────────
const metrics                 = require("./observability/accounting.metrics");

// ─── Batch Processor ─────────────────────────────────────────────────────────
const { batchEnqueue, flushAll, getQueueStats } = require("./utils/batchProcessor");

// ─── Event Contracts ──────────────────────────────────────────────────────────
const eventContracts          = require("./eventContracts/accountingEventContracts");

// ─── Projections ──────────────────────────────────────────────────────────────
const { RevenueSummaryDef, RevenueSummarySchema } = require("./projections/revenueSummary.projection");
const { CashFlowSchema }      = require("./projections/cashFlow.projection");

// ─── Boot: Register all event listeners ──────────────────────────────────────

/**
 * registerListeners
 * Wire all accountingDomain event consumers. Call once at application boot.
 */
function registerListeners() {
    invoiceCreatedListener.register();
    paymentReceivedListener.register();

    logger.info({
        domain:   "accountingDomain",
        version:  "3 (Phase 3.5 — Hardened)",
        events:   eventContracts.getSupportedEvents(),
        features: [
            "idempotency",
            "DLQ",
            "metrics",
            "batching",
            "schemaVersioning",
            "realtime",
            "replayService",
            "eventContracts",
        ],
    }, "[accountingDomain] All event listeners registered ✅");
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
    // Boot hook
    registerListeners,

    // Services
    services: {
        clinicAnalytics: clinicAnalyticsService,
        replay:          replayService,
        dlqRetry:        dlqRetryService,
    },

    // Observability
    metrics,

    // Batch processor
    batch: {
        enqueue:    batchEnqueue,
        flushAll,
        getStats:   getQueueStats,
    },

    // Event Contracts
    eventContracts,

    // Projections (for testing/admin)
    projections: {
        RevenueSummaryDef,
        RevenueSummarySchema,
        CashFlowSchema,
    },
};
