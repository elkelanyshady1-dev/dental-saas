/**
 * photo.controller.js — Photo SSOT HTTP handlers (Phase 1)
 * ═══════════════════════════════════════════════════════════════
 * Thin controllers. All business logic lives in photo.service.js.
 * DTOs produce the wire shape; storageKey/checksum never leave the server.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const mongoose = require("mongoose");

const { authorize } = require("../../../utils/authorize");
const logger        = require("@utils/logger");

const photoService = require("../services/photo.service");
const {
    buildPhotoDTOAsync,
    buildPhotoDTOListAsync,
} = require("../dto/photo.dto");
const {
    createPhotoSchema,
    linkRecordSetSchema,
    linkVisitSchema,
} = require("../validators/photo.validator");
const {
    validateAndDetectFileType,
} = require("../../storage/services/fileValidation.service");

function _errorResponse(res, err, fallbackCode) {
    logger.error({ err: err.message, code: err.code, event: fallbackCode }, `[photo.controller] ${fallbackCode}`);
    return res.status(err.statusCode ?? 500).json({
        success: false,
        error: {
            code:    err.code ?? fallbackCode,
            message: err.message,
            ...(err.linkedRecordSetIds ? { linkedRecordSetIds: err.linkedRecordSetIds } : {}),
            ...(err.linkedVisitIds     ? { linkedVisitIds:     err.linkedVisitIds     } : {}),
        },
    });
}

function _validateCaseId(req, res) {
    const { caseId } = req.params;
    if (!mongoose.isValidObjectId(caseId)) {
        res.status(400).json({
            success: false,
            error: { code: "INVALID_ID", message: "caseId is not a valid ObjectId" },
        });
        return null;
    }
    return caseId;
}

// ─────────────────────────────────────────────────────────────
// POST /:caseId/photos
// Multipart upload. Body metadata validated; file on req.file.
// ─────────────────────────────────────────────────────────────
async function createPhoto(req, res) {
    try {
        authorize(req, "orthodontics.full");
        const caseId = _validateCaseId(req, res);
        if (!caseId) return;

        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                success: false,
                error: { code: "MISSING_FILE", message: "file is required (multipart field)" },
            });
        }

        // metadata may arrive as a stringified JSON field when using multipart forms.
        let rawMetadata = req.body?.metadata;
        if (typeof rawMetadata === "string") {
            try { rawMetadata = JSON.parse(rawMetadata); }
            catch { rawMetadata = null; }
        }

        // 🚨 BACKEND IS THE SOURCE OF TRUTH.
        //    fileType is derived from the binary signature (magic bytes) via
        //    the shared fileValidation service — no MIME / extension / client
        //    metadata is trusted on the primary path. STL and DICOM use a
        //    filename/MIME fallback because neither has reliable magic bytes.
        //
        //    Any client-supplied `metadata.fileType` is IGNORED; we overwrite
        //    it with the authoritative result so the upload path has one
        //    source of truth.
        let validation;
        try {
            validation = await validateAndDetectFileType(req.file);
        } catch (err) {
            const status = err.statusCode || 400;
            return res.status(status).json({
                success: false,
                error: {
                    code:    err.code || "FILE_VALIDATION_FAILED",
                    message: err.message,
                    ...(err.meta ? { details: err.meta } : {}),
                },
            });
        }

        if (rawMetadata && typeof rawMetadata === "object") {
            // Trust the validator, not the client. Persist the MIME observed
            // on the multer file (browser-detected), but the fileType is
            // the signature-derived value.
            rawMetadata.mimeType = req.file.mimetype || rawMetadata.mimeType || "application/octet-stream";
            rawMetadata.fileType = validation.fileType;
        }

        const parsed = createPhotoSchema.safeParse({ metadata: rawMetadata });
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: {
                    code:    "VALIDATION_ERROR",
                    message: parsed.error.errors?.[0]?.message ?? "Validation failed",
                    details: parsed.error.flatten(),
                },
            });
        }

        const session = await req.dbConnection.startSession();
        let result;
        try {
            await session.withTransaction(async () => {
                result = await photoService.createPhoto({
                    caseId,
                    buffer:   req.file.buffer,
                    metadata: {
                        ...parsed.data.metadata,
                        originalName: parsed.data.metadata.originalName ?? req.file.originalname,
                        mimeType:     parsed.data.metadata.mimeType     ?? req.file.mimetype,
                        sizeBytes:    parsed.data.metadata.sizeBytes    ?? req.file.size,
                    },
                    userId: req.context.userId,
                }, req, session);
            });
        } finally {
            await session.endSession();
        }

        const dto = await buildPhotoDTOAsync(result.photo, {
            orgId: req.context.organizationId,
        });

        return res.status(result.reused ? 200 : 201).json({
            success: true,
            data:    dto,
            meta:    { reused: result.reused },
        });
    } catch (err) {
        return _errorResponse(res, err, "CREATE_PHOTO_ERROR");
    }
}

// ─────────────────────────────────────────────────────────────
// GET /:caseId/photos
// Case-level pool (logical — no separate collection).
// ─────────────────────────────────────────────────────────────
async function listCasePhotos(req, res) {
    try {
        authorize(req, "orthodontics.read");
        const caseId = _validateCaseId(req, res);
        if (!caseId) return;

        const photos = await photoService.listCasePhotos(req, caseId);
        const data = await buildPhotoDTOListAsync(photos, {
            orgId: req.context.organizationId,
        });

        // Data-flow observability — when the Photos / Documents / 3D / DICOM
        // tabs show empty, these log lines let ops trace whether:
        //   (a) the request reached the controller with a sane caseId + DB,
        //   (b) the per-org query actually returned zero rows (likely no
        //       data uploaded yet, NOT a broken query), or
        //   (c) the DTO stripped fileType during shaping.
        // Keep structured so log aggregators can count + alert per org.
        logger.info({
            event:     "LIST_CASE_PHOTOS",
            caseId,
            orgId:     req.context.organizationId?.toString?.() ?? null,
            dbName:    req.dbConnection?.name ?? null,
            rawCount:  photos.length,
            dtoCount:  data.length,
            missingFileType: data.filter((p) => !p.fileType).length,
        }, "[photo.controller] listCasePhotos");

        // Dev-only explicit call-out for the "empty case" scenario. Keeps a
        // visible line in the console during local debugging so developers
        // don't chase ghost bugs when the DB genuinely has zero assets.
        if (process.env.NODE_ENV !== "production" && photos.length === 0) {
            logger.warn({
                event:  "LIST_CASE_PHOTOS_EMPTY",
                caseId,
                dbName: req.dbConnection?.name ?? null,
            }, "[photo.controller] No photos found for case — upload some or check the DB directly");
        }

        return res.json({
            success: true,
            data,
            meta: { total: data.length },
        });
    } catch (err) {
        return _errorResponse(res, err, "LIST_PHOTOS_ERROR");
    }
}

// ─────────────────────────────────────────────────────────────
// POST /:caseId/photos/:photoId/link-recordset
// ─────────────────────────────────────────────────────────────
async function linkPhotoToRecordSet(req, res) {
    try {
        authorize(req, "orthodontics.full");
        const caseId = _validateCaseId(req, res);
        if (!caseId) return;

        const { photoId } = req.params;
        if (!mongoose.isValidObjectId(photoId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "photoId is not a valid ObjectId" },
            });
        }

        const parsed = linkRecordSetSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: parsed.error.errors?.[0]?.message ?? "Validation failed",
                    details: parsed.error.flatten(),
                },
            });
        }

        const session = await req.dbConnection.startSession();
        let result;
        try {
            await session.withTransaction(async () => {
                result = await photoService.linkPhotoToRecordSet({
                    photoId,
                    recordSetId: parsed.data.recordSetId,
                    userId:      req.context.userId,
                }, req, session);
            });
        } finally {
            await session.endSession();
        }

        const dto = await buildPhotoDTOAsync(result.photo, {
            orgId: req.context.organizationId,
        });
        return res.json({
            success: true,
            data:    dto,
            meta:    { linked: result.linked },
        });
    } catch (err) {
        return _errorResponse(res, err, "LINK_PHOTO_RECORDSET_ERROR");
    }
}

// ─────────────────────────────────────────────────────────────
// POST /:caseId/photos/:photoId/link-visit
// ─────────────────────────────────────────────────────────────
async function linkPhotoToVisit(req, res) {
    try {
        authorize(req, "orthodontics.full");
        const caseId = _validateCaseId(req, res);
        if (!caseId) return;

        const { photoId } = req.params;
        if (!mongoose.isValidObjectId(photoId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "photoId is not a valid ObjectId" },
            });
        }

        const parsed = linkVisitSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: parsed.error.errors?.[0]?.message ?? "Validation failed",
                    details: parsed.error.flatten(),
                },
            });
        }

        const session = await req.dbConnection.startSession();
        let result;
        try {
            await session.withTransaction(async () => {
                result = await photoService.linkPhotoToVisit({
                    photoId,
                    visitId: parsed.data.visitId,
                    userId:  req.context.userId,
                }, req, session);
            });
        } finally {
            await session.endSession();
        }

        const dto = await buildPhotoDTOAsync(result.photo, {
            orgId: req.context.organizationId,
        });
        return res.json({
            success: true,
            data:    dto,
            meta:    { linked: result.linked },
        });
    } catch (err) {
        return _errorResponse(res, err, "LINK_PHOTO_VISIT_ERROR");
    }
}

// ─────────────────────────────────────────────────────────────
// DELETE /:caseId/photos/:photoId
// Soft delete. Hard-reject when any links remain.
// ─────────────────────────────────────────────────────────────
async function deletePhoto(req, res) {
    try {
        authorize(req, "orthodontics.full");
        const caseId = _validateCaseId(req, res);
        if (!caseId) return;

        const { photoId } = req.params;
        if (!mongoose.isValidObjectId(photoId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "photoId is not a valid ObjectId" },
            });
        }

        const session = await req.dbConnection.startSession();
        let deleted;
        try {
            await session.withTransaction(async () => {
                deleted = await photoService.deletePhoto({
                    photoId,
                    deletedBy: req.context.userId,
                }, req, session);
            });
        } finally {
            await session.endSession();
        }

        return res.json({
            success: true,
            data: { id: deleted._id.toString(), deletedAt: deleted.deletedAt },
        });
    } catch (err) {
        return _errorResponse(res, err, "DELETE_PHOTO_ERROR");
    }
}

// ─────────────────────────────────────────────────────────────
// POST /:caseId/photos/:photoId/retry-processing
// U-CAP enterprise hardening §7.3 — user-triggered retry for a failed
// thumbnail / DICOM job. Resets retryCount + status so the atomic
// claim in assetJob.service._runJob picks it up, then calls the sole
// approved dispatcher (§9 — no direct runJob() from controllers).
// ─────────────────────────────────────────────────────────────
async function retryPhotoProcessing(req, res) {
    try {
        authorize(req, "orthodontics.full");
        const caseId = _validateCaseId(req, res);
        if (!caseId) return;

        const { photoId } = req.params;
        if (!mongoose.isValidObjectId(photoId)) {
            return res.status(400).json({
                success: false,
                error: { code: "INVALID_ID", message: "photoId is not a valid ObjectId" },
            });
        }

        const getModel = require("../../../core/db/getModel");
        const PhotoDef = require("../models/Photo.model");
        const Photo    = getModel(req.dbConnection, PhotoDef);

        // Reset status so the atomic claim matches + zero the retryCount
        // so recovery / scheduler give it a full budget. Only flip
        // fileTypes that the worker actually handles; PDFs and unknown
        // fileTypes have no job and shouldn't pretend otherwise.
        const photo = await Photo.findOne({
            _id:            photoId,
            caseId,
            deletedAt:      null,
            fileType:       { $in: ["image", "dicom", "3d"] },
        });
        if (!photo) {
            return res.status(404).json({
                success: false,
                error: { code: "PHOTO_NOT_FOUND_OR_NOT_RETRYABLE", message: "Asset not found, deleted, or not eligible for retry." },
            });
        }

        await Photo.updateOne(
            { _id: photo._id },
            { $set: { processingStatus: null, processingError: null, retryCount: 0 } },
        );

        const assetJobService = require("../services/assetJob.service");
        assetJobService.enqueueAssetJobs(photo, String(req.context.organizationId));

        return res.json({
            success: true,
            data: { id: String(photo._id), queued: true },
        });
    } catch (err) {
        return _errorResponse(res, err, "RETRY_PROCESSING_ERROR");
    }
}

module.exports = {
    createPhoto,
    listCasePhotos,
    linkPhotoToRecordSet,
    linkPhotoToVisit,
    deletePhoto,
    retryPhotoProcessing,
};
