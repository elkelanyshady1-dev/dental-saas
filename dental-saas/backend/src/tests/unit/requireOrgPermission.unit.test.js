/**
 * requireOrgPermission.unit.test.js — RBAC denial/allow coverage
 *
 * Validates that the core org RBAC gate enforces the permission Set SSOT:
 *   - denies when permission is missing
 *   - denies when permissionSet is not a Set (fail-closed)
 *   - denies when the user has no role
 *   - allows when permission is present
 *
 * These tests protect the fixes landed with Phase A (inline role checks
 * removed — RBAC is the only gate). If any future change re-introduces a
 * role-name shortcut, these tests must still pass via the permission Set.
 *
 * Pure unit test: no DB, no Express, all dependencies mocked.
 */

"use strict";

// ─── Mocks ────────────────────────────────────────────────────────────────────
jest.mock("../../utils/logger", () => ({
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

jest.mock("../../services/auditService", () => ({
    createAuditRecord: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../rbac/permissionValidator", () => ({
    assertValidPermission: jest.fn(), // accept any string at mount time
    getValidPermissionKeys: () => new Set(["patients.create", "staff.manage", "users.read"]),
}));

jest.mock("@utils/auth/getRole", () => ({
    getRole: (req) => req.user?.roleName || req.user?.role || null,
}));

const requireOrgPermission = require("../../middleware/requireOrgPermission");

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildReq({ permissions, roleName = "receptionist", userId = "u1", orgId = "o1" } = {}) {
    return {
        user: {
            _id: userId,
            organizationId: orgId,
            roleName,
            role: roleName,
        },
        authContext: {
            permissionSet: permissions, // Set or undefined
        },
        requestId: "req-test",
        originalUrl: "/api/v1/org/test",
        method: "POST",
        ip: "127.0.0.1",
        headers: { "user-agent": "jest" },
        addAuthTrace: jest.fn(),
    };
}

function buildRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("requireOrgPermission — RBAC denial/allow SSOT", () => {

    test("denies 403 when user has no role assigned", () => {
        const guard = requireOrgPermission("patients.create");
        const req = buildReq({ permissions: new Set(["patients.create"]), roleName: null });
        req.user.role = null;
        const res = buildRes();
        const next = jest.fn();

        guard(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            error: expect.objectContaining({ code: "NO_ROLE_ASSIGNED" }),
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test("denies 500 (fail-closed) when permissionSet is missing from authContext", () => {
        const guard = requireOrgPermission("patients.create");
        const req = buildReq({ permissions: undefined });
        const res = buildRes();
        const next = jest.fn();

        guard(req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.objectContaining({ code: "AUTH_CONTEXT_INVALID" }),
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test("denies 500 (fail-closed) when permissionSet is an Array instead of a Set", () => {
        const guard = requireOrgPermission("patients.create");
        // Array is truthy but NOT an instanceof Set — guard must reject.
        const req = buildReq({ permissions: ["patients.create"] });
        const res = buildRes();
        const next = jest.fn();

        guard(req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(next).not.toHaveBeenCalled();
    });

    test("denies 403 when permission is missing from the Set", () => {
        const guard = requireOrgPermission("patients.create");
        const req = buildReq({ permissions: new Set(["patients.read"]) });
        const res = buildRes();
        const next = jest.fn();

        guard(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.objectContaining({ code: "PERMISSION_DENIED" }),
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test("denies 403 for receptionist attempting staff.manage (post-Phase-A: no org_admin shortcut)", () => {
        // Before Phase A, some helpers short-circuited on role === "org_admin"
        // regardless of permissions. This test locks in the inverse: a user
        // whose permission Set does NOT contain the required permission is
        // denied regardless of role name.
        const guard = requireOrgPermission("staff.manage");
        const req = buildReq({
            permissions: new Set(["patients.read", "appointments.read"]),
            roleName: "receptionist",
        });
        const res = buildRes();
        const next = jest.fn();

        guard(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test("denies 403 when roleName claims org_admin but the Set lacks the permission", () => {
        // Hard regression test: even if a user claims role=org_admin in the
        // JWT payload, the Set is authoritative. A stale / spoofed role name
        // must not bypass the RBAC gate. This guards against reintroduction
        // of inline `role === "org_admin"` shortcuts anywhere upstream.
        const guard = requireOrgPermission("staff.manage");
        const req = buildReq({
            permissions: new Set(["patients.read"]), // deliberately narrow
            roleName: "org_admin",
        });
        const res = buildRes();
        const next = jest.fn();

        guard(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test("allows when permission is present in the Set", () => {
        const guard = requireOrgPermission("patients.create");
        const req = buildReq({ permissions: new Set(["patients.create", "patients.read"]) });
        const res = buildRes();
        const next = jest.fn();

        guard(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test("allows org_admin only when the Set actually contains the permission", () => {
        // org_admin's legitimate path is: Set contains the permission because
        // ORG_ROLE_PERMISSIONS.org_admin grants every P.* — not because of a
        // role-name shortcut. This test proves the allow path still works.
        const guard = requireOrgPermission("staff.manage");
        const req = buildReq({
            permissions: new Set(["staff.manage", "patients.read", "users.create"]),
            roleName: "org_admin",
        });
        const res = buildRes();
        const next = jest.fn();

        guard(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    test("throws at mount time when given a non-string permission", () => {
        expect(() => requireOrgPermission(undefined)).toThrow(/Invalid permission/);
        expect(() => requireOrgPermission(null)).toThrow(/Invalid permission/);
        expect(() => requireOrgPermission(123)).toThrow(/Invalid permission/);
    });
});
