/**
 * ledgerIntegrity.service.js — Ledger Invariant Verifier (Phase 31)
 *
 * Runs invariant checks against the double-entry journal. Used by:
 *   - a periodic integrity job
 *   - the /org/accounting/health endpoint (fast subset)
 *   - ad-hoc triage from the finance admin UI
 *
 * Every check returns a structured result — never throws — so callers
 * can report multiple violations in one pass.
 *
 * PLANE: Org only.
 */

"use strict";

const getModel = require("@core/db/getModel");
const JournalEntryDef = require("../models/JournalEntry.model");
const PatientInvoiceDef = require("../organizationFinance/models/PatientInvoice.model");
const PatientPaymentDef = require("../organizationFinance/models/PatientPayment.model");
const { ACCOUNTS } = require("../constants/accounts");
const ledgerService = require("./ledger.service");

function _getJournal(req) {
    return getModel(req.dbConnection, JournalEntryDef);
}
function _getInvoice(req) {
    return getModel(req.dbConnection, PatientInvoiceDef);
}
function _getPayment(req) {
    return getModel(req.dbConnection, PatientPaymentDef);
}

/**
 * Trial balance invariant: total debits across ALL journal entries must
 * equal total credits. If this fails we have an unbalanced book — a
 * FATAL integrity violation.
 */
async function checkTrialBalance(req) {
    const rows = await _getJournal(req).aggregate([
        { $group: { _id: null, dr: { $sum: "$totalDebitMinor" }, cr: { $sum: "$totalCreditMinor" } } },
    ]);
    const dr = rows[0]?.dr || 0;
    const cr = rows[0]?.cr || 0;
    return {
        check: "trialBalance",
        ok: dr === cr,
        totalDebitMinor:  dr,
        totalCreditMinor: cr,
        deltaMinor:       dr - cr,
    };
}

/**
 * Per-entry balance invariant: every JournalEntry.totalDebit must equal
 * its totalCredit. The pre-validate hook guarantees this at write time;
 * this check catches retroactive DB corruption.
 */
async function checkPerEntryBalance(req) {
    const violations = await _getJournal(req)
        .find({ $expr: { $ne: ["$totalDebitMinor", "$totalCreditMinor"] } })
        .select("_id referenceType referenceId totalDebitMinor totalCreditMinor")
        .limit(20)
        .lean();

    return {
        check: "perEntryBalance",
        ok: violations.length === 0,
        violationSample: violations,
    };
}

/**
 * Non-negative AR invariant: no patient's AR balance should go below zero
 * under normal flows. A negative balance means we've credited AR more than
 * we've debited — usually a double-posted payment or an orphan refund.
 */
async function checkNoNegativeAR(req) {
    const rows = await _getJournal(req).aggregate([
        { $unwind: "$entries" },
        { $match: { "entries.account": ACCOUNTS.ACCOUNTS_RECEIVABLE } },
        {
            $group: {
                _id: { patientId: "$patientId", type: "$entries.type" },
                totalMinor: { $sum: "$entries.amountMinor" },
            },
        },
        {
            $group: {
                _id: "$_id.patientId",
                debitMinor:  { $sum: { $cond: [{ $eq: ["$_id.type", "debit"] },  "$totalMinor", 0] } },
                creditMinor: { $sum: { $cond: [{ $eq: ["$_id.type", "credit"] }, "$totalMinor", 0] } },
            },
        },
        {
            $project: {
                patientId: "$_id",
                balanceMinor: { $subtract: ["$debitMinor", "$creditMinor"] },
                _id: 0,
            },
        },
        { $match: { balanceMinor: { $lt: 0 } } },
        { $limit: 20 },
    ]);

    return {
        check: "noNegativeAR",
        ok: rows.length === 0,
        violationSample: rows,
    };
}

/**
 * Invoice reconciliation: for each issued/partially-paid/paid invoice, the
 * ledger's AR balance must equal `max(0, totalAmount − sum(active payments))`.
 * Voided invoices should have balance = 0.
 *
 * Returns a bounded sample of discrepancies — a full scan is fine for
 * org-sized datasets; if this ever becomes slow we'll page it.
 */
