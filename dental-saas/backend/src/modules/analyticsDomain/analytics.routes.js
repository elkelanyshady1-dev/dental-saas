/**
 * analytics.routes.js — Analytics Domain Routes (REFACTORED)
 *
 * AUDIT-005 Remediation: Routes now thin — delegates to analytics.controller.js.
 * Guard chain: orgProtect → requireEntitlement("analytics") → requireOrgPermission → policyMiddleware
 *
 * Original inline handler moved to controllers/analytics.controller.js.
 */

"use strict";

const express              = require("express");
const controller           = require("./controllers/analytics.controller");
const orgProtect           = require("@middleware/orgProtect");
const requireEntitlement   = require("@middleware/requireEntitlement");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const policyMiddleware     = require("@rbac/policyMiddleware");
const { P }                = require("@rbac/orgPermissions");

const router = express.Router();

/**
 * GET /api/v1/org/analytics
 *
 * Returns structured, role-aware analytics data for the authenticated organization.
 * Guards: orgProtect → requireEntitlement → requireOrgPermission → policyMiddleware
 */
router.get(
    "/",
    orgProtect,
    requireEntitlement("analytics"),
    requireOrgPermission(P.ANALYTICS_READ),
    policyMiddleware(P.ANALYTICS_READ),
    controller.getAnalytics
);

module.exports = router;
