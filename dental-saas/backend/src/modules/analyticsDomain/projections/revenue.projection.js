/**
 * revenue.projection.js
 * Analytics Domain — Revenue time-series (LEDGER-FIRST)
 *
 * As of the ledger migration, this file is a thin ROUTER. It preserves the
 * public surface (getRevenueSeries / getRevenueTotals) exactly so every
 * caller (overview controller, widget controllers, export controller) stays
 * unchanged, and so the DTO shape returned by analytics.dto.js is stable.
 *
 * Dispatch (see analyticsFlags.js):
 *   mode = "ledger" → ledger.projection.js (SSOT; JournalEntry double-entry)
 *   mode = "legacy" → raw PatientInvoice + PatientPayment (pre-migration path)
 *   mode = "auto"   → ledger if the org has ledger rows in window, else legacy
 *
 * Hardening preserved: HR-1 $match-first, HR-2 branchFilter from scope helper,
 * HR-3 timezone-aware bucketing, HR-5 minor-unit math in ledger path, HR-10
 * gap-fill. See ledger.projection.js for the ledger-side details.
 *
 * PLANE: Org only. All reads via getModel(req.dbConnection, Def).
 */

"use strict";

const getModel = require("@core/db/getModel");
const PatientInvoiceDef = require("../../billingDomain/organizationFinance/models/PatientInvoice.model");
const PatientPaymentDef = require("../../billingDomain/organizationFinance/models/PatientPayment.model");
const { dateTruncStage, fillGaps, round2 } = require("../helpers/dateBucket");
const ledger = require("./ledger.projection");
const { getAnalyticsMode } = require("../config/analyticsFlags");

// ─── Public API ─────────────────────────────────────────────────────────────

async function getRevenueSeries(req, args) {
    const mode = await _resolveMode(req, args);
    if (mode === "ledger") return ledger.getRevenueSeries(req, args);
    return _legacyGetRevenueSeries(req, args);
}

async function getRevenueTotals(req, args) {
    const mode = await _resolveMode(req, args);
    if (mode === "ledger") return ledger.getRevenueTotals(req, args);
    return _legacyGetRevenueTotals(req, args);
}

async function _resolveMode(req, args) {
    const mode = getAnalyticsMode(req);
    if (mode === "legacy" || mode === "ledger") return mode;
    // "auto" → probe ledger for data in window; fall back to legacy when the
    // org hasn't been backfilled.
    try {
        const hasLedger = await ledger.hasLedgerData(req, {
            from: args.from,
            to: args.to,
            branchFilter: args.branchFilter,
        });
        return hasLedger ? "ledger" : "legacy";
    } catch {
        return "legacy";
    }
}

// ─── Legacy Path (PatientInvoice + PatientPayment) ──────────────────────────
// Kept verbatim so flipping the flag to "legacy" restores the prior behaviour.

