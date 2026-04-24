/**
 * patientWallet.service.js — Patient Wallet Service
 * Billing Domain — Phase P0.3
 *
 * Manages patient prepaid wallet: credit, debit, and balance queries.
 * All mutations are transactional, idempotent, and journal-backed.
 *
 * INVARIANTS:
 * 1. All mutations run inside req.dbConnection transactions
 * 2. Idempotency via WalletTransaction unique index on idempotencyKey
 * 3. Journal entries created for every credit/debit (double-entry)
 * 4. Outbox events emitted for snapshot materialization
 * 5. Balance cannot go negative (debit guard)
 * 6. Amounts stored in minor units as source of truth
 *
 * SECURITY:
 * - Ownership verified by caller (controller/route layer)
 * - Requires PAYMENTS_CREATE permission (enforced at route)
 * - Uses req.dbConnection for per-org DB isolation
 *
 * PLANE: Organization only.
 * @per-org-transactional — all operations scoped to per-org database.
 */

"use strict";

const PatientWalletDef = require("../models/PatientWallet.model");
const WalletTransactionDef = require("../models/WalletTransaction.model");
const getModel = require("@core/db/getModel");
const journalService = require("../../services/journal.service");
const outboxService = require("@core/outbox/outbox.service");
const {
  ACCOUNTS
} = require("../../constants/accounts");
const {
  FINANCIAL_SNAPSHOT_REQUESTED
} = require("@core/domainEvents");
const billingSettingsService = require("./clinicBillingSettings.service");
const logger = require("@utils/logger");

// ─── Currency Resolution (Phase F0.2) ──────────────────────────────────────
// Cached per-request to avoid duplicate DB reads within the same HTTP cycle.
async function _resolveCurrency(req) {
  if (req._resolvedCurrency) return req._resolvedCurrency;
  const settings = await billingSettingsService.getOrCreate(req);
  req._resolvedCurrency = settings.defaultCurrency || "AED";
  return req._resolvedCurrency;
}

// ─── Per-Org Model Resolvers ────────────────────────────────────────────────

function _getWallet(connection) {
  if (!connection) throw new Error("[WalletService] connection is REQUIRED — per-org mode");
  return getModel(connection, PatientWalletDef);
}
function _getTransaction(connection) {
  if (!connection) throw new Error("[WalletService] connection is REQUIRED — per-org mode");
  return getModel(connection, WalletTransactionDef);
}

// ─── Amount Helpers ─────────────────────────────────────────────────────────

function toMinor(amount) {
  return Math.round(amount * 100);
}

// ─── Credit Wallet ──────────────────────────────────────────────────────────

/**
 * Credit a patient's wallet (add funds).
 *
 * @param {Object} params
 * @param {string} params.patientId
 * @param {string} params.branchId
 * @param {number} params.amount — positive decimal amount
 * @param {string} params.reason — human-readable reason
 * @param {string} params.idempotencyKey — unique key for deduplication
 * @param {string} params.processedByUserId — staff user who processed
 * @param {string} params.organizationId
 * @param {string} [params.refundId] — if credit is from a refund
 * @param {string} [params.currency] — override currency (otherwise resolved from BillingSettings)
 * @param {Object} req — Express request with dbConnection
 * @param {Object} [externalSession] — optional MongoDB session for transactional callers (e.g., refund service)
 * @returns {Promise<Object>} — wallet transaction record
 */
