/**
 * procedures.test.js — Procedure Catalog Unit Tests
 * Phase 3 — Clinical Operations
 *
 * Tests:
 * 1. Model schema enforcement
 * 2. Organization isolation
 * 3. RBAC permission mapping
 * 4. Validator logic
 * 5. Service contract
 * 6. Route architecture
 */

"use strict";

// ─── 1. Model Schema ─────────────────────────────────────────────────────────

describe("Procedure Model — Schema Enforcement", () => {
    const Procedure = require("../modules/procedures/models/Procedure.model").default;
    const schema = Procedure.schema;

    test("organizationId is required", () => {
        const field = schema.path("organizationId");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("code is required and trimmed", () => {
        const field = schema.path("code");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("name is required", () => {
        const field = schema.path("name");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("defaultPrice is required with min 0", () => {
        const field = schema.path("defaultPrice");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
        expect(field.options.min).toBe(0);
    });

    test("category has correct enum values", () => {
        const field = schema.path("category");
        expect(field).toBeDefined();
        expect(field.enumValues).toEqual([
            "diagnostic", "preventive", "restorative", "endodontic",
            "periodontic", "prosthodontic", "orthodontic", "oral_surgery",
            "implant", "cosmetic", "pediatric", "emergency", "other"
        ]);
    });

    test("category defaults to 'other'", () => {
        const field = schema.path("category");
        expect(field.defaultValue).toBe("other");
    });

    test("requiresTooth defaults to false", () => {
        const field = schema.path("requiresTooth");
        expect(field.defaultValue).toBe(false);
    });

    test("estimatedDuration defaults to 30", () => {
        const field = schema.path("estimatedDuration");
        expect(field.defaultValue).toBe(30);
    });

    test("isActive defaults to true", () => {
        const field = schema.path("isActive");
        expect(field.defaultValue).toBe(true);
    });

    test("version defaults to 0", () => {
        const field = schema.path("version");
        expect(field.defaultValue).toBe(0);
    });

    test("currency defaults to AED", () => {
        const field = schema.path("currency");
        expect(field.defaultValue).toBe("AED");
    });

    test("v8.2 precision field exists (defaultPriceMinor)", () => {
        expect(schema.path("defaultPriceMinor")).toBeDefined();
    });
});

// ─── 2. Organization Isolation ────────────────────────────────────────────────

describe("Procedure — Organization Isolation", () => {
    test("organizationId is ObjectId", () => {
        const Procedure = require("../modules/procedures/models/Procedure.model").default;
        const field = Procedure.schema.path("organizationId");
        expect(field.instance).toBe("ObjectID");
        expect(field.isRequired).toBe(true);
    });
});

// ─── 3. RBAC Permissions ──────────────────────────────────────────────────────

describe("Procedure RBAC Permissions", () => {
    const { P, ORG_ROLE_PERMISSIONS } = require("../rbac/orgPermissions");

    test("procedures.* permissions exist in the contract", () => {
        expect(P.PROCEDURES_READ).toBe("procedures.read");
        expect(P.PROCEDURES_CREATE).toBe("procedures.create");
        expect(P.PROCEDURES_UPDATE).toBe("procedures.update");
        expect(P.PROCEDURES_DELETE).toBe("procedures.delete");
    });

    test("org_admin has full procedure CRUD", () => {
        const perms = ORG_ROLE_PERMISSIONS.org_admin;
        expect(perms).toContain(P.PROCEDURES_READ);
        expect(perms).toContain(P.PROCEDURES_CREATE);
        expect(perms).toContain(P.PROCEDURES_UPDATE);
        expect(perms).toContain(P.PROCEDURES_DELETE);
    });

    test("doctor has read + create + update but NOT delete", () => {
        const perms = ORG_ROLE_PERMISSIONS.doctor;
        expect(perms).toContain(P.PROCEDURES_READ);
        expect(perms).toContain(P.PROCEDURES_CREATE);
        expect(perms).toContain(P.PROCEDURES_UPDATE);
        expect(perms).not.toContain(P.PROCEDURES_DELETE);
    });

    test("assistant has read only", () => {
        const perms = ORG_ROLE_PERMISSIONS.assistant;
        expect(perms).toContain(P.PROCEDURES_READ);
        expect(perms).not.toContain(P.PROCEDURES_CREATE);
    });

    test("receptionist has read only", () => {
        const perms = ORG_ROLE_PERMISSIONS.receptionist;
        expect(perms).toContain(P.PROCEDURES_READ);
        expect(perms).not.toContain(P.PROCEDURES_CREATE);
    });

    test("lab_technician has NO procedure permissions", () => {
        const perms = ORG_ROLE_PERMISSIONS.lab_technician;
        expect(perms).not.toContain(P.PROCEDURES_READ);
    });
});

// ─── 4. Validator Logic ──────────────────────────────────────────────────────

describe("Procedure Validator", () => {
    const { validateCreateProcedure, validateUpdateProcedure } = require("../modules/procedures/validators/procedures.validator");

    test("reject missing code", () => {
        const r = validateCreateProcedure({ name: "Test", defaultPrice: 100 });
        expect(r.error).toContain("code");
    });

    test("reject missing name", () => {
        const r = validateCreateProcedure({ code: "T1", defaultPrice: 100 });
        expect(r.error).toContain("name");
    });

    test("reject missing defaultPrice", () => {
        const r = validateCreateProcedure({ code: "T1", name: "Test" });
        expect(r.error).toContain("defaultPrice");
    });

    test("reject negative defaultPrice", () => {
        const r = validateCreateProcedure({ code: "T1", name: "Test", defaultPrice: -5 });
        expect(r.error).toContain("defaultPrice");
    });

    test("reject invalid category", () => {
        const r = validateCreateProcedure({ code: "T1", name: "Test", defaultPrice: 100, category: "invalid" });
        expect(r.error).toContain("category");
    });

    test("accept valid payload", () => {
        const r = validateCreateProcedure({ code: "T1", name: "Test", defaultPrice: 100, category: "diagnostic" });
        expect(r.error).toBeNull();
    });

    test("update: accept empty payload", () => {
        const r = validateUpdateProcedure({});
        expect(r.error).toBeNull();
    });

    test("update: reject short name", () => {
        const r = validateUpdateProcedure({ name: "X" });
        expect(r.error).toContain("name");
    });
});

// ─── 5. Service Contract ──────────────────────────────────────────────────────

describe("Procedure Service — Contract", () => {
    const service = require("../modules/procedures/services/procedures.service");

    test("exports createProcedure", () => {
        expect(typeof service.createProcedure).toBe("function");
    });

    test("exports listProcedures", () => {
        expect(typeof service.listProcedures).toBe("function");
    });

    test("exports getProcedureById", () => {
        expect(typeof service.getProcedureById).toBe("function");
    });

    test("exports updateProcedure", () => {
        expect(typeof service.updateProcedure).toBe("function");
    });

    test("exports deleteProcedure", () => {
        expect(typeof service.deleteProcedure).toBe("function");
    });
});

// ─── 6. Route Architecture ───────────────────────────────────────────────────

describe("Procedure Routes — Architecture", () => {
    test("routes module exports express Router", () => {
        const routes = require("../modules/procedures/routes/procedures.routes");
        expect(routes).toBeDefined();
        expect(typeof routes).toBe("function");
    });
});