async function _legacyGetRevenueSeries(req, { from, to, branchFilter, granularity, timezone }) {
    const PatientInvoice = getModel(req.dbConnection, PatientInvoiceDef);
    const PatientPayment = getModel(req.dbConnection, PatientPaymentDef);

    const invoiceMatch = {
        ...branchFilter,
        status: { $ne: "voided" },
        createdAt: { $gte: new Date(from), $lte: new Date(to) },
    };

    const paymentMatch = {
        ...branchFilter,
        status: "active",
        createdAt: { $gte: new Date(from), $lte: new Date(to) },
    };

    const invoicePipeline = [
        { $match: invoiceMatch },
        {
            $group: {
                _id: dateTruncStage("createdAt", granularity, timezone),
                invoiced: { $sum: { $ifNull: ["$totalAmount", 0] } },
                invoiceCount: { $sum: 1 },
            },
        },
        { $project: { _id: 0, bucket: "$_id", invoiced: 1, invoiceCount: 1 } },
    ];

    const paymentPipeline = [
        { $match: paymentMatch },
        {
            $group: {
                _id: dateTruncStage("createdAt", granularity, timezone),
                paid: { $sum: { $ifNull: ["$amount", 0] } },
                paymentCount: { $sum: 1 },
            },
        },
        { $project: { _id: 0, bucket: "$_id", paid: 1, paymentCount: 1 } },
    ];

    const [invoiceRows, paymentRows] = await Promise.all([
        PatientInvoice.aggregate(invoicePipeline).allowDiskUse(false),
        PatientPayment.aggregate(paymentPipeline).allowDiskUse(false),
    ]);

    const merged = new Map();
    for (const r of invoiceRows) {
        const key = r.bucket.toISOString();
        merged.set(key, {
            bucket: key,
            invoiced: round2(r.invoiced),
            paid: 0,
            outstanding: 0,
            invoiceCount: r.invoiceCount,
            paymentCount: 0,
        });
    }
    for (const r of paymentRows) {
        const key = r.bucket.toISOString();
        const existing = merged.get(key) || {
            bucket: key,
            invoiced: 0,
            paid: 0,
            outstanding: 0,
            invoiceCount: 0,
            paymentCount: 0,
        };
        existing.paid = round2((existing.paid || 0) + (r.paid || 0));
        existing.paymentCount += r.paymentCount;
        merged.set(key, existing);
    }

    for (const row of merged.values()) {
        row.outstanding = round2(Math.max(0, row.invoiced - row.paid));
    }

    const rows = Array.from(merged.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));

    const series = fillGaps(rows, {
        from, to, granularity, timezone,
        zero: { paid: 0, invoiced: 0, outstanding: 0, invoiceCount: 0, paymentCount: 0 },
    }).map((s) => ({
        bucket: s.bucket,
        paid: round2(s.paid),
        invoiced: round2(s.invoiced),
        outstanding: round2(s.outstanding),
    }));

    const totals = series.reduce(
        (acc, s) => {
            acc.paid = round2(acc.paid + s.paid);
            acc.invoiced = round2(acc.invoiced + s.invoiced);
            acc.outstanding = round2(acc.outstanding + s.outstanding);
            return acc;
        },
        { paid: 0, invoiced: 0, outstanding: 0, invoiceCount: 0, paymentCount: 0 },
    );

    totals.invoiceCount = invoiceRows.reduce((a, r) => a + r.invoiceCount, 0);
    totals.paymentCount = paymentRows.reduce((a, r) => a + r.paymentCount, 0);

    return { series, totals };
}

async function _legacyGetRevenueTotals(req, { from, to, branchFilter }) {
    const PatientInvoice = getModel(req.dbConnection, PatientInvoiceDef);
    const PatientPayment = getModel(req.dbConnection, PatientPaymentDef);

    const [invoiceTotals, paymentTotals] = await Promise.all([
        PatientInvoice.aggregate([
            {
                $match: {
                    ...branchFilter,
                    status: { $ne: "voided" },
                    createdAt: { $gte: new Date(from), $lte: new Date(to) },
                },
            },
            {
                $group: {
                    _id: null,
                    invoiced: { $sum: { $ifNull: ["$totalAmount", 0] } },
                    count: { $sum: 1 },
                },
            },
        ]).allowDiskUse(false),
        PatientPayment.aggregate([
            {
                $match: {
                    ...branchFilter,
                    status: "active",
                    createdAt: { $gte: new Date(from), $lte: new Date(to) },
                },
            },
            {
                $group: {
                    _id: null,
                    paid: { $sum: { $ifNull: ["$amount", 0] } },
                    count: { $sum: 1 },
                },
            },
        ]).allowDiskUse(false),
    ]);

    const invoiced = round2(invoiceTotals[0]?.invoiced || 0);
    const paid = round2(paymentTotals[0]?.paid || 0);
    return {
        invoiced,
        paid,
        outstanding: round2(Math.max(0, invoiced - paid)),
        invoiceCount: invoiceTotals[0]?.count || 0,
        paymentCount: paymentTotals[0]?.count || 0,
    };
}

module.exports = { getRevenueSeries, getRevenueTotals };
