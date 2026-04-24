/**
 * appointmentQueryValidation.test.js — Regression tests for appointment query validation
 *
 * Covers the patientId / date-range query contract that caused the 400 bug:
 *   - patientId alone → valid (dates defaulted by controller)
 *   - startDate + endDate alone → valid (calendar use case)
 *   - patientId + startDate + endDate → valid (filtered patient history)
 *   - no patientId, no dates → invalid
 */

"use strict";

const { listAppointmentsQuerySchema } = require("../modules/appointmentDomain/validators/appointment.validator");

describe("listAppointmentsQuerySchema — Query Contract", () => {

    test("patientId alone is valid (no dates required)", () => {
        const result = listAppointmentsQuerySchema.safeParse({
            patientId: "507f1f77bcf86cd799439011",
        });
        expect(result.success).toBe(true);
    });

    test("startDate + endDate alone is valid (calendar use case)", () => {
        const result = listAppointmentsQuerySchema.safeParse({
            startDate: "2026-04-01T00:00:00.000Z",
            endDate: "2026-04-30T23:59:59.999Z",
        });
        expect(result.success).toBe(true);
    });

    test("patientId + dates is valid (filtered patient history)", () => {
        const result = listAppointmentsQuerySchema.safeParse({
            patientId: "507f1f77bcf86cd799439011",
            startDate: "2026-01-01T00:00:00.000Z",
            endDate: "2026-04-30T23:59:59.999Z",
        });
        expect(result.success).toBe(true);
    });

    test("no patientId and no dates is INVALID", () => {
        const result = listAppointmentsQuerySchema.safeParse({});
        expect(result.success).toBe(false);
        expect(result.error.issues[0].message).toMatch(/patientId.*OR.*startDate.*endDate/i);
    });

    test("only startDate without endDate is INVALID", () => {
        const result = listAppointmentsQuerySchema.safeParse({
            startDate: "2026-04-01T00:00:00.000Z",
        });
        expect(result.success).toBe(false);
    });

    test("only endDate without startDate is INVALID", () => {
        const result = listAppointmentsQuerySchema.safeParse({
            endDate: "2026-04-30T23:59:59.999Z",
        });
        expect(result.success).toBe(false);
    });

    test("passes through additional query params (page, limit, branchId)", () => {
        const result = listAppointmentsQuerySchema.safeParse({
            patientId: "507f1f77bcf86cd799439011",
            page: "1",
            limit: "50",
            branchId: "507f1f77bcf86cd799439012",
        });
        expect(result.success).toBe(true);
        expect(result.data.page).toBe("1");
        expect(result.data.limit).toBe("50");
    });
});
