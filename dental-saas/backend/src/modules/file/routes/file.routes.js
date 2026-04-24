/**
 * file.routes.js
 * Module: file
 * Layer: HTTP Routes
 *
 * Routes:
 *   POST   /upload      — Upload a file (multipart/form-data, field name: "file")
 *   GET    /:id/access  — Get signed access URL for a FileObject
 *   DELETE /:id         — Soft-delete a FileObject
 *
 * GUARD CHAIN (per-route, layered on top of parent router guards):
 *
 *   Upload:
 *     requireOrgPermission(FILES_CREATE)  — RBAC role check
 *     policyMiddleware(FILES_CREATE)      — PBAC ownership/branch policy
 *     quotaGuard()                        — Storage quota check (pre-multer)
 *     generalUpload.single("file")        — Multer memory buffer (post-quota)
 *
 *   Access URL:
 *     requireOrgPermission(FILES_READ)    — RBAC role check
 *     (ownership enforced inside service via authorizeFileAccess)
 *
 *   Delete:
 *     requireOrgPermission(FILES_DELETE)  — RBAC role check
 *     policyMiddleware(FILES_DELETE)      — PBAC ownership/branch policy
 *
 * MIDDLEWARE ORDER RULES:
 *   - quotaGuard MUST precede multer — it uses Content-Length header for
 *     pre-upload quota estimation before the file is buffered in memory.
 *   - requireOrgPermission MUST precede policyMiddleware.
 *   - generalUpload MUST be the last middleware before the controller.
 *
 * MOUNTING:
 *   This router is designed to be mounted at a versioned org-plane path, e.g.:
 *     app.use("/api/org/file", orgProtect, dbContext, fileRouter)
 *   The parent router is responsible for authMiddleware + dbContext.
 *
 * PLANE: Organization
 */

"use strict";

const express = require("express");

const { P }                = require("@rbac/orgPermissions");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const policyMiddleware     = require("@rbac/policyMiddleware");
const quotaGuard           = require("@core/storage/middleware/quotaGuard");
const { generalUpload }    = require("@shared/middleware/multerMemory");

const ctrl = require("../controllers/file.controller");

const router = express.Router();

// ─── POST /upload ─────────────────────────────────────────────────────────────
// Multipart form: field "file" (binary) + body fields "module" and "entityId".
// quotaGuard checks Content-Length before multer buffers the file — fail-fast.
// MIME/size validation happens inside file.service.js (defense-in-depth after multer).
router.post(
    "/upload",
    requireOrgPermission(P.FILES_CREATE),
    policyMiddleware(P.FILES_CREATE),
    quotaGuard(),                        // MUST precede multer
    generalUpload.single("file"),        // Buffers file into req.file.buffer
    ctrl.uploadFile
);

// ─── GET /:id/access ──────────────────────────────────────────────────────────
// Returns a time-limited signed URL for the requested FileObject.
// File-level ownership (org + entity) is enforced inside the service via
// authorizeFileAccess(req, file) — not duplicated here.
router.get(
    "/:id/access",
    requireOrgPermission(P.FILES_READ),
    ctrl.getFileAccess
);

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
// Soft-delete only (sets deletedAt). Binary cleanup is best-effort.
// Hard deletes are FORBIDDEN — the controller delegates to soft-delete service.
router.delete(
    "/:id",
    requireOrgPermission(P.FILES_DELETE),
    policyMiddleware(P.FILES_DELETE),
    ctrl.deleteFile
);

module.exports = router;
