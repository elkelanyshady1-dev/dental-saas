const express = require("express");
const router = express.Router();
const platformProtect = require("../middleware/platformProtect");
const superAdminOnly = require("../middleware/superAdminOnly");
const authorizePlatformPermission = require("../middleware/authorizePlatformPermission");

const {
    createPlatformUser,
    getPlatformUsers,
    updatePlatformUser,
    deletePlatformUser,
    getPlatformUserDetails,
    getPlatformUserAuditHistory
} = require("../controllers/platformUserController");

// Get all platform users
router.get(
    "/",
    platformProtect, superAdminOnly,
    authorizePlatformPermission("platformUsers.read"),
    getPlatformUsers
);

// Get a specific platform user
router.get(
    "/:id",
    platformProtect, superAdminOnly,
    authorizePlatformPermission("platformUsers.read"),
    getPlatformUserDetails
);

// Get platform user audit history
router.get(
    "/:id/audit",
    platformProtect, superAdminOnly,
    authorizePlatformPermission("platformUsers.read"),
    getPlatformUserAuditHistory
);

// Create new platform user
router.post(
    "/",
    platformProtect, superAdminOnly,
    authorizePlatformPermission("platformUsers.create"),
    createPlatformUser
);

// Update a platform user
router.patch(
    "/:id",
    platformProtect, superAdminOnly,
    authorizePlatformPermission("platformUsers.update"),
    updatePlatformUser
);

// Delete a platform user
router.delete(
    "/:id",
    platformProtect, superAdminOnly,
    authorizePlatformPermission("platformUsers.delete"), // using delete distinct permission
    deletePlatformUser
);

module.exports = router;
