/**
 * roles.service.js — Org-plane Role management service (Phase B)
 *
 * This file intentionally lands in two stages so the user can audit the
 * invariant logic before the delete/assign code is written:
 *   Stage 1 (this commit): createRole, updateRole + shared helpers
 *   Stage 2 (next commit):  deleteRole, assignRoleToUser, getRole, listRoles
 *
 * Contracts enforced here (per CLAUDE.md Rules Engine v1.0):
 *
 *   § 2.2  Tenant isolation:   models come from req.dbConnection (per-org DB);
 *                              no organizationId filter needed (DB is the tenant
 *                              boundary). `organizationId` is stamped on the Role
 *                              document from req.context for audit only.
 *   § 3.3  RBAC SSOT:          permissions are validated against the P registry.
 *                              No role-name shortcuts anywhere in this file.
 *   § 8.1  Atomic writes:      every mutation runs under session.withTransaction.
 *   § 10.1 Service contract:   all exports take (req, payload).
 *
 * Domain invariants:
 *
 *   I1. System roles are immutable. Any mutation on a role whose
 *       `isSystemRole === true` is rejected with SYSTEM_ROLE_IMMUTABLE.
 *       (The org_admin seed is auto-healed by permissionVersion; admins get
 *       a governance UI to *view* it but never to *edit* it.)
 *
 *   I2. Role names are unique within the org (case-insensitive).
 *
 *   I3. Lockout prevention on update: if an update would strip STAFF_MANAGE
 *       from a role, there must still exist at least one OTHER role in the
 *       org that (a) grants STAFF_MANAGE and (b) has at least one active
 *       user assigned to it. If not, the update is rejected with
 *       STAFF_MANAGE_LOCKOUT. This mirrors the Phase A regression test
 *       that locks in "stale org_admin role name can never bypass RBAC" —
 *       the Set is authoritative, so we must guarantee the Set remains
 *       non-empty for STAFF_MANAGE org-wide.
 *
 *   I4. tokenVersion bump: every successful update bumps `tokenVersion` on
 *       every user assigned to the role, inside the same transaction. This
 *       invalidates stale JWTs carrying an outdated permission snapshot.
 *       (Name-only edits also bump — JWTs carry `roleName`, so a rename
 *       would otherwise leave stale JWTs in circulation.)
 *
 * PLANE: Org only.
 */

"use strict";

const UserDef = require("@shared/models/User");
const RoleDef = require("@shared/models/Role");
const getModel = require("@core/db/getModel");
const logger = require("@utils/logger");
const { P } = require("@rbac/orgPermissions");
const { deriveModuleMap, PERMISSION_VERSION } = require("@rbac/permissionRegistry");
const { buildRoleDTO, buildRoleListDTO } = require("./role.dto");

// ─── Error helper ───────────────────────────────────────────────────────────

function httpError(message, statusCode, errorCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.errorCode = errorCode;
    return err;
}

// ─── Model resolution (per-org DB) ──────────────────────────────────────────

function _getModels(req) {
    const conn = req.dbConnection;
    if (!conn) {
        throw httpError(
            "No per-org DB connection on request",
            500,
            "DB_CONNECTION_MISSING",
        );
    }
    return {
        User: getModel(conn, UserDef),
        Role: getModel(conn, RoleDef),
    };
}

// ─── Permission shape helpers ───────────────────────────────────────────────

/**
 * Convert a flat permission map { "patients.read": true } into the nested
 * Mongoose shape { patients: { read: true } }. Unknown modules/actions are
 * silently skipped — the validator layer is the gate that rejects unknown
 * keys, so reaching here with an unknown key is a bug, but we don't want
 * to panic at the service layer (defense in depth: fail closed by omission).
 *
 * The output object is BACKED by the full module map, so every module/action
 * gets an explicit `false` default. This matters for Mongoose: replacing
 * `role.permissions` with a partial object would leave old grants intact
 * because Mongoose merges sub-docs on .save(). We want a *replace* semantic.
 *
 * @param {Record<string, boolean>} flat
 * @returns {Object} nested permissions object matching Role schema
 */
