/**
 * bulkPhoto.controller.js — Bulk Photo Upload / Image Pool Controller
 * ═══════════════════════════════════════════════════════════════
 * HTTP handlers for bulk photo upload, pool listing, assignment,
 * and deletion. All operations are scoped by caseId + recordSetId.
 *
 * Guards:
 *   - authorize(req, permission) at each handler
 *   - Zod validation via validators/bulkPhoto.validator.js
 *   - quotaGuard + multer at route level
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const bulkPhotoService = require("../services/bulkPhotoUpload.service");
const {
    validateAssignBody,
    validateListPoolQuery,
    validateBatchMeta,
    validateRecordSetIdParam,
} = require("../validators/bulkPhoto.validator");
const { authorize } = require("../../../utils/authorize");
const logger = require("@utils/logger");

// ─── 1. Bulk Upload ─────────────────────────────────────────────────────────

async function bulkUploadPhotos(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { caseId, recordSetId } = req.params;

        const rsCheck = validateRecordSetIdParam(req.params);
        if (rsCheck.error) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: rsCheck.error },
            });
        }

        // Parse optional client compression meta from form field
        let clientMeta = [];
        if (req.body?.meta) {
            const metaCheck = validateBatchMeta(req.body.meta);
            if (metaCheck.error) {
                return res.status(400).json({
                    success: false,
                    error: { code: "VALIDATION_ERROR", message: metaCheck.error },
                });
            }
            clientMeta = metaCheck.data;
        }

        const result = await bulkPhotoService.bulkUpload({
            req,
            caseId,
            recordSetId,
            files: req.files || [],
            clientMeta,
        });

        return res.status(201).json({ success: true, data: result });
    } catch (err) {
        logger.error({ err: err.message, caseId: req.params?.caseId }, "[BulkPhoto] Upload error");
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: err.code || "BULK_UPLOAD_ERROR", message: err.message },
        });
    }
}

// ─── 2. List Pool ───────────────────────────────────────────────────────────

async function listPool(req, res) {
    try {
        authorize(req, "orthodontics.read");

        const { caseId, recordSetId } = req.params;

        const rsCheck = validateRecordSetIdParam(req.params);
        if (rsCheck.error) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: rsCheck.error },
            });
        }

        const queryCheck = validateListPoolQuery(req.query);
        if (queryCheck.error) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: queryCheck.error },
            });
        }

        const result = await bulkPhotoService.listPool({
            req,
            caseId,
            recordSetId,
            filter: queryCheck.data.filter || "unassigned",
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: err.code || "LIST_POOL_ERROR", message: err.message },
        });
    }
}

// ─── 3. Assign to View ─────────────────────────────────────────────────────

async function assignToView(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { caseId, recordSetId, photoId } = req.params;

        const rsCheck = validateRecordSetIdParam(req.params);
        if (rsCheck.error) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: rsCheck.error },
            });
        }

        const bodyCheck = validateAssignBody(req.body);
        if (bodyCheck.error) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: bodyCheck.error },
            });
        }

        const result = await bulkPhotoService.assignToView({
            req,
            caseId,
            recordSetId,
            photoId,
            view: bodyCheck.data.view,
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: err.code || "ASSIGN_ERROR", message: err.message },
        });
    }
}

// ─── 4. Unassign from View ──────────────────────────────────────────────────

async function unassignFromView(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { caseId, recordSetId, photoId } = req.params;

        const rsCheck = validateRecordSetIdParam(req.params);
        if (rsCheck.error) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: rsCheck.error },
            });
        }

        const result = await bulkPhotoService.unassign({
            req,
            caseId,
            recordSetId,
            photoId,
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: err.code || "UNASSIGN_ERROR", message: err.message },
        });
    }
}

// ─── 5. Delete from Pool ────────────────────────────────────────────────────

async function deleteFromPool(req, res) {
    try {
        authorize(req, "orthodontics.full");

        const { caseId, recordSetId, photoId } = req.params;

        const rsCheck = validateRecordSetIdParam(req.params);
        if (rsCheck.error) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: rsCheck.error },
            });
        }

        const result = await bulkPhotoService.deleteFromPool({
            req,
            caseId,
            recordSetId,
            photoId,
        });

        return res.json({ success: true, data: result });
    } catch (err) {
        return res.status(err.statusCode || 500).json({
            success: false,
            error: { code: err.code || "DELETE_ERROR", message: err.message },
        });
    }
}

module.exports = {
    bulkUploadPhotos,
    listPool,
    assignToView,
    unassignFromView,
    deleteFromPool,
};
