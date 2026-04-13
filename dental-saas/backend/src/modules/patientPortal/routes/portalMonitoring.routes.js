/**
 * portalMonitoring.routes.js
 * Phase 3.1 Hardened + Phase 4 — Patient Portal Monitoring Routes
 *
 * Route groups:
 *   /api/v1/portal/progress      — Patient: aligner progress
 *   /api/v1/portal/photos        — Patient: photo uploads
 *   /api/v1/portal/monitoring    — Mixed: submit (patient) + review (org staff)
 *   /api/v1/portal/messages      — Mixed: patient + staff messaging
 *
 * Middleware pipeline (patient routes):
 *   patientProtect → organizationContext → portalRLSContext → assertPortalRLS
 *   → portalPermissionGuard → portalWriteGuard → portalFieldFilter → [rateLimiter] → handler
 *
 * Middleware pipeline (staff routes):
 *   orgProtect → organizationContext → requireOrgPermission → policyMiddleware
 *   → portalFieldFilter → handler
 *
 * @per-org-transactional — all portal routes — RLS + FLS + Permissions enforced
 */

"use strict";

const express = require("express");
const router = express.Router();

const patientProtect = require("../../patientDomain/access/patientProtect");
const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const policyMiddleware = require("@rbac/policyMiddleware");
const { P } = require("@rbac/orgPermissions");
const {
    portalPhotoLimiter,
    portalMessageLimiter,
    portalMonitoringLimiter,
    portalProgressLimiter,
} = require("@middleware/rateLimiter");
const { portalRLSContext, assertPortalRLS } = require("../../../middleware/portalContext");
const { portalFieldFilter, portalWriteGuard } = require("../middleware/portalFieldFilter");
const portalPermissionGuard = require("../middleware/portalPermissionGuard");

