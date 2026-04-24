/**
 * validateCapabilityHash.js — Capability Snapshot Integrity Guard (H1)
 *
 * PURPOSE:
 *   When a user's plan or feature flags change server-side, their existing
 *   JWT continues to work until expiry. permissionVersion (Phase 31) closes
 *   that window for RBAC permission changes, but NOT for plan/flag changes.
 *
 *   This middleware compares the capabilityHash claim in the JWT against
 *   the hash computed from req.capabilities on the current request. If
 *   they differ, the user's capabilities have changed and the token is
 *   forcibly invalidated via 401 → client re-auth.
 *
 * MOUNT ORDER:
 *   unifiedCapabilityMiddleware → assertCapabilities → validateCapabilityHash → requireEntitlement
 *
 * BACKWARD COMPAT:
 *   Tokens issued BEFORE capabilityHash embedding was deployed do not carry
 *   the claim. For those, the middleware calls next() without validating —
 *   permissionVersion still enforces RBAC staleness. Once all signing paths
 *   embed the hash, this fallback can be flipped to REJECT.
 *
 * FAIL-CLOSED:
 *   If req.capabilityHash is missing (capability pipeline failed to run),
 *   reject with 500. assertCapabilities runs before this middleware and
 *   should have caught that, but we double-check to match the fail-closed
 *   doctrine.
 *
 * PLANE: Org only.
 */

"use strict";

const logger = require("@utils/logger");

function validateCapabilityHash(req, res, next) {
    const tokenHash = req.jwtClaims?.capabilityHash;
    const liveHash = req.capabilityHash;

    // assertCapabilities runs before this — if capabilities resolved, liveHash is set.
    // Defense in depth: refuse to validate against nothing.
    if (!liveHash) {
        logger.error({
            event: "CAPABILITY_HASH_MISSING",
            path: req.originalUrl,
            method: req.method,
            userId: req.context?.userId?.toString(),
            organizationId: req.context?.organizationId?.toString(),
        }, "[ValidateCapabilityHash] req.capabilityHash missing — capability pipeline broken");

        return res.status(500).json({
            success: false,
            error: {
                code: "CAPABILITIES_NOT_RESOLVED",
                message: "Authorization system misconfigured. Contact support.",
            },
        });
    }

    // Legacy path: token predates hash embedding.
    // permissionVersion (checked in authMiddleware) still enforces RBAC staleness.
    if (!tokenHash) {
        return next();
    }

    if (tokenHash !== liveHash) {
        logger.warn({
            event: "CAPABILITY_HASH_MISMATCH",
            userId: req.context?.userId?.toString(),
            organizationId: req.context?.organizationId?.toString(),
            tokenHash,
            liveHash,
            path: req.originalUrl,
        }, "[ValidateCapabilityHash] Capability snapshot stale — forcing re-auth");

        return res.status(401).json({
            success: false,
            error: {
                code: "CAPABILITY_SNAPSHOT_STALE",
                message: "Your session's capabilities are out of date. Please re-authenticate.",
            },
        });
    }

    next();
}

module.exports = validateCapabilityHash;
