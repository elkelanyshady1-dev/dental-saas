/**
 * wallet.validator.js — Patient Wallet Zod Schemas
 * Billing Domain — Phase P0.3
 *
 * Input validation for wallet credit/debit operations.
 * CLAUDE.md §6.1: ALL write inputs MUST use Zod.
 *
 * PLANE: Organization only.
 */

"use strict";

const { z } = require("zod");

const creditWalletSchema = z.object({
    patientId: z.string().min(1, "patientId is required"),
    branchId: z.string().min(1, "branchId is required"),
    amount: z.number().positive("Amount must be positive"),
    reason: z.string().min(1, "Reason is required").max(500),
    idempotencyKey: z.string().min(1, "idempotencyKey is required"),
    notes: z.string().max(1000).optional(),
});

const debitWalletSchema = z.object({
    patientId: z.string().min(1, "patientId is required"),
    branchId: z.string().min(1, "branchId is required"),
    amount: z.number().positive("Amount must be positive"),
    invoiceId: z.string().optional(),
    reason: z.string().min(1, "Reason is required").max(500),
    idempotencyKey: z.string().min(1, "idempotencyKey is required"),
    notes: z.string().max(1000).optional(),
});

module.exports = {
    creditWalletSchema,
    debitWalletSchema,
};
