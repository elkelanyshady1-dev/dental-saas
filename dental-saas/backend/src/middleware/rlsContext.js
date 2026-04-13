/**
 * rlsContext.js — Row-Level Security Context Middleware (Phase 7 — Bridge)
 *
 * Builds the frozen req.rls tenant context from req.context (unified source).
 * This middleware is a BRIDGE — it reads from the Phase 7 unified context
 * and projects the subset needed by secureModel/queryScoper.
 *
 * Once all secureModel consumers are migrated to read req.context directly,
 * this middleware can be fully removed.
 *
 * INVARIANTS:
 *   1. req.rls is ALWAYS present for org-scoped routes
 *   2. req.rls is Object.freeze'd — controllers CANNOT mutate scope
 *   3. organizationId comes from req.context (verified JWT, never client input)
 *   4. Missing organizationId → 500 (security misconfiguration)
 */

"use strict";

const logger = require("../utils/logger");

function rlsContext(req, res, next) {
    // Phase 7: Read from unified context if available, fallback to legacy
    const orgId = req.context?.organizationId || req.organizationId;

    if (!orgId) {
        logger.error({
            event: "RLS_CONTEXT_MISSING_ORG",
            path: req.originalUrl,
            method: req.method,
            userId: req.user?._id,
        }, "[RLS] CRITICAL: organizationId missing — middleware pipeline misconfigured");

        return res.status(500).json({
            success: false,
            error: {
                code: "RLS_CONTEXT_ERROR",
                message: "Security context could not be established.",
            },
        });
    }

    // Build frozen RLS context from unified source
    req.rls = Object.freeze({
        organizationId: orgId,
        branchId: req.context?.branchId || req.activeBranchId || null,
        userId: req.context?.userId || req.user?._id || null,
        branchAccess: req.context?.allowedBranches || req.user?.branchAccess || [],
        hasFullBranchAccess: req.context?.hasFullBranchAccess ?? (req.user?.hasFullBranchAccess === true),
    });

    next();
}

module.exports = rlsContext;
