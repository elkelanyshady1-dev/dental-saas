/**
 * scanUpload.test.js — Scan File + AI Models Unit Tests
 * Phase 4 — Orthodontic Intelligence
 *
 * Tests:
 * 1. ScanFile model schema
 * 2. ToothSegmentation model schema
 * 3. CephAnalysis model schema
 * 4. AlignerPlan model schema
 * 5. Organization isolation (all 4 models)
 * 6. Domain events
 */

"use strict";

// ─── 1. ScanFile Model ──────────────────────────────────────────────────────

describe("ScanFile Model — Schema Enforcement", () => {
    const ScanFile = require("../modules/orthodontics/models/ScanFile.model").default;
    const schema = ScanFile.schema;

    test("organizationId is required", () => {
        expect(schema.path("organizationId").isRequired).toBe(true);
    });

    test("caseId is required", () => {
        expect(schema.path("caseId").isRequired).toBe(true);
    });

    test("patientId is required", () => {
        expect(schema.path("patientId").isRequired).toBe(true);
    });

    test("branchId is required", () => {
        expect(schema.path("branchId").isRequired).toBe(true);
    });

    test("fileType has correct enum values", () => {
        const field = schema.path("fileType");
        expect(field.enumValues).toEqual(["stl", "ply", "obj", "dicom", "npy", "photo", "cbct"]);
    });

    test("fileKey is required", () => {
        expect(schema.path("fileKey").isRequired).toBe(true);
    });

    test("processingStatus has correct enum and default", () => {
        const field = schema.path("processingStatus");
        expect(field.enumValues).toEqual(["uploaded", "queued", "processing", "processed", "failed"]);
        expect(field.defaultValue).toBe("uploaded");
    });

    test("archType has correct enum", () => {
        const field = schema.path("archType");
        expect(field.enumValues).toEqual(["upper", "lower", "both", "full_face", "unknown"]);
        expect(field.defaultValue).toBe("unknown");
    });

    test("uploadedBy is required", () => {
        expect(schema.path("uploadedBy").isRequired).toBe(true);
    });

    test("isActive defaults to true", () => {
        expect(schema.path("isActive").defaultValue).toBe(true);
    });
});

// ─── 2. ToothSegmentation Model ─────────────────────────────────────────────

describe("ToothSegmentation Model — Schema Enforcement", () => {
    const ToothSeg = require("../modules/orthodontics/models/ToothSegmentation.model").default;
    const schema = ToothSeg.schema;

    test("organizationId is required", () => {
        expect(schema.path("organizationId").isRequired).toBe(true);
    });

    test("caseId is required", () => {
        expect(schema.path("caseId").isRequired).toBe(true);
    });

    test("scanFileId is required", () => {
        expect(schema.path("scanFileId").isRequired).toBe(true);
    });

    test("modelVersion is required", () => {
        expect(schema.path("modelVersion").isRequired).toBe(true);
    });

    test("modelArchitecture defaults to PointNet++", () => {
        expect(schema.path("modelArchitecture").defaultValue).toBe("PointNet++");
    });

    test("status has correct enum and default", () => {
        const field = schema.path("status");
        expect(field.enumValues).toEqual(["pending", "completed", "failed", "outdated"]);
        expect(field.defaultValue).toBe("pending");
    });

    test("toothLabels is an array", () => {
        expect(schema.path("toothLabels")).toBeDefined();
    });

    test("boltonAnalysis subdocument exists", () => {
        expect(schema.path("boltonAnalysis")).toBeDefined();
    });

    test("meanConfidence field exists", () => {
        expect(schema.path("meanConfidence")).toBeDefined();
    });

    test("missingTeeth field exists", () => {
        expect(schema.path("missingTeeth")).toBeDefined();
    });
});

// ─── 3. CephAnalysis Model ──────────────────────────────────────────────────

