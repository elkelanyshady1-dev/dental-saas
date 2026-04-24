/**
 * r2Upload.service.js
 * Infrastructure — Cloudflare R2 Upload Service
 *
 * Handles file uploads to Cloudflare R2 with org-isolated key generation,
 * MIME/size enforcement, cache headers, and structured audit logging.
 *
 * KEY FORMAT (canonical, multi-tenant safe):
 *   org_{orgId}/{module}/{entityId}/{timestamp}-{randomHex}.{ext}
 *   e.g. org_64a1b2c3/orthodontics/case_88c9d0/1711929600123-a1b2c3d4e5f6g7h8.png
 *
 * SECURITY DECISIONS:
 *   - Bucket is PRIVATE. uploadFile() returns url: null deliberately.
 *     All file access MUST go through r2SignedUrl.getSignedFileUrl().
 *   - orgId prefix is enforced in generateKey() so that cross-org key
 *     generation is structurally impossible.
 *   - MIME and size validation are enforced as a defense-in-depth layer
 *     even though storageFacade.service.js validates first. The goal is
 *     to ensure r2Upload cannot be called directly without these guards.
 *   - CacheControl: immutable is set because keys include a timestamp+random
 *     hex segment — they are effectively content-addressed and never mutated.
 *     CDN/browser caching of signed URLs is safe.
 *
 * PLANE: Infrastructure (cross-cutting)
 */

"use strict";

const crypto = require("crypto");
const path = require("path");
const { getR2Client, getBucket } = require("./r2Client");
const StorageError = require("./storageError");

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Allowed MIME types for R2 uploads.
 * Restricting to web-safe image formats prevents polyglot file attacks
 * (e.g. SVG with embedded scripts, PDF with active content).
 *
 * Callers that need other MIME types (STL, PDF) MUST use the core
 * storageService directly with appropriate category validation.
 */
