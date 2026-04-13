const bcrypt = require("bcryptjs");
const { signPlatformToken } = require("@core/auth/jwtManager");
const crypto = require("crypto");
const qrcode = require("qrcode");

const { authenticator } = require("otplib");
const { encrypt, decrypt } = require("../../utils/encryption");

const PlatformUser = require("../models/PlatformUser").default;
// Platform auth refresh tokens live on the platform DB (PlatformUser is platform-scoped)
const RefreshToken = require("@shared/models/RefreshToken").default;

const { isEnterprise } = require("@config/platformMode");
const { computeCapabilityHash } = require("../../controllers/platformMetadataController");
const { resolvePlatformCapabilities } = require("../../services/platformCapabilityResolver");
const auditService = require("../../services/auditService");
const logger = require("@utils/logger");

const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Sentinel values for platform-level auth events ───────────────────────────
// Auth events have no real org/branch context — use zero-ObjectId sentinels.
const PLATFORM_SENTINEL_ID = "000000000000000000000000";

/**
 * _auditPlatformAuthEvent
 * Fire-and-forget helper to write a platform auth AuditLog record.
 * Never throws — failure to audit must not fail the auth request.
 *
 * v21.0 — Accepts `req` and `actor` for automatic device/geo enrichment.
 * All existing callers pass these implicitly if they set ipAddress/userAgent.
 */
function _auditPlatformAuthEvent(fields) {
    auditService.createAuditRecord({
        organizationId: PLATFORM_SENTINEL_ID,
        branchId: PLATFORM_SENTINEL_ID,
        actorType: "platform_user",
        signatureVersion: 1,
        ...fields,
    }).catch((err) => {
        logger.error({ event: "AUDIT_WRITE_FAILURE", action: fields.action, error: err.message }, "Failed to write platform auth audit record");
    });
}


/**
 * 🔑 v1.3.5 - Platform Login (Stage 1)
 */
