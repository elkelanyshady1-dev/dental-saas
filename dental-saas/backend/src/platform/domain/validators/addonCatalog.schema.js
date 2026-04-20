/**
 * addonCatalog.schema.js — Zod schemas for platform add-on catalog CRUD.
 * PLANE: Platform
 */

"use strict";

const { z } = require("zod");

// ─── Shared ───────────────────────────────────────────────────────────────────

const objectIdRegex = /^[0-9a-f]{24}$/i;

const regionPricingSchema = z.object({
    regionCode: z.string().min(2).max(8),
    countries:  z.array(z.string().length(2)).min(1),
    currency:   z.string().length(3),
    monthly:    z.number().nonnegative(),
    yearly:     z.number().nonnegative(),
    providerPriceIds: z.object({
        stripe: z.object({
            monthly: z.string().optional(),
            yearly:  z.string().optional(),
        }).partial().optional(),
        paymob: z.object({
            monthly: z.string().optional(),
            yearly:  z.string().optional(),
        }).partial().optional(),
    }).partial().optional(),
}).strict();

const benefitsSchema = z.record(z.string(), z.union([z.number(), z.boolean()]));

// ─── createAddOnSchema ────────────────────────────────────────────────────────

const createAddOnSchema = z.object({
    name:        z.string().min(1).max(120),
    code:        z.string().regex(/^[A-Z0-9_]+$/, "code must be uppercase alphanumeric/underscore").max(60),
    description: z.string().max(500).optional(),
    type:        z.enum(["QUOTA", "LIMIT", "FEATURE"]),
    benefits:    benefitsSchema,
    pricing: z.object({
        baseCurrency: z.string().length(3).default("USD"),
        regions:      z.array(regionPricingSchema).min(1),
    }).strict(),
    isActive: z.boolean().default(true),
}).strict();

// ─── updateAddOnSchema ────────────────────────────────────────────────────────

const updateAddOnSchema = z.object({
    expectedVersion: z.number().int().nonnegative(),
    patch: z.object({
        name:        z.string().min(1).max(120).optional(),
        description: z.string().max(500).optional(),
        benefits:    benefitsSchema.optional(),
        pricing: z.object({
            baseCurrency: z.string().length(3).optional(),
            regions:      z.array(regionPricingSchema).optional(),
        }).partial().optional(),
        isActive: z.boolean().optional(),
    }).strict(),
}).strict();

// ─── addOnIdParamSchema ───────────────────────────────────────────────────────

const addOnIdParamSchema = z.object({
    addOnId: z.string().regex(objectIdRegex, "addOnId must be a valid 24-character ObjectId"),
}).strict();

module.exports = { createAddOnSchema, updateAddOnSchema, addOnIdParamSchema };