function flatToNested(flat) {
    const moduleMap = deriveModuleMap();
    const nested = {};

    // Seed every action to false so the write is a full replace, not a merge.
    for (const [mod, actions] of Object.entries(moduleMap)) {
        nested[mod] = {};
        for (const action of actions) {
            nested[mod][action] = false;
        }
    }

    // Overlay the caller's grants.
    for (const [key, value] of Object.entries(flat)) {
        const dotIdx = key.indexOf(".");
        if (dotIdx === -1) continue;
        const mod = key.substring(0, dotIdx);
        const action = key.substring(dotIdx + 1);
        if (nested[mod] && Object.prototype.hasOwnProperty.call(nested[mod], action)) {
            nested[mod][action] = value === true;
        }
    }

    return nested;
}

// ─── Invariant helpers ──────────────────────────────────────────────────────

/**
 * Invariant I2: assert role name is unique within the org.
 *
 * Uniqueness is case-insensitive at the data layer: the Role schema has
 * `lowercase: true` on `name` plus a unique index on { name: 1 }. So this
 * helper (a) normalizes the incoming name to lowercase, (b) does an exact
 * index lookup (no regex — deterministic + uses the unique index), and
 * (c) relies on the unique index as the race-safe backstop in the caller.
 */
async function assertUniqueName(Role, name, excludeId, session) {
    const normalized = String(name).toLowerCase();
    const q = { name: normalized };
    if (excludeId) q._id = { $ne: excludeId };

    const existing = await Role.findOne(q).session(session).lean();
    if (existing) {
        throw httpError(
            `Role name "${normalized}" already exists in this organization`,
            409,
            "ROLE_NAME_DUPLICATE",
        );
    }
}

/**
 * GLOBAL lockout invariant (I3b): after any patch/delete, the org must
 * still contain at least one role that grants STAFF_MANAGE. Runs inside
 * the transaction AFTER the patch has been applied but BEFORE commit,
 * so the decision is made against the post-write state.
 *
 * This is stricter than assertStaffManageNotLockedOut() — that helper
 * only fires on STAFF_MANAGE removal from the edited role, but a clever
 * update could still leave the org with zero admin-capable roles (e.g.
 * if the edited role was the sole one and the patch flips it off). This
 * global check is the last line of defense.
 */
async function assertStaffManageRoleStillExists(Role, session) {
    const count = await Role.countDocuments({
        "permissions.staff.manage": true,
    }).session(session);

    if (count === 0) {
        throw httpError(
            "Cannot perform this change — at least one role must grant staff.manage.",
            409,
            "LOCKOUT_PREVENTED_NO_STAFF_MANAGE_ROLE",
        );
    }
}

/**
 * Invariant I3: STAFF_MANAGE lockout prevention.
 * Given the role currently being edited (or deleted), verify that there
 * is still at least one OTHER role in the org that (a) grants STAFF_MANAGE
 * and (b) has at least one active, non-deleted user assigned to it.
 *
 * Call this BEFORE persisting the update. Runs inside the transaction's
 * session so the check and the write are atomic.
 */
async function assertStaffManageNotLockedOut(Role, User, excludeRoleId, session) {
    const otherAdminRoles = await Role.find(
        {
            _id: { $ne: excludeRoleId },
            "permissions.staff.manage": true,
        },
        { _id: 1 },
    ).session(session).lean();

    if (otherAdminRoles.length === 0) {
        throw httpError(
            "Cannot perform this change — no other role in the organization grants staff.manage.",
            409,
            "STAFF_MANAGE_LOCKOUT",
        );
    }

    const otherAdminUserCount = await User.countDocuments({
        roleId: { $in: otherAdminRoles.map((r) => r._id) },
        isActive: true,
        deletedAt: null,
    }).session(session);

    if (otherAdminUserCount === 0) {
        throw httpError(
            "Cannot perform this change — at least one other active user with staff.manage must exist.",
            409,
            "STAFF_MANAGE_LOCKOUT",
        );
    }
}

/**
 * Invariant I4: bump tokenVersion on every user assigned to this role.
 * Runs inside the update transaction so stale JWTs are invalidated
 * atomically with the role change.
 *
 * Returns the number of users whose tokens were invalidated (for audit).
 */
async function bumpAssignedUsersTokenVersion(User, roleId, session) {
    const result = await User.updateMany(
        { roleId, deletedAt: null },
        { $inc: { tokenVersion: 1 } },
        { session },
    );
    return result.modifiedCount || 0;
}

// ─── createRole ─────────────────────────────────────────────────────────────