const platformLogin = async (req, res) => {
    const TRACE = process.env.AUTH_TRACE === "true";
    try {
        const { email: rawEmail, password } = req.body;

        // Normalize email to lowercase to prevent case-sensitivity mismatch
        const email = rawEmail ? rawEmail.toLowerCase().trim() : "";

        if (TRACE) req.logger.debug({ event: "AUTH_TRACE_LOGIN_ATTEMPT", email }, "[AUTH_TRACE] Login attempt");

        const user = await PlatformUser.findOne({ email }).select("+password");

        if (TRACE) req.logger.debug({ event: "AUTH_TRACE_USER_LOOKUP", found: !!user, isActive: user?.isActive, role: user?.role }, "[AUTH_TRACE] User lookup");

        if (!user) {
            if (TRACE) req.logger.debug({ event: "AUTH_TRACE_LOGIN_FAIL", reason: "USER_NOT_FOUND" }, "[AUTH_TRACE] Login fail");
            _auditPlatformAuthEvent({
                actorId: PLATFORM_SENTINEL_ID,
                action: "LOGIN_FAILED",
                entity: "PlatformUser",
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
                correlationId: req.correlationId,
                success: false,
                details: { reason: "USER_NOT_FOUND", email },
            });
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (TRACE) req.logger.debug({ event: "AUTH_TRACE_BCRYPT", result: isMatch }, "[AUTH_TRACE] bcrypt.compare");

        if (!isMatch) {
            if (TRACE) req.logger.debug({ event: "AUTH_TRACE_LOGIN_FAIL", reason: "PASSWORD_MISMATCH" }, "[AUTH_TRACE] Login fail");
            _auditPlatformAuthEvent({
                actorId: user._id,
                action: "LOGIN_FAILED",
                entity: "PlatformUser",
                entityId: user._id,
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
                correlationId: req.correlationId,
                success: false,
                details: { reason: "PASSWORD_MISMATCH" },
            });
            return res.status(401).json({ message: "Invalid credentials" });
        }

        if (!user.isActive) {
            if (TRACE) req.logger.debug({ event: "AUTH_TRACE_LOGIN_FAIL", reason: "USER_INACTIVE" }, "[AUTH_TRACE] Login fail");
            _auditPlatformAuthEvent({
                actorId: user._id,
                action: "LOGIN_FAILED",
                entity: "PlatformUser",
                entityId: user._id,
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
                correlationId: req.correlationId,
                success: false,
                details: { reason: "USER_INACTIVE" },
            });
            return res.status(403).json({ message: "Platform user is disabled" });
        }

        // 🛡️ v1.3.5 - 2FA Enforcement for Superadmins
        if (user.twoFactorEnabled) {
            if (TRACE) req.logger.debug({ event: "AUTH_TRACE_2FA_REQUIRED", userId: user._id }, "[AUTH_TRACE] 2FA required");
            return res.json({
                requires2FA: true,
                userId: user._id,
                email: user.email
            });
        }

        // Continue with normal login for users without 2FA
        return await issueTokens(user, req, res);

    } catch (error) {
        req.logger.error({ event: "LOGIN_ERROR", error: error.message, stack: error.stack }, "Platform login error");
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
            return res.status(401).json({ message: "Invalid credentials" });
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
            req.logger.warn({ event: "TWO_FA_DEV_BYPASS", userId: user._id, email: user.email, ipAddress: req.ip }, "Dev bypass used for platform 2FA");
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
                        req.logger.warn({ event: "RECOVERY_CODE_USED", userId: user._id, email: user.email, ipAddress: req.ip }, "Recovery code used — global session invalidation triggered");
                        _auditPlatformAuthEvent({
                            actorId: user._id,
                            action: "RECOVERY_CODE_USED",
                            entity: "PlatformUser",
                            entityId: user._id,
                            ipAddress: req.ip,
                            userAgent: req.headers["user-agent"],
                            correlationId: req.correlationId,
                            success: true,
                            details: { globalSessionInvalidated: true },
                        });
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
                req.logger.warn({ event: "TWO_FA_LOCKED", userId: user._id, email: user.email, ipAddress: req.ip, lockedUntil: user.twoFALockedUntil }, "Platform user locked due to failed 2FA attempts");
                _auditPlatformAuthEvent({
                    actorId: user._id,
                    action: "TWO_FA_LOCKED",
                    entity: "PlatformUser",
                    entityId: user._id,
                    ipAddress: req.ip,
                    userAgent: req.headers["user-agent"],
                    correlationId: req.correlationId,
                    success: false,
                    details: { lockedUntil: user.twoFALockedUntil, failedAttempts: user.failed2FAAttempts },
                });
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
            req.logger.warn({ event: "NEW_IP_LOGIN", userId: user._id, email: user.email, ipAddress: ip, correlationId: req.correlationId }, "Platform login from new/untrusted IP");
            _auditPlatformAuthEvent({
                actorId: user._id,
                action: "NEW_IP_LOGIN",
                entity: "PlatformUser",
                entityId: user._id,
                ipAddress: ip,
                userAgent: req.headers["user-agent"],
                correlationId: req.correlationId,
                success: true,
                details: { newIp: ip },
            });
        } else {
            knownIP.lastUsedAt = new Date();
        }

        await user.save();

        return await issueTokens(user, req, res);

    } catch (error) {
        req.logger.error({ event: "TWO_FA_VERIFY_ERROR", error: error.message, stack: error.stack }, "2FA verification error");
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * 🎫 Helper to issue tokens (DRY)
 */
const issueTokens = async (user, req, res) => {
    const TRACE = process.env.AUTH_TRACE === "true";
    const regionCode = user.regionCode || "GLOBAL";

    // v20.1 Wave2 — resolver returns string[], not { capabilities, metadata }
    let capabilityHash;
    if (isEnterprise()) {
        const capabilities = resolvePlatformCapabilities({ role: user.role });
        capabilityHash = computeCapabilityHash(capabilities);
    }

    if (TRACE) {
        req.logger.debug({ event: "AUTH_TRACE_JWT_SIGN", userId: user._id, role: user.role, regionCode }, "[AUTH_TRACE] JWT signing");
        req.logger.debug({ event: "AUTH_TRACE_JWT_SECRET", defined: !!process.env.JWT_SECRET, length: (process.env.JWT_SECRET || "").length }, "[AUTH_TRACE] JWT secret check");
    }

    const accessToken = signPlatformToken({
        id: user._id,
        role: user.role,
        regionCode,
        tokenVersion: user.tokenVersion,
        ...(capabilityHash && { capabilityHash }),
    });

    if (TRACE) req.logger.debug({ event: "AUTH_TRACE_TOKEN_CREATED", length: accessToken.length, expiresIn: "15m" }, "[AUTH_TRACE] Access token created");

    const newRawRefreshToken = crypto.randomBytes(64).toString("hex");
    const newHash = crypto.createHash("sha256").update(newRawRefreshToken).digest("hex");

    await RefreshToken.create({
        userId: user._id,
        tokenHash: newHash,
        regionCode,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
        createdByIp: req.ip
    });

    const csrfToken = crypto.randomBytes(32).toString("hex");

    const isProd = process.env.NODE_ENV === "production";

    const cookieOpts = {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "strict" : "lax",
        path: "/api/platform",  // platform-scoped, never /api/auth
        maxAge: REFRESH_TOKEN_EXPIRES_IN
    };

    if (TRACE) req.logger.debug({ event: "AUTH_TRACE_COOKIE", cookieOpts }, "[AUTH_TRACE] Setting platformRefreshToken cookie");

    // v13.4 — Cookie renamed to platformRefreshToken to prevent collision with org refreshToken.
    res.cookie("platformRefreshToken", newRawRefreshToken, cookieOpts);

    res.cookie("csrf_token", csrfToken, {
        httpOnly: false,
        secure: isProd,
        sameSite: isProd ? "strict" : "lax",
        path: "/",
        maxAge: REFRESH_TOKEN_EXPIRES_IN
    });

    // v20.2 — Structured pino log (replaces raw console.log)
    req.logger.info({
        event: "LOGIN_SUCCESS",
        userId: user._id,
        role: user.role,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        correlationId: req.correlationId,
    }, "Platform login successful");

    // Persist AuditLog record — fire-and-forget
    _auditPlatformAuthEvent({
        actorId: user._id,
        actor: user,        // v21.0 — for name split + role snapshot
        req,                // v21.0 — for device/geo extraction
        action: "LOGIN_SUCCESS",
        entity: "PlatformUser",
        entityId: user._id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        correlationId: req.correlationId,
        success: true,
    });

    // Update lastLogin — non-blocking
    PlatformUser.findByIdAndUpdate(user._id, { lastLogin: new Date() }).catch(() => { });

    return res.json({
        token: accessToken,
        csrfToken,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            type: "platform",   // required by PlatformGuard — never omit
            mustChangePassword: user.mustChangePassword === true,
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
        req.logger.error({ event: "TWO_FA_SETUP_ERROR", error: error.message, stack: error.stack }, "2FA setup error");
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
        req.logger.error({ event: "TWO_FA_COMPLETE_ERROR", error: error.message, stack: error.stack }, "2FA complete setup error");
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
        req.logger.error({ event: "TWO_FA_DISABLE_ERROR", error: error.message, stack: error.stack }, "2FA disable error");
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * 👤 platformProfile — GET /api/platform/auth/profile
 * v20.1 Wave2 — Trusts platformProtect; no manual JWT re-verification.
 */
const platformProfile = async (req, res) => {
    try {
        const user = await PlatformUser.findById(req.platformUser._id).select("-password");
        if (!user || !user.isActive) {
            return res.status(401).json({ message: "Platform user not found or inactive" });
        }
        return res.json({
            success: true,
            user: { id: user._id, name: user.name, email: user.email, role: user.role, type: "platform" }
        });
    } catch (err) {
        return res.status(500).json({ message: "Server error" });
    }
};

/**
 * 🚪 platformLogout — POST /api/platform/auth/logout
 * v20.2 — Revokes refresh token in DB, clears cookie, writes AuditLog.
 */
const platformLogout = async (req, res) => {
    try {
        const rawToken = req.cookies?.platformRefreshToken;

        if (rawToken) {
            const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
            await RefreshToken.updateOne({ tokenHash }, { revoked: true, lastUsedAt: Date.now() });
        }

        const isProd = process.env.NODE_ENV === "production";
        res.clearCookie("platformRefreshToken", {
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? "strict" : "lax",
            path: "/api/platform"
        });

        // v20.2 — Structured pino log + AuditLog record
        req.logger.info({
            event: "LOGOUT",
            userId: req.platformUser?._id,
            ipAddress: req.ip,
            correlationId: req.correlationId,
        }, "Platform logout");

        _auditPlatformAuthEvent({
            actorId: req.platformUser?._id || PLATFORM_SENTINEL_ID,
            actor: req.platformUser,  // v21.0 — for name split
            req,                      // v21.0 — for device/geo
            action: "LOGOUT",
            entity: "PlatformUser",
            entityId: req.platformUser?._id,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
            correlationId: req.correlationId,
            success: true,
        });

        return res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
        req.logger.error({ event: "LOGOUT_ERROR", error: error.message, stack: error.stack }, "Platform logout error");
        return res.status(500).json({ message: "Server error during logout" });
    }
};

/**
 * 🔄 platformRefresh — POST /api/platform/auth/refresh
 * Issues a new access token from the platform refresh cookie.
 */
const platformRefresh = async (req, res) => {
    const TRACE = process.env.AUTH_TRACE === "true";
    try {
        if (TRACE) {
            req.logger.debug({ event: "AUTH_TRACE_REFRESH", cookieKeys: Object.keys(req.cookies || {}), hasPlatformRefreshToken: !!req.cookies?.platformRefreshToken }, "[AUTH_TRACE] Refresh attempt");
        }

        // v13.4 — Read from isolated platform cookie name
        const rawToken = req.cookies.platformRefreshToken;
        if (!rawToken) {
            if (TRACE) req.logger.debug({ event: "AUTH_TRACE_REFRESH_FAIL", reason: "COOKIE_NOT_SENT" }, "[AUTH_TRACE] Refresh fail");
            return res.status(401).json({ message: "No platform refresh token" });
        }

        const tokenHash = require("crypto").createHash("sha256").update(rawToken).digest("hex");
        const refreshDoc = await RefreshToken.findOne({ tokenHash });

        if (TRACE) req.logger.debug({ event: "AUTH_TRACE_REFRESH_DOC", found: !!refreshDoc, revoked: refreshDoc?.revoked, expired: refreshDoc ? refreshDoc.expiresAt < Date.now() : "N/A" }, "[AUTH_TRACE] Refresh doc lookup");

        if (!refreshDoc || refreshDoc.revoked || refreshDoc.expiresAt < Date.now()) {
            if (TRACE) req.logger.debug({ event: "AUTH_TRACE_REFRESH_FAIL", reason: "INVALID_REFRESH_TOKEN" }, "[AUTH_TRACE] Refresh fail");
            return res.status(401).json({ message: "Invalid refresh token" });
        }

        const user = await PlatformUser.findById(refreshDoc.userId);
        if (!user || !user.isActive) {
            if (TRACE) req.logger.debug({ event: "AUTH_TRACE_REFRESH_FAIL", reason: "USER_NOT_FOUND_OR_INACTIVE" }, "[AUTH_TRACE] Refresh fail");
            return res.status(401).json({ message: "Platform user inactive" });
        }

        // Rotate token
        refreshDoc.revoked = true;
        refreshDoc.lastUsedAt = Date.now();
        await refreshDoc.save();

        // v20.2 — Structured pino log + TOKEN_REFRESH audit record
        req.logger.info({
            event: "TOKEN_REFRESH",
            userId: user._id,
            role: user.role,
            ipAddress: req.ip,
            correlationId: req.correlationId,
        }, "Platform token refresh");

        _auditPlatformAuthEvent({
            actorId: user._id,
            actor: user,    // v21.0 — for name split + role snapshot
            req,            // v21.0 — for device/geo extraction
            action: "TOKEN_REFRESH",
            entity: "PlatformUser",
            entityId: user._id,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
            correlationId: req.correlationId,
            success: true,
        });

        return await issueTokens(user, req, res);
    } catch (err) {
        if (process.env.AUTH_TRACE === "true") req.logger.debug({ event: "AUTH_TRACE_REFRESH_EXCEPTION", error: err.message }, "[AUTH_TRACE] Refresh exception");
        req.logger.error({ event: "TOKEN_REFRESH_ERROR", error: err.message, stack: err.stack }, "Platform refresh error");
        return res.status(401).json({ message: "Refresh failed" });
    }
};

module.exports = {
    platformLogin,
    verify2FA,
    setup2FA,
    complete2FASetup,
    disable2FA,
    platformProfile,
    platformRefresh,
    platformLogout
};
