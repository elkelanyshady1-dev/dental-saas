/**
 * observability.routes.js
 * Platform Routes — Billing Observability Dashboard
 *
 * GUARD MATRIX:
 *   GET /observability/dashboard  → VIEW_BILLING_OBSERVABILITY
 *   GET /observability/feed       → VIEW_BILLING_OBSERVABILITY
 *
 * PLANE: Platform
 */

"use strict";

const express = require("express");
const router = express.Router();

const platformProtect = require("../../middleware/platformProtect");
const authorizePlatformPermission = require("../../middleware/authorizePlatformPermission");
const { PLATFORM_CAPABILITIES } = require("@contracts/platformContract.cjs.js");

const {
    feedQuerySchema,
    dashboardQuerySchema,
    validateQuery,
} = require("../../platform/billing/observability/observability.validators");
const ctrl = require("../../platform/controllers/observabilityController");

const CAP = PLATFORM_CAPABILITIES;
const VIEW = [platformProtect, authorizePlatformPermission(CAP.VIEW_BILLING_OBSERVABILITY)];

/**
 * @swagger
 * /api/platform/observability/dashboard:
 *   get:
 *     summary: Billing observability metrics over a rolling window
 *     tags: [Platform Observability]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: query
 *         name: windowHours
 *         schema:
 *           type: integer
 *           default: 24
 *           minimum: 1
 *           maximum: 720
 *     responses:
 *       200:
 *         description: Counts of checkouts / failures / FX usage / quota alerts
 */
router.get("/dashboard", VIEW, validateQuery(dashboardQuerySchema), ctrl.getDashboard);

/**
 * @swagger
 * /api/platform/observability/feed:
 *   get:
 *     summary: Recent billing observability events (sanitized)
 *     tags: [Platform Observability]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 200
 *     responses:
 *       200:
 *         description: List of recent observability events (newest first)
 */
router.get("/feed", VIEW, validateQuery(feedQuerySchema), ctrl.getFeed);

module.exports = router;
