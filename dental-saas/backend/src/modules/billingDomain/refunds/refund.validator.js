/**
 * refund.validator.js — Refund Request Validation (Zod)
 * Billing Domain — Phase D (Refund Engine)
 *
 * Zod schemas for the refund API endpoint.
 * Validates paymentId, amount, and reason.
 *
 * PLANE: Org only.
 */

"use strict";

const { z } = require("zod");

const mongoId = z.string().min(1, "Required").regex(/^[a-f\d]{24}$/i, "Invalid ID format");

const processRefundSchema = z.object({
    paymentId: mongoId,
    amount: z.number().positive("Refund amount must be positive"),
    reason: z.string().min(3, "Refund reason must be at least 3 characters").max(500, "Refund reason must not exceed 500 characters"),
});

module.exports = {
    processRefundSchema,
};
