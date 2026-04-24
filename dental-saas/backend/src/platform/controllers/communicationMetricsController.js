/**
 * communicationMetricsController.js
 * Platform Controller — Communication Metrics + Retry Analytics
 * v2.0 — Phase 6 cleanup (Redis/BullMQ queues eradicated)
 *
 * Routes:
 *   GET  /api/platform/communication/metrics          → delivery stats per channel
 *   GET  /api/platform/communication/retry-logs       → retry history (DB)
 *   GET  /api/platform/communication/dlq              → 501 Not Implemented (see note)
 *   POST /api/platform/communication/test/send        → test message via dispatcher
 *   POST /api/platform/communication/test/bulk        → bulk test messages
 *   POST /api/platform/communication/dlq/:jobId/retry → 501 Not Implemented (see note)
 *   GET  /api/platform/communication/email-events     → email delivery history (DB)
 *   POST /api/platform/communication/template-preview → render email template
 *
 * Note on DLQ: the DLQ surface was a BullMQ construct (emailDLQ / smsDLQ /
 * whatsappDLQ) that was removed in Phase 6. The replacement path is
 * communication.dispatcher with QStash for async delivery — QStash handles
 * its own retries/backoff internally; there is no externally-inspectable
 * DLQ at the app layer. Metrics derived from CommunicationRetryLog (DB)
 * remain the authoritative retry/failure history.
 *
 * RBAC:
 *   GET routes  → VIEW_COMMUNICATION_METRICS
 *   POST routes → MANAGE_COMMUNICATION
 *
 * PLANE: Platform
 */

"use strict";

const getSharedModel = require("@core/db/getSharedModel");
const CommunicationMetricsDef = require("../../platform/models/CommunicationMetrics.model");
const CommunicationMetrics = getSharedModel(CommunicationMetricsDef);
const CommunicationRetryLogDef = require("../../platform/models/CommunicationRetryLog.model");
const CommunicationRetryLog = getSharedModel(CommunicationRetryLogDef);
const EmailEventDef = require("../../platform/models/EmailEvent.model");
const EmailEvent = getSharedModel(EmailEventDef);
const {
  sendCommunication,
  sendBulkCommunication
} = require("../../services/communicationService");
const {
  renderTemplate
} = require("../../email/engine/renderTemplate");
const logger = require("@utils/logger");

// Shared "queues were removed" response body for endpoints that cannot be
// answered without the deleted BullMQ surface. Keeping the shape consistent
// makes it easy for the frontend to detect and degrade gracefully.
const QUEUES_REMOVED_PAYLOAD = {
  success: false,
  error: "QUEUES_ERADICATED",
  reason: "BullMQ communication queues were removed in Phase 6. Sync delivery " + "goes through communication.dispatcher; async delivery goes through " + "QStash (which manages its own retries). No externally-inspectable " + "DLQ is exposed at the app layer.",
  replacement: "infrastructure/communication/communication.dispatcher.js"
};

