/**
 * treatment-catalog.validator.js
 * Domain: treatment-catalog
 * Layer: Interfaces > Validators
 *
 * RULE: ALL mutations MUST pass Zod validation before DB write.
 */

"use strict";

const { z } = require("zod");

// ── Helpers ───────────────────────────────────────────────────────────────────

const mongoId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ObjectId");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #4f46e5");

// ── Category ─────────────────────────────────────────────────────────────────

const createCategorySchema = z.object({
    name: z.string().min(1, "name is required").max(100),
    code: z.string().min(1, "code is required").max(20),
    icon: z.string().max(60).optional(),
    description: z.string().max(500).optional(),
    sortOrder: z.number().int().min(0).optional(),
});

const updateCategorySchema = z.object({
    name: z.string().min(1).max(100).optional(),
    icon: z.string().max(60).optional(),
    description: z.string().max(500).optional(),
    sortOrder: z.number().int().min(0).optional(),
}).refine(d => Object.keys(d).length > 0, {
    message: "At least one field is required to update",
});

// ── Procedure ─────────────────────────────────────────────────────────────────

const createProcedureSchema = z.object({
    categoryId: mongoId,
    name: z.string().min(1, "name is required").max(150),
    code: z.string().min(1, "code is required").max(20),
    duration: z.number().int().min(5, "duration must be ≥ 5 minutes"),
    price: z.number().min(0).nullable().optional(),
    color: hexColor.optional(),
    description: z.string().max(500).optional(),
    sortOrder: z.number().int().min(0).optional(),
});

const updateProcedureSchema = z.object({
    name: z.string().min(1).max(150).optional(),
    duration: z.number().int().min(5).optional(),
    price: z.number().min(0).nullable().optional(),
    color: hexColor.optional(),
    description: z.string().max(500).optional(),
    sortOrder: z.number().int().min(0).optional(),
}).refine(d => Object.keys(d).length > 0, {
    message: "At least one field is required to update",
});

module.exports = {
    createCategorySchema,
    updateCategorySchema,
    createProcedureSchema,
    updateProcedureSchema,
};
