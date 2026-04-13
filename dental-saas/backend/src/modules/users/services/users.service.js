/**
 * users.service.js — User Management Service
 * Phase 1 — Organization Access Layer
 * Phase F.1 — RLS Activation (secureModel migration)
 *
 * All queries are scoped by organizationId via secureModel.
 * Users cannot access other organizations' data.
 *
 * PLANE: Org only. Do NOT import in platform-plane contexts.
 */

"use strict";

const bcrypt = require("bcryptjs");
const UserDef = require("../../../shared/models/User");
const RoleDef = require("../../../shared/models/Role");
const BranchDef = require("../../../shared/models/Branch");
const getModel = require("../../../core/db/getModel");
const { assertUserLimit } = require("../../../core/subscription/planEnforcement");
const orgUsageService = require("@core/usage/orgUsage.service");
const logger = require("@utils/logger");
const Organization = require("../../../shared/models/Organization").default;

const BCRYPT_ROUNDS = 10;

// ── Email Provisioning Helpers ─────────────────────────────────────────────────

/**
 * Fetch the org slug from the platform Organization document.
 * Required to generate system emails for staff provisioning.
 * @param {ObjectId|string} organizationId
 * @returns {Promise<string>} slug (e.g. "smilecare")
 */
async function fetchOrgSlug(organizationId) {
    const org = await Organization.findById(organizationId).select("slug").lean();
    if (!org || !org.slug) {
        throw Object.assign(
            new Error("Organization slug not configured — cannot generate staff email"),
            { statusCode: 500, errorCode: "ORG_SLUG_MISSING" }
        );
    }
    return org.slug;
}

/**
 * Build a candidate org-email from a username and orgSlug.
 * Sanitizes to lowercase alphanumeric + hyphens/dots only.
 * @param {string} username  e.g. "aya.ahmed"
 * @param {string} orgSlug   e.g. "smilecare"
 * @returns {string}         e.g. "aya.ahmed@smilecare.clinic"
 */
function generateOrgEmail(username, orgSlug) {
    const safe = username.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9.-]/g, "");
    return `${safe}@${orgSlug.toLowerCase()}.clinic`;
}

/**
 * PHASE 3 — Smart auto-increment username uniqueness.
 *
 * Tries username → username2 → username3 … until an unused email is found.
 * This avoids surfacing duplicate errors to the admin; the email preview in
 * the frontend is updated after creation if a suffix was added.
 *
 * Security: MAX_ATTEMPTS prevents infinite loops (e.g. all 1-99 taken).
 *
 * @param {Model}  UserModel  - Mongoose User model bound to org DB
 * @param {string} baseUsername - e.g. "aya.ahmed"
 * @param {string} orgSlug      - e.g. "smilecare"
 * @returns {Promise<{email: string, username: string}>}
 */
async function resolveUniqueOrgEmail(UserModel, baseUsername, orgSlug) {
    const MAX_ATTEMPTS = 99;

    for (let counter = 0; counter <= MAX_ATTEMPTS; counter++) {
        const username = counter === 0 ? baseUsername : `${baseUsername}${counter + 1}`;
        const email = generateOrgEmail(username, orgSlug);

        // Fast existence check — covered by unique index (uses index scan)
        const exists = await UserModel.exists({ email });
        if (!exists) {
            return { email, username };
        }
    }

    // Exhausted — extremely rare (100 users with exact same name)
    const err = new Error(
        `Cannot generate a unique username for "${baseUsername}" in this organization — ` +
        "too many users share this name. Please use a distinguishing middle name or initial."
    );
    err.statusCode = 409;
    err.errorCode = "EMAIL_ALREADY_EXISTS_IN_ORG";
    throw err;
}

/**
 * PHASE 2 — Explicit pre-check (used by check-username endpoint).
 * Returns true if the email is already taken.
 */
async function isOrgEmailTaken(UserModel, email) {
    return !!(await UserModel.exists({ email }));
}

// Per-request model resolution — binds to org DB
function _getModels(req) {
    const conn = req.dbConnection;
    return {
        User: getModel(conn, UserDef),
        Role: getModel(conn, RoleDef),
        Branch: getModel(conn, BranchDef),
    };
}

