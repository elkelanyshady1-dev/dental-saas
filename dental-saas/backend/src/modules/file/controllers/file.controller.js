/**
 * file.controller.js
 * Module: file
 * Layer: Controller (HTTP boundary)
 *
 * Thin HTTP adapter. Controllers:
 *   - Extract parameters from req (body, params, file)
 *   - Delegate entirely to file.service.js
 *   - Shape the HTTP response
 *   - Contain NO business logic, NO DB calls, NO validation
 *
 * All methods are wrapped with asyncHandler to eliminate try/catch boilerplate
 * and forward unhandled rejections to the global error middleware.
 *
 * RESPONSE SHAPES (canonical):
 *   201 POST /upload     → { success, data: { fileId, key } }
 *   200 GET  /:id/access → { success, data: { fileId, url, module, mimeType } }
 *   200 DELETE /:id      → { success, data: { fileId, deletedAt } }
 */

"use strict";

const asyncHandler = require("@utils/asyncHandler");
const fileService  = require("../services/file.service");

// ─── POST /upload ─────────────────────────────────────────────────────────────

/**
 * Upload a file to the storage backend.
 *
 * Expects:
 *   - req.file       — multer-buffered file (memoryStorage)
 *   - req.body.module    — domain namespace
 *   - req.body.entityId  — entity reference (caseId, patientId, etc.)
 *   - req.context        — populated by authMiddleware
 *   - req.dbConnection   — per-org connection from dbContext
 */
exports.uploadFile = asyncHandler(async (req, res) => {
    const { module, entityId } = req.body;

    const result = await fileService.uploadFile({
        req,
        file:     req.file,
        module,
        entityId,
    });

    return res.status(201).json({
        success: true,
        data: {
            fileId: result.fileId,
            key:    result.key,
        },
    });
});

// ─── GET /:id/access ──────────────────────────────────────────────────────────

/**
 * Get a signed access URL for a FileObject.
 *
 * The signed URL expires according to FILE_SIGNED_URL_TTL env (default 3600s).
 * Do NOT cache or store the returned URL — regenerate on each page load.
 *
 * Expects:
 *   - req.params.id  — FileObject._id
 *   - req.context    — populated by authMiddleware
 */
exports.getFileAccess = asyncHandler(async (req, res) => {
    const result = await fileService.getFileAccessUrl({
        req,
        fileId: req.params.id,
    });

    return res.status(200).json({
        success: true,
        data: {
            fileId: req.params.id,
            url:    result.url,
        },
    });
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

/**
 * Soft-delete a FileObject.
 *
 * Sets deletedAt on the document; the binary in R2/storage is cleaned up
 * on a best-effort basis. Hard deletes are FORBIDDEN — use this endpoint.
 *
 * Expects:
 *   - req.params.id  — FileObject._id
 *   - req.context    — populated by authMiddleware
 */
exports.deleteFile = asyncHandler(async (req, res) => {
    const result = await fileService.deleteFile({
        req,
        fileId: req.params.id,
    });

    return res.status(200).json({
        success: true,
        data: {
            fileId:    result.fileId,
            deletedAt: result.deletedAt,
        },
    });
});
