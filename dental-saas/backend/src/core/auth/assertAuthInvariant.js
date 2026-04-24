/**
 * assertAuthInvariant.js — Single-point guarantee that req.context is well-formed.
 *
 * Authentication is layered (authMiddleware → orgProtect/platformProtect →
 * requireEntitlement → requireOrgPermission → policyMiddleware). Each layer
 * reads `req.context`. A single missing field anywhere in the chain silently
 * degrades security — e.g., a handler that reads `req.context.permissions`
 * against an unset Set would throw at runtime, or worse, return default `false`
 * and silently allow nothing (or silently allow everything depending on the
 * caller's semantics).
 *
 * This module gives every plane-protect middleware a one-line guarantee that
 * the fields it depends on actually exist, in the correct shape, before the
 * handler runs.
 *
 * PLANE: Shared.
 */

"use strict";

/**
 * Assert the authenticated-request invariant for the **organization plane**.
 *
 * Throws a tagged error which the global error handler maps to 500 with
 * `INTERNAL_ERROR`. This intentionally does not map to 401 — a missing
 * invariant means a middleware bug, not an unauthenticated caller. A 401
 * would mask the bug; a 500 surfaces it in logs/alerts.
 *
 * @param {import("express").Request} req
 * @throws {Error} tagged with code === "AUTH_INVARIANT_FAILED"
 */
function assertAuthInvariant(req) {
    const ctx = req && req.context;

    if (!ctx) {
        throw _invariantError("missing req.context");
    }
    if (!ctx.userId) {
        throw _invariantError("missing userId");
    }
    if (!ctx.organizationId) {
        throw _invariantError("missing organizationId");
    }
    // tokenVersion can legitimately be 0 on a freshly-minted user — check
    // for explicit undefined/null, not falsiness.
    if (ctx.tokenVersion === undefined || ctx.tokenVersion === null) {
        throw _invariantError("missing tokenVersion");
    }
    if (!(ctx.permissions instanceof Set)) {
        throw _invariantError("permissions is not a Set");
    }
}

/**
 * Platform-plane variant. Platform tokens don't carry an organizationId and
 * permissions live on the PlatformUser document rather than in a Set on
 * req.context. Required fields:
 *   - req.user with type === "platform"
 *   - req.user._id + req.user.role
 *   - req.jwtClaims present (frozen copy of decoded token)
 *
 * @param {import("express").Request} req
 */
function assertPlatformAuthInvariant(req) {
    const user = req && req.user;
    if (!user) {
        throw _invariantError("missing req.user (platform)");
    }
    if (user.type !== "platform") {
        throw _invariantError(`unexpected req.user.type: ${user.type}`);
    }
    if (!user._id) {
        throw _invariantError("missing platform user _id");
    }
    // Platform uses the raw `role` field on the mongoose doc, which is
    // intentional (banned only on the org plane).
    if (!user.role) {
        throw _invariantError("missing platform role");
    }
    if (!req.jwtClaims) {
        throw _invariantError("missing req.jwtClaims (platform)");
    }
}

function _invariantError(reason) {
    const err = new Error(`AUTH_INVARIANT_FAILED: ${reason}`);
    err.code = "AUTH_INVARIANT_FAILED";
    err.statusCode = 500;
    // Do NOT set isPublic — message stays internal-only (see errorHandler D2).
    return err;
}

module.exports = {
    assertAuthInvariant,
    assertPlatformAuthInvariant,
};
