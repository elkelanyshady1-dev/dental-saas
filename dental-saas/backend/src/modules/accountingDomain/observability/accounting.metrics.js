/**
 * accounting.metrics.js
 * AccountingDomain — Observability Layer (Phase 3.5)
 *
 * PURPOSE:
 *   In-process metrics store for the accountingDomain event pipeline.
 *   Tracks key operational counters and timing histograms.
 *   Exposed via GET /accounting/health.
 *
 * DESIGN:
 *   - Zero external dependencies (no Prometheus/StatsD)
 *   - In-memory counters (process-local — fine for single-process deployment)
 *   - Provides structured log helpers with canonical field names
 *   - Metrics reset is supported for testing
 *
 * METRICS TRACKED:
 *   eventsProcessed         — Successfully processed events
 *   eventsSkippedDuplicate  — Duplicate events caught by idempotency log
 *   eventsFailed            — Events that threw errors (→ DLQ)
 *   eventsInDlq             — Current DLQ depth (set, not incremented)
 *   projectionWrites        — Successful projection upserts
 *   dlqRetriesSucceeded     — DLQ events that were successfully retried
 *   dlqRetriesFailed        — DLQ events that failed again on retry
 *   replayCount             — Number of full projection replays triggered
 *   batchesFlushed          — Number of batch flushes completed
 *
 * TIMING:
 *   lastEventAt             — ISO timestamp of last processed event
 *   lastReplayAt            — ISO timestamp of last replay
 *   lastReplayDurationMs    — Duration of most recent replay
 *   lastDlqRetryAt          — ISO timestamp of last DLQ retry batch
 *   lastBatchFlushAt        — ISO timestamp of last batch processor flush
 *
 * PLANE: Org only — infrastructure singleton (process-scoped)
 *
 * @module accountingDomain/observability/accounting.metrics
 */

"use strict";

const logger = require("@utils/logger");

// ─── Counter Store ────────────────────────────────────────────────────────────

const _counters = {
    eventsProcessed:        0,
    eventsSkippedDuplicate: 0,
    eventsFailed:           0,
    eventsInDlq:            0,
    projectionWrites:       0,
    dlqRetriesSucceeded:    0,
    dlqRetriesFailed:       0,
    replayCount:            0,
    batchesFlushed:         0,
};

const _timestamps = {
    lastEventAt:          null,
    lastReplayAt:         null,
    lastReplayDurationMs: null,
    lastDlqRetryAt:       null,
    lastBatchFlushAt:     null,
};

// ─── API ──────────────────────────────────────────────────────────────────────

const metrics = {

    /**
     * increment — Increment a named counter by 1 (or N).
     * @param {keyof _counters} key
     * @param {number} [by=1]
     */
    increment(key, by = 1) {
        if (!(key in _counters)) {
            logger.warn({ key }, "[accounting:metrics] Unknown counter key — ignored");
            return;
        }
        _counters[key] += by;
    },

    /**
     * set — Directly set a gauge value (e.g. DLQ size from DB query).
     * @param {keyof _counters} key
     * @param {number} value
     */
    set(key, value) {
        if (!(key in _counters)) {
            logger.warn({ key }, "[accounting:metrics] Unknown gauge key — ignored");
            return;
        }
        _counters[key] = value;
    },

    /**
     * recordReplay — Record timing and increment replay counter.
     * @param {number} durationMs
     */
    recordReplay(durationMs) {
        _counters.replayCount++;
        _timestamps.lastReplayAt = new Date().toISOString();
        _timestamps.lastReplayDurationMs = durationMs;
    },

    /**
     * touch — Update lastEventAt to now.
     */
    touch() {
        _timestamps.lastEventAt = new Date().toISOString();
    },

    /**
     * touchDlqRetry — Update lastDlqRetryAt to now.
     * Called by dlqRetry.service on each retry batch.
     */
    touchDlqRetry() {
        _timestamps.lastDlqRetryAt = new Date().toISOString();
    },

    /**
     * touchBatchFlush — Update lastBatchFlushAt to now.
     * Called by batchProcessor on each successful flush.
     */
    touchBatchFlush() {
        _timestamps.lastBatchFlushAt = new Date().toISOString();
    },

    /**
     * getSnapshot — Returns a read-only snapshot (for health endpoint).
     * @returns {object}
     */
    getSnapshot() {
        return {
            counters:   { ..._counters },
            timestamps: { ..._timestamps },
            capturedAt: new Date().toISOString(),
        };
    },

    /**
     * reset — Zero all counters and timestamps (for testing only).
     */
    reset() {
        for (const key of Object.keys(_counters)) _counters[key] = 0;
        for (const key of Object.keys(_timestamps)) _timestamps[key] = null;
    },

    // ── Structured Log Helpers ────────────────────────────────────────────────

    /**
     * logProcessed — Standard structured log for a successfully processed event.
     */
    logProcessed(eventType, eventId, orgId, extra = {}) {
        logger.info({
            event: "ACCOUNTING_EVENT_PROCESSED",
            eventType,
            eventId,
            orgId,
            ...extra,
        }, "[accounting] Event processed");
    },

    /**
     * logSkipped — Standard log for a duplicate-skipped event.
     */
    logSkipped(eventType, eventId, orgId) {
        logger.debug({
            event: "ACCOUNTING_EVENT_SKIPPED_DUPLICATE",
            eventType,
            eventId,
            orgId,
        }, "[accounting] Duplicate event skipped (idempotent)");
    },

    /**
     * logFailed — Standard log for an event that failed and went to DLQ.
     */
    logFailed(eventType, eventId, orgId, error) {
        logger.error({
            event: "ACCOUNTING_EVENT_FAILED",
            eventType,
            eventId,
            orgId,
            error,
        }, "[accounting] Event failed → DLQ");
    },

    /**
     * logProjectionWrite — Standard log for a successful projection upsert.
     */
    logProjectionWrite(projectionName, orgId, date) {
        logger.debug({
            event: "ACCOUNTING_PROJECTION_WRITE",
            projectionName,
            orgId,
            date,
        }, "[accounting] Projection updated");
    },
};

module.exports = metrics;
