/**
 * journal.service.js — Double-Entry Journal Engine
 * Billing Domain — Phase C
 *
 * Provides the core accounting primitives for creating journal entries.
 * All functions are designed to run INSIDE an existing MongoDB session
 * (from the orchestrator) to maintain transactional atomicity.
 *
 * INVARIANTS:
 * 1. Every call MUST pass a valid session (transactional guarantee)
 * 2. Every entry MUST balance (debitMinor === creditMinor)
 * 3. Journal entries are IMMUTABLE (enforced by model hooks)
 * 4. All amounts use Money-safe minor units as the source of truth
 *
 * PLANE: Org only.
 * Phase 3.2 — Connection-aware model resolution via getModel.
 *
 * @per-org-transactional — Internal service. Called exclusively within the
 * ledger.orchestrator.service.js transaction with explicit organizationId.
 */

"use strict";

const JournalEntryDef = require("../models/JournalEntry.model");
const getModel = require("@core/db/getModel");
const {
  ACCOUNTS
} = require("../constants/accounts");
const idempotencyGuard = require("../guards/idempotency.guard");
const eventBus = require("@core/eventBus");
const {
  LEDGER_ENTRY_POSTED
} = require("@core/domainEvents");

// ─── Strict Per-Org Model Resolver (Phase 3.3) ──────────────────────────────
function _getJournalEntry(connection) {
  if (!connection) throw new Error("[JournalService] connection is REQUIRED — per-org mode does not allow fallback");
  return getModel(connection, JournalEntryDef);
}

// ─── Core Journal Posting ───────────────────────────────────────────────────

/**
 * Post a validated journal entry within a transaction.
 *
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} params.branchId
 * @param {string} [params.patientId]
 * @param {string} params.referenceType — "invoice" | "payment" | "refund" | "void" | "wallet_credit"
 * @param {string} params.referenceId
 * @param {Array<{account: string, type: "debit"|"credit", amount: number, amountMinor: number}>} params.entries
 * @param {string} params.currency
 * @param {string} [params.description]
 * @param {string} [params.createdBy]
 * @param {import("mongoose").ClientSession} params.session — REQUIRED
 * @returns {Promise<Object>} — created JournalEntry document
 */
async function postJournalEntry({
  organizationId,
  branchId,
  patientId,
  referenceType,
  referenceId,
  entries,
  currency = "AED",
  description,
  createdBy,
  session,
  connection
}) {
  if (!session) {
    throw new Error("JournalService: session is REQUIRED for transactional integrity.");
  }

  // Idempotency check: prevent duplicate journal entries
  const existing = await idempotencyGuard.checkAndPrevent(referenceType, referenceId, session, connection);
  if (existing) return existing;

  // Pre-validate balance (fail-fast before model validation)
  let debitMinor = 0;
  let creditMinor = 0;
  for (const line of entries) {
    if (line.type === "debit") debitMinor += line.amountMinor;else creditMinor += line.amountMinor;
  }
  if (debitMinor !== creditMinor) {
    throw new Error(`Journal balance violation: DR(${debitMinor}) ≠ CR(${creditMinor}) minor units. ` + `Reference: ${referenceType}/${referenceId}`);
  }
  let journalEntry;
  const JournalEntry = _getJournalEntry(connection);
  try {
    const [created] = await JournalEntry.create([{
      branchId,
      patientId,
      referenceType,
      referenceId,
      entries,
      currency,
      description,
      createdBy
      // totals auto-computed by pre-validate hook
    }], {
      session
    });
    journalEntry = created;
  } catch (err) {
    // DB-level exactly-once: handle unique index violation gracefully
    if (err.code === 11000) {
      const existing = await JournalEntry.findOne({
        referenceType,
        referenceId
      }).session(session).lean();
      if (existing) return existing;
    }
    throw err;
  }

  // Non-blocking event emission (after commit, the orchestrator handles this)
  // We emit here for observability — the actual event is idempotent
  setImmediate(() => {
    eventBus.emit(LEDGER_ENTRY_POSTED, {
      journalEntryId: journalEntry._id,
      referenceType,
      referenceId,
      totalDebitMinor: debitMinor,
      currency
    });
  });
  return journalEntry;
}

// ─── Domain-Specific Entry Factories ────────────────────────────────────────

/**
 * Record an invoice creation in the journal.
 *
 * DR  Accounts Receivable    (patient owes clinic)
 * CR  Revenue                (clinic earned revenue)
 *
 * If discount > 0:
 * DR  Discount Expense       (cost of discount)
 * CR  Accounts Receivable    (reduces amount owed)
 *
 * @param {Object} invoice — PatientInvoice document
 * @param {import("mongoose").ClientSession} session
 */
