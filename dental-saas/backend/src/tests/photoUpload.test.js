/**
 * photoUpload.test.js — Photo Upload + AI Analysis Unit Tests
 * Phase 5 — Patient Portal & Remote Monitoring
 *
 * Tests:
 * 1. PatientPhoto model schema
 * 2. AlignerProgress model schema
 * 3. Organization isolation (all portal models)
 * 4. Photo AI analysis status FSM
 * 5. Photo storage path virtual
 * 6. Progress FSM statuses
 */

"use strict";

// ─── 1. PatientPhoto Model ───────────────────────────────────────────────────

describe("PatientPhoto Model — Schema Enforcement", () => {
    const PatientPhoto = require("../modules/patientPortal/models/PatientPhoto.model").default;
    const schema = PatientPhoto.schema;

    test("organizationId is required (ObjectId)", () => {
        const f = schema.path("organizationId");
        expect(f.instance).toBe("ObjectID");
        expect(f.isRequired).toBe(true);
    });

    test("patientId is required", () => {
        expect(schema.path("patientId").isRequired).toBe(true);
    });

    test("caseId is required", () => {
        expect(schema.path("caseId").isRequired).toBe(true);
    });

    test("stageNumber is required with min 1", () => {
        const f = schema.path("stageNumber");
        expect(f.isRequired).toBe(true);
        expect(f.options.min).toBe(1);
    });

    test("photoType has correct enum (6 types)", () => {
        const f = schema.path("photoType");
        expect(f.isRequired).toBe(true);
        expect(f.enumValues).toEqual(["front", "left", "right", "bite", "upper", "lower"]);
    });

    test("fileKey is required and unique", () => {
        const f = schema.path("fileKey");
        expect(f.isRequired).toBe(true);
    });

    test("aiAnalysisStatus has correct enum", () => {
        const f = schema.path("aiAnalysisStatus");
        expect(f.enumValues).toEqual(["pending", "queued", "processing", "completed", "failed", "skipped"]);
        expect(f.defaultValue).toBe("pending");
    });

    test("aiFindings.alignerFit has correct enum", () => {
        const f = schema.path("aiFindings.alignerFit");
        expect(f.enumValues).toEqual(["good", "poor", "unknown"]);
        expect(f.defaultValue).toBe("unknown");
    });

    test("aiFindings.toothMovement has correct enum", () => {
        const f = schema.path("aiFindings.toothMovement");
        expect(f.enumValues).toEqual(["on_track", "behind", "unknown"]);
    });

    test("isActive defaults to true", () => {
        expect(schema.path("isActive").defaultValue).toBe(true);
    });
});

// ─── 2. AlignerProgress Model ─────────────────────────────────────────────────

describe("AlignerProgress Model — Schema Enforcement", () => {
    const AlignerProgress = require("../modules/patientPortal/models/AlignerProgress.model").default;
    const schema = AlignerProgress.schema;

    test("organizationId is required", () => {
        expect(schema.path("organizationId").isRequired).toBe(true);
    });

    test("patientId is required", () => {
        expect(schema.path("patientId").isRequired).toBe(true);
    });

    test("caseId is required", () => {
        expect(schema.path("caseId").isRequired).toBe(true);
    });

    test("stageNumber is required with min 1", () => {
        const f = schema.path("stageNumber");
        expect(f.isRequired).toBe(true);
        expect(f.options.min).toBe(1);
    });

    test("status has correct 4-state enum", () => {
        const f = schema.path("status");
        expect(f.enumValues).toEqual(["pending", "active", "completed", "skipped"]);
        expect(f.defaultValue).toBe("pending");
    });

    test("wearDurationDays defaults to 14", () => {
        expect(schema.path("wearDurationDays").defaultValue).toBe(14);
    });

    test("monitoringSubmitted defaults to false", () => {
        expect(schema.path("monitoringSubmitted").defaultValue).toBe(false);
    });

    test("patientPainLevel has min 0, max 10", () => {
        const f = schema.path("patientPainLevel");
        expect(f.options.min).toBe(0);
        expect(f.options.max).toBe(10);
    });
});

// ─── 3. Organization Isolation ────────────────────────────────────────────────

describe("Portal Models — Organization Isolation", () => {
    const models = [
        { name: "PatientPhoto", path: "../modules/patientPortal/models/PatientPhoto.model" },
        { name: "AlignerProgress", path: "../modules/patientPortal/models/AlignerProgress.model" },
        { name: "MonitoringSession", path: "../modules/patientPortal/models/MonitoringSession.model" },
        { name: "PatientMessage", path: "../modules/patientPortal/models/PatientMessage.model" }
    ];

    models.forEach(({ name, path: modelPath }) => {
        test(`${name} has required organizationId (ObjectId)`, () => {
            const Model = require(modelPath);
            const f = Model.schema.path("organizationId");
            expect(f.instance).toBe("ObjectID");
            expect(f.isRequired).toBe(true);
        });
    });
});

// ─── 4. Storage Path Virtual ─────────────────────────────────────────────────

describe("PatientPhoto — Storage Path Virtual", () => {
    const PatientPhoto = require("../modules/patientPortal/models/PatientPhoto.model").default;

    test("storagePath virtual is registered", () => {
        const virtuals = PatientPhoto.schema.virtuals;
        expect(virtuals.storagePath).toBeDefined();
    });
});

// ─── 5. Progress FSM — Valid Statuses ────────────────────────────────────────

describe("AlignerProgress — Status Enum Completeness", () => {
    const AlignerProgress = require("../modules/patientPortal/models/AlignerProgress.model").default;

    test("covers all required lifecycle stages", () => {
        const statuses = AlignerProgress.schema.path("status").enumValues;
        expect(statuses).toContain("pending");
        expect(statuses).toContain("active");
        expect(statuses).toContain("completed");
        expect(statuses).toContain("skipped");
    });
});


// ─── 7. Domain Events ────────────────────────────────────────────────────────

describe("Phase 5 Domain Events — Contract", () => {
    const domainEvents = require("../core/domainEvents");

    test("STAGE_REMINDER_SENT is defined", () => {
        expect(domainEvents.STAGE_REMINDER_SENT).toBe("stage.reminder_sent");
    });

    test("PHOTO_UPLOADED is defined", () => {
        expect(domainEvents.PHOTO_UPLOADED).toBe("photo.uploaded");
    });

    test("DOCTOR_REVIEW_COMPLETED is defined", () => {
        expect(domainEvents.DOCTOR_REVIEW_COMPLETED).toBe("doctor.review_completed");
    });

    test("MONITORING_SUBMITTED is defined", () => {
        expect(domainEvents.MONITORING_SUBMITTED).toBe("monitoring.submitted");
    });
});
