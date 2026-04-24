/**
 * optimization.routes.js
 * Platform Routes — Cost Optimization Engine Admin (v9.4)
 *
 * Mounted at /api/platform/optimization.
 * All endpoints require platformProtect + MANAGE_ORGANIZATIONS.
 *
 * PLANE: Platform.
 */

"use strict";

const express = require("express");
const router = express.Router();

const platformProtect = require("../../middleware/platformProtect");
const authorizePlatformPermission = require("../../middleware/authorizePlatformPermission");
const { PLATFORM_CAPABILITIES } = require("@contracts/platformContract.cjs.js");
const CAP = PLATFORM_CAPABILITIES;

const ctrl = require("../../platform/optimization/optimization.controller");

const ADMIN = [platformProtect, authorizePlatformPermission(CAP.MANAGE_ORGANIZATIONS)];

/**
 * @swagger
 * /api/platform/optimization/report:
 *   get:
 *     summary: "Latest cost recommendation per organization"
 *     description: "Dashboard table data. Optional ?status filter and ?limit cap."
 *     tags: [CostOptimization]
 *     security: [{ platformToken: [] }]
 *     responses:
 *       200: { description: "List of latest recommendations" }
 */
router.get("/report", ...ADMIN, ctrl.getReport);

/**
 * @swagger
 * /api/platform/optimization/scheduler:
 *   get:
 *     summary: "Scheduler status (last cycle stats, autoExecute flag)"
 *     tags: [CostOptimization]
 *     security: [{ platformToken: [] }]
 *     responses:
 *       200: { description: "Scheduler status" }
 */
router.get("/scheduler", ...ADMIN, ctrl.getSchedulerStatus);

/**
 * @swagger
 * /api/platform/optimization/report/{orgId}:
 *   get:
 *     summary: "Latest recommendation for a single org"
 *     tags: [CostOptimization]
 *     security: [{ platformToken: [] }]
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Recommendation document" }
 *       404: { description: "No recommendation exists for this org" }
 */
router.get("/report/:orgId", ...ADMIN, ctrl.getOrgRecommendation);

/**
 * @swagger
 * /api/platform/optimization/run:
 *   post:
 *     summary: "Force an immediate analyzer sweep"
 *     description: "Synchronous; heavy on large fleets. Returns cycle stats."
 *     tags: [CostOptimization]
 *     security: [{ platformToken: [] }]
 *     responses:
 *       200: { description: "Sweep complete (cycle stats in body)" }
 *       409: { description: "Another cycle is already in flight" }
 */
router.post("/run", ...ADMIN, ctrl.runAnalyzer);

/**
 * @swagger
 * /api/platform/optimization/execute/{orgId}:
 *   post:
 *     summary: "Execute the latest recommendation for an org"
 *     description: "MOVE/DOWNGRADE -> starts Phase 8 migration. ARCHIVE -> flips flags. KEEP/PARTIAL -> no-op (logged)."
 *     tags: [CostOptimization]
 *     security: [{ platformToken: [] }]
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recommendationId: { type: string }
 *     responses:
 *       200: { description: "Execution result" }
 *       409: { description: "Recommendation already executed / no target / etc." }
 */
router.post("/execute/:orgId", ...ADMIN, ctrl.execute);

module.exports = router;
