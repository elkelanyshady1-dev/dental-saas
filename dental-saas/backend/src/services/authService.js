const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { signOrgToken, signPlatformToken } = require("@core/auth/jwtManager");
const PlatformUser = require("@platform/models/PlatformUser").default;
const { assertUserLimit } = require("@core/subscription/planEnforcement");
const logger = require("@utils/logger");

// Phase 5b: Permission resolution at token-gen time (not request time)
const { flattenPermissions } = require("../rbac/permissionRegistry");
const { resolveAuthority } = require("@core/security/authorityBridge");

// Per-org DB resolution — connection-bound model factory
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const UserDef = require("@shared/models/User");
const RefreshTokenDef = require("@shared/models/RefreshToken");
const PasswordResetTokenDef = require("@shared/models/PasswordResetToken");

// v30.0 — Account Lock Constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * _resolveOrgModels(orgId)
 * Returns { User, RefreshToken, PasswordResetToken } bound to the per-org DB.
 * Used by ALL auth functions that touch org-domain data.
 *
 * @param {string|ObjectId} orgId
 * @returns {{ User: Model, RefreshToken: Model, PasswordResetToken: Model, orgConn: Connection }}
 */
function _resolveOrgModels(orgId) {
    const conn = dbManager.getConnection(String(orgId));
    return {
        User: getModel(conn, UserDef),
        RefreshToken: getModel(conn, RefreshTokenDef),
        PasswordResetToken: getModel(conn, PasswordResetTokenDef),
        orgConn: conn,
    };
}

/**
 * @deprecated Use users.service.createUser instead.
 * This function does not handle firstName/lastName separation and uses
 * the stale req.user?.organizationId pattern. Kept for backward compat only.
 * Will be removed in a future cleanup sprint.
 */
exports.registerUser = async (data, organizationId) => {
    const { name, email, password, roleId, branchAccess, hasFullBranchAccess } = data;

    logger.warn(
        { fn: "registerUser", email },
        "[AuthService] registerUser is deprecated — use users.service.createUser"
    );

    if (!organizationId) {
        throw new Error("Registration requires an organization subdomain");
    }

    // v5.0 — Enforce Plan User Limit
    await assertUserLimit(organizationId);

    const { User } = _resolveOrgModels(organizationId);

    // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
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
        platformDesignation: null, // org-level registration — no platform escalation
        organizationId: organizationId,
        branchAccess: branchAccess || [],
        hasFullBranchAccess: hasFullBranchAccess || false,
    });

    return user;
};

const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_SESSIONS_PER_USER = 5;

