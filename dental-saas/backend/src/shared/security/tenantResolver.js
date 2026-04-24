/**
 * tenantResolver.js — Authoritative Tenant Context Extractor
 * Phase 5 — Runtime Enforcement Layer (Tenant Isolation Hardening)
 *
 * Extracts a canonical, frozen tenant context from the request pipeline.
 * This is the SINGLE SOURCE of tenant identity for all downstream consumers.
 *
 * Resolves context per-plane:
 *   - Organization plane: req.context (populated by authMiddleware from JWT)
 *   - Patient Portal:     req.rls (populated by portalRLSContext)
 *   - Platform plane:     req.platformUser (populated by authMiddleware)
 *   - Supervisor plane:   req.context (populated by supervisor auth)
 *
 * INVARIANTS:
 *   1. NEVER reads organizationId from req.body or req.query
 *   2. Returned context is Object.freeze'd — downstream cannot mutate
 *   3. Missing required fields → throws (fail-closed)
 *   4. actorType is deterministic from the authentication path
 *
 * @module shared/security/tenantResolver
 */

"use strict";

const crypto = require("crypto");

/**
 * Detect the actor type from the request's authentication state.
 * The auth middleware sets distinct markers per plane.
 *
 * @param {import("express").Request} req
 * @returns {"org_user"|"platform_user"|"portal_patient"|"supervisor"|"unknown"}
 */
function resolveActorType(req) {
    if (req.platformUser) return "platform_user";
    if (req.rls?.scope === "portal" || req.rls?.scope === "portal-auth") return "portal_patient";
    if (req.context?.roleName === "supervisor" || req.user?.type === "supervisor") return "supervisor";
    if (req.context?.userId) return "org_user";
    return "unknown";
}

/**
 * Resolve tenant context from the request.
 *
 * For org-plane and supervisor: reads from req.context (JWT-derived).
 * For portal: reads from req.rls (frozen by portalRLSContext).
 * For platform: reads from req.platformUser (no org isolation — platform is global).
 *
 * @param {import("express").Request} req
 * @returns {Readonly<TenantContext>}
 * @throws {Error} If tenant context cannot be established (fail-closed)
 *
 * @typedef {Object} TenantContext
 * @property {string|null} organizationId - Org scope (null for platform-global)
 * @property {string} actorId - The authenticated user/patient ID
 * @property {"org_user"|"platform_user"|"portal_patient"|"supervisor"} actorType
 * @property {Set<string>|null} permissions - RBAC permissions (null for portal/platform)
 * @property {string|null} branchId - Active branch (org-plane only)
 * @property {string|null} regionCode - Geographic region
 * @property {string} correlationId - Request trace ID
 * @property {number} resolvedAt - Timestamp of resolution
 */
function resolveTenantContext(req) {
    const actorType = resolveActorType(req);

    // ─── Platform plane: global scope, no tenant isolation needed ────
    if (actorType === "platform_user") {
        const user = req.platformUser;
        return Object.freeze({
            organizationId: null,
            actorId: String(user._id || user.userId),
            actorType: "platform_user",
            permissions: null,
            branchId: null,
            regionCode: user.regionCode || null,
            correlationId: _correlationId(req),
            resolvedAt: Date.now(),
        });
    }

    // ─── Portal plane: reads from frozen req.rls ────────────────────
    if (actorType === "portal_patient") {
        const rls = req.rls;
        if (!rls?.organizationId) {
            const err = new Error(
                "[tenantResolver] FAIL-CLOSED: Portal request missing organizationId in req.rls. " +
                "portalRLSContext middleware must run before tenantResolver."
            );
            err.code = "TENANT_CONTEXT_MISSING";
            err.status = 500;
            throw err;
        }
        return Object.freeze({
            organizationId: String(rls.organizationId),
            actorId: rls.userId ? String(rls.userId) : null,
            actorType: "portal_patient",
            permissions: null,
            branchId: null,
            regionCode: req.regionCode || null,
            correlationId: _correlationId(req),
            resolvedAt: Date.now(),
        });
    }

    // ─── Org / Supervisor plane: reads from req.context (JWT) ───────
    const ctx = req.context;
    if (!ctx?.organizationId) {
        const err = new Error(
            "[tenantResolver] FAIL-CLOSED: Request missing organizationId in req.context. " +
            "authMiddleware must run before tenantResolver."
        );
        err.code = "TENANT_CONTEXT_MISSING";
        err.status = 500;
        throw err;
    }

    return Object.freeze({
        organizationId: String(ctx.organizationId),
        actorId: String(ctx.userId),
        actorType,
        permissions: ctx.permissions instanceof Set ? ctx.permissions : null,
        branchId: ctx.branchId || null,
        regionCode: ctx.regionCode || null,
        correlationId: _correlationId(req),
        resolvedAt: Date.now(),
    });
}

/**
 * Extract or generate a correlation ID for request tracing.
 * @param {import("express").Request} req
 * @returns {string}
 */
function _correlationId(req) {
    return (
        req.headers?.["x-correlation-id"] ||
        req.headers?.["x-request-id"] ||
        req.rlsTraceId ||
        crypto.randomUUID()
    );
}

/**
 * Express middleware that resolves tenant context and attaches it as req.tenantContext.
 * Fails closed (500) if context cannot be established for non-platform routes.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function tenantResolverMiddleware(req, res, next) {
    try {
        req.tenantContext = resolveTenantContext(req);
        next();
    } catch (err) {
        const logger = require("@utils/logger");
        logger.error({
            event: "TENANT_CONTEXT_RESOLUTION_FAILED",
            code: err.code,
            path: req.originalUrl,
            method: req.method,
            ip: req.ip,
        }, err.message);

        return res.status(err.status || 500).json({
            success: false,
            error: {
                code: err.code || "TENANT_CONTEXT_ERROR",
                message: "Security context could not be established.",
            },
        });
    }
}

module.exports = {
    resolveTenantContext,
    resolveActorType,
    tenantResolverMiddleware,
};
