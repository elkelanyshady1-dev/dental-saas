/**
 * ledger.projection.js
 * Analytics Domain — Ledger-driven revenue analytics (SSOT)
 *
 * Reads from the JournalEntry double-entry ledger (src/modules/billingDomain/
 * models/JournalEntry.model.js). This is the true source of financial truth —
 * invoices, payments, voids, and refunds all post balanced journal entries,
 * so aggregating here gives accounting-accurate numbers that cannot
 * double-count and that automatically honour reversals.
 *
 * DTO contract is deliberately identical to revenue.projection.js
 * (PatientInvoice/PatientPayment fallback) so the controller, DTO builder
 * and frontend are untouched:
 *
 *   { series: [{ bucket, paid, invoiced, outstanding }], totals: {…} }
 *
 * Mapping (ledger → DTO):
 *   paid        ← net cash collected in bucket
 *                 = sum(CASH debit) − sum(CASH credit)   (refunds subtract)
 *   invoiced    ← net revenue earned in bucket
 *                 = sum(REVENUE credit) − sum(REVENUE debit)  (voids subtract)
 *   outstanding ← Accounts Receivable balance at bucket end (cumulative)
 *                 = opening AR  +  cumulative net AR through bucket
 *                 net AR = sum(AR debit) − sum(AR credit)
 *   invoiceCount ← count of JournalEntry docs in window where
 *                  referenceType = "invoice"
 *   paymentCount ← count where referenceType = "payment"
 *
 * Hardening applied:
 *   HR-1 — pipeline opens with a single $match on (branchId, createdAt),
 *          both indexed (see index requirement at the bottom of this file).
 *   HR-2 — branchFilter comes from analyticsScope (never trusts query arg).
 *   HR-3 — every $dateTrunc gets an explicit timezone.
 *   HR-5 — monetary math uses amountMinor (integer) to avoid FP drift;
 *          DTO conversion divides by 100 once at the end.
 *   HR-10 — gap-fill via fillGaps; safe division pct; Math.max(0, ar) for
 *           display so a credit-balance patient doesn't show as negative AR
 *           in the aggregate chart.
 *
 * INDEX REQUIREMENT (add before prod):
 *   journalEntrySchema.index({ branchId: 1, createdAt: -1 });
 *   journalEntrySchema.index({ branchId: 1, "entries.account": 1, createdAt: -1 });
 * Validate with .explain("executionStats") — initial $match stage must be IXSCAN.
 *
 * PLANE: Org only.
 */

"use strict";

const getModel = require("@core/db/getModel");
const JournalEntryDef = require("../../billingDomain/models/JournalEntry.model");
const { ACCOUNTS } = require("../../billingDomain/constants/accounts");
const { dateTruncStage, fillGaps, round2 } = require("../helpers/dateBucket");

const REVENUE = ACCOUNTS.REVENUE;
const CASH = ACCOUNTS.CASH;
const AR = ACCOUNTS.ACCOUNTS_RECEIVABLE;

function _journal(req) {
    return getModel(req.dbConnection, JournalEntryDef);
}

/**
 * Runs the core bucketed aggregation for REVENUE + CASH lines.
 * Returns rows shaped: { bucket, account, debitsMinor, creditsMinor }.
 */
async function _bucketedRevenueAndCash(JournalEntry, { from, to, branchFilter, granularity, timezone }) {
    return JournalEntry.aggregate([
        {
            $match: {
                ...branchFilter,
                createdAt: { $gte: new Date(from), $lte: new Date(to) },
                status: { $ne: "failed" },
            },
        },
        { $unwind: "$entries" },
        { $match: { "entries.account": { $in: [REVENUE, CASH] } } },
        {
            $group: {
                _id: {
                    bucket: dateTruncStage("createdAt", granularity, timezone),
                    account: "$entries.account",
                },
                debitsMinor: {
                    $sum: {
                        $cond: [
                            { $eq: ["$entries.type", "debit"] },
                            { $ifNull: ["$entries.amountMinor", 0] },
                            0,
                        ],
                    },
                },
                creditsMinor: {
                    $sum: {
                        $cond: [
                            { $eq: ["$entries.type", "credit"] },
                            { $ifNull: ["$entries.amountMinor", 0] },
                            0,
                        ],
                    },
                },
            },
        },
        {
            $project: {
                _id: 0,
                bucket: "$_id.bucket",
                account: "$_id.account",
                debitsMinor: 1,
                creditsMinor: 1,
            },
        },
    ]).allowDiskUse(false);
}

/**
 * AR running-balance (cumulative) per bucket.
 * Outstanding at bucket-end = openingAR + Σ netAR(t ≤ bucket).
 */
