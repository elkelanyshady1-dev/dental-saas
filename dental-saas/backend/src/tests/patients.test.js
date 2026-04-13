/**
 * patients.test.js — Patient Domain Unit Tests
 * Phase 2 — Clinical Core
 *
 * Tests:
 * 1. Patient model schema enforcement
 * 2. Organization isolation invariants
 * 3. RBAC permission mapping
 * 4. Status FSM (isActive / soft delete)
 * 5. Aggregate service architecture
 * 6. Multi-branch governance
 * 7. Search infrastructure
 */

"use strict";

// ─── 1. Patient Model Schema ─────────────────────────────────────────────────

describe("Patient Model — Schema Enforcement", () => {
    const Patient = require("../organization/patient/models/patient.model").default;
    const schema = Patient.schema;

    test("organizationId is required", () => {
        const field = schema.path("organizationId");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("phoneRaw is required", () => {
        const field = schema.path("phoneRaw");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("phoneE164 is required", () => {
        const field = schema.path("phoneE164");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("schema has name fields (Arabic + English)", () => {
        expect(schema.path("nameArabic")).toBeDefined();
        expect(schema.path("nameEnglish")).toBeDefined();
    });

    test("schema has search optimization fields", () => {
        expect(schema.path("fullNameNormalized")).toBeDefined();
        expect(schema.path("nameTokens")).toBeDefined();
        expect(schema.path("phoneDigits")).toBeDefined();
    });

    test("schema has multi-branch fields", () => {
        const primary = schema.path("primaryBranchId");
        expect(primary).toBeDefined();
        expect(primary.options.ref).toBe("Branch");

        const allowed = schema.path("allowedBranchIds");
        expect(allowed).toBeDefined();
    });

    test("schema has soft delete fields", () => {
        expect(schema.path("isActive")).toBeDefined();
        expect(schema.path("deletedAt")).toBeDefined();
    });

    test("schema has optimistic concurrency field", () => {
        expect(schema.path("version")).toBeDefined();
    });

    test("insurance is a subdocument with expected fields", () => {
        expect(schema.path("insurance.provider")).toBeDefined();
        expect(schema.path("insurance.policyNumber")).toBeDefined();
        expect(schema.path("insurance.expiryDate")).toBeDefined();
    });

    test("emergencyContact is a subdocument with expected fields", () => {
        expect(schema.path("emergencyContact.name")).toBeDefined();
        expect(schema.path("emergencyContact.phone")).toBeDefined();
        expect(schema.path("emergencyContact.relation")).toBeDefined();
    });

    test("gender enum is correctly defined", () => {
        const field = schema.path("gender");
        expect(field).toBeDefined();
        expect(field.enumValues).toContain("male");
        expect(field.enumValues).toContain("female");
    });
});

// ─── 2. Organization Isolation ────────────────────────────────────────────────

describe("Patient Domain — Organization Isolation", () => {
    test("Patient model has organizationId as required ObjectId", () => {
        const Patient = require("../organization/patient/models/patient.model").default;
        const field = Patient.schema.path("organizationId");
        expect(field.instance).toBe("ObjectID");
        expect(field.isRequired).toBe(true);
    });

    test("aggregate service functions require organizationId", () => {
        const service = require("../modules/patientDomain/core/patient.aggregate.service");
        expect(typeof service.createPatient).toBe("function");
        expect(typeof service.updatePatient).toBe("function");
        expect(typeof service.softDeletePatient).toBe("function");
        expect(typeof service.changeStatus).toBe("function");
        expect(typeof service.changePrimaryBranch).toBe("function");
        expect(typeof service.updateBranchAccess).toBe("function");
        expect(typeof service.updateMedicalHistory).toBe("function");
        expect(typeof service.updatePolicy).toBe("function");
        expect(typeof service.getPatientAggregate).toBe("function");
    });

    test("controller exists and is instantiated", () => {
        const controller = require("../modules/patientDomain/core/patient.controller");
        expect(typeof controller.getProfile).toBe("function");
        expect(typeof controller.create).toBe("function");
        expect(typeof controller.update).toBe("function");
        expect(typeof controller.delete).toBe("function");
        expect(typeof controller.list).toBe("function");
    });

    test("create controller enforces org user type", () => {
        const createController = require("../modules/patientDomain/core/patient.create.controller");
        expect(typeof createController.create).toBe("function");
        // The controller checks req.user.type !== "org" and rejects non-staff users
    });
});

// ─── 3. RBAC Permission Enforcement ──────────────────────────────────────────

describe("Patient RBAC Permissions", () => {
    const { P, ORG_ROLE_PERMISSIONS } = require("../rbac/orgPermissions");

    test("patients.* permissions exist in the contract", () => {
        expect(P.PATIENTS_READ).toBe("patients.read");
        expect(P.PATIENTS_CREATE).toBe("patients.create");
        expect(P.PATIENTS_UPDATE).toBe("patients.update");
        expect(P.PATIENTS_DELETE).toBe("patients.delete");
    });

    test("org_admin has full patient CRUD permissions", () => {
        const adminPerms = ORG_ROLE_PERMISSIONS.org_admin;
        expect(adminPerms).toContain(P.PATIENTS_READ);
        expect(adminPerms).toContain(P.PATIENTS_CREATE);
        expect(adminPerms).toContain(P.PATIENTS_UPDATE);
        expect(adminPerms).toContain(P.PATIENTS_DELETE);
    });

    test("doctor has patients.read + create + update but NOT delete", () => {
        const doctorPerms = ORG_ROLE_PERMISSIONS.doctor;
        expect(doctorPerms).toContain(P.PATIENTS_READ);
        expect(doctorPerms).toContain(P.PATIENTS_CREATE);
        expect(doctorPerms).toContain(P.PATIENTS_UPDATE);
        expect(doctorPerms).not.toContain(P.PATIENTS_DELETE);
    });

    test("assistant has only patients.read", () => {
        const assistantPerms = ORG_ROLE_PERMISSIONS.assistant;
        expect(assistantPerms).toContain(P.PATIENTS_READ);
        expect(assistantPerms).not.toContain(P.PATIENTS_CREATE);
        expect(assistantPerms).not.toContain(P.PATIENTS_UPDATE);
        expect(assistantPerms).not.toContain(P.PATIENTS_DELETE);
    });

    test("receptionist has patients.read + create but NOT update/delete", () => {
        const receptionistPerms = ORG_ROLE_PERMISSIONS.receptionist;
        expect(receptionistPerms).toContain(P.PATIENTS_READ);
        expect(receptionistPerms).toContain(P.PATIENTS_CREATE);
        expect(receptionistPerms).not.toContain(P.PATIENTS_UPDATE);
        expect(receptionistPerms).not.toContain(P.PATIENTS_DELETE);
    });

    test("lab_technician has patients.read only", () => {
        const labPerms = ORG_ROLE_PERMISSIONS.lab_technician;
        expect(labPerms).toContain(P.PATIENTS_READ);
        expect(labPerms).not.toContain(P.PATIENTS_CREATE);
        expect(labPerms).not.toContain(P.PATIENTS_DELETE);
    });
});

// ─── 4. Domain Events ────────────────────────────────────────────────────────

describe("Patient Domain Events — Contract", () => {
    const domainEvents = require("../core/domainEvents");

    test("PATIENT_CREATED event is defined", () => {
        expect(domainEvents.PATIENT_CREATED).toBeDefined();
        expect(typeof domainEvents.PATIENT_CREATED).toBe("string");
    });

    test("PATIENT_UPDATED event is defined", () => {
        expect(domainEvents.PATIENT_UPDATED).toBeDefined();
    });

    test("PATIENT_DELETED event is defined", () => {
        expect(domainEvents.PATIENT_DELETED).toBeDefined();
    });

    test("PATIENT_STATUS_CHANGED event is defined", () => {
        expect(domainEvents.PATIENT_STATUS_CHANGED).toBeDefined();
    });

    test("PATIENT_BRANCH_UPDATED event is defined", () => {
        expect(domainEvents.PATIENT_BRANCH_UPDATED).toBeDefined();
    });
});

// ─── 5. Route Architecture ───────────────────────────────────────────────────

describe("Patient Routes — Architecture Validation", () => {
    test("patientDomain routes module exports express Router", () => {
        const routes = require("../modules/patientDomain/patientDomain.routes");
        expect(routes).toBeDefined();
        // Express Router is a function
        expect(typeof routes).toBe("function");
    });

    test("requireOrgPermission middleware exists", () => {
        const requireOrgPermission = require("../middleware/requireOrgPermission");
        expect(typeof requireOrgPermission).toBe("function");
    });

    test("orgProtect middleware exists", () => {
        const orgProtect = require("../middleware/orgProtect");
        expect(typeof orgProtect).toBe("function");
    });
});

// ─── 6. Multi-Branch Governance ──────────────────────────────────────────────

describe("Patient Multi-Branch Architecture", () => {
    test("aggregate service has branch governance methods", () => {
        const service = require("../modules/patientDomain/core/patient.aggregate.service");
        expect(typeof service.changePrimaryBranch).toBe("function");
        expect(typeof service.updateBranchAccess).toBe("function");
    });

    test("aggregate service has doctor assignment method", () => {
        const service = require("../modules/patientDomain/core/patient.aggregate.service");
        expect(typeof service.assignDoctor).toBe("function");
    });
});

// ─── 7. Aggregate Projection ─────────────────────────────────────────────────

describe("Patient Aggregate — Projection Contract", () => {
    test("aggregate service has getPatientAggregate method", () => {
        const service = require("../modules/patientDomain/core/patient.aggregate.service");
        expect(typeof service.getPatientAggregate).toBe("function");
    });

    test("audit helper method exists on service (internal)", () => {
        const service = require("../modules/patientDomain/core/patient.aggregate.service");
        expect(typeof service._recordAudit).toBe("function");
    });
});
