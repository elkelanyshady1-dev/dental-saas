/**
 * featuresControl.routes.js — Phase 26 Features & Modules Control Center Routes
 *
 * Mounts all Features Control Center endpoints under /api/v1/org/settings/features.
 * Phase H.3: canonical Settings Hub path (previously /api/v1/org/features-control).
 * Legacy:     /api/v1/org/features-control → 307 → /api/v1/org/settings/features
 *
 * Auth stack (inherited from parent router in orgV1Routes.js):
 *   orgProtect → organizationContext
 *
 * Guard map:
 *   GET    → SECURITY_READ   (read-only introspection)
 *   POST   → SECURITY_MANAGE (write — simulation)
 *   PATCH  → SECURITY_MANAGE (write — module toggle)
 *
 * Route table:
 *   GET    /modules           → getModules       (module state resolution)
 *   GET    /modules/usage     → getUsage          (usage analytics)
 *   PATCH  /modules/:key      → toggleModule      (module enable/disable)
 *   GET    /features          → getFeatures       (feature decision chains)
 *   GET    /permissions       → getPermissions    (role × permission matrix)
 *   GET    /conflicts         → getConflicts      (conflict detection)
 *   POST   /inspect           → inspect           (auth decision simulation)
 *   POST   /inspect/batch     → inspectBatch      (batch simulation)
 *
 * PLANE: Org only.
 */

"use strict";

const express = require("express");
const router = express.Router();
const requireOrgPermission = require("../../middleware/requireOrgPermission");
const { P } = require("../../rbac/orgPermissions");

// ─── Controllers ────────────────────────────────────────────────────────────

const modulesCtrl     = require("./controllers/modules.controller");
const featuresCtrl    = require("./controllers/features.controller");
const permissionsCtrl = require("./controllers/permissions.controller");
const conflictsCtrl   = require("./controllers/conflicts.controller");
const inspectorCtrl   = require("./controllers/inspector.controller");

// ─── Validators ─────────────────────────────────────────────────────────────

const {
    validateToggleModule,
    validateInspect,
    validateInspectBatch,
    validateUsageQuery,
} = require("./validators/featuresControl.validators");

// ═══════════════════════════════════════════════════════════════════════════════
// READ endpoints (GET → SECURITY_READ)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/v1/org/features-control/modules:
 *   get:
 *     summary: Get all module states
 *     description: |
 *       Returns computed module states by resolving entitlement (plan), feature flags,
 *       admin toggles, and dependency status for every registered module.
 *       Each module includes: key, name, state (enabled/disabled/locked/flagged),
 *       dependencies, risk level, and sub-feature count.
 *     tags: [Features Control]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Module states resolved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     modules:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key:
 *                             type: string
 *                           name:
 *                             type: string
 *                           state:
 *                             type: string
 *                             enum: [enabled, disabled, locked, flagged]
 *                           category:
 *                             type: string
 *                           riskLevel:
 *                             type: string
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         enabled:
 *                           type: number
 *                         disabled:
 *                           type: number
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing security.read permission
 */
router.get(
    "/modules",
    requireOrgPermission(P.SECURITY_READ),
    modulesCtrl.getModules
);

/**
 * @swagger
 * /api/v1/org/features-control/modules/usage:
 *   get:
 *     summary: Get module usage analytics
 *     description: |
 *       Returns usage stats for modules including document counts, recent activity,
 *       and adoption metrics. Supports optional date range filtering.
 *     tags: [Features Control]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for usage window (ISO 8601)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for usage window (ISO 8601)
 *     responses:
 *       200:
 *         description: Module usage stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     usage:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           module:
 *                             type: string
 *                           count:
 *                             type: number
 *                           lastActivity:
 *                             type: string
 *                             format: date-time
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing security.read permission
 */
router.get(
    "/modules/usage",
    requireOrgPermission(P.SECURITY_READ),
    validateUsageQuery,
    modulesCtrl.getUsage
);

/**
 * @swagger
 * /api/v1/org/features-control/features:
 *   get:
 *     summary: Get feature decision chains
 *     description: |
 *       Returns all features with their full authorization decision chain.
 *       Each feature includes status, control source (Plan/Admin/Flag),
 *       risk level, and the complete auth decision pipeline showing
 *       which layers allow/deny the feature.
 *     tags: [Features Control]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Feature decisions resolved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     features:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key:
 *                             type: string
 *                           name:
 *                             type: string
 *                           module:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [active, inactive]
 *                           controlSource:
 *                             type: string
 *                             enum: [plan, admin, flag]
 *                           riskLevel:
 *                             type: string
 *                           decisionChain:
 *                             type: array
 *                             items:
 *                               type: object
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing security.read permission
 */
router.get(
    "/features",
    requireOrgPermission(P.SECURITY_READ),
    featuresCtrl.getFeatures
);

