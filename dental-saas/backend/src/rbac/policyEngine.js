/**
 * policyEngine.js — Policy-Based Access Control (PBAC) Engine
 *
 * Production-grade access control engine that adds resource-level,
 * ownership-based, and context-aware authorization on top of base RBAC.
 *
 * Flow:
 *   requireOrgPermission(P.XXX)     ← Base check: does user have the permission?
 *        ↓ (passes)
 *   policyEngine.checkAccess(...)    ← Fine-grained: MAY user access THIS resource?
 *
 * Context assembly:
 *   - user:            from req.user (hydrated by authMiddleware)
 *   - resource:        fetched by getResource callback (DB lookup)
 *   - branchId:        from req.branchId (set by branchScopeMiddleware)
 *   - organizationId:  from req.organizationId (set by organizationContext)
 *
 * PLANE: Org only.
 */

"use strict";

const { evaluatePolicy } = require("./policyEvaluator");
const logger = require("@utils/logger");

// ─── Access Check ───────────────────────────────────────────────────────────

/**
 * Check if a user has access to a specific resource under a given permission.
 *
 * @param {Object} params
 * @param {Object} params.user — authenticated org user (req.user)
 * @param {string} params.permission — the RBAC permission being exercised
 * @param {Object|null} params.resource — the resource being accessed (optional)
 * @param {string|null} params.branchId — active branch context
 * @param {string} params.organizationId — organization from JWT
 * @param {string} [params.method] — HTTP method
 * @param {string} [params.path] — request path
 * @returns {{ allowed: boolean, reason: string, effect: string }}
 */
function checkAccess({ user, permission, resource = null, branchId = null, organizationId = null, method = null, path = null, permissions = null }) {
    // Build evaluation context
    const ctx = {
        user,
        // RBAC SSOT: the permission Set from req.context.permissions. Policy
        // conditions that need to check a capability MUST read this, never a
        // role name. Falls back to user.permissions for callers that forgot
        // to plumb the Set, so legacy call sites still work.
        permissions: permissions || user?.permissions || null,
        resource,
        branchId,
        organizationId: organizationId || user?.organizationId,
        method: method || "UNKNOWN",
        path: path || "UNKNOWN",
        timestamp: new Date(),
    };

    // Evaluate
    const decision = evaluatePolicy(permission, ctx);

    // Observability: log denied decisions for audit trail
    if (!decision.allowed) {
        logger.warn({
            event: "POLICY_ACCESS_DENIED",
            permission,
            userId: user?._id,
            role: user?.roleId?.name || user?.role,
            organizationId: ctx.organizationId,
            branchId,
            resourceId: resource?._id,
            reason: decision.reason,
            effect: decision.effect,
            matchedRule: decision.matchedRule,
            method: ctx.method,
            path: ctx.path,
        }, `[PolicyEngine] Access denied: ${decision.reason}`);
    }

    return decision;
}

// ─── Bulk Access Check (UI Capability Projection) ───────────────────────────

/**
 * Check which actions a user can perform on a specific resource.
 * Used by the frontend to show/hide action buttons.
 *
 * @param {Object} params
 * @param {Object} params.user — authenticated user
 * @param {Object} params.resource — the resource
 * @param {string[]} params.permissions — list of permissions to check
 * @param {string|null} params.branchId — branch context
 * @param {string} params.organizationId — org context
 * @returns {Object<string, boolean>} — map of permission → allowed
 */
function checkResourceCapabilities({ user, resource, permissions, branchId = null, organizationId = null }) {
    const result = {};

    for (const perm of permissions) {
        const decision = checkAccess({
            user,
            permission: perm,
            resource,
            branchId,
            organizationId,
        });
        result[perm] = decision.allowed;
    }

    return result;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    checkAccess,
    checkResourceCapabilities,
};
