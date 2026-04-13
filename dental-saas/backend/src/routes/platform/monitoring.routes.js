/**
 * monitoring.routes.js
 * Platform Routes — Communication Monitoring Dashboard
 * v1.0
 *
 * All routes guarded by platformProtect + VIEW_COMMUNICATION_METRICS.
 *
 * GUARD MATRIX:
 *   GET /monitoring/email-metrics  → VIEW_COMMUNICATION_METRICS
 *   GET /monitoring/queue-health   → VIEW_COMMUNICATION_METRICS
 *   GET /monitoring/worker-status  → VIEW_COMMUNICATION_METRICS
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

const ctrl = require("../../platform/controllers/monitoringController");

const VIEW = [platformProtect, authorizePlatformPermission(CAP.VIEW_COMMUNICATION_METRICS)];

// ─── Email Metrics ─────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/monitoring/email-metrics:
 *   get:
 *     summary: Email delivery metrics (last 24h)
 *     tags: [Platform Monitoring]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Metrics object with sent/failed/retry/DLQ totals, delivery rate, provider breakdown
 */
router.get("/email-metrics", VIEW, ctrl.getEmailMetrics);

// ─── Queue Health ──────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/monitoring/queue-health:
 *   get:
 *     summary: BullMQ queue depths for all channels
 *     tags: [Platform Monitoring]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Queue waiting/active/completed/failed counts per channel
 */
router.get("/queue-health", VIEW, ctrl.getQueueHealth);

// ─── Worker Status ─────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/monitoring/worker-status:
 *   get:
 *     summary: Worker and Redis connectivity status
 *     tags: [Platform Monitoring]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Redis + emailWorker health snapshot
 */
router.get("/worker-status", VIEW, ctrl.getWorkerStatus);

module.exports = router;
