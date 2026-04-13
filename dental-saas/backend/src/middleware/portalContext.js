/**
 * portalRLSContext.js — Patient Portal RLS Context Middleware
 * Phase 1 — Portal Domain Evolution: RLS Foundation Layer
 *
 * PURPOSE:
 * Builds and attaches a frozen, tamper-proof tenant context to every portal request.
 * This is the portal-plane equivalent of rlsContext.js (org-plane).
 *
 * TWO MODES:
 *   1. AUTHENTICATED (after patientProtect)
 *      - req.user exists, req.organizationId from JWT
 *      - req.rls.userId = patientUserId
 *      - req.rls.role = "patient"
 *      - req.rls.scope = "portal"
 *
 *   2. PUBLIC AUTH (login, OTP, magic link)
 *      - req.user does NOT exist yet
 *      - req.organizationId from organizationContext header
 *      - req.rls.userId = null
 *      - req.rls.role = "public"
 *      - req.rls.scope = "portal-auth"
 *
 * INVARIANTS:
 *   - req.rls is ALWAYS present after this middleware
 *   - req.rls is Object.freeze'd — cannot be mutated downstream
 *   - req.rls.organizationId derived from JWT or middleware, NEVER client body
 *   - Missing organizationId → 500 (fail-closed)
 *
 * PIPELINE:
 *   Protected:  patientProtect → portalRLSContext → route handler
 *   Public:     organizationContext → portalRLSContextPublic → route handler
 *
 * PLANE: Patient Portal only.
 *
 * @per-org-transactional — portal tenant context builder — organizationId from JWT or org middleware
 */

"use strict";

const crypto = require("crypto");
const logger = require("../utils/logger");

// ── Inline context version + hash (replaces queryScoper dependency) ────────
const RLS_CONTEXT_VERSION = "v2-perorg";

function generateRLSHash(rls) {
    const payload = JSON.stringify({
        organizationId: rls.organizationId,
        branchId: rls.branchId,
        userId: rls.userId,
        version: RLS_CONTEXT_VERSION,
    });
    return crypto.createHash("sha256").update(payload).digest("hex");
}

// ─── Authenticated Portal RLS Context ─────────────────────────────────────────
// Use AFTER patientProtect middleware (req.user + req.organizationId guaranteed)

