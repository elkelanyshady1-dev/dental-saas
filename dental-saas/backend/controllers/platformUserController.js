const PlatformUser = require("../models/PlatformUser");
const AuditLog = require("../models/AuditLog");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const emailService = require("../services/emailService");
const { manageCredentialsSchema } = require("../validators/credentialValidator");
const User = require("../models/User");

exports.createPlatformUser = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        const existingUser = await PlatformUser.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Platform user with this email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await PlatformUser.create({
            name,
            email,
            password: hashedPassword,
            role,
        });

        res.status(201).json({
            message: "Platform user created successfully",
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                isActive: newUser.isActive
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
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

        const user = await PlatformUser.findById(id);
        if (!user) {
            return res.status(404).json({ message: "Platform user not found" });
        }

        // 🛡️ v1.3.2 - structural protection
        if (user.role === "superadmin") {
            const superadminCount = await PlatformUser.countDocuments({ role: "superadmin" });
            if (superadminCount <= 1) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: "LAST_SUPERADMIN",
                        message: "Cannot remove the last superadmin."
                    }
                });
            }

            return res.status(403).json({
                success: false,
                error: {
                    code: "PROTECTED_ACCOUNT",
                    message: "Superadmin account cannot be deleted."
                }
            });
        }

        await PlatformUser.findByIdAndDelete(id);

        res.json({ message: "Platform user deleted successfully" });
    } catch (error) {
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

        const auditCount = await AuditLog.countDocuments({ actorId: id, actorType: "platform_user" });

        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            createdAt: user.createdAt,
            lastLoginAt: user.updatedAt,
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

        const logs = await AuditLog.find({ actorId: id, actorType: "platform_user" })
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

        const user = await PlatformUser.findById(req.user.id).select("+password");
        if (!user) {
            return res.status(404).json({ message: "Platform user not found" });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Incorrect current password" });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ message: "Password updated successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.manageCredentials = async (req, res) => {
    try {
        const { userId } = req.params;
        const { mode, password } = manageCredentialsSchema.parse(req.body);
        const actor = req.platformUser;

        // Find user - check PlatformUser first, then User
        let targetUser = await PlatformUser.findById(userId);
        let userModelName = "PlatformUser";

        if (!targetUser) {
            targetUser = await User.findById(userId);
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

                await emailService.sendTemporaryPasswordEmail(targetUser, tempPassword);

                auditAction = "PLATFORM_USER_TEMP_PASSWORD_GENERATED";
                responseMessage = "Temporary password generated and emailed";
                responseData = { tempPassword }; // Optionally return to admin
                break;

            case "send_reset_email":
                const resetToken = crypto.randomBytes(32).toString("hex");
                targetUser.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
                targetUser.passwordResetExpires = Date.now() + 3600000; // 1 hour

                await emailService.sendResetLinkEmail(targetUser, resetToken);

                auditAction = "PLATFORM_USER_RESET_EMAIL_SENT";
                responseMessage = "Password reset email sent";
                break;

            default:
                return res.status(400).json({ message: "Invalid mode" });
        }

        await targetUser.save();

        await AuditLog.create({
            actorId: actor._id,
            actorType: "platform_user",
            action: auditAction,
            entity: userModelName,
            entityId: targetUser._id,
            success: true,
            details: { mode }
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
