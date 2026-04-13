/**
 * batchProcessor.js
 * AccountingDomain — Batch Event Processor (Phase 3.5)
 *
 * PURPOSE:
 *   Provides backpressure-safe batch processing for high-throughput
 *   event scenarios (e.g. bulk invoice uploads, month-end batch).
 *
 * DESIGN:
 *   - Events are queued in-memory
 *   - Flush is triggered by:
 *     (a) Batch size threshold (default: 50)
 *     (b) Flush interval timer (default: 1000ms)
 *   - Safe shutdown: flushes remaining events before process exit
 *   - Non-blocking: projection writes happen asynchronously
 *   - Per-org queues: each org has its own batch queue
 *
 * CONCURRENCY:
 *   - One active flush per org at a time (flushing flag)
 *   - Overlapping events queue up and are flushed in next cycle
 *
 * USAGE:
 *   const { batchEnqueue } = require("../utils/batchProcessor");
 *   await batchEnqueue(orgId, dbConnection, "invoice.created", invoice, handlerFn);
 *
 * PLANE: Org only — infrastructure utility (process-scoped singleton)
 *
 * @module accountingDomain/utils/batchProcessor
 */

"use strict";

const logger = require("@utils/logger");
const metrics = require("../observability/accounting.metrics");

// ─── Configuration ────────────────────────────────────────────────────────────

const BATCH_SIZE          = parseInt(process.env.ACCOUNTING_BATCH_SIZE)   || 50;
const FLUSH_INTERVAL_MS   = parseInt(process.env.ACCOUNTING_FLUSH_INTERVAL_MS) || 1000;

// ─── Per-Org Queue Store ──────────────────────────────────────────────────────
// Structure: Map<orgId, { queue: Array, flushing: boolean, dbConnection }>

const _queues = new Map();

// ─── Queue Management ─────────────────────────────────────────────────────────

function _getOrCreateQueue(orgId, dbConnection) {
    if (!_queues.has(orgId)) {
        _queues.set(orgId, {
            queue:        [],
            flushing:     false,
            dbConnection, // Most recent dbConnection for this org
        });
    } else {
        // Update dbConnection in case it changed (reconnect scenario)
        _queues.get(orgId).dbConnection = dbConnection;
    }
    return _queues.get(orgId);
}

// ─── Flush ────────────────────────────────────────────────────────────────────

/**
 * _flush
 *
 * Drains the queue for a specific org and runs all pending handlers.
 * Errors in individual handlers are caught — failing items are logged but
 * don't block remaining items.
 *
 * @param {string} orgId
 */
async function _flush(orgId) {
    const state = _queues.get(orgId);
    if (!state || state.flushing || state.queue.length === 0) return;

    state.flushing = true;

    // Snapshot and clear the batch
    const batch = state.queue.splice(0, BATCH_SIZE);

    logger.debug({
        orgId,
        batchSize: batch.length,
    }, "[accounting:batch] Flushing batch");

    let succeeded = 0;
    let failed = 0;

    for (const item of batch) {
        try {
            await item.handler(item.eventData, state.dbConnection);
            succeeded++;
        } catch (err) {
            failed++;
            logger.warn({
                orgId,
                eventType: item.eventType,
                err: err.message,
            }, "[accounting:batch] Item failed in batch flush — skipped");

            // DLQ hook: if item has onFailure callback, invoke it
            if (typeof item.onFailure === "function") {
                try {
                    await item.onFailure(err, item.eventData);
                } catch { /* DLQ write failure is non-fatal to the batch */ }
            }
        }
    }

    metrics.increment("batchesFlushed");

    logger.info({
        orgId,
        batchSize: batch.length,
        succeeded,
        failed,
    }, "[accounting:batch] Batch flush complete");

    state.flushing = false;

    // If more items arrived during flush, immediately flush again
    if (state.queue.length >= BATCH_SIZE) {
        setImmediate(() => _flush(orgId));
    }
}

// ─── Interval Flush ───────────────────────────────────────────────────────────

let _flushInterval = null;

/**
 * startFlushInterval
 *
 * Starts the periodic flush timer. Call once at module load.
 */
function startFlushInterval() {
    if (_flushInterval) return; // Already started

    _flushInterval = setInterval(async () => {
        for (const [orgId] of _queues) {
            try {
                await _flush(orgId);
            } catch (err) {
                logger.warn({ orgId, err: err.message },
                    "[accounting:batch] Interval flush error");
            }
        }
    }, FLUSH_INTERVAL_MS);

    // Unref so the timer doesn't prevent process exit
    if (_flushInterval.unref) _flushInterval.unref();

    logger.info({
        batchSize: BATCH_SIZE,
        flushIntervalMs: FLUSH_INTERVAL_MS,
    }, "[accounting:batch] Batch processor started");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * batchEnqueue
 *
 * Adds an event to the org's processing queue.
 * Triggers immediate flush if queue reaches BATCH_SIZE.
 *
 * @param {string}   orgId
 * @param {object}   dbConnection   — Org-specific DB connection
 * @param {string}   eventType      — e.g. "invoice.created"
 * @param {object}   eventData      — Raw event payload
 * @param {Function} handler        — async fn(eventData, dbConnection) → void
 * @param {Function} [onFailure]    — async fn(err, eventData) → void (DLQ hook)
 */
async function batchEnqueue(orgId, dbConnection, eventType, eventData, handler, onFailure) {
    const state = _getOrCreateQueue(orgId, dbConnection);

    state.queue.push({ eventType, eventData, handler, onFailure });

    // Immediate flush if threshold hit
    if (state.queue.length >= BATCH_SIZE) {
        await _flush(orgId);
    }
}

/**
 * flushAll
 *
 * Flushes ALL queues immediately. Call on graceful shutdown.
 * Returns when all queues are empty.
 */
async function flushAll() {
    logger.info("[accounting:batch] Safe shutdown — flushing all queues");

    for (const [orgId] of _queues) {
        try {
            // Flush repeatedly until queue is empty
            let retries = 10;
            while (_queues.get(orgId)?.queue.length > 0 && retries-- > 0) {
                await _flush(orgId);
                if (_queues.get(orgId)?.queue.length > 0) {
                    await new Promise(r => setTimeout(r, 50));
                }
            }
        } catch (err) {
            logger.warn({ orgId, err: err.message }, "[accounting:batch] Shutdown flush error");
        }
    }

    if (_flushInterval) {
        clearInterval(_flushInterval);
        _flushInterval = null;
    }

    logger.info("[accounting:batch] All queues flushed — shutdown complete");
}

/**
 * getQueueStats
 *
 * Returns a snapshot of current queue depths (for health endpoint).
 */
function getQueueStats() {
    const stats = {};
    for (const [orgId, state] of _queues) {
        stats[orgId] = {
            queueDepth: state.queue.length,
            flushing:   state.flushing,
        };
    }
    return {
        orgs:      Object.keys(stats).length,
        batchSize: BATCH_SIZE,
        flushIntervalMs: FLUSH_INTERVAL_MS,
        queues:    stats,
    };
}

// ─── Auto-start interval ──────────────────────────────────────────────────────
startFlushInterval();

// ─── Graceful Shutdown Hook ───────────────────────────────────────────────────
process.once("SIGTERM", () => { flushAll().catch(() => {}); });
process.once("SIGINT",  () => { flushAll().catch(() => {}); });

module.exports = {
    batchEnqueue,
    flushAll,
    getQueueStats,
    startFlushInterval,
    BATCH_SIZE,
    FLUSH_INTERVAL_MS,
};
