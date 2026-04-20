/**
 * outboxPublisher.worker.js
 * Core Infrastructure — Event Outbox Publisher
 * v24.0 — TASK-PLATFORM-RELIABILITY-HARDENING Phase 1
 *
 * PURPOSE:
 * Background worker that polls the EventOutbox collection for pending events,
 * publishes them to the in-process EventBus, and marks them as published.
 *
 * DESIGN:
 *   - Runs on a fixed interval (default 5s, configurable).
 *   - Processes events in FIFO order (createdAt ascending).
 *   - Batch size capped at 100 events per cycle to prevent memory spikes.
 *   - Failed events are retried up to maxRetries (default 5).
 *   - After maxRetries, events are marked "failed" for human investigation.
 *   - Publishing uses setImmediate to avoid blocking the event loop.
 *
 * OBSERVABILITY:
 *   - Logs warn for slow cycles (> 2s)
 *   - Exposes getOutboxMetrics() for /health/metrics endpoint
 *
 * PLANE: Core
 */

"use strict";

const EventOutbox = require("../core/EventOutbox.model");
const eventBus = require("../core/eventBus");
const logger = require("@utils/logger");

// ─── Configuration ────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS, 10) || 5000;
const BATCH_SIZE = parseInt(process.env.OUTBOX_BATCH_SIZE, 10) || 100;
const SLOW_CYCLE_THRESHOLD_MS = 2000;

// ─── Internal Metrics (Phase 5) ───────────────────────────────────────────────
let _metrics = {
    publishedTotal: 0,
    failedTotal: 0,
    lastCycleDurationMs: 0,
    lastCycleAt: null,
    cycleCount: 0,
};

/**
 * Returns current outbox metrics for the /health/metrics endpoint.
 * @returns {object}
 */
function getOutboxMetrics() {
    return { ..._metrics };
}

/**
 * publishPendingEvents
 * Core publishing loop. Fetches pending events, publishes to EventBus,
 * and updates status atomically.
 *
 * @returns {Promise<{ published: number, failed: number }>}
 */
async function publishPendingEvents() {
    const cycleStart = Date.now();

    const pendingEvents = await EventOutbox.find({ status: "pending" })
        .sort({ createdAt: 1 })
        .limit(BATCH_SIZE)
        .lean();

    if (pendingEvents.length === 0) {
        return { published: 0, failed: 0 };
    }

    let published = 0;
    let failed = 0;

    for (const event of pendingEvents) {
        try {
            // Emit to in-process EventBus (schema validation happens inside emit)
            eventBus.emit(event.eventType, event.payload, event.emitter);

            // Mark as published
            await EventOutbox.updateOne(
                { _id: event._id },
                {
                    $set: {
                        status: "published",
                        publishedAt: new Date(),
                    }
                }
            );

            published++;
            _metrics.publishedTotal++;

        } catch (err) {
            const newRetryCount = (event.retryCount || 0) + 1;
            const maxRetries = event.maxRetries || 5;

            if (newRetryCount >= maxRetries) {
                // Exhausted retries — mark as failed for human investigation
                await EventOutbox.updateOne(
                    { _id: event._id },
                    {
                        $set: {
                            status: "failed",
                            lastError: err.message,
                            retryCount: newRetryCount,
                        }
                    }
                );

                logger.error(
                    {
                        eventId: event._id,
                        eventType: event.eventType,
                        retryCount: newRetryCount,
                        err: err.message
                    },
                    "[OutboxPublisher] Event permanently failed after max retries"
                );

                failed++;
                _metrics.failedTotal++;
            } else {
                // Increment retry count, keep as pending
                await EventOutbox.updateOne(
                    { _id: event._id },
                    {
                        $set: {
                            lastError: err.message,
                            retryCount: newRetryCount,
                        }
                    }
                );

                logger.warn(
                    {
                        eventId: event._id,
                        eventType: event.eventType,
                        retryCount: newRetryCount,
                        maxRetries
                    },
                    "[OutboxPublisher] Event publish failed — will retry"
                );
            }
        }
    }

    const cycleDuration = Date.now() - cycleStart;
    _metrics.lastCycleDurationMs = cycleDuration;
    _metrics.lastCycleAt = new Date();
    _metrics.cycleCount++;

    if (cycleDuration > SLOW_CYCLE_THRESHOLD_MS) {
        logger.warn(
            { cycleDuration, pendingCount: pendingEvents.length, published, failed },
            "[OutboxPublisher] Slow publishing cycle detected"
        );
    }

    if (published > 0 || failed > 0) {
        logger.info(
            { published, failed, cycleDuration },
            "[OutboxPublisher] Publish cycle completed"
        );
    }

    return { published, failed };
}

// ─── Worker Lifecycle ─────────────────────────────────────────────────────────
let _intervalHandle = null;

/**
 * start()
 * Begins the polling loop. Safe to call multiple times (idempotent).
 */
function start() {
    if (_intervalHandle) return;

    logger.info(
        { pollIntervalMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE },
        "[OutboxPublisher] Worker started"
    );

    // ALLOWED_POLLING: OUTBOX
    _intervalHandle = setInterval(async () => {
        try {
            await publishPendingEvents();
        } catch (err) {
            logger.error(
                { err: err.message },
                "[OutboxPublisher] Unexpected error in publish cycle"
            );
        }
    }, POLL_INTERVAL_MS);

    // Don't prevent process exit
    _intervalHandle.unref();
}

/**
 * stop()
 * Stops the polling loop. Safe to call even if not started.
 */
function stop() {
    if (_intervalHandle) {
        clearInterval(_intervalHandle);
        _intervalHandle = null;
        logger.info("[OutboxPublisher] Worker stopped");
    }
}

module.exports = {
    start,
    stop,
    publishPendingEvents,
    getOutboxMetrics,
};
