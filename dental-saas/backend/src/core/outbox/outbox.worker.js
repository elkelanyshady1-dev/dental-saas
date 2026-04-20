/**
 * outbox.worker.js — Outbox Background Event Processor
 * Core Infrastructure — Event Durability
 *
 * Polls the Outbox collection for pending events and emits them
 * via the eventBus. Guarantees at-least-once delivery.
 *
 * ARCHITECTURE:
 * 1. Poll pending outbox records (oldest first)
 * 2. Emit via eventBus
 * 3. Mark as processed
 * 4. Failed emissions are retried up to maxAttempts
 *
 * SAFETY:
 * - Atomic claim via findOneAndUpdate (multi-instance safe)
 * - At-least-once semantics (subscribers should be idempotent)
 * - Failed events are logged but don't block the queue
 *
 * @per-org-transactional — Internal system worker.
 */

"use strict";

// The model file exports { modelName, schema, default }. We need the
// registered mongoose model — `.default` — so findOneAndUpdate / updateOne
// exist. Requiring without `.default` returns the exports object, which
// silently has no model methods.
const Outbox = require("./Outbox.model").default;
const eventBus = require("@core/eventBus");
const logger = require("@utils/logger");

// ─── Configuration ──────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || "5000", 10); // 5 seconds
const BATCH_SIZE = 10;

// Phase A (multi-instance): crash-recovery sweep window. If a worker claims a
// record and dies before releasing it, the reclaim query flips it back to
// "pending" after this window so another instance can retry. Must exceed the
// longest plausible single-record processing time — too short causes false
// duplicates, too long delays recovery. 60s is comfortable for in-process
// EventBus handlers (typical completion < 1s).
const VISIBILITY_TIMEOUT_MS = parseInt(process.env.OUTBOX_VISIBILITY_TIMEOUT_MS || "60000", 10);

// Read at call time so boot order (server.js sets global.INSTANCE_ID at the
// top of startup; this module may be required earlier) doesn't leave us
// stamping null lockedBy values.
function _instanceId() {
    return global.INSTANCE_ID || "unknown-instance";
}

/**
 * Crash-recovery sweep: reclaim records stuck in "processing" past the
 * visibility timeout. Runs at the start of every poll cycle on every
 * instance — the sweep itself is idempotent (a no-op for non-stale records),
 * so multi-instance concurrent sweeps converge to the same result.
 */
async function reclaimStuckProcessing() {
    const cutoff = new Date(Date.now() - VISIBILITY_TIMEOUT_MS);
    const result = await Outbox.updateMany(
        {
            status: "processing",
            lockedAt: { $lt: cutoff },
        },
        {
            $set: {
                status: "pending",
                lockedBy: null,
                lockedAt: null,
            },
        }
    );
    if (result.modifiedCount > 0) {
        logger.warn(
            {
                event: "OUTBOX_RECLAIM",
                instanceId: _instanceId(),
                reclaimed: result.modifiedCount,
                cutoffMs: VISIBILITY_TIMEOUT_MS,
            },
            `[OutboxWorker] ♻ Reclaimed ${result.modifiedCount} stuck-processing record(s)`
        );
    }
    return result.modifiedCount;
}

let workerTimer = null;
let isProcessing = false;

// ─── Core Processing ────────────────────────────────────────────────────────

/**
 * Process a single outbox event atomically.
 * @returns {boolean} — true if an event was processed
 */
