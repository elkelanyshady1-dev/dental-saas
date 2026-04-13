/**
 * monitoringController.js
 * Platform Controller — Communication Monitoring Dashboard APIs
 * v1.0
 *
 * Provides aggregated health and metrics endpoints for the Monitoring Dashboard.
 *
 * Endpoints:
 *   GET /api/platform/monitoring/email-metrics
 *   GET /api/platform/monitoring/queue-health
 *   GET /api/platform/monitoring/worker-status
 *
 * GUARD: all routes use VIEW_COMMUNICATION_METRICS capability
 * PLANE: Platform
 */
"use strict";

const logger = require("@utils/logger");
const CommunicationMetrics = require("../models/CommunicationMetrics.model").default;
const { EmailEvent } = require("../models/EmailEvent.model");
const redisClient = require("@infra/redis/redisClient");

// Lazy-load queue references to avoid circular require at boot
function _getQueues() {
    const { emailQueue } = require("@infra/queues/emailQueue");
    const { smsQueue, whatsappQueue } = require("@infra/queues/channelQueues");
    const { emailDLQ } = require("@infra/queues/deadLetterQueue");
    return { emailQueue, smsQueue, whatsappQueue, emailDLQ };
}

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
    try {
        const { emailQueue, smsQueue, whatsappQueue, emailDLQ } = _getQueues();

        const [emailCounts, smsCounts, waCounts, dlqCounts] = await Promise.all([
            emailQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
            smsQueue.getJobCounts("waiting", "active", "completed", "failed"),
            whatsappQueue.getJobCounts("waiting", "active", "completed", "failed"),
            emailDLQ.getJobCounts("waiting", "active", "completed", "failed"),
        ]);

        return res.json({
            success: true,
            data: {
                timestamp: new Date().toISOString(),
                queues: {
                    email: emailCounts,
                    sms: smsCounts,
                    whatsapp: waCounts,
                    emailDLQ: dlqCounts,
                }
            }
        });
    } catch (err) {
        logger.error({ err: err.message }, "[MonitoringCtrl] getQueueHealth failed");
        return res.status(500).json({ success: false, error: { message: err.message } });
    }
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
    const status = {
        timestamp: new Date().toISOString(),
        redis: "unknown",
        emailWorker: "unknown",
        providerChain: process.env.EMAIL_PROVIDER_CHAIN || "auto (env-based)",
    };

    // Redis ping
    try {
        await redisClient.ping();
        status.redis = "connected";
    } catch {
        status.redis = "disconnected";
    }

    // emailWorker health — check queue is reachable
    try {
        const { emailQueue } = _getQueues();
        const counts = await emailQueue.getJobCounts("active");
        status.emailWorker = "running";
        status.activeEmailJobs = counts.active ?? 0;
    } catch {
        status.emailWorker = "degraded";
    }

    // Recent email events in last 5 minutes = indicator worker is processing
    try {
        const since = new Date(Date.now() - 5 * 60 * 1000);
        const recentSent = await EmailEvent.countDocuments({ status: "sent", createdAt: { $gte: since } });
        status.recentSentLast5m = recentSent;
    } catch {
        status.recentSentLast5m = null;
    }

    const overallStatus = status.redis === "connected" && status.emailWorker === "running"
        ? "healthy"
        : "degraded";

    return res.json({
        success: true,
        data: { ...status, overallStatus }
    });
}

module.exports = { getEmailMetrics, getQueueHealth, getWorkerStatus };
