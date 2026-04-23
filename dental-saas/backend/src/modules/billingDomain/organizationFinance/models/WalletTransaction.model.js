/**
 * WalletTransaction.model.js — Patient Wallet Transaction Ledger
 * Billing Domain — Phase P0.3
 *
 * Records every credit/debit against a patient wallet.
 * Provides idempotency via unique index on idempotencyKey.
 *
 * INVARIANTS:
 * 1. Each transaction has a unique idempotencyKey (prevents double-processing)
 * 2. Transactions are append-only (immutable once created)
 * 3. Amount is always positive — type indicates direction
 *
 * PLANE: Organization only.
 * @per-org-transactional — stored in per-org database.
 */

"use strict";

const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
    {
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ["credit", "debit"],
            required: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        amountMinor: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: "AED",
        },
        reason: {
            type: String,
            required: true,
            maxlength: 500,
        },
        invoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PatientInvoice",
        },
        refundId: {
            type: mongoose.Schema.Types.ObjectId,
        },
        idempotencyKey: {
            type: String,
            required: true,
        },
        processedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        balanceAfter: {
            type: Number,
            required: true,
        },
        balanceAfterMinor: {
            type: Number,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// Idempotency: exactly one transaction per key
walletTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });

// Query: patient transaction history (paginated, sorted by time)
walletTransactionSchema.index({ patientId: 1, createdAt: -1 });

const modelName = "WalletTransaction";

module.exports = {
    modelName,
    schema: walletTransactionSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, walletTransactionSchema),
};