exports.validateLogin = async ({ email, password, organization, ipAddress, userAgent }) => {
    // Note: organization is now resolved by the controller via clinicCode
    if (!organization) {
        let err = new Error("Invalid credentials");
        err.statusCode = 401;
        throw err;
    }

    const orgId = organization._id;
    const { User, RefreshToken } = _resolveOrgModels(orgId);

    // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
    const user = await User.findOne({
        email: email.trim().toLowerCase(),
        organizationId: orgId,
        isActive: true
    }).select("+password").populate("roleId");

    // PHASE 3 v23.0 SECURITY: Authenticate BEFORE checking subscription state.
    // Previously, subscription check ran first, leaking billing state to
    // unauthenticated attackers. Now: user lookup -> password verify -> subscription check.
    if (!user) {
        logger.warn({ event: "LOGIN_FAILED", email: email.trim().toLowerCase(), reason: "USER_NOT_FOUND", ip: ipAddress }, "[Auth] Login failed: user not found");
        let err = new Error("Invalid credentials");
        err.statusCode = 400;
        throw err;
    }

    // v30.0 — Account Lock Check (before password verify to prevent timing attacks on locked accounts)
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
        const remainingMs = user.accountLockedUntil - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        logger.warn({
            event: "LOGIN_FAILED",
            userId: user._id,
            reason: "ACCOUNT_LOCKED",
            lockedUntil: user.accountLockedUntil,
            ip: ipAddress,
        }, `[Auth] Login rejected: account locked for ${remainingMin} more minutes`);
        let err = new Error(`Account temporarily locked. Try again in ${remainingMin} minutes.`);
        err.statusCode = 423;
        throw err;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        // v30.0 — Increment failed attempts
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
            user.accountLockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
            logger.warn({
                event: "ACCOUNT_LOCKED",
                userId: user._id,
                attempts: user.failedLoginAttempts,
                lockedUntil: user.accountLockedUntil,
                ip: ipAddress,
            }, "[Auth] Account locked after repeated failed login attempts");
        } else {
            logger.warn({
                event: "LOGIN_FAILED",
                userId: user._id,
                reason: "INVALID_PASSWORD",
                attempts: user.failedLoginAttempts,
                ip: ipAddress,
            }, "[Auth] Login failed: invalid password");
        }
        await user.save();
        let err = new Error("Invalid credentials");
        err.statusCode = 400;
        throw err;
    }

    // PHASE 3 ACCESS-001 fix: Use contract-aware classification instead of
    // legacy subscription.status string. classifySubscriptionState reads
    // OrgContract (primary) with fallback to org.subscription (legacy),
    // correctly handling trial, grace period, and active contract states.
    //
    // This check now runs AFTER authentication — subscription state is never
    // exposed to unauthenticated users.
    const { classifySubscriptionState } = require("@middleware/orgSubscriptionGuard");
    const OrgContract = require("@billing/models/OrgContract.model").default;

    let activeContract = null;
    if (organization.currentContractId) {
        // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
        activeContract = await OrgContract.findById(organization.currentContractId).lean();
    }

    const { state: subscriptionState } = classifySubscriptionState(organization, activeContract);

    if (subscriptionState === "expired" || subscriptionState === "unknown") {
        // Generic error message to prevent information leakage about billing state
        let err = new Error("Your account is currently unavailable. Please contact support.");
        err.statusCode = 403;
        throw err;
    }

    // LAYER 2: Access Token (15 minutes)
    if (!organization.regionCode) {
        logger.error({ orgId: organization._id }, "Critical Sovereignty Breach: Organization missing regionCode during login");
        throw new Error("Geopolitical resolution failure: Region not assigned to organization.");
    }

    // v30.0 — Reset lock state and update lastLogin on successful auth
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
    user.lastLogin = new Date();
    await user.save();

    // v30.0 — Generate sessionId for token-session binding
    const sessionId = new mongoose.Types.ObjectId();

    // Phase 5b: Resolve effective permissions at sign time (not request time)
    const rolePerms = flattenPermissions(user.roleId?.permissions);
    const { effectivePermissions } = resolveAuthority({
        orgPermissionSet: rolePerms,
        platformDesignation: user.platformDesignation || null,
        userId: String(user._id),
        organizationId: String(user.organizationId),
    });

    const accessToken = signOrgToken({
        userId: user._id,
        roleId: user.roleId?._id || user.roleId,
        roleName: user.roleId?.name || null,
        organizationId: user.organizationId,
        regionCode: organization.regionCode,
        tokenVersion: user.tokenVersion,
        permissions: Array.from(effectivePermissions),
        sessionId,
    });

    // LAYER 1: Refresh Token Rotation
    const rawRefreshToken = crypto.randomBytes(64).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");

    // Enforce MAX 5 active refresh tokens per user
    // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
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
        regionCode: organization.regionCode,
        sessionId,
        tokenHash,
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
        createdByIp: ipAddress
    });

    // v30.0 — Security event: successful login
    logger.info({
        event: "LOGIN_SUCCESS",
        userId: user._id,
        organizationId: user.organizationId,
        sessionId,
        ip: ipAddress,
    }, "[Auth] Login successful");

    return {
        accessToken,
        refreshToken: rawRefreshToken,
        userProfile: {
            id: user._id,
            name: user.name,
            email: user.email,
            roleId: user.roleId,
            organizationId: user.organizationId,
            branchAccess: user.branchAccess || [],
            hasFullBranchAccess: user.hasFullBranchAccess || false,
            mustChangePassword: user.mustChangePassword,
            // v27.0 — Unified Verification Engine: email verification status
            isEmailVerified: user.isEmailVerified || false,
            accountStatus: (user.isEmailVerified === false) ? "email_unverified" : "active",
            organization: {
                id: organization._id,
                slug: organization.slug,
                features: organization.features,
                country: organization.country
            }
        }
    };
};