describe("CephAnalysis Model — Schema Enforcement", () => {
    const CephAnalysis = require("../modules/orthodontics/models/CephAnalysis.model").default;
    const schema = CephAnalysis.schema;

    test("organizationId is required", () => {
        expect(schema.path("organizationId").isRequired).toBe(true);
    });

    test("caseId is required", () => {
        expect(schema.path("caseId").isRequired).toBe(true);
    });

    test("analysisType has correct enum", () => {
        const field = schema.path("analysisType");
        expect(field.enumValues).toEqual(["lateral_ceph", "pa_ceph", "cbct_3d", "custom"]);
    });

    test("modelVersion is required", () => {
        expect(schema.path("modelVersion").isRequired).toBe(true);
    });

    test("standard angles exist (SNA, SNB, ANB, FMA, Wits)", () => {
        expect(schema.path("angles.SNA")).toBeDefined();
        expect(schema.path("angles.SNB")).toBeDefined();
        expect(schema.path("angles.ANB")).toBeDefined();
        expect(schema.path("angles.FMA")).toBeDefined();
        expect(schema.path("angles.wittsAppraisal")).toBeDefined();
    });

    test("skeletalClassification has correct enum", () => {
        const field = schema.path("skeletalClassification");
        expect(field.enumValues).toEqual(["CLASS_I", "CLASS_II", "CLASS_III"]);
    });

    test("growthPattern has correct enum", () => {
        const field = schema.path("growthPattern");
        expect(field.enumValues).toEqual(["normal", "hyperdivergent", "hypodivergent"]);
    });

    test("status has correct enum", () => {
        const field = schema.path("status");
        expect(field.enumValues).toEqual(["pending", "completed", "failed", "reviewed"]);
    });

    test("landmarks is an array", () => {
        expect(schema.path("landmarks")).toBeDefined();
    });

    test("measurements is an array", () => {
        expect(schema.path("measurements")).toBeDefined();
    });

    test("reviewedBy and reviewedAt exist", () => {
        expect(schema.path("reviewedBy")).toBeDefined();
        expect(schema.path("reviewedAt")).toBeDefined();
    });
});

// ─── 4. AlignerPlan Model ────────────────────────────────────────────────────

describe("AlignerPlan Model — Schema Enforcement", () => {
    const AlignerPlan = require("../modules/orthodontics/models/AlignerPlan.model").default;
    const schema = AlignerPlan.schema;

    test("organizationId is required", () => {
        expect(schema.path("organizationId").isRequired).toBe(true);
    });

    test("caseId is required", () => {
        expect(schema.path("caseId").isRequired).toBe(true);
    });

    test("patientId is required", () => {
        expect(schema.path("patientId").isRequired).toBe(true);
    });

    test("branchId is required", () => {
        expect(schema.path("branchId").isRequired).toBe(true);
    });

    test("stageCount is required with min 1", () => {
        const field = schema.path("stageCount");
        expect(field.isRequired).toBe(true);
        expect(field.options.min).toBe(1);
    });

    test("createdBy is required", () => {
        expect(schema.path("createdBy").isRequired).toBe(true);
    });

    test("status has correct enum", () => {
        const field = schema.path("status");
        expect(field.enumValues).toEqual([
            "draft", "proposed", "approved", "in_progress", "completed", "cancelled"
        ]);
    });

    test("status defaults to 'draft'", () => {
        expect(schema.path("status").defaultValue).toBe("draft");
    });

    test("stages is an array", () => {
        expect(schema.path("stages")).toBeDefined();
    });

    test("segmentationId reference exists", () => {
        expect(schema.path("segmentationId")).toBeDefined();
    });

    test("isActive defaults to true", () => {
        expect(schema.path("isActive").defaultValue).toBe(true);
    });

    test("approvedBy and approvedAt exist", () => {
        expect(schema.path("approvedBy")).toBeDefined();
        expect(schema.path("approvedAt")).toBeDefined();
    });
});

// ─── 5. Organization Isolation (all models) ──────────────────────────────────

describe("Orthodontic Models — Organization Isolation", () => {
    const models = [
        { name: "ScanFile", path: "../modules/orthodontics/models/ScanFile.model" },
        { name: "ToothSegmentation", path: "../modules/orthodontics/models/ToothSegmentation.model" },
        { name: "CephAnalysis", path: "../modules/orthodontics/models/CephAnalysis.model" },
        { name: "AlignerPlan", path: "../modules/orthodontics/models/AlignerPlan.model" }
    ];

    models.forEach(({ name, path: modelPath }) => {
        test(`${name} has required organizationId (ObjectId)`, () => {
            const Model = require(modelPath);
            const field = Model.schema.path("organizationId");
            expect(field.instance).toBe("ObjectID");
            expect(field.isRequired).toBe(true);
        });
    });
});

// ─── 6. Domain Events ────────────────────────────────────────────────────────

describe("Orthodontic Domain Events — Contract", () => {
    const domainEvents = require("../core/domainEvents");

    test("SCAN_UPLOADED event is defined", () => {
        expect(domainEvents.SCAN_UPLOADED).toBe("scan.uploaded");
    });

    test("ANALYSIS_STARTED event is defined", () => {
        expect(domainEvents.ANALYSIS_STARTED).toBe("analysis.started");
    });

    test("ANALYSIS_COMPLETED event is defined", () => {
        expect(domainEvents.ANALYSIS_COMPLETED).toBe("analysis.completed");
    });

    test("ALIGNER_PLAN_CREATED event is defined", () => {
        expect(domainEvents.ALIGNER_PLAN_CREATED).toBe("aligner.plan_created");
    });
});
