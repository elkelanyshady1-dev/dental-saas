/**
 * rolesValidators.unit.test.js — Phase B validator unit tests
 *
 * Pure Zod schema tests. No DB, no service, no mongoose. Runs in the `unit`
 * jest project (no setup.js, no MongoMemoryReplSet).
 *
 * Coverage:
 *   roleNameSchema       — regex + length boundaries
 *   permissionsMapSchema — superRefine against permissionRegistry SSOT
 *   createRoleSchema     — strict, non-empty grants, description length
 *   updateRoleSchema     — strict, at-least-one-field, optional semantics
 *   assignRoleSchema     — ObjectId validation, strict
 */

"use strict";

const {
    createRoleSchema,
    updateRoleSchema,
    assignRoleSchema,
    permissionsMapSchema,
    roleNameSchema,
} = require("@modules/authorization/roles/roles.validators");
const { generatePermissionKeys } = require("@rbac/permissionRegistry");

// A handful of keys we know exist in the SSOT — picked dynamically so this
// file never drifts if the registry changes.
const validKeys = generatePermissionKeys();
const SAMPLE_VALID_KEY = validKeys.find((k) => k.startsWith("patients.")) || validKeys[0];
const SAMPLE_VALID_KEY_2 = validKeys.find((k) => k.startsWith("staff.")) || validKeys[1];

describe("roleNameSchema", () => {
    test("accepts valid slug names", () => {
        expect(roleNameSchema.safeParse("org_admin").success).toBe(true);
        expect(roleNameSchema.safeParse("billing_clerk").success).toBe(true);
        expect(roleNameSchema.safeParse("lab_tech_2").success).toBe(true);
    });

    test("rejects uppercase letters", () => {
        expect(roleNameSchema.safeParse("Org_Admin").success).toBe(false);
    });

    test("rejects names starting with digit or underscore", () => {
        expect(roleNameSchema.safeParse("1admin").success).toBe(false);
        expect(roleNameSchema.safeParse("_admin").success).toBe(false);
    });

    test("rejects hyphens and spaces", () => {
        expect(roleNameSchema.safeParse("org-admin").success).toBe(false);
        expect(roleNameSchema.safeParse("org admin").success).toBe(false);
    });

    test("enforces min length (2)", () => {
        expect(roleNameSchema.safeParse("a").success).toBe(false);
        expect(roleNameSchema.safeParse("ab").success).toBe(true);
    });

    test("enforces max length (40)", () => {
        expect(roleNameSchema.safeParse("a".repeat(40)).success).toBe(true);
        expect(roleNameSchema.safeParse("a".repeat(41)).success).toBe(false);
    });
});

