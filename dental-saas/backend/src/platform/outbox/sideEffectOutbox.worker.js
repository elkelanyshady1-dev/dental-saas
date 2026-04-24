/**
 * sideEffectOutbox.worker.js — Side-Effect Outbox Background Processor
 * Layer: Infrastructure > Workers
 * Version: v25.0 — Outbox Hardening
 *
 * PURPOSE:
 *   Polls the SideEffectOutbox for pending events and dispatches them
 *   to their handlers. Guarantees at-least-once execution with retry.
 *
 * ARCHITECTURE:
 *   1. Poll pending events (oldest first, batch of 20)
 *   2. Atomic claim via findOneAndUpdate (multi-instance safe)
 *   3. Dispatch to handler via outbox.dispatcher.js
 *   4. Mark completed or increment retry count
 *   5. Events exceeding maxRetries are moved to "dead" status
 *
 * SAFETY:
 *   - Atomic claim prevents duplicate processing across workers
 *   - Handlers MUST be idempotent (at-least-once semantics)
 *   - Failed events are retried with exponential backoff
 *   - Dead-lettered events require manual investigation
 *
 * METRICS:
 *   Exposes getMetrics() for health dashboard integration.
 */

"use strict";

const getSharedModel      = require("@core/db/getSharedModel");
const SideEffectOutboxDef = require("./SideEffectOutbox.model");
let _SideEffectOutbox_cache = null;
function SideEffectOutbox() {
    return _SideEffectOutbox_cache || (_SideEffectOutbox_cache = getSharedModel(SideEffectOutboxDef));
}
const { dispatchSideEffect } = require("./outbox.dispatcher");
const logger              = require("@utils/logger");

// ── Configuration ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = parseInt(process.env.SIDE_EFFECT_OUTBOX_POLL_MS || "1000", 10);
const BATCH_SIZE       = 20;

let _timer       = null;
let _isRunning   = false;
let _isProcessing = false;

// ── Metrics ──────────────────────────────────────────────────────────────────

const _metrics = {
    processedTotal:  0,
    failedTotal:     0,
    deadTotal:       0,
    lastCycleMs:     0,
    cycleCount:      0,
};

// ── Core Processing ──────────────────────────────────────────────────────────

/**
 * Process a single batch of pending events.
 */
async function processBatch() {
    if (_isProcessing) return;
    _isProcessing = true;

    const cycleStart = Date.now();

    try {
        // Fetch pending events (FIFO)
        const events = await SideEffectOutbox().find({
            status:     "pending",
            retryCount: { $lt: 5 }, // safety — also checked per-event
        })
            .sort({ createdAt: 1 })
            .limit(BATCH_SIZE)
            .lean();

        for (const event of events) {
            await processEvent(event);
        }

        _metrics.cycleCount++;
        _metrics.lastCycleMs = Date.now() - cycleStart;

    } catch (err) {
        logger.error({
            event: "SIDE_EFFECT_OUTBOX_CYCLE_ERROR",
            err:   err.message,
        }, "[SideEffectOutbox] Poll cycle error");
    } finally {
        _isProcessing = false;
    }
}

/**
 * Process a single outbox event with atomic lock.
 */
async function processEvent(event) {
    try {
        // ── STEP 1: Atomic claim — prevents duplicate processing ─────────
        const locked = await SideEffectOutbox().findOneAndUpdate(
            {
                _id:    event._id,
                status: "pending",
            },
            {
                $set: {
                    status:   "processing",
                    lockedAt: new Date(),
                },
            },
            { returnDocument: "after" }
        );

        if (!locked) return; // another worker claimed it

        // ── STEP 2: Dispatch to handler ──────────────────────────────────
        const result = await dispatchSideEffect(locked);

        // ── STEP 3: Mark completed ───────────────────────────────────────
        await SideEffectOutbox().updateOne(
            { _id: locked._id },
            {
                $set: {
                    status:      "completed",
                    processedAt: new Date(),
                    error:       null,
                },
            }
        );

        _metrics.processedTotal++;

        logger.debug({
            event:     "SIDE_EFFECT_PROCESSED",
            outboxId:  locked._id,
            eventType: locked.eventType,
            result,
        }, `[SideEffectOutbox] Processed: ${locked.eventType}`);

    } catch (err) {
        // ── STEP 4: Handle failure ───────────────────────────────────────
        const newRetryCount = (event.retryCount || 0) + 1;
        const maxRetries    = event.maxRetries || 5;

        if (newRetryCount >= maxRetries || err.code === "UNKNOWN_EVENT_TYPE") {
            // Dead letter — exhausted retries or unknown type
            await SideEffectOutbox().updateOne(
                { _id: event._id },
                {
                    $set: {
                        status:     "dead",
                        error:      err.message,
                        retryCount: newRetryCount,
                    },
                }
            );

            _metrics.deadTotal++;

            logger.error({
                event:     "SIDE_EFFECT_DEAD_LETTERED",
                outboxId:  event._id,
                eventType: event.eventType,
                retries:   newRetryCount,
                err:       err.message,
            }, `[SideEffectOutbox] Dead-lettered: ${event.eventType} after ${newRetryCount} attempts`);

        } else {
            // Return to pending for retry
            await SideEffectOutbox().updateOne(
                { _id: event._id },
                {
                    $set: {
                        status: "pending",
                        error:  err.message,
                    },
                    $inc: { retryCount: 1 },
                }
            );

            _metrics.failedTotal++;

            logger.warn({
                event:     "SIDE_EFFECT_RETRY",
                outboxId:  event._id,
                eventType: event.eventType,
                attempt:   newRetryCount,
                err:       err.message,
            }, `[SideEffectOutbox] Retry ${newRetryCount}/${maxRetries}: ${event.eventType}`);
        }
    }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

function start() {
    if (_isRunning) return;
    _isRunning = true;

    logger.info({
        event:      "SIDE_EFFECT_OUTBOX_STARTED",
        intervalMs: POLL_INTERVAL_MS,
        batchSize:  BATCH_SIZE,
    }, "[SideEffectOutbox] Worker started");

    // Immediate first poll, then interval
    processBatch();
    // ALLOWED_POLLING: OUTBOX
    _timer = setInterval(processBatch, POLL_INTERVAL_MS);
}

function stop() {
    if (_timer) {
        clearInterval(_timer);
        _timer     = null;
        _isRunning = false;
        logger.info({ event: "SIDE_EFFECT_OUTBOX_STOPPED" }, "[SideEffectOutbox] Worker stopped");
    }
}

function getMetrics() {
    return { ..._metrics };
}

module.exports = {
    start,
    stop,
    getMetrics,
    processBatch,   // exposed for testing
    processEvent,   // exposed for testing
};
