/**
 * invoiceCreated.listener.js
 * AccountingDomain — Event Listener (v3 — Hardened: Idempotent + DLQ + Metrics + Batching)
 *
 * Consumes: invoice.created (emitted by billingDomain)
 * Updates:  RevenueSummary projection (via batchProcessor)
 * DLQ:      Failures stored in accounting_failed_events
 * Emits:    accounting.updated.v1 (realtime — after batch flush)
 *
 * PIPELINE PER EVENT:
 *   1. Validate eventId (idempotency prerequisite)
 *   2. Check EventProcessingLog (skip duplicate)
 *   3. Enqueue in batchProcessor (flush when threshold or interval)
 *   4. On flush success: mark processed + emit realtime
 *   5. On flush failure: write to DLQ
 *
 * @module accountingDomain/listeners/invoiceCreated
 */

"use strict";

const logger = require("@utils/logger");
const eventBus = require("@core/eventBus");
const metrics = require("../observability/accounting.metrics");
const {
  updateRevenueSummary
} = require("../projections/revenueSummary.projection");
const EventProcessingLogSchema = require("../projections/_meta/EventProcessingLog.model");
const FailedEventSchema = require("../dlq/FailedEvent.model");
const {
  batchEnqueue
} = require("../utils/batchProcessor");
const {
  emitToOrg
} = require("@realtime/eventEmitter");
const {
  validateEventPayload
} = require("../eventContracts/accountingEventContracts");
const EVENT = "invoice.created";

// ─── Model Binders ────────────────────────────────────────────────────────────

function getLogModel(dbConnection) {
  if (dbConnection.modelNames().includes("EventProcessingLog")) {
    return dbConnection.model("EventProcessingLog");
  }
  return dbConnection.model("EventProcessingLog", EventProcessingLogSchema);
}
function getDlqModel(dbConnection) {
  if (dbConnection.modelNames().includes("FailedEvent")) {
    return dbConnection.model("FailedEvent");
  }
  return dbConnection.model("FailedEvent", FailedEventSchema);
}

// ─── Idempotency ──────────────────────────────────────────────────────────────

async function isAlreadyProcessed(dbConnection, orgId, eventId) {
  const Log = getLogModel(dbConnection);
  return !!(await Log.findOne({
    orgId,
    eventId,
    eventType: EVENT
  }).lean());
}
async function markProcessed(dbConnection, orgId, eventId, sourceDocumentId) {
  const Log = getLogModel(dbConnection);
  try {
    await Log.create({
      orgId,
      eventId,
      eventType: EVENT,
      processedAt: new Date(),
      sourceDocumentId: sourceDocumentId?.toString() || null
    });
  } catch (err) {
    if (err.code !== 11000) throw err; // 11000 = duplicate — safe
  }
}

// ─── DLQ Write ────────────────────────────────────────────────────────────────

async function writeToDlq(dbConnection, orgId, eventId, payload, err) {
  const DlqModel = getDlqModel(dbConnection);

  // ✅ Step 4 — Payload size guard (Phase 3.7)
  // Oversized payloads (>50KB) are replaced with a stub to prevent MongoDB
  // document bloat. Truncated events are visible in /accounting/dlq for
  // manual review.
  const MAX_PAYLOAD_BYTES = 50 * 1024;
  let safePayload = payload;
  try {
    if (JSON.stringify(safePayload).length > MAX_PAYLOAD_BYTES) {
      logger.warn({
        orgId,
        eventId
      }, "[accounting:dlq] Payload exceeds 50KB — truncated before DLQ write");
      safePayload = {
        truncated: true
      };
    }
  } catch {
    safePayload = {
      truncated: true
    };
  }
  try {
    await DlqModel.create({
      orgId,
      eventId,
      eventType: EVENT,
      payload: safePayload,
      error: err.message,
      errorStack: err.stack?.slice(0, 1000) || null,
      retryCount: 0,
      failedAt: new Date()
    });
    metrics.increment("eventsInDlq", 1);
    metrics.set("eventsInDlq", await DlqModel.countDocuments({
      orgId,
      status: {
        $in: ["pending", "retrying"]
      }
    }));
  } catch (dlqErr) {
    if (dlqErr.code !== 11000) {
      // Ignore duplicate DLQ entries
      logger.error({
        orgId,
        eventId,
        err: dlqErr.message
      }, "[accounting] CRITICAL: Failed to write to DLQ — event may be lost");
    }
  }
}

// ─── Projection Handler (called by batchProcessor) ───────────────────────────

async function applyInvoiceProjection(invoice, dbConnection, orgId) {
  await updateRevenueSummary({
    dbConnection,
    invoice
  });
}

// ─── Main Event Handler ───────────────────────────────────────────────────────

async function onInvoiceCreated(payload) {
  const {
    eventId,
    organizationId,
    dbConnection,
    invoice
  } = payload;

  // ── Contract Validation ───────────────────────────────────────────────────
  const validation = validateEventPayload(EVENT, payload);
  if (!validation.valid) {
    logger.warn({
      event: EVENT,
      errors: validation.errors
    }, "[accounting] Event rejected by contract — malformed payload");
    metrics.increment("eventsFailed");
    return;
  }

  // ── eventId guard ─────────────────────────────────────────────────────────
  if (!eventId) {
    logger.warn({
      event: EVENT,
      invoiceId: invoice?._id?.toString()
    }, "[accounting] Missing eventId — cannot guarantee idempotency. Skipping.");
    metrics.increment("eventsFailed");
    return;
  }

  // ── Idempotency Check ─────────────────────────────────────────────────────
  const alreadyDone = await isAlreadyProcessed(dbConnection, organizationId, eventId);
  if (alreadyDone) {
    metrics.increment("eventsSkippedDuplicate");
    metrics.logSkipped(EVENT, eventId, organizationId);
    return;
  }

  // ── Enqueue in batch processor ────────────────────────────────────────────
  const date = invoice.issuedAt ? new Date(invoice.issuedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  await batchEnqueue(organizationId, dbConnection, EVENT, invoice,
  // Handler: called when batch flushes
  async (inv, db) => {
    await applyInvoiceProjection(inv, db, organizationId);
    await markProcessed(db, organizationId, eventId, inv._id);
    metrics.increment("eventsProcessed");
    metrics.touch();
    metrics.logProcessed(EVENT, eventId, organizationId, {
      amount: inv.totalAmount
    });

    // Realtime (best-effort)
    try {
      await emitToOrg(organizationId, "accounting.updated.v1", {
        type: "revenue",
        date,
        branchId: inv.branchId?.toString() || null
      });
    } catch {/* non-blocking */}
  },
  // onFailure: called if handler throws — writes to DLQ
  async (err, inv) => {
    metrics.increment("eventsFailed");
    metrics.logFailed(EVENT, eventId, organizationId, err.message);
    await writeToDlq(dbConnection, organizationId, eventId, {
      invoice: inv
    }, err);
  });
}

// ─── Register ─────────────────────────────────────────────────────────────────

function register() {
  eventBus.on(EVENT, payload => {
    onInvoiceCreated(payload).catch(err => {
      metrics.increment("eventsFailed");
      logger.error({
        event: EVENT,
        err: err.message
      }, "[accounting] Unhandled error in invoiceCreated handler");
    });
  });
  logger.info(`[accounting] Listener registered: ${EVENT}`);
}
module.exports = {
  register
};