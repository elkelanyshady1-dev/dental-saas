/**
 * queryPerformance.js
 * Core Infrastructure — Query Performance Guards & Slow Query Logging
 *
 * RESPONSIBILITIES:
 *   1. Slow query detection and structured logging
 *   2. Query timeout enforcement (maxTimeMS)
 *   3. Performance metrics (P50/P90/P99 tracking via circular buffer)
 *
 * ARCHITECTURE:
 *   Implemented as a Mongoose plugin that can be applied globally or per-schema.
 *   Hooks into Mongoose pre/post query events to instrument every operation.
 *
 * PERFORMANCE OVERHEAD:
 *   - Date.now() calls: ~2ns each (negligible)
 *   - Slow query log: only triggered above threshold
 *   - Metrics: circular buffer, O(1) insert, bounded memory
 *
 * ENV CONFIGURATION:
 *   DB_SLOW_QUERY_MS          — Threshold for slow query warnings (default: 200ms)
 *   DB_QUERY_TIMEOUT_MS       — maxTimeMS for all queries (default: 5000ms)
 *   DB_QUERY_METRICS_ENABLED  — Enable P50/P90/P99 tracking (default: true)
 *
 * PLANE: Core Infrastructure
 */

"use strict";

const logger = require("@utils/logger");

// ─── Configuration ──────────────────────────────────────────────────────────

const SLOW_QUERY_MS = parseInt(process.env.DB_SLOW_QUERY_MS) || 200;
const QUERY_TIMEOUT_MS = parseInt(process.env.DB_QUERY_TIMEOUT_MS) || 5000;
const METRICS_ENABLED = process.env.DB_QUERY_METRICS_ENABLED !== "false";

// ─── Metrics: Circular Buffer for Latency Tracking ──────────────────────────
// WHY circular buffer: Fixed memory (no unbounded growth), O(1) insert.
// We keep the last N query durations for percentile calculation.

const METRICS_BUFFER_SIZE = 1000;
const latencyBuffer = new Float64Array(METRICS_BUFFER_SIZE);
let latencyIndex = 0;
let latencyCount = 0;

const queryMetrics = {
    totalQueries: 0,
    slowQueries: 0,
    timedOutQueries: 0,
    totalDurationMs: 0,
};

/**
 * Records a query duration into the circular buffer.
 * @param {number} durationMs
 */
function recordLatency(durationMs) {
    latencyBuffer[latencyIndex] = durationMs;
    latencyIndex = (latencyIndex + 1) % METRICS_BUFFER_SIZE;
    if (latencyCount < METRICS_BUFFER_SIZE) latencyCount++;
    queryMetrics.totalQueries++;
    queryMetrics.totalDurationMs += durationMs;
}

/**
 * Calculates percentile from the circular buffer.
 * @param {number} percentile — 0-100
 * @returns {number} — Duration in ms at the given percentile
 */
function getPercentile(percentile) {
    if (latencyCount === 0) return 0;

    // Copy filled portion and sort
    const filled = Array.from(latencyBuffer.subarray(0, latencyCount));
    filled.sort((a, b) => a - b);

    const idx = Math.min(
        Math.floor((percentile / 100) * filled.length),
        filled.length - 1
    );
    return Math.round(filled[idx] * 100) / 100;
}

// ─── Mongoose Plugin ────────────────────────────────────────────────────────

/**
 * queryPerformancePlugin
 * Mongoose plugin that instruments all queries with:
 *   1. maxTimeMS enforcement (prevents runaway queries)
 *   2. Slow query detection and logging
 *   3. Latency metrics recording
 *
 * Apply globally:
 *   mongoose.plugin(queryPerformancePlugin);
 *
 * Or per-schema:
 *   patientSchema.plugin(queryPerformancePlugin);
 *
 * @param {mongoose.Schema} schema
 */
