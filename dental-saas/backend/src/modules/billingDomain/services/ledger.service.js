/**
 * ledger.service.js — Ledger-Native Read Facade (Phase 31)
 *
 * THE single source of truth for every org-plane financial aggregate.
 *
 *   totalBilled    = sum(AR debits — referenceType "invoice")
 *   totalCollected = sum(CASH debits)
 *   outstanding    = sum(AR debits) − sum(AR credits)
 *   revenue        = sum(REVENUE credits) − sum(REVENUE debits)
 *   refunds        = sum(REFUNDS debits)
 *
 * ❌ No caller in the finance surface may aggregate from PatientInvoice or
 *    PatientPayment directly for financial values. Those collections remain
 *    authoritative for metadata (patient, method, status) only.
 *
 * All queries run through getModel(req.dbConnection, JournalEntryDef) so
 * per-org isolation is preserved.
 */

"use strict";

const mongoose = require("mongoose");
const getModel = require("@core/db/getModel");
const JournalEntryDef = require("../models/JournalEntry.model");
const { ACCOUNTS, ACCOUNT_META } = require("../constants/accounts");

function _getJournal(req) {
    if (!req?.dbConnection) {
        throw new Error("[LedgerService] req.dbConnection is REQUIRED — per-org mode does not allow fallback");
    }
    return getModel(req.dbConnection, JournalEntryDef);
}

function _toObjectId(id) {
    if (!id) return null;
    return typeof id === "string" ? new mongoose.Types.ObjectId(id) : id;
}

function round2(minor) {
    return Math.round(minor) / 100;
}

// ── Account Balances ────────────────────────────────────────────────────────

/**
 * Balance for one account, optionally scoped by branch and date range.
 * Signed per the account's normal balance (assets → debits positive,
 * liabilities/revenue → credits positive).
 *
 * @returns {Promise<{ balance:number, balanceMinor:number, debitMinor:number, creditMinor:number, currency:string }>}
 */
async function getAccountBalance({ account, from, to, branchId } = {}, req) {
    const meta = ACCOUNT_META[account];
    if (!meta) throw new Error(`[LedgerService] Unknown account: ${account}`);

    const match = {};
    if (from || to) {
        match.createdAt = {};
        if (from) match.createdAt.$gte = from;
        if (to)   match.createdAt.$lte = to;
    }
    if (branchId) match.branchId = _toObjectId(branchId);

    const rows = await _getJournal(req).aggregate([
        { $match: match },
        { $unwind: "$entries" },
        { $match: { "entries.account": account } },
        {
            $group: {
                _id: "$entries.type",
                totalMinor: { $sum: "$entries.amountMinor" },
            },
        },
    ]);

    let debitMinor = 0;
    let creditMinor = 0;
    for (const row of rows) {
        if (row._id === "debit")  debitMinor  = row.totalMinor;
        if (row._id === "credit") creditMinor = row.totalMinor;
    }

    const balanceMinor = meta.normalBalance === "debit"
        ? debitMinor - creditMinor
        : creditMinor - debitMinor;

    return {
        account,
        label: meta.label,
        type: meta.type,
        balanceMinor,
        balance: round2(balanceMinor),
        debitMinor,
        creditMinor,
        currency: "AED",
    };
}

// ── Invoice-Scoped Queries ─────────────────────────────────────────────────
//
// These rely on the sourceInvoiceId denormalization added in Phase 31.
// An invoice's AR balance = (invoice-creation AR debit) + (refund AR debits
// on this invoice) − (payment AR credits on this invoice) − (void AR credits).

/**
 * Balance due for a single invoice, computed entirely from the ledger.
 * Returns 0 (never negative) on a fully-paid/voided invoice.
 */
async function getInvoiceBalance(invoiceId, req) {
    const invoiceOid = _toObjectId(invoiceId);

    const rows = await _getJournal(req).aggregate([
        { $match: { sourceInvoiceId: invoiceOid } },
        { $unwind: "$entries" },
        { $match: { "entries.account": ACCOUNTS.ACCOUNTS_RECEIVABLE } },
        {
            $group: {
                _id: "$entries.type",
                totalMinor: { $sum: "$entries.amountMinor" },
            },
        },
    ]);

    let debitMinor = 0;
    let creditMinor = 0;
    for (const row of rows) {
        if (row._id === "debit")  debitMinor  = row.totalMinor;
        if (row._id === "credit") creditMinor = row.totalMinor;
    }

    const balanceMinor = Math.max(0, debitMinor - creditMinor);
    return {
        invoiceId: String(invoiceId),
        balanceMinor,
        balance: round2(balanceMinor),
    };
}

