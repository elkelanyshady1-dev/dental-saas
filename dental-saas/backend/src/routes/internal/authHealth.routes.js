/**
 * authHealth.routes.js — Auth System Health Endpoint
 *
 * Phase A+ (TASK-AUTH-HARD-002)
 * Phase A++ (TASK-AUTH-STAB-003) — Added:
 *   - x-internal-key header validation (production security)
 *   - authTraceEnabled flag in response
 *   - Feature flag cache hit/miss statistics
 *
 * PURPOSE:
 * Provides an internal monitoring endpoint that exposes the current
 * state of the authorization enforcement system. Used by:
 *   - DevOps health checks / uptime monitoring
 *   - CI pipelines validating deployment integrity
 *   - On-call engineers debugging auth failures
 *
 * SECURITY:
 *   This endpoint is mounted under /internal/ and does NOT require auth.
 *   It intentionally exposes only boolean enforcement flags — no secrets,
 *   no PII, no capability data. Safe for internal monitoring tools.
 *
 *   Phase A++: When INTERNAL_API_KEY env var is set, the endpoint requires
 *   a matching x-internal-key header. This prevents unauthenticated external
 *   scraping of enforcement state in production.
 *
 * MOUNT:
 *   In app.js — before v1Router (no auth context needed):
 *     app.use("/api/internal", authHealthRoutes);
 *
 * PLANE: Infrastructure (no plane isolation concern).
 *
 * @swagger
 * tags:
 *   name: Internal
 *   description: Internal monitoring and operations endpoints
 */

"use strict";

const express = require("express");
const router = express.Router();

// Phase A++ — import feature flag cache stats for observability
let getCacheStats;
try {
    ({ getCacheStats } = require("@platform/flags/featureFlagMiddleware"));
} catch (_) {
    // Graceful fallback — if middleware is not loadable, return empty stats
    getCacheStats = () => ({ hits: 0, misses: 0, error: "middleware_not_loaded" });
}

/**
 * @swagger
 * /api/internal/auth-health:
 *   get:
 *     summary: Auth system health check
 *     description: |
 *       Returns the current enforcement state of the authorization system.
 *       Used by monitoring tools to verify that security modes are correctly
 *       configured after deployment.
 *
 *       Phase A++: Requires x-internal-key header when INTERNAL_API_KEY is set.
 *     tags: [Internal]
 *     parameters:
 *       - in: header
 *         name: x-internal-key
 *         schema:
 *           type: string
 *         description: Internal API key (required when INTERNAL_API_KEY env var is set)
 *     responses:
 *       200:
 *         description: Auth health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     entitlementAuditMode:
 *                       type: boolean
 *                       description: If true, entitlement checks are in audit-only mode (not enforcing)
 *                     policyShadowMode:
 *                       type: boolean
 *                       description: If true, PBAC policies log but do not block
 *                     devAuthMode:
 *                       type: boolean
 *                       description: If true, dev auth bypass is enabled
 *                     authTraceEnabled:
 *                       type: boolean
 *                       description: If true, auth trace persistence is active
 *                     securityStrictBoot:
 *                       type: boolean
 *                       description: If true, server crashes on security misconfig at boot
 *                     nodeEnv:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       403:
 *         description: Invalid or missing internal API key
 */
router.get("/auth-health", (req, res) => {
    // ── Phase A++ — Internal Key Validation ──────────────────────────────────
    const expectedKey = process.env.INTERNAL_API_KEY;
    if (expectedKey) {
        const providedKey = req.headers["x-internal-key"];
        if (providedKey !== expectedKey) {
            return res.status(403).json({
                success: false,
                error: "FORBIDDEN",
                message: "Invalid or missing x-internal-key header",
            });
        }
    }

    const data = {
        entitlementAuditMode: process.env.ENTITLEMENT_AUDIT_MODE === "true",
        policyShadowMode: process.env.POLICY_SHADOW_MODE === "true",
        devAuthMode: process.env.DEV_AUTH_MODE === "true",
        authTraceEnabled: process.env.AUTH_TRACE_ENABLED !== "false",  // default: true
        securityStrictBoot: process.env.SECURITY_STRICT_BOOT === "true",
        nodeEnv: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
    };

    // Phase A++ — Feature flag cache performance metrics
    const featureFlagCache = getCacheStats();

    // Production safety check — highlight if any permissive mode is active
    const hasWarning = (
        data.entitlementAuditMode ||
        data.policyShadowMode ||
        data.devAuthMode
    );

    return res.json({
        success: true,
        status: hasWarning ? "DEGRADED" : "ENFORCING",
        data,
        featureFlagCache,
        ...(hasWarning && {
            warnings: [
                ...(data.entitlementAuditMode ? ["ENTITLEMENT_AUDIT_MODE is ON — entitlements are not enforced"] : []),
                ...(data.policyShadowMode ? ["POLICY_SHADOW_MODE is ON — PBAC policies are not enforced"] : []),
                ...(data.devAuthMode ? ["DEV_AUTH_MODE is ON — authentication may be bypassed"] : []),
            ],
        }),
    });
});

module.exports = router;
