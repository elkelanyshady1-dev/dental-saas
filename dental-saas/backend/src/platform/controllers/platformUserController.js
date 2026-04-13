const PlatformUser = require("../models/PlatformUser").default;
const { resolvePlatformCapabilities } = require("../../services/platformCapabilityResolver");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const emailService = require("../../services/emailService");   // legacy — kept for sendInviteEmail only
const { emitPasswordReset } = require("../../events/email.events");
const { manageCredentialsSchema } = require("../../validators/credentialValidator");
const auditService = require("../../services/auditService");
const organizationService = require("../../shared/services/OrganizationService");
const logger = require("@utils/logger");

// ─── Platform-plane model (lives in platform/saasdental DB) ───────────────────
// AuditLog for platform-user audit queries (actorType: "platform_user")
// stays on platform DB because these are platform-scoped actions.
const AuditLog_Platform = require("@shared/models/AuditLog").default;
// RefreshToken_Platform import removed — not used in this controller

// ─── Per-Org DB Model Resolution (DB_MODE = per-org) ──────────────────────────
// User, Role, RefreshToken, AuditLog for org-domain governance queries
// MUST be resolved via getModel() on the org's DB connection.
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const UserDef = require("@shared/models/User");
const RoleDef = require("@shared/models/Role");
const RefreshTokenDef = require("@shared/models/RefreshToken");
const AuditLogDef = require("@shared/models/AuditLog");

/**
 * getOrgModels — Resolves org-scoped Mongoose models on the per-org DB connection.
 *
 * In per-org mode, User/Role/RefreshToken/AuditLog live in dental_org_<orgId>.
 * This helper creates a connection via dbManager and returns bound models.
 *
 * @param {string} organizationId
 * @returns {{ User, Role, RefreshToken, AuditLog, conn }}
 */
function getOrgModels(organizationId) {
    const conn = dbManager.getConnection(String(organizationId));

    // RLS safety guard: prevent accidental reads from platform DB
    if (conn.name === "saasdental") {
        throw new Error(
            `[platformUserController] RLS VIOLATION: getOrgModels resolved on platform DB ` +
            `for org=${organizationId}. Expected dental_org_${organizationId}.`
        );
    }

    return {
        User: getModel(conn, UserDef),
        Role: getModel(conn, RoleDef),
        RefreshToken: getModel(conn, RefreshTokenDef),
        AuditLog: getModel(conn, AuditLogDef),
        conn,
    };
}

