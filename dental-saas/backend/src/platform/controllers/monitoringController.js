/**
 * monitoringController.js
 * Platform Controller — Communication Monitoring Dashboard APIs
 * v2.0 — Phase 6 cleanup (Redis + BullMQ queues eradicated)
 *
 * Provides aggregated health and metrics endpoints for the Monitoring Dashboard.
 *
 * Endpoints:
 *   GET /api/platform/monitoring/email-metrics   → DB-backed, unchanged
 *   GET /api/platform/monitoring/queue-health    → 501 (queues removed)
 *   GET /api/platform/monitoring/worker-status   → degraded (no redis/queues to ping)
 *
 * v1.0 pinged Redis + read BullMQ queue depths. Both surfaces were
 * removed in Phase 6 — Redis is no longer used anywhere in the app,
 * and async delivery is now handled by QStash (which does its own
 * retry accounting server-side). No replacement signal exists at this
 * layer yet; the endpoints report "removed-phase-6" honestly so the
 * frontend can degrade instead of polling a dead surface.
 *
 * GUARD: all routes use VIEW_COMMUNICATION_METRICS capability
 * PLANE: Platform
 */
"use strict";

const logger = require("@utils/logger");
const CommunicationMetrics = require("../models/CommunicationMetrics.model").default;
const { EmailEvent } = require("../models/EmailEvent.model");

// Shared response body for endpoints that cannot be answered without the
// removed BullMQ/Redis surface. Kept consistent with communicationMetricsController
// so frontends can detect and degrade uniformly on `error === "QUEUES_ERADICATED"`.
const QUEUES_REMOVED_PAYLOAD = {
    success: false,
    error: "QUEUES_ERADICATED",
    reason:
        "BullMQ communication queues + Redis client were removed in Phase 6. " +
        "Sync delivery goes through communication.dispatcher; async delivery " +
        "goes through QStash (which manages its own retries). No inspectable " +
        "queue depth or Redis connectivity exists at the app layer.",
    replacement: "infrastructure/communication/communication.dispatcher.js",
};

// ─── GET /api/platform/monitoring/email-metrics ───────────────────────────────
/**
 * @swagger
 * /api/platform/monitoring/email-metrics:
 *   get:
 *     summary: Email delivery metrics (last 24h)
 *     description: Returns sent/failed/retry/DLQ totals for email, plus provider breakdown from EmailEvent logs.
 *     tags: [Platform Monitoring]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Email metrics
 */
async function getEmailMetrics(req, res) {
    try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Aggregate from CommunicationMetrics (hourly buckets, last 24h)
        const metrics = await CommunicationMetrics.aggregate([
            { $match: { channel: "email", bucket: { $gte: since } } },
            {
                $group: {
                    _id: null,
                    sent: { $sum: "$sent" },
                    failed: { $sum: "$failed" },
                    retried: { $sum: "$retried" },
                    dlq: { $sum: "$dlq" },
                }
            }
        ]);

        const totals = metrics[0] || { sent: 0, failed: 0, retried: 0, dlq: 0 };
        delete totals._id;

        // Delivery rate (avoid div/0)
        const totalAttempts = totals.sent + totals.failed;
        const deliveryRate = totalAttempts > 0 ? Math.round((totals.sent / totalAttempts) * 1000) / 10 : 100;
        const retryRate = totalAttempts > 0 ? Math.round((totals.retried / totalAttempts) * 1000) / 10 : 0;

        // Provider usage breakdown from EmailEvent (last 24h)
        const providerBreakdown = await EmailEvent.aggregate([
            { $match: { status: "sent", createdAt: { $gte: since } } },
            { $group: { _id: "$provider", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Hourly time-series for chart
        const hourlyBuckets = await CommunicationMetrics.aggregate([
            { $match: { channel: "email", bucket: { $gte: since } } },
            {
                $project: {
                    hour: { $dateToString: { format: "%H:00", date: "$bucket" } },
                    sent: 1,
                    failed: 1,
                    retried: 1,
                }
            },
            { $sort: { bucket: 1 } }
        ]);

        return res.json({
            success: true,
            data: {
                window: "24h",
                totals,
                deliveryRate,
                retryRate,
                providerUsage: providerBreakdown.map(p => ({ provider: p._id || "unknown", count: p.count })),
                hourly: hourlyBuckets,
            }
        });
    } catch (err) {
        logger.error({ err: err.message }, "[MonitoringCtrl] getEmailMetrics failed");
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
}

// ─── GET /api/platform/monitoring/queue-health ────────────────────────────────
/**
 * @swagger
 * /api/platform/monitoring/queue-health:
 *   get:
 *     summary: BullMQ queue depths for all channels
 *     description: Returns waiting/active/completed/failed job counts for email, sms, whatsapp queues.
 *     tags: [Platform Monitoring]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Queue depth snapshot
 */
async function getQueueHealth(req, res) {
    return res.status(501).json(QUEUES_REMOVED_PAYLOAD);
}

// ─── GET /api/platform/monitoring/worker-status ───────────────────────────────
/**
 * @swagger
 * /api/platform/monitoring/worker-status:
 *   get:
 *     summary: Worker and Redis connectivity status
 *     description: Returns running/degraded status for emailWorker and Redis connection.
 *     tags: [Platform Monitoring]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Worker status snapshot
 */
async function getWorkerStatus(req, res) {
    // Redis + emailWorker telemetry was tied to the removed Redis/BullMQ
    // surface. The only signal that still works is "are emails actually
    // being sent?" — inferred from recent EmailEvent records.
    const status = {
        timestamp: new Date().toISOString(),
        redis: "removed-phase-6",
        emailWorker: "removed-phase-6",
        providerChain: process.env.EMAIL_PROVIDER_CHAIN || "auto (env-based)",
    };

    // Recent email events in last 5 minutes = indicator the dispatcher
    // + provider chain is still moving messages end-to-end.
    let recentSent = null;
    try {
        const since = new Date(Date.now() - 5 * 60 * 1000);
        recentSent = await EmailEvent.countDocuments({ status: "sent", createdAt: { $gte: since } });
        status.recentSentLast5m = recentSent;
    } catch (err) {
        logger.warn({ err: err.message }, "[MonitoringCtrl] recentSent count failed");
        status.recentSentLast5m = null;
    }

    // Without a queue-depth or redis-ping signal, "healthy" means the
    // dispatcher has emitted at least one sent event in the last window.
    // "unknown" if the EmailEvent read failed; "degraded" otherwise.
    const overallStatus =
        recentSent === null
            ? "unknown"
            : recentSent > 0
                ? "healthy"
                : "degraded";

    return res.json({
        success: true,
        data: { ...status, overallStatus, note: "queue-depth + redis-ping telemetry removed in Phase 6" },
    });
}

module.exports = { getEmailMetrics, getQueueHealth, getWorkerStatus };
