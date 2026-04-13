/**
 * rlsGateway.js — Row-Level Security Context Gateway (Phase 2)
 *
 * PURPOSE:
 * Thin wrapper over rlsContext.js — the existing hardened RLS middleware.
 *
 * COMPOSE, DO NOT REIMPLEMENT:
 * rlsContext.js creates a frozen, HMAC-signed, tamper-proof tenant context.
 * This is NOT a simple 3-field struct — it includes:
 *   - RLS_CONTEXT_VERSION ("v2-perorg")
 *   - SHA-256 hash of {organizationId, branchId, userId, version}
 *   - Cross-service X-RLS-Hash header validation
 *   - req.rlsTraceId (forensic correlation ID)
 *   - Object.freeze() on the context (immutable downstream)
 *   - X-RLS-Signature HMAC header verification
 *
 * The spec's proposed 3-line replacement:
 *   req.rls = { organizationId, branchId, userId }
 * would BREAK all of the above. Always delegate to the real implementation.
 *
 * PREREQUISITES (must run AFTER orgGateway + branchGateway):
 *   req.organizationId  — set by orgGateway
 *   req.user._id        — set by orgGateway
 *   req.branchId        — set by branchGateway (optional for reads)
 *
 * PLANE: Organization only.
 * PHASE: 2 — Safe consolidation.
 */

"use strict";

const rlsContext = require("../rlsContext");

/**
 * rlsGateway middleware
 *
 * Delegates to rlsContext.js.
 * Guarantees req.rls is frozen + HMAC-signed before controllers run.
 *
 * @type {import("express").RequestHandler}
 */
function rlsGateway(req, res, next) {
    return rlsContext(req, res, next);
}

module.exports = rlsGateway;
