/**
 * enforceTenantIsolation.js — Non-Bypassable Tenant Isolation Middleware
 * Phase 5 — Runtime Enforcement Layer (Tenant Isolation Hardening)
 *
 * PURPOSE:
 * Final safety-net middleware that asserts tenant isolation invariants
 * AFTER all auth middleware has run. Catches misconfigurations where:
 *   - organizationId is missing from the request context
 *   - req.context.organizationId differs from req.dbConnection's target DB
 *   - req.rls.organizationId was tampered with or mismatched
 *
 * This middleware does NOT establish context — it VALIDATES that the
 * upstream middleware chain (authMiddleware → dbContext → rlsContext)
 * has done its job correctly.
 *
 * PLACEMENT:
 *   After rlsContext, before route handlers. Applied to org + portal routes.
 *   NOT applied to platform-admin routes (no per-org isolation needed).
 *
 * FAIL MODE:
 *   Always fail-closed (500). A mismatch here indicates a security
 *   misconfiguration, not a client error.
 *
 * @module shared/security/enforceTenantIsolation
 */

"use strict";

const logger = require("@utils/logger");

/**
 * Middleware factory for org-plane tenant isolation enforcement.
 *
 * Validates:
 *   1. req.context.organizationId exists
 *   2. req.dbConnection exists and targets the correct org DB
 *   3. req.rls.organizationId (if present) matches req.context.organizationId
 *
 * @param {Object} [options]
 * @param {boolean} [options.requireRLS=false] - If true, also requires req.rls to be present
 * @returns {import("express").RequestHandler}
 */
function enforceTenantIsolation(options = {}) {
    const { requireRLS = false } = options;

    return function enforceTenantIsolationMiddleware(req, res, next) {
        // ── 1. req.context.organizationId MUST exist ────────────────────
        const ctxOrgId = req.context?.organizationId;
        if (!ctxOrgId) {
            logger.error({
                event: "TENANT_ISOLATION_VIOLATION",
                violation: "MISSING_CONTEXT_ORG_ID",
                path: req.originalUrl,
                method: req.method,
                userId: req.user?._id,
            }, "[enforceTenantIsolation] CRITICAL: req.context.organizationId missing");

            return res.status(500).json({
                success: false,
                error: {
                    code: "TENANT_ISOLATION_ERROR",
                    message: "Security context could not be verified.",
                },
            });
        }

        // ── 2. req.dbConnection MUST exist and target correct DB ────────
        if (!req.dbConnection) {
            logger.error({
                event: "TENANT_ISOLATION_VIOLATION",
                violation: "MISSING_DB_CONNECTION",
                path: req.originalUrl,
                method: req.method,
                organizationId: String(ctxOrgId),
            }, "[enforceTenantIsolation] CRITICAL: req.dbConnection missing");

            return res.status(500).json({
                success: false,
                error: {
                    code: "TENANT_ISOLATION_ERROR",
                    message: "Database context could not be verified.",
                },
            });
        }

        // Verify the connection targets the expected org database.
        // dbManager names connections as `dental_org_<orgId>`.
        const connName = req.dbConnection.name;
        const expectedSuffix = String(ctxOrgId);
        if (connName && !connName.includes(expectedSuffix)) {
            logger.error({
                event: "TENANT_ISOLATION_VIOLATION",
                violation: "DB_CONNECTION_MISMATCH",
                path: req.originalUrl,
                method: req.method,
                organizationId: String(ctxOrgId),
                actualDb: connName,
            }, "[enforceTenantIsolation] CRITICAL: DB connection does not match organization context");

            return res.status(500).json({
                success: false,
                error: {
                    code: "TENANT_ISOLATION_ERROR",
                    message: "Database isolation verification failed.",
                },
            });
        }

        // ── 3. req.rls consistency check (if present or required) ───────
        if (requireRLS && !req.rls) {
            logger.error({
                event: "TENANT_ISOLATION_VIOLATION",
                violation: "MISSING_RLS",
                path: req.originalUrl,
                method: req.method,
                organizationId: String(ctxOrgId),
            }, "[enforceTenantIsolation] CRITICAL: req.rls required but missing");

            return res.status(500).json({
                success: false,
                error: {
                    code: "TENANT_ISOLATION_ERROR",
                    message: "Row-level security context missing.",
                },
            });
        }

        if (req.rls?.organizationId) {
            const rlsOrgId = String(req.rls.organizationId);
            const contextOrgId = String(ctxOrgId);

            if (rlsOrgId !== contextOrgId) {
                logger.error({
                    event: "TENANT_ISOLATION_VIOLATION",
                    violation: "RLS_CONTEXT_MISMATCH",
                    path: req.originalUrl,
                    method: req.method,
                    contextOrgId,
                    rlsOrgId,
                }, "[enforceTenantIsolation] CRITICAL: req.rls.organizationId != req.context.organizationId");

                return res.status(500).json({
                    success: false,
                    error: {
                        code: "TENANT_ISOLATION_ERROR",
                        message: "Tenant context inconsistency detected.",
                    },
                });
            }
        }

        next();
    };
}

/**
 * Lightweight portal-plane variant.
 * Validates req.rls.organizationId and req.dbConnection exist.
 * Portal doesn't have req.context (uses req.rls from portalRLSContext).
 */
function enforcePortalTenantIsolation(req, res, next) {
    const orgId = req.rls?.organizationId;

    if (!orgId) {
        logger.error({
            event: "PORTAL_TENANT_ISOLATION_VIOLATION",
            violation: "MISSING_RLS_ORG_ID",
            path: req.originalUrl,
            method: req.method,
        }, "[enforcePortalTenantIsolation] CRITICAL: req.rls.organizationId missing");

        return res.status(500).json({
            success: false,
            error: {
                code: "TENANT_ISOLATION_ERROR",
                message: "Portal security context could not be verified.",
            },
        });
    }

    if (!req.dbConnection) {
        logger.error({
            event: "PORTAL_TENANT_ISOLATION_VIOLATION",
            violation: "MISSING_DB_CONNECTION",
            path: req.originalUrl,
            method: req.method,
            organizationId: String(orgId),
        }, "[enforcePortalTenantIsolation] CRITICAL: req.dbConnection missing on portal route");

        return res.status(500).json({
            success: false,
            error: {
                code: "TENANT_ISOLATION_ERROR",
                message: "Portal database context could not be verified.",
            },
        });
    }

    next();
}

module.exports = {
    enforceTenantIsolation,
    enforcePortalTenantIsolation,
};
