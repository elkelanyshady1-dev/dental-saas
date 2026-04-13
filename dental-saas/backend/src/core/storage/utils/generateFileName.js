/**
 * generateFileName.js
 * ═══════════════════════════════════════════════════════════════
 * Deterministic, collision-resistant filename generator for all
 * storage providers. Produces a human-debuggable name that is
 * safe for S3 keys, local filesystems, and CDN paths.
 *
 * Format: {timestamp}-{randomHex}.{ext}
 * Example: 1711929600123-a1b2c3d4.jpg
 *
 * Used by: storageService.upload()
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const path = require("path");
const crypto = require("crypto");

/**
 * Generate a safe, unique filename from the original upload name.
 *
 * @param {string} originalName — The original filename from the upload (e.g. "photo.jpg")
 * @returns {string} Safe filename with timestamp + random hex + sanitized extension
 */
function generateFileName(originalName) {
    // Extract and sanitize extension (strip anything that isn't alphanumeric or dot)
    const ext = path.extname(originalName || "")
        .replace(/[^a-zA-Z0-9.]/g, "")
        .toLowerCase();

    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(8).toString("hex");

    return `${timestamp}-${randomHex}${ext}`;
}

module.exports = { generateFileName };
