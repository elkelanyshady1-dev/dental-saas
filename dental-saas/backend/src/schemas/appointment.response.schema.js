/**
 * appointment.response.schema.js — Appointment Response Contracts (Zod)
 *
 * Counterpart to patient.response.schema.js. Defines the EXACT shape
 * of appointment mutation/read responses. DTO builders in
 * modules/appointmentDomain/dto/appointment.dto.js enforce these
 * schemas via contractEnforcer.
 *
 * RULE: Every field in appointment.dto.js MUST be declared here.
 * RULE: Optional/nullable fields use z.*.nullable().optional().
 * RULE: Responses are strict — no passthrough.
 */

"use strict";

const { z } = require("zod");

const mongoId = z.any();
const nullableString = z.string().nullable().optional();
const nullableDate = z.any().nullable().optional();
const nullableNumber = z.number().nullable().optional();

const APPOINTMENT_STATUS = [
    "open",
    "confirmed",
    "checked-in",
    "in-progress",
    "completed",
    "delayed",
    "postponed",
    "cancelled",
    "no-show",
    "waiting-list",
];

const APPOINTMENT_TYPE = ["consultation", "cleaning", "orthodontics", "emergency", "other"];

const treatmentSnapshot = z
    .object({
        procedureId: z.any().nullable().optional(),
        categoryId: z.any().nullable().optional(),
        categoryName: nullableString,
        name: nullableString,
        duration: nullableNumber,
        color: nullableString,
    })
    .nullable()
    .optional();

const statusHistoryEntry = z.object({
    status: z.string(),
    changedBy: z.any().nullable().optional(),
    changedAt: nullableDate,
});

// ── Core DTO (canonical mutation response) ──────────────────────────────────

const appointmentResponseSchema = z
    .object({
        _id: mongoId,
        organizationId: nullableString,
        branchId: nullableString,
        patientId: nullableString,
        dentistId: nullableString,
        chairId: nullableString,

        startTime: nullableDate,
        endTime: nullableDate,
        duration: nullableNumber,

        status: z.enum(APPOINTMENT_STATUS),
        type: z.enum(APPOINTMENT_TYPE).default("consultation"),

        checkedInAt: nullableDate,
        startedAt: nullableDate,
        completedAt: nullableDate,
        cancelledAt: nullableDate,
        waitingDuration: nullableNumber,

        notes: z.string().default(""),

        treatment: treatmentSnapshot,

        isActive: z.boolean().default(true),

        clinicalCaseId: nullableString,
        phaseId: nullableString,
        visitSequenceNumber: nullableNumber,

        version: z.number().default(0),

        createdAt: nullableDate,
        updatedAt: nullableDate,

        // Conditional (admin/manager scope)
        statusHistory: z.array(statusHistoryEntry).optional(),
        // Conditional (finance scope)
        revenueAmount: nullableNumber,
    })
    .strict();

// ── Summary DTO (calendar cells, notification payloads) ─────────────────────

const appointmentSummaryResponseSchema = z
    .object({
        _id: mongoId,
        branchId: nullableString,
        patientId: nullableString,
        dentistId: nullableString,
        chairId: nullableString,
        startTime: nullableDate,
        endTime: nullableDate,
        duration: nullableNumber,
        status: z.enum(APPOINTMENT_STATUS),
        type: z.enum(APPOINTMENT_TYPE).default("consultation"),
    })
    .strict();

module.exports = {
    appointmentResponseSchema,
    appointmentSummaryResponseSchema,
    APPOINTMENT_STATUS,
    APPOINTMENT_TYPE,
};
