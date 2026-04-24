/**
 * file.routes.js — File Module Routes
 * Phase v27 — Storage + Infra Hardening
 *
 * Routes:
 *   POST   /files/upload    — Upload a file (multipart/form-data)
 *   GET    /files            — List files (with filters)
 *   GET    /files/:id/url   — Get signed URL for a file
 *   DELETE /files/:id       — Soft-delete a file
 *
 * Guard chain (inherited from parent):
 *   protect → featureFlagMiddleware → orgSubscriptionGuard
 *   → branchContextMiddleware → unifiedCapabilityMiddleware
 *   → rlsContext → secureFlowMiddleware
 *
 * Additional guards per route:
 *   requireOrgPermission(P.FILES_*)  → RBAC permission check
 *   policyMiddleware(P.FILES_*)      → PBAC policy evaluation
 *   quotaGuard()                     → Storage quota enforcement (upload only)
 *   generalUpload.single("file")    → Multer memory upload (upload only)
 *
 * PLANE: Organization
 */

"use strict";

const express = require("express");
const router = express.Router();

const { P } = require("@rbac/orgPermissions");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const policyMiddleware = require("@rbac/policyMiddleware");
const quotaGuard = require("@core/storage/middleware/quotaGuard");
const { generalUpload } = require("@shared/middleware/multerMemory");

const ctrl = require("../controllers/file.controller");

// ─── POST /files/upload ─────────────────────────────────────────────────────
// Upload a file. MIME/size validation happens in the service layer per category.
router.post(
    "/upload",
    requireOrgPermission(P.FILES_CREATE),
    policyMiddleware(P.FILES_CREATE),
    quotaGuard(),
    generalUpload.single("file"),
    ctrl.uploadFile
);

// ─── GET /files ─────────────────────────────────────────────────────────────
// List files with optional filters: ?category=&patientId=&caseId=&page=&limit=
router.get(
    "/",
    requireOrgPermission(P.FILES_READ),
    ctrl.listFiles
);

// ─── GET /files/:id/url ─────────────────────────────────────────────────────
// Get a signed URL for a file (expires after FILE_SIGNED_URL_TTL seconds).
router.get(
    "/:id/url",
    requireOrgPermission(P.FILES_READ),
    ctrl.getFileUrl
);

// ─── DELETE /files/:id ──────────────────────────────────────────────────────
// Soft-delete a file. Pass ?purge=true to also remove the binary.
router.delete(
    "/:id",
    requireOrgPermission(P.FILES_DELETE),
    policyMiddleware(P.FILES_DELETE),
    ctrl.deleteFile
);

module.exports = router;
