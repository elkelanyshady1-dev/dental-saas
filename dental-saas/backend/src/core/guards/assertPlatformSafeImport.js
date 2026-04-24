/**
 * assertPlatformSafeImport.js
 * Runtime helper for H5 — cross-plane import guard (v9.4.1 hardening).
 *
 * Static cross-plane enforcement is already handled by ESLint
 * (`boundaries/element-types` in eslint.config.js). This helper is an
 * optional runtime assertion for sensitive platform services that
 * receive a module path as data (e.g., dynamic require by name, plugin
 * loaders) and want to refuse tenant-plane paths defensively.
 *
 * Do NOT call this on every require() in the codebase — the ESLint
 * rule already covers static imports. Use only when a module path is
 * not statically analysable.
 *
 * PLANE: Core Infrastructure / Guards
 */

"use strict";

function assertPlatformSafeImport(modulePath) {
    if (typeof modulePath !== "string") {
        throw new TypeError("[assertPlatformSafeImport] modulePath must be a string");
    }
    // Normalise for comparison (Windows path separators, alias form).
    const norm = modulePath.replace(/\\/g, "/");
    if (norm.includes("/modules/") || norm.startsWith("@modules/")) {
        throw new Error(
            `[assertPlatformSafeImport] Platform cannot import tenant modules (${modulePath})`
        );
    }
}

module.exports = { assertPlatformSafeImport };