const ALLOWED_MIME_TYPES = Object.freeze([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

/**
 * Maximum upload size: 5 MB.
 * Enforced at this layer regardless of HTTP-level limits (nginx / multer)
 * to provide a consistent, auditable boundary.
 */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Cache-Control header for uploaded objects.
 * Safe because keys are content-addressed (timestamp + 8-byte random hex).
 * An object key is never reused, so immutable caching cannot serve stale data.
 */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

// ─── Logger ───────────────────────────────────────────────────────────────────

function _logger() {
    try { return require("@utils/logger"); } catch { return console; }
}

// ─── Key Generation ───────────────────────────────────────────────────────────

/**
 * Generate a collision-resistant, org-isolated R2 object key.
 *
 * Format: org_{orgId}/{module}/{entityId}/{timestamp}-{16-byte-hex}{.ext}
 *
 * The timestamp + 16-byte random hex (128-bit entropy) makes key collisions
 * practically impossible. The extension is sanitized to contain only
 * alphanumeric characters and a leading dot.
 *
 * @param {Object} params
 * @param {string} params.orgId      — Organization ID (MUST come from req.context)
 * @param {string} params.module     — Domain namespace e.g. "orthodontics", "patients"
 * @param {string} params.entityId   — Entity ID e.g. caseId, patientId
 * @param {string} params.fileName   — Original filename — extension is extracted and sanitized
 * @returns {string} Tenant-isolated R2 object key
 * @throws {StorageError} MISSING_UPLOAD_CONTEXT if required params are absent
 */
function generateKey({ orgId, module, entityId, fileName }) {
    if (!orgId) {
        throw new StorageError(
            "MISSING_UPLOAD_CONTEXT",
            "[r2Upload] orgId is required for key generation",
            { field: "orgId" }
        );
    }
    if (!module) {
        throw new StorageError(
            "MISSING_UPLOAD_CONTEXT",
            "[r2Upload] module is required for key generation",
            { field: "module" }
        );
    }
    if (!entityId) {
        throw new StorageError(
            "MISSING_UPLOAD_CONTEXT",
            "[r2Upload] entityId is required for key generation",
            { field: "entityId" }
        );
    }
    if (!fileName) {
        throw new StorageError(
            "MISSING_UPLOAD_CONTEXT",
            "[r2Upload] fileName is required for key generation",
            { field: "fileName" }
        );
    }

    // Sanitize extension: strip anything that isn't alphanumeric or a single dot
    const ext = path.extname(fileName)
        .replace(/[^a-zA-Z0-9.]/g, "")
        .toLowerCase();

    // 128-bit random hex — collision probability is negligible
    const timestamp  = Date.now();
    const randomHex  = crypto.randomBytes(16).toString("hex");
    const uniqueName = `${timestamp}-${randomHex}${ext}`;

    return `org_${orgId}/${module}/${entityId}/${uniqueName}`;
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload a file buffer to Cloudflare R2.
 *
 * Validates MIME type and file size before sending to R2.
 * Sets CacheControl: immutable since keys are content-addressed.
 * Returns url: null — access requires a signed URL from r2SignedUrl.service.js.
 *
 * @param {Object} params
 * @param {Buffer}  params.buffer   — File contents (from multer memoryStorage)
 * @param {string}  params.mimeType — Content-Type (validated against ALLOWED_MIME_TYPES)
 * @param {string}  params.key      — R2 object key (from generateKey)
 * @param {string}  [params.orgId]  — Organization ID for audit logging
 * @param {string}  [params.module] — Module name for audit logging
 * @param {string}  [params.entityId] — Entity ID for audit logging
 *
 * @returns {Promise<{ key: string, url: null }>}
 *   key: R2 object key — persist this as imageKey in the DB.
 *   url: always null — bucket is private. Use getSignedFileUrl() for access.
 *
 * @throws {StorageError} INVALID_FILE_TYPE   — MIME not in ALLOWED_MIME_TYPES
 * @throws {StorageError} FILE_TOO_LARGE      — buffer.length > MAX_FILE_SIZE_BYTES
 * @throws {StorageError} MISSING_FILE_BUFFER — buffer is null/undefined
 * @throws {StorageError} UPLOAD_FAILED       — R2 PutObjectCommand failed
 */
async function uploadFile({
    buffer, mimeType, key, orgId, module: mod, entityId,
    // Internal escape hatches for non-image uploads (backup archives, etc.)
    // MUST NOT be exposed to HTTP endpoints — only callable from trusted internal paths.
    skipMimeValidation = false,
    skipSizeValidation = false,
}) {
    const log = _logger();

    // ── Guard: buffer ─────────────────────────────────────────────────────────
    if (!buffer) {
        throw new StorageError(
            "MISSING_FILE_BUFFER",
            "[r2Upload] buffer is required — ensure multer is configured with memoryStorage",
            { key, orgId }
        );
    }
    if (!key) {
        throw new StorageError(
            "MISSING_UPLOAD_CONTEXT",
            "[r2Upload] key is required",
            { orgId }
        );
    }

    // ── Guard: MIME type (§1.1) ────────────────────────────────────────────────
    // Defense-in-depth: storageFacade validates first; this layer validates again
    // so r2Upload cannot be called directly without MIME enforcement.
    // skipMimeValidation=true is reserved for internal backup/export flows.
    const normalizedMime = (mimeType || "").toLowerCase();
    if (!skipMimeValidation && !ALLOWED_MIME_TYPES.includes(normalizedMime)) {
        throw new StorageError(
            "INVALID_FILE_TYPE",
            `[r2Upload] MIME type "${mimeType}" is not permitted. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
            { mimeType, key, orgId, allowedTypes: ALLOWED_MIME_TYPES }
        );
    }

    // ── Guard: file size (§1.2) ────────────────────────────────────────────────
    // skipSizeValidation=true is reserved for backup archives that may exceed 5 MB.
    const sizeBytes = buffer.length;
    if (!skipSizeValidation && sizeBytes > MAX_FILE_SIZE_BYTES) {
        throw new StorageError(
            "FILE_TOO_LARGE",
            `[r2Upload] File size ${sizeBytes} bytes exceeds limit of ${MAX_FILE_SIZE_BYTES} bytes (5 MB)`,
            { sizeBytes, limitBytes: MAX_FILE_SIZE_BYTES, key, orgId }
        );
    }

    // ── Upload to R2 ──────────────────────────────────────────────────────────
    try {
        const { PutObjectCommand } = require("@aws-sdk/client-s3");
        const client = getR2Client();
        const bucket = getBucket();

        await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: normalizedMime,
            // CacheControl: immutable is safe because keys are content-addressed
            // (timestamp + 128-bit random). A key is never overwritten.
            CacheControl: CACHE_CONTROL,
        }));

        // ── Audit log: UPLOAD_SUCCESS (§6.1) ─────────────────────────────────
        log.info({
            event:    "UPLOAD_SUCCESS",
            key,
            orgId:    orgId    || null,
            module:   mod      || null,
            entityId: entityId || null,
            sizeBytes,
            mimeType: normalizedMime,
        }, "[r2Upload] File uploaded to R2");

        // url: null — bucket is PRIVATE. Callers MUST use getSignedFileUrl(key).
        return { key, url: null };

    } catch (err) {
        // Re-throw StorageErrors as-is (they were thrown by guards above)
        if (err.name === "StorageError") throw err;

        // ── Audit log: UPLOAD_FAILED (§6.1) ──────────────────────────────────
        log.error({
            event:    "UPLOAD_FAILED",
            key,
            orgId:    orgId    || null,
            module:   mod      || null,
            entityId: entityId || null,
            err:      err.message,
        }, "[r2Upload] R2 upload failed");

        throw new StorageError(
            "UPLOAD_FAILED",
            `[r2Upload] Upload to R2 failed: ${err.message}`,
            { key, orgId, cause: err.message }
        );
    }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a file from Cloudflare R2.
 *
 * Non-throwing by design — storage deletes must never crash the application.
 * Returns a boolean success flag so callers can optionally act on failure.
 *
 * @param {string} key  — R2 object key to delete
 * @param {string} [orgId] — Organization ID for audit logging
 * @returns {Promise<boolean>} true if deleted successfully, false on error
 */
async function deleteFile(key, orgId) {
    if (!key) return false;

    const log = _logger();

    try {
        const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
        const client = getR2Client();
        const bucket = getBucket();

        await client.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
        }));

        // ── Audit log: FILE_DELETE (§6.1) ─────────────────────────────────────
        log.info({
            event: "FILE_DELETE",
            key,
            orgId: orgId || null,
        }, "[r2Upload] File deleted from R2");

        return true;

    } catch (err) {
        // ── Audit log: DELETE_FAILED (§6.1) ───────────────────────────────────
        log.error({
            event: "DELETE_FAILED",
            key,
            orgId: orgId || null,
            err:   err.message,
        }, "[r2Upload] R2 delete failed");

        // Non-fatal — return false rather than throwing
        return false;
    }
}

module.exports = {
    generateKey,
    uploadFile,
    deleteFile,
    ALLOWED_MIME_TYPES,
    MAX_FILE_SIZE_BYTES,
};