async function processOne() {
    // Phase A: atomic multi-instance claim. Flipping status to "processing"
    // as part of the update eliminates the race where two workers both match
    // `status: "pending"` before either finishes. A second instance's filter
    // won't match once the first has claimed the record.
    const instanceId = _instanceId();
    const now = new Date();
    const record = await Outbox.findOneAndUpdate(
        { status: "pending" },
        {
            $set: {
                status: "processing",
                lockedBy: instanceId,
                lockedAt: now,
            },
            $inc: { attempts: 1 },
        },
        {
            sort: { createdAt: 1 },
            new: true,
        }
    );

    if (!record) return false;

    // Paranoia guard. The atomic claim above (flipping status → processing
    // with lockedBy=instanceId) already guarantees ownership — if we got the
    // record back, nobody else can claim it while status is "processing". This
    // check exists only to surface a bug if that invariant ever breaks (e.g.
    // a future reclaim-sweep race we haven't thought of). Never observed in
    // practice; kept as belt-and-braces for blast-radius containment.
    if (record.lockedBy !== instanceId) {
        logger.error(
            {
                event: "OUTBOX_LOCK_VIOLATION",
                outboxId: record._id,
                recordLockedBy: record.lockedBy,
                instanceId,
            },
            "[OutboxWorker] Claim returned a record locked by a different instance \u2014 skipping"
        );
        return false;
    }

    // Observability: structured claim event. Includes claim latency so ops can
    // graph "how long events sit as pending before a worker picks them up" in
    // Grafana. Debug level to avoid log volume under steady load.
    logger.debug(
        {
            event: "OUTBOX_CLAIM",
            instanceId,
            outboxId: record._id,
            eventType: record.eventType,
            attempt: record.attempts,
            claimLatencyMs: record.createdAt ? Date.now() - record.createdAt.getTime() : null,
        },
        "[OutboxWorker] Claimed outbox record"
    );

    try {
        // Emit the event via the event bus
        eventBus.emit(record.eventType, record.payload);

        // Mark as processed. Clear lock fields so stale lockedBy/lockedAt
        // don't linger on terminal rows (and so the reclaim sweep's
        // `status: "processing"` filter naturally excludes them).
        await Outbox.updateOne(
            { _id: record._id },
            {
                $set: {
                    status: "processed",
                    processedAt: new Date(),
                    lastError: null,
                    lockedBy: null,
                    lockedAt: null,
                },
            }
        );

        logger.info(
            {
                event: "OUTBOX_SUCCESS",
                instanceId,
                outboxId: record._id,
                eventType: record.eventType,
            },
            "[OutboxWorker] \u2705 Event emitted successfully"
        );

        return true;
    } catch (err) {
        // Check if exhausted
        if (record.attempts >= record.maxAttempts) {
            await Outbox.updateOne(
                { _id: record._id },
                {
                    $set: {
                        status: "failed",
                        lastError: err.message,
                        lockedBy: null,
                        lockedAt: null,
                    },
                }
            );

            logger.error(
                {
                    event: "OUTBOX_DLQ",
                    instanceId,
                    outboxId: record._id,
                    eventType: record.eventType,
                    attempts: record.attempts,
                    err: err.message,
                },
                "[OutboxWorker] 💀 Event emission exhausted — requires investigation"
            );
        } else {
            // Phase A: flip status back to "pending" (from "processing") and
            // clear the lock so the next poll cycle on any instance can
            // claim it again.
            await Outbox.updateOne(
                { _id: record._id },
                {
                    $set: {
                        status: "pending",
                        lastError: err.message,
                        lockedBy: null,
                        lockedAt: null,
                    },
                }
            );

            logger.warn(
                {
                    event: "OUTBOX_RETRY",
                    instanceId,
                    outboxId: record._id,
                    eventType: record.eventType,
                    attempt: record.attempts,
                    err: err.message,
                },
                "[OutboxWorker] ⚠ Event emission failed — will retry"
            );
        }

        return true;
    }
}

// ─── Poll Cycle ─────────────────────────────────────────────────────────────

async function pollCycle() {
    if (isProcessing) return;
    isProcessing = true;

    try {
        // Phase A: crash recovery runs BEFORE the claim loop so records
        // stranded by a prior crash are visible to this cycle. Sweep is
        // cheap (indexed on {status, lockedAt}) and only logs when it
        // actually reclaimed something.
        try {
            await reclaimStuckProcessing();
        } catch (err) {
            logger.error({ err: err.message }, "[OutboxWorker] reclaimStuckProcessing failed (non-fatal)");
        }

        let processed = 0;
        for (let i = 0; i < BATCH_SIZE; i++) {
            const didWork = await processOne();
            if (!didWork) break;
            processed++;
        }

        if (processed > 0) {
            logger.debug(
                { instanceId: _instanceId(), processed },
                "[OutboxWorker] Poll cycle completed"
            );
        }
    } catch (err) {
        logger.error({ err }, "[OutboxWorker] Poll cycle error");
    } finally {
        isProcessing = false;
    }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

function start() {
    if (workerTimer) return;

    logger.info(
        { intervalMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE },
        "[OutboxWorker] Starting outbox event worker"
    );

    pollCycle();
    // ALLOWED_POLLING: OUTBOX
    workerTimer = setInterval(pollCycle, POLL_INTERVAL_MS);
}

function stop() {
    if (workerTimer) {
        clearInterval(workerTimer);
        workerTimer = null;
        logger.info("[OutboxWorker] Stopped");
    }
}

module.exports = {
    start,
    stop,
    pollCycle,
    processOne,
    reclaimStuckProcessing,
};
