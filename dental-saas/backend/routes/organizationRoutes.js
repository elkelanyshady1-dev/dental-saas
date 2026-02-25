const express = require("express");
const router = express.Router();

const orgProtect = require("../middleware/orgProtect");
const authorize = require("../middleware/roleMiddleware");

const {
    createOrganization,
    updateAppointmentSettings,
    getOrganizationSettings,
    updateOrganizationSettings
} = require("../controllers/organizationController");

router.post(
    "/",
    orgProtect,
    authorize("superadmin"),
    createOrganization
);

// Appointment settings — org admin only
router.put(
    "/appointment-settings",
    orgProtect,
    authorize("org_admin"),
    updateAppointmentSettings
);

// Organization CMS Settings -- org admin only
router.get(
    "/settings",
    orgProtect,
    getOrganizationSettings
);

router.put(
    "/settings",
    orgProtect,
    authorize("org_admin"),
    updateOrganizationSettings
);

module.exports = router;