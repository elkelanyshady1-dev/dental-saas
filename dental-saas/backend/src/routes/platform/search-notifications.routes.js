/**
 * search-notifications.routes.js
 * Platform — Unified Search + Notification Endpoints
 *
 * Routes:
 *   GET  /search                        → unified entity search (VIEW_ORGANIZATIONS)
 *   GET  /notifications                 → list notifications (VIEW_PLATFORM_ANALYTICS)
 *   GET  /notifications/unread-count    → badge count (VIEW_PLATFORM_ANALYTICS)
 *   POST /notifications/:id/read        → mark one as read (VIEW_PLATFORM_ANALYTICS)
 *   POST /notifications/read-all        → mark all as read (VIEW_PLATFORM_ANALYTICS)
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

const searchCtrl = require("../../platform/controllers/platformSearch.controller");
const notificationCtrl = require("../../platform/controllers/platformNotification.controller");

// ── Guard sets ──────────────────────────────────────────────────────────────
const pSearch = [platformProtect, authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS)];
const pNotif = [platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS)];

// ─── Search ───────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/search:
 *   get:
 *     summary: Unified entity search across organizations, users, contracts, invoices
 *     tags: [Platform Search]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 2 }
 *         description: Search query (minimum 2 characters)
 *     responses:
 *       200:
 *         description: Search results grouped by entity type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 query: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     organizations: { type: array }
 *                     users: { type: array }
 *                     contracts: { type: array }
 *                     invoices: { type: array }
 */
router.get("/search", ...pSearch, searchCtrl.search);

// ─── Notifications ────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/notifications/unread-count:
 *   get:
 *     summary: Get unread notification count for bell badge
 *     tags: [Platform Notifications]
 *     security: [{ platformBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Badge count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 count: { type: integer }
 */
// IMPORTANT: /unread-count MUST be registered before /:id/read to prevent route clash
router.get("/notifications/unread-count", ...pNotif, notificationCtrl.unreadCount);

/**
 * @swagger
 * /api/platform/notifications:
 *   get:
 *     summary: List platform notifications (paginated)
 *     tags: [Platform Notifications]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: unread
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Notification list with isRead annotation
 */
router.get("/notifications", ...pNotif, notificationCtrl.list);

/**
 * @swagger
 * /api/platform/notifications/read-all:
 *   post:
 *     summary: Mark all notifications as read for current user
 *     tags: [Platform Notifications]
 *     security: [{ platformBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: All marked as read
 */
router.post("/notifications/read-all", ...pNotif, notificationCtrl.markAllRead);

/**
 * @swagger
 * /api/platform/notifications/{id}/read:
 *   post:
 *     summary: Mark a single notification as read
 *     tags: [Platform Notifications]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.post("/notifications/:id/read", ...pNotif, notificationCtrl.markRead);

module.exports = router;
