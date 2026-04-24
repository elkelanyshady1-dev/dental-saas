/**
 * storageFacade.service.js
 * Infrastructure — Storage Driver Facade
 *
 * Single entry point for ALL controller-level file uploads.
 * Routes to the correct storage backend via STORAGE_DRIVER env variable
 * and enforces security, validation, and audit logging consistently
 * regardless of which backend is active.
 *
 * DRIVERS:
 *   STORAGE_DRIVER=r2    → Cloudflare R2 (production — private bucket, signed URLs)
 *   STORAGE_DRIVER=local → Local disk via @core/storage (dev / CI)
 *   STORAGE_DRIVER=s3    → AWS S3 via @core/storage
 *
 * CONTROLLER USAGE:
 *   const storage = require("@infra/storage/storageFacade.service");
 *
 *   const result = await storage.upload({
 *     file: req.file,
 *     context: {
 *       orgId:    req.context.organizationId,  // MUST come from req.context
 *       module:   "orthodontics",
 *       entityId: caseId,
 *     },
 *   });
 *
 *   snapshot.imageKey = result.key;   // persist — source of truth
 *   snapshot.imageUrl = result.url;   // null for R2; legacy local URL otherwise
 *
 * BACKWARD COMPATIBILITY — reading image references (§5.1):
 *   const url = await storage.getAccessUrl(record.imageKey, req.context.organizationId)
 *               ?? record.imageUrl;   // fallback for records uploaded before R2 migration
 *
 * SECURITY:
 *   - orgId MUST come from req.context — never from request body or query params.
 *   - R2 uploads enforce MIME type and file size BEFORE sending to R2.
 *   - getAccessUrl() enforces key ownership (org prefix) before presigning.
 *   - No public bucket URLs are ever returned.
 *
 * PLANE: Infrastructure (cross-cutting)
 */

"use strict";

const r2Upload    = require("./r2Upload.service");
const r2SignedUrl = require("./r2SignedUrl.service");
const StorageError = require("./storageError");

// Existing core storage service — used for local and S3 drivers (backward compat)
const coreStorage = require("@core/storage/storageService");

// ─── Driver Resolution ────────────────────────────────────────────────────────

/**
 * Active storage driver.
 * STORAGE_DRIVER takes precedence; STORAGE_PROVIDER is the legacy alias.
 */
const STORAGE_DRIVER = (
    process.env.STORAGE_DRIVER ||
    process.env.STORAGE_PROVIDER ||
    "local"
).toLowerCase();

const VALID_DRIVERS = ["r2", "local", "s3"];

if (!VALID_DRIVERS.includes(STORAGE_DRIVER)) {
    throw new StorageError(
        "INVALID_STORAGE_DRIVER",
        `[storageFacade] Unknown STORAGE_DRIVER: "${STORAGE_DRIVER}". Supported: ${VALID_DRIVERS.join(", ")}`,
        { driver: STORAGE_DRIVER, validDrivers: VALID_DRIVERS }
    );
}

// ─── Logger ───────────────────────────────────────────────────────────────────

