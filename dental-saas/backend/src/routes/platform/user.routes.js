/**
 * Platform User & Governance Routes
 * 
 * Unified routes for managing platform users and cross-tenant governance.
 */
const express = require("express");
const router = express.Router();
const platformProtect = require("../../middleware/platformProtect");
const superAdminOnly = require("../../middleware/superAdminOnly");
const authorizePlatformPermission = require("../../middleware/authorizePlatformPermission");
const { PLATFORM_CAPABILITIES: CAP } = require('@contracts/platformContract.cjs.js');
const { createLimiter } = require('../../middleware/rateLimiter');

// Governance mutation rate limiter — IPv6-safe via centralized factory
// Prevents abuse of user creation and status-toggle endpoints.
const governanceMutationLimiter = createLimiter({
    windowMs: 60 * 1000,
    max: 30,
    keyType: "user",
    message: "Too many requests. Please retry in a moment.",
});



const {
    createPlatformUser,
    getPlatformUsers,
    updatePlatformUser,
    deletePlatformUser,
    getPlatformUserDetails,
    getPlatformUserAuditHistory,
    getPlatformGovernanceUsers,
    getPlatformUserDetail,
    updatePlatformUserRole,
    updatePlatformUserStatus,
    forceLogoutPlatformUser,
    resetPlatformUser2FA,
    resendInvite,
    updatePlatformUserProfile,
    updateOrgUserProfile,
    getOrganizationUsersGovernance,
    getOrganizationUserDetailGovernance,
    createOrganizationUserGovernance,
    updateOrganizationUserStatusGovernance,
    updateOrganizationUserRoleGovernance,
    forceLogoutOrganizationUser,
    resetOrganizationUserPassword,
    getOrganizationRolesGovernance
} = require("../../platform/controllers/platformUserController");

// 🔒 Universal Guard — Applied on every route line for validator compliance
// router.use(platformProtect); // Validator doesn't see this


// ============================================================
// 🏛 PLATFORM USERS GOVERNANCE
// ============================================================

/**
 * @swagger
 * /api/platform/governance/platform:
 *   get:
 *     summary: List platform users for governance
 *     tags: [Platform Governance]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: List of users
 */
router.get("/governance/platform", platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), getPlatformGovernanceUsers);

/**
 * @swagger
 * /api/platform/governance/platform/{id}:
 *   get:
 *     summary: Get detailed platform user for governance
 *     tags: [Platform Governance]
 *     responses:
 *       200:
 *         description: User details
 */
router.get("/governance/platform/:id", platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), getPlatformUserDetail);

/**
 * @swagger
 * /api/platform/governance/platform/{id}/role:
 *   patch:
 *     summary: Update platform user role
 *     tags: [Platform Governance]
 *     responses:
 *       200:
 *         description: OK
 */
router.patch("/governance/platform/:id/role", platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), superAdminOnly, updatePlatformUserRole);

/**
 * @swagger
 * /api/platform/governance/platform/{id}/status:
 *   patch:
 *     summary: Update platform user status
 *     tags: [Platform Governance]
 *     responses:
 *       200:
 *         description: OK
 */
router.patch("/governance/platform/:id/status", platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), superAdminOnly, updatePlatformUserStatus);

/**
 * @swagger
 * /api/platform/governance/platform/{id}/force-logout:
 *   patch:
 *     summary: Force logout platform user
 *     tags: [Platform Governance]
 *     responses:
 *       200:
 *         description: OK
 */
router.patch("/governance/platform/:id/force-logout", platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), superAdminOnly, forceLogoutPlatformUser);

/**
 * @swagger
 * /api/platform/governance/platform/{id}/reset-2fa:
 *   patch:
 *     summary: Reset 2FA for platform user
 *     tags: [Platform Governance]
 *     responses:
 *       200:
 *         description: OK
 */
router.patch("/governance/platform/:id/reset-2fa", platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), superAdminOnly, resetPlatformUser2FA);


// ============================================================
// 📁 PLATFORM USERS (CRUD)
// ============================================================

/**
 * @swagger
 * /api/platform/users:
 *   get:
 *     summary: Get all platform users
 *     tags: [Platform Users]
 *     responses:
 *       200:
 *         description: List of users
 */
router.get("/users", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), getPlatformUsers);

/**
 * @swagger
 * /api/platform/users:
 *   post:
 *     summary: Create new platform user
 *     tags: [Platform Users]
 *     responses:
 *       200:
 *         description: Created user
 */
router.post("/users", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), createPlatformUser);

/**
 * @swagger
 * /api/platform/users/{id}:
 *   get:
 *     summary: Get platform user details
 *     tags: [Platform Users]
 *     responses:
 *       200:
 *         description: User details
 */
router.get("/users/:id", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), getPlatformUserDetails);

/**
 * @swagger
 * /api/platform/users/{id}/audit:
 *   get:
 *     summary: Get user audit history
 *     tags: [Platform Users]
 *     responses:
 *       200:
 *         description: Audit history
 */
