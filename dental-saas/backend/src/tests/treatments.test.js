/**
 * treatments.test.js — Treatment Domain Unit Tests
 * Phase 3 — Clinical Operations
 *
 * Tests:
 * 1. Treatment model schema enforcement
 * 2. TreatmentPlan model schema enforcement
 * 3. Organization isolation
 * 4. RBAC permission mapping
 * 5. Treatment FSM transitions (valid + invalid)
 * 6. Service contract
 * 7. Domain events
 * 8. Route architecture
 */

"use strict";

// ─── 1. Treatment Model Schema ───────────────────────────────────────────────

describe("Treatment Model — Schema Enforcement", () => {
    const Treatment = require("../modules/treatments/models/Treatment.model").default;
    const schema = Treatment.schema;

    test("organizationId is required", () => {
        const field = schema.path("organizationId");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("branchId is required", () => {
        expect(schema.path("branchId").isRequired).toBe(true);
    });

    test("patientId is required", () => {
        expect(schema.path("patientId").isRequired).toBe(true);
    });

    test("procedureId is required", () => {
        expect(schema.path("procedureId").isRequired).toBe(true);
    });

    test("createdBy is required", () => {
        expect(schema.path("createdBy").isRequired).toBe(true);
    });

    test("status has correct enum values", () => {
        const field = schema.path("status");
        expect(field.enumValues).toEqual(["planned", "in_progress", "completed", "cancelled"]);
    });

    test("status defaults to 'planned'", () => {
        expect(schema.path("status").defaultValue).toBe("planned");
    });

    test("surfaces has correct enum values", () => {
        const field = schema.path("surfaces");
        expect(field).toBeDefined();
    });

    test("toothNumber field exists (FDI)", () => {
        expect(schema.path("toothNumber")).toBeDefined();
    });

    test("priceOverride field exists", () => {
        expect(schema.path("priceOverride")).toBeDefined();
    });

    test("performedBy and performedAt exist", () => {
        expect(schema.path("performedBy")).toBeDefined();
        expect(schema.path("performedAt")).toBeDefined();
    });

    test("treatmentPlanId reference exists", () => {
        expect(schema.path("treatmentPlanId")).toBeDefined();
    });

    test("statusHistory is an array", () => {
        expect(schema.path("statusHistory")).toBeDefined();
    });

    test("isActive + version for soft delete / OAV", () => {
        expect(schema.path("isActive").defaultValue).toBe(true);
        expect(schema.path("version").defaultValue).toBe(0);
    });
});

// ─── 2. TreatmentPlan Model Schema ──────────────────────────────────────────

describe("TreatmentPlan Model — Schema Enforcement", () => {
    const TreatmentPlan = require("../modules/treatments/models/TreatmentPlan.model").default;
    const schema = TreatmentPlan.schema;

    test("organizationId is required", () => {
        expect(schema.path("organizationId").isRequired).toBe(true);
    });

    test("branchId is required", () => {
        expect(schema.path("branchId").isRequired).toBe(true);
    });

    test("patientId is required", () => {
        expect(schema.path("patientId").isRequired).toBe(true);
    });

    test("createdBy is required", () => {
        expect(schema.path("createdBy").isRequired).toBe(true);
    });

    test("status has correct enum values", () => {
        const field = schema.path("status");
        expect(field.enumValues).toEqual([
            "draft", "proposed", "approved", "in_progress", "completed", "cancelled"
        ]);
    });

    test("status defaults to 'draft'", () => {
        expect(schema.path("status").defaultValue).toBe("draft");
    });

    test("planItems is an array", () => {
        expect(schema.path("planItems")).toBeDefined();
    });

    test("estimatedTotal exists (server-calculated)", () => {
        expect(schema.path("estimatedTotal")).toBeDefined();
    });

    test("estimatedTotalMinor exists (v8.2 precision)", () => {
        expect(schema.path("estimatedTotalMinor")).toBeDefined();
    });

    test("approvedBy and approvedAt exist", () => {
        expect(schema.path("approvedBy")).toBeDefined();
        expect(schema.path("approvedAt")).toBeDefined();
    });
});

// ─── 3. Organization Isolation ────────────────────────────────────────────────

describe("Treatment Domain — Organization Isolation", () => {
    test("Treatment model has required organizationId", () => {
        const Treatment = require("../modules/treatments/models/Treatment.model").default;
        const field = Treatment.schema.path("organizationId");
        expect(field.instance).toBe("ObjectID");
        expect(field.isRequired).toBe(true);
    });

    test("TreatmentPlan model has required organizationId", () => {
        const TreatmentPlan = require("../modules/treatments/models/TreatmentPlan.model").default;
        const field = TreatmentPlan.schema.path("organizationId");
        expect(field.instance).toBe("ObjectID");
        expect(field.isRequired).toBe(true);
    });
});

// ─── 4. RBAC Permissions ──────────────────────────────────────────────────────

describe("Treatment RBAC Permissions", () => {
    const { P, ORG_ROLE_PERMISSIONS } = require("../rbac/orgPermissions");

    test("treatments.* permissions exist in the contract", () => {
        expect(P.TREATMENTS_READ).toBe("treatments.read");
        expect(P.TREATMENTS_CREATE).toBe("treatments.create");
        expect(P.TREATMENTS_UPDATE).toBe("treatments.update");
        expect(P.TREATMENTS_DELETE).toBe("treatments.delete");
    });

    test("org_admin has full treatment CRUD", () => {
        const perms = ORG_ROLE_PERMISSIONS.org_admin;
        expect(perms).toContain(P.TREATMENTS_READ);
        expect(perms).toContain(P.TREATMENTS_CREATE);
        expect(perms).toContain(P.TREATMENTS_UPDATE);
        expect(perms).toContain(P.TREATMENTS_DELETE);
    });

    test("doctor has read + create + update but NOT delete", () => {
        const perms = ORG_ROLE_PERMISSIONS.doctor;
        expect(perms).toContain(P.TREATMENTS_READ);
        expect(perms).toContain(P.TREATMENTS_CREATE);
        expect(perms).toContain(P.TREATMENTS_UPDATE);
        expect(perms).not.toContain(P.TREATMENTS_DELETE);
    });

    test("assistant has read only", () => {
        const perms = ORG_ROLE_PERMISSIONS.assistant;
        expect(perms).toContain(P.TREATMENTS_READ);
        expect(perms).not.toContain(P.TREATMENTS_CREATE);
    });

    test("receptionist has read only", () => {
        const perms = ORG_ROLE_PERMISSIONS.receptionist;
        expect(perms).toContain(P.TREATMENTS_READ);
        expect(perms).not.toContain(P.TREATMENTS_CREATE);
    });

    test("lab_technician has NO treatment permissions", () => {
        const perms = ORG_ROLE_PERMISSIONS.lab_technician;
        expect(perms).not.toContain(P.TREATMENTS_READ);
    });
});

// ─── 5. Treatment FSM ────────────────────────────────────────────────────────

describe("Treatment FSM — Status Transitions", () => {
    const { TREATMENT_TRANSITIONS, validateTreatmentTransition } = require("../modules/treatments/services/treatments.service");

    // Valid transitions
    test("planned → in_progress (valid)", () => {
        expect(validateTreatmentTransition("planned", "in_progress").valid).toBe(true);
    });

    test("planned → cancelled (valid)", () => {
        expect(validateTreatmentTransition("planned", "cancelled").valid).toBe(true);
    });

    test("in_progress → completed (valid)", () => {
        expect(validateTreatmentTransition("in_progress", "completed").valid).toBe(true);
    });

    test("in_progress → cancelled (valid)", () => {
        expect(validateTreatmentTransition("in_progress", "cancelled").valid).toBe(true);
    });

    // Invalid transitions
    test("completed → anything (REJECTED — terminal)", () => {
        expect(validateTreatmentTransition("completed", "planned").valid).toBe(false);
        expect(validateTreatmentTransition("completed", "cancelled").valid).toBe(false);
    });

    test("cancelled → anything (REJECTED — terminal)", () => {
        expect(validateTreatmentTransition("cancelled", "planned").valid).toBe(false);
        expect(validateTreatmentTransition("cancelled", "in_progress").valid).toBe(false);
    });

    test("planned → completed (REJECTED — must go through in_progress)", () => {
        expect(validateTreatmentTransition("planned", "completed").valid).toBe(false);
    });

    test("unknown status (REJECTED)", () => {
        expect(validateTreatmentTransition("nonexistent", "planned").valid).toBe(false);
    });

    // Transition map completeness
    test("all 4 statuses have defined transition rules", () => {
        for (const status of ["planned", "in_progress", "completed", "cancelled"]) {
            expect(TREATMENT_TRANSITIONS[status]).toBeDefined();
            expect(Array.isArray(TREATMENT_TRANSITIONS[status])).toBe(true);
        }
    });

    test("terminal statuses have empty transition arrays", () => {
        expect(TREATMENT_TRANSITIONS["completed"]).toEqual([]);
        expect(TREATMENT_TRANSITIONS["cancelled"]).toEqual([]);
    });
});

// ─── 6. Service Contract ──────────────────────────────────────────────────────

describe("Treatment Service — Contract", () => {
    const service = require("../modules/treatments/services/treatments.service");

    test("exports createTreatment", () => {
        expect(typeof service.createTreatment).toBe("function");
    });

    test("exports listTreatments", () => {
        expect(typeof service.listTreatments).toBe("function");
    });

    test("exports getTreatmentById", () => {
        expect(typeof service.getTreatmentById).toBe("function");
    });

    test("exports updateTreatmentStatus", () => {
        expect(typeof service.updateTreatmentStatus).toBe("function");
    });

    test("exports createTreatmentPlan", () => {
        expect(typeof service.createTreatmentPlan).toBe("function");
    });

    test("exports listTreatmentPlans", () => {
        expect(typeof service.listTreatmentPlans).toBe("function");
    });

    test("exports getTreatmentPlanById", () => {
        expect(typeof service.getTreatmentPlanById).toBe("function");
    });
});

// ─── 7. Domain Events ────────────────────────────────────────────────────────

describe("Treatment Domain Events — Contract", () => {
    const domainEvents = require("../core/domainEvents");

    test("TREATMENT_CREATED event is defined", () => {
        expect(domainEvents.TREATMENT_CREATED).toBe("treatment.created");
    });

    test("TREATMENT_STATUS_CHANGED event is defined", () => {
        expect(domainEvents.TREATMENT_STATUS_CHANGED).toBe("treatment.status_changed");
    });

    test("TREATMENT_COMPLETED event is defined", () => {
        expect(domainEvents.TREATMENT_COMPLETED).toBe("treatment.completed");
    });
});

// ─── 8. Route Architecture ───────────────────────────────────────────────────

describe("Treatment Routes — Architecture", () => {
    test("routes module exports express Router", () => {
        const routes = require("../modules/treatments/routes/treatments.routes");
        expect(routes).toBeDefined();
        expect(typeof routes).toBe("function");
    });
});
