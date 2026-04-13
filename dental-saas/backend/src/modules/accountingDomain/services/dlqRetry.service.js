/**
 * dlqRetry.service.js
 * AccountingDomain — DLQ Retry Service (Phase 3.5)
 *
 * PURPOSE:
 *   Retries failed events stored in the accounting DLQ.
 *   Reads from accounting_failed_events, re-dispatches to the correct
 *   projection handler, then removes the DLQ entry on success.
 *
 * RETRY POLICY:
 *   - Max 3 auto-retry attempts per event
 *   - On each failure: increment retryCount
 *   - At retryCount >= MAX_RETRY_COUNT: mark as "abandoned" (manual review)
 *   - Idempotency: EventProcessingLog is NOT re-checked during replay
 *     (DLQ events always failed before being logged → safe to re-process)
 *
 * OBSERVABILITY:
 *   - Uses accounting.metrics for counters
 *   - Emits accounting.dlq.v1 realtime signal on retry completion
 *
 * PLANE: Org only
 * PERMISSION: Called by POST /accounting/dlq/retry (P.ACCOUNTING_MANAGE)
 *
 * @module accountingDomain/services/dlqRetry.service
 */

"use strict";

const logger = require("@utils/logger");
const metrics = require("../observability/accounting.metrics");
const FailedEventSchema = require("../dlq/FailedEvent.model");
const EventProcessingLogSchema = require("../projections/_meta/EventProcessingLog.model");
const { updateRevenueSummary } = require("../projections/revenueSummary.projection");
const { updateCashFlow } = require("../projections/cashFlow.projection");
const { emitToOrg } = require("@realtime/eventEmitter");

const MAX_RETRY_COUNT = FailedEventSchema.MAX_RETRY_COUNT;

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Promise-safe sleep (used for exponential backoff between retries) */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Phase 3.7 — max payload size before we truncate (50 KB)
const MAX_PAYLOAD_BYTES = 50 * 1024;

// ─── Model Binders ────────────────────────────────────────────────────────────

function getDlqModel(dbConnection) {
    if (dbConnection.modelNames().includes("FailedEvent")) {
        return dbConnection.model("FailedEvent");
    }
    return dbConnection.model("FailedEvent", FailedEventSchema);
}

function getLogModel(dbConnection) {
    if (dbConnection.modelNames().includes("EventProcessingLog")) {
        return dbConnection.model("EventProcessingLog");
    }
    return dbConnection.model("EventProcessingLog", EventProcessingLogSchema);
}

// ─── Reprocess Dispatcher ─────────────────────────────────────────────────────

/**
 * reprocessEvent
 *
 * Re-routes a DLQ event to the correct projection handler.
 * Reconstructs the payload shape expected by each handler.
 *
 * @param {object} failedEvent  — FailedEvent document from DLQ
 * @param {object} dbConnection — Org-specific DB connection for projection writes
 */
async function reprocessEvent(failedEvent, dbConnection) {
    const { eventType, payload, orgId } = failedEvent;

    switch (eventType) {
        case "invoice.created": {
            const invoice = payload?.invoice || payload;
            if (!invoice?._id) throw new Error("Cannot retry: invoice payload missing _id");
            await updateRevenueSummary({ organizationId: orgId, dbConnection, invoice });
            break;
        }

        case "payment.received": {
            const payment = payload?.payment || payload;
            if (!payment?._id) throw new Error("Cannot retry: payment payload missing _id");
            await updateCashFlow({ organizationId: orgId, dbConnection, payment });
            break;
        }

        default:
            throw new Error(`Unknown eventType for retry: "${eventType}"`);
    }
}

// ─── Main Retry Function ──────────────────────────────────────────────────────

/**
 * retryFailedEvents
 *
 * Retries all pending/retrying DLQ events for an org.
 * Returns a summary of results.
 *
 * @param {object} dbConnection  — Org-specific DB connection
 * @param {string} organizationId
 * @param {object} [options]
 * @param {number} [options.limit=50]  — Max events to retry per call
 * @returns {object} { succeeded, failed, abandoned, remaining }
 */
