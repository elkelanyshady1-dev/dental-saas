/**
 * assertOrgContext.js — Org Context Validation Guard
 * @rls-bridge-guard — Pure assertion layer. ZERO DB access.
 *
 * Provides deterministic org context assertion for bridge services.
 * Ensures that the organizationId used in data access ALWAYS matches
 * the JWT-derived org context, preventing IDOR and cross-tenant attacks.
 *
 * INVARIANTS:
 *   ✔ organizationId MUST come from JWT (req.organizationId / req.user.organizationId)
 *   ✔ NEVER trusts req.body.organizationId
 *   ✔ NEVER trusts req.params.organizationId
 *   ✔ Fails closed on context mismatch
 *   ✔ Fails closed on missing context
 *   ✔ Stateless — no DB access, pure assertion
 *
 * USAGE:
 *   const { assertOrgContext, extractOrgId } = require("@core/security/assertOrgContext");
 *
 *   // In service layer:
 *   const orgId = extractOrgId(req);
 *   assertOrgContext(req, someResourceOrgId);
 *
 * PLANE: Core (shared — usable in org and bridge layers)
 *
 * @module core/security/assertOrgContext
 */

"use strict";

const logger = require("../../utils/logger");

/**
 * Extracts the trusted organizationId from the request context.
 * This is the ONLY valid source of org identity for bridge operations.
 *
 * Priority:
 *   1. req.organizationId (set by orgProtect/organizationMiddleware)
 *   2. req.user?.organizationId (from JWT payload)
 *
 * @param {Object} req - Express request object
 * @returns {string} The trusted organizationId
 * @throws {Error} ORG_CONTEXT_MISSING if no org context found
 */
function extractOrgId(req) {
    const orgId = req?.organizationId || req?.user?.organizationId;

    if (!orgId) {
        logger.error({
            event: "ORG_CONTEXT_EXTRACTION_FAILED",
            userId: req?.user?._id || null,
            path: req?.originalUrl || "unknown",
        }, "[assertOrgContext] No organizationId in request context");

        const err = new Error("Organization context is missing from request");
        err.code = "ORG_CONTEXT_MISSING";
        err.status = 403;
        throw err;
    }

    return orgId.toString();
}

/**
 * Asserts that a given organizationId matches the authenticated org context.
 * Use this when accessing a resource that belongs to a specific org to prevent
 * cross-tenant data access.
 *
 * @param {Object} req - Express request object (must have org context)
 * @param {string|ObjectId} resourceOrgId - The organizationId of the resource being accessed
 * @throws {Error} ORG_CONTEXT_MISSING if req has no org context
 * @throws {Error} ORG_CONTEXT_MISMATCH if resource belongs to different org
 */
function assertOrgContext(req, resourceOrgId) {
    const ctxOrgId = extractOrgId(req);

    if (!resourceOrgId) {
        logger.error({
            event: "ORG_CONTEXT_ASSERT_NULL_RESOURCE",
            ctxOrgId,
            path: req?.originalUrl || "unknown",
        }, "[assertOrgContext] Resource organizationId is null/undefined");

        const err = new Error("Resource organization context is missing");
        err.code = "ORG_CONTEXT_MISSING";
        err.status = 403;
        throw err;
    }

    if (ctxOrgId !== resourceOrgId.toString()) {
        logger.warn({
            event: "ORG_CONTEXT_MISMATCH",
            ctxOrgId,
            resourceOrgId: resourceOrgId.toString(),
            userId: req?.user?._id || null,
            path: req?.originalUrl || "unknown",
        }, "[assertOrgContext] SECURITY: Org context mismatch — cross-tenant access blocked");

        const err = new Error("Organization context does not match the requested resource");
        err.code = "ORG_CONTEXT_MISMATCH";
        err.status = 403;
        throw err;
    }
}

/**
 * Middleware factory that injects assertOrgContext into req for downstream use.
 * Attaches req.assertOrgContext(resourceOrgId) as a convenience method.
 *
 * @returns {Function} Express middleware
 */
function orgContextMiddleware() {
    return (req, _res, next) => {
        req.assertOrgContext = (resourceOrgId) => assertOrgContext(req, resourceOrgId);
        next();
    };
}

module.exports = {
    assertOrgContext,
    extractOrgId,
    orgContextMiddleware,
};
