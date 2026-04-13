/**
 * clinicalCases.routes.js
 * Domain: orthodontic-cases
 * Layer: Interfaces > Routes (Phase 3 — Clinical Case Engine)
 *
 * Mounted at: /api/v1/orthodontic-cases (via featureRegistry — extends existing entry)
 *
 * This file REPLACES orthodonticCase.routes.js as the master router.
 * It consolidates Phase 2 (list, get, status) + Phase 3 (create, phases, timeline, snapshots).
 *
 * Guard stack: orgProtect → organizationContext → requireEntitlement("clinical")
 *
 * IMMUTABILITY:
 *   No PUT/PATCH on snapshots. Snapshots are write-once.
 *   Phase transitions go through POST /:id/advance-phase (FSM-enforced).
 */

"use strict";

const express = require("express");
const router  = express.Router();

const orgProtect          = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement  = require("@middleware/requireEntitlement");
const { autoAudit }        = require("@middleware/auditInterceptor");

// Canonical controller — single aggregate root (Phase 2 merge)
const {
    listCases,
    getCase,
    createCase,
    updateCaseStatus,
    getPhasesForCase,
    advanceCasePhase,
    getCaseTimeline,
    getVisitDetail,
    saveSnapshot,
    getWorkflow,
    saveWorkflow,
    patchWorkflow,
    runAudit,
} = require("../controllers/case.controller");

// Alias: route file uses getCaseDetail — maps to the unified getCase handler
const getCaseDetail = getCase;

// File upload middleware — reuse canonical shared instances (no local multer init).
// multerMemory: buffers to memory → storageService handles persistence
// quotaGuard:   pre-checks org quota BEFORE multer buffers the file
const { photoUpload, stlUpload, audioUpload } = require("@shared/middleware/multerMemory");
const quotaGuard = require("@core/storage/middleware/quotaGuard");

// Upload controllers — delegate to Phase 4 orthodontics ctrl (canonical implementation).
// Cross-reference is intentional: avoids duplicating storageService logic.
// Both modules share the same route path (/api/v1/orthodontic-cases) so this is safe.
const {
    uploadOrthoPhoto,
    uploadOrthoStl,
    uploadOrthoAudio,
} = require("../../controllers/orthodonticCase.controller");

// Guard stack
router.use(orgProtect, organizationContext, requireEntitlement("orthodontics"), autoAudit("OrthodonticCase"));

// ─────────────────────────────────────────────────────────────────────────────
// FILE UPLOADS  — MUST be FIRST (before /:id) to avoid path collisions.
// "uploads" is a literal path segment. If registered after /:id, Express
// treats "uploads" as a case ObjectId → routes to getCaseDetail (wrong).
// Chain: quotaGuard (pre-check quota) → multer (buffer) → controller
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /orthodontic-cases/uploads/photo
 * Upload an orthodontic photo (X-ray, intraoral, extraoral, panoramic).
 * Max 25MB. Accepted: jpg, jpeg, png, webp, bmp, tiff.
 */
router.post("/uploads/photo",
    quotaGuard(),
    photoUpload.single("file"),
    uploadOrthoPhoto
);

/**
 * POST /orthodontic-cases/uploads/stl
 * Upload an orthodontic 3D scan (STL, PLY, OBJ). Max 100MB.
 */
router.post("/uploads/stl",
    quotaGuard(),
    stlUpload.single("file"),
    uploadOrthoStl
);

/**
 * POST /orthodontic-cases/uploads/audio
 * Upload an orthodontic voice note. Max 10MB.
 * Accepted: webm, wav, ogg, mp3, m4a.
 */
router.post("/uploads/audio",
    quotaGuard(),
    audioUpload.single("file"),
    uploadOrthoAudio
);

// ─────────────────────────────────────────────────────────────────────────────
// CASE COLLECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /orthodontic-cases
 * List cases for org. Filter by patientId and/or status.
 */
router.get("/", listCases);


/**
 * GET /orthodontic-cases/audit/clinical-engine
 * Engine self-diagnostic audit.
 * IMPORTANT: Mounted BEFORE /:id to prevent Express treating "audit" as a case ID.
 * Requires: clinical.admin permission (falls back to clinical.read)
 */
router.get("/audit/clinical-engine", runAudit);

