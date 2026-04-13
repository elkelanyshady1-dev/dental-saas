/**
 * capabilityHash.js — Capability Fingerprinting Utility
 *
 * Phase A++ (TASK-AUTH-STAB-003)
 *
 * PURPOSE:
 * Generates a deterministic SHA-256 hash of the resolved capability object.
 * Used for:
 *   - Fast comparison across requests (same hash = same capabilities)
 *   - Compact representation in auth traces and logs
 *   - Cache invalidation signals for future capability caches
 *
 * DETERMINISM:
 * JSON.stringify with sorted keys is NOT used because the capabilities object
 * is always built by the same pipeline (resolveUnifiedCapabilities) which
 * produces deterministic key order. If this assumption changes, switch to
 * a canonical JSON serializer.
 *
 * PLANE: Shared utility — no plane isolation concern.
 */

"use strict";

const crypto = require("crypto");

/**
 * hashCapabilities
 *
 * Computes a SHA-256 hex digest of a capabilities object.
 * Returns a 64-character hex string.
 *
 * @param {Object} capabilities — the resolved capabilities object (req.capabilities)
 * @returns {string} — 64-char hex SHA-256 hash
 */
function hashCapabilities(capabilities) {
    if (!capabilities || typeof capabilities !== "object") {
        return "0".repeat(64); // null-safe sentinel
    }

    return crypto
        .createHash("sha256")
        .update(JSON.stringify(capabilities))
        .digest("hex");
}

module.exports = hashCapabilities;
