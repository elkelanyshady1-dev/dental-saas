/**
 * lab.response.schema.js — Lab Domain Response Contracts (Zod)
 * Phase 10 — API Contract Automation
 *
 * SSOT for lab domain DTO validation, OpenAPI generation, contract tests.
 * Maps 1:1 to dto/lab.dto.js builders.
 *
 * PLANE: Org only.
 */

"use strict";

const { z } = require("zod");

// ── Shared Atoms ────────────────────────────────────────────────────────────

const nullableString = z.string().nullable().optional();
const nullableDate = z.any().nullable().optional();

// ── Lab Partner List ────────────────────────────────────────────────────────

const labPartnerListSchema = z.object({
    _id:            z.string(),
    displayName:    z.string(),
    name:           z.string().default(""),
    location:       z.string().default(""),
    specialties:    z.array(z.string()).default([]),
    turnaroundDays: z.number().nullable().optional(),
    rating:         z.number().default(0),
    ratingCount:    z.number().default(0),
    status:         z.string().default("active"),
    avatar:         nullableString,
}).strict();

// ── Lab Partner Detail ──────────────────────────────────────────────────────

const labPartnerDetailSchema = z.object({
    _id:            z.string(),
    displayName:    z.string(),
    name:           z.string().default(""),
    location:       z.string().default(""),
    specialties:    z.array(z.string()).default([]),
    turnaroundDays: z.number().nullable().optional(),
    rating:         z.number().default(0),
    ratingCount:    z.number().default(0),
    contact:        z.object({
        phone:      z.string().default(""),
        email:      z.string().default(""),
        website:    z.string().default(""),
    }),
    status:         z.string().default("active"),
    avatar:         nullableString,
    verifiedAt:     nullableDate,
    notes:          z.string().default(""),
    createdAt:      nullableDate,
    updatedAt:      nullableDate,
}).strict();

// ── Lab Case List ───────────────────────────────────────────────────────────

const labCaseListSchema = z.object({
    _id:                z.string(),
    caseCode:           z.string(),
    patientDisplayName: z.string(),
    patientName:        z.string().default(""),
    patientId:          nullableString,
    labDisplayName:     z.string(),
    labName:            z.string().default(""),
    labId:              nullableString,
    applianceType:      z.string().default(""),
    status:             z.string().default("draft"),
    cost:               z.number(),          // INV-LAB-DTO-3: always numeric
    expectedDelivery:   nullableDate,
    actualDelivery:     nullableDate,
    createdAt:          nullableDate,
    updatedAt:          nullableDate,
}).strict();

// ── Lab Case Detail ─────────────────────────────────────────────────────────

const labCaseDetailSchema = z.object({
    _id:                z.string(),
    caseCode:           z.string(),
    patientDisplayName: z.string(),
    patientName:        z.string().default(""),
    patientId:          nullableString,
    labDisplayName:     z.string(),
    labName:            z.string().default(""),
    labId:              nullableString,
    applianceType:      z.string().default(""),
    status:             z.string().default("draft"),
    prescription:       z.any().default({}),
    notes:              z.string().default(""),
    cost:               z.number(),
    expectedDelivery:   nullableDate,
    actualDelivery:     nullableDate,
    trackingNumber:     nullableString,
    trackingCarrier:    nullableString,
    claimId:            nullableString,
    createdAt:          nullableDate,
    updatedAt:          nullableDate,
}).strict();

// ── Lab Claim ───────────────────────────────────────────────────────────────

const labClaimSchema = z.object({
    _id:            z.string(),
    caseId:         nullableString,
    caseCode:       z.string().default(""),
    labDisplayName: z.string(),
    labName:        z.string().default(""),
    labId:          nullableString,
    applianceType:  z.string().default(""),
    cost:           z.number(),
    status:         z.string().default("pending"),
    approvedBy:     nullableString,
    approvedAt:     nullableDate,
    paidAt:         nullableDate,
    serviceDate:    nullableDate,
    notes:          z.string().default(""),
    createdAt:      nullableDate,
    updatedAt:      nullableDate,
}).strict();

// ── Lab Message ─────────────────────────────────────────────────────────────

const labMessageSchema = z.object({
    _id:          z.string(),
    caseId:       nullableString,
    sender:       z.string().default("system"),
    senderName:   z.string().default(""),
    senderType:   z.string().default("clinic"),
    message:      z.string().default(""),
    attachments:  z.array(z.string()).default([]),
    isSystem:     z.boolean(),
    createdAt:    nullableDate,
}).strict();

// ── Lab Dashboard ───────────────────────────────────────────────────────────

const labDashboardSchema = z.object({
    kpis: z.object({
        activeCases:        z.number(),
        pendingSubmissions: z.number(),
        inProduction:       z.number(),
        monthlyExpenses:    z.number(),
    }),
    recentActivity: z.array(labCaseListSchema),
}).strict();

module.exports = {
    labPartnerListSchema,
    labPartnerDetailSchema,
    labCaseListSchema,
    labCaseDetailSchema,
    labClaimSchema,
    labMessageSchema,
    labDashboardSchema,
};
