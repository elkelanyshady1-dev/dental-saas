/**
 * supportSettings.validator.js — Zod schemas for SupportSettings (Plan E14)
 *
 * PATCH semantics:
 *   - strict (rejects unknown keys)
 *   - expectedVersion required (optimistic concurrency)
 *   - all other fields optional (partial merge)
 *   - at least one updatable field required
 */

"use strict";

const { z } = require("zod");
const {
    KNOWN_CATEGORIES,
} = require("../models/SupportSettings.model");

const priority = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
const category = z.enum(KNOWN_CATEGORIES);

const slaHoursByPrioritySchema = z.object({
    CRITICAL: z.number().int().min(1).max(720).optional(),
    HIGH:     z.number().int().min(1).max(720).optional(),
    MEDIUM:   z.number().int().min(1).max(720).optional(),
    LOW:      z.number().int().min(1).max(720).optional(),
}).strict();

const escalationTargetSchema = z.object({
    level: z.number().int().min(1).max(5),
    role: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().max(200).optional(),
}).strict().refine(
    (obj) => obj.role || obj.email,
    { message: "escalationTarget must set at least one of { role, email }" }
);

const patchSupportSettingsSchema = z.object({
    expectedVersion: z.number().int().min(0),

    slaHoursByPriority: slaHoursByPrioritySchema.optional(),

    escalationTargets: z.array(escalationTargetSchema).max(5).optional()
        .refine(
            (arr) => {
                if (!arr) return true;
                const levels = arr.map((t) => t.level);
                return new Set(levels).size === levels.length;
            },
            { message: "escalationTargets levels must be unique" }
        ),

    allowedCategories: z.array(category).min(1).max(KNOWN_CATEGORIES.length).optional(),

    autoCloseAfterDays: z.number().int().min(1).max(365).optional(),
    ticketsPerDayCap: z.number().int().min(1).max(10000).optional(),
    reopenWindowDays: z.number().int().min(0).max(90).optional(),
}).strict().refine(
    (obj) => Object.keys(obj).some((k) => k !== "expectedVersion"),
    { message: "PATCH must include at least one field to update" }
);

function parse(schema, payload) {
    const result = schema.safeParse(payload);
    if (result.success) return result.data;
    const err = new Error("VALIDATION_ERROR");
    err.code = "VALIDATION_ERROR";
    err.status = 400;
    err.details = result.error.issues.map((i) => ({
        path: i.path,
        message: i.message,
        code: i.code,
    }));
    throw err;
}

module.exports = {
    patchSupportSettingsSchema,
    slaHoursByPrioritySchema,
    escalationTargetSchema,
    parse,
};
