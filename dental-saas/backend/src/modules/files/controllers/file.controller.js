/**
 * file.controller.js — File Module HTTP Controller
 * Phase v27 — Storage + Infra Hardening
 *
 * Thin controller layer — delegates ALL logic to file.service.js.
 * No DB queries, no validation, no business logic here (§10.2).
 *
 * PLANE: Organization
 */

"use strict";

const asyncHandler = require("@utils/asyncHandler");
const fileService = require("../services/file.service");

/**
 * POST /api/org/files/upload
 * Upload a file (multipart/form-data).
 * Body fields: category, patientId?, caseId?, visitId?
 * File field: "file"
 */
exports.uploadFile = asyncHandler(async (req, res) => {
    const result = await fileService.uploadFile(req, {
        category:  req.body.category,
        patientId: req.body.patientId,
        caseId:    req.body.caseId,
        visitId:   req.body.visitId,
    });

    // TODO: POLICY ENFORCEMENT
    // Upload currently allowed due to shadow mode.
    // Verify "files.create" permission before disabling shadow mode.
    return res.status(201).json({
        success: true,
        data: {
            fileId:       result._id,
            url:          result.url,
            storageKey:   result.storageKey,
            fileName:     result.fileName,
            originalName: result.originalName,
            mimeType:     result.mimeType,
            size:         result.size,
            category:     result.category,
        },
    });
});

/**
 * GET /api/org/files/:id/url
 * Get a signed URL for accessing a file.
 */
exports.getFileUrl = asyncHandler(async (req, res) => {
    const { file, url } = await fileService.getFileAccess(req, {
        fileId: req.params.id,
    });

    return res.status(200).json({
        success: true,
        data: {
            fileId:   file._id,
            url,
            mimeType: file.mimeType,
            fileName: file.fileName,
            category: file.category,
            expiresIn: parseInt(process.env.FILE_SIGNED_URL_TTL, 10) || 60,
        },
    });
});

/**
 * DELETE /api/org/files/:id
 * Soft-delete a file.
 */
exports.deleteFile = asyncHandler(async (req, res) => {
    const result = await fileService.deleteFile(req, {
        fileId: req.params.id,
        purgeBinary: req.query.purge === "true",
    });

    return res.status(200).json({
        success: true,
        data: {
            fileId:   result._id,
            isDeleted: result.isDeleted,
        },
    });
});

/**
 * GET /api/org/files
 * List files with optional filters.
 */
exports.listFiles = asyncHandler(async (req, res) => {
    const result = await fileService.listFiles(req, {
        category:  req.query.category,
        patientId: req.query.patientId,
        caseId:    req.query.caseId,
        visitId:   req.query.visitId,
        page:      parseInt(req.query.page, 10) || 1,
        limit:     parseInt(req.query.limit, 10) || 50,
    });

    return res.status(200).json({
        success: true,
        data: result.files,
        meta: {
            total: result.total,
            page:  result.page,
            limit: result.limit,
        },
    });
});
