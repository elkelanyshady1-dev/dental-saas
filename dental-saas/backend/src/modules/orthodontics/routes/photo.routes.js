/**
 * photo.routes.js — Photo SSOT routes (Phase 1)
 * ═══════════════════════════════════════════════════════════════
 * Mounted as a sub-router under /api/v1/orthodontic-cases by case.routes.js:
 *   router.use("/:caseId/photos", photoRouter)
 *
 * This keeps the existing guard stack (orgProtect → organizationContext →
 * requireEntitlement("orthodontics") → autoAudit("OrthodonticCase")) in
 * effect. We add autoAudit("Photo") so every write mutation gets its own
 * audit record with the Photo entity label.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const express = require("express");
// mergeParams:true → caseId from parent route is visible in req.params
const router  = express.Router({ mergeParams: true });

const { autoAudit } = require("@middleware/auditInterceptor");

const { photoUpload }     = require("@shared/middleware/multerMemory");
const quotaGuard          = require("@core/storage/middleware/quotaGuard");
const multerErrorHandler  = require("@middleware/multerErrorHandler.middleware");

const {
    createPhoto,
    listCasePhotos,
    linkPhotoToRecordSet,
    linkPhotoToVisit,
    deletePhoto,
    retryPhotoProcessing,
} = require("../controllers/photo.controller");

// Every write on this router is audited against the Photo entity.
router.use(autoAudit("Photo"));

// ─── Case Pool ────────────────────────────────────────────────────────────────
router.get("/", listCasePhotos);

// ─── Upload ───────────────────────────────────────────────────────────────────
router.post(
    "/",
    quotaGuard(),
    photoUpload.single("file"),
    multerErrorHandler("photos.create"),
    createPhoto
);

// ─── Linking (many-to-many) ──────────────────────────────────────────────────
router.post("/:photoId/link-recordset", linkPhotoToRecordSet);
router.post("/:photoId/link-visit",     linkPhotoToVisit);

// ─── Soft delete ─────────────────────────────────────────────────────────────
router.delete("/:photoId", deletePhoto);

// ─── Retry failed thumbnail / DICOM processing (§7.3) ───────────────────────
router.post("/:photoId/retry-processing", retryPhotoProcessing);

module.exports = router;
