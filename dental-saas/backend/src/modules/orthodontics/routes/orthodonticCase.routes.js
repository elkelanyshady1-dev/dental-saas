/**
 * orthodonticCase.routes.js
 * Phase 4 — Orthodontic Intelligence: Routes
 *
 * Mounted at: /api/v1/orthodontic-cases
 * Guards: orgProtect → organizationContext → requireOrgPermission
 *
 * Route groups:
 * 1. Orthodontic Case CRUD (/api/v1/orthodontic-cases)
 * 2. Scan Management (/api/v1/orthodontic-cases/:caseId/scans)
 * 3. AI Analysis (/api/v1/orthodontic-cases/:caseId/analysis)
 * 4. Aligner Plans (/api/v1/orthodontic-cases/:caseId/aligner-plans)
 */

"use strict";

const express = require("express");
const router = express.Router();

const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const { P } = require("@rbac/orgPermissions");

const ctrl = require("../controllers/orthodonticCase.controller");
const { photoUpload, stlUpload, audioUpload } = require("@shared/middleware/multerMemory");
const quotaGuard = require("@core/storage/middleware/quotaGuard");
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");
const policyMiddleware = require("@rbac/policyMiddleware");
const { fieldWriteGuardMiddleware } = require("@rbac/fieldWriteGuard");
// ✅ Phase 4 — Model now canonical in orthodontics/models/
const OrthodonticCaseDef = require("../models/orthodonticCase.model");
const getModel = require("../../../core/db/getModel");
const requireEntitlement = require("@middleware/requireEntitlement");
const { autoAudit } = require("@middleware/auditInterceptor");