/**
 * Create a custom org role.
 *
 * @param {Object} req     - Express request (must carry dbConnection + context)
 * @param {Object} payload - Already validated by createRoleSchema:
 *                           { name, description?, permissions: flat map }
 * @returns {Promise<Object>} lean role document
 */
async function createRole(req, payload) {
    const { User: _User, Role } = _getModels(req); // eslint-disable-line no-unused-vars
    const organizationId = req.context.organizationId;
    const actorId = req.context.userId;

    const { name, description, permissions: flatPermissions } = payload;
    const normalizedName = String(name).toLowerCase();

    const nestedPermissions = flatToNested(flatPermissions);

    const session = await req.dbConnection.startSession();
    let created;
    try {
        await session.withTransaction(async () => {
            // I2: unique name (soft check — the unique index below is the
            // race-safe backstop)
            await assertUniqueName(Role, normalizedName, null, session);

            try {
                // Create inside txn — create() with session requires the array form.
                const docs = await Role.create(
                    [{
                        name: normalizedName,
                        description: description || undefined,
                        organizationId, // stamped for audit; DB is the tenant boundary
                        isSystemRole: false, // custom roles are NEVER system roles
                        permissions: nestedPermissions,
                        permissionVersion: PERMISSION_VERSION,
                    }],
                    { session },
                );
                created = docs[0];
            } catch (err) {
                if (err && err.code === 11000) {
                    throw httpError(
                        "Role name already exists in this organization",
                        409,
                        "ROLE_NAME_ALREADY_EXISTS",
                    );
                }
                throw err;
            }

            // Future-proof: even on create, assert the global invariant. This
            // is defensive — create can't directly remove STAFF_MANAGE, but
            // if a prior bad state exists (zero admin roles somehow), the
            // create shouldn't silently succeed and hide the lockout.
            await assertStaffManageRoleStillExists(Role, session);
        });
    } finally {
        await session.endSession();
    }

    logger.info({
        event: "ROLE_CREATED",
        roleId: created._id,
        roleName: created.name,
        organizationId,
        actorId,
    }, `[RolesService] Role created: ${created.name}`);

    // New role has zero users by definition.
    return buildRoleDTO(created.toObject ? created.toObject() : created, 0);
}

// ─── updateRole ─────────────────────────────────────────────────────────────

/**
 * Update an existing custom org role.
 *
 * - System roles (isSystemRole === true) are rejected (I1).
 * - Rename is case-insensitively unique-checked (I2).
 * - If permissions change AND would strip STAFF_MANAGE from this role,
 *   lockout prevention fires (I3).
 * - On success, all assigned users get tokenVersion bumped inside the
 *   same transaction (I4).
 *
 * @param {Object} req     - Express request
 * @param {Object} payload - { roleId, patch } where patch is validated by
 *                           updateRoleSchema: { name?, description?, permissions? }
 * @returns {Promise<{ role: Object, invalidatedSessions: number }>}
 */
