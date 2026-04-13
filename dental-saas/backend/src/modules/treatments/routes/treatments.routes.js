/**
 * treatments.routes.js
 * Phase 3 — Clinical Operations: Treatment + Treatment Plan Routes
 *
 * Mounted at: /api/v1/treatments
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
const TreatmentDef = require("../models/Treatment.model");
const getModel = require("../../../core/db/getModel");

const {
    createTreatment,
    listTreatments,
    getTreatment,
    updateTreatmentStatus,
    createTreatmentPlan,
    listTreatmentPlans,
    getTreatmentPlan
} = require("../controllers/treatments.controller");

const validate = require("@middleware/validate");
const {
    createTreatmentSchema,
    updateTreatmentStatusSchema,
    createTreatmentPlanSchema,
} = require("../validators/treatment.validator");

const requireEntitlement = require("@middleware/requireEntitlement");

// Phase X.2.2 — subscriptionGuard removed (requireEntitlement in moduleLoader is SSOT).
router.use(orgProtect, organizationContext, requireEntitlement("clinical"));

// ═══════════════════════════════════════════════════════════════════════════════
// Treatment Records
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /treatments:
 *   get:
 *     summary: List treatments (filterable by patient, appointment, status)
 *     tags: [Treatments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *       - in: query
 *         name: appointmentId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [planned, in_progress, completed, cancelled] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated treatment list
 */
router.get("/", requireOrgPermission(P.TREATMENTS_READ), fieldFilterMiddleware("treatment"), listTreatments);

/**
 * @swagger
 * /treatments/{id}:
 *   get:
 *     summary: Get treatment by ID
 *     tags: [Treatments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Treatment details with populated procedure
 *       404:
 *         description: Treatment not found
 */
router.get("/:id", requireOrgPermission(P.TREATMENTS_READ), fieldFilterMiddleware("treatment"), getTreatment);

/**
 * @swagger
 * /treatments:
 *   post:
 *     summary: Create a treatment record
 *     tags: [Treatments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, procedureId, branchId]
 *             properties:
 *               patientId: { type: string }
 *               procedureId: { type: string }
 *               branchId: { type: string }
 *               appointmentId: { type: string }
 *               toothNumber: { type: string, description: "FDI tooth number" }
 *               surfaces: { type: array, items: { type: string, enum: [mesial, distal, buccal, lingual, occlusal, incisal] } }
 *               priceOverride: { type: number }
 *               notes: { type: string }
 *               treatmentPlanId: { type: string }
 *     responses:
 *       201:
 *         description: Treatment created
 *       404:
 *         description: Procedure not found
 */
router.post("/", requireOrgPermission(P.TREATMENTS_CREATE), policyMiddleware(P.TREATMENTS_CREATE), fieldWriteGuardMiddleware("treatment"), validate(createTreatmentSchema), createTreatment);

/**
 * @swagger
 * /treatments/{id}/status:
 *   patch:
 *     summary: Update treatment status (FSM-validated)
 *     tags: [Treatments]
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [in_progress, completed, cancelled] }
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Invalid status transition
 */
// @rls-pbac-prefetch — treatment routes — findById for PBAC policy evaluation
router.patch("/:id/status", requireOrgPermission(P.TREATMENTS_UPDATE), policyMiddleware(P.TREATMENTS_UPDATE, async (req) => getModel(req.dbConnection, TreatmentDef).findById(req.params.id)), fieldWriteGuardMiddleware("treatment"), validate(updateTreatmentStatusSchema), updateTreatmentStatus);

// ═══════════════════════════════════════════════════════════════════════════════
// Treatment Plans
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /treatments/plans:
 *   get:
 *     summary: List treatment plans
 *     tags: [Treatments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Treatment plans list
 */
router.get("/plans", requireOrgPermission(P.TREATMENTS_READ), fieldFilterMiddleware("treatment"), listTreatmentPlans);

/**
 * @swagger
 * /treatments/plans/{id}:
 *   get:
 *     summary: Get treatment plan by ID
 *     tags: [Treatments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Treatment plan details
 */
router.get("/plans/:id", requireOrgPermission(P.TREATMENTS_READ), fieldFilterMiddleware("treatment"), getTreatmentPlan);

/**
 * @swagger
 * /treatments/plans:
 *   post:
 *     summary: Create a treatment plan
 *     tags: [Treatments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, branchId, planItems]
 *             properties:
 *               patientId: { type: string }
 *               branchId: { type: string }
 *               title: { type: string }
 *               notes: { type: string }
 *               planItems:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [procedureId]
 *                   properties:
 *                     procedureId: { type: string }
 *                     toothNumber: { type: string }
 *                     estimatedPrice: { type: number }
 *                     priority: { type: integer }
 *     responses:
 *       201:
 *         description: Treatment plan created
 */
router.post("/plans", requireOrgPermission(P.TREATMENTS_CREATE), policyMiddleware(P.TREATMENTS_CREATE), fieldWriteGuardMiddleware("treatment"), validate(createTreatmentPlanSchema), createTreatmentPlan);

module.exports = router;
