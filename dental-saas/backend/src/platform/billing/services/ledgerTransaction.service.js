/**
 * ledgerTransaction.service.js
 * Platform Finance — Double-Entry Ledger Write Service
 *
 * Provides:
 *   writeLedgerTransaction(opts)  — creates a balanced LedgerTransaction
 *   getLedgerTransactionById(id)  — fetches a transaction for the drilldown API
 *
 * Design principles:
 *  1. NON-THROWING — failures are logged but never propagate to billing operations.
 *     The existing BillingLedger writeLedgerEntry() follows the same pattern.
 *  2. BACKWARDS COMPATIBLE — this service does NOT replace BillingLedger.
 *     Call writeLedgerTransaction() IN ADDITION TO writeLedgerEntry(), not instead of.
 *  3. BALANCED — the service validates debit === credit before saving.
 *     Unbalanced entries are rejected with a structured log, not a throw.
 *
 * Standard entry patterns:
 *
 *   Invoice created (debit AR, credit Deferred Revenue):
 *     writeLedgerTransaction({
 *       description: `Invoice ${invoiceNumber}`,
 *       referenceType: "invoice",
 *       referenceId: invoice._id,
 *       referenceLabel: invoice.invoiceNumber,
 *       currency: invoice.currency,
 *       totalAmount: invoice.totalAmount,
 *       organizationId: invoice.organizationId,
 *       entries: [
 *         { accountCode: "accounts_receivable", debit: invoice.totalAmount },
 *         { accountCode: "deferred_revenue",    credit: invoice.totalAmount }
 *       ]
 *     })
 *
 *   Payment received (debit Cash, credit AR):
 *     entries: [
 *       { accountCode: "cash",                 debit: amount },
 *       { accountCode: "accounts_receivable",  credit: amount }
 *     ]
 *
 *   Refund issued (debit Revenue, credit Cash):
 *     entries: [
 *       { accountCode: "revenue", debit: amount },
 *       { accountCode: "cash",    credit: amount }
 *     ]
 *
 * PLANE: Platform / Finance
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const LedgerTransactionDef = require("../models/LedgerTransaction.model");
let _LedgerTransaction_cache = null;
function LedgerTransaction() {
    return _LedgerTransaction_cache || (_LedgerTransaction_cache = getPlatformModel(LedgerTransactionDef));
}
const logger = require("@utils/logger");

/**
 * writeLedgerTransaction
 *
 * Creates a balanced double-entry ledger transaction.
 * NON-THROWING — errors are logged but never propagated.
 *
 * @param {object} opts
 * @param {string}   opts.description       - Human-readable description
 * @param {string}   opts.referenceType     - "invoice"|"contract"|"payment"|"refund"|"ledger"|"manual"
 * @param {ObjectId} opts.referenceId       - _id of the referenced entity
 * @param {string}   [opts.referenceLabel]  - Denormalized label (e.g. "INV-00045")
 * @param {string}   opts.currency          - ISO 4217 (e.g. "USD")
 * @param {number}   opts.totalAmount       - Major currency units (e.g. 99.00)
 * @param {ObjectId} [opts.organizationId]  - For analytics / quick filtering
 * @param {ObjectId} [opts.billingLedgerRef]- Back-link to originating BillingLedger entry
 * @param {string}   [opts.source]          - Source system identifier
 * @param {Array}    opts.entries           - [{accountCode, debit, credit, description?}]
 *
 * @returns {Promise<LedgerTransaction|null>} null on failure (non-throwing)
 */
async function writeLedgerTransaction(opts) {
  try {
    // Validate balance before attempting save
    const totalDebit = (opts.entries || []).reduce((s, e) => s + (e.debit || 0), 0);
    const totalCredit = (opts.entries || []).reduce((s, e) => s + (e.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) >= 0.001) {
      logger.error({
        event: "LEDGER_TRANSACTION_UNBALANCED",
        referenceType: opts.referenceType,
        referenceId: opts.referenceId,
        totalDebit,
        totalCredit
      }, "[ledgerTransaction] LEDGER_TRANSACTION_UNBALANCED — transaction rejected");
      return null;
    }
    const doc = await LedgerTransaction().create({
      description: opts.description,
      referenceType: opts.referenceType,
      referenceId: opts.referenceId,
      referenceLabel: opts.referenceLabel ?? "",
      currency: opts.currency,
      totalAmount: opts.totalAmount ?? totalDebit,
      organizationId: opts.organizationId ?? null,
      billingLedgerRef: opts.billingLedgerRef ?? null,
      source: opts.source ?? "system",
      entries: opts.entries
    });
    return doc;
  } catch (err) {
    logger.error({
      err,
      event: "LEDGER_TRANSACTION_WRITE_FAILED",
      referenceType: opts.referenceType,
      referenceId: opts.referenceId
    }, "[ledgerTransaction] LEDGER_TRANSACTION_WRITE_FAILED — non-fatal");
    return null;
  }
}

/**
 * getLedgerTransactionById
 * Used by the drilldown API endpoint.
 *
 * @param {string} id
 * @returns {Promise<LedgerTransaction|null>}
 */
async function getLedgerTransactionById(id) {
  return LedgerTransaction().findById(id).lean();
}

/**
 * getLedgerTransactionsByReference
 * Returns all transactions for a given referenceType + referenceId combo.
 * Used to enrich ledger list entries with transaction links.
 *
 * @param {string}   referenceType
 * @param {ObjectId} referenceId
 * @returns {Promise<LedgerTransaction[]>}
 */
async function getLedgerTransactionsByReference(referenceType, referenceId) {
  return LedgerTransaction().find({
    referenceType,
    referenceId
  }).sort({
    createdAt: -1
  }).lean();
}
module.exports = {
  writeLedgerTransaction,
  getLedgerTransactionById,
  getLedgerTransactionsByReference
};