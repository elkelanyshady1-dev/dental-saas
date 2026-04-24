const express = require("express");
const router = express.Router();
const bookingApprovalController = require("./bookingApproval.controller");
const orgProtect = require("@middleware/orgProtect");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const { P } = require("@rbac/orgPermissions");
const policyMiddleware = require("@rbac/policyMiddleware");
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");
const { fieldWriteGuardMiddleware } = require("@rbac/fieldWriteGuard");

/**
 * Staff-Side Booking Approval Routes
 * Guard: orgProtect → requireOrgPermission → policyMiddleware → FLS
 *
 * Roles with this permission: org_admin, doctor, assistant, receptionist
 */
router.use(orgProtect);

router.get("/",
    requireOrgPermission(P.APPOINTMENTS_READ),
    fieldFilterMiddleware("appointment"),
    (req, res) => bookingApprovalController.getPending(req, res)
);

router.post("/:id/approve",
    requireOrgPermission(P.APPOINTMENTS_UPDATE),
    policyMiddleware(P.APPOINTMENTS_UPDATE),
    fieldWriteGuardMiddleware("appointment"),
    (req, res) => bookingApprovalController.approve(req, res)
);

router.post("/:id/reject",
    requireOrgPermission(P.APPOINTMENTS_UPDATE),
    policyMiddleware(P.APPOINTMENTS_UPDATE),
    fieldWriteGuardMiddleware("appointment"),
    (req, res) => bookingApprovalController.reject(req, res)
);

module.exports = router;

