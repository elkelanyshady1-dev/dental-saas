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

const Outbox = require("./Outbox.model");
const eventBus = require("@core/eventBus");
const logger = require("@utils/logger");

// ─── Configuration ──────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || "5000", 10); // 5 seconds
const BATCH_SIZE = 10;

let workerTimer = null;
let isProcessing = false;

// ─── Core Processing ────────────────────────────────────────────────────────

/**
 * Process a single outbox event atomically.
 * @returns {boolean} — true if an event was processed
 */
async function processOne() {
    const record = await Outbox.findOneAndUpdate(
        {
            status: "pending",
        },
        {
            $inc: { attempts: 1 },
        },
        {
            sort: { createdAt: 1 },
            new: true,
        }
    );

    if (!record) return false;

    try {
        // Emit the event via the event bus
        eventBus.emit(record.eventType, record.payload);

        // Mark as processed
        await Outbox.updateOne(
            { _id: record._id },
            {
                $set: {
                    status: "processed",
                    processedAt: new Date(),
                    lastError: null,
                },
            }
        );

        logger.debug(
            { outboxId: record._id, eventType: record.eventType },
            "[OutboxWorker] ✅ Event emitted successfully"
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
                    },
                }
            );

            logger.error(
                {
                    outboxId: record._id,
                    eventType: record.eventType,
                    attempts: record.attempts,
                    err: err.message,
                },
                "[OutboxWorker] 💀 Event emission exhausted — requires investigation"
            );
        } else {
            // Leave as pending for retry
            await Outbox.updateOne(
                { _id: record._id },
                {
                    $set: { lastError: err.message },
                }
            );

            logger.warn(
                { outboxId: record._id, attempt: record.attempts, err: err.message },
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
        let processed = 0;
        for (let i = 0; i < BATCH_SIZE; i++) {
            const didWork = await processOne();
            if (!didWork) break;
            processed++;
        }

        if (processed > 0) {
            logger.debug({ processed }, "[OutboxWorker] Poll cycle completed");
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
};
