/**
 * routeGuard.wrapper.js — Route-Level Guard Enforcement (V2.1)
 *
 * 🚨 CRITICAL: Prevents human error via mandatory wrapping.
 * ALL guarded routes MUST use guardedRoute().
 * The __isGuardedRoute flag enables router-level enforcement.
 *
 * Guard types:
 *   access  → RBAC permission check (runs FIRST, before handler)
 *   pre     → Modify query filter (injected via req.applyPreGuards)
 *   post    → Validate result (injected via req.runPostGuards)
 *   field   → Modify projection (injected via req.applyFieldGuards)
 */

"use strict";

const { runPostGuards, applyPreGuards, applyFieldGuards } = require("./guardRunner");
const logger = require("@utils/logger");

/**
 * Wraps an Express route handler with pre/post/field/access guards.
 *
 * @param {Object} guards
 * @param {string[]} [guards.access=[]]  - Required permissions (RBAC check before handler)
 * @param {Function[]} [guards.pre=[]]   - Pre-query guards (modify query)
 * @param {Function[]} [guards.post=[]]  - Post-query guards (validate result)
 * @param {Function[]} [guards.field=[]] - Field guards (modify projection)
 * @param {Function} handler - Route handler (req, res) => void
 * @returns {Function} Express middleware with __isGuardedRoute flag
 */
function guardedRoute({ access = [], pre = [], post = [], field = [] }, handler) {
    const fn = async (req, res, next) => {
        try {
            // ── STEP 1: RBAC permission check (fail-fast) ────────────────
            if (access.length > 0) {
                const userPerms = req.user?.permissions || [];
                const missing = access.filter(p => !userPerms.includes(p));
                if (missing.length > 0) {
                    logger.warn({
                        event: "GUARD_ACCESS_DENIED",
                        userId: req.user?._id,
                        missing,
                        route: req.originalUrl,
                    }, `[Guard] Access denied: missing [${missing.join(", ")}]`);

                    const err = new Error(`Forbidden: Missing permissions [${missing.join(", ")}]`);
                    err.statusCode = 403;
                    throw err;
                }
            }

            // ── STEP 2: Build guard context ──────────────────────────────
            const guardContext = { user: req.user, req };

            // ── STEP 3: Inject guard helpers into request ────────────────
            req.applyPreGuards = (query) =>
                applyPreGuards(pre, query, guardContext);

            req.applyFieldGuards = (projection) =>
                applyFieldGuards(field, projection, guardContext);

            req.runPostGuards = (resource) =>
                runPostGuards(post, { ...guardContext, resource });

            // ── STEP 4: Execute handler ──────────────────────────────────
            await handler(req, res);

        } catch (err) {
            next(err);
        }
    };

    // Flag for router-level enforcement
    fn.__isGuardedRoute = true;

    return fn;
}

module.exports = { guardedRoute };
