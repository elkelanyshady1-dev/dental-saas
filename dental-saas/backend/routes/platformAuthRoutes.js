const express = require("express");
const router = express.Router();
const { platformLogin, verify2FA } = require("../controllers/platformAuthController");

router.post("/login", platformLogin);
router.post("/verify-2fa", verify2FA);

module.exports = router;