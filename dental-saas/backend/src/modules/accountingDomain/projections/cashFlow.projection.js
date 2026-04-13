/**
 * cashFlow.projection.js
 * AccountingDomain — Read Model Projection
 *
 * PROJECTION: CashFlowProjection
 * SOURCE: payment.received events (via eventBus)
 * SCOPE: Org-specific (per-org isolated DB)
 *
 * CQRS RULE:
 *   - This file is APPEND-ONLY
 *   - NEVER imports from billingDomain directly
 *   - NEVER modifies PatientPayment records
 *
 * @module accountingDomain/projections/cashFlow.projection
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");
const metrics = require("../observability/accounting.metrics");

const CURRENT_SCHEMA_VERSION = 1;

// ─── CashFlowProjection Schema ───────────────────────────────────────────────
// Keyed by (date + branchId) for fast daily cash-flow reads.
// Breakdown by payment method for method-level analytics.

const CashFlowSchema = new mongoose.Schema({
    // Partition key — YYYY-MM-DD
    date: { type: String, required: true, index: true },

    // Optional branch scoping
    branchId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    // Total collected on this date
    totalCollected: { type: Number, default: 0 },
    paymentCount:   { type: Number, default: 0 },

    // Payment method breakdown — keyed by method name
    byMethod: {
        type: Map,
        of: Number,
        default: {},
    },

    // Metadata
    lastUpdatedAt: { type: Date, default: Date.now },

    // Schema versioning — increment CURRENT_SCHEMA_VERSION above on breaking changes
    schemaVersion: { type: Number, default: CURRENT_SCHEMA_VERSION },
}, {
    collection: "accounting_cash_flow",
    timestamps: false,
});

CashFlowSchema.index({ date: 1, branchId: 1 }, { unique: true });

// ─── Projection Update ───────────────────────────────────────────────────────

/**
 * updateCashFlow
 *
 * Atomically upserts a daily CashFlow record for the org.
 * Called by paymentReceived.listener.js when a payment event fires.
 *
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {mongoose.Connection} params.dbConnection — Org-specific DB connection
 * @param {Object} params.payment — Payment data from event payload
 */
async function updateCashFlow({ organizationId, dbConnection, payment }) {
    const Model = dbConnection.model("CashFlowProjection", CashFlowSchema);

    const date = payment.paidAt
        ? new Date(payment.paidAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    const method = payment.method || "unknown";
    const amount = payment.amountPaid || 0;

    // Increment the method-specific bucket using dot notation safe key
    const methodKey = `byMethod.${method.replace(/[^a-zA-Z0-9_]/g, "_")}`;

    await Model.findOneAndUpdate(
        { date, branchId: payment.branchId || null },
        {
            $inc: {
                totalCollected: amount,
                paymentCount:   1,
                [methodKey]:    amount,
            },
            $set: {
                lastUpdatedAt: new Date(),
                schemaVersion: CURRENT_SCHEMA_VERSION,
            },
        },
        { upsert: true, new: true }
    );

    metrics.increment("projectionWrites");
    metrics.logProjectionWrite("CashFlowProjection", organizationId, date);
}

module.exports = {
    CashFlowSchema,
    updateCashFlow,
    CURRENT_SCHEMA_VERSION,
};
