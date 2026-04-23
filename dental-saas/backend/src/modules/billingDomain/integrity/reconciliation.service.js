/**
 * reconciliation.service.js — Ledger vs Source Data Reconciliation
 * Billing Domain — Ledger Hardening
 *
 * Compares the double-entry ledger against the actual invoice/payment
 * source data to detect financial drift.
 *
 * RECONCILIATION CHECKS:
 *   1. Accounts Receivable = sum(outstanding invoice amounts)
 *   2. Cash = sum(active payment amounts)
 *   3. Revenue = sum(all invoice amounts) - sum(voided amounts)
 *   4. Coverage = every invoice/payment has a corresponding journal entry
 *
 * INVARIANTS:
 * 1. All queries include organizationId (multi-tenant)
 * 2. Read-only — never mutates any data
 * 3. Reports discrepancies with account-level detail
 *
 * PLANE: Org only.
 * Phase 3.2 — Connection-aware model resolution via getModel.
 *
 * SECURITY: All queries use secureModel + signed system context (Wave 7 RLS).
 */

"use strict";

const JournalEntryDef = require("../models/JournalEntry.model");
const PatientInvoiceDef = require("../organizationFinance/models/PatientInvoice.model");
const PatientPaymentDef = require("../organizationFinance/models/PatientPayment.model");
const getModel = require("@core/db/getModel");
const {
  ACCOUNTS
} = require("../constants/accounts");
const logger = require("@utils/logger");

// ─── Strict Per-Org Model Resolvers (Phase 3.3) ─────────────────────────────
function _getSecureJournal(connection) {
  if (!connection) throw new Error("[ReconciliationService] connection is REQUIRED — per-org mode does not allow fallback");
  return getModel(connection, JournalEntryDef);
}
function _getSecureInvoice(connection) {
  if (!connection) throw new Error("[ReconciliationService] connection is REQUIRED — per-org mode does not allow fallback");
  return getModel(connection, PatientInvoiceDef);
}
function _getSecurePayment(connection) {
  if (!connection) throw new Error("[ReconciliationService] connection is REQUIRED — per-org mode does not allow fallback");
  return getModel(connection, PatientPaymentDef);
}

// ─── Core Reconciliation ────────────────────────────────────────────────────

/**
 * Perform full financial reconciliation for an organization.
 *
 * Compares:
 * - Ledger account balances vs source data aggregations
 * - Journal entry coverage for invoices and payments
 *
 * @param {string} organizationId
 * @param {mongoose.Connection} [connection] — optional org DB connection (Phase 3.2)
 * @returns {Promise<Object>} — reconciliation report
 */
async function reconcileOrganization(organizationId, connection = null) {
  const timestamp = new Date();
  const discrepancies = [];
  const coverageGaps = [];

  // ─── Step 1: Compute Ledger Balances ────────────────────────────

  const ledgerBalances = await computeLedgerBalances(organizationId, connection);

  // ─── Step 2: Compute Source-of-Truth Totals ─────────────────────

  const sourceTotals = await computeSourceTotals(organizationId, connection);

  // ─── Step 3: Compare Accounts Receivable ────────────────────────

  const arLedger = ledgerBalances.accounts_receivable || 0;
  const arSource = sourceTotals.outstandingReceivableMinor;
  if (arLedger !== arSource) {
    discrepancies.push({
      account: ACCOUNTS.ACCOUNTS_RECEIVABLE,
      label: "Accounts Receivable",
      ledgerMinor: arLedger,
      sourceMinor: arSource,
      diffMinor: arLedger - arSource,
      ledger: arLedger / 100,
      source: arSource / 100,
      diff: (arLedger - arSource) / 100
    });
  }

  // ─── Step 4: Compare Cash ───────────────────────────────────────

  const cashLedger = ledgerBalances.cash || 0;
  const cashSource = sourceTotals.totalPaymentsMinor;
  if (cashLedger !== cashSource) {
    discrepancies.push({
      account: ACCOUNTS.CASH,
      label: "Cash / Bank",
      ledgerMinor: cashLedger,
      sourceMinor: cashSource,
      diffMinor: cashLedger - cashSource,
      ledger: cashLedger / 100,
      source: cashSource / 100,
      diff: (cashLedger - cashSource) / 100
    });
  }

  // ─── Step 5: Compare Revenue ────────────────────────────────────

  const revLedger = ledgerBalances.revenue || 0;
  const revSource = sourceTotals.totalRevenueMinor;
  if (revLedger !== revSource) {
    discrepancies.push({
      account: ACCOUNTS.REVENUE,
      label: "Revenue",
      ledgerMinor: revLedger,
      sourceMinor: revSource,
      diffMinor: revLedger - revSource,
      ledger: revLedger / 100,
      source: revSource / 100,
      diff: (revLedger - revSource) / 100
    });
  }

  // ─── Step 6: Coverage Check ─────────────────────────────────────

  const coverage = await checkJournalCoverage(organizationId, connection);
  coverageGaps.push(...coverage.gaps);

  // ─── Build Report ───────────────────────────────────────────────

  const status = discrepancies.length === 0 && coverageGaps.length === 0 ? "balanced" : "drift";
  const report = {
    timestamp,
    status,
    summary: {
      accountsChecked: 3,
      discrepanciesFound: discrepancies.length,
      coverageGaps: coverageGaps.length
    },
    discrepancies,
    coverageGaps,
    ledgerBalances: {
      accountsReceivableMinor: arLedger,
      cashMinor: cashLedger,
      revenueMinor: revLedger
    },
    sourceTotals
  };
  if (status === "drift") {
    logger.error({
      organizationId,
      discrepancies: discrepancies.length,
      coverageGaps: coverageGaps.length
    }, "[Reconciliation] ⚠ FINANCIAL DRIFT DETECTED");
  } else {
    logger.info({
      organizationId
    }, "[Reconciliation] ✅ Organization finances fully reconciled");
  }
  return report;
}

