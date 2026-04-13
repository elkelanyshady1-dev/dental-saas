/**
 * validateSecurityModes.js — Startup Security Mode Guard
 *
 * Phase A Stabilization — Boot-time assertion that security modes
 * are correctly configured for the current NODE_ENV.
 *
 * Phase A++ — Extended middleware integrity check to include
 * authTraceMiddleware and featureFlagMiddleware.
 *
 * In production:
 *   ENTITLEMENT_AUDIT_MODE must NOT be "true" (enforcement required)
 *   POLICY_SHADOW_MODE must NOT be "true" (enforcement required)
 *   DEV_AUTH_MODE must NOT be "true" (dev bypass forbidden)
 *
 * In development:
 *   Logs warnings if enforcement is active (may block local work).
 *
 * PLANE: Shared — runs at boot in server.js
 */

"use strict";

const logger = require("@utils/logger");

/**
 * @typedef {Object} SecurityModeResult
 * @property {boolean} valid — true if all modes are correctly configured
 * @property {string[]} violations — list of violation descriptions
 * @property {string[]} warnings — list of advisory warnings
 */

/**
 * validateSecurityModes
 *
 * Checks that security-critical environment variables are properly
 * configured for the current NODE_ENV.
 *
 * @param {Object} [options]
 * @param {boolean} [options.strict=false] — if true, throws on violations (crash the server)
 * @returns {SecurityModeResult}
 */
function validateSecurityModes(options = {}) {
    const { strict = false } = options;
    const env = process.env.NODE_ENV || "development";
    const isProd = env === "production";

    const violations = [];
    const warnings = [];

    // ── Production Invariants ─────────────────────────────────────────────────
    if (isProd) {
        if (process.env.ENTITLEMENT_AUDIT_MODE === "true") {
            violations.push(
                "ENTITLEMENT_AUDIT_MODE=true in production — entitlement guards are bypassed (log-only). " +
                "Set ENTITLEMENT_AUDIT_MODE=false or remove it."
            );
        }

        if (process.env.POLICY_SHADOW_MODE === "true") {
            violations.push(
                "POLICY_SHADOW_MODE=true in production — PBAC policy engine is in shadow mode (log-only). " +
                "Set POLICY_SHADOW_MODE=false or remove it."
            );
        }

        if (process.env.DEV_AUTH_MODE === "true") {
            violations.push(
                "DEV_AUTH_MODE=true in production — development authentication bypass is active. " +
                "Set DEV_AUTH_MODE=false or remove it."
            );
        }

        if (process.env.ALLOW_SUPERADMIN_DEV_BYPASS === "true") {
            violations.push(
                "ALLOW_SUPERADMIN_DEV_BYPASS=true in production — superadmin can bypass all guards. " +
                "This is already caught by server.js but double-checking here."
            );
        }

        if (process.env.AUTH_TRACE === "true") {
            warnings.push(
                "AUTH_TRACE=true in production — verbose auth logging is enabled. " +
                "This may have performance impact. Consider disabling."
            );
        }
    }

    // ── Development Advisories ────────────────────────────────────────────────
    if (!isProd) {
        if (process.env.ENTITLEMENT_AUDIT_MODE !== "true") {
            warnings.push(
                "ENTITLEMENT_AUDIT_MODE is NOT 'true' in development — entitlement guards are enforcing. " +
                "Set ENTITLEMENT_AUDIT_MODE=true if local development is blocked."
            );
        }

        if (process.env.POLICY_SHADOW_MODE !== "true") {
            warnings.push(
                "POLICY_SHADOW_MODE is NOT 'true' in development — PBAC policy engine is enforcing. " +
                "Set POLICY_SHADOW_MODE=true if local development is blocked."
            );
        }
    }

    // ── Phase A++ — Middleware Pipeline Integrity Check ───────────────────────
    // Verify that critical auth middleware modules are loadable.
    // If a required middleware file is missing or has a syntax error, the
    // server should detect it at boot rather than failing on first request.
    // Phase 4: assertCapabilities removed (was never mounted — dead code deleted).
    const criticalMiddleware = [
        { name: "unifiedCapabilityMiddleware", path: "@middleware/unifiedCapabilityMiddleware" },
        { name: "authTraceMiddleware", path: "@middleware/authTraceMiddleware" },
        { name: "featureFlagMiddleware", path: "@platform/flags/featureFlagMiddleware" },
    ];


    for (const mw of criticalMiddleware) {
        try {
            const mod = require(mw.path);
            if (typeof mod !== "function" && typeof mod?.default !== "function") {
                // Module loaded but may export an object (e.g., featureFlagMiddleware
                // exports { featureFlagMiddleware, getCacheStats }). This is valid
                // as long as the module loaded without error.
                if (typeof mod !== "object" || mod === null) {
                    warnings.push(
                        `Middleware ${mw.name} (${mw.path}) loaded but is not a function or object — ` +
                        "auth pipeline may be broken."
                    );
                }
            }
        } catch (loadErr) {
            violations.push(
                `Critical middleware ${mw.name} (${mw.path}) failed to load: ${loadErr.message}. ` +
                "The auth pipeline is broken — fail-fast guarantee may be inactive."
            );
        }
    }

    // ── Log Results ──────────────────────────────────────────────────────────
    if (violations.length > 0) {
        for (const v of violations) {
            logger.error(
                { service: "server", action: "security_mode_violation", env },
                `[BOOT] ❌ SECURITY VIOLATION: ${v}`
            );
        }
    }

    if (warnings.length > 0) {
        for (const w of warnings) {
            logger.warn(
                { service: "server", action: "security_mode_warning", env },
                `[BOOT] ⚠️ SECURITY WARNING: ${w}`
            );
        }
    }

    if (violations.length === 0 && warnings.length === 0) {
        logger.info(
            { service: "server", action: "security_mode_ok", env },
            "[BOOT] ✅ Security modes validated — all enforcement flags correctly configured"
        );
    }

    const valid = violations.length === 0;

    // ── Strict Mode → crash on violations ────────────────────────────────────
    if (!valid && strict) {
        throw new Error(
            `[SecurityModeGuard] ${violations.length} security violation(s) detected in ${env}:\n` +
            violations.map((v, i) => `  ${i + 1}. ${v}`).join("\n")
        );
    }

    return { valid, violations, warnings };
}

module.exports = { validateSecurityModes };