async function updateRole(req, { roleId, patch }) {
    const { User, Role } = _getModels(req);
    const organizationId = req.context.organizationId;
    const actorId = req.context.userId;

    const session = await req.dbConnection.startSession();
    let updated;
    let invalidatedSessions = 0;
    let bumped = false; // did we actually run the tokenVersion bump?

    try {
        await session.withTransaction(async () => {
            const role = await Role.findById(roleId).session(session);
            if (!role) {
                throw httpError("Role not found", 404, "ROLE_NOT_FOUND");
            }

            // I1: system roles are immutable
            if (role.isSystemRole === true) {
                throw httpError(
                    "System roles cannot be modified",
                    403,
                    "SYSTEM_ROLE_IMMUTABLE",
                );
            }

            // Track whether the change requires a JWT bump. Description-only
            // edits are pure metadata and do NOT bump tokenVersion.
            let shouldBumpTokens = false;

            // Rename path
            const normalizedNewName =
                patch.name !== undefined ? String(patch.name).toLowerCase() : undefined;

            if (normalizedNewName !== undefined && normalizedNewName !== role.name) {
                await assertUniqueName(Role, normalizedNewName, role._id, session);
                role.name = normalizedNewName;
                shouldBumpTokens = true;
            }

            if (patch.description !== undefined) {
                role.description = patch.description;
            }

            // Permission-change path
            if (patch.permissions !== undefined) {
                const nested = flatToNested(patch.permissions);

                // I3a: local lockout check — only when STAFF_MANAGE is being
                // REMOVED from THIS role. Cheap and gives a clear error.
                const wasAdmin = role.permissions?.staff?.manage === true;
                const willBeAdmin = nested.staff?.manage === true;
                if (wasAdmin && !willBeAdmin) {
                    await assertStaffManageNotLockedOut(Role, User, role._id, session);
                }

                // Full replace semantic — flatToNested seeds every action
                role.permissions = nested;
                role.markModified("permissions");
                role.permissionVersion = PERMISSION_VERSION;
                shouldBumpTokens = true;
            }

            // Race-safe save: the unique index on `name` is the authoritative
            // collision guard (two concurrent renames could both pass the
            // earlier findOne).
            try {
                await role.save({ session });
            } catch (err) {
                if (err && err.code === 11000) {
                    throw httpError(
                        "Role name already exists in this organization",
                        409,
                        "ROLE_NAME_ALREADY_EXISTS",
                    );
                }
                throw err;
            }

            // I3b: GLOBAL lockout invariant — after the patch is persisted
            // inside the txn, there must still be at least one STAFF_MANAGE
            // role. This is the last line of defense.
            await assertStaffManageRoleStillExists(Role, session);

            // I4: invalidate JWTs for all users wearing this role, but only
            // when permissions or name actually changed.
            if (shouldBumpTokens) {
                invalidatedSessions = await bumpAssignedUsersTokenVersion(
                    User,
                    role._id,
                    session,
                );
                bumped = true;
            }

            updated = role;
        });
    } finally {
        await session.endSession();
    }

    logger.info({
        event: "ROLE_UPDATED",
        roleId: updated._id,
        roleName: updated.name,
        organizationId,
        actorId,
        invalidatedSessions,
    }, `[RolesService] Role updated: ${updated.name} (invalidated ${invalidatedSessions} sessions)`);

    // userCount: if we bumped, the updateMany count is authoritative.
    // Otherwise (description-only edit), query it explicitly.
    const userCount = bumped
        ? invalidatedSessions
        : await User.countDocuments({ roleId: updated._id, deletedAt: null });

    return {
        role: buildRoleDTO(updated.toObject ? updated.toObject() : updated, userCount),
        invalidatedSessions,
    };
}

// ─── deleteRole ─────────────────────────────────────────────────────────────

/**
 * Delete a custom org role.
 *
 * Invariants (in order — each is a separate hard fail):
 *   D1. Role must exist.
 *   D2. System roles cannot be deleted (I1).
 *   D3. Role must have zero users currently assigned to it — the admin UX
 *       must reassign users first. (No cascade on purpose: silent reassignment
 *       would destroy audit trails and hide mistakes.)
 *   D4. Deleting the role must not drop the org below one STAFF_MANAGE role.
 *       Checked BEFORE the deleteOne() call by simulating the removal: if
 *       this role grants STAFF_MANAGE, at least one OTHER role in the org
 *       must also grant it. Validating before the mutation keeps invariant
 *       logic easy to reason about (never check post-state of a write).
 *
 * @param {Object} req
 * @param {Object} payload - { roleId }
 * @returns {Promise<{ roleId: string, name: string }>}
 */
