/**
 * communicationMetricsController.js
 * Platform Controller — Communication Metrics + Retry Analytics + DLQ API
 * v1.0
 *
 * Routes:
 *   GET  /api/platform/communication/metrics       → delivery stats per channel
 *   GET  /api/platform/communication/retry-logs    → retry + DLQ history
 *   GET  /api/platform/communication/dlq           → DLQ job listings
 *   POST /api/platform/communication/test/send     → test message sending
 *   POST /api/platform/communication/dlq/:jobId/retry → retry a DLQ job
 *
 * RBAC:
 *   GET routes  → VIEW_COMMUNICATION_METRICS
 *   POST routes → MANAGE_COMMUNICATION
 *
 * PLANE: Platform
 */

"use strict";

const CommunicationMetrics = require("../../platform/models/CommunicationMetrics.model").default;
const CommunicationRetryLog = require("../../platform/models/CommunicationRetryLog.model").default;
const { EmailEvent } = require("../../platform/models/EmailEvent.model");
const { emailQueue } = require("@infra/queues/emailQueue");
const { smsQueue, whatsappQueue, smsDLQ, whatsappDLQ } = require("@infra/queues/channelQueues");
const { emailDLQ } = require("@infra/queues/deadLetterQueue");
const { sendCommunication, sendBulkCommunication } = require("../../services/communicationService");
const { renderTemplate } = require("../../email/engine/renderTemplate");
const logger = require("@utils/logger");


// ─── GET /api/platform/communication/metrics ──────────────────────────────────
/**
 * @swagger
 * /api/platform/communication/metrics:
 *   get:
 *     summary: Get communication delivery metrics per channel
 *     description: Returns sent/failed/retried/dlq counts for email, sms, whatsapp. Required capability: VIEW_COMMUNICATION_METRICS.
 *     tags: [Communication]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema: { type: integer, default: 24 }
 *         description: Number of hours to look back (max 720 = 30 days)
 *     responses:
 *       200:
 *         description: Metrics grouped by channel
 */
exports.getMetrics = async (req, res) => {
    try {
        const hours = Math.min(parseInt(req.query.hours) || 24, 720);
        const since = new Date(Date.now() - hours * 3600 * 1000);

        const [queueCounts, dbMetrics] = await Promise.all([
            // Real-time queue state
            Promise.all([
                emailQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
                smsQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
                whatsappQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
                emailDLQ.getJobCounts("waiting", "active", "completed", "failed"),
                smsDLQ.getJobCounts("waiting", "active", "completed", "failed"),
                whatsappDLQ.getJobCounts("waiting", "active", "completed", "failed"),
            ]),
            // Aggregated DB metrics
            CommunicationMetrics.aggregate([
                { $match: { bucket: { $gte: since }, type: "ALL" } },
                {
                    $group: {
                        _id: "$channel",
                        sent: { $sum: "$sent" },
                        failed: { $sum: "$failed" },
                        retried: { $sum: "$retried" },
                        dlq: { $sum: "$dlq" },
                    }
                },
            ]),
        ]);

        const [emailQ, smsQ, waQ, emailD, smsD, waD] = queueCounts;

        // Build channel map from DB aggregation
        const dbMap = {};
        for (const row of dbMetrics) {
            dbMap[row._id] = { sent: row.sent, failed: row.failed, retried: row.retried, dlq: row.dlq };
        }

        const channels = {
            email: {
                queue: { waiting: emailQ.waiting, active: emailQ.active, completed: emailQ.completed, failed: emailQ.failed, delayed: emailQ.delayed },
                dlq: { size: (emailD.waiting ?? 0) + (emailD.active ?? 0) },
                totals: dbMap.email || { sent: 0, failed: 0, retried: 0, dlq: 0 },
            },
            sms: {
                queue: { waiting: smsQ.waiting, active: smsQ.active, completed: smsQ.completed, failed: smsQ.failed, delayed: smsQ.delayed },
                dlq: { size: (smsD.waiting ?? 0) + (smsD.active ?? 0) },
                totals: dbMap.sms || { sent: 0, failed: 0, retried: 0, dlq: 0 },
            },
            whatsapp: {
                queue: { waiting: waQ.waiting, active: waQ.active, completed: waQ.completed, failed: waQ.failed, delayed: waQ.delayed },
                dlq: { size: (waD.waiting ?? 0) + (waD.active ?? 0) },
                totals: dbMap.whatsapp || { sent: 0, failed: 0, retried: 0, dlq: 0 },
            },
        };

        return res.json({ success: true, windowHours: hours, since: since.toISOString(), channels });
    } catch (err) {
        logger.error({ err: err.message }, "[CommMetrics] getMetrics error");
        return res.status(500).json({ message: "Failed to fetch communication metrics", error: err.message });
    }
};

// ─── GET /api/platform/communication/retry-logs ───────────────────────────────
exports.getRetryLogs = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const channel = req.query.channel; // optional filter
        const dlqOnly = req.query.dlq === "true";

        const filter = {};
        if (channel) filter.channel = channel;
        if (dlqOnly) filter.isDLQ = true;

        const logs = await CommunicationRetryLog.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return res.json({ success: true, total: logs.length, data: logs });
    } catch (err) {
        return res.status(500).json({ message: "Failed to fetch retry logs", error: err.message });
    }
};