/**
 * POST /orthodontic-cases
 * Create a new OrthodonticCase + 4 default CasePhase documents.
 * Enforces: one active case per patient per org.
 *
 * Body: { patientId: string, caseType?: string }
 */
router.post("/", createCase);

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW (6-step clinical wizard)
// CRITICAL: These MUST be registered BEFORE /:id to prevent Express from
// interpreting "workflow" as a case ObjectId in the /:id route.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /orthodontic-cases/:id/workflow
 * Returns saved workflowData for the 6-step clinical wizard.
 * workflowData is null for brand-new cases (no save yet) — not a 404.
 */
router.get("/:id/workflow", getWorkflow);

/**
 * PUT /orthodontic-cases/:id/workflow
 * Saves (upserts) the full workflow state for the 6-step wizard.
 * Supports optimistic concurrency via expectedVersion in body.
 * Response: { workflowVersion, currentSnapshotId }
 */
router.put("/:id/workflow", saveWorkflow);

/**
 * PATCH /orthodontic-cases/:id/workflow  — Enterprise Autosave (Phase 3.3)
 * Applies a SPARSE diff to workflowData fields using MongoDB dot-notation writes.
 * Only changed fields are written — eliminates full-document rewrites on autosave.
 *
 * Body: { changes: { [field]: value }, expectedVersion: number, trigger?: string }
 * Response: { workflowVersion }
 *
 * ORDERING: Must be registered BEFORE /:id to avoid Express treating "workflow" as ObjectId.
 */
router.patch("/:id/workflow", patchWorkflow);


// ─────────────────────────────────────────────────────────────────────────────
// CASE INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /orthodontic-cases/:id
 * Full case detail — includes phases[] array.
 * (Phase 3 extension of Phase 2 getCaseById)
 */
router.get("/:id", getCaseDetail);


/**
 * PATCH /orthodontic-cases/:id/status
 * FSM status transition for a case.
 * Valid: draft → diagnosis → treatment_planning → active → completed | cancelled
 */
router.patch("/:id/status", updateCaseStatus);

// ─────────────────────────────────────────────────────────────────────────────
// PHASE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /orthodontic-cases/:id/phases
 * Returns the ordered phase list + active phase for a case.
 */
router.get("/:id/phases", getPhasesForCase);

/**
 * POST /orthodontic-cases/:id/advance-phase
 * Advances a case to the next phase in the linear FSM:
 *   bonding → active → retention → post-treatment
 * Completes the current phase, activates the next.
 * Returns: { completed, activated, isLastPhase }
 */
router.post("/:id/advance-phase", advanceCasePhase);

// ─────────────────────────────────────────────────────────────────────────────
// TIMELINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /orthodontic-cases/:id/timeline
 * Returns ordered visit timeline for a case.
 * Procedures are sourced from ClinicalSnapshots (SOURCE OF TRUTH).
 *
 * Response: TimelineEntry[] sorted by visitNumber asc
 */
router.get("/:id/timeline", getCaseTimeline);

/**
 * GET /orthodontic-cases/:caseId/timeline/:visitId
 * Returns full detail for a single visit:
 *   - VisitRecord (metadata)
 *   - ClinicalSnapshot (procedures, notes, attachments — SOURCE OF TRUTH)
 *   - CasePhase (phase name, status)
 * chartState is EXCLUDED (large — fetch /snapshots/:id separately if needed)
 */
router.get("/:caseId/timeline/:visitId", getVisitDetail);

// ─────────────────────────────────────────────────────────────────────────────
// SNAPSHOTS (CRITICAL PATH)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /orthodontic-cases/:caseId/snapshots
 * THE CRITICAL FLOW:
 *   1. Verify case + appointment belong to org
 *   2. Guard against duplicate visit record
 *   3. Fetch previous snapshot for diff
 *   4. Generate procedures from chartState diff (auto — no manual action logs)
 *   5. Create ClinicalSnapshot (immutable)
 *   6. Create VisitRecord (links snapshot → appointment → case → phase)
 *
 * Body: {
 *   appointmentId?: string (ObjectId)
 *   chartState:     object (REQUIRED — full dental chart state)
 *   thumbnail?:     string
 *   notes?:         string | { text, tags, warnings }
 *   attachments?:   AttachmentDTO[]
 * }
 *
 * ❌ NO PUT/PATCH/DELETE on snapshots — immutable by design
 */
router.post("/:caseId/snapshots", saveSnapshot);

module.exports = router;