// ─── GET /api/platform/communication/metrics ──────────────────────────────────
/**
 * @swagger
 * /api/platform/communication/metrics:
 *   get:
 *     summary: Get communication delivery metrics per channel
 *     description: Returns sent/failed/retried/dlq counts per channel from the DB aggregation. The `queue` sub-field is `null` because BullMQ queues were removed in Phase 6; live queue state is no longer tracked at the app layer. Required capability: VIEW_COMMUNICATION_METRICS.
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

    // DB aggregation is the authoritative source for historical counts.
    // Live queue state (waiting/active/delayed) no longer exists post-Phase-6.
    const dbMetrics = await CommunicationMetrics.aggregate([{
      $match: {
        bucket: {
          $gte: since
        },
        type: "ALL"
      }
    }, {
      $group: {
        _id: "$channel",
        sent: {
          $sum: "$sent"
        },
        failed: {
          $sum: "$failed"
        },
        retried: {
          $sum: "$retried"
        },
        dlq: {
          $sum: "$dlq"
        }
      }
    }]);
    const dbMap = {};
    for (const row of dbMetrics) {
      dbMap[row._id] = {
        sent: row.sent,
        failed: row.failed,
        retried: row.retried,
        dlq: row.dlq
      };
    }
    const channels = {
      email: {
        queue: null,
        // live queue state unavailable — see note in header
        totals: dbMap.email || {
          sent: 0,
          failed: 0,
          retried: 0,
          dlq: 0
        }
      },
      sms: {
        queue: null,
        totals: dbMap.sms || {
          sent: 0,
          failed: 0,
          retried: 0,
          dlq: 0
        }
      },
      whatsapp: {
        queue: null,
        totals: dbMap.whatsapp || {
          sent: 0,
          failed: 0,
          retried: 0,
          dlq: 0
        }
      }
    };
    return res.json({
      success: true,
      windowHours: hours,
      since: since.toISOString(),
      channels,
      queueStateAvailable: false,
      queueStateReason: "BullMQ queues removed in Phase 6 — use retry-logs for failure history"
    });
  } catch (err) {
    logger.error({
      err: err.message
    }, "[CommMetrics] getMetrics error");
    return res.status(500).json({
      message: "Failed to fetch communication metrics",
      error: err.message
    });
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
    const logs = await CommunicationRetryLog.find(filter).sort({
      createdAt: -1
    }).limit(limit).lean();
    return res.json({
      success: true,
      total: logs.length,
      data: logs
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to fetch retry logs",
      error: err.message
    });
  }
};

// ─── GET /api/platform/communication/dlq ─────────────────────────────────────
// BullMQ DLQ surface removed in Phase 6. Frontend should render retry-logs
// (filtered by isDLQ=true) for failure history instead.
exports.getDLQJobs = async (req, res) => {
  return res.status(501).json(QUEUES_REMOVED_PAYLOAD);
};

// ─── POST /api/platform/communication/test/send ───────────────────────────────
exports.sendTestMessage = async (req, res) => {
  try {
    const {
      channel = "email",
      type,
      payload
    } = req.body;
    if (!type || !payload) {
      return res.status(400).json({
        message: "type and payload are required"
      });
    }

    // sendCommunication now forwards to the dispatcher. The returned
    // object is { mode, ... } — no .id field (QStash messageIds for
    // async paths live inside the async.handler result if needed).
    const result = await sendCommunication({
      channel,
      type,
      payload
    });
    logger.info({
      actor: req.platformUser?.email,
      channel,
      type,
      mode: result?.mode
    }, "[CommCenter] Test message dispatched");

    // In dev mode: also fire the provider synchronously so we can return
    // an Ethereal preview URL immediately. This lets the Communication
    // Center show the preview without waiting for the async path.
    let previewUrl = null;
    if (process.env.NODE_ENV !== "production" && channel === "email") {
      try {
        const {
          EmailService
        } = require("../../services/email/emailService");
        const synchronousResult = await EmailService.process(type, payload);
        previewUrl = synchronousResult?._previewUrl || null;
      } catch (syncErr) {
        logger.warn({
          err: syncErr.message
        }, "[CommCenter] Sync email preview failed (dispatch still ran)");
      }
    }
    return res.status(201).json({
      success: true,
      message: `Test ${channel} message dispatched`,
      mode: result?.mode || "unknown",
      channel,
      type,
      ...(previewUrl ? {
        previewUrl,
        note: "📬 Open previewUrl to view in Ethereal"
      } : {})
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message
    });
  }
};

// ─── POST /api/platform/communication/test/bulk ───────────────────────────────
exports.sendBulkTest = async (req, res) => {
  try {
    const {
      items
    } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "items must be a non-empty array"
      });
    }
    const results = await sendBulkCommunication(items);
    const fulfilled = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;
    return res.status(201).json({
      success: true,
      dispatched: fulfilled,
      failed,
      results
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message
    });
  }
};

// ─── POST /api/platform/communication/dlq/:channel/:jobId/retry ───────────────
// Per-job DLQ retry was a BullMQ-only capability — the queue that held the
// failed job no longer exists. Use the test/send endpoint to redrive a
// known-failed payload, or wait for QStash's native retry schedule.
exports.retryDLQJob = async (req, res) => {
  return res.status(501).json(QUEUES_REMOVED_PAYLOAD);
};

// ─── GET /api/platform/communication/email-events ────────────────────────────
exports.getEmailEvents = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.template) filter.template = req.query.template;
    const events = await EmailEvent.find(filter).sort({
      createdAt: -1
    }).limit(limit).lean();
    return res.json({
      success: true,
      total: events.length,
      data: events
    });
  } catch (err) {
    logger.error({
      err: err.message
    }, "[CommCenter] getEmailEvents error");
    return res.status(500).json({
      message: err.message
    });
  }
};

// ─── POST /api/platform/communication/template-preview ─────────────────────
exports.previewTemplate = async (req, res) => {
  try {
    const {
      template,
      data = {}
    } = req.body;
    if (!template) {
      return res.status(400).json({
        message: "template name is required"
      });
    }

    // Safety: only allow known template names
    const ALLOWED = ["magicLink", "resetPassword", "otp", "invoice", "refund", "ticketReply", "grace", "suspension", "retryFailed"];
    if (!ALLOWED.includes(template)) {
      return res.status(400).json({
        message: `Unknown template: "${template}". Allowed: ${ALLOWED.join(", ")}`
      });
    }
    const html = renderTemplate(template, {
      ...data,
      year: new Date().getFullYear(),
      platformName: process.env.PLATFORM_NAME || "DentalSaaS"
    });
    return res.json({
      success: true,
      template,
      html
    });
  } catch (err) {
    logger.error({
      err: err.message
    }, "[CommCenter] previewTemplate error");
    return res.status(500).json({
      message: err.message
    });
  }
};