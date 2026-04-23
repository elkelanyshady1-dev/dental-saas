/**
 * recall.validator.js
 * Recall Domain — Input Validation Schemas (Zod)
 *
 * Controllers MUST .parse() request bodies through these schemas. No
 * ad-hoc if/else validation (CLAUDE.md §3).
 */

"use strict";

const { z } = require("zod");

const mongoId = z
    .string()
    .min(1, "Required")
    .regex(/^[a-f\d]{24}$/i, "Invalid ID format");

// ISO date string OR YYYY-MM-DD. JS `new Date(...)` accepts both.
const dateString = z
    .string()
    .min(1, "Required")
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: "Invalid date" });

const createRecallSchema = z
    .object({
        patientId: mongoId,
        dueDate: dateString,
        reason: z.string().max(1000).optional(),
    })
    .strict();

const updateRecallStatusSchema = z
    .object({
        status: z.enum(["pending", "sent", "booked", "cancelled"]),
    })
    .strict();

// Query filters on the list endpoint.
const listRecallsQuerySchema = z
    .object({
        status: z.enum(["pending", "sent", "booked", "cancelled"]).optional(),
        startDate: dateString.optional(),
        endDate: dateString.optional(),
    })
    .strict();

module.exports = {
    createRecallSchema,
    updateRecallStatusSchema,
    listRecallsQuerySchema,
};
