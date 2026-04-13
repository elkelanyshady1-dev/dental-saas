/**
 * patient.response.schema.js — Patient Domain Response Contracts (Zod)
 * Phase 10 — API Contract Automation
 *
 * These schemas define the EXACT shape of API response bodies.
 * They are the SSOT for:
 *   1. DTO builder validation (parse enforcement)
 *   2. OpenAPI spec generation (via zodToOpenApi converter)
 *   3. Contract test assertions
 *
 * RULE: Every response field present in patient.dto.js MUST be declared here.
 * RULE: Optional/nullable fields use z.string().nullable().optional()
 * RULE: No `passthrough()` — responses are strict contracts.
 */

"use strict";

const { z } = require("zod");

// ── Shared Atoms ────────────────────────────────────────────────────────────

const mongoId = z.any(); // ObjectId — serialized as string in JSON
const nullableString = z.string().nullable().optional();
const nullableDate = z.any().nullable().optional(); // Date | string | null
const nullableNumber = z.number().nullable().optional();
const nullableBoolean = z.boolean().nullable().optional();

// ── Patient List DTO Schema ─────────────────────────────────────────────────

const patientListResponseSchema = z.object({
    _id:               mongoId,
    displayName:       z.string(),
    nameEnglish:       nullableString,
    nameArabic:        nullableString,
    patientCode:       nullableString,
    phone:             nullableString,
    phoneDigits:       nullableString,
    gender:            nullableString,
    dateOfBirth:       nullableDate,
    status:            z.string().default("complete"),
    isActive:          z.boolean().default(true),

    // Enrichment
    primaryBranchId:   nullableString,
    tags:              z.array(z.any()).default([]),
    alerts:            z.array(z.any()).default([]),
    lastVisit:         nullableDate,
    nextAppointment:   nullableDate,
    assignedDoctorId:  nullableString,
    priorityScore:     z.number().default(0),

    // Financial
    balance:           z.number().default(0),
    currency:          nullableString,
    hasActiveTreatment: z.boolean().default(false),
    insurance:         z.object({
        provider:      nullableString,
        policyNumber:  nullableString,
    }).nullable().optional(),

    // Timestamps
    createdAt:         nullableDate,

    // Doctor assignment (v32.0)
    assignedDoctorId:  nullableString,

    // Academic vs Private Classification (v32.0)
    careType:          z.enum(["PRIVATE", "ACADEMIC"]).default("PRIVATE"),
}).strict();

// ── Patient Search DTO Schema ───────────────────────────────────────────────

const patientSearchResponseSchema = z.object({
    _id:               mongoId,
    displayName:       z.string(),
    nameEnglish:       nullableString,
    nameArabic:        nullableString,
    patientCode:       nullableString,
    phone:             nullableString,
    phoneDigits:       nullableString,
    gender:            nullableString,
    dateOfBirth:       nullableDate,
    primaryBranchId:   nullableString,
    createdAt:         nullableDate,
    _matchType:        z.string().optional(),
}).strict();

// ── Patient Core DTO Schema (Detail/Aggregate) ─────────────────────────────

const patientCoreResponseSchema = z.object({
    patientCode:       nullableString,
    nameArabic:        nullableString,
    nameEnglish:       nullableString,
    displayName:       z.string(),
    phone:             nullableString,
    email:             nullableString,
    gender:            nullableString,
    dob:               nullableDate,
    address:           nullableString,
    nationality:       nullableString,
    nationalId:        nullableString,
    insurance:         z.object({}).passthrough().default({}),
    emergencyContact:  z.object({}).passthrough().default({}),
    isActive:          z.boolean().default(true),
    status:            z.string().default("complete"),
    version:           z.any().optional(),
    // Doctor assignment (v32.0)
    assignedDoctorId:  nullableString.optional(),
    // Academic vs Private Classification (v32.0)
    careType:          z.enum(["PRIVATE", "ACADEMIC"]).default("PRIVATE").optional(),
}).strict();

// ── Patient Summary DTO Schema (Minimal) ────────────────────────────────────

const patientSummaryResponseSchema = z.object({
    _id:               mongoId,
    displayName:       z.string(),
    patientCode:       nullableString,
    phone:             nullableString,
}).strict();

module.exports = {
    patientListResponseSchema,
    patientSearchResponseSchema,
    patientCoreResponseSchema,
    patientSummaryResponseSchema,
};