/**
 * Sum of CASH debits for an invoice — authoritative "total paid" for the
 * invoice, computed from ledger only.
 */
async function getInvoicePaid(invoiceId, req) {
    const invoiceOid = _toObjectId(invoiceId);

    const rows = await _getJournal(req).aggregate([
        { $match: { sourceInvoiceId: invoiceOid, referenceType: "payment" } },
        { $unwind: "$entries" },
        { $match: { "entries.account": ACCOUNTS.CASH, "entries.type": "debit" } },
        {
            $group: {
                _id: null,
                totalMinor: { $sum: "$entries.amountMinor" },
            },
        },
    ]);

    const totalMinor = rows[0]?.totalMinor || 0;
    return {
        invoiceId: String(invoiceId),
        totalPaidMinor: totalMinor,
        totalPaid: round2(totalMinor),
    };
}

/**
 * Ledger-sourced payment history for one invoice.
 *
 * Returns the journal entries of referenceType "payment" scoped to this
 * invoice, ordered oldest-first. Shape is intentionally journal-centric —
 * callers that need PatientPayment metadata (method, collector, notes)
 * should join by `referenceId` against the Payment collection.
 *
 * @returns {Promise<Array<{ paymentId, amount, amountMinor, currency, createdAt, description }>>}
 */
async function getInvoicePayments(invoiceId, req) {
    const invoiceOid = _toObjectId(invoiceId);

    const rows = await _getJournal(req).aggregate([
        { $match: { sourceInvoiceId: invoiceOid, referenceType: "payment" } },
        { $unwind: "$entries" },
        { $match: { "entries.account": ACCOUNTS.CASH, "entries.type": "debit" } },
        { $sort: { createdAt: 1 } },
        {
            $project: {
                _id: 0,
                paymentId:   "$referenceId",
                amount:      "$entries.amount",
                amountMinor: "$entries.amountMinor",
                currency:    "$currency",
                createdAt:   "$createdAt",
                description: "$description",
            },
        },
    ]);

    return rows;
}

/**
 * Batch version used by list routes to avoid O(N) per-invoice aggregations.
 * Phase 31 hardening: callers rendering more than one invoice MUST use this
 * batched form. Per-invoice `getInvoiceBalance` / `getInvoicePaid` are
 * reserved for single-entity detail endpoints.
 *
 * Returns a Map<String(invoiceId), { totalPaid, balance, refundedFromPayment }>
 * where every field is ledger-sourced:
 *   totalPaid           = sum(Cash DR) for payments linked to this invoice
 *   balance             = sum(AR DR) − sum(AR CR) for this invoice (≥ 0)
 *   refundedFromPayment = true if any refund touched this invoice's cash
 */
async function getInvoiceBalancesBatch(invoiceIds, req) {
    const ids = (invoiceIds || []).map(_toObjectId).filter(Boolean);
    if (!ids.length) return new Map();

    const rows = await _getJournal(req).aggregate([
        { $match: { sourceInvoiceId: { $in: ids } } },
        { $unwind: "$entries" },
        {
            $match: {
                "entries.account": { $in: [ACCOUNTS.CASH, ACCOUNTS.ACCOUNTS_RECEIVABLE] },
            },
        },
        {
            $group: {
                _id: {
                    invoiceId:     "$sourceInvoiceId",
                    referenceType: "$referenceType",
                    account:       "$entries.account",
                    type:          "$entries.type",
                },
                totalMinor: { $sum: "$entries.amountMinor" },
            },
        },
    ]);

    const map = new Map();
    for (const row of rows) {
        const { invoiceId, referenceType, account, type } = row._id;
        const key = String(invoiceId);
        const current = map.get(key) || {
            totalPaidMinor: 0,
            arDebitMinor: 0,
            arCreditMinor: 0,
            refundedFromPayment: false,
        };

        if (account === ACCOUNTS.CASH && referenceType === "payment" && type === "debit") {
            current.totalPaidMinor += row.totalMinor;
        }
        if (account === ACCOUNTS.CASH && referenceType === "refund" && type === "credit") {
            current.refundedFromPayment = true;
        }
        if (account === ACCOUNTS.ACCOUNTS_RECEIVABLE) {
            if (type === "debit")  current.arDebitMinor  += row.totalMinor;
            else                   current.arCreditMinor += row.totalMinor;
        }

        map.set(key, current);
    }

    for (const [k, v] of map) {
        v.totalPaid   = round2(v.totalPaidMinor);
        v.balanceMinor = Math.max(0, v.arDebitMinor - v.arCreditMinor);
        v.balance      = round2(v.balanceMinor);
        map.set(k, v);
    }
    return map;
}