async function creditWallet({
  patientId,
  branchId,
  amount,
  reason,
  idempotencyKey,
  processedByUserId,
  refundId,
  currency: currencyOverride
}, req, externalSession = null) {
  if (!req?.dbConnection) {
    throw new Error("[WalletService.creditWallet] req.dbConnection is REQUIRED");
  }
  const currency = currencyOverride || (await _resolveCurrency(req));
  const amountMinor = toMinor(amount);
  const Wallet = _getWallet(req.dbConnection);
  const Transaction = _getTransaction(req.dbConnection);

  // ── Idempotency check ────────────────────────────────────────────────
  const existing = await Transaction.findOne({
    idempotencyKey
  }).lean();
  if (existing) {
    logger.info({
      idempotencyKey,
      patientId
    }, "[WalletService] Duplicate credit — returning existing");
    return existing;
  }

  // ── Transaction (use external session if provided, else start own) ──
  const ownSession = !externalSession;
  const session = externalSession || (await req.dbConnection.startSession());
  if (ownSession) session.startTransaction();
  try {
    // 0. Currency invariant — wallet MUST be single-currency
    const existingWallet = await Wallet.findOne({
      patientId
    }).session(session).lean();
    if (existingWallet && existingWallet.currency && existingWallet.currency !== currency) {
      const err = new Error(`Wallet currency mismatch: wallet is ${existingWallet.currency}, operation is ${currency}. ` + `A patient wallet cannot hold multiple currencies.`);
      err.statusCode = 400;
      err.code = "WALLET_CURRENCY_MISMATCH";
      throw err;
    }

    // 1. Upsert wallet + atomic $inc
    const wallet = await Wallet.findOneAndUpdate({
      patientId
    }, {
      $inc: {
        balance: amount
      },
      $setOnInsert: {
        patientId,
        currency
      },
      $set: {
        updatedAt: new Date()
      }
    }, {
      upsert: true,
      returnDocument: "after",
      session
    });

    // 2. Record transaction
    const [txn] = await Transaction.create([{
      patientId,
      type: "credit",
      amount,
      amountMinor,
      currency,
      reason,
      refundId: refundId || undefined,
      idempotencyKey,
      processedByUserId,
      balanceAfter: wallet.balance,
      balanceAfterMinor: toMinor(wallet.balance)
    }], {
      session
    });

    // 3. Journal entry: DR Cash, CR Wallet Liability
    await journalService.postJournalEntry({
      branchId,
      patientId,
      referenceType: "wallet_credit",
      referenceId: txn._id.toString(),
      entries: [{
        account: ACCOUNTS.CASH,
        type: "debit",
        amount,
        amountMinor
      }, {
        account: ACCOUNTS.WALLET_LIABILITY,
        type: "credit",
        amount,
        amountMinor
      }],
      currency,
      description: `Wallet credit: ${reason}`,
      createdBy: processedByUserId,
      session,
      connection: req.dbConnection
    });

    // 4. Outbox event for snapshot rebuild
    await outboxService.enqueue({
      eventType: FINANCIAL_SNAPSHOT_REQUESTED,
      aggregateType: "wallet",
      aggregateId: txn._id,
      payload: {
        patientId,
        type: "credit",
        amount,
        amountMinor
      }
    }, session);
    if (ownSession) await session.commitTransaction();
    logger.info({
      patientId,
      amount,
      balanceAfter: wallet.balance,
      idempotencyKey
    }, "[WalletService] Credit completed");
    return txn.toObject();
  } catch (err) {
    if (ownSession) await session.abortTransaction();

    // Handle unique index violation (concurrent duplicate)
    if (err.code === 11000 && err.message?.includes("idempotencyKey")) {
      const existing = await Transaction.findOne({
        idempotencyKey
      }).lean();
      if (existing) return existing;
    }
    logger.error({
      err,
      patientId,
      idempotencyKey
    }, "[WalletService] Credit failed");
    throw err;
  } finally {
    if (ownSession) await session.endSession();
  }
}

// ─── Debit Wallet ───────────────────────────────────────────────────────────

/**
 * Debit a patient's wallet (withdraw funds, optionally against an invoice).
 *
 * @param {Object} params
 * @param {string} params.patientId
 * @param {string} params.branchId
 * @param {number} params.amount — positive decimal amount
 * @param {string} params.reason
 * @param {string} params.idempotencyKey
 * @param {string} params.processedByUserId
 * @param {string} params.organizationId
 * @param {string} [params.invoiceId] — optional invoice to pay from wallet
 * @param {string} [params.currency] — override currency (otherwise resolved from BillingSettings)
 * @param {Object} req
 * @param {Object} [externalSession] — optional MongoDB session for transactional callers
 * @returns {Promise<Object>} — wallet transaction record
 */
