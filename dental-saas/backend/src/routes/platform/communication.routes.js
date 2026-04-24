/**
 * communication.routes.js
 * Platform Routes — Communication Infrastructure Admin
 * v1.0
 *
 * All routes guarded by platformProtect.
 * GET routes:  VIEW_COMMUNICATION_METRICS
 * POST routes: MANAGE_COMMUNICATION
 *
 * PLANE: Platform
 */

"use strict";

const express = require("express");
const router = express.Router();

const platformProtect = require("../../middleware/platformProtect");
const authorizePlatformPermission = require("../../middleware/authorizePlatformPermission");
const { PLATFORM_CAPABILITIES } = require("@contracts/platformContract.cjs.js");
const CAP = PLATFORM_CAPABILITIES;

const ctrl = require("../../platform/controllers/communicationMetricsController");

// Middleware aliases
const VIEW = [platformProtect, authorizePlatformPermission(CAP.VIEW_COMMUNICATION_METRICS)];
const MANAGE = [platformProtect, authorizePlatformPermission(CAP.MANAGE_COMMUNICATION)];

// ─── Metrics ──────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/communication/metrics:
 *   get:
 *     summary: Get delivery metrics per channel (email/sms/whatsapp)
 *     tags: [Communication]
 *     security: [{ platformToken: [] }]
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           default: 24
 *     responses:
 *       200:
 *         description: Channel metrics including queue counts and DB totals
 */
router.get("/metrics", ...VIEW, ctrl.getMetrics);

// ─── Retry Analytics ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/communication/retry-logs:
 *   get:
 *     summary: Get retry + DLQ history
 *     tags: [Communication]
 *     security: [{ platformToken: [] }]
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           default: 24
 *     responses:
 *       200:
 *         description: Retry log entries
 */
router.get("/retry-logs", ...VIEW, ctrl.getRetryLogs);

// ─── Dead-Letter Queue ────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/communication/dlq:
 *   get:
 *     summary: List jobs in dead-letter queues
 *     tags: [Communication]
 *     security: [{ platformToken: [] }]
 *     parameters:
 *       - in: query
 *         name: channel
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: DLQ jobs grouped by channel
 */
router.get("/dlq", ...VIEW, ctrl.getDLQJobs);

/**
 * @swagger
 * /api/platform/communication/dlq/{channel}/{jobId}/retry:
 *   post:
 *     summary: Re-enqueue a DLQ job
 *     tags: [Communication]
 *     security: [{ platformToken: [] }]
 *     parameters:
 *       - in: path
 *         name: channel
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job re-enqueued successfully
 */
router.post("/dlq/:channel/:jobId/retry", ...MANAGE, ctrl.retryDLQJob);

// ─── Test Sending ─────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/communication/test/send:
 *   post:
 *     summary: Send a single test message
 *     description: "Enqueues a real job via communicationService. Required capability: MANAGE_COMMUNICATION."
 *     tags: [Communication]
 *     security: [{ platformToken: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [channel, type, payload]
 *             properties:
 *               channel:
 *                 type: string
 *                 enum: [email, sms, whatsapp]
 *               type:
 *                 type: string
 *               payload:
 *                 type: object
 *     responses:
 *       201:
 *         description: Test job enqueued
 */
router.post("/test/send", ...MANAGE, ctrl.sendTestMessage);

/**
 * @swagger
 * /api/platform/communication/test/bulk:
 *   post:
 *     summary: Send bulk test messages
 *     tags: [Communication]
 *     security: [{ platformToken: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     channel:
 *                       type: string
 *                     type:
 *                       type: string
 *                     payload:
 *                       type: object
 *     responses:
 *       201:
 *         description: Bulk test results
 */
router.post("/test/bulk", ...MANAGE, ctrl.sendBulkTest);

// ─── Email Inspector — Event Log ─────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/communication/email-events:
 *   get:
 *     summary: Get recent email job events for the Email Inspector
 *     tags: [Communication]
 *     security: [{ platformToken: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: template
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Email events list
 */
router.get("/email-events", ...VIEW, ctrl.getEmailEvents);

// ─── Template Preview ─────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/communication/template-preview:
 *   post:
 *     summary: Render an email template and return HTML (no email sent)
 *     tags: [Communication]
 *     security: [{ platformToken: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [template]
 *             properties:
 *               template:
 *                 type: string
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Rendered HTML string
 */
router.post("/template-preview", ...VIEW, ctrl.previewTemplate);

module.exports = router;
