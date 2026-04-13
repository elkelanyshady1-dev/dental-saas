/**
 * branches.routes.js — Branch Management Routes
 * Phase 1 — Organization Access Layer
 *
 * Mounted at: /api/v1/branches
 *
 * @swagger
 * tags:
 *   name: Branches
 *   description: Organization branch management (CRUD)
 */

"use strict";

const express = require("express");
const router = express.Router();
const orgProtect = require("@middleware/orgProtect");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const { P } = require("@rbac/orgPermissions");
const branchesController = require("../controllers/branches.controller");
const policyMiddleware = require("@rbac/policyMiddleware");
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");
const { fieldWriteGuardMiddleware } = require("@rbac/fieldWriteGuard");

// All branch routes require org auth
router.use(orgProtect);

/**
 * @swagger
 * /api/v1/branches:
 *   post:
 *     summary: Create a new branch in the organization
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Downtown Branch"
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [internal, external]
 *                 default: internal
 *               timezone:
 *                 type: string
 *                 default: UTC
 *     responses:
 *       201:
 *         description: Branch created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Branch name already exists
 */
router.post(
    "/",
    requireOrgPermission(P.BRANCHES_CREATE),
    policyMiddleware(P.BRANCHES_CREATE),
    fieldWriteGuardMiddleware("branch"),
    branchesController.createBranch
);

/**
 * @swagger
 * /api/v1/branches:
 *   get:
 *     summary: List branches in the organization
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [internal, external]
 *     responses:
 *       200:
 *         description: Paginated branch list
 */
router.get(
    "/",
    requireOrgPermission(P.BRANCHES_READ),
    fieldFilterMiddleware("branch"),
    branchesController.listBranches
);

/**
 * @swagger
 * /api/v1/branches/{id}:
 *   get:
 *     summary: Get a branch by ID
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Branch details (includes userCount)
 *       404:
 *         description: Branch not found
 */

// ⚠️ SUB-RESOURCE ROUTES MUST COME BEFORE /:id TO AVOID ROUTING 'chairs' AS A BRANCH ID

/**
 * @swagger
 * /api/v1/branches/{id}/chairs:
 *   get:
 *     summary: List active chairs for a branch (v32.4)
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of Chair documents for the branch
 */
router.get(
    "/:id/chairs",
    requireOrgPermission(P.BRANCHES_READ),
    branchesController.getChairs
);

/**
 * @swagger
 * /api/v1/branches/{id}/chair-analytics:
 *   get:
 *     summary: Chair utilization & revenue analytics (v32.4)
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Per-chair analytics with utilization %, revenue, and appointment counts
 */
router.get(
    "/:id/chair-analytics",
    requireOrgPermission(P.BRANCHES_READ),
    branchesController.getChairAnalytics
);

// Generic branch-by-ID (MUST come AFTER all /:id/sub-routes)
router.get(
    "/:id",
    requireOrgPermission(P.BRANCHES_READ),
    fieldFilterMiddleware("branch"),
    branchesController.getBranchById
);
/**
 * @swagger
 * /api/v1/branches/{id}:
 *   patch:
 *     summary: Update a branch
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [internal, external]
 *               isActive:
 *                 type: boolean
 *               timezone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Branch updated
 *       404:
 *         description: Branch not found
 */
router.patch(
    "/:id",
    requireOrgPermission(P.BRANCHES_UPDATE),
    policyMiddleware(P.BRANCHES_UPDATE),
    fieldWriteGuardMiddleware("branch"),
    branchesController.updateBranch
);

/**
 * @swagger
 * /api/v1/branches/{id}:
 *   delete:
 *     summary: Soft-delete a branch
 *     tags: [Branches]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Branch deleted
 *       400:
 *         description: Branch has active users assigned
 *       404:
 *         description: Branch not found
 */
router.delete(
    "/:id",
    requireOrgPermission(P.BRANCHES_DELETE),
    policyMiddleware(P.BRANCHES_DELETE),
    branchesController.deleteBranch
);

module.exports = router;
