/**
 * organizationRoutes.js
 * Org-plane organization settings routes.
 *
 * Phase B cleanup: createOrganization REMOVED (plane violation).
 * Canonical endpoint: POST /api/platform/organizations
 *   (platformProtect + superAdminOnly + MANAGE_ORGANIZATIONS)
 */
const express = require("express");
const router = express.Router();

const orgProtect = require("../middleware/orgProtect");
const organizationContext = require("../middleware/organizationMiddleware");
const requireOrgPermission = require("../middleware/requireOrgPermission");
const { P } = require("../rbac/orgPermissions");

const {
    updateAppointmentSettings,
    getOrganizationSettings,
    updateOrganizationSettings
} = require("../organization/controllers/OrganizationController");

// Appointment settings — org admin only
router.put(
    "/appointment-settings",
    orgProtect,
    organizationContext,
    requireOrgPermission(P.STAFF_MANAGE),
    updateAppointmentSettings
);

// Organization CMS Settings -- read is open to any authenticated org user
router.get(
    "/settings",
    orgProtect,
    organizationContext,
    getOrganizationSettings
);

router.put(
    "/settings",
    orgProtect,
    organizationContext,
    requireOrgPermission(P.STAFF_MANAGE),
    updateOrganizationSettings
);

// v9 Revenue Layer — Billing Portal
const billingController = require("../shared/controllers/billing.controller");
router.post(
    "/billing/portal",
    orgProtect,
    organizationContext,
    requireOrgPermission(P.ACCOUNTING_READ),
    billingController.getPortalUrl
);

module.exports = router;