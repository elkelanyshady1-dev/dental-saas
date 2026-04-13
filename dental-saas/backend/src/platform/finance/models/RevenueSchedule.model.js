/**
 * RevenueSchedule.model.js
 * Sprint 7.1 — Revenue Recognition, Deferred Revenue & Multi-Currency Normalization
 *
 * Created when a PlatformInvoice is paid. Tracks the recognition
 * of revenue over the billing period (monthly amortization).
 *
 * Revenue recognition model (accrual basis):
 *   - totalAmount   = full invoice amount (deferred at payment time)
 *   - recognizedAmount accumulates monthly via revenueRecognition.job.js
 *   - deferredAmount = totalAmount − recognizedAmount
 *
 * PLANE: Platform / Finance
 * COLLECTION: revenueschedules
 */

"use strict";

const mongoose = require("mongoose");

const revenueScheduleSchema = new mongoose.Schema(
    {
        // ── References ──────────────────────────────────────────────────────────
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true
        },
        contractId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrgContract",
            required: true
        },
        invoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformInvoice",
            required: true,
            unique: true   // One schedule per invoice
        },

        // ── Revenue Amounts (Original Currency) ────────────────────────────────
        // originalCurrency: ISO 4217 code from the PlatformInvoice
        // (kept as alias for the existing 'currency' field for clarity)
        currency: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },
        // Canonical alias (same value as currency — for query clarity)
        originalCurrency: {
            type: String,
            default: null,
            uppercase: true,
            trim: true
        },
        totalAmount: {
            type: Number,
            required: true,
            min: 0
        },
        recognizedAmount: {
            type: Number,
            default: 0,
            min: 0
        },
        // Computed: totalAmount − recognizedAmount (updated by job on each recognition pass)
        deferredAmount: {
            type: Number,
            required: true,
            min: 0
        },

        // ── Multi-Currency Normalization ─────────────────────────────────────────
        // Exchange rate locked at schedule creation — NEVER recomputed afterward.
        // Prevents drift when exchange rates change during the amortization period.
        //
        //   normalizedTotalAmount    = totalAmount  * exchangeRate
        //   normalizedDeferredAmount = deferredAmount * exchangeRate
        //   normalizedRecognizedAmount accumulated monthly
        normalizedCurrency: {
            type: String,
            default: null,
            uppercase: true,
            trim: true,
            description: "ISO 4217 base reporting currency (from BillingSettings.baseReportingCurrency)"
        },
        // 1.0 when originalCurrency === normalizedCurrency. Permanently frozen.
        exchangeRate: {
            type: Number,
            default: 1.0,
            min: 0
        },
        normalizedTotalAmount: { type: Number, default: 0, min: 0 },
        normalizedRecognizedAmount: { type: Number, default: 0, min: 0 },
        normalizedDeferredAmount: { type: Number, default: 0, min: 0 },
        // Pre-computed: normalizedTotalAmount / totalPeriods
        normalizedAmountPerPeriod: { type: Number, default: 0, min: 0 },

        // ── Recognition Schedule ────────────────────────────────────────────────
        recognitionFrequency: {
            type: String,
            enum: ["monthly"],
            default: "monthly"
        },
        // Amortization period = billingCycleStart → billingCycleEnd (from invoice)
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },

        // The number of recognition periods (months for "monthly")
        totalPeriods: { type: Number, required: true, min: 1 },
        // How much to recognize per period (totalAmount / totalPeriods, pre-computed)
        amountPerPeriod: { type: Number, required: true, min: 0 },
        // How many periods have been recognized so far
        periodsRecognized: { type: Number, default: 0, min: 0 },

        // ── Recognition State ───────────────────────────────────────────────────
        lastRecognitionDate: { type: Date, default: null },
        // fully = all periods recognized; active = still recognizing; void = invoice voided
        status: {
            type: String,
            enum: ["active", "fully_recognized", "void"],
            default: "active"
        },

        // OAV
        version: { type: Number, default: 0 }
    },
    {
        timestamps: true,
        collection: "revenueschedules"
    }
);

// ─── Indexes ───────────────────────────────────────────────────────────────────
revenueScheduleSchema.index({ organizationId: 1, createdAt: -1 });
revenueScheduleSchema.index({ contractId: 1 });
revenueScheduleSchema.index({ status: 1, endDate: 1 });           // Recognition job scan
revenueScheduleSchema.index({ lastRecognitionDate: 1, status: 1 }); // Monthly pass

// OAV pre-save hook — Mongoose 9: async, no next() call
revenueScheduleSchema.pre("save", async function () {
    if (!this.isNew) this.version += 1;
});

const modelName = "RevenueSchedule";

module.exports = {
    modelName,
    schema: revenueScheduleSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, revenueScheduleSchema),
};