describe("permissionsMapSchema", () => {
    test("accepts valid permission keys from the SSOT registry", () => {
        const result = permissionsMapSchema.safeParse({
            [SAMPLE_VALID_KEY]: true,
            [SAMPLE_VALID_KEY_2]: false,
        });
        expect(result.success).toBe(true);
    });

    test("rejects unknown permission keys", () => {
        const result = permissionsMapSchema.safeParse({
            [SAMPLE_VALID_KEY]: true,
            "unknown.permission": true,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            // The offending key must appear in the issue path, not just the message
            const flagged = result.error.issues.some(
                (iss) => iss.path.includes("unknown.permission"),
            );
            expect(flagged).toBe(true);
        }
    });

    test("rejects keys with typos that look plausible", () => {
        const result = permissionsMapSchema.safeParse({
            "patient.read": true, // missing 's' — should fail even if patients.read exists
        });
        // Only passes if 'patient.read' genuinely exists in the registry;
        // otherwise must fail. Assert based on SSOT truth.
        const registryHas = validKeys.includes("patient.read");
        expect(result.success).toBe(registryHas);
    });

    test("empty permissions object is structurally valid (zero keys to check)", () => {
        const result = permissionsMapSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    test("rejects non-boolean values", () => {
        const result = permissionsMapSchema.safeParse({
            [SAMPLE_VALID_KEY]: "yes",
        });
        expect(result.success).toBe(false);
    });
});

describe("createRoleSchema", () => {
    test("accepts minimal valid payload", () => {
        const result = createRoleSchema.safeParse({
            name: "billing_clerk",
            permissions: { [SAMPLE_VALID_KEY]: true },
        });
        expect(result.success).toBe(true);
    });

    test("accepts payload with description", () => {
        const result = createRoleSchema.safeParse({
            name: "billing_clerk",
            description: "handles billing & collections",
            permissions: { [SAMPLE_VALID_KEY]: true },
        });
        expect(result.success).toBe(true);
    });

    test("rejects empty-grants permissions (all false)", () => {
        const result = createRoleSchema.safeParse({
            name: "useless_role",
            permissions: { [SAMPLE_VALID_KEY]: false },
        });
        expect(result.success).toBe(false);
    });

    test("rejects completely empty permissions object on create", () => {
        const result = createRoleSchema.safeParse({
            name: "useless_role",
            permissions: {},
        });
        // {} is structurally valid for the map but fails the .refine
        // (some(v => v === true) is false).
        expect(result.success).toBe(false);
    });

    test("rejects unknown top-level keys (strict)", () => {
        const result = createRoleSchema.safeParse({
            name: "billing_clerk",
            permissions: { [SAMPLE_VALID_KEY]: true },
            isSystemRole: true, // attempt to smuggle system-role flag
        });
        expect(result.success).toBe(false);
    });

    test("rejects description above 500 chars", () => {
        const result = createRoleSchema.safeParse({
            name: "billing_clerk",
            description: "x".repeat(501),
            permissions: { [SAMPLE_VALID_KEY]: true },
        });
        expect(result.success).toBe(false);
    });

    test("accepts description at exactly 500 chars", () => {
        const result = createRoleSchema.safeParse({
            name: "billing_clerk",
            description: "x".repeat(500),
            permissions: { [SAMPLE_VALID_KEY]: true },
        });
        expect(result.success).toBe(true);
    });

    test("rejects invalid permission keys even when shape is otherwise valid", () => {
        const result = createRoleSchema.safeParse({
            name: "billing_clerk",
            permissions: { "not.a.real.key": true },
        });
        expect(result.success).toBe(false);
    });
});

describe("updateRoleSchema", () => {
    test("accepts description-only patch", () => {
        const result = updateRoleSchema.safeParse({ description: "new desc" });
        expect(result.success).toBe(true);
    });

    test("accepts name-only patch", () => {
        const result = updateRoleSchema.safeParse({ name: "new_name" });
        expect(result.success).toBe(true);
    });

    test("accepts permissions-only patch", () => {
        const result = updateRoleSchema.safeParse({
            permissions: { [SAMPLE_VALID_KEY]: true },
        });
        expect(result.success).toBe(true);
    });

    test("accepts empty permissions map on update (allows stripping all grants)", () => {
        // Note: the service layer's STAFF_MANAGE invariants are the real
        // guardrail against a dangerous update; the validator only enforces
        // shape. Stripping all grants must be POSSIBLE at the schema level
        // — the service lockout check is what blocks unsafe cases.
        const result = updateRoleSchema.safeParse({ permissions: {} });
        expect(result.success).toBe(true);
    });

    test("rejects completely empty patch", () => {
        const result = updateRoleSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    test("rejects unknown top-level keys (strict)", () => {
        const result = updateRoleSchema.safeParse({
            description: "new",
            isSystemRole: false, // attempt to flip immutability
        });
        expect(result.success).toBe(false);
    });

    test("rejects invalid permission keys in update", () => {
        const result = updateRoleSchema.safeParse({
            permissions: { "bogus.key": true },
        });
        expect(result.success).toBe(false);
    });
});

describe("assignRoleSchema", () => {
    test("accepts valid ObjectIds", () => {
        const result = assignRoleSchema.safeParse({
            userId: "507f1f77bcf86cd799439011",
            roleId: "507f1f77bcf86cd799439012",
        });
        expect(result.success).toBe(true);
    });

    test("rejects non-ObjectId userId", () => {
        const result = assignRoleSchema.safeParse({
            userId: "not-an-objectid",
            roleId: "507f1f77bcf86cd799439012",
        });
        expect(result.success).toBe(false);
    });

    test("rejects missing roleId", () => {
        const result = assignRoleSchema.safeParse({
            userId: "507f1f77bcf86cd799439011",
        });
        expect(result.success).toBe(false);
    });

    test("rejects unknown keys (strict)", () => {
        const result = assignRoleSchema.safeParse({
            userId: "507f1f77bcf86cd799439011",
            roleId: "507f1f77bcf86cd799439012",
            bumpTokens: true,
        });
        expect(result.success).toBe(false);
    });
});
