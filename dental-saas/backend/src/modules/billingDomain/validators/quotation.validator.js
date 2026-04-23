/**
 * quotation.validator.js — Zod schemas for patient quotation payloads
 *
 * Reuses shared line-item schemas from lineItem.schemas.js to stay
 * in sync with invoice validation.
 *
 * PLANE: Organization (billing domain)
 */

"use strict";

const { z } = require("zod");
const { mongoId, treatmentLineItem, chargeLineItem } = require("./lineItem.schemas");

// ─── Create Quotation ────────────────────────────────────────────────────────

const createQuotationSchema = z.object({
    patientId: mongoId,
    branchId: mongoId,
    regionCode: z.string().length(2).optional(),
    treatments: z.array(treatmentLineItem).optional(),
    charges: z.array(chargeLineItem).optional(),
    discount: z.number().min(0).default(0),
    insuranceCovered: z.number().min(0).default(0),
    tax: z.number().min(0).default(0),
    notes: z.string().max(2000).optional(),
    treatmentOperatorId: mongoId.optional(),
    expiresAt: z.string().datetime().optional(),
}).strict();

// ─── Update Quotation (draft/sent only) ──────────────────────────────────────

const updateQuotationSchema = z.object({
    expectedVersion: z.number().int().min(0),
    treatments: z.array(treatmentLineItem).optional(),
    charges: z.array(chargeLineItem).optional(),
    discount: z.number().min(0).optional(),
    insuranceCovered: z.number().min(0).optional(),
    tax: z.number().min(0).optional(),
    notes: z.string().max(2000).optional(),
    treatmentOperatorId: mongoId.optional(),
    expiresAt: z.string().datetime().nullable().optional(),
}).strict().refine(
    (obj) => Object.keys(obj).some((k) => k !== "expectedVersion"),
    { message: "PATCH must include at least one field to update" }
);

// ─── Reject Quotation ────────────────────────────────────────────────────────

const rejectQuotationSchema = z.object({
    reason: z.string().min(1, "Reason is required").max(500),
}).strict();

// ─── Convert Quotation ───────────────────────────────────────────────────────

const convertQuotationSchema = z.object({
    expectedVersion: z.number().int().min(0),
}).strict();

// ─── Helper ──────────────────────────────────────────────────────────────────

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
    createQuotationSchema,
    updateQuotationSchema,
    rejectQuotationSchema,
    convertQuotationSchema,
    parse,
};
