const getPlatformModel = require("@core/db/getPlatformModel");
const express = require("express");
const router = express.Router();

// ─── Module auth routes (magic link, Google OAuth) ────────────────────────────
const magicRoutes = require("../modules/auth/magic.routes");
const googleRoutes = require("../modules/auth/google.routes");
const passport = require("passport");
const {
  initGoogleStrategy
} = require("../modules/auth/google.strategy");

// Initialize Google OAuth strategy (conditionally — only if env vars are set)
const googleEnabled = initGoogleStrategy();

// Mount module routes
router.use("/", magicRoutes);
if (googleEnabled) {
  router.use("/", passport.initialize(), googleRoutes);
}
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
  revokeAllSessions,
  verifyEmailOtp,
  resendEmailOtp,
  // Phase 11 — Smart Multi-Org Login
  smartLogin,
  selectOrg
} = require("../organization/controllers/authController");
const orgProtect = require("../middleware/orgProtect");
const OrganizationDef = require("../shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const {
  createLimiter
} = require("../middleware/rateLimiter");

// Phase 12 — Entitlement Engine: Resolve normalized modules for frontend
const {
  resolvePlan
} = require("../core/subscription/planResolver");
const {
  buildPlanCapabilities
} = require("../core/subscription/planCapabilityBuilder");
const logger = require("../utils/logger");
const isProd = process.env.NODE_ENV === "production";

// v30.0 — Route-level rate limiters (IPv6-safe via centralized factory)
const refreshLimiter = createLimiter({
  windowMs: 1 * 60 * 1000,
  max: isProd ? 30 : 100,
  keyType: "ip",
  message: "Too many token refresh attempts"
});
const forgotPasswordLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 3 : 10,
  keyType: "ip",
  message: "Too many password reset requests"
});
const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 5 : 50,
  keyType: "ip",
  message: "Too many registration attempts"
});

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
router.post("/register", registerLimiter, register);

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
 * /api/auth/smart-login:
 *   post:
 *     summary: Smart login — email + password only (no clinic code required)
 *     tags: [Authentication]
 *     description: |
 *       Returns SINGLE_ORG (with JWT) if user belongs to one org,
 *       or MULTI_ORG (with org list) if user belongs to multiple orgs.
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
 *         description: SINGLE_ORG (token) or MULTI_ORG (org list)
 *       401:
 *         description: Invalid credentials
 */
router.post("/smart-login", smartLogin);

/**
 * @swagger
 * /api/auth/select-org:
 *   post:
 *     summary: Select organization and receive scoped JWT (step 2 of multi-org login)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, organizationId]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               organizationId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Scoped JWT for selected organization
 *       401:
 *         description: Invalid credentials or org selection
 */
router.post("/select-org", selectOrg);

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
router.post("/refresh", refreshLimiter, refresh);

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
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);

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
 * /api/auth/verify-email-otp:
 *   post:
 *     summary: Verify email address using 6-digit OTP code
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired OTP
 */
router.post("/verify-email-otp", verifyEmailOtp);

/**
 * @swagger
 * /api/auth/resend-email-otp:
 *   post:
 *     summary: Resend email verification OTP
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verification code sent
 *       429:
 *         description: Too many requests
 */
router.post("/resend-email-otp", resendEmailOtp);

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
    const org = await Organization.findById(req.user.organizationId).select("features slug country subscription.status");

    // Phase 12 — Resolve modules from plan pipeline (NOT raw org.modules)
    // This ensures normalized keys (orthodonticsAdv → orthodontics).
    let resolvedModules = {};
    let resolvedFeatures = {};
    try {
      const plan = await resolvePlan(req.user.organizationId);
      if (plan) {
        const caps = buildPlanCapabilities(plan);
        resolvedModules = caps.modules || {};
        resolvedFeatures = caps.features || {};
      }
    } catch (planErr) {
      // Fail-safe: never block profile fetch if plan resolution fails.
      // Fall back to CORE_MODULES so the sidebar shows at minimum:
      //   patients, appointments, families, recalls, settings, clinical, etc.
      // Non-core modules (orthodontics, analytics, lab) will correctly be hidden.
      logger.warn({
        err: planErr,
        orgId: req.user.organizationId
      }, "[AuthProfile] Plan resolution failed — falling back to core modules");

      // Build core-module fallback from featureRegistry
      const {
        CORE_MODULES,
        MODULE_KEYS
      } = require("../platform/featureRegistry");
      for (const key of MODULE_KEYS) {
        resolvedModules[key] = CORE_MODULES.has(key);
      }
    }

    // ── Reconstruct populated roleId shape from JWT permissions ─────────
    // Phase 6 intentionally removed .populate("roleId") from authMiddleware
    // for performance (no DB lookup on every request). But the frontend
    // CapabilityContext reads user.roleId.permissions to build RBAC gates.
    //
    // At login: authService.validateLogin() DOES populate("roleId") → works.
    // At profile refresh: roleId is a raw ObjectId string → breaks.
    //
    // Fix: Reconstruct the nested { module: { action: true } } shape from
    // req.context.permissions (the JWT-authoritative Set). This gives the
    // frontend the exact shape it expects without a DB populate call.
    const jwtPermissions = req.context?.permissions || new Set();
    const nestedPermissions = {};
    for (const perm of jwtPermissions) {
      const dotIdx = perm.indexOf(".");
      if (dotIdx === -1) continue;
      const mod = perm.substring(0, dotIdx);
      const action = perm.substring(dotIdx + 1);
      if (!nestedPermissions[mod]) nestedPermissions[mod] = {};
      nestedPermissions[mod][action] = true;
    }

    // Build roleId as a populated-like object matching login response shape
    const roleIdResponse = {
      _id: req.user.roleId,
      name: req.context?.roleName || null,
      permissions: nestedPermissions
    };
    res.json({
      id: req.user._id,
      name: req.user.name,
      firstName: req.user.firstName || null,
      lastName: req.user.lastName || null,
      email: req.user.email,
      phone: req.user.phone || null,
      jobTitle: req.user.jobTitle || null,
      profileImage: req.user.profileImage || null,
      speciality: req.user.speciality || null,
      roleId: roleIdResponse,
      platformRole: req.user.platformRole,
      platformDesignation: req.user.platformDesignation || null,
      organizationId: req.user.organizationId,
      branchAccess: req.user.branchAccess || [],
      hasFullBranchAccess: req.user.hasFullBranchAccess || false,
      isEmailVerified: req.user.isEmailVerified || false,
      accountStatus: req.user.isEmailVerified === false ? "email_unverified" : "active",
      // Phase 4: Profile completion gate
      profile: {
        isComplete: req.user.profile?.isComplete ?? true,
        // default true for legacy users
        completedAt: req.user.profile?.completedAt || null
      },
      organization: org ? {
        features: org.features,
        slug: org.slug,
        country: org.country,
        modules: resolvedModules,
        capabilities: {
          modules: resolvedModules,
          features: resolvedFeatures
        },
        subscription: {
          status: org.subscription?.status || "trial"
        }
      } : null
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
});
module.exports = router;