router.get("/users/:id/audit", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), getPlatformUserAuditHistory);

/**
 * @swagger
 * /api/platform/users/{id}:
 *   patch:
 *     summary: Update platform user
 *     tags: [Platform Users]
 *     responses:
 *       200:
 *         description: OK
 */
router.patch("/users/:id", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), updatePlatformUser);

/**
 * @swagger
 * /api/platform/users/{id}:
 *   delete:
 *     summary: Delete platform user
 *     tags: [Platform Users]
 *     responses:
 *       200:
 *         description: OK
 */
router.delete("/users/:id", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), deletePlatformUser);

/**
 * @swagger
 * /api/platform/users/{id}/resend-invite:
 *   post:
 *     summary: Resend invitation email to platform user
 *     tags: [Platform Users]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invitation resent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: User not found
 */
router.post("/users/:id/resend-invite", platformProtect, superAdminOnly, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), resendInvite);

/**
 * @swagger
 * /api/platform/users/{id}/profile:
 *   patch:
 *     summary: Update platform user profile (contact & identity fields)
 *     tags: [Platform Users]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               profileImage: { type: string }
 *               phone:        { type: string }
 *               whatsapp:     { type: string }
 *               jobTitle:     { type: string }
 *               department:   { type: string }
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.patch("/users/:id/profile", platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), updatePlatformUserProfile);


// ============================================================
// 🏢 ORGANIZATION USERS GOVERNANCE
// ============================================================

/**
 * @swagger
 * /api/platform/governance/org/{organizationId}:
 *   get:
 *     summary: List organizational users for governance
 *     tags: [Platform Governance]
 *     responses:
 *       200:
 *         description: List of users
 */
router.get("/governance/org/:organizationId", platformProtect, authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS), getOrganizationUsersGovernance);

/**
 * @swagger
 * /api/platform/governance/org/{organizationId}/roles:
 *   get:
 *     summary: List roles for an organization (governance)
 *     tags: [Platform Governance]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of { _id, name, isSystemRole }
 */
router.get("/governance/org/:organizationId/roles", platformProtect, authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS), getOrganizationRolesGovernance);

/**
 * @swagger
 * /api/platform/governance/org/{organizationId}/{userId}:
 *   get:
 *     summary: Get organization user details for governance
 *     tags: [Platform Governance]
 *     responses:
 *       200:
 *         description: User details
 */
router.get("/governance/org/:organizationId/:userId", platformProtect, authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS), getOrganizationUserDetailGovernance);

/**
 * @swagger
 * /api/platform/governance/org/{organizationId}/users:
 *   post:
 *     summary: Create a new user in an organization (governance)
 *     tags: [Platform Governance]
 *     security:
 *       - platformToken: []
 *     responses:
 *       201:
 *         description: User created
 */
router.post("/governance/org/:organizationId/users", governanceMutationLimiter, platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), superAdminOnly, createOrganizationUserGovernance);


/**
 * @swagger
 * /api/platform/governance/org/{organizationId}/{userId}/status:
 *   patch:
 *     summary: Update organization user status (governance)
 *     tags: [Platform Governance]
 *     responses:
 *       200:
 *         description: OK
 */
router.patch("/governance/org/:organizationId/:userId/status", governanceMutationLimiter, platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), superAdminOnly, updateOrganizationUserStatusGovernance);


/**
 * @swagger
 * /api/platform/governance/org/{organizationId}/{userId}/role:
 *   patch:
 *     summary: Update organization user role (governance)
 *     tags: [Platform Governance]
 *     responses:
 *       200:
 *         description: OK
 */
router.patch("/governance/org/:organizationId/:userId/role", platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), superAdminOnly, updateOrganizationUserRoleGovernance);

/**
 * @swagger
 * /api/platform/governance/org/{organizationId}/{userId}/force-logout:
 *   patch:
 *     summary: Force logout organization user (governance)
 *     tags: [Platform Governance]
 *     responses:
 *       200:
 *         description: OK
 */
router.patch("/governance/org/:organizationId/:userId/force-logout", platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), superAdminOnly, forceLogoutOrganizationUser);

/**
 * @swagger
 * /api/platform/governance/org/{organizationId}/{userId}/reset-password:
 *   patch:
 *     summary: Reset organization user password (governance)
 *     tags: [Platform Governance]
 *     responses:
 *       200:
 *         description: OK
 */
router.patch("/governance/org/:organizationId/:userId/reset-password", platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), superAdminOnly, resetOrganizationUserPassword);

/**
 * @swagger
 * /api/platform/governance/org/{organizationId}/{userId}/profile:
 *   patch:
 *     summary: Update org user profile (contact & identity fields)
 *     tags: [Platform Governance]
 *     security:
 *       - platformToken: []
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.patch("/governance/org/:organizationId/:userId/profile", platformProtect, authorizePlatformPermission(CAP.MANAGE_PLATFORM_USERS), updateOrgUserProfile);

module.exports = router;
