/**
 * file.validator.js
 * Module: file
 * Layer: Validation
 *
 * Zod schemas and guard functions for the File Module.
 * All validation runs in the service layer (§6.1 — input validation MANDATORY).
 *
 * VALIDATION LAYERS:
 *   1. Zod schema parse — type safety + required field enforcement
 *   2. Guard functions — file-specific rules (MIME, size) applied to req.file
 *
 * MIME and size limits mirror the storageFacade / r2Upload defaults.
 * They are duplicated here so validation errors return structured codes
 * before any R2 call is made (fail-fast, cheap).
 */

"use strict";

const { z } = require("zod");

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Allowed MIME types for the File Module.
 * Must stay in sync with r2Upload.service.js ALLOWED_MIME_TYPES.
 * Defense-in-depth: validated here AND inside the storage layer.
 */
const ALLOWED_MIME_TYPES = Object.freeze([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

/**
 * Maximum upload size: 5 MB.
 * Must stay in sync with r2Upload.service.js MAX_FILE_SIZE_BYTES.
 */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

/**
 * Schema for POST /upload request body.
 * module and entityId are required — they form the key isolation path.
 */
const uploadSchema = z.object({
    module:   z.string().min(1, "module is required"),
    entityId: z.string().min(1, "entityId is required"),
});

/**
 * Schema for GET /:id/access and DELETE /:id path params.
 */
const fileIdSchema = z.object({
    id: z.string().min(1, "fileId is required"),
});

// ─── File Guard Functions ─────────────────────────────────────────────────────

/**
 * Validate that a multer file object is present.
 *
 * @param {Object|undefined} file — req.file from multer
 * @throws {Error} 400 if file is absent
 */
function assertFilePresent(file) {
    if (!file) {
        throw Object.assign(
            new Error("No file uploaded. Include a file in the 'file' form field."),
            { statusCode: 400, code: "MISSING_FILE" }
        );
    }
    if (!file.buffer) {
        throw Object.assign(
            new Error("File buffer is empty — ensure multer is configured with memoryStorage."),
            { statusCode: 400, code: "MISSING_FILE_BUFFER" }
        );
    }
}

/**
 * Validate that the uploaded file's MIME type is in the allowed list.
 *
 * @param {string} mimeType — file.mimetype from multer
 * @throws {Error} 415 if MIME type is not permitted
 */
function assertMimeType(mimeType) {
    const normalized = (mimeType || "").toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(normalized)) {
        throw Object.assign(
            new Error(
                `File type "${mimeType}" is not permitted. ` +
                `Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`
            ),
            {
                statusCode: 415,
                code: "INVALID_FILE_TYPE",
                allowedTypes: ALLOWED_MIME_TYPES,
            }
        );
    }
}

/**
 * Validate that the uploaded file does not exceed the size limit.
 *
 * @param {number} sizeBytes — file.size or file.buffer.length
 * @throws {Error} 413 if file is too large
 */
function assertFileSize(sizeBytes) {
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
        throw Object.assign(
            new Error(
                `File size ${sizeBytes} bytes exceeds the 5 MB limit ` +
                `(${MAX_FILE_SIZE_BYTES} bytes).`
            ),
            {
                statusCode: 413,
                code: "FILE_TOO_LARGE",
                sizeBytes,
                limitBytes: MAX_FILE_SIZE_BYTES,
            }
        );
    }
}

/**
 * Run all guards for an upload operation in sequence.
 * Returns the normalized MIME type if validation passes.
 *
 * @param {Object} file — req.file (multer memory object)
 * @returns {string} Normalized (lowercase) MIME type
 */
function validateUploadFile(file) {
    assertFilePresent(file);
    const mimeType = (file.mimetype || "").toLowerCase();
    assertMimeType(mimeType);
    const sizeBytes = file.size || file.buffer.length;
    assertFileSize(sizeBytes);
    return mimeType;
}

module.exports = {
    uploadSchema,
    fileIdSchema,
    validateUploadFile,
    assertFilePresent,
    assertMimeType,
    assertFileSize,
    ALLOWED_MIME_TYPES,
    MAX_FILE_SIZE_BYTES,
};
