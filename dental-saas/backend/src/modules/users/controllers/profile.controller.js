/**
 * profileController.js — Profile Completion Controller
 * Phase 3.1 — Profile Completion System
 *
 * Handles PATCH /org/users/me/complete-profile
 * Allows org staff to complete their profile on first login.
 *
 * Auth: orgProtect (applied in route)
 * RBAC: AUTH_ONLY — any authenticated org user can complete their own profile
 *
 * PLANE: Org only.
 */

"use strict";

const asyncHandler = require("@utils/asyncHandler");
const getModel = require("@core/db/getModel");
const UserDef = require("@shared/models/User");
const logger = require("@utils/logger");

/**
 * PATCH /org/users/me/complete-profile
 * Complete the authenticated user's profile.
 * Sets profile.isComplete = true on success.
 */
exports.completeProfile = asyncHandler(async (req, res) => {
    const userId = req.user?._id || req.user?.id;
    const organizationId = req.context.organizationId;

    if (!userId) {
        return res.status(401).json({
            success: false,
            error: { code: "UNAUTHENTICATED", message: "Not authenticated" },
        });
    }

    const { firstName, lastName, phone, speciality, jobTitle } = req.body;

    // Require at minimum a first name
    if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
        return res.status(400).json({
            success: false,
            error: { code: "VALIDATION_ERROR", message: "firstName is required" },
        });
    }
    if (!lastName || typeof lastName !== "string" || !lastName.trim()) {
        return res.status(400).json({
            success: false,
            error: { code: "VALIDATION_ERROR", message: "lastName is required" },
        });
    }

    const User = getModel(req.dbConnection, UserDef);

    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).json({
            success: false,
            error: { code: "USER_NOT_FOUND", message: "User not found" },
        });
    }

    // Apply updates
    user.firstName = firstName.trim();
    user.lastName = lastName.trim();
    user.name = `${user.firstName} ${user.lastName}`;

    if (phone !== undefined) user.phone = phone || null;
    if (speciality !== undefined) user.speciality = speciality || null;
    if (jobTitle !== undefined) user.jobTitle = jobTitle || null;

    // Mark profile complete
    user.profile = {
        isComplete: true,
        completedAt: new Date(),
    };

    await user.save();

    logger.info({
        event: "PROFILE_COMPLETED",
        userId: user._id,
        organizationId,
    }, "[ProfileController] Profile completed");

    const userObj = user.toObject();
    delete userObj.password;

    return res.json({
        success: true,
        data: userObj,
        message: "Profile completed successfully",
    });
});

/**
 * GET /org/users/me
 * Get the authenticated user's own profile.
 */
exports.getMyProfile = asyncHandler(async (req, res) => {
    const userId = req.user?._id || req.user?.id;
    const User = getModel(req.dbConnection, UserDef);

    const user = await User.findById(userId)
        .select("-password")
        .populate("roleId", "name permissions isSystemRole")
        .populate("branchAccess", "name isActive")
        .lean();

    if (!user) {
        return res.status(404).json({
            success: false,
            error: { code: "USER_NOT_FOUND", message: "User not found" },
        });
    }

    return res.json({ success: true, data: user });
});

/**
 * PATCH /org/users/me
 * Self-service profile update for any authenticated org user.
 *
 * ALLOWED fields (non-admin safe):
 *   firstName, lastName, phone, realEmail, profileImage, jobTitle
 *
 * LOCKED fields (backend enforces):
 *   email (system email), roleId, permissions, organizationId, isActive
 */
exports.updateMyProfile = asyncHandler(async (req, res) => {
    const userId = req.user?._id || req.user?.id;
    const User = getModel(req.dbConnection, UserDef);

    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).json({
            success: false,
            error: { code: "USER_NOT_FOUND", message: "User not found" },
        });
    }

    // ALLOWLIST — only these fields can be self-updated
    const ALLOWED = ["firstName", "lastName", "phone", "realEmail", "profileImage", "jobTitle"];
    const updates = {};
    for (const field of ALLOWED) {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    }

    if (updates.firstName !== undefined) {
        if (!updates.firstName.trim()) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "firstName cannot be empty" },
            });
        }
        user.firstName = updates.firstName.trim();
    }
    if (updates.lastName !== undefined) user.lastName = updates.lastName?.trim() || "";
    if (updates.firstName !== undefined || updates.lastName !== undefined) {
        user.name = `${user.firstName} ${user.lastName}`.trim();
    }
    if (updates.phone     !== undefined) user.phone        = updates.phone     || null;
    if (updates.realEmail !== undefined) user.realEmail    = updates.realEmail || null;
    if (updates.jobTitle  !== undefined) user.jobTitle     = updates.jobTitle  || null;
    if (updates.profileImage !== undefined) user.profileImage = updates.profileImage || null;

    await user.save();

    logger.info({
        event: "PROFILE_SELF_UPDATED",
        userId: user._id,
        fieldsChanged: Object.keys(updates),
    }, "[ProfileController] User self-updated profile");

    const userObj = user.toObject();
    delete userObj.password;

    return res.json({
        success: true,
        data: userObj,
        message: "Profile updated successfully",
    });
});
