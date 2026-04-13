/**
 * LedgerAccount.model.js
 * Platform Finance — Chart of Accounts
 *
 * Defines the double-entry ledger account registry.
 * Each account holds a running balance (updated by the transaction service).
 *
 * Standard accounts seeded by seedLedgerAccounts():
 *   1000  CASH                asset      — cash received from payments
 *   1100  ACCOUNTS_RECEIVABLE asset      — invoices issued but not yet paid
 *   2000  DEFERRED_REVENUE    liability  — prepaid SaaS revenue not yet earned
 *   2100  REFUNDS_PAYABLE     liability  — approved refunds awaiting payment
 *   4000  REVENUE             revenue    — recognized subscription revenue
 *   5000  PROCESSING_FEES     expense    — payment provider transaction fees
 *   5100  REFUND_EXPENSE      expense    — refund costs
 *
 * PLANE: Platform / Finance
 * COLLECTION: ledgeraccounts
 */

"use strict";

const mongoose = require("mongoose");

const ACCOUNT_TYPES = Object.freeze(["asset", "liability", "revenue", "expense", "equity"]);

const ledgerAccountSchema = new mongoose.Schema(
    {
        // Human-readable name (e.g. "Accounts Receivable")
        name: {
            type: String,
            required: true,
            trim: true
        },

        // Unique short code (e.g. "accounts_receivable"). Used as key in entry objects.
        code: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        // Account classification per double-entry convention
        type: {
            type: String,
            required: true,
            enum: ACCOUNT_TYPES
        },

        // Running balance (in base reporting currency, major units).
        // Updated atomically by ledgerTransaction.service on every write.
        balance: {
            type: Number,
            default: 0
        },

        // Whether this account is part of the active chart of accounts
        active: {
            type: Boolean,
            default: true
        },

        // Display order in the chart of accounts UI
        displayOrder: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true,
        collection: "ledgeraccounts"
    }
);

ledgerAccountSchema.index({ type: 1, active: 1 });
ledgerAccountSchema.index({ code: 1 }, { unique: true });

const modelName = "LedgerAccount";

module.exports = {
    modelName,
    schema: ledgerAccountSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, ledgerAccountSchema),
};
module.exports.seedLedgerAccounts = seedLedgerAccounts;
module.exports.ACCOUNT_TYPES = ACCOUNT_TYPES;

/**
 * seedLedgerAccounts
 * Idempotent: creates each standard account only if it does not already exist.
 * Safe to call on every startup.
 */
async function seedLedgerAccounts() {
    const logger = require("@utils/logger");

    const STANDARD_ACCOUNTS = [
        { code: "cash", name: "Cash", type: "asset", displayOrder: 10 },
        { code: "accounts_receivable", name: "Accounts Receivable", type: "asset", displayOrder: 20 },
        { code: "deferred_revenue", name: "Deferred Revenue", type: "liability", displayOrder: 30 },
        { code: "refunds_payable", name: "Refunds Payable", type: "liability", displayOrder: 40 },
        { code: "revenue", name: "Revenue", type: "revenue", displayOrder: 50 },
        { code: "processing_fees", name: "Processing Fees", type: "expense", displayOrder: 60 },
        { code: "refund_expense", name: "Refund Expense", type: "expense", displayOrder: 70 },
    ];

    for (const acct of STANDARD_ACCOUNTS) {
        await LedgerAccount.updateOne(
            { code: acct.code },
            { $setOnInsert: acct },
            { upsert: true }
        );
    }

    logger.info("[LedgerAccount] Chart of accounts seeded/verified");
}

