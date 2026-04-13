/**
 * storageService.js
 * ═══════════════════════════════════════════════════════════════
 * Centralized Storage Service — Provider Abstraction Layer
 *
 * Entry point for ALL file uploads in the system.
 * Resolves the active storage provider from STORAGE_PROVIDER env
 * and delegates to the provider's upload/delete/exists methods.
 *
 * ARCHITECTURE:
 *   Controller → storageService.upload() → LocalProvider | S3Provider
 *                                        ↓
 *                                    { url, sizeBytes, mimeType, storageProvider, originalName }
 *
 * PROVIDER RESOLUTION (STORAGE_PROVIDER env):
 *   "local"  → LocalProvider  (default — disk storage at backend/src/uploads/)
 *   "s3"     → S3Provider     (AWS S3 — requires AWS_S3_BUCKET env)
 *   "gcs"    → (future)       GCS provider stub
 *
 * USAGE:
 *   const storageService = require("@core/storage/storageService");
 *
 *   const result = await storageService.upload({
 *       file: req.file,                    // multer file object or { buffer, originalname, mimetype, size }
 *       organizationId: req.organizationId,
 *       category: "orthodontics/photos",
 *   });
 *   // → { url, sizeBytes, mimeType, storageProvider, originalName }
 *
 * CATEGORIES (convention — not enforced):
 *   "orthodontics/photos"  — ortho case photos
 *   "orthodontics/stl"     — 3D scan files
 *   "orthodontics/audio"   — voice notes
 *   "patients"             — patient profile photos
 *   "logos"                — organization logos
 *
 * PLANE: Shared (used by both Org and Platform planes)
 * SENTINEL: No RBAC bypass — callers must still enforce guards.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const LocalProvider = require("./providers/localProvider");
const S3Provider = require("./providers/s3Provider");
const { generateFileName } = require("./utils/generateFileName");

// ─── Provider Registry ───────────────────────────────────────────────────────
const PROVIDERS = {
    local: LocalProvider,
    s3: S3Provider,
    // gcs: GcsProvider, // Future — Google Cloud Storage
};

// ─── Singleton Provider Instance ─────────────────────────────────────────────
let _providerInstance = null;

/**
 * Resolve and cache the active storage provider.
 * Provider is determined by STORAGE_PROVIDER env variable.
 * Default: "local" for development safety.
 *
 * @returns {LocalProvider | S3Provider}
 */
function getProvider() {
    if (_providerInstance) return _providerInstance;

    const providerName = (process.env.STORAGE_PROVIDER || "local").toLowerCase();
    const ProviderClass = PROVIDERS[providerName];

    if (!ProviderClass) {
        throw new Error(
            `[StorageService] Unknown storage provider: "${providerName}". ` +
            `Supported providers: ${Object.keys(PROVIDERS).join(", ")}`
        );
    }

    _providerInstance = new ProviderClass();

    // Log provider selection on first use (not on import)
    const logger = safeRequireLogger();
    if (logger) {
        logger.info(`[StorageService] Provider initialized: ${providerName}`);
    } else {
        console.log(`[StorageService] Provider initialized: ${providerName}`);
    }

    return _providerInstance;
}

/**
 * Safely require the logger — avoids circular dependency issues
 * when storageService is loaded early in the boot sequence.
 */
function safeRequireLogger() {
    try {
        return require("../../shared/utils/logger");
    } catch {
        return null;
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Upload a file through the active storage provider.
 *
 * Accepts either a multer file object (req.file) or a raw params object.
 * Returns a standardized metadata object matching the fileMetaFields schema
 * in orthodonticCase.model.js.
 *
 * @param {Object} params
 * @param {Object}  params.file            — Multer file object (buffer, originalname, mimetype, size)
 *                                           OR { buffer, originalname, mimetype, size }
 * @param {string}  params.organizationId  — Tenant ID (from req.organizationId)
 * @param {string}  params.category        — Storage category (e.g. "orthodontics/photos")
 * @returns {Promise<StorageResult>}
 *
 * @typedef {Object} StorageResult
 * @property {string} url              — Public URL to access the file
 * @property {number} sizeBytes        — File size in bytes
 * @property {string} mimeType         — MIME type (e.g. "image/jpeg")
 * @property {string} storageProvider  — Provider used ("local" | "s3" | "gcs")
 * @property {string} originalName     — Original upload filename
 * @property {string} storageKey       — Provider-specific key for delete/lookup
 * @property {string} fileName         — Generated safe filename
 */
async function upload({ file, organizationId, category }) {
    // ── Validate required params ─────────────────────────────────────────
    if (!file) {
        throw new Error("[StorageService] file is required");
    }
    if (!organizationId) {
        throw new Error("[StorageService] organizationId is required");
    }
    if (!category) {
        throw new Error("[StorageService] category is required");
    }

    // ── Normalize file object (multer vs raw) ────────────────────────────
    const buffer = file.buffer || (file.path ? require("fs").readFileSync(file.path) : null);
    if (!buffer) {
        throw new Error(
            "[StorageService] file.buffer is required. " +
            "If using multer diskStorage, switch to memoryStorage or read file from file.path."
        );
    }

    const originalName = file.originalname || file.originalName || "unnamed";
    const mimeType = file.mimetype || file.mimeType || "application/octet-stream";
    const sizeBytes = file.size || buffer.length;

    // ── Generate safe filename ───────────────────────────────────────────
    const fileName = generateFileName(originalName);

    // ── Delegate to provider ─────────────────────────────────────────────
    const provider = getProvider();
    const result = await provider.upload({
        buffer,
        fileName,
        category,
        organizationId: String(organizationId),
        mimeType,
    });

    // ── Return standardized result ───────────────────────────────────────
    return {
        url: result.url,
        sizeBytes,
        mimeType,
        storageProvider: provider.name,
        originalName,
        storageKey: result.storageKey,
        fileName,
    };
}

/**
 * Delete a file via the active storage provider.
 *
 * @param {string} storageKey — Provider-specific key
 * @returns {Promise<void>}
 */
async function deleteFile(storageKey) {
    const provider = getProvider();
    await provider.delete(storageKey);
}

/**
 * Check if a file exists via the active storage provider.
 *
 * @param {string} storageKey — Provider-specific key
 * @returns {Promise<boolean>}
 */
async function exists(storageKey) {
    const provider = getProvider();
    return provider.exists(storageKey);
}

/**
 * Get the name of the active storage provider.
 *
 * @returns {string} "local" | "s3" | "gcs"
 */
function getProviderName() {
    return getProvider().name;
}

/**
 * Reset the cached provider instance (for testing only).
 * @private
 */
function _resetProvider() {
    _providerInstance = null;
}

module.exports = {
    upload,
    delete: deleteFile,
    exists,
    getProviderName,
    _resetProvider,
};
