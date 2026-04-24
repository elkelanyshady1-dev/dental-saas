/**
 * storageError.js
 * Infrastructure — Storage Domain Error
 *
 * Typed error class for all storage operations.
 * Carries a machine-readable `code` so callers can branch on error type
 * without string-matching on messages, and a `meta` bag for diagnostic
 * context that is safe to log but must NEVER be exposed to clients.
 *
 * USAGE:
 *   throw new StorageError("INVALID_FILE_TYPE", "Only JPEG/PNG/WebP accepted", {
 *     mimeType,
 *     orgId,
 *   });
 *
 * CATCHING:
 *   try { ... }
 *   catch (err) {
 *     if (err instanceof StorageError) {
 *       res.status(400).json({ code: err.code });
 *     }
 *   }
 *
 * CODES (canonical list — update here when adding new codes):
 *   INVALID_FILE_TYPE         — MIME type not in allowed list
 *   FILE_TOO_LARGE            — File exceeds max size
 *   MISSING_UPLOAD_CONTEXT    — Required context field (orgId / module / entityId) absent
 *   MISSING_FILE_BUFFER       — file.buffer is null (multer not in memoryStorage mode)
 *   UPLOAD_FAILED             — R2 PutObject command failed
 *   SIGNED_URL_FAILED         — R2 GetObject presign failed
 *   DELETE_FAILED             — R2 DeleteObject command failed
 *   UNAUTHORIZED_FILE_ACCESS  — Key orgId prefix does not match caller's orgId
 *   INVALID_STORAGE_DRIVER    — STORAGE_DRIVER env value is unrecognized
 *   MISSING_R2_ENV            — One or more required R2 env variables absent
 */

"use strict";

class StorageError extends Error {
    /**
     * @param {string} code     — Machine-readable error code (see list above)
     * @param {string} message  — Human-readable description (for logs, NOT client responses)
     * @param {Object} [meta]   — Diagnostic context: orgId, key, module, entityId, etc.
     *                            Never forward meta to HTTP responses — it may contain keys.
     */
    constructor(code, message, meta = {}) {
        super(message);

        this.name = "StorageError";
        this.code = code;

        // Diagnostic payload — safe for structured logging, never for HTTP responses
        this.meta = meta;

        // Preserve stack trace in V8 environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, StorageError);
        }
    }
}

module.exports = StorageError;
