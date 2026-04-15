/**
 * roles.service.integration.test.js — Phase B lock test
 *
 * Locks the org-plane role management invariants (I1–I4 + assign lockout).
 * Runs against the roles.service directly with a mock req carrying
 * { dbConnection, context }. The service exercises the full transaction
 * path through the per-org DB, so this is an integration test rather than
 * a unit test — the MongoMemoryReplSet in tests/setup.js is required.
 *
 * Coverage matrix:
 *   createRole       — duplicate name (409), happy path + DTO shape
 *   updateRole       — system role (403), description-only (no bump),
 *                      rename (bumps tokenVersion)
 *   deleteRole       — users assigned (409), last staff.manage (409)
 *   assignRoleToUser — self → forceRefresh, last-admin lockout + rollback,
 *                      no-op short-circuit (no token bump)
 *   listRoles        — accurate userCount + sum invariant + sort contract
 */

"use strict";

const mongoose = require("mongoose");
const rolesService = require("@modules/authorization/roles/roles.service");
const UserDef = require("@shared/models/User");
const RoleDef = require("@shared/models/Role");
const getModel = require("@core/db/getModel");
const { PERMISSION_VERSION, deriveModuleMap } = require("@rbac/permissionRegistry");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(orgId, actorUserId) {
    return {
        dbConnection: mongoose.connection,
        context: {
            organizationId: orgId,
            userId: actorUserId,
            roleName: "org_admin",
            plane: "org",
            permissions: new Set(["staff.manage", "users.update"]),
        },
    };
}

/**
 * Build a fully-seeded nested permissions doc with every action `false`,
 * then overlay the requested grants. Matches flatToNested() so seeded roles
 * are shape-identical to ones created through the service.
 */
function buildPermissions(grants = {}) {
    const moduleMap = deriveModuleMap();
    const nested = {};
    for (const [mod, actions] of Object.entries(moduleMap)) {
        nested[mod] = {};
        for (const action of actions) {
            nested[mod][action] = false;
        }
    }
    for (const [key, value] of Object.entries(grants)) {
        const dot = key.indexOf(".");
        if (dot === -1) continue;
        const mod = key.substring(0, dot);
        const action = key.substring(dot + 1);
        if (nested[mod] && Object.prototype.hasOwnProperty.call(nested[mod], action)) {
            nested[mod][action] = value === true;
        }
    }
    return nested;
}

async function seedRole({ name, organizationId, isSystemRole = false, grants = {} }) {
    const Role = getModel(mongoose.connection, RoleDef);
    return Role.create({
        name: String(name).toLowerCase(),
        organizationId,
        isSystemRole,
        permissions: buildPermissions(grants),
        permissionVersion: PERMISSION_VERSION,
    });
}

// Valid bcrypt hash format — cost 10, 53-char salt/hash tail. The service
// never reads the password, so any syntactically valid hash works.
const FAKE_BCRYPT = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

