const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const PlatformUser = require("../models/PlatformUser");
const RefreshToken = require("../models/RefreshToken");
const crypto = require("crypto");
const { authenticator } = require("otplib");
const { encrypt, decrypt } = require("./../utils/encryption");
const qrcode = require("qrcode");

const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * 🔑 v1.3.5 - Platform Login (Stage 1)
 */
const platformLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await PlatformUser.findOne({ email }).select("+password");

        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        if (!user.isActive) {
            return res.status(403).json({ message: "Platform user is disabled" });
        }

        // 🛡️ v1.3.5 - 2FA Enforcement for Superadmins
        if (user.twoFactorEnabled) {
            return res.json({
                requires2FA: true,
                userId: user._id,
                email: user.email
            });
        }

        // Continue with normal login for users without 2FA
        return await issueTokens(user, req, res);

    } catch (error) {
        console.error("Platform login error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * 🔒 v1.3.5 - Verify 2FA & Issue Tokens (Stage 2)
 */
const verify2FA = async (req, res) => {
    try {
        const { userId, code } = req.body;

        const user = await PlatformUser.findById(userId).select("+twoFactorSecretEncrypted");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // 1. Check Lockout
        if (user.twoFALockedUntil && new Date() < user.twoFALockedUntil) {
            return res.status(423).json({
                message: "Account locked due to multiple failed 2FA attempts. Try again later.",
                lockedUntil: user.twoFALockedUntil
            });
        }

        // 2. Dev Bypass Logic
        const isDevBypass =
            process.env.NODE_ENV === "development" &&
            process.env.ALLOW_SUPERADMIN_DEV_BYPASS === "true" &&
            code === "000000";

        let isValid = false;
        let isRecoveryCode = false;

        if (isDevBypass) {
            isValid = true;
            console.log(`[SECURITY] DEV_BYPASS_USED by platform user: ${user.email}`);
        } else {
            // 3. Normal TOTP Verification
            const secret = decrypt(user.twoFactorSecretEncrypted);
            isValid = authenticator.verify({ token: code, secret });

            // 4. Recovery Code Verification (if not valid TOTP)
            if (!isValid && code.length === 8) {
                for (const rc of user.recoveryCodes) {
                    if (!rc.used && await bcrypt.compare(code.toUpperCase(), rc.codeHash)) {
                        isValid = true;
                        isRecoveryCode = true;
                        rc.used = true;
                        rc.usedAt = new Date();
                        // 🛡️ Recovery code usage triggers global logout
                        user.tokenVersion += 1;
                        console.log(`[SECURITY ALERT] Recovery code used by: ${user.email}. Global session invalidation triggered.`);
                        break;
                    }
                }
            }
        }

        if (!isValid) {
            // 5. Handle Failure & Lockout
            user.failed2FAAttempts += 1;
            user.lastFailed2FAAt = new Date();

            // Lockout rule: 5 failures within 10 minutes leads to 15 min lock
            const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
            if (user.failed2FAAttempts >= 5 && user.lastFailed2FAAt > tenMinsAgo) {
                user.twoFALockedUntil = new Date(Date.now() + 15 * 60 * 1000);
                console.log(`[SECURITY ALERT] Platform user LOCKED due to failed 2FA: ${user.email}`);
            }

            await user.save();

            return res.status(400).json({
                message: isRecoveryCode ? "Recovery code already used or invalid" : "Invalid 2FA code",
                failedAttempts: user.failed2FAAttempts,
                isLocked: !!user.twoFALockedUntil && new Date() < user.twoFALockedUntil
            });
        }

        // 5. Success - Reset counters
        user.failed2FAAttempts = 0;
        user.twoFALockedUntil = undefined;

        // 🛡️ IP Anomaly Detection (simplified for now)
        const ip = req.ip;
        const knownIP = user.trustedIPs.find(t => t.ip === ip);
        if (!knownIP) {
            user.trustedIPs.unshift({ ip, lastUsedAt: new Date() });
            if (user.trustedIPs.length > 10) user.trustedIPs.pop();
            console.log(`[SECURITY ALERT] Login from new/untrusted IP for user ${user.email}: ${ip}`);
        } else {
            knownIP.lastUsedAt = new Date();
        }

        await user.save();

        return await issueTokens(user, req, res);

    } catch (error) {
        console.error("2FA verification error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * 🎫 Helper to issue tokens (DRY)
 */
const issueTokens = async (user, req, res) => {
    const accessToken = jwt.sign(
        {
            type: "platform",
            id: user._id,
            role: user.role,
            tokenVersion: user.tokenVersion
        },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
    );

    const newRawRefreshToken = crypto.randomBytes(64).toString("hex");
    const newHash = crypto.createHash("sha256").update(newRawRefreshToken).digest("hex");

    await RefreshToken.create({
        userId: user._id,
        tokenHash: newHash,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
        createdByIp: req.ip
    });

    const csrfToken = crypto.randomBytes(32).toString("hex");

    res.cookie("refreshToken", newRawRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/auth",
        maxAge: REFRESH_TOKEN_EXPIRES_IN
    });

    res.cookie("csrf_token", csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: REFRESH_TOKEN_EXPIRES_IN
    });

    return res.json({
        token: accessToken,
        csrfToken,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    });
};

/**
 * 🛠️ v1.3.5 - Setup 2FA (Generate Secret + QR)
 */
const setup2FA = async (req, res) => {
    try {
        const user = req.platformUser; // requires platformProtect

        if (user.twoFactorEnabled) {
            return res.status(400).json({ message: "2FA is already enabled" });
        }

        const secret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri(user.email, "DentalSaaS-Platform", secret);

        // Encrypt secret for storage
        user.twoFactorSecretEncrypted = encrypt(secret);
        await user.save();

        const qrCodeUrl = await qrcode.toDataURL(otpauth);

        res.json({
            qrCodeUrl,
            secret, // provide plain secret once for manual entry
            message: "Scan QR code and verify to complete setup"
        });

    } catch (error) {
        console.error("2FA setup error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * 🛠️ v1.3.5 - Complete/Enable 2FA Verification
 */
const complete2FASetup = async (req, res) => {
    try {
        const { code } = req.body;
        const user = await PlatformUser.findById(req.platformUser._id).select("+twoFactorSecretEncrypted");

        if (!user.twoFactorSecretEncrypted) {
            return res.status(400).json({ message: "2FA setup not initiated" });
        }

        const secret = decrypt(user.twoFactorSecretEncrypted);
        const isValid = authenticator.verify({ token: code, secret });

        if (!isValid) {
            return res.status(400).json({ message: "Invalid verification code" });
        }

        user.twoFactorEnabled = true;

        // Generate recovery codes (v1.3.5)
        const recoveryCodesPlain = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString("hex").toUpperCase());
        user.recoveryCodes = await Promise.all(recoveryCodesPlain.map(async (c) => ({
            codeHash: await bcrypt.hash(c, 10),
            used: false
        })));

        await user.save();

        res.json({
            message: "2FA enabled successfully",
            recoveryCodes: recoveryCodesPlain
        });

    } catch (error) {
        console.error("2FA complete error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * 🗑️ v1.3.5 - Disable 2FA
 */
const disable2FA = async (req, res) => {
    try {
        const { code } = req.body;
        const user = await PlatformUser.findById(req.platformUser._id).select("+twoFactorSecretEncrypted");

        // 🛡️ Guard: Cannot disable 2FA for the last Superadmin if required
        if (user.role === "superadmin") {
            const superadminCount = await PlatformUser.countDocuments({ role: "superadmin", isActive: true });
            if (superadminCount <= 1) {
                return res.status(400).json({ message: "Cannot disable 2FA for the required last active superadmin." });
            }
        }

        const secret = decrypt(user.twoFactorSecretEncrypted);
        const isValid = authenticator.verify({ token: code, secret });

        if (!isValid) {
            return res.status(400).json({ message: "Invalid 2FA code" });
        }

        user.twoFactorEnabled = false;
        user.twoFactorSecretEncrypted = undefined;
        user.recoveryCodes = [];
        await user.save();

        res.json({ message: "2FA disabled successfully" });

    } catch (error) {
        console.error("2FA disable error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = {
    platformLogin,
    verify2FA,
    setup2FA,
    complete2FASetup,
    disable2FA
};