// ─── Internal Computations ──────────────────────────────────────────────────

/**
 * Compute net balances per account from the journal.
 * For each account, net = sum(debits) - sum(credits) in minor units.
 */
async function computeLedgerBalances(organizationId, connection = null) {
  // secureModel.aggregate prepends $match { organizationId } automatically
  const results = await _getSecureJournal(connection).aggregate([{
    $unwind: "$entries"
  }, {
    $group: {
      _id: {
        account: "$entries.account",
        type: "$entries.type"
      },
      totalMinor: {
        $sum: "$entries.amountMinor"
      }
    }
  }]);

  // Pivot: compute net balance per account
  // Asset accounts: balance = debits - credits
  // Revenue accounts: balance = credits - debits
  const rawMap = {};
  for (const r of results) {
    const {
      account,
      type
    } = r._id;
    if (!rawMap[account]) rawMap[account] = {
      debit: 0,
      credit: 0
    };
    rawMap[account][type] += r.totalMinor;
  }
  const balances = {};
  for (const [account, sides] of Object.entries(rawMap)) {
    // Net balance: debits - credits (positive = net debit)
    balances[account] = sides.debit - sides.credit;
  }
  return balances;
}

/**
 * Compute source-of-truth totals from invoice and payment collections.
 */
async function computeSourceTotals(organizationId, connection = null) {
  // Outstanding AR: issued + partially_paid invoices
  // secureModel.aggregate prepends $match { organizationId } automatically
  const arResult = await _getSecureInvoice(connection).aggregate([{
    $match: {
      status: {
        $in: ["issued", "partially_paid"]
      }
    }
  }, {
    $group: {
      _id: null,
      totalMinor: {
        $sum: "$totalAmountMinor"
      }
    }
  }]);

  // Total payments (active only, exclude refunded)
  const cashResult = await _getSecurePayment(connection).aggregate([{
    $match: {
      status: "active"
    }
  }, {
    $group: {
      _id: null,
      totalMinor: {
        $sum: "$amountMinor"
      }
    }
  }]);

  // Total revenue: all non-voided invoices
  const revResult = await _getSecureInvoice(connection).aggregate([{
    $match: {
      status: {
        $ne: "voided"
      }
    }
  }, {
    $group: {
      _id: null,
      totalMinor: {
        $sum: "$totalAmountMinor"
      }
    }
  }]);
  return {
    outstandingReceivableMinor: arResult[0]?.totalMinor || 0,
    totalPaymentsMinor: cashResult[0]?.totalMinor || 0,
    totalRevenueMinor: revResult[0]?.totalMinor || 0
  };
}

/**
 * Check that every invoice and payment has a journal entry.
 * Returns gaps where source data exists but no journal entry.
 */
async function checkJournalCoverage(organizationId, connection = null) {
  const gaps = [];

  // Find invoices without journal entries
  // secureModel.aggregate prepends $match { organizationId } automatically
  const invoicesWithoutJournal = await _getSecureInvoice(connection).aggregate([{
    $match: {
      status: {
        $ne: "voided"
      }
    }
  }, {
    $lookup: {
      from: "journalentries",
      let: {
        invId: "$_id"
      },
      pipeline: [{
        $match: {
          $expr: {
            $and: [{
              $eq: ["$referenceId", "$$invId"]
            }, {
              $eq: ["$referenceType", "invoice"]
            }]
          }
        }
      }],
      as: "journalEntries"
    }
  }, {
    $match: {
      journalEntries: {
        $size: 0
      }
    }
  }, {
    $project: {
      _id: 1,
      totalAmountMinor: 1,
      status: 1,
      createdAt: 1
    }
  }]);
  for (const inv of invoicesWithoutJournal) {
    gaps.push({
      type: "missing_journal_entry",
      sourceType: "invoice",
      sourceId: inv._id,
      amountMinor: inv.totalAmountMinor,
      createdAt: inv.createdAt
    });
  }

  // Find payments without journal entries
  const paymentsWithoutJournal = await _getSecurePayment(connection).aggregate([{
    $match: {
      status: "active"
    }
  }, {
    $lookup: {
      from: "journalentries",
      let: {
        payId: "$_id"
      },
      pipeline: [{
        $match: {
          $expr: {
            $and: [{
              $eq: ["$referenceId", "$$payId"]
            }, {
              $eq: ["$referenceType", "payment"]
            }]
          }
        }
      }],
      as: "journalEntries"
    }
  }, {
    $match: {
      journalEntries: {
        $size: 0
      }
    }
  }, {
    $project: {
      _id: 1,
      amountMinor: 1,
      createdAt: 1
    }
  }]);
  for (const pay of paymentsWithoutJournal) {
    gaps.push({
      type: "missing_journal_entry",
      sourceType: "payment",
      sourceId: pay._id,
      amountMinor: pay.amountMinor,
      createdAt: pay.createdAt
    });
  }
  return {
    gaps,
    invoicesChecked: invoicesWithoutJournal.length === 0 ? "all_covered" : `${invoicesWithoutJournal.length}_missing`,
    paymentsChecked: paymentsWithoutJournal.length === 0 ? "all_covered" : `${paymentsWithoutJournal.length}_missing`
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  reconcileOrganization,
  // Exposed for testing and partial runs
  computeLedgerBalances,
  computeSourceTotals,
  checkJournalCoverage
};