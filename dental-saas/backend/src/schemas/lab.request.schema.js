/**
 * lab.request.schema.js — Lab Domain Request Contracts (Zod)
 *
 * SSOT for POST/PUT/PATCH request body validation on the lab domain routes.
 * Parallel to lab.response.schema.js (which validates outbound DTOs).
 *
 * Each write-service entry point SHOULD call schema.parse(data) at its top,
 * replacing the ad-hoc `_requireField` / `_requirePositiveNumber` helpers.
 *
 * PLANE: Org only.
 */

"use strict";

const { z } = require("zod");

// ── Atoms ───────────────────────────────────────────────────────────────────

const mongoId = z.string().min(1);
const nonNegMoney = z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v >= 0, { message: "Must be a non-negative number" });
const optionalDate = z
    .union([z.string(), z.date()])
    .optional()
    .nullable();

const CASE_STATUSES = [
    "draft",
    "sent",
    "accepted",
    "in_production",
    "shipped",
    "delivered",
    "completed",
    "rejected",
];

const PARTNER_STATUSES = ["active", "inactive", "maintenance", "archived"];
const CLAIM_STATUSES   = ["pending", "approved", "paid", "rejected"];

// ── Lab Partner ─────────────────────────────────────────────────────────────

const createPartnerRequestSchema = z.object({
    name:           z.string().min(1, "Lab partner name is required"),
    location:       z.string().optional(),
    specialties:    z.array(z.string()).optional(),
    turnaroundDays: z.number().int().nonnegative().optional(),
    contact:        z.object({
        phone:   z.string().optional(),
        email:   z.string().email().optional().or(z.literal("")),
        website: z.string().optional(),
    }).optional(),
    status: z.enum(PARTNER_STATUSES).optional(),
    avatar: z.string().optional(),
    notes:  z.string().optional(),
}).strict();

const updatePartnerRequestSchema = createPartnerRequestSchema.partial();

// ── Lab Case ────────────────────────────────────────────────────────────────

const createCaseRequestSchema = z.object({
    labId:            mongoId,
    applianceType:    z.string().min(1, "Appliance type is required"),
    patientId:        mongoId.optional(),
    patientName:      z.string().optional(),
    caseCode:         z.string().optional(),
    prescription:     z.any().optional(),
    notes:            z.string().optional(),
    expectedDelivery: optionalDate,
    cost:             nonNegMoney.optional(),
}).strict();

const updateCaseRequestSchema = z.object({
    applianceType:    z.string().optional(),
    patientId:        mongoId.optional(),
    patientName:      z.string().optional(),
    prescription:     z.any().optional(),
    notes:            z.string().optional(),
    expectedDelivery: optionalDate,
    cost:             nonNegMoney.optional(),
    trackingNumber:   z.string().optional(),
    trackingCarrier:  z.string().optional(),
}).strict().partial();

const updateCaseStatusRequestSchema = z.object({
    status:          z.enum(CASE_STATUSES),
    forceOverride:   z.boolean().optional(),
    trackingNumber:  z.string().optional(),
    trackingCarrier: z.string().optional(),
}).strict();

// ── Lab Claim ───────────────────────────────────────────────────────────────

const createClaimRequestSchema = z.object({
    caseId:        mongoId,
    caseCode:      z.string().optional(),
    labId:         mongoId,
    labName:       z.string().optional(),
    applianceType: z.string().optional(),
    cost:          nonNegMoney,
    serviceDate:   optionalDate,
    notes:         z.string().optional(),
}).strict();

// ── Message ─────────────────────────────────────────────────────────────────

const postMessageRequestSchema = z.object({
    message:     z.string().min(1, "Message content is required"),
    senderName:  z.string().optional(),
    senderType:  z.enum(["clinic", "lab"]).optional(),
    attachments: z.array(z.string().url().or(z.string().min(1))).optional(),
}).strict();

// ── Query Filters (list endpoints) ──────────────────────────────────────────

const coerceNumber = z
    .union([z.string(), z.number()])
    .transform((v) => (v === undefined || v === null || v === "" ? undefined : Number(v)))
    .refine((v) => v === undefined || Number.isFinite(v), { message: "Must be numeric" })
    .optional();

const listCasesQuerySchema = z.object({
    status:           z.string().optional(),
    labId:            z.string().optional(),
    search:           z.string().optional(),
    applianceType:    z.string().optional(),
    dateFrom:         z.string().optional(),
    dateTo:           z.string().optional(),
    costMin:          coerceNumber,
    costMax:          coerceNumber,
    includeArchived:  z.union([z.boolean(), z.string()]).optional(),
    page:             coerceNumber,
    limit:            coerceNumber,
}).passthrough();

const listClaimsQuerySchema = z.object({
    status:    z.string().optional(),
    labId:     z.string().optional(),
    dateFrom:  z.string().optional(),
    dateTo:    z.string().optional(),
    costMin:   coerceNumber,
    costMax:   coerceNumber,
    page:      coerceNumber,
    limit:     coerceNumber,
}).passthrough();

const listPartnersQuerySchema = z.object({
    status:          z.string().optional(),
    specialty:       z.string().optional(),
    search:          z.string().optional(),
    includeArchived: z.union([z.boolean(), z.string()]).optional(),
    page:            coerceNumber,
    limit:           coerceNumber,
}).passthrough();

// ── Helper: parse-or-400 ────────────────────────────────────────────────────

/**
 * Parse a request body against a schema; throws a 400 Error on failure
 * with a human-readable message built from Zod issues.
 */
function parseOr400(schema, data, label = "Invalid request body") {
    const result = schema.safeParse(data || {});
    if (!result.success) {
        const first = result.error?.issues?.[0];
        const detail = first
            ? `${first.path?.join(".") || "body"}: ${first.message}`
            : "invalid shape";
        const err = new Error(`${label} (${detail})`);
        err.statusCode = 400;
        err.issues = result.error.issues;
        throw err;
    }
    return result.data;
}

// ── Bulk operations ─────────────────────────────────────────────────────────

const bulkIdsRequestSchema = z.object({
    ids: z.array(mongoId).min(1, "At least one id is required").max(100, "Max 100 ids per call"),
}).strict();

module.exports = {
    CASE_STATUSES,
    PARTNER_STATUSES,
    CLAIM_STATUSES,

    createPartnerRequestSchema,
    updatePartnerRequestSchema,

    createCaseRequestSchema,
    updateCaseRequestSchema,
    updateCaseStatusRequestSchema,

    createClaimRequestSchema,
    postMessageRequestSchema,

    listCasesQuerySchema,
    listClaimsQuerySchema,
    listPartnersQuerySchema,

    bulkIdsRequestSchema,

    parseOr400,
};
