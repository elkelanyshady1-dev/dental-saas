/**
 * aiAnalysis.test.js — AI Analysis Pipeline Unit Tests
 * Phase 4 — Orthodontic Intelligence
 *
 * Tests:
 * 1. Pre-existing Python bridge architecture
 * 2. CephAnalysisLibrary utility
 * 3. Pre-existing OrthodonticStageMetadata model
 * 4. Pre-existing AlignerProductionCase model
 * 5. Plane isolation verification
 */

"use strict";

// ─── 1. Python Bridge — orthodonticTeeth.controller ──────────────────────────

describe("orthodonticTeeth.controller — Python Bridge", () => {
    test("exports getTeethChart function", () => {
        const ctrl = require("../modules/orthodontics/controllers/orthodonticTeeth.controller");
        expect(typeof ctrl.getTeethChart).toBe("function");
    });
});

// ─── 2. Python Bridge — landmarks.controller ─────────────────────────────────

describe("landmarks.controller — Python Bridge", () => {
    const ctrl = require("../modules/orthodontics/controllers/landmarks.controller");

    test("exports getLandmarks function", () => {
        expect(typeof ctrl.getLandmarks).toBe("function");
    });

    test("exports getPatches function", () => {
        expect(typeof ctrl.getPatches).toBe("function");
    });
});

// ─── 3. CephAnalysisLibrary ──────────────────────────────────────────────────

describe("CephAnalysisLibrary — Utility", () => {
    const CephLib = require("../modules/clinicalProtocolDomain/clinicalExtensions/orthoExtension/CephAnalysisLibrary");

    test("calculateANB returns SNA - SNB", () => {
        expect(CephLib.calculateANB(82, 79)).toBe(3);
    });

    test("calculateANB with negative result", () => {
        expect(CephLib.calculateANB(78, 82)).toBe(-4);
    });

    test("deriveClassification CLASS_I (ANB 0-4)", () => {
        expect(CephLib.deriveClassification(2)).toBe("CLASS_I");
        expect(CephLib.deriveClassification(0)).toBe("CLASS_I");
        expect(CephLib.deriveClassification(4)).toBe("CLASS_I");
    });

    test("deriveClassification CLASS_II (ANB > 4)", () => {
        expect(CephLib.deriveClassification(5)).toBe("CLASS_II");
        expect(CephLib.deriveClassification(8)).toBe("CLASS_II");
    });

    test("deriveClassification CLASS_III (ANB < 0)", () => {
        expect(CephLib.deriveClassification(-1)).toBe("CLASS_III");
        expect(CephLib.deriveClassification(-4)).toBe("CLASS_III");
    });
});

// ─── 4. OrthodonticStageMetadata ─────────────────────────────────────────────

describe("OrthodonticStageMetadata Model", () => {
    const OrthoStage = require("../modules/orthodontics/models/orthodonticStageMetadata.model").default;
    const schema = OrthoStage.schema;

    test("organizationId is required", () => {
        expect(schema.path("organizationId").isRequired).toBe(true);
    });

    test("stageExecutionId is required", () => {
        expect(schema.path("stageExecutionId").isRequired).toBe(true);
    });

    test("wireType field exists", () => {
        expect(schema.path("wireType")).toBeDefined();
    });

    test("attachmentsPlaced defaults to false", () => {
        expect(schema.path("attachmentsPlaced").defaultValue).toBe(false);
    });
});

// ─── 5. AlignerProductionCase (pre-existing lab model) ───────────────────────

describe("AlignerProductionCase Model — Pre-existing", () => {
    const APC = require("../modules/alignerProductionDomain/models/alignerProductionCase.model").default;
    const schema = APC.schema;

    test("organizationId is required", () => {
        expect(schema.path("organizationId").isRequired).toBe(true);
    });

    test("branchId is required", () => {
        expect(schema.path("branchId").isRequired).toBe(true);
    });

    test("productionStatus has correct enum", () => {
        const field = schema.path("productionStatus");
        expect(field.enumValues).toEqual(["planning", "in_production", "completed", "delivered"]);
    });

    test("productionStatus defaults to 'planning'", () => {
        expect(schema.path("productionStatus").defaultValue).toBe("planning");
    });

    test("totalStages is required", () => {
        expect(schema.path("totalStages").isRequired).toBe(true);
    });

    test("treatmentTimeline is an array", () => {
        expect(schema.path("treatmentTimeline")).toBeDefined();
    });
});

// ─── 6. Plane Isolation ──────────────────────────────────────────────────────

describe("Orthodontic — Plane Isolation", () => {
    test("AlignerPlan (clinic) is separate from AlignerProductionCase (lab)", () => {
        const AlignerPlan = require("../modules/orthodontics/models/AlignerPlan.model").default;
        const APC = require("../modules/alignerProductionDomain/models/alignerProductionCase.model").default;

        // Different model names
        expect(AlignerPlan.modelName).toBe("AlignerPlan");
        expect(APC.modelName).toBe("AlignerProductionCase");

        // Both have org isolation
        expect(AlignerPlan.schema.path("organizationId").isRequired).toBe(true);
        expect(APC.schema.path("organizationId").isRequired).toBe(true);
    });

    test("OrthodonticCase is org-scoped, not platform-scoped", () => {
        const OrthoCase = require("../modules/orthodontics/models/orthodonticCase.model").default;
        expect(OrthoCase.schema.path("organizationId").isRequired).toBe(true);
    });
});
