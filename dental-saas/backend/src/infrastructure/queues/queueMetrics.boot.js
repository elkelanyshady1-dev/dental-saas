/**
 * queueMetrics.boot.js — Boot-Time Queue Registration
 * Phase B.2 — Runtime Maturity & Architecture Optimization
 *
 * PURPOSE:
 * Registers all known BullMQ queues with the global queueMetrics service
 * at application boot time. Called once from app.js or server.js.
 *
 * Each queue provides a standardized health function.
 *
 * PLANE: Infrastructure / shared.
 */

"use strict";

const { registerQueue } = require("./queueMetrics.service");
const logger = require("@utils/logger");

/**
 * bootQueueMetrics()
 *
 * Registers all system queues for unified observability.
 * Uses lazy-loading to avoid circular dependency issues at require time.
 * Safe to call multiple times — registerQueue() handles deduplication.
 */
function bootQueueMetrics() {
    try {
        // ── Auth Trace Queue ─────────────────────────────────────────────
        const { getQueueHealth: authTraceHealth } = require("./authTrace.queue");
        registerQueue("authTraceQueue", authTraceHealth);

        // ── Email Queue ──────────────────────────────────────────────────
        const { emailQueue, EMAIL_QUEUE_NAME } = require("./emailQueue");
        registerQueue(EMAIL_QUEUE_NAME || "emailQueue", async () => {
            const [waiting, active, completed, failed, delayed] = await Promise.all([
                emailQueue.getWaitingCount(),
                emailQueue.getActiveCount(),
                emailQueue.getCompletedCount(),
                emailQueue.getFailedCount(),
                emailQueue.getDelayedCount(),
            ]);
            return {
                status: "healthy",
                counts: { waiting, active, completed, failed, delayed },
                isPaused: await emailQueue.isPaused(),
            };
        });

        // ── Communication Queue ──────────────────────────────────────────
        const { communicationQueue } = require("./communication.queue");
        registerQueue("communicationQueue", async () => {
            const [waiting, active, completed, failed, delayed] = await Promise.all([
                communicationQueue.getWaitingCount(),
                communicationQueue.getActiveCount(),
                communicationQueue.getCompletedCount(),
                communicationQueue.getFailedCount(),
                communicationQueue.getDelayedCount(),
            ]);
            return {
                status: "healthy",
                counts: { waiting, active, completed, failed, delayed },
                isPaused: await communicationQueue.isPaused(),
            };
        });

        logger.info(
            { service: "queueMetrics" },
            "[queueMetrics] Boot-time queue registration complete"
        );

    } catch (err) {
        // Queue registration failures are non-fatal — observability degrades gracefully
        logger.warn(
            { err: err.message, service: "queueMetrics" },
            "[queueMetrics] Queue registration partially failed — some metrics may be unavailable"
        );
    }
}

module.exports = { bootQueueMetrics };