/**
 * Create a new staff user within the organization.
 *
 * Email is always system-generated: {firstName}.{lastName}@{orgSlug}.clinic
 * No email field accepted from client — enforced here at service level.
 *
 * @param {Object} data - { firstName, lastName, password, roleId, speciality,
 *                          hasFullBranchAccess, branchIds[] }
 * @param {Object} req  - Express request (for tenant context)
 * @param {string} actorId - ID of the user performing the action
 */
async function createUser(data, req, actorId) {
    const organizationId = req.context.organizationId;
    const { User, Role, Branch } = _getModels(req);

    await assertUserLimit(organizationId);

    // ── 1. Generate org-email with auto-increment uniqueness ─────────────────
    // Format: {firstName}.{lastName}@{orgSlug}.clinic
    // If taken: aya.ahmed2, aya.ahmed3 … (up to 99)
    const orgSlug = await fetchOrgSlug(organizationId);
    const baseUsername = `${data.firstName.trim()}.${data.lastName.trim()}`;

    let email, username;
    try {
        ({ email, username } = await resolveUniqueOrgEmail(User, baseUsername, orgSlug));
    } catch (uniqueErr) {
        // resolveUniqueOrgEmail rethrows with EMAIL_ALREADY_EXISTS_IN_ORG when exhausted
        throw uniqueErr;
    }

    // ── 3. Validate role ─────────────────────────────────────────
    const role = await Role.findOne({ _id: data.roleId });
    if (!role) {
        const err = new Error("Role not found in this organization");
        err.statusCode = 404;
        err.errorCode = "ROLE_NOT_FOUND";
        throw err;
    }

    // ── 4. Validate branch IDs ─────────────────────────────────────
    const branchIds = data.hasFullBranchAccess ? [] : (data.branchIds || data.branchAccess || []);
    if (!data.hasFullBranchAccess && branchIds.length > 0) {
        const branchCount = await Branch.countDocuments({ _id: { $in: branchIds } });
        if (branchCount !== branchIds.length) {
            const err = new Error("One or more branch IDs do not belong to this organization");
            err.statusCode = 400;
            err.errorCode = "INVALID_BRANCH_ACCESS";
            throw err;
        }
    }

    // ── 5. Hash password ─────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    // ── 3. Persist ────────────────────────────────────────────────────
    // ── Practitioner logic ─────────────────────────────────────────────────
    // Sources of truth (priority order):
    //   1. Explicit `isPractitioner` flag from payload (e.g. admin acting as doctor)
    //   2. Role name === "doctor"
    // No other field (jobTitle, speciality) should drive this.
    const isDoctor = role.name.toLowerCase() === "doctor";
    const isPractitionerFlag = data.isPractitioner === true || isDoctor;

    // Specialty: canonical lowercase, only for practitioners
    const specialty = isPractitionerFlag
        ? ((data.specialty || data.speciality || "general").toLowerCase())
        : null;

    let user;
    try {
        const doc = new User({
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            name: `${data.firstName.trim()} ${data.lastName.trim()}`,

            // Identity fields — SSOT for email system
            email,
            realEmail: null,         // staff have no personal email in system
            isSystemGenerated: true, // this email was auto-generated
            username,

            password: hashedPassword,
            roleId: data.roleId,

            // Branch access
            branchAccess: branchIds,
            hasFullBranchAccess: data.hasFullBranchAccess || false,

            isActive: true,
            phone: data.phone || null,
            jobTitle: data.jobTitle || null,
            speciality: data.speciality || null,  // legacy root field (kept for compat)
            department: data.department || null,
            profileImage: data.profileImage || null,

            // v32.0 — Practitioner flag
            isPractitioner: isPractitionerFlag,

            // Admin-created staff: profile is complete (no first-login gate)
            profile: {
                isComplete: true,
                completedAt: new Date(),
                specialty,             // null for non-practitioners
            },
        });
        user = await doc.save();
    } catch (dbErr) {
        // ── PHASE 2 TASK 2.3 — Race-condition safety net ──────────────────────
        // If two concurrent requests passed the pre-check with the same email,
        // MongoDB's unique index rejects one with code 11000.
        // Map this to the standard error code so the API response is consistent.
        if (dbErr.code === 11000 && dbErr.keyPattern?.email) {
            const err = new Error("Staff username already exists in this clinic");
            err.statusCode = 409;
            err.errorCode = "EMAIL_ALREADY_EXISTS_IN_ORG";
            throw err;
        }
        throw dbErr;
    }

    logger.info({
        event: "USER_CREATED",
        userId: user._id,
        email,
        organizationId,
        actorId,
    }, `[UserService] Staff created with org-email: ${email}`);

    // Phase 4.1 — Update usage counter (non-blocking)
    try { await orgUsageService.incrementUsers(organizationId); } catch (_) { /* logged inside service */ }

    // Return without password
    const userObj = user.toObject();
    delete userObj.password;
    return userObj;
}

