/**
 * recall.validator.js — Zod validation schemas for Recall domain
 *
 * Validates recall creation and status-update payloads.
 * All mutations must pass Zod validation before DB write.
 */

"use strict";

const { z } = require("zod");

const mongoId = z.string().min(1, "Required").regex(/^[a-f\d]{24}$/i, "Invalid ID format");

const VALID_INTERVALS = ["2_weeks", "3_weeks", "1_month", "6_weeks", "3_months", "6_months", "custom"];
const VALID_STATUSES  = ["pending", "sent", "booked", "completed", "cancelled"];
const VALID_TYPES     = ["orthodontic", "general", "hygiene", "follow_up", "post_op"];

// ─── Create Recall (visit-linked) ────────────────────────────────────────

const createRecallSchema = z.object({
    visitId:    mongoId,
    patientId:  mongoId,
    branchId:   mongoId.optional(),
    interval:   z.enum(VALID_INTERVALS),
    customDate: z.string().datetime({ offset: true }).optional(),
    reason:     z.string().max(1000).optional(),
}).refine(
    (data) => data.interval !== "custom" || !!data.customDate,
    { message: "customDate is required when interval is 'custom'", path: ["customDate"] },
);

// ─── Update Recall Status ────────────────────────────────────────────────

const updateRecallStatusSchema = z.object({
    status:              z.enum(VALID_STATUSES),
    bookedAppointmentId: mongoId.optional(),
    notes:               z.string().max(2000).optional(),
});

/**
 * Parse helper — throws structured error with code VALIDATION_ERROR.
 *
 * @param {z.ZodSchema} schema
 * @param {Object} data
 * @returns {Object} parsed, validated data
 */
function parse(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        const err = new Error(result.error.issues.map((i) => i.message).join("; "));
        err.statusCode = 400;
        err.code       = "VALIDATION_ERROR";
        err.details    = result.error.issues;
        throw err;
    }
    return result.data;
}

module.exports = {
    createRecallSchema,
    updateRecallStatusSchema,
    parse,
    VALID_INTERVALS,
    VALID_STATUSES,
    VALID_TYPES,
};
