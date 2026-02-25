const express = require("express");
const router = express.Router();

const orgProtect = require("../middleware/orgProtect");
const organizationContext = require("../middleware/organizationMiddleware");
const requireFeature = require("../middleware/requireFeature");
const authorizePermission = require("../middleware/permissionMiddleware");

const {
    getFamilyMembers,
    removeFamilyMember,
} = require("../controllers/familyController");

// ─── Family routes (org-level, no branchScope) ───────────

router.get(
    "/:id/members",
    orgProtect,
    organizationContext,
    requireFeature("families"),
    authorizePermission("families.read"),
    getFamilyMembers
);

router.delete(
    "/members/:memberId",
    orgProtect,
    organizationContext,
    requireFeature("families"),
    authorizePermission("families.update"),
    removeFamilyMember
);

module.exports = router;
