const express = require("express");
const router = express.Router();

const {
    register,
    loginUser,
    changePassword,
    forgotPassword,
    resetPassword,
    refresh,
    logout,
    getSessions,
    revokeSession,
    revokeAllSessions
} = require("../controllers/authController");

const orgProtect = require("../middleware/orgProtect");
const Organization = require("../models/Organization");

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: Organization authentication & session management
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register new organization user
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: User registered successfully
 */
router.post("/register", register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login organization user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - clinicCode
 *               - email
 *               - password
 *             properties:
 *               clinicCode:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successful login (returns access token + refresh cookie)
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", loginUser);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token using HTTP-only refresh cookie
 *     tags: [Authentication]
 *     parameters:
 *       - in: header
 *         name: x-csrf-token
 *         required: true
 *         schema:
 *           type: string
 *         description: CSRF token header (must match csrf_token cookie)
 *     responses:
 *       200:
 *         description: Access token refreshed successfully
 *       403:
 *         description: CSRF validation failed
 */
router.post("/refresh", refresh);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout current session
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session revoked successfully
 */
router.post("/logout", orgProtect, logout);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset email
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Reset email sent if account exists
 */
router.post("/forgot-password", forgotPassword);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password using reset token
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Password reset successful
 */
router.post("/reset-password", resetPassword);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change password for authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Password changed successfully (tokenVersion incremented)
 */
router.post("/change-password", orgProtect, changePassword);

/**
 * @swagger
 * /api/auth/sessions:
 *   get:
 *     summary: Get active sessions for authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns list of active sessions
 */
router.get("/sessions", orgProtect, getSessions);

/**
 * @swagger
 * /api/auth/sessions/revoke-all:
 *   post:
 *     summary: Revoke all active sessions (global logout)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All sessions revoked
 */
router.post("/sessions/revoke-all", orgProtect, revokeAllSessions);

/**
 * @swagger
 * /api/auth/sessions/{id}/revoke:
 *   post:
 *     summary: Revoke a specific session
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session revoked
 */
router.post("/sessions/:id/revoke", orgProtect, revokeSession);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     summary: Get authenticated user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile returned
 */
router.get("/profile", orgProtect, async (req, res) => {
    try {
        const org = await Organization.findById(req.user.organizationId)
            .select("features slug");

        res.json({
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            roleId: req.user.roleId,
            platformRole: req.user.platformRole,
            organizationId: req.user.organizationId,
            organization: org
                ? { features: org.features, slug: org.slug }
                : null
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;