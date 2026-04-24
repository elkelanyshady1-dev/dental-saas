/**
 * maintenance.middleware.js — Org-plane maintenance guard
 *
 * Returns 503 MAINTENANCE_MODE for every request to an org that has
 * `maintenanceMode === true`. Platform admins bypass (they need to inspect
 * the org during a downtime migration).
 *
 * MOUNT ORDER (critical):
 *   orgProtect
 *   organizationContext                  ← loads req.context.organization
 *   orgSubscriptionGuard
 *   maintenance    ←  ← ←                  THIS one
 *   orgWriteLock
 *   (route handlers)
 *
 * Placed AFTER organizationContext so `req.context.organization` is
 * hydrated, and BEFORE any write-path middleware so we short-circuit
 * before any tenant DB work runs.
 *
 * PLANE: Org middleware chain.
 */

"use strict";

const PLATFORM_ADMIN_ROLES = new Set([
    "platform_admin",
    "superadmin",
    "platform_user",   // catch-all for platform-plane callers
]);

function _isPlatformAdmin(req) {
    // JWT context: platform users have req.user.type === "platform" AND/OR
    // a platform role on req.user.role / req.user.roleName.
    const user = req?.user;
    if (!user) return false;
    if (user.type === "platform") return true;
    const role = user.role || user.roleName;
    return typeof role === "string" && PLATFORM_ADMIN_ROLES.has(role);
}

function maintenanceGuard(req, res, next) {
    const org = req?.context?.organization;
    if (!org || !org.maintenanceMode) {
        return next();
    }

    // Always allow GETs from a platform admin. Mutating requests too — the
    // admin may need to inspect / fix / resume the migration.
    if (_isPlatformAdmin(req)) {
        return next();
    }

    const retryAfterSec = 30;
    res.set("Retry-After", String(retryAfterSec));
    return res.status(503).json({
        success: false,
        error: {
            code: "MAINTENANCE_MODE",
            message: "This organization is temporarily unavailable for a scheduled migration.",
            orgId: String(org._id),
            retryAfterSec,
            startedAt: org.maintenanceStartedAt || null,
        },
    });
}

module.exports = maintenanceGuard;
