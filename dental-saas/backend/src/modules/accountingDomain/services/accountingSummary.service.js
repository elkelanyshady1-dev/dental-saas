/**
 * accountingSummary.service.js
 * AccountingDomain — Read Service
 *
 * Provides pre-aggregated financial analytics by reading from
 * the accounting projection tables (RevenueSummary, CashFlow).
 *
 * ISOLATION LAWS:
 *   ✅ Reads ONLY from accountingDomain projections
 *   ❌ MUST NOT query PatientInvoice or PatientPayment directly
 *   ❌ MUST NOT import billingDomain services
 *   ✅ Uses org-specific dbConnection (RLS enforced)
 *
 * PERMISSION: accounting.read (P.ACCOUNTING_READ)
 *
 * @module accountingDomain/services/accountingSummary.service
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");
const { RevenueSummaryDef } = require("../projections/revenueSummary.projection");
const { CashFlowSchema } = require("../projections/cashFlow.projection");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRevModel(dbConnection) {
    return dbConnection.model("RevenueSummary", RevenueSummaryDef.schema);
}

function getCashModel(dbConnection) {
    return dbConnection.model("CashFlowProjection", CashFlowSchema);
}

// ─── Service Methods ─────────────────────────────────────────────────────────

/**
 * getDailySummary
 *
 * Returns a unified daily finance summary (revenue + cash flow).
 *
 * @param {Object} req — Express request (carries dbConnection, organizationId)
 * @param {string} date — ISO date string (YYYY-MM-DD)
 * @param {string} [branchId] — Optional branch filter
 * @returns {Object} Merged daily analytics
 */
async function getDailySummary(req, date, branchId = null) {
    const { dbConnection } = req;

    const RevModel = getRevModel(dbConnection);
    const CashModel = getCashModel(dbConnection);

    const filter = { date };
    if (branchId) filter.branchId = new mongoose.Types.ObjectId(branchId);

    const [revDoc, cashDoc] = await Promise.all([
        RevModel.findOne(filter).lean(),
        CashModel.findOne(filter).lean(),
    ]);

    return {
        date,
        branchId: branchId || null,
        invoices: {
            totalBilled:    revDoc?.totalInvoiced   || 0,
            invoiceCount:   revDoc?.invoiceCount     || 0,
            outstanding:    revDoc?.outstanding      || 0,
        },
        collections: {
            totalCollected: cashDoc?.totalCollected  || 0,
            paymentCount:   cashDoc?.paymentCount    || 0,
            byMethod:       cashDoc?.byMethod        || {},
        },
        lastUpdatedAt: revDoc?.lastUpdatedAt || cashDoc?.lastUpdatedAt || null,
    };
}

/**
 * getMonthlySummary
 *
 * Returns aggregated totals for an entire month.
 *
 * @param {Object} req
 * @param {number} year
 * @param {number} month — 1-12
 * @param {string} [branchId]
 */
async function getMonthlySummary(req, year, month, branchId = null) {
    const { dbConnection } = req;

    const RevModel = getRevModel(dbConnection);
    const CashModel = getCashModel(dbConnection);

    // Build date range: YYYY-MM-01 → YYYY-MM-31
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const filter = { date: { $gte: `${prefix}-01`, $lte: `${prefix}-31` } };
    if (branchId) filter.branchId = new mongoose.Types.ObjectId(branchId);

    const [revDocs, cashDocs] = await Promise.all([
        RevModel.find(filter).lean(),
        CashModel.find(filter).lean(),
    ]);

    const totalInvoiced    = revDocs.reduce((s, d) => s + (d.totalInvoiced || 0), 0);
    const totalOutstanding = revDocs.reduce((s, d) => s + (d.outstanding   || 0), 0);
    const totalCollected   = cashDocs.reduce((s, d) => s + (d.totalCollected || 0), 0);

    // Merge byMethod across days
    const byMethod = {};
    for (const d of cashDocs) {
        if (!d.byMethod) continue;
        for (const [method, amount] of Object.entries(d.byMethod)) {
            byMethod[method] = (byMethod[method] || 0) + amount;
        }
    }

    return {
        year,
        month,
        branchId: branchId || null,
        invoices: {
            totalBilled:  totalInvoiced,
            outstanding:  totalOutstanding,
            collected:    totalCollected,
        },
        collections: {
            totalCollected,
            byMethod,
        },
        dailyBreakdown: revDocs.map(d => ({
            date:           d.date,
            totalInvoiced:  d.totalInvoiced,
            outstanding:    d.outstanding,
        })),
    };
}

module.exports = {
    getDailySummary,
    getMonthlySummary,
};
