/**
 * BillingSettings.model.js
 * Sprint 7.1 — Configurable Dunning, Grace Period & Multi-Currency Settings
 *
 * Singleton document (only one record per platform).
 * All renewal engine components read from this single source of truth.
 *
 * PLANE: Platform
 * COLLECTION: billingsettings
 */

"use strict";

const mongoose = require("mongoose");

const billingSettingsSchema = new mongoose.Schema(
    {
        // Retry schedule: days after initial failure to attempt charge again.
        // e.g. [1, 3, 5] → retry on day 1, day 3, day 5 after grace start.
        retryScheduleDays: {
            type: [Number],
            default: [1, 3, 5],
            validate: {
                validator: (v) => Array.isArray(v) && v.length > 0 && v.every(n => Number.isInteger(n) && n > 0),
                message: "retryScheduleDays must be a non-empty array of positive integers"
            }
        },

        // Grace period: days after effectiveTo before org is auto-suspended.
        gracePeriodDays: {
            type: Number,
            default: 7,
            min: [1, "gracePeriodDays must be at least 1"]
        },

        // maxRetries: controls how many times to attempt re-charge before marking uncollectible.
        // Should equal retryScheduleDays.length.
        maxRetries: {
            type: Number,
            default: 3,
            min: [1, "maxRetries must be at least 1"]
        },

        // ── Multi-Currency Revenue Normalization ──────────────────────────────
        // ISO 4217 currency code for platform-wide revenue reporting.
        // All RevenueSchedules normalize their amounts into this currency.
        baseReportingCurrency: {
            type: String,
            default: "USD",
            uppercase: true,
            trim: true,
            validate: {
                validator: (v) => /^[A-Z]{3}$/.test(v),
                message: "baseReportingCurrency must be a valid 3-letter ISO 4217 currency code"
            }
        },

        // Source of exchange rate data.
        // "manual" = rates entered via admin API.
        // "external_api" = rates fetched from a configured exchange rate provider.
        exchangeRateSource: {
            type: String,
            enum: ["manual", "external_api"],
            default: "manual"
        },

        // ── Refund Policy ──────────────────────────────────────────────────────
        // Sprint 7.2: Policy-driven refund eligibility rules.
        // All refund services read from this block — no hardcoded rules.

        // Days after invoice payment during which a refund can be requested.
        refundWindowDays: {
            type: Number,
            default: 30,
            min: [1, "refundWindowDays must be at least 1"]
        },

        // Whether refunds are allowed after revenue recognition has begun.
        allowAfterRecognition: {
            type: Boolean,
            default: true
        },

        // Force manual approval for every refund regardless of amount.
        requireManualApproval: {
            type: Boolean,
            default: false
        },

        // Refunds above this decimal amount (e.g. 1000 = $1,000) require superadmin approval.
        largeRefundThreshold: {
            type: Number,
            default: 1000,
            min: [0, "largeRefundThreshold must be non-negative"]
        },

        // If refund > this % of contract lockedPrice → manual override required.
        largeRefundRatioPct: {
            type: Number,
            default: 50,
            min: [0, "largeRefundRatioPct must be non-negative"],
            max: [100, "largeRefundRatioPct cannot exceed 100"]
        },

        // Velocity guard: max refunds per org within maxRefundsPerOrgDays before flagging.
        maxRefundsPerOrg: {
            type: Number,
            default: 3,
            min: [1, "maxRefundsPerOrg must be at least 1"]
        },

        maxRefundsPerOrgDays: {
            type: Number,
            default: 30,
            min: [1, "maxRefundsPerOrgDays must be at least 1"]
        },

        // OAV
        version: {
            type: Number,
            default: 1
        }
    },
    {
        timestamps: true,
        collection: "billingsettings"
    }
);

// OAV pre-save hook — Mongoose 9: async, no next() call
billingSettingsSchema.pre("save", async function () {
    if (!this.isNew) this.version += 1;
});

const modelName = "BillingSettings";

module.exports = {
    modelName,
    schema: billingSettingsSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, billingSettingsSchema),
};