// ── Summary (period-scoped, ledger-native) ─────────────────────────────────

/**
 * Flat summary DTO shape consumed by the Finance Hub cards.
 *
 * totalBilled    — AR debits from invoice creations in the period
 * totalCollected — Cash debits net of refund cash credits (net collection)
 * outstanding    — AR balance at period boundary (not period-scoped, sees
 *                  the running balance limited to entries in the period)
 * revenue        — Net revenue (credits − debits) in the period
 *
 * Named `getAccountingSummary` per Phase 31 spec. Legacy callers may still
 * import the `getSummary` alias exported at the bottom of this module.
 */
async function getAccountingSummary({ from, to, branchId } = {}, req) {
    const match = {};
    if (from || to) {
        match.createdAt = {};
        if (from) match.createdAt.$gte = from;
        if (to)   match.createdAt.$lte = to;
    }
    if (branchId) match.branchId = _toObjectId(branchId);

    const rows = await _getJournal(req).aggregate([
        { $match: match },
        { $unwind: "$entries" },
        {
            $group: {
                _id: { account: "$entries.account", type: "$entries.type", referenceType: "$referenceType" },
                totalMinor: { $sum: "$entries.amountMinor" },
            },
        },
    ]);

    const bucket = {
        arDebit: 0, arCredit: 0,
        cashDebit: 0, cashCredit: 0,
        revenueCredit: 0, revenueDebit: 0,
        refundsDebit: 0,
        invoiceArDebit: 0, // AR debits scoped to invoice issue (excludes refund AR DRs)
    };

    for (const row of rows) {
        const { account, type, referenceType } = row._id;
        if (account === ACCOUNTS.ACCOUNTS_RECEIVABLE) {
            if (type === "debit") {
                bucket.arDebit += row.totalMinor;
                if (referenceType === "invoice") bucket.invoiceArDebit += row.totalMinor;
            } else {
                bucket.arCredit += row.totalMinor;
            }
        } else if (account === ACCOUNTS.CASH) {
            if (type === "debit") bucket.cashDebit += row.totalMinor;
            else                  bucket.cashCredit += row.totalMinor;
        } else if (account === ACCOUNTS.REVENUE) {
            if (type === "credit") bucket.revenueCredit += row.totalMinor;
            else                   bucket.revenueDebit += row.totalMinor;
        } else if (account === ACCOUNTS.REFUNDS) {
            if (type === "debit") bucket.refundsDebit += row.totalMinor;
        }
    }

    const totalBilledMinor    = bucket.invoiceArDebit;
    const totalCollectedMinor = Math.max(0, bucket.cashDebit - bucket.cashCredit);
    const outstandingMinor    = Math.max(0, bucket.arDebit - bucket.arCredit);
    const revenueMinor        = Math.max(0, bucket.revenueCredit - bucket.revenueDebit);
    const refundsMinor        = bucket.refundsDebit;

    const collectionRate = totalBilledMinor > 0
        ? Math.round((totalCollectedMinor / totalBilledMinor) * 10_000) / 100
        : 0;

    return {
        totalBilled:    round2(totalBilledMinor),
        totalCollected: round2(totalCollectedMinor),
        outstanding:    round2(outstandingMinor),
        revenue:        round2(revenueMinor),
        refunds:        round2(refundsMinor),
        // "Overdue" requires dueDate awareness and is not purely a ledger
        // concept. Until a dueDate projection exists, we expose zero so the
        // card renders a safe default rather than a misleading number.
        overdue: 0,
        collectionRate,
        currency: "AED",
        periodStart: from || null,
        periodEnd:   to   || null,
    };
}

// ── Time Series (billed + collected per bucket) ────────────────────────────

/**
 * Ledger-sourced time series for the Finance Hub revenue chart.
 *
 * billed    = AR debits from invoice issues (revenue recognized in the bucket)
 * collected = Cash DR − Cash CR (net cash received)
 *
 * Granularity controls the bucket format: daily → YYYY-MM-DD, monthly → YYYY-MM.
 */
