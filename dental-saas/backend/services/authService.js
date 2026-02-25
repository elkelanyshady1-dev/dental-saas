const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const PlatformUser = require("../models/PlatformUser");
const PasswordResetToken = require("../models/PasswordResetToken");
const logger = require("../utils/logger");

exports.registerUser = async (data, organizationId) => {
    const { name, email, password, roleId, branchAccess, hasFullBranchAccess } = data;

    if (!organizationId) {
        throw new Error("Registration requires an organization subdomain");
    }

    const existingUser = await User.findOne({ email, organizationId });
    if (existingUser) {
        let err = new Error("Email already exists in this organization");
        err.statusCode = 400;
        throw err;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
        name,
        email,
        password: hashedPassword,
        roleId: roleId || null,
        platformRole: null,
        organizationId: organizationId,
        branchAccess: branchAccess || [],
        hasFullBranchAccess: hasFullBranchAccess || false,
    });

    return user;
};

const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_SESSIONS_PER_USER = 5;

exports.validateLogin = async ({ email, password, organization, ipAddress, userAgent }) => {
    const RefreshToken = require("../models/RefreshToken");

    // Note: organization is now resolved by the controller via clinicCode
    if (!organization) {
        let err = new Error("Invalid credentials");
        err.statusCode = 401;
        throw err;
    }

    const user = await User.findOne({
        email: email.trim().toLowerCase(),
        organizationId: organization._id,
        isActive: true
    }).select("+password");

    if (organization.subscription.status === "expired") {
        let err = new Error("Subscription expired. Please contact support.");
        err.statusCode = 403;
        throw err;
    }

    if (!user) {
        let err = new Error("Invalid credentials");
        err.statusCode = 400;
        throw err;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        let err = new Error("Invalid credentials");
        err.statusCode = 400;
        throw err;
    }

    // LAYER 2: Access Token (15 minutes)
    const accessToken = jwt.sign(
        {
            type: "organization",
            userId: user._id,
            roleId: user.roleId,
            organizationId: user.organizationId,
            tokenVersion: user.tokenVersion
        },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
    );

    // LAYER 1: Refresh Token Rotation
    const rawRefreshToken = crypto.randomBytes(64).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");

    // Enforce MAX 5 active refresh tokens per user
    const activeTokens = await RefreshToken.find({ userId: user._id, revoked: false, expiresAt: { $gt: Date.now() } })
        .sort({ createdAt: 1 });

    if (activeTokens.length >= MAX_SESSIONS_PER_USER) {
        // Revoke oldest active token
        const oldest = activeTokens[0];
        oldest.revoked = true;
        await oldest.save();
    }

    await RefreshToken.create({
        userId: user._id,
        organizationId: user.organizationId,
        tokenHash,
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
        createdByIp: ipAddress
    });

    return {
        accessToken,
        refreshToken: rawRefreshToken,
        userProfile: {
            id: user._id,
            name: user.name,
            email: user.email,
            roleId: user.roleId,
            organizationId: user.organizationId,
            mustChangePassword: user.mustChangePassword,
            organization: {
                id: organization._id,
                slug: organization.slug,
                features: organization.features
            }
        }
    };
};

