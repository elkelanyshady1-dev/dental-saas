/**
 * analyticsScope.js
 * Analytics Domain — Branch scope enforcement for aggregation pipelines
 *
 * HR-2 hardening: never trust req.query.branchId. Intersect with the user's
 * allowed branch set. Unauthorised hints collapse to the allowed set — never
 * fail-open.
 *
 * PLANE: Org only.
 */

"use strict";

/**
 * resolveBranchFilter
 *
 * @param {object} req — Express request (authenticated, per-org).
 * @param {string|undefined} branchIdHint — client-provided branch filter.
 * @returns {{ filter: object, effectiveBranchId: string|null, scope: "ALL"|"BRANCH"|"NONE" }}
 *   filter           — MongoDB fragment to spread into the initial $match.
 *                       {} for ALL, { branchId: x } for single branch,
 *                       { branchId: { $in: [...] } } for restricted set.
 *   effectiveBranchId — the final branch id returned to the client in meta.
 *                       null if ALL branches.
 *   scope            — "ALL" / "BRANCH" / "NONE". NONE means the user has no
 *                       branch access (empty result expected).
 */
function resolveBranchFilter(req, branchIdHint) {
    const allowed = collectAllowedBranches(req);

    // Full-scope (org-level) user → honours hint verbatim.
    if (allowed === "ALL") {
        if (branchIdHint) {
            return {
                filter: { branchId: toId(branchIdHint) },
                effectiveBranchId: String(branchIdHint),
                scope: "BRANCH",
            };
        }
        return { filter: {}, effectiveBranchId: null, scope: "ALL" };
    }

    // No branches at all → return a filter that matches nothing.
    if (!allowed || allowed.length === 0) {
        return {
            filter: { branchId: { $in: [] } },
            effectiveBranchId: null,
            scope: "NONE",
        };
    }

    // Branch-scoped user → intersect hint with allowed set.
    if (branchIdHint) {
        const hint = String(branchIdHint);
        if (allowed.some((b) => String(b) === hint)) {
            return {
                filter: { branchId: toId(hint) },
                effectiveBranchId: hint,
                scope: "BRANCH",
            };
        }
        // Hint was unauthorised — fall back to the full allowed set (not fail-open,
        // not fail-closed; mirror the user's real scope).
    }

    if (allowed.length === 1) {
        return {
            filter: { branchId: toId(allowed[0]) },
            effectiveBranchId: String(allowed[0]),
            scope: "BRANCH",
        };
    }

    return {
        filter: { branchId: { $in: allowed.map(toId) } },
        effectiveBranchId: null,
        scope: "BRANCH",
    };
}

/**
 * collectAllowedBranches — returns "ALL" or an array of ObjectId-ish strings.
 */
function collectAllowedBranches(req) {
    const user = req.user || {};
    if (user.hasFullBranchAccess) return "ALL";
    if (user.dataScope?.level === "organization") return "ALL";

    // Pre-computed by branchContext.middleware.js when present.
    if (Array.isArray(req.allowedBranches) && req.allowedBranches.length > 0) {
        return req.allowedBranches.map(String);
    }

    const fromScope = Array.isArray(user.dataScope?.branches) ? user.dataScope.branches : [];
    const fromAccess = Array.isArray(user.branchAccess) ? user.branchAccess : [];
    const merged = [...fromScope, ...fromAccess].map(String);
    return [...new Set(merged)];
}

function toId(v) {
    if (!v) return v;
    // Controllers receive strings — keep them as strings so Mongoose coerces.
    return typeof v === "object" && v.toString ? v.toString() : v;
}

module.exports = {
    resolveBranchFilter,
    collectAllowedBranches,
};
