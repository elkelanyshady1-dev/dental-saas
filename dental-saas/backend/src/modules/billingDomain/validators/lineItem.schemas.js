/**
 * lineItem.schemas.js — Shared Zod schemas for treatment + charge line items
 *
 * Extracted from invoice.validator.js so that both invoice and quotation
 * validators share the exact same line-item contract. Prevents drift.
 *
 * PLANE: Organization (billing domain)
 */

"use strict";

const { z } = require("zod");

const mongoId = z.string().min(1, "Required").regex(/^[a-f\d]{24}$/i, "Invalid ID format");

const treatmentLineItem = z.object({
    treatmentId: mongoId.optional(),
    procedureName: z.string().max(200).optional(),
    toothNumber: z.string().max(3).optional(),
    unitPrice: z.number().min(0),
    quantity: z.number().int().min(1).default(1),
});

const chargeLineItem = z.object({
    type: z.string().max(100),
    description: z.string().max(500).optional(),
    amount: z.number().min(0),
    appointmentId: mongoId.optional(),
});

module.exports = {
    mongoId,
    treatmentLineItem,
    chargeLineItem,
};