async function deleteRole(req, { roleId }) {
    const { User, Role } = _getModels(req);
    const organizationId = req.context.organizationId;
    const actorId = req.context.userId;

    const session = await req.dbConnection.startSession();
    let deletedSnapshot;

    try {
        await session.withTransaction(async () => {
            // D1
            const role = await Role.findById(roleId).session(session);
            if (!role) {
                throw httpError("Role not found", 404, "ROLE_NOT_FOUND");
            }

            // D2
            if (role.isSystemRole === true) {
                throw httpError(
                    "System roles cannot be deleted",
                    403,
                    "SYSTEM_ROLE_IMMUTABLE",
                );
            }

            // D3: zero users assigned (active users — soft-deleted users
            // don't block deletion, they've already lost their session)
            const assignedCount = await User.countDocuments({
                roleId: role._id,
                deletedAt: null,
            }).session(session);

            if (assignedCount > 0) {
                throw httpError(
                    `Cannot delete role: ${assignedCount} user(s) are still assigned. Reassign them first.`,
                    409,
                    "ROLE_HAS_USERS_ASSIGNED",
                );
            }

            // D4: STAFF_MANAGE lockout check — BEFORE the delete.
            // If this role grants STAFF_MANAGE, simulate the removal by
            // verifying at least one OTHER role also grants it. Using
            // .exists() instead of countDocuments() is faster (stops at
            // first match) and clearer in intent. Optional chaining guards
            // against legacy/partial migration docs where `permissions` or
            // `permissions.staff` may be absent.
            if (role.permissions?.staff?.manage === true) {
                const otherAdminRole = await Role.exists({
                    _id: { $ne: role._id },
                    "permissions.staff.manage": true,
                }).session(session);

                if (!otherAdminRole) {
                    throw httpError(
                        "Cannot delete — this is the last role granting staff.manage.",
                        409,
                        "LOCKOUT_PREVENTED_NO_STAFF_MANAGE_ROLE",
                    );
                }
            }

            deletedSnapshot = {
                roleId: role._id.toString(),
                name: role.name,
            };

            await Role.deleteOne({ _id: role._id }, { session });
        });
    } finally {
        await session.endSession();
    }

    logger.info({
        event: "ROLE_DELETED",
        roleId: deletedSnapshot.roleId,
        roleName: deletedSnapshot.name,
        organizationId,
        actorId,
    }, `[RolesService] Role deleted: ${deletedSnapshot.name}`);

    return { roleId: deletedSnapshot.roleId, name: deletedSnapshot.name };
}

// ─── assignRoleToUser ───────────────────────────────────────────────────────

/**
 * Assign a role to a user (or reassign from their current role).
 *
 * Invariants:
 *   A1. User and Role must both exist (per-org DB already guarantees same-org).
 *   A2. User must not be soft-deleted.
 *   A3. If the user is currently the LAST active STAFF_MANAGE user and the
 *       new role does NOT grant STAFF_MANAGE, block with STAFF_MANAGE_LOCKOUT.
 *   A4. tokenVersion bump on the target user (always — their permission set
 *       is changing).
 *   A5. `forceRefresh: true` is returned in the response when the actor is
 *       reassigning themselves — the controller layer uses this to tell the
 *       client to re-authenticate immediately.
 *
 * @param {Object} req
 * @param {Object} payload - { userId, roleId }
 * @returns {Promise<{ userId: string, roleId: string, forceRefresh: boolean }>}
 */
async function assignRoleToUser(req, { userId, roleId }) {
    const { User, Role } = _getModels(req);
    const organizationId = req.context.organizationId;
    const actorId = req.context.userId;

    const session = await req.dbConnection.startSession();
    let result;

    try {
        await session.withTransaction(async () => {
            // A1: fetch target user first — we need their current roleId to
            // know which Role docs to pull.
            const user = await User.findById(userId).session(session);
            if (!user) {
                throw httpError("User not found", 404, "USER_NOT_FOUND");
            }

            // A2
            if (user.deletedAt) {
                throw httpError(
                    "Cannot assign a role to a deleted user",
                    400,
                    "USER_DELETED",
                );
            }

            // Single query for both new role and (if any) current role.
            const roleIdsToFetch = [roleId];
            if (user.roleId && user.roleId.toString() !== String(roleId)) {
                roleIdsToFetch.push(user.roleId);
            }
            const rolesFetched = await Role.find({
                _id: { $in: roleIdsToFetch },
            }).session(session).lean();

            const role = rolesFetched.find((r) => r._id.toString() === String(roleId));
            if (!role) {
                throw httpError("Role not found", 404, "ROLE_NOT_FOUND");
            }
            const currentRole = user.roleId
                ? rolesFetched.find((r) => r._id.toString() === user.roleId.toString())
                : null;

            // No-op short-circuit
            if (user.roleId && user.roleId.toString() === role._id.toString()) {
                result = {
                    userId: user._id.toString(),
                    roleId: role._id.toString(),
                    forceRefresh: false,
                    noop: true,
                };
                return;
            }

            const newRoleHasStaffManage = role.permissions?.staff?.manage === true;
            const currentRoleHasStaffManage =
                currentRole?.permissions?.staff?.manage === true;

            // A3: lockout — if this user currently has STAFF_MANAGE via their
            // existing role, and the new role does NOT grant it, verify that
            // at least one OTHER active user still has STAFF_MANAGE.
            if (!newRoleHasStaffManage && currentRoleHasStaffManage) {
                const adminRoleIds = await Role.find(
                    { "permissions.staff.manage": true },
                    { _id: 1 },
                ).session(session).lean();

                const otherAdminCount = await User.countDocuments({
                    _id: { $ne: user._id },
                    roleId: { $in: adminRoleIds.map((r) => r._id) },
                    isActive: true,
                    deletedAt: null,
                }).session(session);

                if (otherAdminCount === 0) {
                    throw httpError(
                        "Cannot reassign — this user is the last active administrator.",
                        409,
                        "STAFF_MANAGE_LOCKOUT",
                    );
                }
            }

            // A4: apply the change + bump tokenVersion
            user.roleId = role._id;
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            await user.save({ session });

            // A3b: GLOBAL STAFF_MANAGE invariant — after all writes, at least
            // one role in the org must still grant staff.manage. Guards against
            // race conditions and inconsistent prior state.
            await assertStaffManageRoleStillExists(Role, session);

            // A5: self-assignment → force client re-auth
            const isSelf = actorId && user._id.toString() === actorId.toString();

            result = {
                userId: user._id.toString(),
                roleId: role._id.toString(),
                forceRefresh: !!isSelf,
                noop: false,
            };
        });
    } finally {
        await session.endSession();
    }

    logger.info({
        event: "ROLE_ASSIGNED",
        targetUserId: result.userId,
        roleId: result.roleId,
        organizationId,
        actorId,
        forceRefresh: result.forceRefresh,
        noop: result.noop,
    }, `[RolesService] Role ${result.roleId} assigned to user ${result.userId}`);

    return result;
}