// Phase X.2.2 — subscriptionGuard removed (requireEntitlement in moduleLoader is SSOT).
router.use(orgProtect, organizationContext, requireEntitlement("orthodontics"), autoAudit("OrthodonticCase"));

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Orthodontic Case CRUD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /orthodontic-cases:
 *   get:
 *     summary: List orthodontic cases
 *     tags: [OrthodonticCases]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, diagnosis, treatment_planning, active, completed] }
 *       - in: query
 *         name: malocclusionClass
 *         schema: { type: string, enum: [CLASS_I, CLASS_II_DIV_1, CLASS_II_DIV_2, CLASS_III] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated case list
 */
router.get("/", requireOrgPermission(P.ORTHO_READ), fieldFilterMiddleware("orthodonticCase"), ctrl.listCases);

/**
 * @swagger
 * /orthodontic-cases/{id}:
 *   get:
 *     summary: Get orthodontic case by ID
 *     tags: [OrthodonticCases]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Case details
 *       404:
 *         description: Case not found
 */
router.get("/:id", requireOrgPermission(P.ORTHO_READ), fieldFilterMiddleware("orthodonticCase"), ctrl.getCase);

/**
 * @swagger
 * /orthodontic-cases:
 *   post:
 *     summary: Create a new orthodontic case
 *     tags: [OrthodonticCases]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, malocclusionClass]
 *             properties:
 *               patientId: { type: string }
 *               malocclusionClass: { type: string, enum: [CLASS_I, CLASS_II_DIV_1, CLASS_II_DIV_2, CLASS_III] }
 *               caseType: { type: string, enum: [comprehensive, limited, interceptive, surgical, aligner, retention] }
 *               notes: { type: string }
 *               extractionPlan: { type: string }
 *               estimatedDurationMonths: { type: integer }
 *               retentionPlanned: { type: string }
 *     responses:
 *       201:
 *         description: Case created
 */
router.post("/", requireOrgPermission(P.ORTHO_FULL), policyMiddleware(P.ORTHO_FULL), fieldWriteGuardMiddleware("orthodonticCase"), ctrl.createCase);

/**
 * @swagger
 * /orthodontic-cases/{id}/status:
 *   patch:
 *     summary: Update case status (FSM-validated)
 *     tags: [OrthodonticCases]
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
 *               status: { type: string, enum: [diagnosis, treatment_planning, active, completed] }
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Invalid status transition
 */
// @rls-pbac-prefetch — ortho routes — findById for PBAC policy evaluation
router.patch("/:id/status", requireOrgPermission(P.ORTHO_FULL), policyMiddleware(P.ORTHO_FULL, async (req) => getModel(req.dbConnection, OrthodonticCaseDef).findById(req.params.id)), fieldWriteGuardMiddleware("orthodonticCase"), ctrl.updateCaseStatus);

/**
 * @swagger
 * /orthodontic-cases/{id}:
 *   delete:
 *     summary: Soft delete an orthodontic case
 *     description: Marks a case as deleted. Only case owner or org_admin can delete. Case can be restored via admin tools.
 *     tags: [OrthodonticCases]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Case soft-deleted successfully
 *       403:
 *         description: Forbidden - not case owner or admin
 *       404:
 *         description: Case not found
 */
router.delete("/:id", requireOrgPermission(P.ORTHO_FULL), ctrl.deleteCaseController);

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Scan Management
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /orthodontic-cases/{caseId}/scans:
 *   get:
 *     summary: List scan files for a case
 *     tags: [Scans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Scan file list
 */
router.get("/:caseId/scans", requireOrgPermission(P.ORTHO_READ), ctrl.listScans);

/**
 * @swagger
 * /orthodontic-cases/{caseId}/scans:
 *   post:
 *     summary: Register a scan file upload
 *     tags: [Scans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, fileType, fileKey]
 *             properties:
 *               patientId: { type: string }
 *               branchId: { type: string }
 *               fileType: { type: string, enum: [stl, ply, obj, dicom, npy, photo, cbct] }
 *               fileKey: { type: string, description: "S3/object storage key" }
 *               originalFileName: { type: string }
 *               fileSize: { type: integer }
 *               archType: { type: string, enum: [upper, lower, both, full_face, unknown] }
 *               localPath: { type: string, description: "Path for AI engine processing" }
 *     responses:
 *       201:
 *         description: Scan registered
 */
router.post("/:caseId/scans", requireOrgPermission(P.ORTHO_FULL), policyMiddleware(P.ORTHO_FULL), ctrl.registerScan);

// ═══════════════════════════════════════════════════════════════════════════════
// 3. AI Analysis
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /orthodontic-cases/{caseId}/analysis/segmentation:
 *   post:
 *     summary: Trigger AI tooth segmentation on a scan
 *     tags: [AIAnalysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scanFileId]
 *             properties:
 *               scanFileId: { type: string }
 *               modelVersion: { type: string, default: "latest" }
 *     responses:
 *       202:
 *         description: Segmentation analysis enqueued
 */
router.post("/:caseId/analysis/segmentation", requireOrgPermission(P.ORTHO_FULL), policyMiddleware(P.ORTHO_FULL), ctrl.triggerSegmentation);

/**
 * @swagger
 * /orthodontic-cases/{caseId}/analysis/segmentation:
 *   get:
 *     summary: Get segmentation results for a case
 *     tags: [AIAnalysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Segmentation results
 */
router.get("/:caseId/analysis/segmentation", requireOrgPermission(P.ORTHO_READ), ctrl.getSegmentationResults);

/**
 * @swagger
 * /orthodontic-cases/{caseId}/analysis/cephalometric:
 *   post:
 *     summary: Trigger AI cephalometric analysis
 *     tags: [AIAnalysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scanFileId]
 *             properties:
 *               scanFileId: { type: string }
 *               analysisType: { type: string, enum: [lateral_ceph, pa_ceph, cbct_3d, custom], default: lateral_ceph }
 *               modelVersion: { type: string, default: "latest" }
 *     responses:
 *       202:
 *         description: Cephalometric analysis enqueued
 */
router.post("/:caseId/analysis/cephalometric", requireOrgPermission(P.ORTHO_FULL), policyMiddleware(P.ORTHO_FULL), ctrl.triggerCephAnalysis);

/**
 * @swagger
 * /orthodontic-cases/{caseId}/analysis/cephalometric:
 *   get:
 *     summary: Get cephalometric analysis results
 *     tags: [AIAnalysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Cephalometric analysis results
 */
router.get("/:caseId/analysis/cephalometric", requireOrgPermission(P.ORTHO_READ), ctrl.getCephResults);

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Aligner Plans
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /orthodontic-cases/{caseId}/aligner-plans:
 *   get:
 *     summary: List aligner plans for a case
 *     tags: [AlignerPlans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Aligner plan list
 */
router.get("/:caseId/aligner-plans", requireOrgPermission(P.ORTHO_READ), ctrl.listAlignerPlans);

/**
 * @swagger
 * /orthodontic-cases/{caseId}/aligner-plans:
 *   post:
 *     summary: Create an aligner treatment plan
 *     tags: [AlignerPlans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, branchId, stageCount]
 *             properties:
 *               patientId: { type: string }
 *               branchId: { type: string }
 *               stageCount: { type: integer, min: 1 }
 *               title: { type: string }
 *               stages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     stageNumber: { type: integer }
 *                     movements: { type: array }
 *                     ipr: { type: array }
 *                     attachments: { type: array }
 *                     estimatedDays: { type: integer, default: 14 }
 *               overcorrectionStages: { type: integer }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Aligner plan created
 */
router.post("/:caseId/aligner-plans", requireOrgPermission(P.ORTHO_FULL), policyMiddleware(P.ORTHO_FULL), ctrl.createAlignerPlan);

/**
 * @swagger
 * /aligner-plans/{id}:
 *   get:
 *     summary: Get aligner plan by ID
 *     tags: [AlignerPlans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Aligner plan details
 *       404:
 *         description: Plan not found
 */
router.get("/aligner-plans/:id", requireOrgPermission(P.ORTHO_READ), ctrl.getAlignerPlan);

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Workflow Data Persistence
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /orthodontic-cases/{caseId}/record-sets/{recordSetId}:
 *   put:
 *     summary: Update an isolated record set
 *     tags: [OrthodonticWorkflow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: recordSetId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Record set updated
 */
router.put("/:caseId/record-sets/:recordSetId", requireOrgPermission(P.ORTHO_FULL), policyMiddleware(P.ORTHO_FULL, async (req) => getModel(req.dbConnection, OrthodonticCaseDef).findById(req.params.caseId)), fieldWriteGuardMiddleware("orthodonticCase"), ctrl.updateRecordSet);


/**
 * @swagger
 * /orthodontic-cases/{caseId}/workflow:
 *   get:
 *     summary: Get workflow data for an orthodontic case
 *     description: Returns the saved workflow state including record sets, problems, goals, options, and current step.
 *     tags: [OrthodonticWorkflow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Workflow data returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     workflowData:
 *                       type: object
 *                       properties:
 *                         recordSets: { type: array }
 *                         problemList: { type: object }
 *                         treatmentGoals: { type: array }
 *                         treatmentOptions: { type: array }
 *                         selectedOptionId: { type: string }
 *                         finalPlan: { type: object }
 *                         currentStep: { type: integer }
 *                         lastSavedAt: { type: string, format: date-time }
 *       404:
 *         description: Case not found
 */
router.get("/:caseId/workflow", requireOrgPermission(P.ORTHO_READ), ctrl.getWorkflow);

/**
 * @swagger
 * /orthodontic-cases/{caseId}/workflow:
 *   put:
 *     summary: Save workflow data for an orthodontic case
 *     description: Persists the current workflow state. Supports partial updates — only provided fields are overwritten.
 *     tags: [OrthodonticWorkflow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workflowData]
 *             properties:
 *               workflowData:
 *                 type: object
 *                 properties:
 *                   recordSets: { type: array }
 *                   problemList: { type: object }
 *                   treatmentGoals: { type: array }
 *                   treatmentOptions: { type: array }
 *                   selectedOptionId: { type: string }
 *                   finalPlan: { type: object }
 *                   currentStep: { type: integer, minimum: 0, maximum: 5 }
 *     responses:
 *       200:
 *         description: Workflow data saved
 *       400:
 *         description: Validation error
 *       404:
 *         description: Case not found
 */
// @rls-pbac-prefetch — ortho routes — findById for PBAC policy evaluation
router.put("/:caseId/workflow", requireOrgPermission(P.ORTHO_FULL), policyMiddleware(P.ORTHO_FULL, async (req) => getModel(req.dbConnection, OrthodonticCaseDef).findById(req.params.caseId)), fieldWriteGuardMiddleware("orthodonticCase"), ctrl.saveWorkflow);

// ═══════════════════════════════════════════════════════════════════════════════
// 5b. Workflow Snapshots (Immutable State History)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /orthodontic-cases/{caseId}/snapshots:
 *   get:
 *     summary: List workflow snapshots for a case (timeline)
 *     description: Returns paginated snapshot summaries (without heavy workflow data). Ordered newest-first.
 *     tags: [OrthodonticSnapshots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *     responses:
 *       200:
 *         description: Snapshot list with summaries
 */
router.get("/:caseId/snapshots", requireOrgPermission(P.ORTHO_READ), ctrl.listSnapshots);

/**
 * @swagger
 * /orthodontic-cases/{caseId}/snapshots/{snapshotId}:
 *   get:
 *     summary: Get a single workflow snapshot (full data)
 *     description: Returns the complete immutable snapshot including all recordSets, goals, options, etc.
 *     tags: [OrthodonticSnapshots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: snapshotId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Full snapshot data
 *       404:
 *         description: Snapshot not found
 */
router.get("/:caseId/snapshots/:snapshotId", requireOrgPermission(P.ORTHO_READ), ctrl.getSnapshot);

// ═══════════════════════════════════════════════════════════════════════════════
// 6. File Uploads (Photos & STL)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /orthodontic-cases/uploads/photo:
 *   post:
 *     summary: Upload an orthodontic photo (X-ray, intraoral, extraoral)
 *     tags: [OrthodonticUploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: "Image file (jpg, png, webp, bmp, tiff). Max 25MB."
 *     responses:
 *       201:
 *         description: Photo uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     url: { type: string, description: "Relative URL to stored file" }
 *                     originalName: { type: string }
 *                     size: { type: integer }
 *       400:
 *         description: No file or invalid file type
 *       413:
 *         description: Storage quota exceeded
 */
router.post("/uploads/photo", requireOrgPermission(P.ORTHO_FULL), policyMiddleware(P.ORTHO_FULL), quotaGuard(), photoUpload.single("file"), ctrl.uploadOrthoPhoto);

/**
 * @swagger
 * /orthodontic-cases/uploads/stl:
 *   post:
 *     summary: Upload an orthodontic 3D scan (STL, PLY, OBJ)
 *     tags: [OrthodonticUploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: "3D model file (stl, ply, obj). Max 100MB."
 *     responses:
 *       201:
 *         description: STL uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     url: { type: string, description: "Relative URL to stored file" }
 *                     originalName: { type: string }
 *                     size: { type: integer }
 *       400:
 *         description: No file or invalid file type
 *       413:
 *         description: Storage quota exceeded
 */
router.post("/uploads/stl", requireOrgPermission(P.ORTHO_FULL), policyMiddleware(P.ORTHO_FULL), quotaGuard(), stlUpload.single("file"), ctrl.uploadOrthoStl);

/**
 * @swagger
 * /orthodontic-cases/uploads/audio:
 *   post:
 *     summary: Upload an orthodontic voice note (audio recording)
 *     tags: [OrthodonticUploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: "Audio file (webm, wav, ogg, mp3, m4a). Max 10MB."
 *     responses:
 *       201:
 *         description: Audio uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     url: { type: string, description: "Relative URL to stored file" }
 *                     originalName: { type: string }
 *                     size: { type: integer }
 *       400:
 *         description: No file or invalid file type
 *       413:
 *         description: Storage quota exceeded
 */
router.post("/uploads/audio", requireOrgPermission(P.ORTHO_FULL), policyMiddleware(P.ORTHO_FULL), quotaGuard(), audioUpload.single("file"), ctrl.uploadOrthoAudio);

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Magic Link Sharing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /orthodontic-cases/{caseId}/share:
 *   post:
 *     summary: Generate a collaboration link for sharing a case externally
 *     tags: [OrthodonticSharing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type: { type: string, enum: ['case', 'records'], default: 'case' }
 *               recordIds: { type: array, items: { type: string }, description: 'Required when type is records' }
 *               expiresIn: { type: string, enum: ['1d', '3d', '7d', '14d', '30d'], default: '3d' }
 *               permissions:
 *                 type: object
 *                 properties:
 *                   canComment: { type: boolean, default: true }
 *                   canDownload: { type: boolean, default: false }
 *                   canViewAnalysis: { type: boolean, default: true }
 *               hidePatientName: { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: Collaboration link generated
 *       404:
 *         description: Case not found
 */
const sharedCaseCtrl = require("../controllers/sharedCase.controller");
router.post("/:caseId/share", requireOrgPermission(P.ORTHO_FULL), policyMiddleware(P.ORTHO_FULL), sharedCaseCtrl.createShareLink);

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Case Export (PDF Data)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /orthodontic-cases/{caseId}/export:
 *   get:
 *     summary: Export case data for PDF generation
 *     tags: [OrthodonticCases]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Export data returned
 *       404:
 *         description: Case not found
 */
const exportCtrl = require("../controllers/exportCase.controller");
router.get("/:caseId/export", requireOrgPermission(P.ORTHO_READ), exportCtrl.exportCasePdf);

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Supervisor Invitations (Org-Side — Doctor invites supervisor)
// ═══════════════════════════════════════════════════════════════════════════════

const supervisorInvitationCtrl = require("../../supervisor/controllers/invitation.controller");

/**
 * @swagger
 * /orthodontic-cases/{caseId}/invite-supervisor:
 *   post:
 *     summary: Invite a supervisor to review this case
 *     tags: [OrthodonticSupervision]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, description: "Supervisor's email address" }
 *               role: { type: string, enum: [SUPERVISOR, OBSERVER], default: SUPERVISOR }
 *               permissions:
 *                 type: object
 *                 properties:
 *                   canComment: { type: boolean, default: true }
 *                   canApprove: { type: boolean, default: true }
 *                   canViewAnalysis: { type: boolean, default: true }
 *                   canDownload: { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: Invitation created and sent
 *       409:
 *         description: Pending invitation or active access already exists
 */
router.post("/:caseId/invite-supervisor", requireOrgPermission(P.ORTHO_FULL), policyMiddleware(P.ORTHO_FULL), supervisorInvitationCtrl.createInvitation);

/**
 * @swagger
 * /orthodontic-cases/{caseId}/supervisors:
 *   get:
 *     summary: List supervisor invitations for a case
 *     tags: [OrthodonticSupervision]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of invitations
 */
router.get("/:caseId/supervisors", requireOrgPermission(P.ORTHO_READ), supervisorInvitationCtrl.listCaseInvitations);

/**
 * @swagger
 * /orthodontic-cases/{caseId}/supervisors/{invitationId}:
 *   delete:
 *     summary: Revoke a pending supervisor invitation
 *     tags: [OrthodonticSupervision]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Invitation revoked
 */
router.delete("/:caseId/supervisors/:invitationId", requireOrgPermission(P.ORTHO_FULL), supervisorInvitationCtrl.revokeInvitation);

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Internal Case Sharing (Phase 14 — Multi-Doctor Collaboration)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /orthodontic-cases/{id}/share-internal:
 *   patch:
 *     summary: Share an orthodontic case with another clinician in the org
 *     tags: [OrthodonticSharing]
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
 *             required: [userId]
 *             properties:
 *               userId: { type: string, description: "ID of the user to share with" }
 *     responses:
 *       200:
 *         description: Case shared successfully
 *       403:
 *         description: Not case owner or admin
 *       404:
 *         description: Case not found
 */
router.patch("/:id/share-internal", requireOrgPermission(P.ORTHO_FULL), ctrl.shareCaseInternal);

/**
 * @swagger
 * /orthodontic-cases/{id}/unshare-internal:
 *   patch:
 *     summary: Revoke internal sharing of a case
 *     tags: [OrthodonticSharing]
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
 *             required: [userId]
 *             properties:
 *               userId: { type: string, description: "ID of the user to remove from sharedWith" }
 *     responses:
 *       200:
 *         description: Sharing revoked
 */
router.patch("/:id/unshare-internal", requireOrgPermission(P.ORTHO_FULL), ctrl.unshareCaseInternal);

module.exports = router;
