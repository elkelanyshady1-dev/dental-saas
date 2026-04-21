/**
 * Platform Analytics Routes
 * Auto-split from platformRoutes.js
 */
const express = require("express");
const router = express.Router();
const platformProtect = require("../../middleware/platformProtect");
const superAdminOnly = require("../../middleware/superAdminOnly");
const authorizePlatformPermission = require("../../middleware/authorizePlatformPermission");
const { PLATFORM_CAPABILITIES } = require('@contracts/platformContract.cjs.js');
const CAP = PLATFORM_CAPABILITIES;

const { getPlatformAnalytics, getLatestEvents } = require("../../platform/controllers/platformAnalyticsController");
const { getPlatformRevenueAnalytics } = require("../../platform/controllers/platformOrganizationController");
const revenueController = require("../../platform/domain/controllers/platformRevenue.controller");

const pRev = [platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS)];



// ─── Dashboard ───────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/dashboard:
 *   get:
 *     summary: Get platform dashboard
 *     description: "Returns dashboard overview for authenticated platform user. Required capability: VIEW_PLATFORM_ANALYTICS."
 *     tags: [Platform Dashboard]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Dashboard overview with user context
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 */
// v20.1 Wave3 — Guarded: VIEW_PLATFORM_ANALYTICS
router.get("/dashboard", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), (req, res) => {
    res.json({
        message: "Platform dashboard",
        user: {
            id: req.platformUser._id,
            name: req.platformUser.name,
            email: req.platformUser.email,
            role: req.platformUser.role,
            permissions: req.platformUser.permissions
        }
    });
});


// ─── Platform Analytics ───────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/analytics:
 *   get:
 *     summary: Get platform analytics
 *     description: "Returns platform-wide analytics including totals, growth, and system health. Required capability: VIEW_PLATFORM_ANALYTICS."
 *     tags: [Platform Analytics]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Platform analytics object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totals:
 *                   type: object
 *                 organizations:
 *                   type: integer
 *                 activeOrganizations:
 *                   type: integer
 *                 branches:
 *                   type: integer
 *                 users:
 *                   type: integer
 *                 patients:
 *                   type: integer
 *                 appointments:
 *                   type: integer
 *                 growth:
 *                   type: object
 *                 systemHealth:
 *                   type: object
 *                 newOrganizationsToday:
 *                   type: integer
 *                 status:
 *                   type: string
 *                 dbConnected:
 *                   type: boolean
 *                 uptime:
 *                   type: number
 */
router.get("/analytics", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), getPlatformAnalytics);


/**
 * @swagger
 * /api/platform/analytics/events:
 *   get:
 *     summary: Get latest platform events
 *     description: "Returns recent platform events for analytics dashboard. Required capability: VIEW_PLATFORM_ANALYTICS."
 *     tags: [Platform Analytics]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Recent events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get("/analytics/events", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), getLatestEvents);


// ─── Platform Analytics ───────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/analytics/revenue:
 *   get:
 *     summary: Get platform revenue analytics
 *     description: "Returns revenue breakdown by plan, MRR projections, and subscription status counts. Required capability: VIEW_PLATFORM_ANALYTICS."
 *     tags: [Platform Analytics]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Revenue analytics object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalOrganizations:
 *                   type: integer
 *                 activeSubscriptions:
 *                   type: integer
 *                 projectedMRR:
 *                   type: number
 *                 revenueByPlan:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get("/analytics/revenue", ...pRev, getPlatformRevenueAnalytics);

// ─── Sales Metrics ────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/metrics/sales:
 *   get:
 *     summary: Get sales metrics
 *     description: "Returns sales metrics and revenue data. Required capability: VIEW_PLATFORM_ANALYTICS."
 *     tags: [Platform Revenue]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Sales metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get("/metrics/sales", platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS), revenueController.getSalesMetrics);


// ─── Email Queue Metrics ───────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/analytics/queue-metrics:
 *   get:
 *     summary: Get email queue job counts
 *     description: "Returns real-time job counts from the emailQueue (waiting, active, completed, failed, delayed). Required capability: VIEW_PLATFORM_ANALYTICS."
 *     tags: [Platform Analytics]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Queue health metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 queue:
 *                   type: string
 *                   example: emailQueue
 *                 waiting:
 *                   type: integer
 *                 active:
 *                   type: integer
 *                 completed:
 *                   type: integer
 *                 failed:
 *                   type: integer
 *                 delayed:
 *                   type: integer
 *                 paused:
 *                   type: integer
 *                 fetchedAt:
 *                   type: string
 *                   format: date-time
 */
router.get("/analytics/queue-metrics",
    platformProtect,
    authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS),
    async (req, res) => {
        // Phase 6: BullMQ emailQueue was removed; async delivery now flows
        // through QStash, which does not expose waiting/active/delayed
        // counts to the app layer. Return a honest "gone" response so the
        // frontend can render a disabled-widget state instead of a 500.
        return res.status(501).json({
            success: false,
            error: "QUEUES_ERADICATED",
            reason: "BullMQ queues removed in Phase 6. Async delivery goes through QStash (no app-layer queue counts).",
            replacement: "infrastructure/communication/communication.dispatcher.js",
        });
    }
);


// ─── Worker Health ───────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/analytics/worker-health:
 *   get:
 *     summary: Get email worker + Redis health status
 *     description: "Returns the running state of the email worker and Redis connection status. Required capability: VIEW_PLATFORM_ANALYTICS."
 *     tags: [Platform Analytics]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Worker health report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 emailWorker:
 *                   type: string
 *                   enum: [running, stopped]
 *                 redis:
 *                   type: string
 *                   enum: [connected, disconnected, error]
 *                 redisStatus:
 *                   type: string
 *                 checkedAt:
 *                   type: string
 *                   format: date-time
 */
router.get("/analytics/worker-health",
    platformProtect,
    authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS),
    async (req, res) => {
        // Phase 6: Redis + BullMQ workers (emailWorker, smsWorker,
        // notification.worker, communication.worker) were all removed.
        // There is no in-process worker pool to health-check, and no
        // Redis connection to ping. Return the honest "gone" state so
        // the frontend reflects reality rather than throwing 500s.
        return res.json({
            emailWorker: "removed-phase-6",
            redis: "removed-phase-6",
            redisStatus: "n/a",
            checkedAt: new Date().toISOString(),
            note: "BullMQ + Redis removed in Phase 6; async delivery via QStash, sync via communication.dispatcher",
        });
    }
);


module.exports = router;
