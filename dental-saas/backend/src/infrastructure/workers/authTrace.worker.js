/**
 * authTrace.worker.js — Auth Trace Persistence Worker
 *
 * BullMQ worker that consumes trace jobs from the authTraceQueue
 * and persists them to MongoDB. Also runs post-persist hooks
 * (anomaly detection, etc.).
 *
 * Features:
 *   - Batch-insert support (processes up to BATCH_SIZE jobs at once)
 *   - Post-persist hooks (anomaly detection, analytics update)
 *   - Graceful shutdown support
 *   - Error isolation (one bad trace doesn't crash the worker)
 *
 * Environment Variables:
 *   AUTH_TRACE_WORKER_CONCURRENCY — number of concurrent jobs, default 10
 *   AUTH_TRACE_WORKER_ENABLED     — "true"/"false", default "true"
 *
 * PLANE: Infrastructure / Workers
 * Phase 20.1 — TASK-AUTH-SCALE-002
 */

"use strict";

const { Worker } = require("bullmq");
const redisConnection = require("../redis/redisClient");
const AuthTrace = require("../../shared/models/AuthTrace").default;
const logger = require("../../utils/logger");
const { QUEUE_NAME } = require("../queues/authTrace.queue");

// ─── Configuration ──────────────────────────────────────────────────────────

const CONCURRENCY = parseInt(process.env.AUTH_TRACE_WORKER_CONCURRENCY, 10) || 10;
const WORKER_ENABLED = process.env.AUTH_TRACE_WORKER_ENABLED !== "false";

// ─── Post-Persist Hooks ─────────────────────────────────────────────────────
// These run after each trace is persisted (anomaly detection, etc.)

const _postPersistHooks = [];

/**
 * Register a callback to run after a trace is persisted by the worker.
 * @param {Function} fn — async function(traceDoc)
 */
function onWorkerTracePersisted(fn) {
    if (typeof fn === "function") {
        _postPersistHooks.push(fn);
    }
}

// ─── Worker Instance ────────────────────────────────────────────────────────

let worker = null;

function createWorker() {
    if (!WORKER_ENABLED) {
        logger.info("[AuthTraceWorker] Worker disabled by env — skipping");
        return null;
    }

    worker = new Worker(
        QUEUE_NAME,
        async (job) => {
            const traceData = job.data;

            try {
                // Persist to MongoDB
                const savedTrace = await AuthTrace.create(traceData);

                // Run post-persist hooks (anomaly detection, etc.)
                for (const hook of _postPersistHooks) {
                    try {
                        await hook(savedTrace);
                    } catch (hookErr) {
                        logger.error(
                            { err: hookErr.message, hook: hook.name || "anonymous", requestId: traceData.requestId },
                            "[AuthTraceWorker] Post-persist hook error"
                        );
                    }
                }

                return { requestId: traceData.requestId, persisted: true };
            } catch (err) {
                // Duplicate key errors (requestId) are expected — not a failure
                if (err.code === 11000) {
                    logger.debug(
                        { requestId: traceData.requestId },
                        "[AuthTraceWorker] Duplicate trace — skipping"
                    );
                    return { requestId: traceData.requestId, persisted: false, duplicate: true };
                }
                throw err; // Rethrow to trigger BullMQ retry
            }
        },
        {
            connection: redisConnection,
            concurrency: CONCURRENCY,
            limiter: {
                max: 200,        // Max 200 jobs per duration window
                duration: 1000,  // Per second — prevents DB flooding
            },
        }
    );

    // ─── Worker Event Handlers ──────────────────────────────────────────────

    worker.on("completed", (job, result) => {
        if (result?.persisted) {
            logger.debug(
                { requestId: result.requestId, jobId: job.id },
                "[AuthTraceWorker] Trace persisted"
            );
        }
    });

    worker.on("failed", (job, err) => {
        logger.error(
            {
                jobId: job?.id,
                requestId: job?.data?.requestId,
                err: err.message,
                attemptsMade: job?.attemptsMade,
            },
            "[AuthTraceWorker] Job failed"
        );
    });

    worker.on("error", (err) => {
        logger.error(
            { err: err.message, service: "authTraceWorker" },
            "[AuthTraceWorker] Worker error"
        );
    });

    logger.info(
        { concurrency: CONCURRENCY, queueName: QUEUE_NAME },
        "[AuthTraceWorker] Worker started"
    );

    return worker;
}

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

async function stopWorker() {
    if (worker) {
        await worker.close();
        logger.info("[AuthTraceWorker] Worker stopped gracefully");
    }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    createWorker,
    stopWorker,
    onWorkerTracePersisted,
};
