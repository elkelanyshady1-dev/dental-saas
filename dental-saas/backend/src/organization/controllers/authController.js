const asyncHandler = require("@utils/asyncHandler");
const authService = require("@services/authService");
const crypto = require("crypto");
const getModel = require("@core/db/getModel");
const RefreshTokenDef = require("@shared/models/RefreshToken");
const UserDef = require("@shared/models/User");
const VerificationTokenDef = require("@shared/models/VerificationToken.model");

// Per-org DB resolution
const dbManager = require("@core/db/dbManager");

const validateCSRF = (req) => {
    const cookieToken = req.cookies.csrf_token;
    const headerToken = req.headers["x-csrf-token"];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        const err = new Error("Invalid CSRF token");
        err.statusCode = 403;
        throw err;
    }
};

// 🟢 Register (organization-level, requires subdomain)
exports.register = asyncHandler(async (req, res) => {
    const user = await authService.registerUser(req.body, req.context?.organizationId);

    res.status(201).json({
        message: "User registered",
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            roleId: user.roleId,
            organizationId: user.organizationId,
        },
    });
});

const Organization = require("@shared/models/Organization").default;

const { isPhoneVerificationRequired } = require("@utils/featureFlags");

// 🟢 Login
exports.loginUser = asyncHandler(async (req, res) => {
    const { clinicCode, email, password } = req.body;

    if (!clinicCode || !email || !password) {
        return res.status(400).json({ message: "Invalid credentials" });
    }

    // @rls-auth-flow — pre-authentication credential lookup (no JWT context exists)
    const organization = await Organization.findOne({
        slug: clinicCode.trim().toLowerCase(),
        isActive: true
    });

    if (!organization) {
        return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // v29.0: Region guard removed — login is never blocked by region.
    // Phone verification at signup determines the authoritative region.
    // IP/edge-based region is unreliable and must not block access.
    // Log geographic differences for security auditing only.
    const requestCountry =
        req.headers["cf-ipcountry"] ||
        req.headers["x-edge-country"] ||
        null;

    if (requestCountry && organization.country && requestCountry.toUpperCase() !== organization.country.toUpperCase()) {
        logger.warn({
            organizationId: organization._id,
            orgCountry: organization.country,
            requestCountry: requestCountry.toUpperCase(),
            ip: req.ip,
            userAgent: req.headers["user-agent"],
        }, "[Auth] LOGIN_GEO_DIFFERENCE — user logging in from different country (non-blocking)");
    }

    if (isPhoneVerificationRequired() && !organization.isVerified) {
        return res.status(403).json({ success: false, message: "Account not verified. Please verify phone." });
    }

    const { accessToken, refreshToken, userProfile } = await authService.validateLogin({
        email: email.trim().toLowerCase(),
        password,
        organization,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"]
    });

    const csrfToken = crypto.randomBytes(32).toString("hex");

    const isProdLogin = process.env.NODE_ENV === "production";

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: isProdLogin,
        sameSite: isProdLogin ? "strict" : "lax",
        path: "/api/auth", // Restricted path
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.cookie("csrf_token", csrfToken, {
        httpOnly: false, // Must be accessible by frontend
        secure: isProdLogin,
        sameSite: isProdLogin ? "strict" : "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
        success: true,
        message: "Organization login successful",
        token: accessToken,
        csrfToken: csrfToken,
        user: userProfile,
    });
});

exports.refresh = asyncHandler(async (req, res) => {
    // ℹ️ v13.2 — CSRF is intentionally NOT enforced on refresh.
    // Refresh relies on HttpOnly cookie security. CSRF validation cannot apply here
    // because the access token (and CSRF token pair) is what's being renewed.

    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        return res.status(401).json({ message: "No refresh token" });
    }

    const { accessToken, refreshToken: newRefreshToken } = await authService.refreshToken(
        refreshToken,
        req.ip,
        req.headers["user-agent"],
        req.body.organizationId || null // BUG-1 FIX: Client sends orgId for O(1) lookup
    );

    const csrfToken = crypto.randomBytes(32).toString("hex");

    const isProd = process.env.NODE_ENV === "production";

    res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "strict" : "lax",
        path: "/api/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.cookie("csrf_token", csrfToken, {
        httpOnly: false,
        secure: isProd,
        sameSite: isProd ? "strict" : "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
        success: true,
        token: accessToken,
        csrfToken: csrfToken
    });
});