function _logger() {
    try { return require("@utils/logger"); } catch { return console; }
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Upload a file through the active storage driver.
 *
 * For R2 (STORAGE_DRIVER=r2):
 *   - Validates MIME type: image/jpeg | image/png | image/webp only
 *   - Validates file size: ≤ 5 MB
 *   - Validates context: orgId, module, entityId are all required
 *   - Returns url: null — use getAccessUrl(key, orgId) for all access
 *
 * For local/S3:
 *   - Delegates to @core/storage/storageService (handles its own validation)
 *   - entityId is optional
 *   - Returns url: local path or CDN URL
 *
 * BACKWARD COMPAT: The return shape is additive. Existing code reading result.url
 * continues to work for local/S3. New code should use result.key + getAccessUrl().
 *
 * @param {Object} params
 * @param {Object}  params.file                      — Multer file (buffer, originalname, mimetype, size)
 * @param {Object}  params.context
 * @param {string}  params.context.orgId             — Organization ID (from req.context — NEVER body)
 * @param {string}  params.context.module            — Domain namespace e.g. "orthodontics", "patients"
 * @param {string}  params.context.entityId          — Entity ID e.g. caseId, patientId (required for R2)
 * @param {string[]|null} [params.context.allowedMimeTypes] — Override allowed MIME list (null = skip validation)
 *
 * @returns {Promise<StorageFacadeResult>}
 * @typedef {Object} StorageFacadeResult
 * @property {string}      key             — Storage key (SSOT — persist as imageKey)
 * @property {string|null} url             — null for R2; local path or CDN URL for other drivers
 * @property {number}      sizeBytes       — File size in bytes
 * @property {string}      mimeType        — Normalized MIME type
 * @property {string}      originalName    — Original upload filename
 * @property {string}      storageProvider — Active driver ("r2" | "local" | "s3")
 *
 * @throws {StorageError} MISSING_UPLOAD_CONTEXT    — orgId / module / entityId absent
 * @throws {StorageError} MISSING_FILE_BUFFER       — file.buffer is null
 * @throws {StorageError} INVALID_FILE_TYPE         — MIME type not permitted
 * @throws {StorageError} FILE_TOO_LARGE            — file exceeds 5 MB
 * @throws {StorageError} UPLOAD_FAILED             — storage backend error
 */
async function upload({ file, context }) {
    const log = _logger();

    // ── Guard: file ───────────────────────────────────────────────────────────
    if (!file) {
        throw new StorageError(
            "MISSING_UPLOAD_CONTEXT",
            "[storageFacade] file is required",
            { driver: STORAGE_DRIVER }
        );
    }

    // ── Guard: orgId (all drivers) ────────────────────────────────────────────
    if (!context?.orgId) {
        throw new StorageError(
            "MISSING_UPLOAD_CONTEXT",
            "[storageFacade] context.orgId is required — must come from req.context, never req.body",
            { field: "orgId" }
        );
    }

    // ── Guard: module (all drivers) ───────────────────────────────────────────
    if (!context?.module) {
        throw new StorageError(
            "MISSING_UPLOAD_CONTEXT",
            "[storageFacade] context.module is required",
            { field: "module", orgId: context.orgId }
        );
    }

    // ── Guard: entityId (required for R2; optional for local/S3) ─────────────
    // R2 keys embed entityId for full path isolation.
    // Local/S3 use category-based paths which don't require entityId.
    if (STORAGE_DRIVER === "r2" && !context?.entityId) {
        throw new StorageError(
            "MISSING_UPLOAD_CONTEXT",
            "[storageFacade] context.entityId is required for R2 uploads",
            { field: "entityId", orgId: context.orgId, module: context.module }
        );
    }

    // ── Normalize file fields ─────────────────────────────────────────────────
    const originalName = file.originalname || file.originalName || "unnamed";
    const mimeType     = (file.mimetype || file.mimeType || "application/octet-stream").toLowerCase();
    const buffer       = file.buffer;
    const sizeBytes    = file.size || buffer?.length || 0;

    if (!buffer) {
        throw new StorageError(
            "MISSING_FILE_BUFFER",
            "[storageFacade] file.buffer is null — ensure multer is configured with memoryStorage, not diskStorage",
            { driver: STORAGE_DRIVER, orgId: context.orgId }
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // R2 UPLOAD PATH
    // All R2-specific validation runs here so storageFacade is the authoritative
    // entry point. r2Upload.service.js also validates (defense-in-depth).
    // ─────────────────────────────────────────────────────────────────────────
    if (STORAGE_DRIVER === "r2") {

        // ── MIME validation (§1.1) ────────────────────────────────────────────
        // context.allowedMimeTypes=null skips validation (for non-image R2 uploads).
        // Default: image/jpeg | image/png | image/webp only.
        const mimeWhitelist = context.allowedMimeTypes !== undefined
            ? context.allowedMimeTypes
            : r2Upload.ALLOWED_MIME_TYPES;

        if (mimeWhitelist && !mimeWhitelist.includes(mimeType)) {
            throw new StorageError(
                "INVALID_FILE_TYPE",
                `[storageFacade] MIME type "${mimeType}" is not permitted for R2 uploads. Allowed: ${mimeWhitelist.join(", ")}`,
                { mimeType, allowed: mimeWhitelist, orgId: context.orgId, module: context.module }
            );
        }

        // ── Size validation (§1.2) ────────────────────────────────────────────
        if (sizeBytes > r2Upload.MAX_FILE_SIZE_BYTES) {
            throw new StorageError(
                "FILE_TOO_LARGE",
                `[storageFacade] File size ${sizeBytes} bytes exceeds 5 MB limit`,
                {
                    sizeBytes,
                    limitBytes: r2Upload.MAX_FILE_SIZE_BYTES,
                    orgId: context.orgId,
                    module: context.module,
                }
            );
        }

        // ── Generate org-isolated key ─────────────────────────────────────────
        const key = r2Upload.generateKey({
            orgId:    context.orgId,
            module:   context.module,
            entityId: context.entityId,
            fileName: originalName,
        });

        // ── Upload to R2 ──────────────────────────────────────────────────────
        await r2Upload.uploadFile({
            buffer,
            mimeType,
            key,
            orgId:    context.orgId,
            module:   context.module,
            entityId: context.entityId,
        });

        // url: null — bucket is private; consumers must use getAccessUrl(key, orgId).
        return {
            key,
            url: null,
            sizeBytes,
            mimeType,
            originalName,
            storageProvider: "r2",
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LOCAL / S3 PATH
    // Delegate to the existing @core/storage/storageService which handles
    // provider switching, key generation, and error handling internally.
    // Backward compat: this path is unchanged from the previous implementation.
    // ─────────────────────────────────────────────────────────────────────────
    try {
        const category = context.entityId
            ? `${context.module}/${context.entityId}`
            : context.module;

        const result = await coreStorage.upload({
            file,
            organizationId: context.orgId,
            category,
        });

        return {
            key:             result.storageKey,
            url:             result.url,
            sizeBytes,
            mimeType,
            originalName,
            storageProvider: result.storageProvider || STORAGE_DRIVER,
        };

    } catch (err) {
        log.error({
            event:    "UPLOAD_FAILED",
            driver:   STORAGE_DRIVER,
            orgId:    context.orgId,
            module:   context.module,
            entityId: context.entityId || null,
            err:      err.message,
        }, "[storageFacade] Core storage upload failed");

        // Wrap in StorageError if not already typed
        if (err.name === "StorageError") throw err;
        throw new StorageError(
            "UPLOAD_FAILED",
            `[storageFacade] Upload failed (${STORAGE_DRIVER}): ${err.message}`,
            { driver: STORAGE_DRIVER, orgId: context.orgId, cause: err.message }
        );
    }
}

// ─── Access URL ───────────────────────────────────────────────────────────────

/**
 * Resolve an access URL for a stored file.
 *
 * For R2: generates a time-limited signed URL after asserting key ownership.
 * For local/S3: returns the stored URL (local path or CDN URL).
 *
 * BACKWARD COMPATIBILITY PATTERN — use in service / DTO layers (§5.1):
 *   const url = await storage.getAccessUrl(record.imageKey, orgId)
 *               ?? record.imageUrl;
 *
 * @param {string} key    — Storage key (imageKey / storageKey from DB)
 * @param {string} [orgId] — Organization ID for R2 ownership assertion (strongly recommended)
 * @returns {Promise<string|null>} Signed URL, local URL, or null if key is falsy
 * @throws {StorageError} UNAUTHORIZED_FILE_ACCESS — key prefix does not match orgId
 * @throws {StorageError} SIGNED_URL_FAILED        — R2 presign failed
 */
async function getAccessUrl(key, orgId = null) {
    if (!key) return null;

    if (STORAGE_DRIVER === "r2") {
        // orgId assertion happens inside getSignedFileUrl (§1.3)
        return r2SignedUrl.getSignedFileUrl(key, orgId);
    }

    // Local provider: storageKey IS the URL path.
    // coreStorage.getSignedUrl() handles S3 presigning transparently.
    return coreStorage.getSignedUrl(key);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a stored file.
 *
 * For R2: returns boolean success flag (never throws).
 * For local/S3: delegates to coreStorage (non-fatal).
 *
 * @param {string} key    — Storage key to delete
 * @param {string} [orgId] — Organization ID for audit logging
 * @returns {Promise<boolean>} true on success, false on error (R2 only)
 */
async function deleteStoredFile(key, orgId = null) {
    if (!key) return false;

    if (STORAGE_DRIVER === "r2") {
        return r2Upload.deleteFile(key, orgId);
    }

    try {
        await coreStorage.delete(key);
        return true;
    } catch {
        return false;
    }
}

// ─── uploadBuffer (internal use — backup worker, non-image content) ───────────

/**
 * Upload a raw Buffer to R2 with an explicit key and MIME type.
 * Bypasses the multer-file guard and MIME whitelist used by upload().
 *
 * FOR INTERNAL USE ONLY — callers must perform all authorization checks
 * before calling this method. This is intended for the backup worker
 * which builds JSON export archives (application/json) that bypass the
 * image-only restriction enforced by upload().
 *
 * Key MUST use the org-scoped prefix format: `org_{orgId}/...`
 *
 * @param {Object} params
 * @param {Buffer} params.buffer   — Raw bytes to upload
 * @param {string} params.key      — R2 object key (org-scoped)
 * @param {string} params.mimeType — MIME type of the content
 * @param {string} params.orgId    — Organization ID (for audit + access control)
 *
 * @returns {Promise<void>}
 */
async function uploadBuffer({ buffer, key, mimeType, orgId }) {
    if (STORAGE_DRIVER === "r2") {
        await r2Upload.uploadFile({
            buffer,
            mimeType,
            key,
            orgId,
            module:             "exports",
            entityId:           "backup",
            skipMimeValidation: true,   // application/json is not in the image whitelist
            skipSizeValidation: true,   // backup archives may exceed 5 MB
        });
        return;
    }

    // Local/S3: write as a synthetic file via coreStorage
    const syntheticFile = {
        buffer,
        mimetype:     mimeType,
        originalname: key.split("/").pop() || "export.json",
        size:         buffer.length,
    };

    try {
        await coreStorage.upload({
            file:           syntheticFile,
            organizationId: orgId,
            category:       "exports",
            storageKey:     key,
        });
    } catch (err) {
        throw new StorageError(
            "UPLOAD_FAILED",
            `[storageFacade] uploadBuffer failed (${STORAGE_DRIVER}): ${err.message}`,
            { driver: STORAGE_DRIVER, orgId, key, cause: err.message }
        );
    }
}

// ─── Introspection ────────────────────────────────────────────────────────────

/**
 * Return the active storage driver name.
 * @returns {"r2"|"local"|"s3"}
 */
function getDriver() {
    return STORAGE_DRIVER;
}

module.exports = {
    upload,
    uploadBuffer,
    getAccessUrl,
    delete: deleteStoredFile,
    getDriver,
    STORAGE_DRIVER,
    StorageError,  // Re-exported for instanceof checks in controllers / error handlers
};
