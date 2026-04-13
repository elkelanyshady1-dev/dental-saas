/**
 * branches.service.js — Branch Management Service
 * Phase 1 — Organization Access Layer
 * Phase F.1 — RLS Activation (secureModel migration)
 *
 * All queries scoped by organizationId via secureModel.
 * PLANE: Org only.
 */

"use strict";

const BranchDef = require("../../../shared/models/Branch");
const UserDef   = require("../../../shared/models/User");
const getModel  = require("../../../core/db/getModel");
const mongoose  = require("mongoose");
const { assertBranchLimit } = require("../../../core/subscription/planEnforcement");
const logger    = require("@utils/logger");

// Per-request model resolution — binds to org DB connection (identical pattern to users.service.js)
function _getModels(req) {
    const conn = req.dbConnection;
    return {
        Branch: getModel(conn, BranchDef),
        User:   getModel(conn, UserDef),
    };
}

function _generateChairs(count, existingChairs = []) {
    const newChairs = [...existingChairs];
    const currentCount = newChairs.length;

    if (count > currentCount) {
        for (let i = currentCount + 1; i <= count; i++) {
            newChairs.push({
                // Omit `id` — Mongoose auto-generates _id as ObjectId for subdocuments.
                name: `Chair ${i.toString().padStart(2, "0")}`,
                isActive: true
            });
        }
    } else if (count < currentCount) {
        // Deactivate chairs beyond the new count instead of deleting them outright
        for (let i = count; i < newChairs.length; i++) {
            newChairs[i].isActive = false;
        }
    }
    return newChairs;
}


/**
 * Create a new branch within the organization.
 */
async function createBranch(data, req, actorId) {
    const organizationId = req.context.organizationId;
    const { Branch } = _getModels(req);

    // Enforce plan branch limit
    await assertBranchLimit(organizationId);

    // Check name uniqueness within org
    const existing = await Branch.findOne({
        name: data.name.trim(),
        deletedAt: null,
    });
    if (existing) {
        const err = new Error("A branch with this name already exists");
        err.statusCode = 409;
        err.errorCode = "DUPLICATE_BRANCH_NAME";
        throw err;
    }

    // RLS-scoped create
    const branch = await Branch.create({
        name: data.name.trim(),
        address: data.address || "",
        phone: data.phone || "",
        email: data.email || null,
        type: data.type || "internal",
        clinicType: data.clinicType || "PRIVATE",
        timezone: data.timezone || "UTC",
        numberOfOperatories: data.numberOfOperatories || data.numberOfChairs || 1,
        // Optional custom working hours provided on create
        ...(data.workingHours ? { workingHours: data.workingHours } : {}),
        isActive: true,
        // v32.3 — Google Maps location pin
        location: data.location || null,
    });

    // Auto-provision initial Chairs
    branch.chairs = _generateChairs(branch.numberOfOperatories, []);
    await branch.save();


    logger.info({
        event: "BRANCH_CREATED",
        branchId: branch._id,
        organizationId,
        actorId,
    }, `[BranchService] Branch created: ${branch.name}`);

    return branch;
}

/**
 * List all branches in the organization with pagination.
 */