exports.refreshToken = async (token, ipAddress, userAgent, organizationId) => {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // BUG-1 FIX: Deterministic O(1) lookup using organizationId.
    // Previously scanned ALL org databases (O(N) DoS vector).
    // Now requires organizationId from the client (sent via request body).
    // Retains global DB fallback for legacy tokens only — NO full scan.

    let refreshDoc = null;
    let orgId = null;
    let User = null;
    let RefreshToken = null;

    // Phase 1: If organizationId provided, go directly to per-org DB (O(1))
    if (organizationId) {
        orgId = String(organizationId);
        try {
            const models = _resolveOrgModels(orgId);
            User = models.User;
            RefreshToken = models.RefreshToken;
            refreshDoc = await RefreshToken.findOne({ tokenHash });
        } catch (err) {
            logger.warn({ orgId, err: err.message }, "[Auth] Per-org DB lookup failed for refresh");
        }
    }

    // Phase 2: Fallback to global DB (backward compat with legacy tokens ONLY)
    // NO full org scan — if not found here either, the token is invalid.
    if (!refreshDoc) {
        const RefreshTokenGlobal = RefreshTokenDef.default;
        refreshDoc = await RefreshTokenGlobal.findOne({ tokenHash });

        if (refreshDoc && refreshDoc.organizationId) {
            orgId = String(refreshDoc.organizationId);
            const models = _resolveOrgModels(orgId);
            User = models.User;
            RefreshToken = models.RefreshToken;

            // Re-fetch from per-org DB to get the canonical document
            const perOrgDoc = await RefreshToken.findOne({ tokenHash });
            if (perOrgDoc) {
                refreshDoc = perOrgDoc;
            }
        }
    }

    // REUSE ATTACK DETECTION HARDENING (v1.1.0 RULE)
    const isExpired = refreshDoc && refreshDoc.expiresAt < Date.now();
    const isRevoked = refreshDoc && refreshDoc.revoked;

    if (!refreshDoc || isRevoked || isExpired) {
        // Treat as attack ONLY if revoked AND replacedByToken is NULL 
        // (meaning it was revoked by logout/expulsion, not rotation)
        if (refreshDoc && isRevoked && refreshDoc.replacedByToken === null) {
            // Revoke ALL refresh tokens for this user as precaution
            if (RefreshToken) {
                // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
                await RefreshToken.updateMany({ userId: refreshDoc.userId }, { revoked: true });
            }

            // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
            const userModel = User || (orgId ? _resolveOrgModels(orgId).User : null);
            const targetUser = userModel
                ? await userModel.findById(refreshDoc.userId)
                : await PlatformUser.findById(refreshDoc.userId);
            if (targetUser) {
                targetUser.tokenVersion += 1;
                await targetUser.save();
                logger.warn({ userId: targetUser._id, ip: ipAddress, userAgent }, "Session high-jacking attempt detected (re-use of revoked token). Global kill-switch triggered.");
            }
        }
        let err = new Error("Invalid refresh token");
        err.statusCode = 401;
        throw err;
    }

    // If we don't have per-org models yet, resolve them now
    if (!User && refreshDoc.organizationId) {
        orgId = String(refreshDoc.organizationId);
        const models = _resolveOrgModels(orgId);
        User = models.User;
        RefreshToken = models.RefreshToken;
    }

    // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
    let user;
    if (User) {
        user = await User.findById(refreshDoc.userId).populate("organizationId").populate("roleId");
    }
    if (!user) {
        user = await PlatformUser.findById(refreshDoc.userId);
    }

    if (!user || !user.isActive || (user.organizationId && !user.organizationId.isActive)) {
        let err = new Error("Account is no longer active");
        err.statusCode = 401;
        throw err;
    }

    // Extract regionCode from refresh token to preserve alignment (v13.1 Rule)
    const regionCode = refreshDoc.regionCode || (user.organizationId ? user.organizationId.regionCode : (user.regionCode || "GLOBAL"));

    if (!regionCode) {
        logger.error({ userId: user._id }, "Refresh failed: Could not determine regionCode for token re-issue");
        throw new Error("Invalid session state: Region context lost.");
    }

    // Generate new access token — route to correct signer by user type
    const isOrgUser = !!user.organizationId;
    let accessToken;

    if (isOrgUser) {
        // Phase 5b: Resolve effective permissions at sign time
        const rolePerms = flattenPermissions(user.roleId?.permissions);
        const { effectivePermissions } = resolveAuthority({
            orgPermissionSet: rolePerms,
            platformDesignation: user.platformDesignation || null,
            userId: String(user._id),
            organizationId: String(user.organizationId._id),
        });

        accessToken = signOrgToken({
            userId: user._id,
            roleId: user.roleId?._id || user.roleId,
            roleName: user.roleId?.name || null,
            organizationId: user.organizationId._id,
            regionCode,
            tokenVersion: user.tokenVersion,
            permissions: Array.from(effectivePermissions),
            sessionId: refreshDoc.sessionId || undefined,
        });
    } else {
        accessToken = signPlatformToken({
            id: user._id,
            role: user.role,
            regionCode,
            tokenVersion: user.tokenVersion,
        });
    }

    const newRawRefreshToken = crypto.randomBytes(64).toString("hex");
    const newHash = crypto.createHash("sha256").update(newRawRefreshToken).digest("hex");

    // Revoke old and link to new
    refreshDoc.revoked = true;
    refreshDoc.replacedByToken = newHash;
    refreshDoc.lastUsedAt = Date.now();

    // v13.1 Rollout: Populate missing regionCode in old docs on use
    if (!refreshDoc.regionCode) {
        refreshDoc.regionCode = regionCode;
    }

    await refreshDoc.save();

    const TargetRefreshToken = RefreshToken || RefreshTokenGlobal;
    await TargetRefreshToken.create({
        userId: user._id,
        organizationId: user.organizationId ? user.organizationId._id : undefined,
        regionCode,
        sessionId: refreshDoc.sessionId || undefined,
        tokenHash: newHash,
        userAgent,
        ipAddress,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
        createdByIp: ipAddress
    });

    // v30.0 — Security event logging
    logger.info({
        event: "TOKEN_REFRESH",
        userId: user._id,
        sessionId: refreshDoc.sessionId,
        ip: ipAddress,
    }, "[Auth] Token refreshed");

    return {
        accessToken,
        refreshToken: newRawRefreshToken
    };
};

