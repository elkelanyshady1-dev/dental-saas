/**
 * LedgerTransaction.model.js
 * Platform Finance — Double-Entry Ledger Transaction
 *
 * A LedgerTransaction is a balanced set of debit/credit entries.
 * Invariant: SUM(debit) === SUM(credit) for all entries in a transaction.
 *
 * This model is ADDITIVE — it lives alongside the existing BillingLedger
 * event log and does NOT replace it. Existing billing events continue
 * to write to BillingLedger (append-only, audit chain preserved).
 *
 * LedgerTransaction provides the double-entry accounting layer on top.
 *
 * ── Reference types ──────────────────────────────────────────────────────────
 *   invoice    → PlatformInvoice._id  (referenceLabel: invoiceNumber)
 *   contract   → OrgContract._id      (referenceLabel: planCode + orgId slice)
 *   payment    → PaymentAttempt._id   (referenceLabel: providerPaymentId)
 *   refund     → PlatformRefund._id   (referenceLabel: refundId)
 *   ledger     → BillingLedger._id    (for back-link to the originating event)
 *
 * PLANE: Platform / Finance
 * COLLECTION: ledgertransactions
 */

"use strict";

const mongoose = require("mongoose");

// ── Embedded ledger entry schema (one debit or one credit leg) ────────────────
const ledgerEntrySchema = new mongoose.Schema(
    {
        // Account code from LedgerAccount (e.g. "accounts_receivable")
        accountCode: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },

        // Exactly one of debit/credit must be > 0; the other must be 0.
        // Stored in major currency units (e.g. 99.00 not 9900).
        debit: {
            type: Number,
            default: 0,
            min: 0
        },
        credit: {
            type: Number,
            default: 0,
            min: 0
        },

        // Brief description of this leg (e.g. "Invoice payment received")
        description: {
            type: String,
            default: ""
        }
    },
    { _id: false }   // No separate _id for embedded subdocs
);

// ── Transaction schema ────────────────────────────────────────────────────────
const ledgerTransactionSchema = new mongoose.Schema(
    {
        // Human-readable description (e.g. "Invoice INV-00045 payment received")
        description: {
            type: String,
            required: true,
            trim: true
        },

        // ── Reference to the source entity ───────────────────────────────────
        referenceType: {
            type: String,
            enum: ["invoice", "contract", "payment", "refund", "ledger", "manual"],
            required: true
        },
        referenceId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },

        // Denormalized label for display (avoids lookup on read).
        // Example: "INV-00045", "CONTRACT-abc123", "pay_stripe_evt_xxx"
        referenceLabel: {
            type: String,
            default: ""
        },

        // ISO 4217 currency for all entries in this transaction
        currency: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },

        // Total transaction amount (sum of all debit legs == sum of all credit legs)
        totalAmount: {
            type: Number,
            required: true,
            min: 0
        },

        // The balanced set of debit/credit entries.
        // Validation: sum(debit) must equal sum(credit).
        entries: {
            type: [ledgerEntrySchema],
            required: true,
            validate: {
                validator(entries) {
                    if (!entries || entries.length < 2) return false;
                    const totalDebit = entries.reduce((s, e) => s + (e.debit || 0), 0);
                    const totalCredit = entries.reduce((s, e) => s + (e.credit || 0), 0);
                    // Allow for floating-point epsilon
                    return Math.abs(totalDebit - totalCredit) < 0.001;
                },
                message: "LedgerTransaction entries are unbalanced: totalDebit must equal totalCredit"
            }
        },

        // Back-link to the originating BillingLedger event (for traceability)
        billingLedgerRef: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BillingLedger",
            default: null
        },

        // Denormalized for analytics queries without joins
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            default: null
        },

        // Source system that created this transaction
        source: {
            type: String,
            default: "system"
        }
    },
    {
        // Append-only — no updatedAt intentionally
        timestamps: { createdAt: true, updatedAt: false },
        collection: "ledgertransactions"
    }
);

// ── Immutability guards (mirrors BillingLedger) ───────────────────────────────
ledgerTransactionSchema.pre(["updateOne", "findOneAndUpdate", "replaceOne", "updateMany"], function () {
    throw new Error("[LedgerTransaction] Immutability: transactions are append-only.");
});
ledgerTransactionSchema.pre(["deleteOne", "findOneAndDelete", "deleteMany"], function () {
    throw new Error("[LedgerTransaction] Immutability: transactions cannot be deleted.");
});

// ── Indexes ───────────────────────────────────────────────────────────────────
ledgerTransactionSchema.index({ referenceType: 1, referenceId: 1 });
ledgerTransactionSchema.index({ organizationId: 1, createdAt: -1 });
ledgerTransactionSchema.index({ billingLedgerRef: 1 }, { sparse: true });
ledgerTransactionSchema.index({ createdAt: -1 });

const modelName = "LedgerTransaction";

module.exports = {
    modelName,
    schema: ledgerEntrySchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, ledgerEntrySchema),
};
