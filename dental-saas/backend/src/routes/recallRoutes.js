const express = require("express");
const router = express.Router();

const orgProtect = require("../middleware/orgProtect");
const organizationContext = require("../middleware/organizationMiddleware");
const requireEntitlement = require("../middleware/requireEntitlement");

const authorizePermission = require("../middleware/requireOrgPermission");

const {
    createRecall,
    getRecalls,
    getRecall,
    updateRecallStatus,
} = require("../organization/controllers/recallController");

// All routes: protect → organizationContext → requireFeature → branchScope → permission → controller
router.get(
    "/",
    orgProtect,
    organizationContext,
    requireEntitlement("patients"),

    authorizePermission("recalls.read"),
    getRecalls
);

router.get(
    "/:id",
    orgProtect,
    organizationContext,
    requireEntitlement("patients"),

    authorizePermission("recalls.read"),
    getRecall
);

router.post(
    "/",
    orgProtect,
    organizationContext,
    requireEntitlement("patients"),

    authorizePermission("recalls.create"),
    createRecall
);

router.patch(
    "/:id/status",
    orgProtect,
    organizationContext,
    requireEntitlement("patients"),

    authorizePermission("recalls.update"),
    updateRecallStatus
);

module.exports = router;