exports.logout = asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
        // BUG-3 FIX: Pass organizationId from JWT context for O(1) lookup
        await authService.revokeRefreshToken(refreshToken, req.user._id, req.context?.organizationId || null);
    }
    res.clearCookie("refreshToken", { path: "/api/auth" });
    res.json({ success: true, message: "Logged out" });
});

// 🟢 Session Management
exports.getSessions = asyncHandler(async (req, res) => {
    validateCSRF(req);
    const RefreshToken = getModel(req.dbConnection, RefreshTokenDef);
    // Per-org DB: connection-scoped isolation
    const sessions = await RefreshToken.find({
        userId: req.user._id,
        revoked: false,
        expiresAt: { $gt: Date.now() }
    }, req).sort({ lastUsedAt: -1 });

    const currentToken = req.cookies.refreshToken;
    const currentTokenHash = currentToken ? crypto.createHash("sha256").update(currentToken).digest("hex") : null;

    const formattedSessions = sessions.map(s => ({
        id: s._id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        deviceName: s.deviceName,
        isCurrentSession: s.tokenHash === currentTokenHash
    }));

    res.json(formattedSessions);
});

exports.revokeSession = asyncHandler(async (req, res) => {
    validateCSRF(req);
    const RefreshToken = getModel(req.dbConnection, RefreshTokenDef);
    const { id } = req.params;

    // Per-org DB: connection-scoped isolation
    const session = await RefreshToken.findOne({
        _id: id,
        userId: req.user._id,
    });

    if (!session) {
        return res.status(404).json({ message: "Session not found" });
    }

    session.revoked = true;
    await session.save();

    res.json({ success: true, message: "Session revoked" });
});

exports.revokeAllSessions = asyncHandler(async (req, res) => {
    validateCSRF(req);
    const RefreshToken = getModel(req.dbConnection, RefreshTokenDef);
    const User = getModel(req.dbConnection, UserDef);

    // Revoke all tokens for this user
    await RefreshToken.updateMany(
        { userId: req.user._id },
        { revoked: true }
    );

    // Global kill switch increment
    // Per-org DB: connection-scoped isolation
    const user = await User.findById(req.user._id);
    user.tokenVersion += 1;
    await user.save();

    res.clearCookie("refreshToken", { path: "/api/auth" });
    res.json({ success: true, message: "All sessions revoked. Please login again." });
});

// 🟢 Change Password (bumps tokenVersion → invalidates all old tokens)
exports.changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const { accessToken, refreshToken } = await authService.changePassword(
        req.user._id,
        currentPassword,
        newPassword,
        req.ip,
        req.context?.organizationId // Pass orgId for per-org model resolution
    );

    // Issue new CSRF token pair to keep client in sync after rotation.
    // The httpOnly refresh cookie is rotated by authService — if the client's
    // in-memory csrfToken is not also updated, the next mutation will fail
    // with 403 Invalid CSRF token.
    const csrfToken = crypto.randomBytes(32).toString("hex");

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.cookie("csrf_token", csrfToken, {
        httpOnly: false,  // Must be readable by frontend
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
        success: true,
        message: "Password changed. All other sessions invalidated.",
        token: accessToken,
        csrfToken: csrfToken,   // ← GAP-1 FIX: client calls setCsrfToken(csrfToken)
    });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
    const { email, clinicCode } = req.body;

    // v2.0: Use Verification Engine for password reset
    const verificationEngine = require("@core/auth/verificationEngine.service");
    const Organization = require("@shared/models/Organization").default;

    if (!email || !clinicCode) {
        return res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
    }

    // @rls-auth-flow — pre-authentication credential lookup (no JWT context)
    const organization = await Organization.findOne({ slug: clinicCode.toLowerCase().trim() });
    if (!organization) {
        return res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
    }

    // Resolve per-org User model
    const orgConn = dbManager.getConnection(String(organization._id));
    const User = getModel(orgConn, UserDef);

    // @rls-auth-flow — pre-authentication credential lookup (no JWT context)
    const user = await User.findOne({
        email: email.toLowerCase().trim(),
        organizationId: organization._id,
        isActive: true,
    });

    if (!user) {
        return res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
    }

    // Engine handles token creation + email delivery via listener
    try {
        await verificationEngine.requestVerification({
            purpose: "PASSWORD_RESET",
            identifier: email.toLowerCase().trim(),
            organizationId: organization._id,
            metadata: { name: user.name, userId: String(user._id) },
        });
    } catch (engineErr) {
        if (engineErr.statusCode === 429) {
            return res.status(429).json({ success: false, message: engineErr.message });
        }
        logger.error({ err: engineErr.message }, "[Auth] Password reset verification engine failed");
    }

    // Legacy dual-write: also create PasswordResetToken
    try {
        await authService.forgotPassword(email, clinicCode);
    } catch { /* legacy is non-blocking */ }

    res.json({
        success: true,
        message: "If an account with that email exists, a reset link has been sent."
    });
});