async function checkInvoiceReconciliation(req, { limit = 500 } = {}) {
    const invoices = await _getInvoice(req)
        .find({ status: { $in: ["issued", "partially_paid", "paid", "voided"] } })
        .select("_id totalAmountMinor status")
        .limit(limit)
        .lean();

    if (!invoices.length) return { check: "invoiceReconciliation", ok: true, checked: 0, violationSample: [] };

    const ids = invoices.map((i) => i._id);
    const ledgerBatch = await ledgerService.getInvoiceBalancesBatch(ids, req);

    const violations = [];
    for (const inv of invoices) {
        const agg = ledgerBatch.get(String(inv._id)) || { balanceMinor: 0, totalPaidMinor: 0 };
        const expectedBalanceMinor = inv.status === "voided"
            ? 0
            : Math.max(0, (inv.totalAmountMinor || 0) - (agg.totalPaidMinor || 0));

        if (agg.balanceMinor !== expectedBalanceMinor) {
            violations.push({
                invoiceId: inv._id,
                status: inv.status,
                expectedBalanceMinor,
                ledgerBalanceMinor: agg.balanceMinor,
                deltaMinor: agg.balanceMinor - expectedBalanceMinor,
            });
            if (violations.length >= 20) break;
        }
    }

    return {
        check: "invoiceReconciliation",
        ok: violations.length === 0,
        checked: invoices.length,
        violationSample: violations,
    };
}

/**
 * Payment reconciliation: sum of active Patient-Payment amounts must equal
 * sum of Cash DR journal entries of referenceType "payment" in the ledger.
 * Any divergence implies the journal write failed for some payment or a
 * payment was recorded outside the orchestrator.
 */
async function checkPaymentReconciliation(req) {
    const [paymentSum, ledgerSum] = await Promise.all([
        _getPayment(req).aggregate([
            { $match: { status: "active" } },
            { $group: { _id: null, totalMinor: { $sum: "$amountMinor" } } },
        ]),
        _getJournal(req).aggregate([
            { $match: { referenceType: "payment" } },
            { $unwind: "$entries" },
            { $match: { "entries.account": ACCOUNTS.CASH, "entries.type": "debit" } },
            { $group: { _id: null, totalMinor: { $sum: "$entries.amountMinor" } } },
        ]),
    ]);

    const paymentMinor = paymentSum[0]?.totalMinor || 0;
    const ledgerMinor  = ledgerSum[0]?.totalMinor  || 0;
    return {
        check: "paymentReconciliation",
        ok: paymentMinor === ledgerMinor,
        paymentCollectionMinor: paymentMinor,
        ledgerCashDrMinor:      ledgerMinor,
        deltaMinor:             paymentMinor - ledgerMinor,
    };
}

/**
 * Run every invariant and return a consolidated report.
 *
 * Response shape (Phase 31 hardening):
 *   {
 *     status:      "PASS" | "FAIL",
 *     ok:          boolean,          // alias of status === "PASS"
 *     lastRunAt:   ISO timestamp,
 *     errorCount:  number,           // count of failing checks
 *     durationMs:  number,
 *     checks:      Array<{ check, ok, ...details }>,
 *   }
 */
async function runAll(req, opts = {}) {
    const startedAt = Date.now();

    const [trial, perEntry, negativeAR, invoiceRecon, paymentRecon] = await Promise.all([
        checkTrialBalance(req),
        checkPerEntryBalance(req),
        checkNoNegativeAR(req),
        checkInvoiceReconciliation(req, opts.invoice),
        checkPaymentReconciliation(req),
    ]);

    const checks     = [trial, perEntry, negativeAR, invoiceRecon, paymentRecon];
    const errorCount = checks.filter((c) => !c.ok).length;
    const status     = errorCount === 0 ? "PASS" : "FAIL";
    const lastRunAt  = new Date().toISOString();

    return {
        status,
        ok: status === "PASS",
        errorCount,
        lastRunAt,
        checkedAt: lastRunAt, // legacy alias
        durationMs: Date.now() - startedAt,
        checks,
    };
}

module.exports = {
    checkTrialBalance,
    checkPerEntryBalance,
    checkNoNegativeAR,
    checkInvoiceReconciliation,
    checkPaymentReconciliation,
    runAll,
};
