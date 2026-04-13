/**
 * JournalEntry.model.js
 * Billing Domain — Double-Entry Accounting Journal
 *
 * Phase C — Ledger System Implementation
 *
 * A JournalEntry is an IMMUTABLE record of a financial transaction using
 * double-entry bookkeeping. Every financial event (invoice, payment, refund)
 * creates exactly one JournalEntry containing balanced debit/credit lines.
 *
 * INVARIANTS:
 * 1. totalDebit MUST equal totalCredit (enforced by pre-validate hook)
 * 2. entries MUST contain at least 2 lines (double-entry minimum)
 * 3. JournalEntries are APPEND-ONLY (update/delete blocked by middleware)
 * 4. All amounts use Money-safe integer minor units
 * 5. organizationId is required (multi-tenant isolation)
 *
 * PLANE: Org only.
 *
 * @per-org-transactional — System-internal model. Writes occur only within the
 * ledger.orchestrator.service.js transaction session with explicit organizationId.
 * No direct HTTP exposure.
 */

"use strict";

const mongoose = require("mongoose");

// ─── Line Item Sub-Schema ───────────────────────────────────────────────────

const journalLineSchema = new mongoose.Schema(
    {
        account: {
            type: String,
            required: true,
            enum: [
                "accounts_receivable",
                "cash",
                "revenue",
                "refunds",
                "insurance_receivable",
                "wallet_liability",
                "discount_expense",
            ],
        },
        type: {
            type: String,
            required: true,
            enum: ["debit", "credit"],
        },
        amount: {
            type: Number,
            required: true,
            min: [0, "Journal line amount must be non-negative"],
        },
        amountMinor: {
            type: Number,
            required: true,
            validate: {
                validator: Number.isInteger,
                message: "amountMinor must be an integer (minor currency units)",
            },
        },
    },
    { _id: false }
);

// ─── Journal Entry Schema ───────────────────────────────────────────────────

const journalEntrySchema = new mongoose.Schema(
    {
        // Per-org DB: kept for reference/forensic audit but NOT required.
        // immutable: true — finance integrity.
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            immutable: true,
        },
        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
            immutable: true,
        },
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            immutable: true,
        },

        // ─── Reference ────────────────────────────────────────────────
        referenceType: {
            type: String,
            required: true,
            immutable: true,
            enum: ["invoice", "payment", "refund", "void", "wallet_credit"],
        },
        referenceId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            immutable: true,
        },

        // ─── Journal Lines (double-entry) ─────────────────────────────
        entries: {
            type: [journalLineSchema],
            required: true,
            validate: {
                validator: function (arr) {
                    return arr && arr.length >= 2;
                },
                message: "JournalEntry must have at least 2 lines (double-entry)",
            },
        },

        // ─── Aggregated Totals ─────────────────────────────────────────
        totalDebit: {
            type: Number,
            required: true,
            immutable: true,
        },
        totalDebitMinor: {
            type: Number,
            required: true,
            immutable: true,
            validate: {
                validator: Number.isInteger,
                message: "totalDebitMinor must be an integer",
            },
        },
        totalCredit: {
            type: Number,
            required: true,
            immutable: true,
        },
        totalCreditMinor: {
            type: Number,
            required: true,
            immutable: true,
            validate: {
                validator: Number.isInteger,
                message: "totalCreditMinor must be an integer",
            },
        },

        currency: {
            type: String,
            required: true,
            immutable: true,
            default: "AED",
        },

        // ─── Metadata ─────────────────────────────────────────────────
        description: {
            type: String,
            immutable: true,
        },
        status: {
            type: String,
            enum: ["posted", "pending", "failed"],
            default: "posted",
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            immutable: true,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false }, // Append-only: no updatedAt
    }
);

// ─── Immutability Guards ────────────────────────────────────────────────────

journalEntrySchema.pre("save", function (next) {
    if (!this.isNew) {
        return next(new Error("JournalEntry is immutable — updates are forbidden."));
    }
    next();
});

journalEntrySchema.pre(["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"], function () {
    throw new Error("JournalEntry is immutable — updates are forbidden.");
});

journalEntrySchema.pre(["deleteOne", "deleteMany", "findOneAndDelete", "findOneAndRemove"], function () {
    throw new Error("JournalEntry is immutable — deletes are forbidden.");
});

// ─── Balance Validation ─────────────────────────────────────────────────────

journalEntrySchema.pre("validate", function (next) {
    if (!this.entries || this.entries.length < 2) {
        return next(new Error("JournalEntry must have at least 2 lines."));
    }

    let debitMinor = 0;
    let creditMinor = 0;

    for (const line of this.entries) {
        if (line.type === "debit") {
            debitMinor += line.amountMinor;
        } else {
            creditMinor += line.amountMinor;
        }
    }

    if (debitMinor !== creditMinor) {
        return next(
            new Error(
                `Journal entry unbalanced: debit(${debitMinor}) ≠ credit(${creditMinor}) in minor units.`
            )
        );
    }

    // Auto-compute totals
    this.totalDebitMinor = debitMinor;
    this.totalCreditMinor = creditMinor;
    this.totalDebit = debitMinor / 100;
    this.totalCredit = creditMinor / 100;

    next();
});

// Per-org DB: indexes optimized — no organizationId prefix needed.
journalEntrySchema.index({ createdAt: -1 });
// UNIQUE: Enforces exactly-once journal entry per financial event at DB level
journalEntrySchema.index(
    { referenceType: 1, referenceId: 1 },
    { unique: true }
);
journalEntrySchema.index({ patientId: 1, createdAt: -1 });
journalEntrySchema.index({ "entries.account": 1 });

const modelName = "JournalEntry";

module.exports = {
    modelName,
    schema: journalLineSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, journalLineSchema),
};
