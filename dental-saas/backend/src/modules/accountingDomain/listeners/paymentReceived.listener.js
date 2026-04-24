/**
 * paymentReceived.listener.js
 * AccountingDomain — Event Listener (v3 — Hardened: Idempotent + DLQ + Metrics + Batching)
 *
 * Consumes: payment.received (emitted by billingDomain)
 * Updates:  CashFlowProjection (via batchProcessor)
 * DLQ:      Failures stored in accounting_failed_events
 * Emits:    accounting.updated.v1 (realtime — after batch flush)
 *
 * @module accountingDomain/listeners/paymentReceived
 */

"use strict";

const logger = require("@utils/logger");
const eventBus = require("@core/eventBus");
const metrics = require("../observability/accounting.metrics");
const {
  updateCashFlow
} = require("../projections/cashFlow.projection");
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
const EVENT = "payment.received";

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
    if (err.code !== 11000) throw err;
  }
}

// ─── DLQ Write ────────────────────────────────────────────────────────────────

async function writeToDlq(dbConnection, orgId, eventId, payload, err) {
  const DlqModel = getDlqModel(dbConnection);
  try {
    await DlqModel.create({
      orgId,
      eventId,
      eventType: EVENT,
      payload,
      error: err.message,
      errorStack: err.stack?.slice(0, 1000) || null,
      retryCount: 0,
      failedAt: new Date()
    });
  } catch (dlqErr) {
    if (dlqErr.code !== 11000) {
      logger.error({
        orgId,
        eventId,
        err: dlqErr.message
      }, "[accounting] CRITICAL: Failed to write to DLQ — event may be lost");
    }
  }
}

// ─── Projection Handler (called by batchProcessor) ───────────────────────────

async function applyPaymentProjection(payment, dbConnection, orgId) {
  await updateCashFlow({
    dbConnection,
    payment
  });
}

// ─── Main Event Handler ───────────────────────────────────────────────────────

async function onPaymentReceived(payload) {
  const {
    eventId,
    organizationId,
    dbConnection,
    payment
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
      paymentId: payment?._id?.toString()
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
  const date = payment.paidAt ? new Date(payment.paidAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  await batchEnqueue(organizationId, dbConnection, EVENT, payment,
  // Handler: called when batch flushes
  async (pmt, db) => {
    await applyPaymentProjection(pmt, db, organizationId);
    await markProcessed(db, organizationId, eventId, pmt._id);
    metrics.increment("eventsProcessed");
    metrics.touch();
    metrics.logProcessed(EVENT, eventId, organizationId, {
      amount: pmt.amountPaid,
      method: pmt.method
    });

    // Realtime (best-effort)
    try {
      await emitToOrg(organizationId, "accounting.updated.v1", {
        type: "cashflow",
        date,
        method: pmt.method || "unknown",
        branchId: pmt.branchId?.toString() || null
      });
    } catch {/* non-blocking */}
  },
  // onFailure: called if handler throws — writes to DLQ
  async (err, pmt) => {
    metrics.increment("eventsFailed");
    metrics.logFailed(EVENT, eventId, organizationId, err.message);
    await writeToDlq(dbConnection, organizationId, eventId, {
      payment: pmt
    }, err);
  });
}

// ─── Register ─────────────────────────────────────────────────────────────────

function register() {
  eventBus.on(EVENT, payload => {
    onPaymentReceived(payload).catch(err => {
      metrics.increment("eventsFailed");
      logger.error({
        event: EVENT,
        err: err.message
      }, "[accounting] Unhandled error in paymentReceived handler");
    });
  });
  logger.info(`[accounting] Listener registered: ${EVENT}`);
}
module.exports = {
  register
};