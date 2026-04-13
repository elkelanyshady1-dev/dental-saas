/**
 * payment.validator.js
 * Phase 3 — Input Validation Schemas (Zod)
 *
 * Validates payment recording payloads.
 */

"use strict";

const { z } = require("zod");

const mongoId = z.string().min(1, "Required").regex(/^[a-f\d]{24}$/i, "Invalid ID format");

const createPaymentSchema = z.object({
    patientId: mongoId,
    branchId: mongoId,
    invoiceId: mongoId.optional(),
    amount: z.number().positive("Amount must be greater than 0"),
    paymentMethod: z.enum(["cash", "card", "bank_transfer", "insurance"]),
    expectedVersion: z.number().int().min(0).optional(),
    notes: z.string().max(1000).optional(),
});

module.exports = {
    createPaymentSchema,
};
