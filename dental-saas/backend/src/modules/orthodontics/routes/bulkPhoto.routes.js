/**
 * bulkPhoto.routes.js — Bulk Photo Upload / Image Pool Routes
 * ═══════════════════════════════════════════════════════════════
 * Mounted inside orthodonticCase.routes.js (shares base path and
 * common middleware: orgProtect, organizationContext, requireEntitlement).
 *
 * Routes:
 *   POST   /:caseId/record-sets/:recordSetId/photos/bulk       → bulk upload
 *   GET    /:caseId/record-sets/:recordSetId/photos/pool        → list pool
 *   PATCH  /:caseId/record-sets/:recordSetId/photos/:photoId/assign   → assign
 *   PATCH  /:caseId/record-sets/:recordSetId/photos/:photoId/unassign → unassign
 *   DELETE /:caseId/record-sets/:recordSetId/photos/:photoId          → soft delete
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const express = require("express");
const router  = express.Router();

const requireOrgPermission = require("@middleware/requireOrgPermission");
const { P } = require("@rbac/orgPermissions");
const { photoUpload } = require("@shared/middleware/multerMemory");
const quotaGuard = require("@core/storage/middleware/quotaGuard");

const ctrl = require("../controllers/bulkPhoto.controller");

// ─── Bulk Upload (max 30 files per batch) ───────────────────────────────────
router.post(
    "/:caseId/record-sets/:recordSetId/photos/bulk",
    requireOrgPermission(P.ORTHO_FULL),
    quotaGuard(),
    photoUpload.array("files", 30),
    ctrl.bulkUploadPhotos
);

// ─── List Pool ──────────────────────────────────────────────────────────────
router.get(
    "/:caseId/record-sets/:recordSetId/photos/pool",
    requireOrgPermission(P.ORTHO_READ),
    ctrl.listPool
);

// ─── Assign to View ─────────────────────────────────────────────────────────
router.patch(
    "/:caseId/record-sets/:recordSetId/photos/:photoId/assign",
    requireOrgPermission(P.ORTHO_FULL),
    ctrl.assignToView
);

// ─── Unassign from View ─────────────────────────────────────────────────────
router.patch(
    "/:caseId/record-sets/:recordSetId/photos/:photoId/unassign",
    requireOrgPermission(P.ORTHO_FULL),
    ctrl.unassignFromView
);

// ─── Delete from Pool (soft) ────────────────────────────────────────────────
router.delete(
    "/:caseId/record-sets/:recordSetId/photos/:photoId",
    requireOrgPermission(P.ORTHO_FULL),
    ctrl.deleteFromPool
);

module.exports = router;
