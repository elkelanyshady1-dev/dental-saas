/**
 * ledger.query.service.js — Ledger Read Service (CQRS Read Side)
 * Billing Domain — Phase C
 *
 * Provides query operations against the JournalEntry collection.
 * All queries use secureModel for RLS compliance.
 *
 * PLANE: Org only.
 * Phase 3.2 — Connection-aware model resolution via getModel.
 */

"use strict";

const getModel = require("@core/db/getModel");
const JournalEntryDef = require("../models/JournalEntry.model");
const { ACCOUNT_META } = require("../constants/accounts");

// ─── Connection-Aware Model Resolver (Phase 3.2) ─────────────────────────────
function _getSecureJournal(req) {
    return getModel(req.dbConnection, JournalEntryDef);
}

// ─── Account Balance ────────────────────────────────────────────────────────

/**
 * Get the current balance for a specific account within an organization.
 *
 * Balance = sum(normalBalance side) - sum(opposite side)
 *   For asset/expense accounts (normalBalance=debit): balance = totalDebits - totalCredits
 *   For liability/revenue accounts (normalBalance=credit): balance = totalCredits - totalDebits
 *
 * @param {string} account — account name from ACCOUNTS constants
 * @param {Object} req — Express request (for tenant context)
 * @returns {Promise<{account: string, balance: number, balanceMinor: number, currency: string}>}
 */
async function getBalanceByAccount(account, req) {
    const meta = ACCOUNT_META[account];
    if (!meta) throw new Error(`Unknown account: ${account}`);

    const result = await _getSecureJournal(req).aggregate(
        [
            { $unwind: "$entries" },
            { $match: { "entries.account": account } },
            {
                $group: {
                    _id: "$entries.type",
                    totalMinor: { $sum: "$entries.amountMinor" },
                },
            },
        ]
    );

    let debitMinor = 0;
    let creditMinor = 0;
    for (const row of result) {
        if (row._id === "debit") debitMinor = row.totalMinor;
        if (row._id === "credit") creditMinor = row.totalMinor;
    }

    const balanceMinor =
        meta.normalBalance === "debit"
            ? debitMinor - creditMinor
            : creditMinor - debitMinor;

    return {
        account,
        label: meta.label,
        type: meta.type,
        balance: balanceMinor / 100,
        balanceMinor,
        currency: "AED",
    };
}

// ─── Trial Balance ──────────────────────────────────────────────────────────

/**
 * Generate a trial balance for the organization.
 * Lists every account with its debit and credit totals.
 * The trial balance MUST balance (total debits === total credits).
 *
 * @param {Object} req — Express request (for tenant context)
 * @returns {Promise<{accounts: Array, totalDebitMinor: number, totalCreditMinor: number, balanced: boolean}>}
 */
async function getTrialBalance(req) {
    const result = await _getSecureJournal(req).aggregate(
        [
            { $unwind: "$entries" },
            {
                $group: {
                    _id: {
                        account: "$entries.account",
                        type: "$entries.type",
                    },
                    totalMinor: { $sum: "$entries.amountMinor" },
                },
            },
            { $sort: { "_id.account": 1 } },
        ]
    );

    // Pivot into account-level summary
    const accountMap = {};
    for (const row of result) {
        const { account, type } = row._id;
        if (!accountMap[account]) {
            const meta = ACCOUNT_META[account] || { label: account, type: "unknown" };
            accountMap[account] = {
                account,
                label: meta.label,
                type: meta.type,
                debitMinor: 0,
                creditMinor: 0,
            };
        }
        if (type === "debit") accountMap[account].debitMinor += row.totalMinor;
        if (type === "credit") accountMap[account].creditMinor += row.totalMinor;
    }

    const accounts = Object.values(accountMap).map((a) => ({
        ...a,
        debit: a.debitMinor / 100,
        credit: a.creditMinor / 100,
    }));

    const totalDebitMinor = accounts.reduce((s, a) => s + a.debitMinor, 0);
    const totalCreditMinor = accounts.reduce((s, a) => s + a.creditMinor, 0);

    return {
        accounts,
        totalDebitMinor,
        totalCreditMinor,
        totalDebit: totalDebitMinor / 100,
        totalCredit: totalCreditMinor / 100,
        balanced: totalDebitMinor === totalCreditMinor,
    };
}

// ─── Journal History ────────────────────────────────────────────────────────

/**
 * Get paginated journal entries, most recent first.
 *
 * @param {Object} filters
 * @param {string} [filters.referenceType]
 * @param {string} [filters.patientId]
 * @param {number} [filters.page=1]
 * @param {number} [filters.limit=50]
 * @param {Object} req — Express request
 * @returns {Promise<{entries: Array, total: number, page: number, limit: number}>}
 */
async function getJournalHistory(filters, req) {
    const { referenceType, patientId, page = 1, limit = 50 } = filters;

    const query = {};
    if (referenceType) query.referenceType = referenceType;
    if (patientId) query.patientId = patientId;

    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
        _getSecureJournal(req).find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Math.min(limit, 200))
            .lean(),
        _getSecureJournal(req).countDocuments(query),
    ]);

    return { entries, total, page, limit };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    getBalanceByAccount,
    getTrialBalance,
    getJournalHistory,
};
