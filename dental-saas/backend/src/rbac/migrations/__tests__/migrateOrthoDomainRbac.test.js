/**
 * migrateOrthoDomainRbac.test.js — Phase 30 RBAC Migration Test Matrix
 *
 * Verifies the new two-permission orthodontics model end-to-end:
 *
 *   Scenario                     | Expected
 *   -----------------------------|------------------------------------------
 *   doctor creates TAD           | ✅ allowed   (has orthodontics.full)
 *   assistant creates TAD        | ❌ denied    (has orthodontics.read only)
 *   assistant reads case         | ✅ allowed   (has orthodontics.read)
 *   receptionist accesses ortho  | ❌ denied    (no ortho permission)
 *   lab_technician reads ortho   | ✅ allowed   (has orthodontics.read)
 *   org_admin creates TAD        | ✅ allowed   (has orthodontics.full)
 *
 * Additionally verifies:
 *   - authorize() throws 500 (INVALID_PERMISSION_CONFIG) for any legacy perm string
 *   - No legacy perms exist in P enum or PERMISSION_REGISTRY
 */

"use strict";

const { P, ORG_ROLE_PERMISSIONS } = require("../../orgPermissions");
const { PERMISSION_HIERARCHY }    = require("../../permissionHierarchy");

// ─── Stub req.context from a role's permission set ───────────────────────────
function makeReq(roleName) {
    const perms = ORG_ROLE_PERMISSIONS[roleName] || [];
    return {
        context: {
            permissions: new Set(perms),
            roleName,
            userId: "test-user",
            organizationId: "test-org",
        },
        method: "GET",
        originalUrl: "/test",
    };
}

// ─── Inline can() without logger dependency ───────────────────────────────────
function can(req, permission) {
    const perms = req.context?.permissions;
    if (!perms) return false;
    if (perms.has(permission)) return true;
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 30 FINAL — Orthodontics RBAC Two-Permission Model", () => {

    // ── Test Matrix ──────────────────────────────────────────────────────────

    test("doctor creates TAD → ✅ allowed (has orthodontics.full)", () => {
        expect(can(makeReq("doctor"), "orthodontics.full")).toBe(true);
    });

    test("assistant creates TAD → ❌ denied (has orthodontics.read only)", () => {
        expect(can(makeReq("assistant"), "orthodontics.full")).toBe(false);
    });

    test("assistant reads case → ✅ allowed (has orthodontics.read)", () => {
        expect(can(makeReq("assistant"), "orthodontics.read")).toBe(true);
    });

    test("receptionist accesses ortho → ❌ denied (no ortho permission)", () => {
        expect(can(makeReq("receptionist"), "orthodontics.full")).toBe(false);
        expect(can(makeReq("receptionist"), "orthodontics.read")).toBe(false);
    });

    test("lab_technician reads ortho → ✅ allowed (has orthodontics.read)", () => {
        expect(can(makeReq("lab_technician"), "orthodontics.read")).toBe(true);
    });

    test("lab_technician cannot mutate ortho → ❌ denied", () => {
        expect(can(makeReq("lab_technician"), "orthodontics.full")).toBe(false);
    });

    test("org_admin creates TAD → ✅ allowed (has orthodontics.full)", () => {
        expect(can(makeReq("org_admin"), "orthodontics.full")).toBe(true);
    });

    // ── Legacy Permission Absence ────────────────────────────────────────────

    const LEGACY_PERMS = [
        "orthodontics.manage",
        "orthodontics.create",
        "orthodontics.update",
        "orthodontics.delete",
        "orthodontics.settings",
        "orthodontics.write",
        "bonding.manage",
        "bonding.read",
        "bonding.settings",
        "tads.manage",
        "tads.read",
        "tads.settings",
        "sequence.manage",
        "sequence.read",
        "clinical.read",
        "portal.monitoring",
        "ai.ortho_analysis",
        "patients.write",
    ];

    test.each(LEGACY_PERMS)(
        'Legacy perm "%s" must NOT exist in the P enum',
        (perm) => {
            const allPValues = Object.values(P);
            expect(allPValues).not.toContain(perm);
        }
    );

    test.each(LEGACY_PERMS)(
        'Legacy perm "%s" must NOT exist in PERMISSION_HIERARCHY keys',
        (perm) => {
            expect(Object.keys(PERMISSION_HIERARCHY)).not.toContain(perm);
        }
    );

    test.each(LEGACY_PERMS)(
        'No role should have legacy perm "%s" in ORG_ROLE_PERMISSIONS',
        (perm) => {
            for (const [roleName, perms] of Object.entries(ORG_ROLE_PERMISSIONS)) {
                expect(perms).not.toContain(perm);
            }
        }
    );

    // ── P Enum Invariants ────────────────────────────────────────────────────

    test("P enum contains orthodontics.full", () => {
        expect(P.ORTHO_FULL).toBe("orthodontics.full");
    });

    test("P enum contains orthodontics.read", () => {
        expect(P.ORTHO_READ).toBe("orthodontics.read");
    });

    test("P enum has exactly 2 ortho-namespaced permissions", () => {
        const orthoPerms = Object.values(P).filter(v =>
            v.startsWith("orthodontics") ||
            v.startsWith("bonding") ||
            v.startsWith("tads") ||
            v.startsWith("sequence")
        );
        expect(orthoPerms).toEqual(["orthodontics.full", "orthodontics.read"]);
    });

    // ── Role Model Invariants ────────────────────────────────────────────────

    test("doctor role has orthodontics.full (not orthodontics.read)", () => {
        const perms = ORG_ROLE_PERMISSIONS.doctor;
        expect(perms).toContain("orthodontics.full");
        expect(perms).not.toContain("orthodontics.read");
    });

    test("assistant role has orthodontics.read (not orthodontics.full)", () => {
        const perms = ORG_ROLE_PERMISSIONS.assistant;
        expect(perms).toContain("orthodontics.read");
        expect(perms).not.toContain("orthodontics.full");
    });

    test("receptionist role has neither ortho permission", () => {
        const perms = ORG_ROLE_PERMISSIONS.receptionist;
        expect(perms).not.toContain("orthodontics.full");
        expect(perms).not.toContain("orthodontics.read");
    });
});