// ─── getRoleById ────────────────────────────────────────────────────────────

/**
 * Fetch a single role by id with an efficient user count.
 * Returns a lean object with `userCount` attached.
 *
 * @param {Object} req
 * @param {Object} payload - { roleId }
 */
async function getRoleById(req, { roleId }) {
    const { User, Role } = _getModels(req);

    const role = await Role.findById(roleId).lean();
    if (!role) {
        throw httpError("Role not found", 404, "ROLE_NOT_FOUND");
    }

    const userCount = await User.countDocuments({
        roleId: role._id,
        deletedAt: null,
    });

    return buildRoleDTO(role, userCount);
}

// ─── listRoles ──────────────────────────────────────────────────────────────

/**
 * List all roles in the org with user counts.
 *
 * User counts are computed via a single aggregation against the User
 * collection (one round trip) rather than N+1 countDocuments calls.
 *
 * @param {Object} req
 * @param {Object} [payload] - reserved for filters (page/limit/search) in
 *                             a later pass; currently unused.
 */
async function listRoles(req /* , payload */) {
    const { User, Role } = _getModels(req);

    const roles = await Role.find({})
        // Deterministic order: system roles first, then by name, with _id
        // tiebreaker to guarantee stable ordering when names collide (which
        // shouldn't happen thanks to the unique index, but the tiebreaker
        // makes the UI flicker-proof regardless).
        .sort({ isSystemRole: -1, name: 1, _id: 1 })
        .limit(200)
        .lean();

    if (roles.length === 0) return [];

    // Efficient user count: one aggregation over User, grouped by roleId.
    // NOTE: User model uses `deletedAt: Date|null` for soft delete (not
    // `isDeleted`). The match below excludes soft-deleted users.
    const counts = await User.aggregate([
        { $match: { deletedAt: null, roleId: { $in: roles.map((r) => r._id) } } },
        { $group: { _id: "$roleId", n: { $sum: 1 } } },
    ]);

    const countByRoleId = new Map(
        counts.map((c) => [c._id?.toString(), c.n]),
    );

    const withCounts = roles.map((r) => ({
        ...r,
        userCount: countByRoleId.get(r._id.toString()) || 0,
    }));

    return buildRoleListDTO(withCounts);
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    createRole,
    updateRole,
    deleteRole,
    assignRoleToUser,
    getRoleById,
    listRoles,
    // exported for tests
    _internals: {
        flatToNested,
        assertUniqueName,
        assertStaffManageNotLockedOut,
        assertStaffManageRoleStillExists,
        bumpAssignedUsersTokenVersion,
        httpError,
    },
};
