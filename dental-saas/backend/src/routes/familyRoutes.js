const express = require("express");
const router = express.Router();

const orgProtect = require("../middleware/orgProtect");
const organizationContext = require("../middleware/organizationMiddleware");
const requireEntitlement = require("../middleware/requireEntitlement");
const authorizePermission = require("../middleware/requireOrgPermission");

const {
    getFamilyMembers,
    removeFamilyMember,
} = require("../organization/controllers/familyController");

// ─── Family routes (org-level, no branchScope) ───────────

router.get(
    "/:id/members",
    orgProtect,
    organizationContext,
    requireEntitlement("patients"),
    authorizePermission("families.read"),
    getFamilyMembers
);

router.delete(
    "/members/:memberId",
    orgProtect,
    organizationContext,
    requireEntitlement("patients"),
    authorizePermission("families.update"),
    removeFamilyMember
);

module.exports = router;
