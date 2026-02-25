const asyncHandler = require("../utils/asyncHandler");
const authService = require("../services/authService");
const crypto = require("crypto");

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
    const user = await authService.registerUser(req.body, req.organization?._id);

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

const Organization = require("../models/Organization");

const { isPhoneVerificationRequired } = require("../utils/featureFlags");

// 🟢 Login
exports.loginUser = asyncHandler(async (req, res) => {
    const { clinicCode, email, password } = req.body;

    if (!clinicCode || !email || !password) {
        return res.status(400).json({ message: "Invalid credentials" });
    }

    const organization = await Organization.findOne({
        slug: clinicCode.trim().toLowerCase(),
        isActive: true
    });

    if (!organization) {
        return res.status(401).json({ success: false, message: "Invalid credentials" });
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

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/auth", // Restricted path
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.cookie("csrf_token", csrfToken, {
        httpOnly: false, // Must be accessible by frontend
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
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
    // 1️⃣ CSRF Validation BEFORE refresh token validation (v1.2.0 Rule)
    validateCSRF(req);

    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        return res.status(401).json({ message: "No refresh token" });
    }

    const { accessToken, refreshToken: newRefreshToken } = await authService.refreshToken(
        refreshToken,
        req.ip,
        req.headers["user-agent"]
    );

    const csrfToken = crypto.randomBytes(32).toString("hex");

    res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.cookie("csrf_token", csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
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
        await authService.revokeRefreshToken(refreshToken);
    }
    res.clearCookie("refreshToken", { path: "/api/auth" });
    res.json({ success: true, message: "Logged out" });
});

// 🟢 Session Management
exports.getSessions = asyncHandler(async (req, res) => {
    validateCSRF(req);
    const RefreshToken = require("../models/RefreshToken");
    // ...
    const sessions = await RefreshToken.find({
        userId: req.user._id,
        organizationId: req.user.organizationId,
        revoked: false,
        expiresAt: { $gt: Date.now() }
    }).sort({ lastUsedAt: -1 });

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
    const RefreshToken = require("../models/RefreshToken");
    const { id } = req.params;

    const session = await RefreshToken.findOne({
        _id: id,
        userId: req.user._id,
        organizationId: req.user.organizationId
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
    const RefreshToken = require("../models/RefreshToken");
    const User = require("../models/User");

    // Revoke all tokens for this user
    await RefreshToken.updateMany(
        { userId: req.user._id },
        { revoked: true }
    );

    // Global kill switch increment
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
        req.ip
    );

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
        success: true,
        message: "Password changed. All other sessions invalidated.",
        token: accessToken,
    });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
    const { email, clinicCode } = req.body;
    await authService.forgotPassword(email, clinicCode);

    res.json({
        success: true,
        message: "If an account with that email exists, a reset link has been sent."
    });
});

exports.resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    await authService.resetPassword(token, newPassword);

    res.json({
        success: true,
        message: "Password has been reset successfully. You can now login with your new password.",
    });
});