const ctrl = require("../controllers/portalMonitoring.controller");

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Aligner Progress — patient-facing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /portal/progress:
 *   get:
 *     summary: List aligner progress for the authenticated patient
 *     tags: [PortalProgress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: caseId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Aligner stage progress list
 */
router.get("/progress",
    patientProtect,
    organizationContext,
    portalRLSContext,
    assertPortalRLS,
    portalFieldFilter("portalProgress"),
    ctrl.listProgress
);

/**
 * @swagger
 * /portal/progress/{id}/activate:
 *   patch:
 *     summary: Activate an aligner stage
 *     tags: [PortalProgress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Stage activated
 */
router.patch("/progress/:id/activate",
    patientProtect,
    organizationContext,
    portalRLSContext,
    assertPortalRLS,
    portalFieldFilter("portalProgress"),
    portalProgressLimiter,
    ctrl.activateStage
);

/**
 * @swagger
 * /portal/progress/{id}/complete:
 *   patch:
 *     summary: Complete an aligner stage
 *     tags: [PortalProgress]
 *     security:
 *       - bearerAuth: []
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
 *               patientPainLevel: { type: integer, minimum: 0, maximum: 10 }
 *               patientWearHours: { type: number, minimum: 0, maximum: 24 }
 *     responses:
 *       200:
 *         description: Stage completed
 */
router.patch("/progress/:id/complete",
    patientProtect,
    organizationContext,
    portalRLSContext,
    assertPortalRLS,
    portalWriteGuard("portalProgress"),
    portalFieldFilter("portalProgress"),
    portalProgressLimiter,
    ctrl.completeStage
);

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Photos — patient upload
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /portal/photos:
 *   post:
 *     summary: Register a patient photo upload
 *     tags: [PortalPhotos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [caseId, fileKey, photoType, stageNumber]
 *             properties:
 *               caseId: { type: string }
 *               monitoringSessionId: { type: string }
 *               fileKey: { type: string, description: "S3 key after upload" }
 *               photoType: { type: string, enum: [front, left, right, bite, upper, lower] }
 *               stageNumber: { type: integer }
 *               originalFileName: { type: string }
 *               fileSize: { type: integer }
 *               mimeType: { type: string }
 *     responses:
 *       201:
 *         description: Photo registered, AI analysis queued
 */
router.post("/photos",
    patientProtect,
    organizationContext,
    portalRLSContext,
    assertPortalRLS,
    portalPermissionGuard("canUploadFiles"),
    portalWriteGuard("portalPhoto"),
    portalFieldFilter("portalPhoto"),
    portalPhotoLimiter,
    ctrl.uploadPhoto
);

/**
 * @swagger
 * /portal/photos:
 *   get:
 *     summary: List patient photos (org staff view)
 *     tags: [PortalPhotos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *       - in: query
 *         name: caseId
 *         schema: { type: string }
 *       - in: query
 *         name: monitoringSessionId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Photo list
 */
router.get("/photos",
    orgProtect,
    organizationContext,
    requireOrgPermission(P.PORTAL_READ),
    policyMiddleware(P.PORTAL_READ),
    portalFieldFilter("portalPhoto"),
    ctrl.listPhotos
);

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Monitoring Sessions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /portal/monitoring:
 *   post:
 *     summary: Patient submits a monitoring session
 *     tags: [PortalMonitoring]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [caseId, stageNumber]
 *             properties:
 *               caseId: { type: string }
 *               stageNumber: { type: integer }
 *               patientNote: { type: string }
 *     responses:
 *       201:
 *         description: Monitoring session created
 */
router.post("/monitoring",
    patientProtect,
    organizationContext,
    portalRLSContext,
    assertPortalRLS,
    portalWriteGuard("portalMonitoringSession"),
    portalFieldFilter("portalMonitoringSession"),
    portalMonitoringLimiter,
    ctrl.submitMonitoringSession
);

/**
 * @swagger
 * /portal/monitoring:
 *   get:
 *     summary: List monitoring sessions (org staff)
 *     tags: [PortalMonitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *       - in: query
 *         name: caseId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [submitted, under_review, approved, revision_required] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Monitoring sessions list
 */
router.get("/monitoring",
    orgProtect,
    organizationContext,
    requireOrgPermission(P.PORTAL_READ),
    policyMiddleware(P.PORTAL_READ),
    portalFieldFilter("portalMonitoringSession"),
    ctrl.listMonitoringSessions
);

/**
 * @swagger
 * /portal/monitoring/{id}:
 *   get:
 *     summary: Get monitoring session details
 *     tags: [PortalMonitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session with photos
 */
router.get("/monitoring/:id",
    orgProtect,
    organizationContext,
    requireOrgPermission(P.PORTAL_READ),
    policyMiddleware(P.PORTAL_READ),
    portalFieldFilter("portalMonitoringSession"),
    ctrl.getMonitoringSession
);

/**
 * @swagger
 * /portal/monitoring/{id}/review:
 *   patch:
 *     summary: Doctor reviews a monitoring session
 *     tags: [PortalMonitoring]
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
 *               status: { type: string, enum: [under_review, approved, revision_required] }
 *               doctorNotes: { type: string }
 *               doctorFeedback: { type: string }
 *               revisionDetails:
 *                 type: object
 *                 properties:
 *                   requiredPhotos: { type: array, items: { type: string } }
 *                   message: { type: string }
 *     responses:
 *       200:
 *         description: Session reviewed
 */
router.patch("/monitoring/:id/review",
    orgProtect,
    organizationContext,
    requireOrgPermission(P.MONITORING_REVIEW),
    policyMiddleware(P.MONITORING_REVIEW),
    portalFieldFilter("portalMonitoringSession"),
    ctrl.reviewMonitoringSession
);

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Messages
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /portal/messages:
 *   post:
 *     summary: Send a message (patient)
 *     tags: [PortalMessages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               patientId: { type: string }
 *               caseId: { type: string }
 *               message: { type: string, maxLength: 2000 }
 *               messageType: { type: string, enum: [text, image, system], default: text }
 *               attachments: { type: array }
 *     responses:
 *       201:
 *         description: Message sent
 */
router.post("/messages",
    patientProtect,
    organizationContext,
    portalRLSContext,
    assertPortalRLS,
    portalWriteGuard("portalMessage"),
    portalFieldFilter("portalMessage"),
    portalMessageLimiter,
    ctrl.sendMessage
);

// Staff send messages to patients
router.post("/messages/staff",
    orgProtect,
    organizationContext,
    requireOrgPermission(P.PORTAL_MANAGE),
    policyMiddleware(P.PORTAL_MANAGE),
    portalFieldFilter("portalMessage"),
    ctrl.sendMessage
);

/**
 * @swagger
 * /portal/messages/patient:
 *   get:
 *     summary: List messages (patient view — portal)
 *     tags: [PortalMessages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: caseId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Patient message thread
 */
router.get("/messages/patient",
    patientProtect,
    organizationContext,
    portalRLSContext,
    assertPortalRLS,
    portalFieldFilter("portalMessage"),
    ctrl.listMessages
);

/**
 * @swagger
 * /portal/messages:
 *   get:
 *     summary: List messages (org staff view)
 *     tags: [PortalMessages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *       - in: query
 *         name: caseId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Message thread
 */
router.get("/messages",
    orgProtect,
    organizationContext,
    requireOrgPermission(P.PORTAL_READ),
    policyMiddleware(P.PORTAL_READ),
    portalFieldFilter("portalMessage"),
    ctrl.listMessages
);

module.exports = router;
