/**
 * Platform Auth Routes
 * Auto-split from platformRoutes.js
 */
const express = require("express");
const router = express.Router();
const platformProtect = require("../../middleware/platformProtect");
const superAdminOnly = require("../../middleware/superAdminOnly");
const authorizePlatformPermission = require("../../middleware/authorizePlatformPermission");
const { PLATFORM_CAPABILITIES } = require('@contracts/platformContract.cjs.js');
const CAP = PLATFORM_CAPABILITIES;

const {
    platformLogin,
    verify2FA,
    setup2FA,
    complete2FASetup,
    disable2FA,
    platformProfile,
    platformRefresh,
    platformLogout
} = require("../../platform/controllers/platformAuthController");

const platformUserController = require("../../platform/controllers/platformUserController");
const platformMetadataController = require("../../controllers/platformMetadataController");

// ─── Platform Auth Lifecycle ──────────────────────────────────────────────
/**
 * @swagger
 * /api/platform/auth/login:
 *   post:
 *     summary: Platform login
 *     description: Authenticates a platform user. Returns tokens or 2FA challenge.
 *     tags: [Platform Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login result
 */
router.post("/auth/login", platformLogin);

/**
 * @swagger
 * /api/platform/auth/verify-2fa:
 *   post:
 *     summary: Verify 2FA
 *     tags: [Platform Auth]
 *     responses:
 *       200:
 *         description: OK
 */
router.post("/auth/verify-2fa", verify2FA);

/**
 * @swagger
 * /api/platform/auth/refresh:
 *   post:
 *     summary: Refresh tokens
 *     tags: [Platform Auth]
 *     responses:
 *       200:
 *         description: OK
 */
router.post("/auth/refresh", platformRefresh);

/**
 * @swagger
 * /api/platform/auth/logout:
 *   post:
 *     summary: Logout
 *     tags: [Platform Auth]
 *     responses:
 *       200:
 *         description: OK
 */
router.post("/auth/logout", platformProtect, platformLogout);

/**
 * @swagger
 * /api/platform/auth/profile:
 *   get:
 *     summary: Get profile
 *     tags: [Platform Auth]
 *     responses:
 *       200:
 *         description: OK
 */
router.get("/auth/profile", platformProtect, platformProfile);


// ─── Platform User Profile (Me) ───────────────────────────────────────────
/**
 * @swagger
 * /api/platform/me:
 *   get:
 *     summary: Get current user profile
 *     description: Returns the authenticated platform user's profile. AUTH_ONLY.
 *     tags: [Platform Profile]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get("/me", platformProtect, platformUserController.getMe);


/**
 * @swagger
 * /api/platform/me:
 *   put:
 *     summary: Update current user profile
 *     description: Updates the authenticated platform user's profile. AUTH_ONLY.
 *     tags: [Platform Profile]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Updated profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 role:
 *                   type: string
 *                 isActive:
 *                   type: boolean
 */
router.put("/me", platformProtect, platformUserController.updateMe);


/**
 * @swagger
 * /api/platform/change-password:
 *   put:
 *     summary: Change password
 *     description: Changes the authenticated user's password. AUTH_ONLY.
 *     tags: [Platform Profile]
 *     security:
 *       - platformToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.put("/change-password", platformProtect, platformUserController.changePassword);


/**
 * @swagger
 * /api/platform/users/{userId}/manage-credentials:
 *   patch:
 *     summary: Manage user credentials
 *     description: Manage credentials for a platform user (reset password, force logout). AUTH_ONLY.
 *     tags: [Platform Profile]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Credentials updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.patch("/users/:userId/manage-credentials", platformProtect, platformUserController.manageCredentials);

/**
 * @swagger
 * /api/platform/capabilities:
 *   get:
 *     summary: Get platform capabilities
 *     description: Returns the capability mask for the authenticated platform user. AUTH_ONLY.
 *     tags: [Platform Metadata]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Capability list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 role:
 *                   type: string
 *                 capabilities:
 *                   type: array
 *                   items:
 *                     type: string
 *                 capabilityHash:
 *                   type: string
 */
router.get("/capabilities", platformProtect, platformMetadataController.getCapabilities);


/**
 * @swagger
 * /api/platform/feature-flags:
 *   get:
 *     summary: Get feature flags
 *     description: Returns all feature flags with their current state. AUTH_ONLY.
 *     tags: [Platform Metadata]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Feature flags object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get("/feature-flags", platformProtect, platformMetadataController.getFeatureFlags);


/**
 * @swagger
 * /api/platform/audit/frontend-event:
 *   post:
 *     summary: Log frontend audit event
 *     description: Records a frontend audit event. AUTH_ONLY.
 *     tags: [Platform Metadata]
 *     security:
 *       - platformToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: Event logged
 */
router.post("/audit/frontend-event", platformProtect, platformMetadataController.logAudit);


/**
 * @swagger
 * /api/platform/performance-metric:
 *   post:
 *     summary: Log performance metric
 *     description: Records a frontend performance metric. AUTH_ONLY.
 *     tags: [Platform Metadata]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Metric logged
 */
router.post("/performance-metric", platformProtect, platformMetadataController.logPerformance);


// Legacy/Alias for compatibility
/**
 * @swagger
 * /api/platform/me/capabilities:
 *   get:
 *     summary: Get current user capabilities (alias)
 *     description: Alias for /capabilities. Returns capability mask. AUTH_ONLY.
 *     tags: [Platform Metadata]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Capability list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get("/me/capabilities", platformProtect, platformMetadataController.getCapabilities);


// 🔒 v1.3.5 - 2FA Management
/**
 * @swagger
 * /api/platform/2fa/setup:
 *   post:
 *     summary: Setup 2FA
 *     description: Initiates 2FA setup, returns QR code URL and secret. AUTH_ONLY.
 *     tags: [Platform 2FA]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: 2FA setup data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 qrCodeUrl:
 *                   type: string
 *                 secret:
 *                   type: string
 *                 message:
 *                   type: string
 */
router.post("/2fa/setup", platformProtect, setup2FA);


/**
 * @swagger
 * /api/platform/2fa/complete-setup:
 *   post:
 *     summary: Complete 2FA setup
 *     description: Verifies TOTP code and activates 2FA. Returns recovery codes. AUTH_ONLY.
 *     tags: [Platform 2FA]
 *     security:
 *       - platformToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: 2FA activated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 recoveryCodes:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.post("/2fa/complete-setup", platformProtect, complete2FASetup);


/**
 * @swagger
 * /api/platform/2fa/disable:
 *   post:
 *     summary: Disable 2FA
 *     description: Disables 2FA for the authenticated user. AUTH_ONLY.
 *     tags: [Platform 2FA]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: 2FA disabled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
router.post("/2fa/disable", platformProtect, disable2FA);

module.exports = router;