exports.resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ success: false, message: "Token and new password are required" });
    }

    // v2.0: Try Verification Engine first
    const verificationEngine = require("@core/auth/verificationEngine.service");
    const bcryptLib = require("bcryptjs");

    let verified = false;
    let userId = null;
    let verifiedOrgId = null;

    try {
        const result = await verificationEngine.verifyToken({
            purpose: "PASSWORD_RESET",
            identifier: "", // We don't know the email from the token alone
            rawToken: token,
        });
        verified = result.valid;
        userId = result.tokenDoc?.metadata?.userId;
        verifiedOrgId = result.tokenDoc?.organizationId;
    } catch (engineErr) {
        // Engine might fail with "not found" if no identifier — fall back to legacy
        if (engineErr.statusCode !== 400) {
            logger.warn({ err: engineErr.message }, "[Auth] Engine verify for password reset failed");
        }
    }

    // Legacy fallback
    if (!verified) {
        try {
            await authService.resetPassword(token, newPassword);
            return res.json({
                success: true,
                message: "Password has been reset successfully. You can now login with your new password.",
            });
        } catch (legacyErr) {
            return res.status(legacyErr.statusCode || 400).json({
                success: false,
                message: legacyErr.message,
            });
        }
    }

    // Engine path: update user password
    if (!userId) {
        return res.status(400).json({ success: false, message: "Invalid reset token." });
    }

    // Resolve User from per-org DB if organizationId is available
    let user;
    if (verifiedOrgId) {
        const orgConn = dbManager.getConnection(String(verifiedOrgId));
        const User = getModel(orgConn, UserDef);
        user = await User.findById(userId);
    } else {
        // Fallback: try global model (legacy tokens without organizationId)
        const UserGlobal = require("@shared/models/User").default;
        user = await UserGlobal.findById(userId);
    }

    if (!user) {
        return res.status(400).json({ success: false, message: "User no longer exists." });
    }

    user.password = await bcryptLib.hash(newPassword, 10);
    user.tokenVersion += 1;
    user.mustChangePassword = false;
    await user.save();

    res.json({
        success: true,
        message: "Password has been reset successfully. You can now login with your new password.",
    });
});

// Section 4 — Email OTP Verification
// Section 5 — Resend Email OTP

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
 *       429:
 *         description: Too many attempts
 */
