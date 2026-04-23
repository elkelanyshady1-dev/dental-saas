/**
 * photo.validator.js — Photo SSOT Zod validators (Phase 1)
 * ═══════════════════════════════════════════════════════════════
 * Validation for photo write/link/delete endpoints.
 * Upload bytes flow through multer; this validates metadata + IDs only.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const { z } = require("zod");

const OBJECT_ID_RX = /^[a-f\d]{24}$/i;

// Phase 2 — Unified Case Assets.
// `type` is the CLINICAL/USER tag (intraoral, document, stl, …).
//
// 🚨 PRODUCTION LOCK — metadata.fileType + metadata.mimeType are REQUIRED.
//    The `source` object is an optional structured origin pointer used by
//    derived assets (e.g. a PNG exported from a DICOM). It replaces the
//    old free-text `tags: ["dicom-export", "from:<id>"]` convention.
const sourceSchema = z.object({
    type:            z.enum(["dicom", "stl", "pdf", "upload"]),
    originalPhotoId: z.string().regex(OBJECT_ID_RX, "originalPhotoId must be a valid ObjectId").optional(),
}).strict();

const metadataSchema = z.object({
    type:         z.enum([
        "intraoral", "extraoral", "xray", "scan",
        "document", "stl", "dicom",
    ]),
    fileType:     z.enum(["image", "pdf", "3d", "dicom"]),
    mimeType:     z.string().min(1).max(120),
    orientation:  z.string().max(40).nullable().optional(),
    tags:         z.array(z.string().max(40)).max(20).optional().default([]),
    originalName: z.string().max(255).nullable().optional(),
    sizeBytes:    z.number().int().nonnegative().optional(),
    source:       sourceSchema.optional(),
}).strict();

// POST /:caseId/photos — multipart body alongside a file upload.
// The file itself lives on req.file (multer); this schema validates the rest.
const createPhotoSchema = z.object({
    metadata: metadataSchema,
}).strict();

// POST /:caseId/photos/:photoId/link-recordset
const linkRecordSetSchema = z.object({
    recordSetId: z.string().regex(OBJECT_ID_RX, "recordSetId must be a valid ObjectId"),
}).strict();

// POST /:caseId/photos/:photoId/link-visit
const linkVisitSchema = z.object({
    visitId: z.string().regex(OBJECT_ID_RX, "visitId must be a valid ObjectId"),
}).strict();

module.exports = {
    createPhotoSchema,
    linkRecordSetSchema,
    linkVisitSchema,
    metadataSchema,
};
