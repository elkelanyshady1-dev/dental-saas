/**
 * revenueSummary.projection.js
 * AccountingDomain — Read Model Projection
 *
 * PROJECTION: RevenueSummary
 * SOURCE: invoice.created events (via eventBus)
 * SCOPE: Org-specific (per-org isolated DB)
 *
 * CQRS RULE:
 *   - This file is APPEND-ONLY
 *   - NEVER imports from billingDomain directly
 *   - NEVER modifies PatientInvoice or PatientPayment
 *
 * @module accountingDomain/projections/revenueSummary.projection
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");
const metrics = require("../observability/accounting.metrics");

// Increment this when the schema shape changes in a breaking way.
// Replay service checks this to detect stale projection documents.
const CURRENT_SCHEMA_VERSION = 1;

// ─── RevenueSummary Schema ───────────────────────────────────────────────────
// Stored in the org-specific DB (per tenant isolation)
// Keyed by (date + branchId) for fast daily dashboard reads.

const RevenueSummarySchema = new mongoose.Schema({
    // Partition key — YYYY-MM-DD
    date: { type: String, required: true, index: true },

    // Optional branch scoping
    branchId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    // Accumulated totals
    totalInvoiced:  { type: Number, default: 0 },
    invoiceCount:   { type: Number, default: 0 },
    outstanding:    { type: Number, default: 0 },

    // Metadata
    lastUpdatedAt:  { type: Date, default: Date.now },

    // Schema versioning — increment CURRENT_SCHEMA_VERSION above on breaking changes
    schemaVersion: { type: Number, default: CURRENT_SCHEMA_VERSION },
}, {
    collection: "accounting_revenue_summaries",
    timestamps: false,
});

RevenueSummarySchema.index({ date: 1, branchId: 1 }, { unique: true });

// Projection model def — bound per-call to the org connection in the
// functions below; never module-scoped via a global mongoose.model().
const RevenueSummaryDef = { modelName: "RevenueSummary", schema: RevenueSummarySchema };

// ─── Projection Update ───────────────────────────────────────────────────────

/**
 * updateRevenueSummary
 *
 * Atomically upserts a daily RevenueSummary record for the org.
 * Called by invoiceCreated.listener.js when an invoice is emitted.
 *
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {mongoose.Connection} params.dbConnection — Org-specific DB connection
 * @param {Object} params.invoice — Invoice data from event payload
 */
async function updateRevenueSummary({ organizationId, dbConnection, invoice }) {
    const getModel = require("@core/db/getModel");
    const Model = getModel(dbConnection, RevenueSummaryDef);

    const date = invoice.issuedAt
        ? new Date(invoice.issuedAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    const outstanding = Math.max(0, (invoice.totalAmount || 0) - (invoice.amountPaid || 0));

    await Model.findOneAndUpdate(
        { date, branchId: invoice.branchId || null },
        {
            $inc: {
                totalInvoiced: invoice.totalAmount || 0,
                invoiceCount:  1,
                outstanding:   outstanding,
            },
            $set: {
                lastUpdatedAt: new Date(),
                schemaVersion: CURRENT_SCHEMA_VERSION,
            },
        },
        { upsert: true, new: true }
    );

    metrics.increment("projectionWrites");
    metrics.logProjectionWrite("RevenueSummary", organizationId, date);
}

module.exports = {
    RevenueSummaryDef,
    RevenueSummarySchema,
    updateRevenueSummary,
    CURRENT_SCHEMA_VERSION,
};