async function debitWallet({
  patientId,
  branchId,
  amount,
  reason,
  idempotencyKey,
  processedByUserId,
  invoiceId,
  currency: currencyOverride
}, req, externalSession = null) {
  if (!req?.dbConnection) {
    throw new Error("[WalletService.debitWallet] req.dbConnection is REQUIRED");
  }
  const currency = currencyOverride || (await _resolveCurrency(req));
  const amountMinor = toMinor(amount);
  const Wallet = _getWallet(req.dbConnection);
  const Transaction = _getTransaction(req.dbConnection);

  // ── Idempotency check ────────────────────────────────────────────────
  const existing = await Transaction.findOne({
    idempotencyKey
  }).lean();
  if (existing) {
    logger.info({
      idempotencyKey,
      patientId
    }, "[WalletService] Duplicate debit — returning existing");
    return existing;
  }

  // ── Transaction (use external session if provided, else start own) ──
  const ownSession = !externalSession;
  const session = externalSession || (await req.dbConnection.startSession());
  if (ownSession) session.startTransaction();
  try {
    // 0. Currency invariant — wallet MUST be single-currency
    const existingWallet = await Wallet.findOne({
      patientId
    }).session(session).lean();
    if (existingWallet && existingWallet.currency && existingWallet.currency !== currency) {
      const err = new Error(`Wallet currency mismatch: wallet is ${existingWallet.currency}, operation is ${currency}. ` + `A patient wallet cannot hold multiple currencies.`);
      err.statusCode = 400;
      err.code = "WALLET_CURRENCY_MISMATCH";
      throw err;
    }

    // 1. Atomic debit with balance guard — only succeeds if balance >= amount
    const wallet = await Wallet.findOneAndUpdate({
      patientId,
      balance: {
        $gte: amount
      }
    }, {
      $inc: {
        balance: -amount
      },
      $set: {
        updatedAt: new Date()
      }
    }, {
      returnDocument: "after",
      session
    });
    if (!wallet) {
      // Check if wallet exists but insufficient funds
      const currentWallet = await Wallet.findOne({
        patientId
      }).session(session).lean();
      if (!currentWallet) {
        const err = new Error("Patient wallet not found — no funds available");
        err.statusCode = 404;
        err.code = "WALLET_NOT_FOUND";
        throw err;
      }
      const err = new Error(`Insufficient wallet balance. Available: ${currentWallet.balance}, requested: ${amount}`);
      err.statusCode = 400;
      err.code = "INSUFFICIENT_BALANCE";
      err.availableBalance = currentWallet.balance;
      throw err;
    }

    // 2. Record transaction
    const [txn] = await Transaction.create([{
      patientId,
      type: "debit",
      amount,
      amountMinor,
      currency,
      reason,
      invoiceId: invoiceId || undefined,
      idempotencyKey,
      processedByUserId,
      balanceAfter: wallet.balance,
      balanceAfterMinor: toMinor(wallet.balance)
    }], {
      session
    });

    // 3. Journal entry: DR Wallet Liability, CR Cash (wallet used as payment)
    await journalService.postJournalEntry({
      branchId,
      patientId,
      referenceType: "wallet_debit",
      referenceId: txn._id.toString(),
      entries: [{
        account: ACCOUNTS.WALLET_LIABILITY,
        type: "debit",
        amount,
        amountMinor
      }, {
        account: ACCOUNTS.CASH,
        type: "credit",
        amount,
        amountMinor
      }],
      currency,
      description: `Wallet debit: ${reason}${invoiceId ? ` (Invoice: ${invoiceId})` : ""}`,
      createdBy: processedByUserId,
      session,
      connection: req.dbConnection
    });

    // 4. Outbox event for snapshot rebuild
    await outboxService.enqueue({
      eventType: FINANCIAL_SNAPSHOT_REQUESTED,
      aggregateType: "wallet",
      aggregateId: txn._id,
      payload: {
        patientId,
        type: "debit",
        amount,
        amountMinor,
        invoiceId
      }
    }, session);
    if (ownSession) await session.commitTransaction();
    logger.info({
      patientId,
      amount,
      balanceAfter: wallet.balance,
      idempotencyKey,
      invoiceId
    }, "[WalletService] Debit completed");
    return txn.toObject();
  } catch (err) {
    if (ownSession) await session.abortTransaction();
    if (err.code === 11000 && err.message?.includes("idempotencyKey")) {
      const existing = await Transaction.findOne({
        idempotencyKey
      }).lean();
      if (existing) return existing;
    }
    logger.error({
      err,
      patientId,
      idempotencyKey
    }, "[WalletService] Debit failed");
    throw err;
  } finally {
    if (ownSession) await session.endSession();
  }
}

// ─── Get Balance ────────────────────────────────────────────────────────────

/**
 * Get the current wallet balance for a patient.
 *
 * @param {Object} params
 * @param {string} params.patientId
 * @param {Object} req — Express request with dbConnection
 * @returns {Promise<Object>} — { patientId, balance, currency, updatedAt }
 */
async function getBalance({
  patientId
}, req) {
  if (!req?.dbConnection) {
    throw new Error("[WalletService.getBalance] req.dbConnection is REQUIRED");
  }
  const currency = await _resolveCurrency(req);
  const Wallet = _getWallet(req.dbConnection);
  const wallet = await Wallet.findOne({
    patientId
  }).lean();
  if (!wallet) {
    return {
      patientId,
      balance: 0,
      balanceMinor: 0,
      currency,
      updatedAt: null
    };
  }
  return {
    patientId: wallet.patientId,
    balance: wallet.balance,
    balanceMinor: toMinor(wallet.balance),
    currency,
    updatedAt: wallet.updatedAt
  };
}

// ─── Get Transaction History ────────────────────────────────────────────────

/**
 * Get paginated wallet transaction history for a patient.
 *
 * @param {Object} params
 * @param {string} params.patientId
 * @param {number} [params.page=1]
 * @param {number} [params.limit=50]
 * @param {Object} req
 * @returns {Promise<Object>} — { data, pagination }
 */
async function getTransactions({
  patientId,
  page = 1,
  limit = 50
}, req) {
  if (!req?.dbConnection) {
    throw new Error("[WalletService.getTransactions] req.dbConnection is REQUIRED");
  }
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 50), 100);
  const skip = (safePage - 1) * safeLimit;
  const Transaction = _getTransaction(req.dbConnection);
  const [data, total] = await Promise.all([Transaction.find({
    patientId
  }).sort({
    createdAt: -1
  }).skip(skip).limit(safeLimit).lean(), Transaction.countDocuments({
    patientId
  })]);
  return {
    data,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: skip + data.length < total
    }
  };
}
module.exports = {
  creditWallet,
  debitWallet,
  getBalance,
  getTransactions
};