function queryPerformancePlugin(schema) {
    // ─── Query Hooks (find, findOne, findOneAndUpdate, etc.) ─────────────

    const queryOps = [
        "find", "findOne", "findOneAndUpdate", "findOneAndDelete",
        "findOneAndReplace", "updateOne", "updateMany", "deleteOne",
        "deleteMany", "countDocuments", "estimatedDocumentCount",
        "distinct", "replaceOne",
    ];

    for (const op of queryOps) {
        // Pre-hook: set maxTimeMS + record start time
        schema.pre(op, function () {
            // Enforce query timeout — prevents runaway queries from hogging connections
            // maxTimeMS tells MongoDB to abort the query if it exceeds this duration.
            // This is a SERVER-SIDE timeout (not a client-side socket timeout).
            if (!this.getOptions().maxTimeMS) {
                this.maxTimeMS(QUERY_TIMEOUT_MS);
            }

            // Record start time for slow query detection
            this._perfStartTime = Date.now();
        });

        // Post-hook: measure duration, log slow queries, record metrics
        schema.post(op, function () {
            if (!this._perfStartTime) return;

            const durationMs = Date.now() - this._perfStartTime;

            // Record metrics
            if (METRICS_ENABLED) {
                recordLatency(durationMs);
            }

            // Slow query detection
            if (durationMs > SLOW_QUERY_MS) {
                queryMetrics.slowQueries++;

                const filter = this.getFilter ? this.getFilter() : {};
                const modelName = this.model?.modelName || "Unknown";

                logger.warn({
                    event: "SLOW_QUERY",
                    model: modelName,
                    operation: op,
                    durationMs,
                    thresholdMs: SLOW_QUERY_MS,
                    filter: sanitizeFilter(filter),
                    source: "queryPerformance",
                }, `[QueryPerf] SLOW QUERY: ${modelName}.${op} took ${durationMs}ms (threshold: ${SLOW_QUERY_MS}ms)`);
            }
        });

        // Error hook: detect timeouts
        schema.post(op, function (err, _doc, next) {
            if (err && err.code === 50) { // MongoDB error code 50 = ExceededTimeLimit
                queryMetrics.timedOutQueries++;

                const modelName = this.model?.modelName || "Unknown";
                logger.error({
                    event: "QUERY_TIMEOUT",
                    model: modelName,
                    operation: op,
                    timeoutMs: QUERY_TIMEOUT_MS,
                    source: "queryPerformance",
                }, `[QueryPerf] QUERY TIMEOUT: ${modelName}.${op} exceeded ${QUERY_TIMEOUT_MS}ms`);
            }
            if (next) next(err);
        });
    }

    // ─── Aggregate Hooks ────────────────────────────────────────────────

    schema.pre("aggregate", function () {
        // Set maxTimeMS on aggregation pipeline
        const opts = this.options || {};
        if (!opts.maxTimeMS) {
            this.option("maxTimeMS", QUERY_TIMEOUT_MS);
        }
        this._perfStartTime = Date.now();
    });

    schema.post("aggregate", function () {
        if (!this._perfStartTime) return;

        const durationMs = Date.now() - this._perfStartTime;

        if (METRICS_ENABLED) {
            recordLatency(durationMs);
        }

        if (durationMs > SLOW_QUERY_MS) {
            queryMetrics.slowQueries++;

            const pipeline = this.pipeline ? this.pipeline() : [];
            const modelName = this._model?.modelName || "Unknown";

            logger.warn({
                event: "SLOW_AGGREGATE",
                model: modelName,
                durationMs,
                thresholdMs: SLOW_QUERY_MS,
                stageCount: pipeline.length,
                source: "queryPerformance",
            }, `[QueryPerf] SLOW AGGREGATE: ${modelName} took ${durationMs}ms (${pipeline.length} stages)`);
        }
    });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * sanitizeFilter
 * Removes sensitive values from query filters for logging.
 * Preserves field names and operators but replaces values with types.
 *
 * @param {Object} filter
 * @returns {Object}
 */
function sanitizeFilter(filter) {
    if (!filter || typeof filter !== "object") return filter;

    const sanitized = {};
    for (const [key, value] of Object.entries(filter)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            // Recursively sanitize nested operators like $gt, $in, etc.
            sanitized[key] = sanitizeFilter(value);
        } else if (Array.isArray(value)) {
            sanitized[key] = `[Array(${value.length})]`;
        } else {
            sanitized[key] = typeof value;
        }
    }
    return sanitized;
}

// ─── Stats API ──────────────────────────────────────────────────────────────

/**
 * getQueryStats
 * Returns query performance metrics.
 * Safe to call at any time.
 *
 * @returns {Object}
 */
function getQueryStats() {
    return {
        totalQueries: queryMetrics.totalQueries,
        slowQueries: queryMetrics.slowQueries,
        timedOutQueries: queryMetrics.timedOutQueries,
        avgDurationMs: queryMetrics.totalQueries > 0
            ? Math.round((queryMetrics.totalDurationMs / queryMetrics.totalQueries) * 100) / 100
            : 0,
        p50Ms: getPercentile(50),
        p90Ms: getPercentile(90),
        p99Ms: getPercentile(99),
        slowQueryThresholdMs: SLOW_QUERY_MS,
        queryTimeoutMs: QUERY_TIMEOUT_MS,
        metricsBufferSize: latencyCount,
    };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    queryPerformancePlugin,
    getQueryStats,
    SLOW_QUERY_MS,
    QUERY_TIMEOUT_MS,
};
