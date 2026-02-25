const express = require("express");
const router = express.Router();

const orgProtect = require("../middleware/orgProtect");
const organizationContext = require("../middleware/organizationMiddleware");
const requireFeature = require("../middleware/requireFeature");
const branchScope = require("../middleware/branchScopeMiddleware");
const authorizePermission = require("../middleware/permissionMiddleware");

const {
    createRecall,
    getRecalls,
    getRecall,
    updateRecallStatus,
} = require("../controllers/recallController");

// All routes: protect → organizationContext → requireFeature → branchScope → permission → controller
router.get(
    "/",
    orgProtect,
    organizationContext,
    requireFeature("recalls"),
    branchScope,
    authorizePermission("recalls.read"),
    getRecalls
);

router.get(
    "/:id",
    orgProtect,
    organizationContext,
    requireFeature("recalls"),
    branchScope,
    authorizePermission("recalls.read"),
    getRecall
);

router.post(
    "/",
    orgProtect,
    organizationContext,
    requireFeature("recalls"),
    branchScope,
    authorizePermission("recalls.create"),
    createRecall
);

router.patch(
    "/:id/status",
    orgProtect,
    organizationContext,
    requireFeature("recalls"),
    branchScope,
    authorizePermission("recalls.update"),
    updateRecallStatus
);

module.exports = router;