async function _bucketedARDelta(JournalEntry, { from, to, branchFilter, granularity, timezone }) {
    return JournalEntry.aggregate([
        {
            $match: {
                ...branchFilter,
                createdAt: { $gte: new Date(from), $lte: new Date(to) },
                status: { $ne: "failed" },
            },
        },
        { $unwind: "$entries" },
        { $match: { "entries.account": AR } },
        {
            $group: {
                _id: dateTruncStage("createdAt", granularity, timezone),
                debitsMinor: {
                    $sum: {
                        $cond: [
                            { $eq: ["$entries.type", "debit"] },
                            { $ifNull: ["$entries.amountMinor", 0] },
                            0,
                        ],
                    },
                },
                creditsMinor: {
                    $sum: {
                        $cond: [
                            { $eq: ["$entries.type", "credit"] },
                            { $ifNull: ["$entries.amountMinor", 0] },
                            0,
                        ],
                    },
                },
            },
        },
        { $project: { _id: 0, bucket: "$_id", debitsMinor: 1, creditsMinor: 1 } },
    ]).allowDiskUse(false);
}

/**
 * Opening AR balance as of `from` (one scalar).
 * Outstanding = Σ AR.debit − Σ AR.credit for all entries with createdAt < from.
 * Branch-scoped so a branch manager's "opening" reflects their scope only.
 */
async function _openingAR(JournalEntry, { from, branchFilter }) {
    const rows = await JournalEntry.aggregate([
        {
            $match: {
                ...branchFilter,
                createdAt: { $lt: new Date(from) },
                status: { $ne: "failed" },
            },
        },
        { $unwind: "$entries" },
        { $match: { "entries.account": AR } },
        {
            $group: {
                _id: null,
                debitsMinor: {
                    $sum: {
                        $cond: [
                            { $eq: ["$entries.type", "debit"] },
                            { $ifNull: ["$entries.amountMinor", 0] },
                            0,
                        ],
                    },
                },
                creditsMinor: {
                    $sum: {
                        $cond: [
                            { $eq: ["$entries.type", "credit"] },
                            { $ifNull: ["$entries.amountMinor", 0] },
                            0,
                        ],
                    },
                },
            },
        },
    ]).allowDiskUse(false);
    const row = rows[0];
    if (!row) return 0;
    return (row.debitsMinor || 0) - (row.creditsMinor || 0);
}

/**
 * Counts of source events within the window (invoices + payments).
 * Used only for DTO compatibility (totals.invoiceCount / totals.paymentCount).
 */
async function _referenceCounts(JournalEntry, { from, to, branchFilter }) {
    const rows = await JournalEntry.aggregate([
        {
            $match: {
                ...branchFilter,
                createdAt: { $gte: new Date(from), $lte: new Date(to) },
                status: { $ne: "failed" },
                referenceType: { $in: ["invoice", "payment", "void", "refund"] },
            },
        },
        { $group: { _id: "$referenceType", count: { $sum: 1 } } },
    ]).allowDiskUse(false);
    const map = Object.fromEntries(rows.map((r) => [r._id, r.count]));
    // Voids reverse invoices, refunds reverse payments — subtract so counts
    // reflect net economic activity, matching the signed revenue/cash above.
    return {
        invoiceCount: Math.max(0, (map.invoice || 0) - (map.void || 0)),
        paymentCount: Math.max(0, (map.payment || 0) - (map.refund || 0)),
    };
}

/**
 * getRevenueSeries — ledger-backed replacement for the invoice/payment
 * projection. Returns the exact DTO shape expected by analytics.dto.js.
 */
