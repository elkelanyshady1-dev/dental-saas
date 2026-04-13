/**
 * invoice.validator.js
 * Phase 3 — Input Validation Schemas (Zod)
 *
 * Validates invoice creation and void payloads.
 */

"use strict";

const { z } = require("zod");

const mongoId = z.string().min(1, "Required").regex(/^[a-f\d]{24}$/i, "Invalid ID format");

// ─── Create Invoice ───────────────────────────────────────────────────────

const invoiceTreatmentItem = z.object({
    treatmentId: mongoId.optional(),
    procedureName: z.string().max(200).optional(),
    toothNumber: z.string().max(3).optional(),
    unitPrice: z.number().min(0),
    quantity: z.number().int().min(1).default(1),
});

const invoiceChargeItem = z.object({
    type: z.string().max(100),
    description: z.string().max(500).optional(),
    amount: z.number().min(0),
    appointmentId: mongoId.optional(),
});

const createInvoiceSchema = z.object({
    patientId: mongoId,
    branchId: mongoId,
    regionCode: z.string().length(2).optional(), // ISO 3166-1 alpha-2
    treatments: z.array(invoiceTreatmentItem).optional(),
    charges: z.array(invoiceChargeItem).optional(),
    discount: z.number().min(0).default(0),
    insuranceCovered: z.number().min(0).default(0),
    tax: z.number().min(0).default(0),
    treatmentOperatorId: mongoId.optional(),
});

// ─── Void Invoice ─────────────────────────────────────────────────────────

const voidInvoiceSchema = z.object({
    voidedReason: z.string().min(1, "Reason is required").max(500),
    expectedVersion: z.number().int().min(0),
});

module.exports = {
    createInvoiceSchema,
    voidInvoiceSchema,
};