async function listBranches(req, options = {}) {
    const { Branch } = _getModels(req);
    const {
        page = 1,
        limit = 50,
        search,
        isActive,
        type,
    } = options;

    const filter = { deletedAt: null }; // organizationId injected by secureModel

    if (search) {
        filter.name = { $regex: search, $options: "i" };
    }

    if (isActive !== undefined) {
        filter.isActive = isActive === "true" || isActive === true;
    }

    if (type) {
        filter.type = type;
    }

    const skip = (page - 1) * limit;

    const [branches, total] = await Promise.all([
        Branch.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Branch.countDocuments(filter),
    ]);

    return {
        data: branches,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}

/**
 * Get a single branch by ID within the organization.
 */
async function getBranchById(branchId, req) {
    const { Branch, User } = _getModels(req);
    const branch = await Branch.findOne({
        _id: branchId,
        deletedAt: null,
    }).lean();

    if (!branch) {
        const err = new Error("Branch not found");
        err.statusCode = 404;
        err.errorCode = "BRANCH_NOT_FOUND";
        throw err;
    }

    // Count users assigned to this branch (RLS-scoped)
    const userCount = await User.countDocuments({
        $or: [
            { branchAccess: branchId },
            { hasFullBranchAccess: true },
        ],
        isActive: true,
        deletedAt: null,
    });

    return { ...branch, userCount };
}

/**
 * Update a branch within the organization.
 */
async function updateBranch(branchId, data, req, actorId) {
    const organizationId = req.context.organizationId;
    const { Branch } = _getModels(req);

    const branch = await Branch.findOne({
        _id: branchId,
        deletedAt: null,
    });

    if (!branch) {
        const err = new Error("Branch not found");
        err.statusCode = 404;
        err.errorCode = "BRANCH_NOT_FOUND";
        throw err;
    }

    // Check name uniqueness if changing name
        if (data.name && data.name.trim() !== branch.name) {
        const existing = await Branch.findOne({
            name: data.name.trim(),
            _id: { $ne: branchId },
            deletedAt: null,
        });
        if (existing) {
            const err = new Error("A branch with this name already exists");
            err.statusCode = 409;
            err.errorCode = "DUPLICATE_BRANCH_NAME";
            throw err;
        }
        branch.name = data.name.trim();
    }

    // Update scalar fields
    if (data.address !== undefined)    branch.address = data.address;
    if (data.phone !== undefined)      branch.phone = data.phone;
    if (data.email !== undefined)      branch.email = data.email;
    if (data.type !== undefined)       branch.type = data.type;
    if (data.clinicType !== undefined) branch.clinicType = data.clinicType;
    if (data.timezone !== undefined)   branch.timezone = data.timezone;
    if (data.isActive !== undefined)   branch.isActive = data.isActive;
    if (data.location !== undefined)   branch.location = data.location;

    // ── Working Hours ─────────────────────────────────────────────────────────
    // Assign each day individually so Mongoose's strict sub-schema change
    // detection fires correctly for every field. markModified is a belt-and-
    // suspenders guard in case a future schema change reverts to type:Object.
    if (data.workingHours !== undefined) {
        const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
        for (const day of DAYS) {
            if (data.workingHours[day] !== undefined) {
                branch.workingHours[day].enabled = data.workingHours[day].enabled;
                branch.workingHours[day].start   = data.workingHours[day].start;
                branch.workingHours[day].end     = data.workingHours[day].end;
            }
        }
        branch.markModified("workingHours"); // safety net for any future type:Object reversion
    }

    // ── Chairs Array ──────────────────────────────────────────────────────────
    // Use splice + push (not direct assignment) to trigger Mongoose array
    // change tracking and guarantee the update reaches the DB.
    if (data.chairs !== undefined) {
        branch.chairs.splice(0, branch.chairs.length, ...data.chairs);
        branch.markModified("chairs");
    }

    // Auto-generate chairs if numberOfOperatories changes
    const newOperatoryCount = data.numberOfOperatories ?? data.chairCount ?? data.numberOfChairs;
    if (newOperatoryCount !== undefined && newOperatoryCount !== branch.numberOfOperatories) {
        branch.numberOfOperatories = Math.max(1, Math.min(100, parseInt(newOperatoryCount) || 1));
        // Only auto-generate if no manual chairs override was provided
        if (data.chairs === undefined) {
            const generated = _generateChairs(branch.numberOfOperatories, branch.chairs || []);
            branch.chairs.splice(0, branch.chairs.length, ...generated);
            branch.markModified("chairs");
        }
    }

    // ── Idempotent Chair Self-Heal ────────────────────────────────────────────
    // If the branch has numberOfOperatories configured but no active chairs yet
    // (e.g. legacy branches created before auto-provisioning), generate them now.
    // This is a no-op when chairs are already populated.
    const activeChairCount = (branch.chairs || []).filter(c => c.isActive !== false).length;
    if (branch.numberOfOperatories > 0 && activeChairCount === 0 && data.chairs === undefined) {
        const healed = _generateChairs(branch.numberOfOperatories, []);
        branch.chairs.splice(0, branch.chairs.length, ...healed);
        branch.markModified("chairs");
        logger.info({
            event: "BRANCH_CHAIRS_SELF_HEALED",
            branchId: branch._id,
            numberOfOperatories: branch.numberOfOperatories,
            chairsGenerated: healed.length,
        }, `[BranchService] Self-healed ${healed.length} chairs for branch: ${branch.name}`);
    }

    logger.debug({
        event: "BRANCH_UPDATE_PRE_SAVE",
        branchId: branch._id,
        numberOfOperatories: branch.numberOfOperatories,
        chairsCount: branch.chairs?.length,
        workingHours: branch.workingHours,
    }, "[BranchService] Incoming update — pre-save snapshot");

    await branch.save();

    logger.info({
        event: "BRANCH_UPDATED",
        branchId: branch._id,
        organizationId,
        actorId,
        chairsCount: branch.chairs?.length,
    }, `[BranchService] Branch updated: ${branch.name}`);

    return branch.toObject(); // full plain-object serialization (includes chairs + workingHours)
}


/**
 * Soft-delete a branch (set isActive = false, deletedAt = now).
 */
async function deleteBranch(branchId, req, actorId) {
    const organizationId = req.context.organizationId;
    const { Branch, User } = _getModels(req);

    const branch = await Branch.findOne({
        _id: branchId,
        deletedAt: null,
    });

    if (!branch) {
        const err = new Error("Branch not found");
        err.statusCode = 404;
        err.errorCode = "BRANCH_NOT_FOUND";
        throw err;
    }

    // Check if users are assigned to this branch (RLS-scoped)
    const assignedUsers = await User.countDocuments({
        branchAccess: branchId,
        isActive: true,
        deletedAt: null,
    });

    if (assignedUsers > 0) {
        const err = new Error(
            `Cannot delete branch: ${assignedUsers} active user(s) are assigned to it. Reassign users first.`
        );
        err.statusCode = 400;
        err.errorCode = "BRANCH_HAS_USERS";
        throw err;
    }

    branch.isActive = false;
    branch.deletedAt = new Date();
    await branch.save();

    logger.info({
        event: "BRANCH_DELETED",
        branchId: branch._id,
        organizationId,
        actorId,
    }, `[BranchService] Branch soft-deleted: ${branch.name}`);

    return { success: true, message: "Branch deleted successfully" };
}

module.exports = {
    createBranch,
    listBranches,
    getBranchById,
    updateBranch,
    deleteBranch,
};
