/**
 * procedures.routes.js
 * Phase 3 — Clinical Operations: Procedure Catalog Routes
 *
 * Mounted at: /api/v1/procedures
 * Guards: orgProtect → organizationContext → requireOrgPermission → policyMiddleware → fieldFilterMiddleware
 */

"use strict";

const express = require("express");
const router = express.Router();

const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const { P } = require("@rbac/orgPermissions");
const policyMiddleware = require("@rbac/policyMiddleware");
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");
const { fieldWriteGuardMiddleware } = require("@rbac/fieldWriteGuard");
const ProcedureDef = require("../models/Procedure.model");
const getModel = require("../../../core/db/getModel");

const {
    createProcedure,
    listProcedures,
    getProcedure,
    updateProcedure,
    deleteProcedure
} = require("../controllers/procedures.controller");

const requireEntitlement = require("@middleware/requireEntitlement");

// Phase X.2.2 — subscriptionGuard removed (requireEntitlement in moduleLoader is SSOT).
router.use(orgProtect, organizationContext, requireEntitlement("clinical"));

/**
 * @swagger
 * /procedures:
 *   get:
 *     summary: List procedure catalog (paginated, filterable by category)
 *     tags: [Procedures]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: [diagnostic, preventive, restorative, endodontic, periodontic, prosthodontic, orthodontic, oral_surgery, implant, cosmetic, pediatric, emergency, other] }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated procedure list
 */
router.get("/", requireOrgPermission(P.PROCEDURES_READ), fieldFilterMiddleware("procedure"), listProcedures);

/**
 * @swagger
 * /procedures/{id}:
 *   get:
 *     summary: Get procedure by ID
 *     tags: [Procedures]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Procedure details
 *       404:
 *         description: Procedure not found
 */
router.get("/:id", requireOrgPermission(P.PROCEDURES_READ), fieldFilterMiddleware("procedure"), getProcedure);

/**
 * @swagger
 * /procedures:
 *   post:
 *     summary: Create a new procedure in the catalog
 *     tags: [Procedures]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name, defaultPrice]
 *             properties:
 *               code: { type: string, description: "Unique procedure code (auto-uppercased)" }
 *               name: { type: string }
 *               description: { type: string }
 *               defaultPrice: { type: number }
 *               category: { type: string, enum: [diagnostic, preventive, restorative, endodontic, periodontic, prosthodontic, orthodontic, oral_surgery, implant, cosmetic, pediatric, emergency, other] }
 *               requiresTooth: { type: boolean }
 *               estimatedDuration: { type: integer, description: "Minutes" }
 *     responses:
 *       201:
 *         description: Procedure created
 *       400:
 *         description: Validation error
 *       409:
 *         description: Duplicate procedure code
 */
router.post("/", requireOrgPermission(P.PROCEDURES_CREATE), policyMiddleware(P.PROCEDURES_CREATE), fieldWriteGuardMiddleware("procedure"), createProcedure);

/**
 * @swagger
 * /procedures/{id}:
 *   put:
 *     summary: Update procedure
 *     tags: [Procedures]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               defaultPrice: { type: number }
 *               category: { type: string }
 *               requiresTooth: { type: boolean }
 *               isActive: { type: boolean }
 *               expectedVersion: { type: integer }
 *     responses:
 *       200:
 *         description: Procedure updated
 *       409:
 *         description: Version conflict or duplicate code
 */
// @rls-pbac-prefetch — procedure routes — findById for PBAC policy evaluation
router.put("/:id", requireOrgPermission(P.PROCEDURES_UPDATE), policyMiddleware(P.PROCEDURES_UPDATE, async (req) => getModel(req.dbConnection, ProcedureDef).findById(req.params.id)), fieldWriteGuardMiddleware("procedure"), updateProcedure);

/**
 * @swagger
 * /procedures/{id}:
 *   delete:
 *     summary: Deactivate procedure (soft delete)
 *     tags: [Procedures]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Procedure deactivated
 *       404:
 *         description: Not found or already inactive
 */
// @rls-pbac-prefetch — procedure routes — findById for PBAC policy evaluation
router.delete("/:id", requireOrgPermission(P.PROCEDURES_DELETE), policyMiddleware(P.PROCEDURES_DELETE, async (req) => getModel(req.dbConnection, ProcedureDef).findById(req.params.id)), deleteProcedure);

module.exports = router;
