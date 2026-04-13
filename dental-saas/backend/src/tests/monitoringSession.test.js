/**
 * monitoringSession.test.js — Monitoring Session Unit Tests
 * Phase 5 — Patient Portal & Remote Monitoring
 *
 * Tests:
 * 1. MonitoringSession model schema
 * 2. PatientMessage model schema
 * 3. Monitoring session FSM (valid + invalid transitions)
 * 4. Monitoring service contract
 * 5. Cross-tenant isolation
 * 6. Message read-tracking fields
 */

"use strict";

// ─── 1. MonitoringSession Model ───────────────────────────────────────────────

describe("MonitoringSession Model — Schema Enforcement", () => {
    const MonitoringSession = require("../modules/patientPortal/models/MonitoringSession.model").default;
    const schema = MonitoringSession.schema;

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

    test("alignerProgressId is required", () => {
        expect(schema.path("alignerProgressId").isRequired).toBe(true);
    });

    test("stageNumber is required with min 1", () => {
        const f = schema.path("stageNumber");
        expect(f.isRequired).toBe(true);
        expect(f.options.min).toBe(1);
    });

    test("status has correct 4-state enum", () => {
        const f = schema.path("status");
        expect(f.enumValues).toEqual(["submitted", "under_review", "approved", "revision_required"]);
        expect(f.defaultValue).toBe("submitted");
    });

    test("photoIds is an array", () => {
        expect(schema.path("photoIds")).toBeDefined();
    });

    test("aiSummary.overallStatus has correct enum", () => {
        const f = schema.path("aiSummary.overallStatus");
        expect(f.enumValues).toEqual(["on_track", "needs_attention", "review_required", "unknown"]);
        expect(f.defaultValue).toBe("unknown");
    });

    test("notificationSent fields exist", () => {
        expect(schema.path("notificationSent.doctorNotified")).toBeDefined();
        expect(schema.path("notificationSent.patientNotified")).toBeDefined();
    });

    test("revisionDetails fields exist", () => {
        expect(schema.path("revisionDetails.requiredPhotos")).toBeDefined();
        expect(schema.path("revisionDetails.message")).toBeDefined();
    });
});

// ─── 2. PatientMessage Model ──────────────────────────────────────────────────

describe("PatientMessage Model — Schema Enforcement", () => {
    const PatientMessage = require("../modules/patientPortal/models/PatientMessage.model").default;
    const schema = PatientMessage.schema;

    test("organizationId is required", () => {
        expect(schema.path("organizationId").isRequired).toBe(true);
    });

    test("patientId is required", () => {
        expect(schema.path("patientId").isRequired).toBe(true);
    });

    test("senderType is required with correct enum", () => {
        const f = schema.path("senderType");
        expect(f.isRequired).toBe(true);
        expect(f.enumValues).toEqual(["patient", "doctor", "system"]);
    });

    test("messageType has correct enum with default 'text'", () => {
        const f = schema.path("messageType");
        expect(f.enumValues).toEqual(["text", "image", "system"]);
        expect(f.defaultValue).toBe("text");
    });

    test("message has maxlength 2000", () => {
        expect(schema.path("message").options.maxlength).toBe(2000);
    });

    test("isReadByPatient defaults to false", () => {
        expect(schema.path("isReadByPatient").defaultValue).toBe(false);
    });

    test("isReadByDoctor defaults to false", () => {
        expect(schema.path("isReadByDoctor").defaultValue).toBe(false);
    });

    test("attachments field exists (array)", () => {
        expect(schema.path("attachments")).toBeDefined();
    });

    test("isActive defaults to true", () => {
        expect(schema.path("isActive").defaultValue).toBe(true);
    });
});

// ─── 3. Monitoring Session FSM ────────────────────────────────────────────────

describe("MonitoringSession FSM — Transitions", () => {
    const { SESSION_TRANSITIONS, validateSessionTransition } = require("../modules/patientPortal/services/portalMonitoring.service");

    // Valid transitions
    test("submitted → under_review (valid — doctor picks up)", () => {
        expect(validateSessionTransition("submitted", "under_review").valid).toBe(true);
    });

    test("under_review → approved (valid)", () => {
        expect(validateSessionTransition("under_review", "approved").valid).toBe(true);
    });

    test("under_review → revision_required (valid)", () => {
        expect(validateSessionTransition("under_review", "revision_required").valid).toBe(true);
    });

    test("revision_required → submitted (valid — patient resubmits)", () => {
        expect(validateSessionTransition("revision_required", "submitted").valid).toBe(true);
    });

    // Invalid transitions
    test("submitted → approved (REJECTED — must be reviewed first)", () => {
        expect(validateSessionTransition("submitted", "approved").valid).toBe(false);
    });

    test("submitted → revision_required (REJECTED — must go through under_review)", () => {
        expect(validateSessionTransition("submitted", "revision_required").valid).toBe(false);
    });

    test("approved → anything (REJECTED — terminal)", () => {
        expect(validateSessionTransition("approved", "submitted").valid).toBe(false);
        expect(validateSessionTransition("approved", "under_review").valid).toBe(false);
    });

    // Completeness
    test("all 4 status values have defined transition rules", () => {
        for (const s of ["submitted", "under_review", "approved", "revision_required"]) {
            expect(SESSION_TRANSITIONS[s]).toBeDefined();
            expect(Array.isArray(SESSION_TRANSITIONS[s])).toBe(true);
        }
    });

    test("approved is terminal (empty transitions)", () => {
        expect(SESSION_TRANSITIONS["approved"]).toEqual([]);
    });
});

// ─── 4. Monitoring Service Contract ──────────────────────────────────────────

describe("PortalMonitoring Service — Contract", () => {
    const service = require("../modules/patientPortal/services/portalMonitoring.service");

    const methods = [
        "createProgressEntry", "listProgress", "getProgressById",
        "activateStage", "completeStage",
        "registerPhoto", "listPhotos",
        "submitMonitoringSession", "listMonitoringSessions",
        "getMonitoringSession", "reviewMonitoringSession",
        "addPhotosToSession", "sendMessage", "listMessages", "markMessagesRead"
    ];

    methods.forEach(method => {
        test(`exports ${method}`, () => {
            expect(typeof service[method]).toBe("function");
        });
    });
});

// ─── 5. Cross-Tenant Isolation ────────────────────────────────────────────────

describe("Cross-Tenant Access Prevention", () => {
    test("MonitoringSession organizationId is required and enforced at schema level", () => {
        const MonitoringSession = require("../modules/patientPortal/models/MonitoringSession.model").default;
        const f = MonitoringSession.schema.path("organizationId");
        expect(f.isRequired).toBe(true);
        expect(f.instance).toBe("ObjectID");
    });

    test("PatientPhoto organizationId is required and enforced at schema level", () => {
        const PatientPhoto = require("../modules/patientPortal/models/PatientPhoto.model").default;
        const f = PatientPhoto.schema.path("organizationId");
        expect(f.isRequired).toBe(true);
    });

    test("PatientMessage organizationId is required and enforced at schema level", () => {
        const PatientMessage = require("../modules/patientPortal/models/PatientMessage.model").default;
        const f = PatientMessage.schema.path("organizationId");
        expect(f.isRequired).toBe(true);
    });
});