/**
 * Builds tenant context for authenticated patient portal routes.
 *
 * Requires: patientProtect middleware to have run first.
 * Sets: req.rls (frozen), req.rlsHash, req.rlsVersion, req.rlsTraceId
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function portalRLSContext(req, res, next) {
    // ── Fail-closed: organizationId MUST exist from patientProtect JWT ────
    if (!req.organizationId) {
        logger.error({
            event: "PORTAL_RLS_CONTEXT_MISSING_ORG",
            path: req.originalUrl,
            method: req.method,
            hasUser: !!req.user,
            ip: req.ip,
        }, "[PortalRLS] CRITICAL: organizationId missing — patientProtect must run before portalRLSContext");

        return res.status(500).json({
            success: false,
            error: {
                code: "RLS_CONTEXT_ERROR",
                message: "Security context could not be established.",
            },
        });
    }

    // ── Fail-closed: req.user MUST exist for authenticated portal routes ──
    if (!req.user) {
        logger.error({
            event: "PORTAL_RLS_CONTEXT_MISSING_USER",
            path: req.originalUrl,
            method: req.method,
            ip: req.ip,
        }, "[PortalRLS] CRITICAL: req.user missing — patientProtect must run before portalRLSContext");

        return res.status(500).json({
            success: false,
            error: {
                code: "RLS_CONTEXT_ERROR",
                message: "Security context could not be established.",
            },
        });
    }

    // ── Build Portal RLS Context ─────────────────────────────────────────
    const rlsCtx = {
        // ALWAYS present — non-negotiable tenant isolation
        organizationId: req.organizationId,

        // Patient portal has no branch context
        branchId: null,

        // Patient user identity
        userId: req.user._id || null,

        // Portal-specific role marker (distinct from org roles)
        role: "patient",

        // Scope marker for downstream audit/filtering
        scope: "portal",

        // Patient ID for ownership scoping
        patientId: req.patientId || null,

        // Portal has no branch access
        branchAccess: [],
        hasFullBranchAccess: false,

        // Timestamp — for audit trail
        resolvedAt: Date.now(),
    };

    // ── FREEZE — controllers CANNOT mutate RLS scope ────────────────────
    req.rls = Object.freeze(rlsCtx);

    // ── RLS Version ─────────────────────────────────────────────────────
    req.rlsVersion = RLS_CONTEXT_VERSION;

    // ── RLS Fingerprint Hash ────────────────────────────────────────────
    req.rlsHash = generateRLSHash(req.rls);

    // ── Request Trace ID ────────────────────────────────────────────────
    req.rlsTraceId = req.headers?.["x-request-id"]
        || req.id
        || crypto.randomUUID();

    logger.debug({
        event: "PORTAL_RLS_CONTEXT_CREATED",
        hash: req.rlsHash.substring(0, 12),
        traceId: req.rlsTraceId,
        version: RLS_CONTEXT_VERSION,
        orgId: rlsCtx.organizationId,
        userId: rlsCtx.userId,
        patientId: rlsCtx.patientId,
        scope: rlsCtx.scope,
        path: req.originalUrl,
    });

    next();
}

// ─── Public Auth Portal RLS Context ───────────────────────────────────────────
// Use for UNAUTHENTICATED routes: login, OTP, magic link
// organizationContext middleware must run before this to set req.organizationId

/**
 * Builds minimal tenant context for public portal auth routes.
 *
 * Requires: organizationContext middleware (or equivalent) to set req.organizationId.
 * Does NOT require req.user (pre-auth routes).
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function portalRLSContextPublic(req, res, next) {
    // ── Fail-closed: organizationId MUST exist from organizationContext ───
    if (!req.organizationId) {
        logger.error({
            event: "PORTAL_RLS_PUBLIC_MISSING_ORG",
            path: req.originalUrl,
            method: req.method,
            ip: req.ip,
        }, "[PortalRLS] CRITICAL: organizationId missing on public auth route");

        return res.status(500).json({
            success: false,
            error: {
                code: "RLS_CONTEXT_ERROR",
                message: "Security context could not be established.",
            },
        });
    }

    // ── Build Public Auth RLS Context ────────────────────────────────────
    const rlsCtx = {
        organizationId: req.organizationId,
        branchId: null,
        userId: null,           // No user yet — pre-auth
        role: "public",         // Pre-authentication role
        scope: "portal-auth",   // Public auth scope
        patientId: null,
        branchAccess: [],
        hasFullBranchAccess: false,
        resolvedAt: Date.now(),
    };

    // ── FREEZE ──────────────────────────────────────────────────────────
    req.rls = Object.freeze(rlsCtx);

    req.rlsVersion = RLS_CONTEXT_VERSION;
    req.rlsHash = generateRLSHash(req.rls);
    req.rlsTraceId = req.headers?.["x-request-id"]
        || req.id
        || crypto.randomUUID();

    logger.debug({
        event: "PORTAL_RLS_PUBLIC_CONTEXT_CREATED",
        hash: req.rlsHash.substring(0, 12),
        traceId: req.rlsTraceId,
        orgId: rlsCtx.organizationId,
        scope: rlsCtx.scope,
        path: req.originalUrl,
    });

    next();
}

// ─── Assertion Utilities ────────────────────────────────────────────────────

/**
 * Post-middleware assertion: Validates that req.rls was established.
 * Useful as a safety net before service layer execution.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function assertPortalRLS(req, res, next) {
    if (!req.rls || !req.rls.organizationId) {
        logger.error({
            event: "PORTAL_RLS_ASSERTION_FAILED",
            path: req.originalUrl,
            method: req.method,
            hasRLS: !!req.rls,
            hasOrgId: !!req.rls?.organizationId,
        }, "[PortalRLS] ASSERTION FAILED: req.rls missing or incomplete");

        return res.status(500).json({
            success: false,
            error: {
                code: "RLS_ASSERTION_FAILED",
                message: "Security context assertion failed.",
            },
        });
    }

    next();
}

module.exports = {
    portalRLSContext,
    portalRLSContextPublic,
    assertPortalRLS,
};
