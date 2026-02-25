const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");
const orgProtect = require("../middleware/orgProtect");
const organizationContext = require("../middleware/organizationMiddleware");

router.use(orgProtect);
router.use(organizationContext);

router.get("/organization", settingsController.getOrganizationSettings);
router.patch("/organization", settingsController.updateOrganizationSettings);

module.exports = router;