exports.verifyEmailOtp = asyncHandler(async (req, res) => {
    const { email, otp, clinicCode } = req.body;
    const bcryptLib = require("bcryptjs");

    if (!email || !otp) {
        return res.status(400).json({ success: false, message: "Email and OTP are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Resolve organization for per-org DB access
    let orgId = null;
    if (clinicCode) {
        const org = await Organization.findOne({ slug: clinicCode.toLowerCase().trim() });
        if (org) orgId = org._id;
    }

    // If no clinicCode, we need to find the org from the verification token first
    // using global model as a lookup index, then switch to per-org DB
    let VerificationToken;
    let User;
    if (orgId) {
        const orgConn = dbManager.getConnection(String(orgId));
        VerificationToken = getModel(orgConn, VerificationTokenDef);
        User = getModel(orgConn, UserDef);
    } else {
        // Fallback: use global model to find the token, then resolve org
        VerificationToken = VerificationTokenDef.default;
        User = UserDef.default;
    }

    // Find the most recent unused, unexpired token
    // @rls-auth-flow — pre-authentication token verification (no JWT context)
    const tokenDoc = await VerificationToken.findOne({
        purpose: "EMAIL_VERIFY",
        identifier: normalizedEmail,
        isUsed: false,
        expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!tokenDoc) {
        return res.status(400).json({
            success: false,
            message: "No valid verification code found. Please request a new one.",
        });
    }

    // If we didn't have orgId but the token has it, re-resolve per-org models
    if (!orgId && tokenDoc.organizationId) {
        orgId = tokenDoc.organizationId;
        const orgConn = dbManager.getConnection(String(orgId));
        VerificationToken = getModel(orgConn, VerificationTokenDef);
        User = getModel(orgConn, UserDef);
        // Re-fetch token from per-org DB
        const perOrgToken = await VerificationToken.findById(tokenDoc._id);
        if (perOrgToken) {
            // Use per-org token document
            Object.assign(tokenDoc, perOrgToken.toObject());
        }
    }

    // Check max attempts
    if (tokenDoc.attempts >= (tokenDoc.maxAttempts || 5)) {
        tokenDoc.isUsed = true;
        await tokenDoc.save();
        return res.status(429).json({
            success: false,
            message: "Too many failed attempts. Please request a new code.",
        });
    }

    // Compare OTP
    const isMatch = await bcryptLib.compare(otp, tokenDoc.tokenHash);
    tokenDoc.attempts += 1;

    if (!isMatch) {
        await tokenDoc.save();
        return res.status(400).json({
            success: false,
            message: "Invalid verification code.",
            attemptsRemaining: (tokenDoc.maxAttempts || 5) - tokenDoc.attempts,
        });
    }

    // OTP matched
    tokenDoc.isUsed = true;
    await tokenDoc.save();

    // Update user
    // @rls-auth-flow — pre-authentication user lookup (no JWT context)
    const user = await User.findOne({
        email: normalizedEmail,
        ...(tokenDoc.organizationId ? { organizationId: tokenDoc.organizationId } : {}),
    });

    if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
    }

    user.isEmailVerified = true;
    user.emailVerifiedAt = new Date();
    await user.save();

    logger.info(
        { userId: user._id, email: normalizedEmail },
        "[Auth] EMAIL_VERIFIED via OTP"
    );

    // Emit metric
    try {
        const CommunicationMetrics = require("@platform/models/CommunicationMetrics.model").default;
        await CommunicationMetrics.increment("email", "VERIFY_EMAIL_OTP", "sent");
    } catch { /* metrics are non-blocking */ }

    res.json({ success: true, message: "Email verified successfully." });
});

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
exports.resendEmailOtp = asyncHandler(async (req, res) => {
    const { email, clinicCode } = req.body;
    const bcryptLib = require("bcryptjs");
    const crypto = require("crypto");
    const { dispatch: dispatchCommunication } = require("@infra/communication/communication.dispatcher");

    if (!email) {
        return res.status(400).json({ success: false, message: "Email is required." });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Resolve organization for per-org DB access
    let orgId = null;
    let User;
    let VerificationToken;

    if (clinicCode) {
        const org = await Organization.findOne({ slug: clinicCode.toLowerCase().trim() });
        if (org) orgId = org._id;
    }

    if (orgId) {
        const orgConn = dbManager.getConnection(String(orgId));
        User = getModel(orgConn, UserDef);
        VerificationToken = getModel(orgConn, VerificationTokenDef);
    } else {
        // Fallback: use global model to find user → resolve their org
        const UserGlobal = UserDef.default;
        const tempUser = await UserGlobal.findOne({ email: normalizedEmail });
        if (tempUser && tempUser.organizationId) {
            orgId = tempUser.organizationId;
            const orgConn = dbManager.getConnection(String(orgId));
            User = getModel(orgConn, UserDef);
            VerificationToken = getModel(orgConn, VerificationTokenDef);
        } else {
            User = UserGlobal;
            VerificationToken = VerificationTokenDef.default;
        }
    }

    // Check if user exists and is not already verified
    // @rls-auth-flow — pre-authentication credential lookup (no JWT context)
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
        // Don't reveal whether user exists — return success regardless
        return res.json({ success: true, message: "If your email is registered, a verification code has been sent." });
    }
    if (user.isEmailVerified) {
        return res.json({ success: true, message: "Email is already verified." });
    }

    // If we still don't have orgId from the user, resolve now
    if (!orgId && user.organizationId) {
        orgId = user.organizationId;
        const orgConn = dbManager.getConnection(String(orgId));
        VerificationToken = getModel(orgConn, VerificationTokenDef);
    }

    // Rate limit: max 3 OTP emails per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    // @rls-auth-flow — pre-authentication rate limit check (no JWT context)
    const recentCount = await VerificationToken.countDocuments({
        purpose: "EMAIL_VERIFY",
        identifier: normalizedEmail,
        createdAt: { $gte: oneHourAgo },
    });

    if (recentCount >= 3) {
        return res.status(429).json({
            success: false,
            message: "Too many verification requests. Please try again later.",
        });
    }

    // Invalidate previous tokens
    await VerificationToken.updateMany(
        { purpose: "EMAIL_VERIFY", identifier: normalizedEmail, isUsed: false },
        { $set: { isUsed: true } }
    );

    // Generate new OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcryptLib.hash(otp, 10);

    await VerificationToken.create({
        purpose: "EMAIL_VERIFY",
        identifier: normalizedEmail,
        tokenHash: otpHash,
        channel: "email",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        attempts: 0,
        maxAttempts: 5,
        isUsed: false,
        organizationId: user.organizationId,
        metadata: { name: user.name, userId: String(user._id) },
    });

    // Auth-critical: user is waiting on the code. Dispatch synchronously so
    // the provider ACKs before we respond. Errors are logged but NOT
    // propagated — we still return a success-shaped response to avoid leaking
    // delivery state (same user-enumeration stance used above).
    try {
        await dispatchCommunication(
            {
                channel: "email",
                type: "EMAIL_OTP",
                payload: {
                    email: normalizedEmail,
                    otp,
                    name: user.name,
                    subject: "Verify Your Email — DentalSaaS",
                },
            },
            { hint: "sync" }
        );
    } catch (err) {
        logger.error(
            { userId: user._id, email: normalizedEmail.slice(0, 4) + "****", err: err.message },
            "[Auth] Email OTP dispatch failed"
        );
    }

    logger.info(
        { userId: user._id, email: normalizedEmail.slice(0, 4) + "****" },
        "[Auth] Email OTP resent"
    );

    res.json({ success: true, message: "Verification code sent." });
});

// ─── Phase 11: Smart Multi-Org Login Controllers ─────────────────────────────

/**
 * POST /api/v1/auth/smart-login
 * Email + Password only. Returns SINGLE_ORG or MULTI_ORG.
 * Does NOT require clinicCode — smart org detection via global User lookup.
 */
exports.smartLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const result = await authService.smartLogin({
        email,
        password,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
    });

    // MULTI_ORG: return org list only — no session yet (user must select an org)
    if (result.type === "MULTI_ORG") {
        return res.json({ success: true, data: result });
    }

    // SINGLE_ORG: full session — set cookies identically to loginUser
    const { accessToken, refreshToken } = result;
    const csrfToken = crypto.randomBytes(32).toString("hex");
    const isProd = process.env.NODE_ENV === "production";

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "strict" : "lax",
        path: "/api/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.cookie("csrf_token", csrfToken, {
        httpOnly: false,
        secure: isProd,
        sameSite: isProd ? "strict" : "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
        success: true,
        data: { type: "SINGLE_ORG", token: accessToken, csrfToken },
    });
});

/**
 * POST /api/v1/auth/select-org
 * Second step for MULTI_ORG users: choose an org, get a scoped JWT.
 * Password is re-validated server-side — organizationId from body is NEVER trusted alone.
 */
exports.selectOrg = asyncHandler(async (req, res) => {
    const { email, password, organizationId } = req.body;
    const { accessToken, refreshToken } = await authService.selectOrg({
        email,
        password,
        organizationId,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
    });

    const csrfToken = crypto.randomBytes(32).toString("hex");
    const isProd = process.env.NODE_ENV === "production";

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "strict" : "lax",
        path: "/api/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.cookie("csrf_token", csrfToken, {
        httpOnly: false,
        secure: isProd,
        sameSite: isProd ? "strict" : "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
        success: true,
        data: { token: accessToken, csrfToken },
    });
});