async function recordInvoiceEntry(invoice, session, connection) {
  const entries = [];

  // Main entry: full subtotal (before discount)
  entries.push({
    account: ACCOUNTS.ACCOUNTS_RECEIVABLE,
    type: "debit",
    amount: invoice.totalAmount,
    amountMinor: invoice.totalAmountMinor
  });
  entries.push({
    account: ACCOUNTS.REVENUE,
    type: "credit",
    amount: invoice.totalAmount,
    amountMinor: invoice.totalAmountMinor
  });
  return postJournalEntry({
    branchId: invoice.branchId,
    patientId: invoice.patientId,
    referenceType: "invoice",
    referenceId: invoice._id,
    entries,
    currency: invoice.currency || "AED",
    description: `Invoice ${invoice._id} issued — total ${invoice.totalAmount} ${invoice.currency || "AED"}`,
    createdBy: invoice.issuedByUserId,
    session,
    connection
  });
}

/**
 * Record a payment in the journal.
 *
 * DR  Cash                   (clinic received money)
 * CR  Accounts Receivable    (patient debt reduced)
 *
 * @param {Object} payment — PatientPayment document
 * @param {import("mongoose").ClientSession} session
 */
async function recordPaymentEntry(payment, session, connection) {
  const entries = [{
    account: ACCOUNTS.CASH,
    type: "debit",
    amount: payment.amount,
    amountMinor: payment.amountMinor
  }, {
    account: ACCOUNTS.ACCOUNTS_RECEIVABLE,
    type: "credit",
    amount: payment.amount,
    amountMinor: payment.amountMinor
  }];
  return postJournalEntry({
    branchId: payment.branchId,
    patientId: payment.patientId,
    referenceType: "payment",
    referenceId: payment._id,
    entries,
    currency: payment.currency || "AED",
    description: `Payment ${payment._id} recorded — ${payment.amount} ${payment.currency || "AED"} via ${payment.paymentMethod}`,
    createdBy: payment.collectedByUserId,
    session,
    connection
  });
}

/**
 * Record an invoice void (reversal) in the journal.
 *
 * DR  Revenue                (reverse revenue recognition)
 * CR  Accounts Receivable    (remove patient debt)
 *
 * @param {Object} invoice — PatientInvoice document (pre-void state)
 * @param {string} voidedByUserId
 * @param {import("mongoose").ClientSession} session
 */
async function recordVoidEntry(invoice, voidedByUserId, session, connection) {
  const entries = [{
    account: ACCOUNTS.REVENUE,
    type: "debit",
    amount: invoice.totalAmount,
    amountMinor: invoice.totalAmountMinor
  }, {
    account: ACCOUNTS.ACCOUNTS_RECEIVABLE,
    type: "credit",
    amount: invoice.totalAmount,
    amountMinor: invoice.totalAmountMinor
  }];
  return postJournalEntry({
    branchId: invoice.branchId,
    patientId: invoice.patientId,
    referenceType: "void",
    referenceId: invoice._id,
    entries,
    currency: invoice.currency || "AED",
    description: `Invoice ${invoice._id} voided — reversed ${invoice.totalAmount} ${invoice.currency || "AED"}`,
    createdBy: voidedByUserId,
    session,
    connection
  });
}

/**
 * Record a refund in the journal. (FUTURE — Phase C.2)
 *
 * DR  Refunds                (contra-revenue expense)
 * CR  Cash                   (money returned to patient)
 *
 * @param {Object} refund — refund record
 * @param {import("mongoose").ClientSession} session
 */
async function recordRefundEntry(refund, session, connection) {
  const entries = [{
    account: ACCOUNTS.REFUNDS,
    type: "debit",
    amount: refund.amount,
    amountMinor: refund.amountMinor
  }, {
    account: ACCOUNTS.CASH,
    type: "credit",
    amount: refund.amount,
    amountMinor: refund.amountMinor
  }];
  return postJournalEntry({
    branchId: refund.branchId,
    patientId: refund.patientId,
    referenceType: "refund",
    referenceId: refund._id,
    entries,
    currency: refund.currency || "AED",
    description: `Refund ${refund._id} processed — ${refund.amount} ${refund.currency || "AED"}`,
    createdBy: refund.processedByUserId,
    session,
    connection
  });
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  postJournalEntry,
  recordInvoiceEntry,
  recordPaymentEntry,
  recordVoidEntry,
  recordRefundEntry
};