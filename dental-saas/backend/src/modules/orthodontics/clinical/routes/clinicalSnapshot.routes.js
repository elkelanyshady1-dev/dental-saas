/**
 * clinicalSnapshot.routes.js
 * Domain: clinical-snapshots
 * Layer: Interfaces > Routes
 *
 * Mounted at: /api/v1/clinical-snapshots (via featureRegistry)
 * Guard stack: orgProtect → organizationContext → requireEntitlement("clinical")
 *
 * IMMUTABILITY PRINCIPLE (Phase V3):
 *   chartState is ALWAYS immutable — no endpoint ever changes clinical chart data.
 *   PATCH /:snapshotId only mutates metadata (name, appointmentId).
 *   DELETE /:snapshotId is a soft-delete (isDeleted = true) — admin only.
 *   Hard deletes are STRICTLY FORBIDDEN at every layer.
 *
 * DOMAIN BOUNDARY:
 *   This router has NO dependency on:
 *     - procedures (billing catalog)
 *     - treatments (patient treatment records)
 *   It READS from OrthodonticCase and Appointment (via stored IDs) but
 *   NEVER mutates them from here.
 */

"use strict";

const express = require("express");
const router  = express.Router();

const orgProtect          = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement  = require("@middleware/requireEntitlement");

const {
    createSnapshot,
    getSnapshotsByCase,
    getSnapshotById,
    getPretreatmentVersions,  // Phase 3.X
    getDiagnosticSnapshot,    // Phase 3.X — singleton
    getLatestSnapshot,        // Phase V3 — auto-load latest
    updateSnapshot,           // Phase V3 — metadata-only PATCH
    deleteSnapshot,           // Phase V3 — admin soft delete
} = require("../controllers/clinicalSnapshot.controller");

// ── Auth + DB Context + Entitlement Guard ─────────────────────────────────────
// orgProtect          → verifies JWT, populates req.context
// organizationContext → sets req.dbConnection (per-org DB — REQUIRED by getModel)
// requireEntitlement  → gates on org's active plan/features
router.use(orgProtect, organizationContext, requireEntitlement("clinical-snapshots"));

// ─────────────────────────────────────────────────────────────────────────────
// WRITE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /clinical-snapshots
 * Phase 3.X: Create a new snapshot. Routes through snapshot.service.js
 * for type-conditional VisitRecord creation and visitCounter increment.
 *
 * Body: {
 *   caseId:             string (ObjectId) — REQUIRED
 *   type:               "diagnostic"|"pretreatment"|"treatment"|"post-treatment" — REQUIRED
 *   chartState:         object — REQUIRED
 *   name?:              string — display label (default: "Untitled Snapshot")
 *   appointmentId?:     string (ObjectId) — OPTIONAL
 *   visitDateOverride?: string (ISO datetime)
 *   expectedVersion?:   number — optimistic concurrency lock
 *   notes?:             { text?, tags?, warnings? }
 *   attachments?:       AttachmentDTO[]
 *   thumbnail?:         string
 *   diagnosticData?:    object — pretreatment/diagnostic only
 * }
 */
router.post("/", createSnapshot);

/**
 * PATCH /clinical-snapshots/:snapshotId
 * Phase V3: Metadata-only update. NEVER mutates chartState.
 * Allowed fields: name, appointmentId
 * RBAC: clinical.create (same role as create)
 *
 * NOTE: Declared BEFORE /:id GET to prevent route collision.
 */
router.patch("/:snapshotId", updateSnapshot);

/**
 * DELETE /clinical-snapshots/:snapshotId
 * Phase V3: SOFT DELETE ONLY — sets isDeleted = true.
 * HARD DELETES ARE STRICTLY FORBIDDEN.
 * RBAC: clinical.delete.admin — admin-only
 */
router.delete("/:snapshotId", deleteSnapshot);

// ─────────────────────────────────────────────────────────────────────────────
// READ OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /clinical-snapshots?caseId=<id>[&type=pretreatment|treatment|post-treatment]
 * List snapshots for a case (newest first). Excludes chartState.
 *
 * Query params:
 *   caseId         (required)
 *   type           (optional — filter by snapshot type)
 *   appointmentId  (optional — filter by appointment)
 *   limit          (optional, default 50, max 100)
 *   page           (optional, default 1)
 */
router.get("/", getSnapshotsByCase);

/**
 * GET /clinical-snapshots/latest?caseId=<id>[&type=treatment]
 * Phase V3: Returns the most recently created non-deleted snapshot for a case.
 * Full document (includes chartState) — used to auto-load the editor.
 *
 * IMPORTANT: Must be declared BEFORE /:id to avoid Express matching "latest" as :id.
 */
router.get("/latest", getLatestSnapshot);

/**
 * GET /clinical-snapshots/pretreatment?caseId=<id>
 * Phase 3.X: Versioned list of pretreatment snapshots.
 * NOT included in the treatment timeline.
 * Used by SnapshotHistorySidebar (Pre-Tx tab).
 *
 * IMPORTANT: Must be declared BEFORE /:id.
 */
router.get("/pretreatment", getPretreatmentVersions);

/**
 * GET /clinical-snapshots/diagnostic?caseId=<id>
 * Phase 3.X: Fetch the singleton diagnostic snapshot (full chartState).
 * Returns 404 if none exists yet (UI shows "Start Diagnosis").
 *
 * IMPORTANT: Must be declared BEFORE /:id.
 */
router.get("/diagnostic", getDiagnosticSnapshot);

/**
 * GET /clinical-snapshots/:id
 * Single snapshot by ID — INCLUDES full chartState.
 * Used by SnapshotHistorySidebar "Restore" flow.
 */
router.get("/:id", getSnapshotById);

module.exports = router;