exports.revokeRefreshToken = async (token, userId, organizationId) => {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // BUG-3 FIX: Deterministic O(1) lookup using organizationId.
    // Previously scanned ALL org databases on logout.
    let refreshDoc = null;

    // Phase 1: If organizationId provided, go directly to per-org DB (O(1))
    if (organizationId) {
        try {
            const { RefreshToken } = _resolveOrgModels(organizationId);
            refreshDoc = await RefreshToken.findOne({ tokenHash });
        } catch (err) {
            logger.warn({ organizationId, err: err.message }, "[Auth] Per-org DB lookup failed for logout");
        }
    }

    // Phase 2: Fallback to global DB (backward compat) — NO full scan
    if (!refreshDoc) {
        const RefreshTokenGlobal = RefreshTokenDef.default;
        refreshDoc = await RefreshTokenGlobal.findOne({ tokenHash });

        // If found in global and has orgId, re-fetch from per-org DB
        if (refreshDoc && refreshDoc.organizationId) {
            try {
                const { RefreshToken } = _resolveOrgModels(refreshDoc.organizationId);
                const perOrgDoc = await RefreshToken.findOne({ tokenHash });
                if (perOrgDoc) refreshDoc = perOrgDoc;
            } catch {
                // Use global doc as fallback
            }
        }
    }

    if (refreshDoc) {
        refreshDoc.revoked = true;
        await refreshDoc.save();

        // v30.0 — Security event logging
        logger.info({
            event: "LOGOUT",
            userId: refreshDoc.userId,
            sessionId: refreshDoc.sessionId,
        }, "[Auth] Session revoked (logout)");
    }
};

