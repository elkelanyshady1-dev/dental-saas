/**
 * branchContext.middleware.js
 * Unified branch context resolution (Phase X — merged with branchScopeMiddleware)
 *
 * Sets: req.activeBranchId, req.branchId, req.branch, req.allowedBranches
 */

const mongoose = require("mongoose");

module.exports = async (req, res, next) => {
    // 1. Skip for login and other non-org routes
    const bypassPaths = [
        "/api/auth",
        "/api/public",
        "/api/platform",
        "/api/v1/auth",
        "/api/v1/public",
        "/api/v1/platform",
        "/webhooks",
        "/health"
    ];

    if (bypassPaths.some(path => req.path.startsWith(path)) || req.path.includes("/login")) {
        return next();
    }

    // ── Phase X: Merged from branchScopeMiddleware ──
    // Populate req.allowedBranches (used by buildScopedQuery, appointment.controller)
    if (req.platformUser) {
        req.allowedBranches = null; // Platform users: unrestricted
    } else if (req.user?.hasFullBranchAccess) {
        req.allowedBranches = null; // Org admin: unrestricted
    } else if (req.user?.branchAccess?.length > 0) {
        req.allowedBranches = req.user.branchAccess; // Restricted user
    } else {
        // No branches assigned — block
        return res.status(403).json({
            success: false,
            message: "No branch access assigned",
        });
    }

    // 2. Resolve branch context from header or fallback sources
    const branchId = req.headers["x-branch-id"]
        || req.query?.branchId
        || req.user?.primaryBranchId?.toString?.()  // fallback: user's primary branch
        || null;

    // 3. Enforce branchId for mutations
    // EXCEPTION: Users with hasFullBranchAccess (org admins) can mutate branches
    // without providing a specific branch context, since they are not restricted to
    // a single branch and may be creating/managing branches themselves.
    const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
    const isFullAccessUser = req.user?.hasFullBranchAccess === true || req.platformUser;
    if (isMutation && !branchId && !isFullAccessUser) {
        return res.status(400).json({
            success: false,
            message: "Branch context required for mutation operations. Please provide X-Branch-Id header."
        });
    }

    // 4. Validation
    if (branchId) {
        if (!mongoose.isValidObjectId(branchId)) {
            return res.status(400).json({ success: false, message: "Invalid Branch ID format." });
        }

        if (!req.user) {
            return res.status(401).json({ success: false, message: "Authentication required for branch context validation." });
        }

        // Check branch access (merged from branchScopeMiddleware)
        const hasAccess = req.user.branchAccess?.some(id => id.toString() === branchId.toString()) ||
            req.user.hasFullBranchAccess === true;

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Branch access denied for current user context."
            });
        }

        // Cross-tenant branch ownership validation — use per-org DB
        if (req.organizationId && req.dbConnection) {
            const getModel = require("@core/db/getModel");
            const BranchDef = require("../shared/models/Branch");
            const Branch = getModel(req.dbConnection, BranchDef);
            const branch = await Branch.findOne({
                _id: branchId,
                organizationId: req.organizationId,
            }).lean();

            if (!branch) {
                return res.status(403).json({
                    success: false,
                    message: "Invalid branch access — branch not found in this organization."
                });
            }
            req.branch = branch;
        }

        // 5. Attach context
        req.activeBranchId = branchId;
        req.branchId = branchId;
        if (req.context) req.context.branchId = branchId; // Phase 7: sync unified context
    } else {
        // BUG-6 FIX: Validate primaryBranchId before using as fallback.
        // Previously, undefined primaryBranchId silently set req.activeBranchId
        // to undefined, potentially bypassing branch-scoped RLS queries.
        if (!req.user?.primaryBranchId) {
            // Platform users and full-access admins don't need branch context
            if (req.platformUser || req.user?.hasFullBranchAccess) {
                req.activeBranchId = null;
                req.branchId = null;
                if (req.context) req.context.branchId = null; // Phase 7: sync unified context
            } else {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: "BRANCH_CONTEXT_MISSING",
                        message: "No branch context available. Please select a branch or contact your administrator.",
                    },
                });
            }
        } else {
            req.activeBranchId = req.user.primaryBranchId;
            req.branchId = req.activeBranchId;
            if (req.context) req.context.branchId = req.activeBranchId; // Phase 7: sync unified context
        }
    }

    next();
};
