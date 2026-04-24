/**
 * migration.routes.js
 * Platform Routes — Phase 8 Org Cluster Migration Admin
 *
 * Mounted at /api/platform/migration.
 * All endpoints require platformProtect + MANAGE_ORGANIZATIONS capability.
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

const ctrl = require("../../platform/migration/migration.controller");

const ADMIN = [platformProtect, authorizePlatformPermission(CAP.MANAGE_ORGANIZATIONS)];

/**
 * @swagger
 * /api/platform/migration/orgs:
 *   get:
 *     summary: "List organizations with migration-relevant fields"
 *     description: "Dashboard table data. Returns name / cluster / migrationState / writeLocked / routingEpoch for every org."
 *     tags: [Migration]
 *     security: [{ platformToken: [] }]
 *     responses:
 *       200:
 *         description: "List of orgs"
 */
router.get("/orgs", ...ADMIN, ctrl.listOrgs);

/**
 * @swagger
 * /api/platform/migration/{orgId}:
 *   get:
 *     summary: "Get migration status for a single org"
 *     description: "Returns state, progress %, source/target cluster, recent log entries. Polled by the dashboard during an active migration."
 *     tags: [Migration]
 *     security: [{ platformToken: [] }]
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "Migration status snapshot"
 */
router.get("/:orgId", ...ADMIN, ctrl.getStatus);

/**
 * @swagger
 * /api/platform/migration/start:
 *   post:
 *     summary: "Start a cluster migration for an org"
 *     description: "Sets writeLocked=true, targetCluster, generates migrationId, transitions to PREPARING."
 *     tags: [Migration]
 *     security: [{ platformToken: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orgId, targetCluster]
 *             properties:
 *               orgId:         { type: string }
 *               targetCluster: { type: string, example: "MEA-EG-2" }
 *               reason:        { type: string }
 *     responses:
 *       202:
 *         description: "Migration accepted (PREPARING)"
 */
router.post("/start", ...ADMIN, ctrl.startMigration);

/**
 * @swagger
 * /api/platform/migration/{orgId}/sync:
 *   post:
 *     summary: "Run the sync phase (PREPARING -> SYNCING -> CUTOVER_PENDING)"
 *     description: "Stub today: state-machine advance only. Real change-stream replay engine lands as a follow-up."
 *     tags: [Migration]
 *     security: [{ platformToken: [] }]
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Sync transition complete" }
 */
router.post("/:orgId/sync", ...ADMIN, ctrl.runSync);

/**
 * @swagger
 * /api/platform/migration/{orgId}/cutover:
 *   post:
 *     summary: "Atomic cluster swap + routingEpoch++ + cache eviction"
 *     description: "CUTOVER_PENDING -> CUTOVER -> VERIFYING. Bumps routingEpoch and calls dbManager.evictByOrg."
 *     tags: [Migration]
 *     security: [{ platformToken: [] }]
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Cutover complete (state=VERIFYING)" }
 */
router.post("/:orgId/cutover", ...ADMIN, ctrl.cutover);

/**
 * @swagger
 * /api/platform/migration/{orgId}/verify:
 *   post:
 *     summary: "Mark migration COMPLETE and clear metadata"
 *     description: "VERIFYING -> COMPLETE. Clears migrationState, migrationId, targetCluster."
 *     tags: [Migration]
 *     security: [{ platformToken: [] }]
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "Migration cleared" }
 */
router.post("/:orgId/verify", ...ADMIN, ctrl.verifyAndComplete);

/**
 * @swagger
 * /api/platform/migration/{orgId}/rollback:
 *   post:
 *     summary: "Abort an in-progress migration"
 *     description: "Safe up to CUTOVER_PENDING. Refused after VERIFYING (reverse migration required)."
 *     tags: [Migration]
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
 *               reason: { type: string }
 *     responses:
 *       200: { description: "Migration rolled back (state=FAILED)" }
 */
router.post("/:orgId/rollback", ...ADMIN, ctrl.rollback);

module.exports = router;
