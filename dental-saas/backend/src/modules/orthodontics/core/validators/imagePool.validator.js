/**
 * imagePool.validator.js
 * Domain: orthodontic-cases / image pool (bulk upload + assignment)
 * Layer: Interfaces > Validators
 *
 * Zod schemas for request shapes on image-pool endpoints.
 * Multipart file metadata (req.files) is validated by multer itself; these
 * schemas cover params, query, and JSON body payloads only.
 */

"use strict";

const { z } = require("zod");

// ─── Params ──────────────────────────────────────────────────────────────────

const caseRecordSetParams = z.object({
    caseId:      z.string().min(24, "Invalid caseId").max(36),
    recordSetId: z.string().min(1).max(128),
}).strict();

const caseRecordSetPhotoParams = caseRecordSetParams.extend({
    photoId: z.string().min(1).max(128),
});

// ─── Body ────────────────────────────────────────────────────────────────────

// POST /photos/batch — optional flag indicating the client already compressed.
// Multipart body is not a JSON payload; this may arrive as a string field.
const bulkMetaSchema = z.object({
    compressed: z.coerce.boolean().optional(),
}).strict();

// POST /photos/:photoId/assign — slot id in recordSet.records[]
const assignSchema = z.object({
    view: z.string().min(1).max(64),
}).strict();

module.exports = {
    caseRecordSetParams,
    caseRecordSetPhotoParams,
    bulkMetaSchema,
    assignSchema,
};
