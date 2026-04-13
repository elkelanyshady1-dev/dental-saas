/**
 * appointment.validator.js
 * Clinical Operations — Input Validation Schemas (Zod)
 *
 * Validates appointment creation and update payloads.
 */

"use strict";

const { z } = require("zod");

const mongoId = z.string().min(1, "Required").regex(/^[a-f\d]{24}$/i, "Invalid ID format");

// ─── Create Appointment ───────────────────────────────────────────────────

const createAppointmentSchema = z.object({
    branchId: mongoId,
    patientId: mongoId,
    dentistId: mongoId,
    chairId: mongoId,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
    startTime: z.string().min(1, "Start time is required"),
    duration: z.number().int().min(5, "Minimum 5 minutes").max(480, "Maximum 8 hours"),
    notes: z.string().max(2000).optional(),
    force: z.boolean().optional(),
});

// ─── Update Appointment ───────────────────────────────────────────────────

const updateAppointmentSchema = z.object({
    branchId: mongoId.optional(),
    dentistId: mongoId.optional(),
    chairId: mongoId.optional(),
    startTime: z.string().optional(),
    duration: z.number().int().min(5).max(480).optional(),
    notes: z.string().max(2000).optional(),
    force: z.boolean().optional(),
});

// ─── Status Update ────────────────────────────────────────────────────────

const updateAppointmentStatusSchema = z.object({
    status: z.enum(["open", "confirmed", "checked-in", "in-progress", "completed", "cancelled", "no-show"]),
});

module.exports = {
    createAppointmentSchema,
    updateAppointmentSchema,
    updateAppointmentStatusSchema,
};