async function getRevenueSeries({ from, to, granularity = "daily", branchId } = {}, req) {
    const bucketFmt = granularity === "monthly" ? "%Y-%m" : "%Y-%m-%d";

    const match = { createdAt: { $gte: from, $lte: to } };
    if (branchId) match.branchId = _toObjectId(branchId);

    const rows = await _getJournal(req).aggregate([
        { $match: match },
        { $unwind: "$entries" },
        {
            $match: {
                $or: [
                    { "entries.account": ACCOUNTS.ACCOUNTS_RECEIVABLE, "entries.type": "debit", referenceType: "invoice" },
                    { "entries.account": ACCOUNTS.CASH },
                ],
            },
        },
        {
            $group: {
                _id: {
                    bucket:  { $dateToString: { format: bucketFmt, date: "$createdAt" } },
                    account: "$entries.account",
                    type:    "$entries.type",
                },
                totalMinor: { $sum: "$entries.amountMinor" },
            },
        },
        { $sort: { "_id.bucket": 1 } },
    ]);

    const map = new Map();
    for (const row of rows) {
        const { bucket, account, type } = row._id;
        const entry = map.get(bucket) || { bucket, billedMinor: 0, cashDrMinor: 0, cashCrMinor: 0 };
        if (account === ACCOUNTS.ACCOUNTS_RECEIVABLE && type === "debit") {
            entry.billedMinor += row.totalMinor;
        } else if (account === ACCOUNTS.CASH) {
            if (type === "debit")  entry.cashDrMinor += row.totalMinor;
            else                   entry.cashCrMinor += row.totalMinor;
        }
        map.set(bucket, entry);
    }

    const series = Array.from(map.values())
        .sort((a, b) => a.bucket.localeCompare(b.bucket))
        .map((e) => ({
            bucket:    e.bucket,
            billed:    round2(e.billedMinor),
            collected: round2(Math.max(0, e.cashDrMinor - e.cashCrMinor)),
        }));

    return { series, currency: "AED", granularity };
}

// ── Cash Collected / Outstanding Helpers ───────────────────────────────────

async function getCashCollected({ from, to, branchId } = {}, req) {
    const match = {};
    if (from || to) {
        match.createdAt = {};
        if (from) match.createdAt.$gte = from;
        if (to)   match.createdAt.$lte = to;
    }
    if (branchId) match.branchId = _toObjectId(branchId);

    const rows = await _getJournal(req).aggregate([
        { $match: match },
        { $unwind: "$entries" },
        { $match: { "entries.account": ACCOUNTS.CASH } },
        { $group: { _id: "$entries.type", totalMinor: { $sum: "$entries.amountMinor" } } },
    ]);

    let debit = 0, credit = 0;
    for (const r of rows) {
        if (r._id === "debit")  debit  = r.totalMinor;
        if (r._id === "credit") credit = r.totalMinor;
    }
    const collectedMinor = Math.max(0, debit - credit);
    return { collected: round2(collectedMinor), collectedMinor, currency: "AED" };
}

/**
 * Per-patient outstanding AR balances — sorted descending by balance.
 * Uses sourceInvoiceId groupings to also return the oldest open invoice.
 */
async function getOutstandingByPatient({ limit = 50, branchId } = {}, req) {
    const match = {};
    if (branchId) match.branchId = _toObjectId(branchId);

    const rows = await _getJournal(req).aggregate([
        { $match: match },
        { $unwind: "$entries" },
        { $match: { "entries.account": ACCOUNTS.ACCOUNTS_RECEIVABLE } },
        {
            $group: {
                _id: { patientId: "$patientId", type: "$entries.type" },
                totalMinor: { $sum: "$entries.amountMinor" },
                oldestAt: { $min: "$createdAt" },
            },
        },
        {
            $group: {
                _id: "$_id.patientId",
                debitMinor:  { $sum: { $cond: [{ $eq: ["$_id.type", "debit"] },  "$totalMinor", 0] } },
                creditMinor: { $sum: { $cond: [{ $eq: ["$_id.type", "credit"] }, "$totalMinor", 0] } },
                oldestAt:    { $min: "$oldestAt" },
            },
        },
        {
            $project: {
                patientId: "$_id",
                outstandingMinor: { $max: [0, { $subtract: ["$debitMinor", "$creditMinor"] }] },
                oldestAt: 1,
                _id: 0,
            },
        },
        { $match: { outstandingMinor: { $gt: 0 } } },
        { $sort: { outstandingMinor: -1 } },
        { $limit: Math.min(limit, 200) },
    ]);

    return rows.map((r) => ({
        patientId: r.patientId,
        outstanding: round2(r.outstandingMinor),
        outstandingMinor: r.outstandingMinor,
        oldestInvoiceAt: r.oldestAt,
    }));
}

module.exports = {
    getAccountBalance,
    getInvoiceBalance,
    getInvoicePaid,
    getInvoicePayments,
    getInvoiceBalancesBatch,
    getAccountingSummary,
    getRevenueSeries,
    getCashCollected,
    getOutstandingByPatient,
    // Legacy aliases (pre-spec). Prefer the primary names in new code.
    getSummary: getAccountingSummary,
    getInvoicePaidBatch: getInvoiceBalancesBatch,
};
