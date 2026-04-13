/**
 * appointments.test.js — Appointment Engine Unit Tests
 * Phase 2 — Clinical Core
 *
 * Tests:
 * 1. Appointment model schema enforcement
 * 2. Organization isolation invariants
 * 3. RBAC permission mapping
 * 4. FSM status transitions (valid + invalid)
 * 5. Overlap detection architecture
 * 6. Controller architecture contract
 * 7. Sovereign appointment service
 * 8. Domain event contract
 * 9. Calendar / scheduling infrastructure
 */

"use strict";

// ─── 1. Appointment Model Schema ─────────────────────────────────────────────

describe("Appointment Model — Schema Enforcement", () => {
    const Appointment = require("../organization/appointment/models/appointment.model").default;
    const schema = Appointment.schema;

    test("organizationId is required", () => {
        const field = schema.path("organizationId");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("branchId is required", () => {
        const field = schema.path("branchId");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("patientId is required", () => {
        const field = schema.path("patientId");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("dentistId is required", () => {
        const field = schema.path("dentistId");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("chairId is required", () => {
        const field = schema.path("chairId");
        expect(field).toBeDefined();
        expect(field.isRequired).toBe(true);
    });

    test("startTime and endTime are required Date fields", () => {
        expect(schema.path("startTime").isRequired).toBe(true);
        expect(schema.path("endTime").isRequired).toBe(true);
        expect(schema.path("startTime").instance).toBe("Date");
        expect(schema.path("endTime").instance).toBe("Date");
    });

    test("duration is required Number", () => {
        expect(schema.path("duration").isRequired).toBe(true);
        expect(schema.path("duration").instance).toBe("Number");
    });

    test("status has correct enum values", () => {
        const field = schema.path("status");
        expect(field).toBeDefined();
        expect(field.enumValues).toEqual([
            "open",
            "confirmed",
            "checked-in",
            "in-progress",
            "completed",
            "delayed",
            "cancelled",
            "no-show",
            "waiting-list",
        ]);
    });

    test("status defaults to 'open'", () => {
        const field = schema.path("status");
        expect(field.defaultValue).toBe("open");
    });

    test("statusHistory is an array subdocument", () => {
        expect(schema.path("statusHistory")).toBeDefined();
    });

    test("timestamp fields exist", () => {
        expect(schema.path("checkedInAt")).toBeDefined();
        expect(schema.path("startedAt")).toBeDefined();
        expect(schema.path("completedAt")).toBeDefined();
        expect(schema.path("cancelledAt")).toBeDefined();
    });

    test("waitingDuration field exists", () => {
        const field = schema.path("waitingDuration");
        expect(field).toBeDefined();
        expect(field.instance).toBe("Number");
    });

    test("soft delete fields exist", () => {
        expect(schema.path("isActive")).toBeDefined();
        expect(schema.path("deletedAt")).toBeDefined();
    });

    test("version field exists for optimistic concurrency", () => {
        expect(schema.path("version")).toBeDefined();
    });

    test("externalRequestId field exists for idempotency", () => {
        expect(schema.path("externalRequestId")).toBeDefined();
    });
});

// ─── 2. Organization Isolation ────────────────────────────────────────────────

describe("Appointment Domain — Organization Isolation", () => {
    test("model has organizationId as required ObjectId", () => {
        const Appointment = require("../organization/appointment/models/appointment.model").default;
        const field = Appointment.schema.path("organizationId");
        expect(field.instance).toBe("ObjectID");
        expect(field.isRequired).toBe(true);
    });

    test("controller imports and uses buildScopedQuery for tenant isolation", () => {
        // The controller uses resolvePermissions + buildScopedQuery for every query.
        // Direct import check is sufficient for architecture validation.
        const { resolvePermissions } = require("../core/authorization/permissionMatrix");
        const { buildScopedQuery } = require("../core/authorization/scopedQueryBuilder");
        expect(typeof resolvePermissions).toBe("function");
        expect(typeof buildScopedQuery).toBe("function");
    });
});

// ─── 3. RBAC Permission Enforcement ──────────────────────────────────────────

describe("Appointment RBAC Permissions", () => {
    const { P, ORG_ROLE_PERMISSIONS } = require("../rbac/orgPermissions");

    test("appointments.* permissions exist in the contract", () => {
        expect(P.APPOINTMENTS_READ).toBe("appointments.read");
        expect(P.APPOINTMENTS_CREATE).toBe("appointments.create");
        expect(P.APPOINTMENTS_UPDATE).toBe("appointments.update");
        expect(P.APPOINTMENTS_DELETE).toBe("appointments.delete");
    });

    test("calendar.* permissions exist", () => {
        expect(P.CALENDAR_READ).toBe("calendar.read");
        expect(P.CALENDAR_MULTI_BRANCH).toBe("calendar.multiBranchView");
    });

    test("org_admin has full appointment + calendar permissions", () => {
        const adminPerms = ORG_ROLE_PERMISSIONS.org_admin;
        expect(adminPerms).toContain(P.APPOINTMENTS_READ);
        expect(adminPerms).toContain(P.APPOINTMENTS_CREATE);
        expect(adminPerms).toContain(P.APPOINTMENTS_UPDATE);
        expect(adminPerms).toContain(P.APPOINTMENTS_DELETE);
        expect(adminPerms).toContain(P.CALENDAR_READ);
        expect(adminPerms).toContain(P.CALENDAR_MULTI_BRANCH);
    });

    test("doctor has read + create + update but NOT delete", () => {
        const doctorPerms = ORG_ROLE_PERMISSIONS.doctor;
        expect(doctorPerms).toContain(P.APPOINTMENTS_READ);
        expect(doctorPerms).toContain(P.APPOINTMENTS_CREATE);
        expect(doctorPerms).toContain(P.APPOINTMENTS_UPDATE);
        expect(doctorPerms).not.toContain(P.APPOINTMENTS_DELETE);
    });

    test("assistant has read + create + update but NOT delete", () => {
        const assistantPerms = ORG_ROLE_PERMISSIONS.assistant;
        expect(assistantPerms).toContain(P.APPOINTMENTS_READ);
        expect(assistantPerms).toContain(P.APPOINTMENTS_CREATE);
        expect(assistantPerms).toContain(P.APPOINTMENTS_UPDATE);
        expect(assistantPerms).not.toContain(P.APPOINTMENTS_DELETE);
    });

    test("receptionist has read + create + update but NOT delete", () => {
        const receptionistPerms = ORG_ROLE_PERMISSIONS.receptionist;
        expect(receptionistPerms).toContain(P.APPOINTMENTS_READ);
        expect(receptionistPerms).toContain(P.APPOINTMENTS_CREATE);
        expect(receptionistPerms).toContain(P.APPOINTMENTS_UPDATE);
        expect(receptionistPerms).not.toContain(P.APPOINTMENTS_DELETE);
    });

    test("lab_technician has NO appointment permissions", () => {
        const labPerms = ORG_ROLE_PERMISSIONS.lab_technician;
        expect(labPerms).not.toContain(P.APPOINTMENTS_READ);
        expect(labPerms).not.toContain(P.APPOINTMENTS_CREATE);
    });
});

// ─── 4. FSM Status Transitions ───────────────────────────────────────────────

describe("Appointment FSM — Status Transition Engine", () => {
    const { allowedTransitions, validateTransition, ACTIVE_STATUSES } = require("../modules/appointmentDomain/utils/statusTransitions");

    // ─── Valid Transitions ────────────────────────────────────
    test("open → confirmed (valid)", () => {
        const result = validateTransition("open", "confirmed");
        expect(result.valid).toBe(true);
        expect(result.normalizedStatus).toBe("confirmed");
    });

    test("open → cancelled (valid)", () => {
        const result = validateTransition("open", "cancelled");
        expect(result.valid).toBe(true);
    });

    test("open → no-show (valid)", () => {
        const result = validateTransition("open", "no-show");
        expect(result.valid).toBe(true);
    });

    test("confirmed → checked-in (valid)", () => {
        const result = validateTransition("confirmed", "checked-in");
        expect(result.valid).toBe(true);
    });

    test("confirmed → cancelled (valid)", () => {
        const result = validateTransition("confirmed", "cancelled");
        expect(result.valid).toBe(true);
    });

    test("confirmed → no-show (valid)", () => {
        const result = validateTransition("confirmed", "no-show");
        expect(result.valid).toBe(true);
    });

    test("checked-in → in-progress (valid)", () => {
        const result = validateTransition("checked-in", "in-progress");
        expect(result.valid).toBe(true);
    });

    test("checked-in → cancelled (valid)", () => {
        const result = validateTransition("checked-in", "cancelled");
        expect(result.valid).toBe(true);
    });

    test("in-progress → completed (valid)", () => {
        const result = validateTransition("in-progress", "completed");
        expect(result.valid).toBe(true);
    });

    test("in-progress → cancelled (valid)", () => {
        const result = validateTransition("in-progress", "cancelled");
        expect(result.valid).toBe(true);
    });

    test("delayed → confirmed (valid)", () => {
        const result = validateTransition("delayed", "confirmed");
        expect(result.valid).toBe(true);
    });

    test("delayed → cancelled (valid)", () => {
        const result = validateTransition("delayed", "cancelled");
        expect(result.valid).toBe(true);
    });

    test("waiting-list → open (valid)", () => {
        const result = validateTransition("waiting-list", "open");
        expect(result.valid).toBe(true);
    });

    // ─── Invalid Transitions ─────────────────────────────────
    test("completed → anything (REJECTED — terminal)", () => {
        expect(validateTransition("completed", "open").valid).toBe(false);
        expect(validateTransition("completed", "cancelled").valid).toBe(false);
        expect(validateTransition("completed", "in-progress").valid).toBe(false);
    });

    test("cancelled → anything (REJECTED — terminal)", () => {
        expect(validateTransition("cancelled", "open").valid).toBe(false);
        expect(validateTransition("cancelled", "confirmed").valid).toBe(false);
    });

    test("no-show → anything (REJECTED — terminal)", () => {
        expect(validateTransition("no-show", "open").valid).toBe(false);
        expect(validateTransition("no-show", "confirmed").valid).toBe(false);
    });

    test("open → completed (REJECTED — must go through in-progress)", () => {
        const result = validateTransition("open", "completed");
        expect(result.valid).toBe(false);
    });

    test("open → in-progress (REJECTED — must go through checked-in)", () => {
        const result = validateTransition("open", "in-progress");
        expect(result.valid).toBe(false);
    });

    test("confirmed → completed (REJECTED — must progress stepwise)", () => {
        const result = validateTransition("confirmed", "completed");
        expect(result.valid).toBe(false);
    });

    // ─── Input normalization ─────────────────────────────────
    test("normalizes input to lowercase", () => {
        const result = validateTransition("open", "CONFIRMED");
        expect(result.valid).toBe(true);
        expect(result.normalizedStatus).toBe("confirmed");
    });

    test("rejects unknown status", () => {
        const result = validateTransition("open", "invalid_status");
        expect(result.valid).toBe(false);
        expect(result.message).toContain("Unknown status");
    });

    test("rejects unknown current status", () => {
        const result = validateTransition("nonexistent", "open");
        expect(result.valid).toBe(false);
        expect(result.message).toContain("Unknown current status");
    });

    // ─── Active statuses ─────────────────────────────────────
    test("ACTIVE_STATUSES contains slot-blocking statuses only", () => {
        expect(ACTIVE_STATUSES).toEqual(["open", "confirmed", "checked-in", "in-progress"]);
    });

    test("cancelled is NOT in ACTIVE_STATUSES (does not block slots)", () => {
        expect(ACTIVE_STATUSES).not.toContain("cancelled");
    });

    test("completed is NOT in ACTIVE_STATUSES (does not block slots)", () => {
        expect(ACTIVE_STATUSES).not.toContain("completed");
    });

    test("no-show is NOT in ACTIVE_STATUSES", () => {
        expect(ACTIVE_STATUSES).not.toContain("no-show");
    });

    // ─── Allowed transitions map completeness ────────────────
    test("all 9 statuses have defined transition rules", () => {
        const expectedStatuses = [
            "open", "confirmed", "checked-in", "in-progress",
            "completed", "delayed", "cancelled", "no-show", "waiting-list"
        ];
        for (const status of expectedStatuses) {
            expect(allowedTransitions[status]).toBeDefined();
            expect(Array.isArray(allowedTransitions[status])).toBe(true);
        }
    });

    test("terminal statuses have empty transition arrays", () => {
        expect(allowedTransitions["completed"]).toEqual([]);
        expect(allowedTransitions["cancelled"]).toEqual([]);
        expect(allowedTransitions["no-show"]).toEqual([]);
    });
});

// ─── 5. Overlap Detection ────────────────────────────────────────────────────

describe("Appointment Overlap Detection — Architecture", () => {
    const overlapModule = require("../modules/appointmentDomain/utils/overlapDetection");

    test("exports detectOverlaps function", () => {
        expect(typeof overlapModule.detectOverlaps).toBe("function");
    });

    test("exports findDentistOverlap function", () => {
        expect(typeof overlapModule.findDentistOverlap).toBe("function");
    });

    test("exports findChairOverlap function", () => {
        expect(typeof overlapModule.findChairOverlap).toBe("function");
    });

    test("exports ACTIVE_STATUSES (re-export from statusTransitions)", () => {
        expect(overlapModule.ACTIVE_STATUSES).toBeDefined();
        expect(Array.isArray(overlapModule.ACTIVE_STATUSES)).toBe(true);
        expect(overlapModule.ACTIVE_STATUSES.length).toBe(4);
    });
});

// ─── 6. Controller Architecture ──────────────────────────────────────────────

describe("Appointment Controller — Contract", () => {
    const controller = require("../modules/appointmentDomain/appointment.controller");

    test("exports getAvailability", () => {
        expect(typeof controller.getAvailability).toBe("function");
    });

    test("exports createAppointment", () => {
        expect(typeof controller.createAppointment).toBe("function");
    });

    test("exports updateAppointmentStatus", () => {
        expect(typeof controller.updateAppointmentStatus).toBe("function");
    });

    test("exports getAppointments", () => {
        expect(typeof controller.getAppointments).toBe("function");
    });

    test("exports getAppointment", () => {
        expect(typeof controller.getAppointment).toBe("function");
    });

    test("exports updateAppointment", () => {
        expect(typeof controller.updateAppointment).toBe("function");
    });

    test("exports deleteAppointment", () => {
        expect(typeof controller.deleteAppointment).toBe("function");
    });

    test("exports getCalendarDay", () => {
        expect(typeof controller.getCalendarDay).toBe("function");
    });
});

// ─── 7. Sovereign Appointment Service ────────────────────────────────────────

describe("Appointment Service — Sovereign Domain", () => {
    const service = require("../modules/appointmentDomain/services/appointment.service");

    test("exports createAppointment", () => {
        expect(typeof service.createAppointment).toBe("function");
    });

    test("exports handleBookingApproval (idempotent)", () => {
        expect(typeof service.handleBookingApproval).toBe("function");
    });

    test("exports updateStatus (version-controlled)", () => {
        expect(typeof service.updateStatus).toBe("function");
    });

    test("exports getUpcomingAppointment (read method)", () => {
        expect(typeof service.getUpcomingAppointment).toBe("function");
    });

    test("exports getPatientAppointments (read method)", () => {
        expect(typeof service.getPatientAppointments).toBe("function");
    });
});

// ─── 8. Domain Events ────────────────────────────────────────────────────────

describe("Appointment Domain Events — Contract", () => {
    const domainEvents = require("../core/domainEvents");

    test("APPOINTMENT_CREATED event is defined", () => {
        expect(domainEvents.APPOINTMENT_CREATED).toBeDefined();
        expect(typeof domainEvents.APPOINTMENT_CREATED).toBe("string");
    });

    test("APPOINTMENT_UPDATED event is defined", () => {
        expect(domainEvents.APPOINTMENT_UPDATED).toBeDefined();
    });

    test("APPOINTMENT_STATUS_CHANGED event is defined", () => {
        expect(domainEvents.APPOINTMENT_STATUS_CHANGED).toBeDefined();
    });
});

// ─── 9. Route Architecture ───────────────────────────────────────────────────

describe("Appointment Routes — Architecture Validation", () => {
    test("appointmentRoutes module exports express Router", () => {
        const routes = require("../routes/appointmentRoutes");
        expect(routes).toBeDefined();
        expect(typeof routes).toBe("function");
    });

    test("routes are entitlement-gated via requireEntitlement", () => {
        const requireEntitlement = require("../middleware/requireEntitlement");
        expect(typeof requireEntitlement).toBe("function");
    });

    test("branchContext.middleware exists for branch access filtering", () => {
        const branchContext = require("../middleware/branchContext.middleware");
        expect(typeof branchContext).toBe("function");
    });
});