/**
 * @swagger
 * /api/v1/org/features-control/permissions:
 *   get:
 *     summary: Get live role × permission matrix
 *     description: |
 *       Returns the complete role × permission matrix from the organization's
 *       live RBAC configuration. Shows granted/denied/inherited state per cell.
 *       Roles are loaded from MongoDB; permissions are derived from the SSOT.
 *     tags: [Features Control]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Permission matrix resolved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *                     modules:
 *                       type: array
 *                       items:
 *                         type: string
 *                     matrix:
 *                       type: object
 *                       description: "Nested { role → module → action → boolean }"
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing security.read permission
 */
router.get(
    "/permissions",
    requireOrgPermission(P.SECURITY_READ),
    permissionsCtrl.getPermissions
);

/**
 * @swagger
 * /api/v1/org/features-control/conflicts:
 *   get:
 *     summary: Detect configuration conflicts
 *     description: |
 *       Runs the conflict detection engine to identify misconfigurations:
 *       missing module dependencies, permission/entitlement mismatches,
 *       stale feature flag overrides, and RBAC gaps.
 *       Returns severity-classified conflicts with actionable explanations.
 *     tags: [Features Control]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conflicts detected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     conflicts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           severity:
 *                             type: string
 *                             enum: [info, warning, critical]
 *                           message:
 *                             type: string
 *                           module:
 *                             type: string
 *                           suggestion:
 *                             type: string
 *                     count:
 *                       type: number
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing security.read permission
 */
router.get(
    "/conflicts",
    requireOrgPermission(P.SECURITY_READ),
    conflictsCtrl.getConflicts
);

// ═══════════════════════════════════════════════════════════════════════════════
// WRITE endpoints (POST/PATCH → SECURITY_MANAGE)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/v1/org/features-control/modules/{key}:
 *   patch:
 *     summary: Toggle module on/off
 *     description: |
 *       Enables or disables an organization module. Validates dependencies
 *       before disabling (prevents disabling modules required by others).
 *       Creates an audit trail entry for compliance.
 *     tags: [Features Control]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Module key (e.g. "orthodontics", "patients")
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enabled
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: Whether to enable (true) or disable (false) the module
 *               reason:
 *                 type: string
 *                 description: Optional reason for toggle (stored in audit log)
 *     responses:
 *       200:
 *         description: Module toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     key:
 *                       type: string
 *                     enabled:
 *                       type: boolean
 *                     previousState:
 *                       type: boolean
 *       400:
 *         description: Validation error or dependency conflict
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing security.manage permission
 */
router.patch(
    "/modules/:key",
    requireOrgPermission(P.SECURITY_MANAGE),
    validateToggleModule,
    modulesCtrl.toggleModule
);

/**
 * @swagger
 * /api/v1/org/features-control/inspect:
 *   post:
 *     summary: Simulate auth decision for a permission
 *     description: |
 *       Simulates the full authorization decision pipeline for a given
 *       permission, role, and optional resource context. Returns the
 *       step-by-step decision chain (RBAC → Entitlement → PBAC → Field Access)
 *       with pass/fail at each layer.
 *     tags: [Features Control]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - permission
 *             properties:
 *               permission:
 *                 type: string
 *                 description: Permission key to simulate (e.g. "patients.update")
 *               role:
 *                 type: string
 *                 description: Role to simulate for (defaults to current user's role)
 *               resourceId:
 *                 type: string
 *                 description: Optional resource ID for PBAC context
 *     responses:
 *       200:
 *         description: Simulation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     permission:
 *                       type: string
 *                     role:
 *                       type: string
 *                     finalDecision:
 *                       type: string
 *                       enum: [ALLOW, DENY]
 *                     chain:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           layer:
 *                             type: string
 *                           result:
 *                             type: string
 *                           reason:
 *                             type: string
 *       400:
 *         description: Invalid permission key
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing security.manage permission
 */
router.post(
    "/inspect",
    requireOrgPermission(P.SECURITY_MANAGE),
    validateInspect,
    inspectorCtrl.inspect
);

/**
 * @swagger
 * /api/v1/org/features-control/inspect/batch:
 *   post:
 *     summary: Batch simulate auth decisions
 *     description: |
 *       Simulates the authorization decision pipeline for multiple
 *       permission+role combinations in a single request.
 *       Returns an array of results, each with the full decision chain.
 *       Maximum 50 items per batch.
 *     tags: [Features Control]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *             properties:
 *               items:
 *                 type: array
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   required:
 *                     - permission
 *                   properties:
 *                     permission:
 *                       type: string
 *                     role:
 *                       type: string
 *                     resourceId:
 *                       type: string
 *     responses:
 *       200:
 *         description: Batch simulation results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         allowed:
 *                           type: number
 *                         denied:
 *                           type: number
 *       400:
 *         description: Validation error (empty items, exceeds max)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing security.manage permission
 */
router.post(
    "/inspect/batch",
    requireOrgPermission(P.SECURITY_MANAGE),
    validateInspectBatch,
    inspectorCtrl.inspectBatch
);

module.exports = router;