async function retryFailedEvents(dbConnection, organizationId, options = {}) {
    const { limit = 50 } = options;
    const orgId = organizationId.toString();

    const DlqModel = getDlqModel(dbConnection);
    const LogModel = getLogModel(dbConnection);

    // Timestamp this retry batch in metrics
    metrics.touchDlqRetry();

    // Fetch pending + retrying events (not abandoned)
    const failedEvents = await DlqModel
        .find({ orgId, status: { $in: ["pending", "retrying"] } })
        .limit(Math.min(limit, 200))
        .lean();

    if (!failedEvents.length) {
        return { succeeded: 0, failed: 0, abandoned: 0, remaining: 0 };
    }

    let succeeded = 0;
    let failed = 0;
    let abandoned = 0;

    for (const evt of failedEvents) {
        try {
            // ── PRE-CHECK: abandon immediately if already at max retries ─────
            // This catches events that reached MAX_RETRY_COUNT in a previous
            // batch but were not marked "abandoned" due to a concurrent failure.
            if ((evt.retryCount || 0) >= MAX_RETRY_COUNT) {
                await DlqModel.updateOne(
                    { _id: evt._id },
                    { $set: { status: "abandoned", lastRetryAt: new Date() } }
                );

                abandoned++;
                metrics.increment("dlqRetriesFailed");

                logger.error({
                    event:     "ACCOUNTING_DLQ_ABANDONED",
                    orgId:     evt.orgId,
                    eventId:   evt.eventId,
                    eventType: evt.eventType,
                    payload:   evt.payload,
                    retries:   evt.retryCount,
                }, "[accounting:dlq] Event abandoned (pre-check) — manual review required");

                continue;
            }

            // Mark as retrying
            await DlqModel.updateOne(
                { _id: evt._id },
                { $set: { status: "retrying", lastRetryAt: new Date() } }
            );

            // ✅ Step 2 — Exponential backoff (Phase 3.7)
            // Spreads retries over time to avoid bursting the projection handlers.
            // Retry 1 → 1s | Retry 2 → 2s | Retry 3 → 4s | max 30s
            const backoffMs = Math.min(
                1000 * Math.pow(2, evt.retryCount || 0),
                30_000
            );
            await sleep(backoffMs);

            // Re-process
            await reprocessEvent(evt, dbConnection);

            // ✅ Success — register in EventProcessingLog, remove from DLQ
            try {
                await LogModel.create({
                    orgId,
                    eventId: evt.eventId,
                    eventType: evt.eventType,
                    processedAt: new Date(),
                    sourceDocumentId: null,
                });
            } catch (dupErr) {
                // 11000 = already processed — still remove from DLQ
                if (dupErr.code !== 11000) throw dupErr;
            }

            await DlqModel.deleteOne({ _id: evt._id });

            metrics.increment("dlqRetriesSucceeded");
            metrics.increment("projectionWrites");
            succeeded++;

            logger.info({
                event: "ACCOUNTING_DLQ_RETRY_SUCCESS",
                eventId: evt.eventId,
                eventType: evt.eventType,
                orgId,
                retryCount: evt.retryCount,
            }, "[accounting:dlq] Retry succeeded — removed from DLQ");

        } catch (err) {
            const newRetryCount = (evt.retryCount || 0) + 1;
            const isAbandoned = newRetryCount >= MAX_RETRY_COUNT;

            await DlqModel.updateOne(
                { _id: evt._id },
                {
                    $inc: { retryCount: 1 },
                    $set: {
                        status: isAbandoned ? "abandoned" : "pending",
                        lastRetryAt: new Date(),
                        error: err.message,
                    }
                }
            );

            metrics.increment("dlqRetriesFailed");
            failed++;

            if (isAbandoned) {
                abandoned++;
                logger.error({
                    event: "ACCOUNTING_DLQ_ABANDONED",
                    eventId: evt.eventId,
                    eventType: evt.eventType,
                    orgId,
                    retryCount: newRetryCount,
                    error: err.message,
                }, "[accounting:dlq] Event abandoned after max retries — manual review required");
            } else {
                logger.warn({
                    event: "ACCOUNTING_DLQ_RETRY_FAILED",
                    eventId: evt.eventId,
                    eventType: evt.eventType,
                    orgId,
                    retryCount: newRetryCount,
                    error: err.message,
                }, "[accounting:dlq] Retry failed — will try again");
            }
        }
    }

    // Update DLQ gauge metric
    const remaining = await DlqModel.countDocuments({
        orgId,
        status: { $in: ["pending", "retrying"] }
    });
    metrics.set("eventsInDlq", remaining);

    // Realtime signal (best-effort)
    try {
        await emitToOrg(organizationId, "accounting.dlq.v1", {
            type: "RETRY_COMPLETE",
            dlqSize: remaining,
        });
    } catch { /* non-blocking */ }

    const result = { succeeded, failed, abandoned, remaining };

    logger.info({
        event: "ACCOUNTING_DLQ_RETRY_BATCH_DONE",
        orgId,
        ...result,
    }, "[accounting:dlq] Retry batch complete");

    return result;
}

/**
 * getDlqSummary
 *
 * Returns DLQ counts by status for the health/admin endpoints.
 *
 * @param {object} dbConnection
 * @param {string} organizationId
 * @returns {object}
 */
async function getDlqSummary(dbConnection, organizationId) {
    const orgId = organizationId.toString();
    const DlqModel = getDlqModel(dbConnection);

    const [pending, retrying, abandoned] = await Promise.all([
        DlqModel.countDocuments({ orgId, status: "pending" }),
        DlqModel.countDocuments({ orgId, status: "retrying" }),
        DlqModel.countDocuments({ orgId, status: "abandoned" }),
    ]);

    return {
        organizations: orgId,
        pending,
        retrying,
        abandoned,
        total: pending + retrying + abandoned,
    };
}

/**
 * getDlqEvents
 *
 * Returns DLQ event list (paginated) for the admin UI.
 *
 * @param {object} dbConnection
 * @param {string} organizationId
 * @param {object} options
 * @param {number} [options.limit=20]
 * @param {string} [options.status]   — filter: "pending" | "retrying" | "abandoned"
 */
async function getDlqEvents(dbConnection, organizationId, { limit = 20, status } = {}) {
    const orgId = organizationId.toString();
    const DlqModel = getDlqModel(dbConnection);

    const filter = { orgId };
    if (status) filter.status = status;

    const events = await DlqModel
        .find(filter)
        .sort({ failedAt: -1 })
        .limit(Math.min(limit, 100))
        .lean();

    return events.map(e => ({
        id:          e._id,
        eventId:     e.eventId,
        eventType:   e.eventType,
        status:      e.status,
        retryCount:  e.retryCount,
        error:       e.error,
        failedAt:    e.failedAt,
        lastRetryAt: e.lastRetryAt,
        // Omit payload from list view (too verbose — fetch individually if needed)
    }));
}

module.exports = {
    retryFailedEvents,
    getDlqSummary,
    getDlqEvents,
};