// ─── GET /api/platform/communication/dlq ─────────────────────────────────────
exports.getDLQJobs = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const channel = req.query.channel; // email | sms | whatsapp | all

        const dlqQueues = {
            email: emailDLQ,
            sms: smsDLQ,
            whatsapp: whatsappDLQ,
        };

        const targets = channel && dlqQueues[channel]
            ? { [channel]: dlqQueues[channel] }
            : dlqQueues;

        const result = {};
        for (const [ch, q] of Object.entries(targets)) {
            const jobs = await q.getJobs(["waiting", "active", "failed"], 0, limit - 1);
            result[ch] = jobs.map(j => ({
                id: j.id,
                name: j.name,
                data: j.data,
                failedReason: j.failedReason,
                timestamp: j.timestamp,
                attemptsMade: j.attemptsMade,
            }));
        }

        return res.json({ success: true, dlq: result });
    } catch (err) {
        return res.status(500).json({ message: "Failed to fetch DLQ jobs", error: err.message });
    }
};

// ─── POST /api/platform/communication/test/send ───────────────────────────────
exports.sendTestMessage = async (req, res) => {
    try {
        const { channel = "email", type, payload } = req.body;

        if (!type || !payload) {
            return res.status(400).json({ message: "type and payload are required" });
        }

        // Enqueue via queue (for Bull Board visibility + worker pipeline test)
        const job = await sendCommunication({ channel, type, payload });

        logger.info(
            { actor: req.platformUser?.email, channel, type, jobId: job.id },
            "[CommCenter] Test message enqueued"
        );

        // In dev mode: also fire synchronously so we can return the preview URL immediately
        // This lets the Communication Center show the Ethereal link without waiting for the worker
        let previewUrl = null;
        if (process.env.NODE_ENV !== "production" && channel === "email") {
            try {
                const { EmailService } = require("../../services/email/emailService");
                const result = await EmailService.process(type, payload);
                previewUrl = result?._previewUrl || null;
            } catch (syncErr) {
                logger.warn({ err: syncErr.message }, "[CommCenter] Sync email preview failed (queue job still enqueued)");
            }
        }

        return res.status(201).json({
            success: true,
            message: `Test ${channel} job enqueued`,
            jobId: job.id,
            channel,
            type,
            ...(previewUrl ? { previewUrl, note: "📬 Open previewUrl to view in Ethereal" } : {}),
        });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};


// ─── POST /api/platform/communication/test/bulk ───────────────────────────────
exports.sendBulkTest = async (req, res) => {
    try {
        const { items } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: "items must be a non-empty array" });
        }

        const results = await sendBulkCommunication(items);
        const fulfilled = results.filter(r => r.status === "fulfilled").length;
        const failed = results.filter(r => r.status === "rejected").length;

        return res.status(201).json({ success: true, enqueued: fulfilled, failed, results });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// ─── POST /api/platform/communication/dlq/:channel/:jobId/retry ───────────────
exports.retryDLQJob = async (req, res) => {
    try {
        const { channel, jobId } = req.params;

        const dlqQueues = { email: emailDLQ, sms: smsDLQ, whatsapp: whatsappDLQ };
        const dlq = dlqQueues[channel];

        if (!dlq) return res.status(400).json({ message: `Unknown channel: ${channel}` });

        const job = await dlq.getJob(jobId);
        if (!job) return res.status(404).json({ message: "DLQ job not found" });

        // Re-enqueue original payload via communicationService
        const { data } = job;
        const newJob = await sendCommunication({
            channel: data.channel || channel,
            type: data.type,
            payload: data.payload,
        });

        // Remove from DLQ
        await job.remove();

        logger.info(
            { actor: req.platformUser?.email, channel, originalJobId: jobId, newJobId: newJob.id },
            "[CommCenter] DLQ job retried"
        );

        return res.json({ success: true, message: "DLQ job re-queued", newJobId: newJob.id });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// ─── GET /api/platform/communication/email-events ────────────────────────────
exports.getEmailEvents = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.template) filter.template = req.query.template;

        const events = await EmailEvent.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return res.json({ success: true, total: events.length, data: events });
    } catch (err) {
        logger.error({ err: err.message }, "[CommCenter] getEmailEvents error");
        return res.status(500).json({ message: err.message });
    }
};

// ─── POST /api/platform/communication/template-preview ─────────────────────
exports.previewTemplate = async (req, res) => {
    try {
        const { template, data = {} } = req.body;

        if (!template) {
            return res.status(400).json({ message: "template name is required" });
        }

        // Safety: only allow known template names
        const ALLOWED = ["magicLink", "resetPassword", "otp", "invoice", "refund", "ticketReply", "grace", "suspension", "retryFailed"];
        if (!ALLOWED.includes(template)) {
            return res.status(400).json({ message: `Unknown template: "${template}". Allowed: ${ALLOWED.join(", ")}` });
        }

        const html = renderTemplate(template, {
            ...data,
            year: new Date().getFullYear(),
            platformName: process.env.PLATFORM_NAME || "DentalSaaS",
        });

        return res.json({ success: true, template, html });
    } catch (err) {
        logger.error({ err: err.message }, "[CommCenter] previewTemplate error");
        return res.status(500).json({ message: err.message });
    }
};
