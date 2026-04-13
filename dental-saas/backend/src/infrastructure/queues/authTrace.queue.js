/**
 * authTrace.queue.js — Auth Trace Ingestion Queue
 *
 * BullMQ queue for decoupling auth trace persistence from the HTTP request lifecycle.
 * Producers call addTraceJob() — workers consume and persist to MongoDB.
 *
 * Architecture:
 *   Request → authTraceMiddleware → Redis Queue → authTrace.worker → MongoDB
 *
 * Features:
 *   - Non-blocking: trace data sent to Redis, HTTP response returns immediately
 *   - Retry: 3 attempts with exponential backoff (500ms base)
 *   - Deduplication: requestId used as jobId to prevent duplicates
 *   - Batch-ready: queue supports future batch processing via BullMQ groups
 *
 * Environment Variables:
 *   AUTH_TRACE_QUEUE_ENABLED — "true"/"false", default "true"
 *   AUTH_TRACE_QUEUE_NAME    — queue name override, default "authTraceQueue"
 *
 * PLANE: Infrastructure / Shared
 * Phase 20.1 — TASK-AUTH-SCALE-002
 */

"use strict";

const { Queue } = require("bullmq");
const redisConnection = require("../redis/redisClient");
const logger = require("../../utils/logger");

// ─── Queue Name ─────────────────────────────────────────────────────────────

const QUEUE_NAME = process.env.AUTH_TRACE_QUEUE_NAME || "authTraceQueue";

// ─── Queue Instance ─────────────────────────────────────────────────────────

const authTraceQueue = new Queue(QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 500 },
        removeOnComplete: { count: 1000 },   // Keep last 1000 for monitoring
        removeOnFail: { count: 5000 },        // Keep last 5000 failures for debugging
    },
});

// ─── Producer ───────────────────────────────────────────────────────────────

/**
 * Add a trace document to the ingestion queue.
 * Non-blocking — returns immediately after Redis accepts the job.
 *
 * @param {Object} traceDoc — built trace document (from buildTraceDocument)
 * @returns {Promise<import("bullmq").Job|null>}
 */
async function addTraceJob(traceDoc) {
    if (!traceDoc) return null;

    try {
        const job = await authTraceQueue.add("persist", traceDoc, {
            // Use requestId as jobId for deduplication
            jobId: traceDoc.requestId || undefined,
        });
        return job;
    } catch (err) {
        // Queue failure must NEVER crash the app — log and move on
        logger.error(
            { err: err.message, requestId: traceDoc.requestId, service: "authTraceQueue" },
            "[AuthTraceQueue] Failed to enqueue trace"
        );
        return null;
    }
}

// ─── Health Check ───────────────────────────────────────────────────────────

/**
 * Get queue health metrics for monitoring dashboards.
 * @returns {Promise<Object>}
 */
async function getQueueHealth() {
    try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
            authTraceQueue.getWaitingCount(),
            authTraceQueue.getActiveCount(),
            authTraceQueue.getCompletedCount(),
            authTraceQueue.getFailedCount(),
            authTraceQueue.getDelayedCount(),
        ]);

        return {
            name: QUEUE_NAME,
            status: "healthy",
            counts: { waiting, active, completed, failed, delayed },
            isPaused: await authTraceQueue.isPaused(),
        };
    } catch (err) {
        return {
            name: QUEUE_NAME,
            status: "error",
            error: err.message,
        };
    }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    authTraceQueue,
    addTraceJob,
    getQueueHealth,
    QUEUE_NAME,
};
