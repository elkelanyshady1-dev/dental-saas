/**
 * localProvider.js
 * ═══════════════════════════════════════════════════════════════
 * Local Disk Storage Provider
 *
 * Stores files under: backend/src/uploads/{category}/{orgId}/{fileName}
 * Served via: express.static("/uploads", ...)
 *
 * This is the default provider for development and single-server
 * deployments. For multi-server or production, use S3 provider.
 *
 * ARCHITECTURE:
 *   StorageService → LocalProvider → fs.writeFile → /uploads/{category}/{orgId}/{file}
 *
 * URL Format: /uploads/{category}/{orgId}/{fileName}
 *   (resolved by express.static middleware in app.js)
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const fs = require("fs");
const path = require("path");

// Root directory for uploads — aligned with existing orthoUpload.js paths
// Resolves to: backend/src/uploads/
const UPLOAD_ROOT = path.resolve(__dirname, "..", "..", "..", "uploads");

class LocalProvider {
    constructor() {
        this.name = "local";
    }

    /**
     * Upload a file buffer to local disk.
     *
     * @param {Object} params
     * @param {Buffer}  params.buffer       — File contents
     * @param {string}  params.fileName     — Generated safe filename (from generateFileName)
     * @param {string}  params.category     — Storage category (e.g. "orthodontics/photos", "orthodontics/stl", "patients")
     * @param {string}  params.organizationId — Tenant ID for directory isolation
     * @returns {Promise<{ url: string, storageKey: string }>}
     */
    async upload({ buffer, fileName, category, organizationId }) {
        // Build tenant-isolated directory: uploads/{category}/{orgId}/
        const dir = path.join(UPLOAD_ROOT, category, organizationId);

        // Ensure directory exists (recursive)
        if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
        }

        const filePath = path.join(dir, fileName);
        await fs.promises.writeFile(filePath, buffer);

        // URL matches Express static mount: /uploads/{category}/{orgId}/{fileName}
        const url = `/uploads/${category}/${organizationId}/${fileName}`;

        return {
            url,
            storageKey: url, // For local storage, key === URL path
        };
    }

    /**
     * Delete a file from local disk.
     *
     * @param {string} storageKey — The relative URL/key (e.g. "/uploads/orthodontics/photos/orgId/file.jpg")
     * @returns {Promise<void>}
     */
    async delete(storageKey) {
        if (!storageKey) return;

        // Convert URL path to absolute filesystem path
        // storageKey: /uploads/category/orgId/file → UPLOAD_ROOT/category/orgId/file
        const relativePath = storageKey.replace(/^\/uploads\//, "");
        const absolutePath = path.join(UPLOAD_ROOT, relativePath);

        try {
            if (fs.existsSync(absolutePath)) {
                await fs.promises.unlink(absolutePath);
            }
        } catch (err) {
            // Non-fatal — log but don't throw
            console.error(`[LocalProvider] Failed to delete: ${absolutePath}`, err.message);
        }
    }

    /**
     * Check if a file exists on disk.
     *
     * @param {string} storageKey
     * @returns {Promise<boolean>}
     */
    async exists(storageKey) {
        if (!storageKey) return false;
        const relativePath = storageKey.replace(/^\/uploads\//, "");
        const absolutePath = path.join(UPLOAD_ROOT, relativePath);
        return fs.existsSync(absolutePath);
    }
}

module.exports = LocalProvider;
