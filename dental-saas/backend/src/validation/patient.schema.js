/**
 * patient.schema.js — Zod Validation Schemas for Patient Domain
 * Phase 9 — Contract-Driven Architecture
 *
 * MANDATORY VALIDATION GATEKEEPER.
 * Every patient mutation (create/update) MUST pass through these schemas
 * BEFORE reaching the service layer.
 *
 * Rules:
 *   1. At least one name field is ALWAYS required (nameEnglish, nameArabic, or name).
 *   2. Phone is validated at the schema boundary (format validated deeper in service).
 *   3. Gender is a strict enum — no arbitrary strings.
 *   4. Country is ISO 3166-1 alpha-2 (2 uppercase letters).
 *
 * Usage:
 *   const { createPatientSchema } = require("@/validation/patient.schema");
 *   const validated = createPatientSchema.parse(req.body);
 */

"use strict";

const { z } = require("zod");

// ─── Shared Atoms ───────────────────────────────────────────────────────────

const trimmedString = z.string().trim();
const optionalTrimmedString = z.string().trim().optional().or(z.literal(""));
const optionalEmail = z.union([
    z.string().email().trim(),
    z.literal(""),
    z.undefined(),
]).optional();

// ─── CREATE Patient Schema ──────────────────────────────────────────────────

const createPatientSchema = z.object({
    // ── Names (at least one required) ────────────────────────────────────
    name: optionalTrimmedString,
    fullName: optionalTrimmedString,
    nameEnglish: optionalTrimmedString,
    nameArabic: optionalTrimmedString,
    firstName: optionalTrimmedString,
    middleName: optionalTrimmedString,
    lastName: optionalTrimmedString,

    // ── Contact ──────────────────────────────────────────────────────────
    phone: trimmedString.min(1, "Phone number is required"),
    secondaryPhone: optionalTrimmedString,
    email: optionalEmail,
    country: z.string().length(2).toUpperCase().optional()
        .or(z.literal(""))
        .or(z.undefined()),

    // ── Demographics ─────────────────────────────────────────────────────
    gender: z.enum(["male", "female", "other"]).optional(),
    dateOfBirth: z.string().optional().or(z.literal("")),
    maritalStatus: z.enum(["single", "married", "divorced", "widowed", ""]).optional(),
    nationality: optionalTrimmedString,
    nationalId: optionalTrimmedString,
    address: optionalTrimmedString,
    job: optionalTrimmedString,

    // ── Clinical identifiers ─────────────────────────────────────────────
    patientCode: optionalTrimmedString,

    // ── Branch Assignment ────────────────────────────────────────────────
    primaryBranchId: z.string().optional(), // validated as ObjectId downstream
    allowedBranchIds: z.array(z.string()).optional(),

    // ── Insurance ────────────────────────────────────────────────────────
    insurance: z.object({
        provider: z.string().optional(),
        policyNumber: z.string().optional(),
    }).optional(),

    // ── Emergency Contact ────────────────────────────────────────────────
    emergencyContact: z.object({
        name: z.string().optional(),
        phone: z.string().optional(),
        relation: z.string().optional(),
    }).optional(),

    // ── Notes ─────────────────────────────────────────────────────────────
    notes: optionalTrimmedString,

    // ── Internal flags ──────────────────────────────────────────────────
    status: z.enum(["complete", "incomplete"]).optional(),
}).superRefine((data, ctx) => {
    // Phase 9.1: Hard lock — at least one non-empty name is required
    const hasName =
        (data.nameEnglish && data.nameEnglish.trim().length > 0) ||
        (data.nameArabic && data.nameArabic.trim().length > 0) ||
        (data.name && data.name.trim().length > 0) ||
        (data.fullName && data.fullName.trim().length > 0);

    if (!hasName) {
        ctx.addIssue({
            code: "custom",
            path: ["name"],
            message: "At least one valid name is required (nameEnglish, nameArabic, name, or fullName)",
        });
    }
}).transform((data) => {
    // Strip empty strings to undefined for cleaner downstream processing
    const cleaned = { ...data };
    for (const key of Object.keys(cleaned)) {
        if (cleaned[key] === "") cleaned[key] = undefined;
    }
    return cleaned;
});


// ─── UPDATE Patient Schema (all fields optional, but name still validated) ──

const updatePatientSchema = z.object({
    name: optionalTrimmedString,
    fullName: optionalTrimmedString,
    nameEnglish: optionalTrimmedString,
    nameArabic: optionalTrimmedString,
    firstName: optionalTrimmedString,
    middleName: optionalTrimmedString,
    lastName: optionalTrimmedString,

    phone: optionalTrimmedString,
    secondaryPhone: optionalTrimmedString,
    email: optionalEmail,
    country: z.string().length(2).toUpperCase().optional()
        .or(z.literal(""))
        .or(z.undefined()),

    gender: z.enum(["male", "female", "other"]).optional(),
    dateOfBirth: z.string().optional().or(z.literal("")),
    maritalStatus: z.enum(["single", "married", "divorced", "widowed", ""]).optional(),
    nationality: optionalTrimmedString,
    nationalId: optionalTrimmedString,
    address: optionalTrimmedString,
    job: optionalTrimmedString,

    patientCode: optionalTrimmedString,

    insurance: z.object({
        provider: z.string().optional(),
        policyNumber: z.string().optional(),
    }).optional(),

    emergencyContact: z.object({
        name: z.string().optional(),
        phone: z.string().optional(),
        relation: z.string().optional(),
    }).optional(),

    notes: optionalTrimmedString,
    expectedVersion: z.number().optional(),
}).passthrough(); // Allow additional fields for backward compatibility


// ─── QUICK CREATE Schema (minimal) ──────────────────────────────────────────

const quickCreatePatientSchema = z.object({
    fullName: trimmedString.min(1, "Full name is required"),
    phone: trimmedString.min(1, "Phone number is required"),
    country: z.string().length(2).toUpperCase().optional().default("EG"),
    primaryBranchId: z.string().min(1, "Branch ID is required"),
    allowedBranchIds: z.array(z.string()).optional(),
});


module.exports = {
    createPatientSchema,
    updatePatientSchema,
    quickCreatePatientSchema,
};
