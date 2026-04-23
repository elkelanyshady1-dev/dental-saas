/**
 * orgWriteLock.middleware.js
 * Org-Plane Middleware — HTTP-Level Write Lock (Phase 8 Seam)
 *
 * Rejects mutating HTTP requests (POST/PUT/PATCH/DELETE) when the org is
 * currently in a cutover write-lock window. Day-1 never fires — no org is
 * ever locked. The middleware exists so the Phase 8 migration flow has a
 * working enforcement point the moment it starts flipping `writeLocked`.
 *
 * STACK POSITION:
 *   Mounted between orgSubscriptionGuard and rlsContext in app.js, so it
 *   reads the org snapshot after subscription context is populated but
 *   before any model/query setup. Services also call assertWriteAllowed()
 *   at the DB boundary to catch requests already past this point.
 *
 * RETURNS:
 *   - 503 { code: "ORG_WRITE_LOCKED", retryAfterSeconds: 5 } + Retry-After: 5
 *
 * GET/HEAD/OPTIONS pass through unconditionally — reads are safe during
 * the brief cutover window (old cluster stays readable, new reads resolve
 * via the incremented routingEpoch).
 *
 * PLANE: Org
 */

"use strict";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function orgWriteLock(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    const org = (req.context && req.context.organization) || req.organization;
    if (!org) return next();              // no org context → not an org-scoped route

    if (org.writeLocked !== true) return next();

    res.setHeader("Retry-After", "5");
    return res.status(503).json({
        success: false,
        error: {
            code: "ORG_WRITE_LOCKED",
            message: "Organization is under a maintenance/migration write lock. Retry shortly.",
            retryAfterSeconds: 5,
        },
    });
}

module.exports = orgWriteLock;