async function getRevenueSeries(req, { from, to, branchFilter, granularity, timezone }) {
    const JournalEntry = _journal(req);

    const [revCashRows, arRows, openingARMinor, counts] = await Promise.all([
        _bucketedRevenueAndCash(JournalEntry, { from, to, branchFilter, granularity, timezone }),
        _bucketedARDelta(JournalEntry, { from, to, branchFilter, granularity, timezone }),
        _openingAR(JournalEntry, { from, branchFilter }),
        _referenceCounts(JournalEntry, { from, to, branchFilter }),
    ]);

    // Merge REVENUE + CASH rows into a per-bucket record.
    const perBucket = new Map();
    function bucketOf(iso) {
        if (!perBucket.has(iso)) {
            perBucket.set(iso, {
                bucket: iso,
                paidMinor: 0,
                invoicedMinor: 0,
                arDeltaMinor: 0,
            });
        }
        return perBucket.get(iso);
    }

    for (const r of revCashRows) {
        const iso = r.bucket.toISOString();
        const rec = bucketOf(iso);
        if (r.account === REVENUE) {
            rec.invoicedMinor += (r.creditsMinor || 0) - (r.debitsMinor || 0);
        } else if (r.account === CASH) {
            rec.paidMinor += (r.debitsMinor || 0) - (r.creditsMinor || 0);
        }
    }

    for (const r of arRows) {
        const iso = r.bucket.toISOString();
        const rec = bucketOf(iso);
        rec.arDeltaMinor += (r.debitsMinor || 0) - (r.creditsMinor || 0);
    }

    const sortedRows = Array.from(perBucket.values()).sort((a, b) =>
        a.bucket.localeCompare(b.bucket),
    );

    // Zero-fill every bucket in [from, to] so chart rendering doesn't drop points.
    const filled = fillGaps(sortedRows, {
        from, to, granularity, timezone,
        zero: { paidMinor: 0, invoicedMinor: 0, arDeltaMinor: 0 },
    });

    // Running AR balance = opening + cumulative delta.
    let runningARMinor = openingARMinor;
    const series = filled.map((b) => {
        runningARMinor += b.arDeltaMinor || 0;
        const outstandingMinor = Math.max(0, runningARMinor);
        return {
            bucket: b.bucket,
            paid: round2((b.paidMinor || 0) / 100),
            invoiced: round2((b.invoicedMinor || 0) / 100),
            outstanding: round2(outstandingMinor / 100),
        };
    });

    const totals = {
        paid: round2(series.reduce((a, s) => a + s.paid, 0)),
        invoiced: round2(series.reduce((a, s) => a + s.invoiced, 0)),
        outstanding: series.length > 0 ? series[series.length - 1].outstanding : round2(Math.max(0, openingARMinor) / 100),
        invoiceCount: counts.invoiceCount,
        paymentCount: counts.paymentCount,
    };

    return { series, totals };
}

/**
 * getRevenueTotals — scalar version for the Overview KPI strip.
 * Avoids the bucketing cost while still being accounting-accurate.
 */
async function getRevenueTotals(req, { from, to, branchFilter }) {
    const JournalEntry = _journal(req);

    const [totalsAgg, openingARMinor, counts] = await Promise.all([
        JournalEntry.aggregate([
            {
                $match: {
                    ...branchFilter,
                    createdAt: { $gte: new Date(from), $lte: new Date(to) },
                    status: { $ne: "failed" },
                },
            },
            { $unwind: "$entries" },
            { $match: { "entries.account": { $in: [REVENUE, CASH, AR] } } },
            {
                $group: {
                    _id: "$entries.account",
                    debitsMinor: {
                        $sum: {
                            $cond: [
                                { $eq: ["$entries.type", "debit"] },
                                { $ifNull: ["$entries.amountMinor", 0] },
                                0,
                            ],
                        },
                    },
                    creditsMinor: {
                        $sum: {
                            $cond: [
                                { $eq: ["$entries.type", "credit"] },
                                { $ifNull: ["$entries.amountMinor", 0] },
                                0,
                            ],
                        },
                    },
                },
            },
        ]).allowDiskUse(false),
        _openingAR(JournalEntry, { from, branchFilter }),
        _referenceCounts(JournalEntry, { from, to, branchFilter }),
    ]);

    const byAccount = Object.fromEntries(totalsAgg.map((r) => [r._id, r]));
    const revenue = byAccount[REVENUE]
        ? (byAccount[REVENUE].creditsMinor || 0) - (byAccount[REVENUE].debitsMinor || 0)
        : 0;
    const cash = byAccount[CASH]
        ? (byAccount[CASH].debitsMinor || 0) - (byAccount[CASH].creditsMinor || 0)
        : 0;
    const arDelta = byAccount[AR]
        ? (byAccount[AR].debitsMinor || 0) - (byAccount[AR].creditsMinor || 0)
        : 0;
    const outstandingMinor = Math.max(0, openingARMinor + arDelta);

    return {
        paid: round2(cash / 100),
        invoiced: round2(revenue / 100),
        outstanding: round2(outstandingMinor / 100),
        invoiceCount: counts.invoiceCount,
        paymentCount: counts.paymentCount,
    };
}

/**
 * hasLedgerData — lightweight probe for "auto" mode to decide whether the
 * org has any ledger rows in the window. Indexed on (branchId, createdAt).
 */
async function hasLedgerData(req, { from, to, branchFilter }) {
    const JournalEntry = _journal(req);
    const row = await JournalEntry.findOne({
        ...branchFilter,
        createdAt: { $gte: new Date(from), $lte: new Date(to) },
    })
        .select("_id")
        .lean();
    return Boolean(row);
}

module.exports = {
    getRevenueSeries,
    getRevenueTotals,
    hasLedgerData,
};