exports.refreshToken = async (token, ipAddress, userAgent) => {
    const RefreshToken = require("../models/RefreshToken");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const refreshDoc = await RefreshToken.findOne({ tokenHash });

    // REUSE ATTACK DETECTION HARDENING (v1.1.0 RULE)
    const isExpired = refreshDoc && refreshDoc.expiresAt < Date.now();
    const isRevoked = refreshDoc && refreshDoc.revoked;

    if (!refreshDoc || isRevoked || isExpired) {
        // Treat as attack ONLY if revoked AND replacedByToken is NULL 
        // (meaning it was revoked by logout/expulsion, not rotation)
        if (refreshDoc && isRevoked && refreshDoc.replacedByToken === null) {
            // Revoke ALL refresh tokens for this user as precaution
            await RefreshToken.updateMany({ userId: refreshDoc.userId }, { revoked: true });

            const user = await User.findById(refreshDoc.userId) || await PlatformUser.findById(refreshDoc.userId);
            if (user) {
                user.tokenVersion += 1;
                await user.save();
                logger.warn({ userId: user._id, ip: ipAddress, userAgent }, "Session high-jacking attempt detected (re-use of revoked token). Global kill-switch triggered.");
            }
        }
        let err = new Error("Invalid refresh token");
        err.statusCode = 401;
        throw err;
    }

    const user = await User.findById(refreshDoc.userId).populate("organizationId") || await PlatformUser.findById(refreshDoc.userId);
    if (!user || !user.isActive || (user.organizationId && !user.organizationId.isActive)) {
        let err = new Error("Account is no longer active");
        err.statusCode = 401;
        throw err;
    }

    // Generate new pair
    const accessToken = jwt.sign(
        {
            type: user.organizationId ? "organization" : "platform",
            userId: user._id,
            id: user._id, // Platform token uses 'id'
            role: user.role, // Platform token uses 'role'
            roleId: user.roleId,
            organizationId: user.organizationId ? user.organizationId._id : undefined,
            tokenVersion: user.tokenVersion
        },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
    );

    const newRawRefreshToken = crypto.randomBytes(64).toString("hex");
    const newHash = crypto.createHash("sha256").update(newRawRefreshToken).digest("hex");

    // Revoke old and link to new
    refreshDoc.revoked = true;
    refreshDoc.replacedByToken = newHash;
    refreshDoc.lastUsedAt = Date.now();
    await refreshDoc.save();

    await RefreshToken.create({
        userId: user._id,
        organizationId: user.organizationId ? user.organizationId._id : undefined,
        tokenHash: newHash,
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
        createdByIp: ipAddress
    });

    return {
        accessToken,
        refreshToken: newRawRefreshToken
    };
};

exports.revokeRefreshToken = async (token) => {
    const RefreshToken = require("../models/RefreshToken");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const refreshDoc = await RefreshToken.findOne({ tokenHash });
    if (refreshDoc) {
        refreshDoc.revoked = true;
        await refreshDoc.save();
    }
};

exports.changePassword = async (userId, currentPassword, newPassword, ipAddress) => {
    const RefreshToken = require("../models/RefreshToken");

    if (!currentPassword || !newPassword) {
        let err = new Error("Current and new password are required");
        err.statusCode = 400;
        throw err;
    }

    const user = await User.findOne({ _id: userId, isActive: true }).select("+password");

    if (!user) {
        let err = new Error("User not found");
        err.statusCode = 404;
        throw err;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
        let err = new Error("Current password is incorrect");
        err.statusCode = 400;
        throw err;
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.tokenVersion += 1;
    user.mustChangePassword = false;
    await user.save();

    // Revoke all existing refresh tokens for this user
    await RefreshToken.updateMany({ userId: user._id }, { revoked: true });

    // Generate new pair
    const accessToken = jwt.sign(
        {
            type: "organization",
            userId: user._id,
            roleId: user.roleId,
            organizationId: user.organizationId,
            tokenVersion: user.tokenVersion,
        },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
    );

    const rawRefreshToken = crypto.randomBytes(64).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");

    await RefreshToken.create({
        userId: user._id,
        organizationId: user.organizationId,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
        createdByIp: ipAddress
    });

    return { accessToken, refreshToken: rawRefreshToken };
};

exports.forgotPassword = async (email, clinicCode) => {
    if (!email || !clinicCode) {
        throw new Error("Email and clinic code are required");
    }

    const Organization = require("../models/Organization");
    const organization = await Organization.findOne({ slug: clinicCode.toLowerCase().trim() });

    if (!organization) return; // Silent return for security

    const user = await User.findOne({
        email: email.toLowerCase().trim(),
        organizationId: organization._id,
        isActive: true
    });

    if (!user) return;

    // Generate random secure token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    await PasswordResetToken.create({
        userId: user._id,
        token: hashedToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    });

    // Send email (mock for now)
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;
    logger.info({ email, resetUrl }, "Generated password reset link");
};

exports.resetPassword = async (token, newPassword) => {
    if (!token || !newPassword) {
        let err = new Error("Token and new password are required");
        err.statusCode = 400;
        throw err;
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const tokenDoc = await PasswordResetToken.findOne({
        token: hashedToken,
        isUsed: false,
        expiresAt: { $gt: Date.now() }
    });

    if (!tokenDoc) {
        let err = new Error("Token is invalid or has expired");
        err.statusCode = 400;
        throw err;
    }

    const user = await User.findById(tokenDoc.userId);
    if (!user) {
        throw new Error("User no longer exists");
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.tokenVersion += 1;
    user.mustChangePassword = false;
    await user.save();

    // Mark token as used
    tokenDoc.isUsed = true;
    await tokenDoc.save();

    return user;
};
