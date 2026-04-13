/**
 * featureRegistry.routes.js — Feature Registry Platform API
 *
 * TASK-ENTITLEMENT-FULLSTACK-001
 *
 * Mounts under /api/platform/feature-registry
 *
 * Route matrix:
 *   GET    /feature-registry                  → Full registry (modules + features + stats)
 *   GET    /feature-registry/modules          → List modules
 *   GET    /feature-registry/features         → List features (?module=key)
 *   PUT    /feature-registry/module/:id       → Update module
 *   PATCH  /feature-registry/module/:id/toggle → Toggle module enabled
 *   PUT    /feature-registry/feature/:id      → Update feature
 *   POST   /feature-registry/matrix           → Bulk plan assignment update
 *   POST   /feature-registry/seed             → Manual seed trigger
 *
 * RBAC (Sentinel §3):
 *   GET  → VIEW_ORGANIZATIONS (read registry data)
 *   PUT/POST/PATCH → MANAGE_PLATFORM_SETTINGS (mutate registry)
 *
 * PLANE: Platform.
 */

"use strict";

const express = require("express");
const router = express.Router();

const platformProtect = require("../../../middleware/platformProtect");
const requirePlatformCapability = require("../../../middleware/requirePlatformCapability");
const { PLATFORM_CAPABILITIES } = require("@contracts/platformContract.cjs.js");
const CAP = PLATFORM_CAPABILITIES;
const asyncHandler = require("@utils/asyncHandler");

const ctrl = require("../controllers/featureRegistryDb.controller");

// ── Guard Sets ───────────────────────────────────────────────────────────────
const pRead = [platformProtect, requirePlatformCapability(CAP.VIEW_ORGANIZATIONS)];
const pWrite = [platformProtect, requirePlatformCapability(CAP.MANAGE_PLATFORM_SETTINGS)];

// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/feature-registry:
 *   get:
 *     summary: Get full feature registry (modules + features + stats)
 *     tags: [FeatureRegistry]
 *     security: [{ platformBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Full registry data
 */
router.get("/feature-registry", ...pRead, asyncHandler(ctrl.getRegistry));

/**
 * @swagger
 * /api/platform/feature-registry/modules:
 *   get:
 *     summary: List all module definitions
 *     tags: [FeatureRegistry]
 *     security: [{ platformBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Module list
 */
router.get("/feature-registry/modules", ...pRead, asyncHandler(ctrl.listModules));

/**
 * @swagger
 * /api/platform/feature-registry/features:
 *   get:
 *     summary: List all feature definitions
 *     tags: [FeatureRegistry]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: module
 *         schema: { type: string }
 *         description: Filter by parent module key
 *     responses:
 *       200:
 *         description: Feature list
 */
router.get("/feature-registry/features", ...pRead, asyncHandler(ctrl.listFeatures));

// ─────────────────────────────────────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/feature-registry/module/{id}:
 *   put:
 *     summary: Update a module definition
 *     tags: [FeatureRegistry]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Updated module
 */
router.put("/feature-registry/module/:id", ...pWrite, asyncHandler(ctrl.updateModule));

/**
 * @swagger
 * /api/platform/feature-registry/module/{id}/toggle:
 *   patch:
 *     summary: Toggle module enabled state
 *     tags: [FeatureRegistry]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated module
 */
router.patch("/feature-registry/module/:id/toggle", ...pWrite, asyncHandler(ctrl.toggleModule));

/**
 * @swagger
 * /api/platform/feature-registry/feature/{id}:
 *   put:
 *     summary: Update a feature definition
 *     tags: [FeatureRegistry]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Updated feature
 */
router.put("/feature-registry/feature/:id", ...pWrite, asyncHandler(ctrl.updateFeature));

/**
 * @swagger
 * /api/platform/feature-registry/matrix:
 *   post:
 *     summary: Bulk update plan assignments (matrix toggle)
 *     tags: [FeatureRegistry]
 *     security: [{ platformBearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, key, plans]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [feature, module]
 *               key:
 *                 type: string
 *               plans:
 *                 type: object
 *                 properties:
 *                   basic: { type: boolean }
 *                   pro: { type: boolean }
 *                   enterprise: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated record
 */
router.post("/feature-registry/matrix", ...pWrite, asyncHandler(ctrl.updateMatrix));

/**
 * @swagger
 * /api/platform/feature-registry/seed:
 *   post:
 *     summary: Manually seed registry from static definitions
 *     tags: [FeatureRegistry]
 *     security: [{ platformBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Seed result
 */
router.post("/feature-registry/seed", ...pWrite, asyncHandler(ctrl.seedRegistry));

module.exports = router;
