/**
 * shadowMode.js — Policy Shadow Mode Controller
 *
 * Provides shadow mode infrastructure for safe policy rollout.
 * When POLICY_SHADOW_MODE=true, policy denials are LOGGED but NOT ENFORCED.
 * This allows production observation of policy impact without UX breakage.
 *
 * Flow:
 *   Shadow ON:  evaluate → denied? → log POLICY_SHADOW_DENY → next() (allow)
 *   Shadow OFF: evaluate → denied? → 403 (enforce)
 *
 * PLANE: Org only.
 */

"use strict";

const logger = require("@utils/logger");

// ─── Shadow Mode Flag ──────────────────────────────────────────────────────

/**
 * Check if shadow mode is currently active.
 * @returns {boolean}
 */
function isShadowMode() {
    return process.env.POLICY_SHADOW_MODE === "true";
}

/**
 * Get shadow mode configuration.
 * @returns {{ enabled: boolean, logLevel: string }}
 */
function getShadowConfig() {
    return {
        enabled: isShadowMode(),
        logLevel: process.env.POLICY_SHADOW_LOG_LEVEL || "warn",
    };
}

// ─── Shadow Denial Logger ──────────────────────────────────────────────────

/**
 * Log a shadow-mode denial for monitoring purposes.
 * Does NOT block the request — only records what WOULD have been denied.
 *
 * @param {Object} params
 * @param {Object} params.user — req.user
 * @param {string} params.permission — the permission being exercised
 * @param {Object} params.decision — the policy decision object
 * @param {string} params.route — the request route
 * @param {string} params.method — HTTP method
 * @param {string} params.requestId — correlation ID
 * @param {string} params.organizationId — org context
 * @param {string} params.branchId — branch context
 */
function logShadowDenial({
    user,
    permission,
    decision,
    route,
    method,
    requestId,
    organizationId,
    branchId,
}) {
    const payload = {
        event: "POLICY_SHADOW_DENY",
        permission,
        userId: user?._id,
        role: user?.roleId?.name || user?.role,
        organizationId,
        branchId,
        reason: decision.reason,
        effect: decision.effect,
        matchedRule: decision.matchedRule,
        route,
        method,
        requestId,
        timestamp: new Date().toISOString(),
    };

    logger.warn(payload, `[PolicyShadow] WOULD DENY: ${permission} — ${decision.reason}`);

    return payload;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    isShadowMode,
    getShadowConfig,
    logShadowDenial,
};
