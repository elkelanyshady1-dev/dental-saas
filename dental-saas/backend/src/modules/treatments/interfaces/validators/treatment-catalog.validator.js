/**
 * treatment-catalog.validator.js
 * Treatments Domain — Zod Validation Schemas
 *
 * RULE: ALL mutations MUST pass Zod validation before DB write.
 */

"use strict";

const { z } = require("zod");

// ── Category ─────────────────────────────────────────────────────────────────

const createCategorySchema = z.object({
    name: z.string().min(1, "name is required").max(100),
    code: z.string().min(1, "code is required").max(20).toUpperCase(),
    icon: z.string().max(60).optional(),
    description: z.string().max(500).optional(),
    sortOrder: z.number().int().min(0).optional(),
});

const updateCategorySchema = z.object({
    name: z.string().min(1).max(100).optional(),
    icon: z.string().max(60).optional(),
    description: z.string().max(500).optional(),
    sortOrder: z.number().int().min(0).optional(),
}).refine(data => Object.keys(data).length > 0, {
    message: "At least one field is required to update",
});

// ── Procedure ─────────────────────────────────────────────────────────────────

const createProcedureSchema = z.object({
    categoryId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid categoryId"),
    name: z.string().min(1, "name is required").max(150),
    code: z.string().min(1, "code is required").max(20).toUpperCase(),
    duration: z.number().int().min(5, "duration must be at least 5 minutes"),
    price: z.number().min(0).nullable().optional(),
    currency: z.string().max(3).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "color must be a valid hex color like #4f46e5").optional(),
    description: z.string().max(500).optional(),
    sortOrder: z.number().int().min(0).optional(),
});

const updateProcedureSchema = z.object({
    name: z.string().min(1).max(150).optional(),
    duration: z.number().int().min(5).optional(),
    price: z.number().min(0).nullable().optional(),
    currency: z.string().max(3).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    description: z.string().max(500).optional(),
    sortOrder: z.number().int().min(0).optional(),
}).refine(data => Object.keys(data).length > 0, {
    message: "At least one field is required to update",
});

module.exports = {
    createCategorySchema,
    updateCategorySchema,
    createProcedureSchema,
    updateProcedureSchema,
};