async function seedUser({ organizationId, roleId, email }) {
    const User = getModel(mongoose.connection, UserDef);
    return User.create({
        organizationId,
        roleId,
        email,
        name: "Test User",
        firstName: "T",
        lastName: "User",
        password: FAKE_BCRYPT,
        isActive: true,
        tokenVersion: 0,
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("roles.service (Phase B integration)", () => {
    let orgId;
    let actorId;

    beforeEach(() => {
        orgId = new mongoose.Types.ObjectId();
        actorId = new mongoose.Types.ObjectId();
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("createRole", () => {
        // createRole runs the global STAFF_MANAGE invariant at the end of the
        // txn (defensive — it shouldn't be possible to remove admin from a
        // create, but the check is there anyway). Seed a system admin role
        // in each org so the invariant is satisfied before we create a custom
        // role. Real orgs always have org_admin provisioned at signup.
        beforeEach(async () => {
            await seedRole({
                name: "org_admin",
                organizationId: orgId,
                isSystemRole: true,
                grants: { "staff.manage": true },
            });
        });

        test("creates role and returns DTO shape (no mongoose leakage)", async () => {
            const req = makeReq(orgId, actorId);

            const dto = await rolesService.createRole(req, {
                name: "front_desk",
                description: "front desk staff",
                permissions: { "patients.read": true },
            });

            // DTO contract: backend is authoritative (CLAUDE.md §7)
            expect(dto).toHaveProperty("id");
            expect(typeof dto.id).toBe("string");
            expect(dto).toHaveProperty("name", "front_desk");
            expect(dto).toHaveProperty("description", "front desk staff");
            expect(dto).toHaveProperty("isSystemRole", false);
            expect(dto).toHaveProperty("permissionVersion", PERMISSION_VERSION);
            expect(dto).toHaveProperty("userCount", 0);
            expect(Array.isArray(dto.permissions)).toBe(true);
            expect(dto.permissions).toContain("patients.read");

            // Mongoose doc fields must NOT leak through
            expect(dto._id).toBeUndefined();
            expect(dto.__v).toBeUndefined();
            expect(typeof dto.save).not.toBe("function");
        });

        test("rejects duplicate name (case-insensitive) with 409", async () => {
            const req = makeReq(orgId, actorId);

            await rolesService.createRole(req, {
                name: "receptionist_lead",
                description: "front desk lead",
                permissions: { "patients.read": true },
            });

            let err;
            try {
                await rolesService.createRole(req, {
                    name: "Receptionist_Lead", // same name, different case
                    permissions: { "patients.read": true },
                });
            } catch (e) {
                err = e;
            }
            expect(err).toBeDefined();
            expect(err.statusCode).toBe(409);
            // Either the soft check or the unique-index backstop is acceptable
            // — both are 409s that the controller maps to the same client error.
            expect([
                "ROLE_NAME_DUPLICATE",
                "ROLE_NAME_ALREADY_EXISTS",
            ]).toContain(err.errorCode);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("updateRole", () => {
        test("rejects any mutation on a system role with 403 SYSTEM_ROLE_IMMUTABLE", async () => {
            const req = makeReq(orgId, actorId);
            const sysRole = await seedRole({
                name: "org_admin",
                organizationId: orgId,
                isSystemRole: true,
                grants: { "staff.manage": true, "users.update": true },
            });

            let err;
            try {
                await rolesService.updateRole(req, {
                    roleId: sysRole._id.toString(),
                    patch: { description: "tamper" },
                });
            } catch (e) {
                err = e;
            }
            expect(err).toBeDefined();
            expect(err.statusCode).toBe(403);
            expect(err.errorCode).toBe("SYSTEM_ROLE_IMMUTABLE");
        });

        test("description-only update does NOT bump tokenVersion", async () => {
            // Must keep a separate STAFF_MANAGE role alive so the global
            // lockout invariant passes when we patch the target role.
            await seedRole({
                name: "org_admin",
                organizationId: orgId,
                isSystemRole: true,
                grants: { "staff.manage": true },
            });
            const target = await seedRole({
                name: "billing_clerk",
                organizationId: orgId,
                grants: { "patients.read": true },
            });
            const u = await seedUser({
                organizationId: orgId,
                roleId: target._id,
                email: "clerk@example.com",
            });

            const req = makeReq(orgId, actorId);
            const User = getModel(mongoose.connection, UserDef);
            const before = await User.findById(u._id).lean();

            const { role, invalidatedSessions } = await rolesService.updateRole(req, {
                roleId: target._id.toString(),
                patch: { description: "updated copy" },
            });

            const after = await User.findById(u._id).lean();

            // tokenVersion unchanged — description is metadata, no JWT bump
            expect(after.tokenVersion).toBe(before.tokenVersion || 0);
            expect(invalidatedSessions).toBe(0);

            // userCount must still be accurate — service queries it explicitly
            // on the no-bump path instead of reading the updateMany count.
            expect(role.userCount).toBe(1);
            expect(role.description).toBe("updated copy");
        });

        test("rename bumps tokenVersion on all assigned users", async () => {
            await seedRole({
                name: "org_admin",
                organizationId: orgId,
                isSystemRole: true,
                grants: { "staff.manage": true },
            });
            const target = await seedRole({
                name: "old_name",
                organizationId: orgId,
                grants: { "patients.read": true },
            });
            const u1 = await seedUser({
                organizationId: orgId,
                roleId: target._id,
                email: "u1@example.com",
            });
            const u2 = await seedUser({
                organizationId: orgId,
                roleId: target._id,
                email: "u2@example.com",
            });

            const req = makeReq(orgId, actorId);
            const User = getModel(mongoose.connection, UserDef);

            const { role, invalidatedSessions } = await rolesService.updateRole(req, {
                roleId: target._id.toString(),
                patch: { name: "new_name" },
            });

            expect(role.name).toBe("new_name");
            expect(invalidatedSessions).toBe(2);
            expect(role.userCount).toBe(2);

            const [f1, f2] = await Promise.all([
                User.findById(u1._id).lean(),
                User.findById(u2._id).lean(),
            ]);
            expect(f1.tokenVersion).toBe(1);
            expect(f2.tokenVersion).toBe(1);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("deleteRole", () => {
        test("rejects when users are still assigned (409)", async () => {
            const req = makeReq(orgId, actorId);
            // Separate admin role so the lockout check doesn't fire first.
            await seedRole({
                name: "org_admin",
                organizationId: orgId,
                isSystemRole: true,
                grants: { "staff.manage": true },
            });
            const custom = await seedRole({
                name: "billing_clerk",
                organizationId: orgId,
                grants: { "patients.read": true },
            });
            await seedUser({
                organizationId: orgId,
                roleId: custom._id,
                email: "clerk1@example.com",
            });

            let err;
            try {
                await rolesService.deleteRole(req, { roleId: custom._id.toString() });
            } catch (e) {
                err = e;
            }
            expect(err).toBeDefined();
            expect(err.statusCode).toBe(409);
            expect(err.errorCode).toBe("ROLE_HAS_USERS_ASSIGNED");
        });

        test("rejects removing the last staff.manage role", async () => {
            const req = makeReq(orgId, actorId);
            const onlyAdmin = await seedRole({
                name: "custom_admin",
                organizationId: orgId,
                grants: { "staff.manage": true },
            });
            // No users on it, so D3 passes — D4 must catch it.

            let err;
            try {
                await rolesService.deleteRole(req, { roleId: onlyAdmin._id.toString() });
            } catch (e) {
                err = e;
            }
            expect(err).toBeDefined();
            expect(err.statusCode).toBe(409);
            expect(err.errorCode).toBe("LOCKOUT_PREVENTED_NO_STAFF_MANAGE_ROLE");
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("assignRoleToUser", () => {
        test("returns forceRefresh=true when actor reassigns self", async () => {
            const adminA = await seedRole({
                name: "org_admin",
                organizationId: orgId,
                isSystemRole: true,
                grants: { "staff.manage": true, "users.update": true },
            });
            const adminB = await seedRole({
                name: "super_admin",
                organizationId: orgId,
                grants: { "staff.manage": true, "users.update": true },
            });
            // Guarantee a second active admin so A3 lockout doesn't fire.
            await seedUser({
                organizationId: orgId,
                roleId: adminA._id,
                email: "other-admin@example.com",
            });
            const self = await seedUser({
                organizationId: orgId,
                roleId: adminA._id,
                email: "me@example.com",
            });

            const req = makeReq(orgId, self._id);

            const result = await rolesService.assignRoleToUser(req, {
                userId: self._id.toString(),
                roleId: adminB._id.toString(),
            });

            expect(result.forceRefresh).toBe(true);
            expect(result.noop).toBe(false);

            const User = getModel(mongoose.connection, UserDef);
            const fresh = await User.findById(self._id).lean();
            expect(fresh.tokenVersion).toBe(1);
            expect(fresh.roleId.toString()).toBe(adminB._id.toString());
        });

        test("no-op short-circuit when assigning the user's current role", async () => {
            await seedRole({
                name: "org_admin",
                organizationId: orgId,
                isSystemRole: true,
                grants: { "staff.manage": true },
            });
            const role = await seedRole({
                name: "receptionist",
                organizationId: orgId,
                grants: { "patients.read": true },
            });
            const u = await seedUser({
                organizationId: orgId,
                roleId: role._id,
                email: "rec@example.com",
            });

            const req = makeReq(orgId, actorId);
            const User = getModel(mongoose.connection, UserDef);
            const before = await User.findById(u._id).lean();

            const result = await rolesService.assignRoleToUser(req, {
                userId: u._id.toString(),
                roleId: role._id.toString(),
            });

            expect(result.noop).toBe(true);
            expect(result.forceRefresh).toBe(false);

            // No token bump on a no-op — prevents infinite refresh loops.
            const after = await User.findById(u._id).lean();
            expect(after.tokenVersion).toBe(before.tokenVersion || 0);
            expect(after.roleId.toString()).toBe(role._id.toString());
        });

        test("rejects demoting the last active administrator + rolls back", async () => {
            const adminRole = await seedRole({
                name: "org_admin",
                organizationId: orgId,
                isSystemRole: true,
                grants: { "staff.manage": true, "users.update": true },
            });
            const staffRole = await seedRole({
                name: "receptionist",
                organizationId: orgId,
                grants: { "patients.read": true },
            });
            // Exactly ONE admin user in the whole org.
            const lastAdmin = await seedUser({
                organizationId: orgId,
                roleId: adminRole._id,
                email: "only-admin@example.com",
            });

            const req = makeReq(orgId, actorId);

            let err;
            try {
                await rolesService.assignRoleToUser(req, {
                    userId: lastAdmin._id.toString(),
                    roleId: staffRole._id.toString(),
                });
            } catch (e) {
                err = e;
            }
            expect(err).toBeDefined();
            expect(err.statusCode).toBe(409);
            expect(err.errorCode).toBe("STAFF_MANAGE_LOCKOUT");

            // Transaction rolled back — user's role + tokenVersion unchanged.
            const User = getModel(mongoose.connection, UserDef);
            const fresh = await User.findById(lastAdmin._id).lean();
            expect(fresh.roleId.toString()).toBe(adminRole._id.toString());
            expect(fresh.tokenVersion || 0).toBe(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    describe("listRoles", () => {
        test("returns accurate userCount per role + sum invariant + sort contract", async () => {
            const adminRole = await seedRole({
                name: "org_admin",
                organizationId: orgId,
                isSystemRole: true,
                grants: { "staff.manage": true },
            });
            const recRole = await seedRole({
                name: "receptionist",
                organizationId: orgId,
                grants: { "patients.read": true },
            });
            const unusedRole = await seedRole({ // eslint-disable-line no-unused-vars
                name: "lab_tech",
                organizationId: orgId,
                grants: { "patients.read": true },
            });

            await seedUser({ organizationId: orgId, roleId: adminRole._id, email: "a@x.com" });
            await seedUser({ organizationId: orgId, roleId: recRole._id, email: "r1@x.com" });
            await seedUser({ organizationId: orgId, roleId: recRole._id, email: "r2@x.com" });
            await seedUser({ organizationId: orgId, roleId: recRole._id, email: "r3@x.com" });
            const totalUsers = 4;

            const req = makeReq(orgId, actorId);
            const list = await rolesService.listRoles(req);

            const byName = new Map(list.map((r) => [r.name, r]));
            expect(byName.get("org_admin").userCount).toBe(1);
            expect(byName.get("receptionist").userCount).toBe(3);
            expect(byName.get("lab_tech").userCount).toBe(0);

            // Sum invariant — no double counting, no leakage.
            const summed = list.reduce((acc, r) => acc + r.userCount, 0);
            expect(summed).toBe(totalUsers);

            // Sort contract — system roles first.
            expect(list[0].isSystemRole).toBe(true);
        });
    });
});
