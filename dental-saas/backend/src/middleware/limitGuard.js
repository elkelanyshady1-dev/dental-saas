/**
 * limitGuard.js
 * ═══════════════════════════════════════════════════════════════
 * Phase 4.0d — Runtime seat/resource limit enforcement middleware.
 *
 * Checks whether an organization has hit a specific resource limit
 * (maxUsers, maxBranches, maxPatients) before allowing creation.
 *
 * Architecture:
 *   orgProtect → organizationContext → subscriptionGuard
 *       → featureFlagMiddleware → unifiedCapabilityMiddleware
 *           → limitGuard("maxUsers") ← YOU ARE HERE
 *               → controller (creates resource)
 *
 * Data Sources:
 *   - req.capabilities.limits[key]  — Limit from plan (set by subscriptionGuard)
 *   - OrgUsage.getOrgUsage(orgId)   — Current usage counter
 *
 * Convention:
 *   - limit = 0 or null/undefined → UNLIMITED (no enforcement)
 *   - limit = -1                   → UNLIMITED (explicit)
 *   - limit > 0                    → ENFORCED
 *
 * Fail-Open Safety:
 *   If usage lookup fails, the request is ALLOWED through.
 *   Matches the system-wide convention: billing/quota errors
 *   must never block clinical workflows.
 *
 * Error Response:
 *   HTTP 403 with structured error body including current usage
 *   and configured limit for frontend display.
 *
 * PLANE: Organization
 * SENTINEL: No RBAC bypass — requires orgProtect upstream.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const { getOrgUsage } = require("../core/usage/orgUsage.service");
const logger = require("@utils/logger");

// ─── Human-readable labels for error messages ────────────────────────────────
const LIMIT_LABELS = {
    maxUsers:    "users",
    maxBranches: "branches",
    maxPatients: "patients",
};

/**
 * Create a limit enforcement middleware.
 *
 * @param {string} limitKey — One of: "maxUsers", "maxBranches", "maxPatients"
 * @param {Object} [options]
 * @param {boolean} [options.strict=false] — If true, returns 500 on lookup failure (never fail-open)
 * @returns {import("express").RequestHandler}
 *
 * @example
 *   // In route file:
 *   router.post("/",
 *     orgProtect, organizationContext, subscriptionGuard,
 *     limitGuard("maxUsers"),
 *     createUser
 *   );
 */
function limitGuard(limitKey, options = {}) {
    const { strict = false } = options;

    return async function _limitGuard(req, res, next) {
        try {
            const organizationId = req.organizationId || req.user?.organizationId;

            // ── 1. Guard: org context must be present ────────────────────────
            if (!organizationId) {
                logger.warn(
                    { limitKey },
                    "[LimitGuard] No organizationId on request — skipping limit check"
                );
                return next();
            }

            // ── 2. Resolve limit from capabilities ───────────────────────────
            // Set by subscriptionGuard → entitlementResolver → req.capabilities
            const limit = req.capabilities?.limits?.[limitKey];

            // Unlimited: null, undefined, 0, -1 → skip check
            if (!limit || limit <= 0 || limit === -1) {
                return next();
            }

            // ── 3. Fetch current usage ───────────────────────────────────────
            const usage = await getOrgUsage(organizationId);

            // Map limit keys to usage counter fields
            const USAGE_MAP = {
                maxUsers:    usage.usersCount,
                maxBranches: usage.branchesCount,
                maxPatients: usage.patientsCount,
            };

            const currentCount = USAGE_MAP[limitKey];

            if (currentCount === undefined) {
                // Unknown limit key — programming error, log and allow
                logger.error(
                    { limitKey, organizationId: String(organizationId) },
                    "[LimitGuard] Unknown limitKey — skipping enforcement"
                );
                return next();
            }

            // ── 4. Enforce limit ─────────────────────────────────────────────
            if (currentCount >= limit) {
                const label = LIMIT_LABELS[limitKey] || limitKey;

                logger.warn({
                    event: "LIMIT_GUARD_BLOCKED",
                    limitKey,
                    currentCount,
                    limit,
                    organizationId: String(organizationId),
                    userId: req.user?._id?.toString(),
                    endpoint: `${req.method} ${req.originalUrl}`,
                }, `[LimitGuard] ${label} limit reached (${currentCount}/${limit})`);

                // Auth trace for debugging
                if (typeof req.addAuthTrace === "function") {
                    req.addAuthTrace({
                        layer: "LIMIT_GUARD",
                        limitKey,
                        result: "DENY",
                        reason: `${label} limit reached: ${currentCount}/${limit}`,
                    });
                }

                return res.status(403).json({
                    success: false,
                    error: {
                        code: "RESOURCE_LIMIT_REACHED",
                        limitKey,
                        message: `You have reached the maximum number of ${label} allowed by your plan (${currentCount}/${limit}). Please upgrade your plan to add more.`,
                        details: {
                            resource: label,
                            currentCount,
                            limit,
                            remaining: 0,
                        },
                    },
                });
            }

            // ── 5. Under limit — proceed ─────────────────────────────────────
            if (typeof req.addAuthTrace === "function") {
                req.addAuthTrace({
                    layer: "LIMIT_GUARD",
                    limitKey,
                    result: "ALLOW",
                    reason: `Usage: ${currentCount}/${limit}`,
                });
            }

            return next();

        } catch (err) {
            // ── FAIL-OPEN (default) or FAIL-CLOSED (strict) ──────────────────
            logger.error(
                { err, limitKey, organizationId: req.organizationId },
                `[LimitGuard] Limit check failed — ${strict ? "blocking (strict)" : "allowing (fail-open)"}`
            );

            if (strict) {
                return res.status(500).json({
                    success: false,
                    error: {
                        code: "LIMIT_CHECK_FAILED",
                        message: "Unable to verify resource limits. Please try again.",
                    },
                });
            }

            return next();
        }
    };
}

module.exports = limitGuard;