/**
 * List all users in the organization with pagination.
 *
 * @param {Object} req - Express request (for tenant context)
 * @param {Object} options - { page, limit, search, roleId, isActive }
 */
async function listUsers(req, options = {}) {
    const { User } = _getModels(req);
    const {
        page = 1,
        limit = 20,
        search,
        roleId,
        isActive,
    } = options;

    const filter = { deletedAt: null };

    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
        ];
    }

    if (roleId) {
        filter.roleId = roleId;
    }

    if (isActive !== undefined) {
        filter.isActive = isActive === "true" || isActive === true;
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
        User.find(filter)
            .select("-password")
            .populate("roleId", "name permissions isSystemRole")
            .populate("branchAccess", "name isActive")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        User.countDocuments(filter),
    ]);

    return {
        data: users,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

/**
 * Get a single user by ID within the organization.
 */
async function getUserById(userId, req) {
    const { User } = _getModels(req);
    const user = await User.findById(userId)
        .select("-password")
        .populate("roleId", "name permissions isSystemRole")
        .populate("branchAccess", "name isActive")
        .lean();

    if (!user) {
        const err = new Error("User not found");
        err.statusCode = 404;
        err.errorCode = "USER_NOT_FOUND";
        throw err;
    }

    return user;
}

/**
 * Update a user within the organization.
 */
async function updateUser(userId, data, req, actorId) {
    const organizationId = req.context.organizationId;
    const { User, Role, Branch } = _getModels(req);

    const user = await User.findById(userId)
        .select("+password");

    if (!user) {
        const err = new Error("User not found");
        err.statusCode = 404;
        err.errorCode = "USER_NOT_FOUND";
        throw err;
    }

    if (data.isActive === false && userId === actorId) {
        const err = new Error("You cannot deactivate your own account");
        err.statusCode = 400;
        err.errorCode = "SELF_DEACTIVATION";
        throw err;
    }

    // ── Email guard: system-generated emails are IMMUTABLE ──────────────────────
    // Staff have org-email (isSystemGenerated=true). Only non-system users can
    // change their email (org_admin with real email).
    if (data.email && !user.isSystemGenerated && data.email.trim().toLowerCase() !== user.email) {
        const existing = await User.findOne({
            email: data.email.trim().toLowerCase(),
            _id: { $ne: userId },
        });
        if (existing) {
            const err = new Error("A user with this email already exists");
            err.statusCode = 409;
            err.errorCode = "DUPLICATE_EMAIL";
            throw err;
        }
        user.email = data.email.trim().toLowerCase();
    }

    if (data.roleId) {
        const role = await Role.findOne({ _id: data.roleId });
        if (!role) {
            const err = new Error("Role not found in this organization");
            err.statusCode = 404;
            err.errorCode = "ROLE_NOT_FOUND";
            throw err;
        }
        user.roleId = data.roleId;
    }

    // Support both branchAccess (legacy) and branchIds (new spec) keys
    const incomingBranchIds = data.branchIds || data.branchAccess;
    if (incomingBranchIds) {
        const branchCount = await Branch.countDocuments({
            _id: { $in: incomingBranchIds },
        });
        if (branchCount !== incomingBranchIds.length) {
            const err = new Error("One or more branch IDs do not belong to this organization");
            err.statusCode = 400;
            err.errorCode = "INVALID_BRANCH_ACCESS";
            throw err;
        }
        user.branchAccess = incomingBranchIds;
    }

    // Hash new password if provided
    if (data.password) {
        user.password = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
        user.tokenVersion += 1; // Invalidate all sessions
        user.mustChangePassword = false;
    }

    // Update simple fields
    if (data.firstName !== undefined) user.firstName = data.firstName.trim();
    if (data.lastName !== undefined) user.lastName = data.lastName.trim();
    if (data.isActive !== undefined) user.isActive = data.isActive;
    if (data.hasFullBranchAccess !== undefined) user.hasFullBranchAccess = data.hasFullBranchAccess;
    if (data.phone !== undefined) user.phone = data.phone;
    if (data.jobTitle !== undefined) user.jobTitle = data.jobTitle;
    if (data.department !== undefined) user.department = data.department;
    if (data.speciality !== undefined) user.speciality = data.speciality; // legacy compat
    if (data.profileImage !== undefined) user.profileImage = data.profileImage;

    // v32.0 — isPractitioner + profile.specialty
    // Handle role change: if role changes to "doctor", auto-promote to practitioner
    let resolvedRoleName = null;
    if (data.roleId) {
        try {
            const newRole = await Role.findById(data.roleId).select("name").lean();
            resolvedRoleName = newRole?.name?.toLowerCase() || null;
        } catch (_) { /* non-fatal — proceed without role-based auto-flag */ }
    }

    // Determine final isPractitioner value:
    //   explicit payload flag OR auto-set when role is "doctor"
    const isNowDoctor = resolvedRoleName === "doctor";
    const explicitFlag = data.isPractitioner;

    if (explicitFlag !== undefined || isNowDoctor) {
        user.isPractitioner = explicitFlag === true || isNowDoctor;
    }

    // specialty: update profile.specialty when provided or when practitioner is set
    const incomingSpecialty = data.specialty || data.speciality;
    if (incomingSpecialty !== undefined) {
        user.profile = {
            ...user.profile,
            specialty: incomingSpecialty ? incomingSpecialty.toLowerCase() : null,
        };
    }

    // Validate: practitioner must have a specialty on save
    if (user.isPractitioner && !user.profile?.specialty) {
        const err = new Error("A practitioner must have a specialty set");
        err.statusCode = 400;
        err.errorCode = "PRACTITIONER_MISSING_SPECIALTY";
        throw err;
    }

    await user.save();

    logger.info({
        event: "USER_UPDATED",
        userId: user._id,
        organizationId,
        actorId,
    }, `[UserService] User updated: ${user.email}`);

    const userObj = user.toObject();
    delete userObj.password;
    return userObj;
}

/**
 * Soft-delete a user (set isActive = false, deletedAt = now).
 */
async function deleteUser(userId, req, actorId) {
    const organizationId = req.context.organizationId;

    if (userId === actorId) {
        const err = new Error("You cannot delete your own account");
        err.statusCode = 400;
        err.errorCode = "SELF_DELETION";
        throw err;
    }

    const { User } = _getModels(req);
    const user = await User.findOne({ _id: userId, deletedAt: null });

    if (!user) {
        const err = new Error("User not found");
        err.statusCode = 404;
        err.errorCode = "USER_NOT_FOUND";
        throw err;
    }

    user.isActive = false;
    user.deletedAt = new Date();
    user.tokenVersion += 1; // Invalidate all sessions
    await user.save();

    logger.info({
        event: "USER_DELETED",
        userId: user._id,
        organizationId,
        actorId,
    }, `[UserService] User soft-deleted: ${user.email}`);

    // Phase 4.1 — Decrement usage counter (non-blocking)
    try { await orgUsageService.decrementUsers(organizationId); } catch (_) { /* logged inside service */ }

    return { success: true, message: "User deleted successfully" };
}

module.exports = {
    createUser,
    listUsers,
    getUserById,
    updateUser,
    deleteUser,
    // ── Helper exports for check-username endpoint ─────────────────────────────
    isOrgEmailTaken,
    generateOrgEmail,
    _getModels,
};