exports.changePassword = async (userId, currentPassword, newPassword, ipAddress, orgId) => {
    if (!currentPassword || !newPassword) {
        let err = new Error("Current and new password are required");
        err.statusCode = 400;
        throw err;
    }

    // Resolve per-org models. orgId is passed from the controller (from req.organizationId)
    if (!orgId) {
        throw new Error("[changePassword] orgId is required for per-org model resolution");
    }

    const { User, RefreshToken } = _resolveOrgModels(orgId);

    // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
    const user = await User.findOne({ _id: userId, isActive: true }).select("+password").populate("roleId");

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
    // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
    await RefreshToken.updateMany({ userId: user._id }, { revoked: true });

    // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
    const Organization = require("@shared/models/Organization").default;
    const userRegion = user.regionCode || (user.organizationId ? (await Organization.findById(user.organizationId)).regionCode : "GLOBAL");

    // Phase 5b: Resolve effective permissions at sign time
    const rolePerms = flattenPermissions(user.roleId?.permissions);
    const { effectivePermissions } = resolveAuthority({
        orgPermissionSet: rolePerms,
        platformDesignation: user.platformDesignation || null,
        userId: String(user._id),
        organizationId: String(user.organizationId),
    });

    // Generate new token pair
    const accessToken = signOrgToken({
        userId: user._id,
        roleId: user.roleId?._id || user.roleId,
        roleName: user.roleId?.name || null,
        organizationId: user.organizationId,
        regionCode: userRegion,
        tokenVersion: user.tokenVersion,
        permissions: Array.from(effectivePermissions),
    });

    const rawRefreshToken = crypto.randomBytes(64).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");

    await RefreshToken.create({
        userId: user._id,
        organizationId: user.organizationId,
        regionCode: userRegion,
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

    const Organization = require("@shared/models/Organization").default;
    // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
    const organization = await Organization.findOne({ slug: clinicCode.toLowerCase().trim() });

    if (!organization) return; // Silent return for security

    const orgId = organization._id;
    const { User, PasswordResetToken } = _resolveOrgModels(orgId);

    // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
    const user = await User.findOne({
        email: email.toLowerCase().trim(),
        organizationId: orgId,
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

// ─── Phase 11: Smart Multi-Org Login ──────────────────────────────────────────
//
// These two functions implement the smart login flow:
//
//   smartLogin(email, password)
//     1. Find ALL User documents with that email in the GLOBAL DB (not per-org).
//     2. Validate password against each candidate.
//     3. If exactly 1 valid user → issue JWT immediately (SINGLE_ORG).
//     4. If >1 valid users → return org list for user to choose (MULTI_ORG).
//
//   selectOrg(email, password, organizationId)
//     1. Re-validate password (NEVER trust organizationId alone from frontend).
//     2. Issue a JWT scoped to the selected organization.
//
// Security invariants:
//   - organizationId is ALWAYS resolved from the DB record, never from the client body.
//   - Password is checked on BOTH steps (no time-of-check / time-of-use gap).
//   - JWT regionCode comes from the Organization document (sovereignty requirement).
//   - Inactive users and locked accounts are excluded from results.
//
// PLANE: Org — global DB lookup, then per-org DB for token issuance.

const OrganizationModelDef = require("@shared/models/Organization");
const Organization = OrganizationModelDef.default;

/**
 * Build a full org access token for a given user + org document.
 * Resolves permissions via authority bridge (same path as validateLogin).
 *
 * @param {Object} user   — lean User document (with roleId populated)
 * @param {Object} org    — lean Organization document
 * @returns {string} signed JWT
 */
async function _buildOrgToken(user, org) {
    if (!org.regionCode) {
        throw Object.assign(
            new Error("Geopolitical resolution failure: Organization has no regionCode."),
            { statusCode: 500 }
        );
    }

    // Resolve effective permissions from authority bridge (Phase 5b)
    const rolePerms = flattenPermissions(user.roleId?.permissions);
    const { effectivePermissions } = resolveAuthority({
        orgPermissionSet: rolePerms,
        platformDesignation: user.platformDesignation || null,
        userId: String(user._id),
        organizationId: String(user.organizationId),
    });

    return signOrgToken({
        userId: user._id,
        roleId: user.roleId?._id || user.roleId,
        roleName: user.roleId?.name || null,
        organizationId: user.organizationId,
        regionCode: org.regionCode,
        tokenVersion: user.tokenVersion,
        permissions: Array.from(effectivePermissions),
    });
}

/**
 * _buildOrgSession — Build a complete auth session (access token + refresh token).
 * Used by smartLogin and selectOrg to mirror the full validateLogin flow.
 *
 * Generates a sessionId, enforces MAX_SESSIONS_PER_USER, creates the RefreshToken
 * document in the per-org DB, and returns both tokens.
 *
 * @param {Object} user            — lean User document (with roleId populated)
 * @param {Object} org             — full Organization document (must have regionCode)
 * @param {{ ipAddress: string, userAgent: string }} meta — request context
 * @returns {{ accessToken: string, refreshToken: string }}
 */
async function _buildOrgSession(user, org, { ipAddress, userAgent } = {}) {
    if (!org.regionCode) {
        throw Object.assign(
            new Error("Geopolitical resolution failure: Organization has no regionCode."),
            { statusCode: 500 }
        );
    }

    // Resolve effective permissions (Phase 5b — identical to validateLogin)
    const rolePerms = flattenPermissions(user.roleId?.permissions);
    const { effectivePermissions } = resolveAuthority({
        orgPermissionSet: rolePerms,
        platformDesignation: user.platformDesignation || null,
        userId: String(user._id),
        organizationId: String(user.organizationId),
    });

    const sessionId = new mongoose.Types.ObjectId();

    const accessToken = signOrgToken({
        userId: user._id,
        roleId: user.roleId?._id || user.roleId,
        roleName: user.roleId?.name || null,
        organizationId: user.organizationId,
        regionCode: org.regionCode,
        tokenVersion: user.tokenVersion,
        permissions: Array.from(effectivePermissions),
        sessionId,
    });

    // Refresh token generation — identical flow to validateLogin
    const rawRefreshToken = crypto.randomBytes(64).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");

    const { RefreshToken } = _resolveOrgModels(String(user.organizationId));

    // Enforce MAX 5 active sessions per user (evict oldest)
    // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
    const activeTokens = await RefreshToken.find({
        userId: user._id,
        revoked: false,
        expiresAt: { $gt: Date.now() },
    }).sort({ createdAt: 1 });

    if (activeTokens.length >= MAX_SESSIONS_PER_USER) {
        const oldest = activeTokens[0];
        oldest.revoked = true;
        await oldest.save();
    }

    await RefreshToken.create({
        userId: user._id,
        organizationId: user.organizationId,
        regionCode: org.regionCode,
        sessionId,
        tokenHash,
        userAgent: userAgent || "unknown",
        ipAddress: ipAddress || "unknown",
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
        createdByIp: ipAddress || "unknown",
    });

    return { accessToken, refreshToken: rawRefreshToken };
}

/**
 * Smart login — email + password only.
 * Returns SINGLE_ORG with full session, or MULTI_ORG with org list.
 *
 * ARCHITECTURE FIX: Users live in per-org databases, NOT the shared global DB.
 * Strategy:
 *   1. Query Organization (shared DB) to find orgs that COULD have this email.
 *      We can't query users globally, but org records are in the shared DB.
 *      We use a targeted per-org User lookup for each candidate org.
 *   2. Fan-out: parallel lookup across all orgs from the active connection cache.
 *      This is bounded by MAX_CONNECTIONS (100) and is O(N) where N = active orgs.
 *   3. Password-validate each candidate found.
 *
 * @param {{ email: string, password: string, ipAddress: string, userAgent: string }} params
 * @returns {{ type: "SINGLE_ORG", accessToken, refreshToken } | { type: "MULTI_ORG", orgs[] }}
 */
exports.smartLogin = async ({ email, password, ipAddress, userAgent }) => {
    if (!email || !password) {
        throw Object.assign(new Error("Email and password are required"), { statusCode: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // ── Step 1: Find candidate orgs via the shared Organization collection ──
    // Organization records live in the shared (global) DB — this lookup IS valid.
    // We search for orgs that are active. We'll then check each one's per-org DB.
    //
    // @rls-auth-flow — cross-org org lookup, pre-authentication (no JWT context)
    const candidateOrgs = await Organization.find({
        isActive: true,
        isArchived: false,
    }).select("_id regionCode name slug logoUrl organizationSettings").lean();

    if (!candidateOrgs.length) {
        throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
    }

    // ── Step 2: Fan-out — query each org's per-org DB for a user with this email ──
    // Parallel with Promise.allSettled to tolerate individual org DB failures.
    // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
    const lookupResults = await Promise.allSettled(
        candidateOrgs.map(async (org) => {
            const { User } = _resolveOrgModels(String(org._id));
            const user = await User.findOne({
                email: normalizedEmail,
                isActive: true,
                deletedAt: null,
            })
                .select("+password")
                .populate("roleId")
                .lean();
            return user ? { user, org } : null;
        })
    );

    // Collect fulfilled non-null results (user found in that org)
    const candidates = lookupResults
        .filter(r => r.status === "fulfilled" && r.value !== null)
        .map(r => r.value);

    if (!candidates.length) {
        throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
    }

    // ── Step 3: Validate password against each candidate ──
    const validUsers = [];
    for (const { user, org } of candidates) {
        // Skip locked accounts silently
        if (user.accountLockedUntil && user.accountLockedUntil > new Date()) continue;
        const isValid = await bcrypt.compare(password, user.password || "");
        if (isValid) validUsers.push({ user, org });
    }

    if (!validUsers.length) {
        throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
    }

    // Step 4a: Single org — issue full session (access token + refresh token)
    if (validUsers.length === 1) {
        const { user, org } = validUsers[0];
        const { accessToken, refreshToken } = await _buildOrgSession(user, org, { ipAddress, userAgent });

        logger.info({
            event: "SMART_LOGIN_SINGLE",
            userId: user._id,
            organizationId: user.organizationId,
        }, "[SmartLogin] Single-org user authenticated");

        return { type: "SINGLE_ORG", accessToken, refreshToken };
    }

    // Step 4b: Multiple valid orgs — return org selection list
    logger.info({
        event: "SMART_LOGIN_MULTI",
        email: normalizedEmail,
        orgCount: validUsers.length,
    }, "[SmartLogin] Multi-org user — returning org selector");

    return {
        type: "MULTI_ORG",
        orgs: validUsers.map(({ user, org }) => ({
            organizationId: String(user.organizationId),
            name: org.name,
            slug: org.slug,
            logoUrl: org.logoUrl || null,
            primaryColor: org.organizationSettings?.branding?.primaryColor || null,
        })),
    };
};

/**
 * Select org — called after MULTI_ORG to finalise login.
 * Re-validates password for security (no TOCTOU gap).
 *
 * @param {{ email: string, password: string, organizationId: string }} params
 * @returns {{ token: string }}
 */
exports.selectOrg = async ({ email, password, organizationId, ipAddress, userAgent }) => {
    if (!email || !password || !organizationId) {
        throw Object.assign(new Error("email, password and organizationId are required"), { statusCode: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const GlobalUser = UserDef.default;

    // Step 1: Find user record for this specific email+org combination.
    // organizationId from body is used ONLY as a DB query filter — never trusted for auth decisions.
    // @rls-auth-flow — cross-org credential lookup, pre-authentication
    const user = await GlobalUser.findOne({
        email: normalizedEmail,
        organizationId,
        isActive: true,
        deletedAt: null,
    })
        .select("+password")
        .populate("roleId")
        .lean();

    if (!user) {
        throw Object.assign(new Error("Invalid organization selection"), { statusCode: 401 });
    }

    // Step 2: Re-validate password (mandatory — prevents session fixation)
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
        const remainingMin = Math.ceil((user.accountLockedUntil - Date.now()) / 60000);
        throw Object.assign(
            new Error(`Account temporarily locked. Try again in ${remainingMin} minutes.`),
            { statusCode: 423 }
        );
    }

    const isValid = await bcrypt.compare(password, user.password || "");
    if (!isValid) {
        throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
    }

    // Step 3: Fetch org (must be active)
    // @rls-auth-flow — cross-org org lookup, pre-authentication
    const org = await Organization.findOne({
        _id: organizationId,
        isActive: true,
        isArchived: false,
    }).lean();

    if (!org) {
        throw Object.assign(new Error("Organization is no longer active"), { statusCode: 403 });
    }

    // Step 4: Issue full session (access token + refresh token)
    const { accessToken, refreshToken } = await _buildOrgSession(user, org, { ipAddress, userAgent });

    logger.info({
        event: "SMART_LOGIN_SELECT_ORG",
        userId: user._id,
        organizationId,
    }, "[SmartLogin] Org selected — full session issued");

    return { accessToken, refreshToken };
};

exports.resetPassword = async (token, newPassword, organizationId) => {
    if (!token || !newPassword) {
        let err = new Error("Token and new password are required");
        err.statusCode = 400;
        throw err;
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // BUG-2 FIX: Deterministic O(1) lookup using organizationId.
    // Previously scanned ALL org databases for password reset tokens.
    const PasswordResetTokenGlobal = PasswordResetTokenDef.default;
    let tokenDoc = null;
    let resolvedOrgId = null;

    // Phase 1: If organizationId provided, go directly to per-org DB (O(1))
    if (organizationId) {
        try {
            const { PasswordResetToken: OrgPRT } = _resolveOrgModels(organizationId);
            tokenDoc = await OrgPRT.findOne({
                token: hashedToken,
                isUsed: false,
                expiresAt: { $gt: Date.now() }
            });
            if (tokenDoc) resolvedOrgId = String(organizationId);
        } catch (err) {
            logger.warn({ organizationId, err: err.message }, "[Auth] Per-org DB lookup failed for password reset");
        }
    }

    // Phase 2: Fallback to global DB (backward compat) — NO full scan
    if (!tokenDoc) {
        // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
        tokenDoc = await PasswordResetTokenGlobal.findOne({
            token: hashedToken,
            isUsed: false,
            expiresAt: { $gt: Date.now() }
        });
    }

    if (!tokenDoc) {
        let err = new Error("Token is invalid or has expired");
        err.statusCode = 400;
        throw err;
    }

    // Resolve User from the correct per-org DB
    let user;
    if (resolvedOrgId) {
        // Token was found in a per-org DB — resolve user from same DB
        const { User: OrgUser } = _resolveOrgModels(resolvedOrgId);
        user = await OrgUser.findById(tokenDoc.userId);
    } else {
        // Token was found in global DB — try to find user and re-resolve
        const UserGlobal = UserDef.default;
        // @rls-auth-flow — cross-org credential lookup, pre-authentication (no JWT context)
        user = await UserGlobal.findById(tokenDoc.userId);

        // If user has organizationId, re-fetch from per-org DB for correct save
        if (user && user.organizationId) {
            const { User: OrgUser } = _resolveOrgModels(user.organizationId);
            const orgUser = await OrgUser.findById(tokenDoc.userId);
            if (orgUser) user = orgUser;
        }
    }

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