exports.createPlatformUser = async (req, res) => {
    try {
        const { firstName, lastName, name: legacyName, email, role, onboardingMethod = "temp_password" } = req.body;

        // Support both firstName+lastName and legacy single `name` field
        const resolvedName = (firstName && lastName)
            ? `${firstName.trim()} ${lastName.trim()}`
            : (legacyName?.trim() || null);

        if (!resolvedName || !email || !role) {
            return res.status(400).json({ success: false, message: "name (or firstName+lastName), email, and role are required" });
        }

        const existingUser = await PlatformUser.findOne({ email: email.trim().toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "A platform user with this email already exists" });
        }

        let temporaryPassword = null;
        let passwordHash;
        let mustChangePassword = false;
        let inviteToken = null;
        let inviteTokenExpires = null;

        if (onboardingMethod === "invite") {
            // Invite flow: set a locked placeholder password, generate invite token
            const placeholder = crypto.randomBytes(32).toString("hex");
            passwordHash = await bcrypt.hash(placeholder, 12);
            inviteToken = crypto.randomBytes(32).toString("hex");
            inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        } else {
            // Temp password flow
            temporaryPassword = crypto.randomBytes(8).toString("base64url").slice(0, 12);
            passwordHash = await bcrypt.hash(temporaryPassword, 12);
            mustChangePassword = true;
        }

        const newUser = await PlatformUser.create({
            firstName: firstName?.trim() || null,
            lastName: lastName?.trim() || null,
            name: resolvedName,
            email: email.trim().toLowerCase(),
            password: passwordHash,
            role,
            mustChangePassword,
            isActive: onboardingMethod !== "invite",
            ...(inviteToken && {
                inviteToken: crypto.createHash("sha256").update(inviteToken).digest("hex"),
                inviteTokenExpires,
            }),
        });

        // Send invite email (non-blocking)
        if (onboardingMethod === "invite") {
            emailService.sendInviteEmail
                ? emailService.sendInviteEmail(newUser, inviteToken).catch(() => { })
                : null;
        }

        // Non-blocking audit record
        const auditAction = onboardingMethod === "invite" ? "USER_INVITE_SENT" : "PLATFORM_USER_CREATED";
        auditService.createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: req.platformUser?._id,
            actorType: "platform_user",
            action: auditAction,
            entity: "PlatformUser",
            entityId: newUser._id,
            success: true,
            details: { email: newUser.email, role: newUser.role, onboardingMethod },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
            statusCode: 201,
        }).catch(() => { });

        const response = {
            success: true,
            message: onboardingMethod === "invite" ? "Invitation sent successfully" : "Platform user created successfully",
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                isActive: newUser.isActive,
                mustChangePassword,
            },
            onboardingMethod,
        };

        // Only return temp password for temp_password flow
        if (onboardingMethod === "temp_password") {
            response.temporaryPassword = temporaryPassword;
        }

        return res.status(201).json(response);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getPlatformUsers = async (req, res) => {
    try {
        const users = await PlatformUser.find().select("-password");
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Resend Invite ─────────────────────────────────────────────────────────────

/**
 * POST /api/platform/users/:id/resend-invite
 * Guard: platformProtect + MANAGE_PLATFORM_USERS
 * Generates a fresh invite token and re-sends the invitation email.
 */
exports.resendInvite = async (req, res) => {
    try {
        const { id } = req.params;
        const actor = req.platformUser;

        const target = await PlatformUser.findById(id);
        if (!target) return res.status(404).json({ success: false, message: "Platform user not found" });

        // Generate a fresh invite token
        const inviteToken = crypto.randomBytes(32).toString("hex");
        target.inviteToken = crypto.createHash("sha256").update(inviteToken).digest("hex");
        target.inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        await target.save();

        // Send email non-blocking
        if (emailService.sendInviteEmail) {
            emailService.sendInviteEmail(target, inviteToken).catch(() => { });
        }

        auditService.createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: actor._id,
            actorType: "platform_user",
            action: "USER_INVITE_SENT",
            entity: "PlatformUser",
            entityId: target._id,
            success: true,
            details: { targetEmail: target.email, resent: true },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
            statusCode: 200,
        }).catch(() => { });

        return res.json({ success: true, message: "Invitation email resent successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Update Platform User Profile (identity card) ────────────────────────────

/**
 * PATCH /api/platform/users/:id/profile
 * Guard: platformProtect + MANAGE_PLATFORM_USERS
 * Allowed fields: profileImage, phone, whatsapp, jobTitle, department
 */
exports.updatePlatformUserProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, profileImage, phone, whatsapp, jobTitle, department } = req.body;

        const user = await PlatformUser.findById(id);
        if (!user) return res.status(404).json({ success: false, message: "Platform user not found" });

        const updates = {};
        if (firstName !== undefined) updates.firstName = firstName;
        if (lastName !== undefined) updates.lastName = lastName;
        // Sync name from split fields
        if (firstName !== undefined || lastName !== undefined) {
            updates.name = [firstName ?? user.firstName, lastName ?? user.lastName].filter(Boolean).join(" ") || user.name;
        }
        if (profileImage !== undefined) updates.profileImage = profileImage;
        if (phone !== undefined) updates.phone = phone;
        if (whatsapp !== undefined) updates.whatsapp = whatsapp;
        if (jobTitle !== undefined) updates.jobTitle = jobTitle;
        if (department !== undefined) updates.department = department;

        Object.assign(user, updates);
        await user.save();
        const updated = user.toObject();
        // Remove password from returned object
        delete updated.password;

        auditService.createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "USER_PROFILE_UPDATED",
            entity: "PlatformUser",
            entityId: id,
            success: true,
            details: { fields: Object.keys(updates) },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
            statusCode: 200,
        }).catch(() => { });

        return res.json({ success: true, user: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updatePlatformUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, isActive } = req.body;

        const user = await PlatformUser.findById(id);
        if (!user) {
            return res.status(404).json({ message: "Platform user not found" });
        }

        // 🛡️ v1.3.2 - Structural Superadmin Protection
        const isTargetSuperAdmin = user.role === "superadmin";

        // 1. Prevent modification if target is Superadmin (unless just updating name)
        if (isTargetSuperAdmin && (role || isActive !== undefined)) {
            // Self-modification safeguard: Superadmin cannot demote themselves or disable themselves
            if (req.user.id === id) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: "PROTECTED_ACCOUNT",
                        message: "Superadmin cannot modify their own security status or role."
                    }
                });
            }

            // General protection: Cannot demote or suspend a superadmin account
            if ((role && role !== "superadmin") || isActive === false) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: "PROTECTED_ACCOUNT",
                        message: "Superadmin account cannot be demoted or suspended."
                    }
                });
            }
        }

        // 2. Protect against removing the LAST superadmin
        if (isTargetSuperAdmin && (role && role !== "superadmin") || (isActive === false && isTargetSuperAdmin)) {
            const superadminCount = await PlatformUser.countDocuments({ role: "superadmin", isActive: true });
            if (superadminCount <= 1) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: "LAST_SUPERADMIN",
                        message: "Cannot remove or disable the last active superadmin."
                    }
                });
            }
        }

        if (name) user.name = name;
        if (role) user.role = role;
        if (isActive !== undefined) user.isActive = isActive;

        await user.save();

        res.json({
            message: "Platform user updated successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deletePlatformUser = async (req, res) => {
    try {
        const { id } = req.params;
        const actor = req.platformUser;

        await platformUserService.deletePlatformUser({
            targetId: id,
            actor
        });

        res.json({ message: "Platform user deleted successfully" });
    } catch (error) {
        if (error.message === "CANNOT_REMOVE_LAST_SUPERADMIN") {
            return res.status(403).json({
                success: false,
                error: { code: "LAST_SUPERADMIN", message: "Cannot remove the last superadmin." }
            });
        }
        res.status(500).json({ message: error.message });
    }
};

exports.getPlatformUserDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // Security check
        if (req.platformUser.role !== "superadmin" && req.platformUser._id.toString() !== id) {
            return res.status(403).json({ message: "Forbidden: Not authorized to view user details" });
        }

        const user = await PlatformUser.findById(id).select("-password").lean();
        if (!user) {
            return res.status(404).json({ message: "Platform user not found" });
        }

        const auditCount = await AuditLog_Platform.countDocuments({ actorId: id, actorType: "platform_user" });

        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLogin,

            auditCount,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getPlatformUserAuditHistory = async (req, res) => {
    try {
        const { id } = req.params;

        // Security check
        if (req.platformUser.role !== "superadmin" && req.platformUser._id.toString() !== id) {
            return res.status(403).json({ message: "Forbidden: Not authorized to view user details" });
        }

        const logs = await AuditLog_Platform.find({ actorId: id, actorType: "platform_user" })
            .sort({ createdAt: -1 })
            .select("action entity method statusCode success createdAt")
            .limit(100)
            .lean();

        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getMe = async (req, res) => {
    try {
        const user = await PlatformUser.findById(req.user.id).select("-password").lean();
        if (!user) {
            return res.status(404).json({ message: "Platform user not found" });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateMe = async (req, res) => {
    try {
        const { name } = req.body;
        const user = await PlatformUser.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "Platform user not found" });
        }

        if (name) user.name = name;
        await user.save();

        res.json({
            message: "Profile updated successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isActive: user.isActive
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: "currentPassword and newPassword are required" });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: "New password must be at least 8 characters" });
        }

        const user = await PlatformUser.findById(req.user.id).select("+password");
        if (!user) {
            return res.status(404).json({ message: "Platform user not found" });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Incorrect current password" });
        }

        user.password = await bcrypt.hash(newPassword, 12);
        user.mustChangePassword = false; // Clear forced-change flag
        user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate existing sessions
        await user.save();

        res.json({ success: true, message: "Password updated successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.manageCredentials = async (req, res) => {
    try {
        const { userId } = req.params;
        const { mode, password } = manageCredentialsSchema.parse(req.body);
        const actor = req.platformUser;

        // Find user - check PlatformUser first, then User (legacy global for cross-plane lookup)
        let targetUser = await PlatformUser.findById(userId);
        let userModelName = "PlatformUser";

        if (!targetUser) {
            targetUser = await User_Legacy.findById(userId);
            userModelName = "User";
        }

        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // Role-based behavior
        const isSuperAdmin = actor.role === "superadmin";
        const isOpsAdmin = actor.role === "operations_admin";

        if (!isSuperAdmin && !isOpsAdmin) {
            return res.status(403).json({ message: "Forbidden: Insufficient platform permissions" });
        }

        // 🛡️ v1.3.2 - Protect Superadmin targets from non-superadmin actors
        if (userModelName === "PlatformUser" && targetUser.role === "superadmin" && !isSuperAdmin) {
            return res.status(403).json({
                success: false,
                error: {
                    code: "PROTECTED_ACCOUNT",
                    message: "Only a superadmin can manage credentials for another superadmin."
                }
            });
        }

        let auditAction = "";
        let responseMessage = "";
        let responseData = {};

        switch (mode) {
            case "force_logout":
                targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
                auditAction = "PLATFORM_USER_FORCE_LOGOUT";
                responseMessage = "User forced to logout (tokenVersion incremented)";
                break;

            case "set_password":
                if (!isSuperAdmin) return res.status(403).json({ message: "Only superadmin can set password manually" });
                if (!password) return res.status(400).json({ message: "Password is required for set_password mode" });

                targetUser.password = await bcrypt.hash(password, 10);
                targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
                targetUser.mustChangePassword = false;
                auditAction = "PLATFORM_USER_PASSWORD_SET";
                responseMessage = "Password updated manually";
                break;

            case "temporary_password":
                if (!isSuperAdmin) return res.status(403).json({ message: "Only superadmin can generate temporary password" });

                const tempPassword = crypto.randomBytes(6).toString("hex"); // e.g. "a1b2c3d4e5f6"
                targetUser.password = await bcrypt.hash(tempPassword, 10);
                targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
                targetUser.mustChangePassword = true;

                // ✅ Non-blocking: enqueued via Redis → email worker (no blocking SMTP)
                emitPasswordReset({
                    email: targetUser.email,
                    name: targetUser.name,
                    // Abuse PASSWORD_RESET template for temp-password delivery
                    // TODO: add dedicated TEMP_PASSWORD template
                    resetUrl: `${process.env.FRONTEND_URL || ""}/platform/login`,
                    subject: "Your Temporary Password"
                });

                auditAction = "PLATFORM_USER_TEMP_PASSWORD_GENERATED";
                responseMessage = "Temporary password generated and emailed";
                responseData = { tempPassword }; // Optionally return to admin
                break;

            case "send_reset_email":
                const resetToken = crypto.randomBytes(32).toString("hex");
                targetUser.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
                targetUser.passwordResetExpires = Date.now() + 3600000; // 1 hour

                // ✅ Non-blocking: enqueued via Redis → email worker
                emitPasswordReset({
                    email: targetUser.email,
                    name: targetUser.name,
                    resetUrl: `${process.env.FRONTEND_URL || ""}/reset-password?token=${resetToken}`
                });

                auditAction = "PLATFORM_USER_RESET_EMAIL_SENT";
                responseMessage = "Password reset email sent";
                break;

            default:
                return res.status(400).json({ message: "Invalid mode" });
        }

        await targetUser.save();

        const auditService = require("../../services/auditService");
        await auditService.createAuditRecord({
            organizationId: targetUser.organizationId || "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: actor._id,
            actorType: "platform_user",
            action: auditAction,
            entity: userModelName,
            entityId: targetUser._id,
            success: true,
            details: { mode },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
            statusCode: 200
        });

        res.json({
            success: true,
            message: responseMessage,
            ...responseData
        });

    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

/**
 * getPlatformCapabilities
 * Resolves and returns a flat map of capability booleans for the authenticated platform user.
 */
exports.getPlatformCapabilities = async (req, res) => {
    try {
        const platformUser = req.platformUser;

        if (!platformUser) {
            return res.status(401).json({ message: "Platform authentication required" });
        }

        const capabilities = resolvePlatformCapabilities(platformUser);

        res.json({
            role: platformUser.role,
            capabilities
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ============================================================
// 🏛 PLATFORM USERS GOVERNANCE (Phase 2)
// ============================================================

exports.getPlatformGovernanceUsers = async (req, res) => {
    try {
        const users = await PlatformUser.find().select("-password").lean();
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getPlatformUserDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await PlatformUser.findById(id).select("-password").lean();
        if (!user) return res.status(404).json({ message: "Platform user not found" });

        // ── Active sessions: non-revoked, non-expired RefreshTokens ────────────
        const now = new Date();
        // Platform user sessions + audit stay on platform DB
        const rawSessions = await RefreshToken_Platform.find({
            userId: id,
            revoked: false,
            expiresAt: { $gt: now },
        })
            .sort({ lastUsedAt: -1 })
            .limit(20)
            .lean();

        const sessions = rawSessions.map((s) => ({
            sessionId: s._id,
            ipAddress: s.ipAddress || s.createdByIp || null,
            userAgent: s.userAgent || null,
            lastActive: s.lastUsedAt || s.updatedAt,
            createdAt: s.createdAt,
        }));

        // ── Audit: events WHERE this user acted OR was the target ───────────────
        const [asActor, asTarget] = await Promise.all([
            AuditLog_Platform.find({ actorId: id, actorType: "platform_user" })
                .sort({ createdAt: -1 }).limit(50).lean(),
            AuditLog_Platform.find({ entityId: id, entity: "PlatformUser" })
                .sort({ createdAt: -1 }).limit(50).lean(),
        ]);

        // Merge + deduplicate by _id, keep most recent 50
        const seen = new Set();
        const auditLogs = [...asActor, ...asTarget]
            .filter((l) => { const k = l._id.toString(); if (seen.has(k)) return false; seen.add(k); return true; })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 50);

        res.json({ user, auditLogs, sessions });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updatePlatformUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        const actor = req.platformUser;

        const updatedUser = await platformUserService.updatePlatformUserRole({
            targetId: id,
            newRole: role,
            actor
        });

        res.json({ message: "Role updated successfully", user: updatedUser });
    } catch (error) {
        if (error.message === "CANNOT_REMOVE_LAST_SUPERADMIN") {
            return res.status(403).json({
                success: false,
                error: { code: "LAST_SUPERADMIN", message: "Cannot remove or disable the last active superadmin." }
            });
        }
        res.status(500).json({ message: error.message });
    }
};

exports.updatePlatformUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;
        const actor = req.platformUser;

        const updatedUser = await platformUserService.updatePlatformUserStatus({
            targetId: id,
            isActive,
            actor
        });

        res.json({ message: "Status updated successfully", user: updatedUser });
    } catch (error) {
        if (error.message === "CANNOT_REMOVE_LAST_SUPERADMIN") {
            return res.status(403).json({
                success: false,
                error: { code: "LAST_SUPERADMIN", message: "Cannot remove or disable the last active superadmin." }
            });
        }
        res.status(500).json({ message: error.message });
    }
};

exports.forceLogoutPlatformUser = async (req, res) => {
    try {
        const { id } = req.params;
        const actor = req.platformUser;

        const target = await PlatformUser.findById(id);
        if (!target) return res.status(404).json({ message: "User not found" });

        target.tokenVersion = (target.tokenVersion || 0) + 1;
        await target.save();

        await auditService.createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: actor._id,
            actorType: "platform_user",
            action: "PLATFORM_USER_FORCE_LOGOUT",
            entity: "PlatformUser",
            entityId: target._id,
            success: true,
            details: { targetEmail: target.email }
        });

        res.json({ message: "User forced to logout successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.resetPlatformUser2FA = async (req, res) => {
    try {
        const { id } = req.params;
        const actor = req.platformUser;

        const target = await PlatformUser.findById(id);
        if (!target) return res.status(404).json({ message: "User not found" });

        // Hardened Reset Path
        target.twoFactorEnabled = false;
        target.twoFactorSecretEncrypted = undefined;
        target.recoveryCodes = [];
        target.failed2FAAttempts = 0;
        target.tokenVersion = (target.tokenVersion || 0) + 1;

        await target.save();

        await auditService.createAuditRecord({
            organizationId: "000000000000000000000000",
            branchId: "000000000000000000000000",
            actorId: actor._id,
            actorType: "platform_user",
            action: "PLATFORM_USER_2FA_RESET",
            entity: "PlatformUser",
            entityId: target._id,
            success: true,
            details: { targetEmail: target.email }
        });

        res.json({ message: "2FA reset and user logged out successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─── Update Org User Profile (identity card) ─────────────────────────────────

/**
 * PATCH /api/platform/governance/org/:organizationId/:userId/profile
 * Guard: platformProtect + MANAGE_PLATFORM_USERS
 * Per-Org DB: resolves User model on dental_org_<organizationId>
 */
exports.updateOrgUserProfile = async (req, res) => {
    try {
        const { organizationId, userId } = req.params;
        const { firstName, lastName, profileImage, phone, whatsapp, jobTitle, department } = req.body;

        const { User } = getOrgModels(organizationId);
        logger.debug({ db: User.db.name, organizationId }, "[updateOrgUserProfile] DB resolved");

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const updates = {};
        if (firstName !== undefined) updates.firstName = firstName;
        if (lastName !== undefined) updates.lastName = lastName;
        if (firstName !== undefined || lastName !== undefined) {
            updates.name = [firstName ?? user.firstName, lastName ?? user.lastName].filter(Boolean).join(" ") || user.name;
        }
        if (profileImage !== undefined) updates.profileImage = profileImage;
        if (phone !== undefined) updates.phone = phone;
        if (whatsapp !== undefined) updates.whatsapp = whatsapp;
        if (jobTitle !== undefined) updates.jobTitle = jobTitle;
        if (department !== undefined) updates.department = department;

        Object.assign(user, updates);
        await user.save();
        const updated = user.toObject();
        delete updated.password;

        auditService.createAuditRecord({
            organizationId,
            branchId: "000000000000000000000000",
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "USER_PROFILE_UPDATED",
            entity: "User",
            entityId: userId,
            success: true,
            details: { fields: Object.keys(updates) },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
            statusCode: 200,
        }).catch(() => { });

        return res.json({ success: true, user: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ============================================================
// 🏢 ORGANIZATION USERS GOVERNANCE (Phase 2)
// ============================================================

/**
 * GET /governance/org/:organizationId/roles
 * Returns all roles for an organization with their _id and name.
 * If no roles exist, auto-seeds from SSOT and returns the seeded roles.
 * Used by the Add User modal to populate the role dropdown.
 */
exports.getOrganizationRolesGovernance = async (req, res) => {
    try {
        const { organizationId } = req.params;
        const { Role, conn } = getOrgModels(organizationId);
        logger.debug({ db: conn.name, organizationId }, "[getOrgRoles] DB resolved");

        // Per-org DB: no organizationId filter needed — DB isolates tenant
        let roles = await Role.find()
            .select("name isSystemRole _id")
            .sort({ name: 1 })
            .lean();

        // Auto-seed if no roles exist (defensive)
        if (roles.length === 0) {
            logger.warn({ organizationId }, "[getOrgRoles] No roles found — auto-seeding");
            const initializeRoles = require("@utils/roleInitializer");
            await initializeRoles(organizationId, { connection: conn });
            roles = await Role.find()
                .select("name isSystemRole _id")
                .sort({ name: 1 })
                .lean();
        }

        res.json({
            success: true,
            data: roles.map(r => ({
                _id: r._id,
                name: r.name,
                isSystemRole: r.isSystemRole || false,
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getOrganizationUsersGovernance = async (req, res) => {
    try {
        const { organizationId } = req.params;
        const { User, conn } = getOrgModels(organizationId);
        logger.debug({ db: conn.name, organizationId }, "[getOrgUsers] DB resolved");

        // Per-org DB: no organizationId filter — DB isolates tenant
        const users = await User.find().populate("roleId", "name").lean();
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getOrganizationUserDetailGovernance = async (req, res) => {
    try {
        const { organizationId, userId } = req.params;
        const { User, RefreshToken, AuditLog, conn } = getOrgModels(organizationId);
        logger.debug({ db: conn.name, organizationId, userId }, "[getOrgUserDetail] DB resolved");

        // Per-org DB: no organizationId filter — DB isolates tenant
        const user = await User.findById(userId).populate("roleId", "name").lean();
        if (!user) return res.status(404).json({ message: "User not found" });

        // ── Active sessions (org DB) ────────────────────────────────────────────
        const now = new Date();
        const rawSessions = await RefreshToken.find({
            userId,
            revoked: false,
            expiresAt: { $gt: now },
        })
            .sort({ lastUsedAt: -1 })
            .limit(20)
            .lean();

        const sessions = rawSessions.map((s) => ({
            sessionId: s._id,
            ipAddress: s.ipAddress || s.createdByIp || null,
            userAgent: s.userAgent || null,
            lastActive: s.lastUsedAt || s.updatedAt,
            createdAt: s.createdAt,
        }));

        // ── Audit: as actor OR as target (org DB) ───────────────────────────────
        const [asActor, asTarget] = await Promise.all([
            AuditLog.find({ actorId: userId, actorType: "tenant_user" })
                .sort({ createdAt: -1 }).limit(50).lean(),
            AuditLog.find({ entityId: userId })
                .sort({ createdAt: -1 }).limit(50).lean(),
        ]);

        const seen = new Set();
        const auditLogs = [...asActor, ...asTarget]
            .filter((l) => { const k = l._id.toString(); if (seen.has(k)) return false; seen.add(k); return true; })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 50);

        res.json({ user, auditLogs, sessions });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /governance/org/:organizationId/users
// Creates a new organization user from the governance plane.
// Supports invite and temp_password onboarding flows.
// ─────────────────────────────────────────────────────────────────────────────
exports.createOrganizationUserGovernance = async (req, res) => {
    try {
        const { organizationId } = req.params;

        if (!organizationId) {
            return res.status(400).json({ success: false, message: "organizationId is required" });
        }

        const { firstName, lastName, name: legacyName, email, role: roleNameOrId, onboardingMethod = "invite" } = req.body;

        // Resolve display name — support split fields or legacy single field
        const resolvedName = (firstName && lastName)
            ? `${firstName.trim()} ${lastName.trim()}`
            : (legacyName?.trim() || firstName?.trim() || null);

        if (!resolvedName || !email) {
            return res.status(400).json({ success: false, message: "Name and email are required" });
        }

        // Verify org exists (platform DB — correct)
        const Organization = require("@shared/models/Organization").default;
        const org = await Organization.findById(organizationId).lean().catch(() => null);
        if (!org) {
            return res.status(404).json({ success: false, message: "Organization not found" });
        }

        // ── Per-Org DB: resolve models on org connection ──────────────────────
        const { User, Role, conn } = getOrgModels(organizationId);
        logger.debug({ db: conn.name, organizationId }, "[createOrgUser] DB resolved");

        // Resolve role:
        //   1. If roleId is present → find by _id (SAFE — already scoped to org DB)
        //   2. Else if role name string → find by name (case-insensitive)
        //   3. If no roles exist in org → auto-seed from SSOT, then retry
        const roleIdField = req.body.roleId;  // ObjectId — preferred
        const roleNameField = roleNameOrId;     // name string — fallback

        // ── Role seed safety ─────────────────────────────────────────────────
        const roleCount = await Role.countDocuments();
        if (roleCount === 0) {
            logger.warn({ organizationId }, "[createOrgUser] No roles found — auto-seeding from SSOT");
            const initializeRoles = require("@utils/roleInitializer");
            await initializeRoles(organizationId, { connection: conn });
        }

        let roleDoc = null;

        if (roleIdField) {
            // Per-org DB: no organizationId filter needed
            roleDoc = await Role.findById(roleIdField);
        }

        if (!roleDoc && roleNameField) {
            // Fallback: case-insensitive name match
            roleDoc = await Role.findOne({
                name: { $regex: new RegExp(`^${roleNameField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
            });
        }

        if (!roleDoc) {
            const available = await Role.find().select("name _id").lean();
            const roleList = available.map(r => `${r.name} (${r._id})`).join(", ") || "none";
            return res.status(400).json({
                success: false,
                code: "ROLE_NOT_FOUND",
                message: `Role '${roleIdField || roleNameField}' not found in this organization. Available roles: ${roleList}`
            });
        }

        // Duplicate check (per-org DB — no organizationId filter)
        const existing = await User.findOne({ email: email.trim().toLowerCase() });
        if (existing) {
            return res.status(400).json({ success: false, message: "A user with this email already exists in this organization" });
        }

        let temporaryPassword = null;
        let passwordHash;
        let mustChangePassword = false;
        let inviteToken = null;
        let inviteTokenExpires = null;

        if (onboardingMethod === "invite") {
            const placeholder = crypto.randomBytes(32).toString("hex");
            passwordHash = await bcrypt.hash(placeholder, 12);
            inviteToken = crypto.randomBytes(32).toString("hex");
            inviteTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        } else {
            temporaryPassword = crypto.randomBytes(8).toString("base64url").slice(0, 12);
            passwordHash = await bcrypt.hash(temporaryPassword, 12);
            mustChangePassword = true;
        }

        const newUser = await User.create({
            firstName: firstName?.trim() || null,
            lastName: lastName?.trim() || null,
            name: resolvedName,
            email: email.trim().toLowerCase(),
            password: passwordHash,
            roleId: roleDoc._id,
            organizationId,
            isActive: onboardingMethod !== "invite",
            mustChangePassword,
            hasFullBranchAccess: true,
        });

        // Audit (fire-and-forget)
        auditService.createAuditRecord({
            organizationId,
            branchId: "000000000000000000000000",
            actorId: req.platformUser?._id,
            actorType: "platform_user",
            action: onboardingMethod === "invite" ? "USER_INVITE_SENT" : "USER_CREATED",
            entity: "User",
            entityId: newUser._id,
            success: true,
            details: { email: newUser.email, role: roleDoc.name, onboardingMethod },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
        }).catch(() => { });

        const response = {
            success: true,
            message: onboardingMethod === "invite" ? "User invited successfully" : "User created successfully",
            user: {
                id: newUser._id,
                name: newUser.name,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                role: roleDoc.name,
                organizationId,
                isActive: newUser.isActive,
            },
            inviteSent: onboardingMethod === "invite",
        };

        if (onboardingMethod === "temp_password" && temporaryPassword) {
            response.temporaryPassword = temporaryPassword;
        }

        return res.status(201).json(response);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateOrganizationUserStatusGovernance = async (req, res) => {
    try {
        const { organizationId, userId } = req.params;
        const { isActive } = req.body;
        const actor = req.platformUser;

        const { User, RefreshToken, conn } = getOrgModels(organizationId);
        logger.debug({ db: conn.name, organizationId }, "[updateOrgUserStatus] DB resolved");

        // Per-org DB: no organizationId filter — DB isolates tenant
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.isActive = isActive;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        if (isActive === false) {
            await RefreshToken.updateMany({ userId: user._id }, { revoked: true });
        }

        await auditService.createAuditRecord({
            organizationId,
            branchId: "000000000000000000000000",
            actorId: actor._id,
            actorType: "platform_user",
            action: "ORG_USER_SUSPEND",
            entity: "User",
            entityId: user._id,
            success: true,
            details: { isActive }
        });

        res.json({ message: "User status updated successfully", user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateOrganizationUserRoleGovernance = async (req, res) => {
    try {
        const { organizationId, userId } = req.params;
        const { roleId } = req.body;
        const actor = req.platformUser;

        const { User, Role, conn } = getOrgModels(organizationId);
        logger.debug({ db: conn.name, organizationId }, "[updateOrgUserRole] DB resolved");

        // Per-org DB: no organizationId filter — DB isolates tenant
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        const newRole = await Role.findById(roleId);
        if (!newRole) return res.status(400).json({ message: "Invalid role for this organization" });

        const oldRoleId = user.roleId;
        user.roleId = roleId;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        await auditService.createAuditRecord({
            organizationId,
            branchId: "000000000000000000000000",
            actorId: actor._id,
            actorType: "platform_user",
            action: "ORG_USER_ROLE_OVERRIDE",
            entity: "User",
            entityId: user._id,
            success: true,
            details: { oldRoleId, newRoleId: roleId }
        });

        res.json({ message: "User role overridden successfully", user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.forceLogoutOrganizationUser = async (req, res) => {
    try {
        const { organizationId, userId } = req.params;
        const actor = req.platformUser;

        const { User, RefreshToken, conn } = getOrgModels(organizationId);
        logger.debug({ db: conn.name, organizationId }, "[forceLogoutOrgUser] DB resolved");

        // Per-org DB: no organizationId filter — DB isolates tenant
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();
        await RefreshToken.updateMany({ userId: user._id }, { revoked: true });

        await auditService.createAuditRecord({
            organizationId,
            branchId: "000000000000000000000000",
            actorId: actor._id,
            actorType: "platform_user",
            action: "PLATFORM_USER_FORCE_LOGOUT",
            entity: "User",
            entityId: user._id,
            success: true,
            details: { targetEmail: user.email }
        });

        res.json({ message: "Organization user forced to logout successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.resetOrganizationUserPassword = async (req, res) => {
    try {
        const { organizationId, userId } = req.params;
        const actor = req.platformUser;

        const { User, conn } = getOrgModels(organizationId);
        logger.debug({ db: conn.name, organizationId, userId }, "[resetOrgUserPassword] DB resolved");

        // Accept both `mode` and `method` body fields for compatibility:
        // - OrganizationUserDetailPage sends { method: 'email' | 'temp_password' }
        // - OrganizationUsersPage sends {} (no body, defaults to temp_password)
        const rawMode = req.body?.mode || req.body?.method || "temp_password";
        // Normalize: 'email' is an alias for 'reset_link'
        const mode = rawMode === "email" ? "reset_link" : rawMode;

        // Per-org DB: no organizationId filter — DB isolates tenant
        const user = await User.findById(userId);
        if (!user) {
            logger.warn({ userId, organizationId, db: conn.name }, "[resetOrgUserPassword] User not found in org DB");
            return res.status(404).json({ success: false, message: "User not found" });
        }

        let temporaryPassword = null;
        let auditAction;
        let responseMessage;

        if (mode === "temp_password") {
            // ── Temporary password mode ──────────────────────────────────────────
            // Generate a random 12-char base64url password
            temporaryPassword = crypto.randomBytes(8).toString("base64url").slice(0, 12);
            const passwordHash = await bcrypt.hash(temporaryPassword, 12);

            user.password = passwordHash;
            user.mustChangePassword = true;
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            await user.save();

            // ✅ Non-blocking: enqueue via BullMQ email worker (does NOT block the HTTP response)
            // emitPasswordReset is fire-and-forget — request returns immediately
            try {
                emitPasswordReset({
                    email: user.email,
                    name: user.name || user.firstName || user.email,
                    resetUrl: `${process.env.FRONTEND_URL || ""}/login`,
                    subject: "Your Temporary Password"
                });
            } catch (emailErr) {
                // Email failure must never block the HTTP response
                console.warn("[RESET PASSWORD] Email emit failed (non-fatal):", emailErr.message);
            }

            auditAction = "ORG_USER_TEMP_PASSWORD_GENERATED";
            responseMessage = "Temporary password generated successfully";

        } else {
            // ── Reset link mode ──────────────────────────────────────────────────
            const resetToken = crypto.randomBytes(32).toString("hex");
            user.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
            user.passwordResetExpires = Date.now() + 3600000; // 1 hour
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            await user.save();

            // ✅ Non-blocking: enqueue via BullMQ email worker
            try {
                emitPasswordReset({
                    email: user.email,
                    name: user.name || user.firstName || user.email,
                    resetUrl: `${process.env.FRONTEND_URL || ""}/reset-password?token=${resetToken}`
                });
            } catch (emailErr) {
                console.warn("[RESET PASSWORD] Email emit failed (non-fatal):", emailErr.message);
            }

            auditAction = "ORG_USER_PASSWORD_RESET_TRIGGER";
            responseMessage = "Password reset link sent to user email";
        }

        // Audit log — fire-and-forget (never blocks response)
        auditService.createAuditRecord({
            organizationId,
            branchId: "000000000000000000000000",
            actorId: actor._id,
            actorType: "platform_user",
            action: auditAction,
            entity: "User",
            entityId: user._id,
            success: true,
            details: { mode, resetFired: true },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
            statusCode: 200
        }).catch(() => { }); // never block response

        logger.info({ userId: user._id, mode, action: auditAction, db: conn.name }, "[resetOrgUserPassword] Complete");

        // ✅ Guaranteed response — always returns JSON, never hangs
        return res.json({
            success: true,
            message: responseMessage,
            ...(mode === "temp_password" && temporaryPassword ? { temporaryPassword } : {})
        });

    } catch (error) {
        logger.error({ err: error.message }, "[resetOrgUserPassword] Error");
        return res.status(500).json({ success: false, message: error.message || "Server error" });
    }
};
