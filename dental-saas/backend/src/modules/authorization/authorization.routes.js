/**
 * authorization.routes.js
 * v4.7 — Permission Introspection Routes
 * v4.9 — Sentinel §2 compliance: replaced inline managementGuard
 *         with requireOrgPermission(P.STAFF_MANAGE)
 * v4.10 — Phase D PBAC: policyMiddleware wired for staff.manage routes
 */

"use strict";

const express = require("express");
const router = express.Router();
const authorizationController = require("./authorization.controller");
const overrideController = require("./override.controller");

const requireOrgPermission = require("@middleware/requireOrgPermission");
const policyMiddleware = require("@rbac/policyMiddleware");
const { P } = require("@rbac/orgPermissions");

// 🟢 GET /org/me/permissions
// Returns resolved visibility scopes and capability flags for the caller.
// Available to all authenticated org users — no additional RBAC gate needed.
router.get("/permissions",
    authorizationController.getMyPermissions
);

// 🟢 GET /org/me/permission-keys
// Returns the full list of valid SSOT permission keys for frontend dev validation.
// Derived from orgPermissions.js → permissionRegistry.js → permissionValidator.js.
// No RBAC gate — the list itself contains no sensitive data (just key strings).
router.get("/permission-keys",
    authorizationController.getPermissionKeys
);

// 🟢 GET /org/me/drift-report
// Cross-checks featureRegistry.features permission strings against the P enum SSOT.
// Restricted to users with staff.manage permission.
router.get("/drift-report",
    requireOrgPermission(P.STAFF_MANAGE),
    policyMiddleware(P.STAFF_MANAGE),
    authorizationController.getDriftReport
);

// 🟢 GET /org/me/visibility-debug
// Detailed resolution trace — restricted to staff.manage permission
router.get("/visibility-debug",
    requireOrgPermission(P.STAFF_MANAGE),
    policyMiddleware(P.STAFF_MANAGE),
    authorizationController.getVisibilityDebug
);

// ═══════════════════════════════════════════════════════════════════════════════
// Override Management (v4.8)
// Restricted to users with staff.manage permission (org_admin role).
// ═══════════════════════════════════════════════════════════════════════════════

// GET /users/:userId/visibility
router.get("/users/:userId/visibility",
    requireOrgPermission(P.STAFF_MANAGE),
    policyMiddleware(P.STAFF_MANAGE),
    overrideController.getVisibility
);

// PUT /users/:userId/visibility
router.put("/users/:userId/visibility",
    requireOrgPermission(P.STAFF_MANAGE),
    policyMiddleware(P.STAFF_MANAGE),
    overrideController.updateVisibility
);

// DELETE /users/:userId/visibility
router.delete("/users/:userId/visibility",
    requireOrgPermission(P.STAFF_MANAGE),
    policyMiddleware(P.STAFF_MANAGE),
    overrideController.deleteVisibility
);

module.exports = router;

