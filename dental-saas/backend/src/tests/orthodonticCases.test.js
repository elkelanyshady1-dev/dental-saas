/**
 * orthodonticCases.test.js — Orthodontic Case Unit Tests
 * Phase 4 — Orthodontic Intelligence
 *
 * Tests:
 * 1. OrthodonticCase model schema
 * 2. Organization isolation
 * 3. RBAC permission mapping
 * 4. Case FSM transitions
 * 5. Validator logic
 * 6. Service contract
 * 7. Route architecture
 */

"use strict";

// ─── 1. Model Schema ─────────────────────────────────────────────────────────

describe("OrthodonticCase Model — Schema Enforcement", () => {
    const OrthodonticCase = require("../modules/orthodontics/models/orthodonticCase.model").default;
    const schema = OrthodonticCase.schema;

    test("organizationId is required", () => {
        const field = schema.path("organizationId");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("treatmentCaseId is required", () => {
        expect(schema.path("treatmentCaseId").isRequired).toBe(true);
    });

    test("malocclusionClass has correct enum values", () => {
        const field = schema.path("malocclusionClass");
        expect(field.enumValues).toEqual([
            "CLASS_I", "CLASS_II_DIV_1", "CLASS_II_DIV_2", "CLASS_III"
        ]);
    });

    test("malocclusionClass is required", () => {
        expect(schema.path("malocclusionClass").isRequired).toBe(true);
    });

    test("scanFilePath defaults to null", () => {
        expect(schema.path("scanFilePath").defaultValue).toBe(null);
    });

    test("lastToothAnalysis subdocument exists", () => {
        expect(schema.path("lastToothAnalysis")).toBeDefined();
    });

    test("extractionPlan field exists", () => {
        expect(schema.path("extractionPlan")).toBeDefined();
    });

    test("estimatedDurationMonths field exists", () => {
        expect(schema.path("estimatedDurationMonths")).toBeDefined();
    });
});

// ─── 2. Organization Isolation ────────────────────────────────────────────────

describe("OrthodonticCase — Organization Isolation", () => {
    test("organizationId is ObjectId", () => {
        const OrthodonticCase = require("../modules/orthodontics/models/orthodonticCase.model").default;
        const field = OrthodonticCase.schema.path("organizationId");
        expect(field.instance).toBe("ObjectID");
        expect(field.isRequired).toBe(true);
    });
});

// ─── 3. RBAC Permissions ──────────────────────────────────────────────────────

describe("Orthodontic RBAC Permissions — Phase 30 FINAL (two-permission model)", () => {
    const { P, ORG_ROLE_PERMISSIONS } = require("../rbac/orgPermissions");

    test("only orthodontics.full and orthodontics.read exist in P enum", () => {
        // Phase 30 FINAL: granular engine perms are gone
        expect(P.ORTHO_FULL).toBe("orthodontics.full");
        expect(P.ORTHO_READ).toBe("orthodontics.read");
        expect(P.ORTHODONTICS_CREATE).toBeUndefined();
        expect(P.ORTHODONTICS_UPDATE).toBeUndefined();
        expect(P.ORTHODONTICS_DELETE).toBeUndefined();
        expect(P.ORTHO_MANAGE).toBeUndefined();
    });

    test("org_admin has orthodontics.full (not granular perms)", () => {
        const perms = ORG_ROLE_PERMISSIONS.org_admin;
        expect(perms).toContain(P.ORTHO_FULL);
        expect(perms).not.toContain("orthodontics.create");
        expect(perms).not.toContain("orthodontics.manage");
    });

    test("doctor has read + create + update but NOT delete", () => {
        const perms = ORG_ROLE_PERMISSIONS.doctor;
        expect(perms).toContain(P.ORTHODONTICS_READ);
        expect(perms).toContain(P.ORTHODONTICS_CREATE);
        expect(perms).toContain(P.ORTHODONTICS_UPDATE);
        expect(perms).not.toContain(P.ORTHODONTICS_DELETE);
    });

    test("assistant has read only", () => {
        const perms = ORG_ROLE_PERMISSIONS.assistant;
        expect(perms).toContain(P.ORTHODONTICS_READ);
        expect(perms).not.toContain(P.ORTHODONTICS_CREATE);
    });

    test("receptionist has NO orthodontic permissions", () => {
        const perms = ORG_ROLE_PERMISSIONS.receptionist;
        expect(perms).not.toContain(P.ORTHODONTICS_READ);
    });

    test("lab_technician has NO orthodontic permissions", () => {
        const perms = ORG_ROLE_PERMISSIONS.lab_technician;
        expect(perms).not.toContain(P.ORTHODONTICS_READ);
    });
});

// ─── 4. Case FSM ─────────────────────────────────────────────────────────────

describe("OrthodonticCase FSM — Status Transitions", () => {
    const { CASE_TRANSITIONS, validateCaseTransition } = require("../modules/orthodontics/services/orthodonticCase.service");

    // Valid transitions
    test("draft → diagnosis (valid)", () => {
        expect(validateCaseTransition("draft", "diagnosis").valid).toBe(true);
    });

    test("diagnosis → treatment_planning (valid)", () => {
        expect(validateCaseTransition("diagnosis", "treatment_planning").valid).toBe(true);
    });

    test("diagnosis → draft (valid — allowed backtrack)", () => {
        expect(validateCaseTransition("diagnosis", "draft").valid).toBe(true);
    });

    test("treatment_planning → active (valid)", () => {
        expect(validateCaseTransition("treatment_planning", "active").valid).toBe(true);
    });

    test("treatment_planning → diagnosis (valid — allowed backtrack)", () => {
        expect(validateCaseTransition("treatment_planning", "diagnosis").valid).toBe(true);
    });

    test("active → completed (valid)", () => {
        expect(validateCaseTransition("active", "completed").valid).toBe(true);
    });

    // Invalid transitions
    test("completed → anything (REJECTED — terminal)", () => {
        expect(validateCaseTransition("completed", "draft").valid).toBe(false);
        expect(validateCaseTransition("completed", "active").valid).toBe(false);
    });

    test("draft → active (REJECTED — must go through diagnosis)", () => {
        expect(validateCaseTransition("draft", "active").valid).toBe(false);
    });

    test("draft → completed (REJECTED — must go through full lifecycle)", () => {
        expect(validateCaseTransition("draft", "completed").valid).toBe(false);
    });

    test("unknown status (REJECTED)", () => {
        expect(validateCaseTransition("nonexistent", "draft").valid).toBe(false);
    });

    // Completeness
    test("all 5 statuses have defined transition rules", () => {
        for (const status of ["draft", "diagnosis", "treatment_planning", "active", "completed"]) {
            expect(CASE_TRANSITIONS[status]).toBeDefined();
            expect(Array.isArray(CASE_TRANSITIONS[status])).toBe(true);
        }
    });

    test("completed is terminal (empty transitions)", () => {
        expect(CASE_TRANSITIONS["completed"]).toEqual([]);
    });
});

// ─── 5. Validator ─────────────────────────────────────────────────────────────

describe("OrthodonticCase Validator", () => {
    const { validateCreateCase, validateUpdateCase } = require("../modules/orthodontics/validators/orthodonticCase.validator");

    test("reject missing patientId", () => {
        const r = validateCreateCase({ malocclusionClass: "CLASS_I" });
        expect(r.error).toContain("patientId");
    });

    test("reject missing malocclusionClass", () => {
        const r = validateCreateCase({ patientId: "abc123" });
        expect(r.error).toContain("malocclusionClass");
    });

    test("reject invalid malocclusionClass", () => {
        const r = validateCreateCase({ patientId: "abc", malocclusionClass: "INVALID" });
        expect(r.error).toContain("malocclusionClass");
    });

    test("accept valid payload", () => {
        const r = validateCreateCase({ patientId: "abc", malocclusionClass: "CLASS_I" });
        expect(r.error).toBeNull();
    });

    test("reject invalid caseType", () => {
        const r = validateCreateCase({ patientId: "abc", malocclusionClass: "CLASS_I", caseType: "invalid" });
        expect(r.error).toContain("caseType");
    });

    test("accept valid caseType", () => {
        const r = validateCreateCase({ patientId: "abc", malocclusionClass: "CLASS_I", caseType: "aligner" });
        expect(r.error).toBeNull();
    });

    test("update: accept empty payload", () => {
        expect(validateUpdateCase({}).error).toBeNull();
    });
});

// ─── 6. Service Contract ──────────────────────────────────────────────────────

describe("OrthodonticCase Service — Contract", () => {
    const service = require("../modules/orthodontics/services/orthodonticCase.service");

    test("exports createCase", () => {
        expect(typeof service.createCase).toBe("function");
    });

    test("exports listCases", () => {
        expect(typeof service.listCases).toBe("function");
    });

    test("exports getCaseById", () => {
        expect(typeof service.getCaseById).toBe("function");
    });

    test("exports updateCaseStatus", () => {
        expect(typeof service.updateCaseStatus).toBe("function");
    });

    test("exports registerScan", () => {
        expect(typeof service.registerScan).toBe("function");
    });

    test("exports listScans", () => {
        expect(typeof service.listScans).toBe("function");
    });

    test("exports triggerSegmentation", () => {
        expect(typeof service.triggerSegmentation).toBe("function");
    });

    test("exports triggerCephAnalysis", () => {
        expect(typeof service.triggerCephAnalysis).toBe("function");
    });

    test("exports getSegmentationResults", () => {
        expect(typeof service.getSegmentationResults).toBe("function");
    });

    test("exports getCephResults", () => {
        expect(typeof service.getCephResults).toBe("function");
    });

    test("exports createAlignerPlan", () => {
        expect(typeof service.createAlignerPlan).toBe("function");
    });

    test("exports listAlignerPlans", () => {
        expect(typeof service.listAlignerPlans).toBe("function");
    });

    test("exports getAlignerPlanById", () => {
        expect(typeof service.getAlignerPlanById).toBe("function");
    });
});

// ─── 7. Route Architecture ───────────────────────────────────────────────────

describe("OrthodonticCase Routes — Architecture", () => {
    test("routes module exports express Router", () => {
        const routes = require("../modules/orthodontics/routes/orthodonticCase.routes");
        expect(routes).toBeDefined();
        expect(typeof routes).toBe("function");
    });
});
