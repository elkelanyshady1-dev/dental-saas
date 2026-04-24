/**
 * refund.service.js — Patient Refund Processing Engine
 * Billing Domain — Phase D (Refund Engine)
 *
 * Orchestrates the full refund lifecycle:
 * 1. Validate payment is refundable
 * 2. Reverse the payment allocation
 * 3. Update the invoice balance/status
 * 4. Create Refund record
 * 5. Create journal entry (DR Refunds / CR Cash)
 * 6. Emit PAYMENT_REFUNDED event
 *
 * INVARIANTS:
 * 1. Refund MUST NOT exceed original payment amount
 * 2. Cannot refund an already-refunded payment
 * 3. Entire flow runs inside a single MongoDB session (atomic)
 * 4. Financial circuit breaker is checked before processing
 * 5. Journal entry is created with retry fallback
 *
 * PLANE: Org only.
 * Phase 3.2 — Connection-aware model resolution via getModel.
 *
 * SECURITY: Queries use secureModel + signed system context (Wave 7 RLS).
 */

"use strict";

const getSharedModel = require("@core/db/getSharedModel");
const mongoose = require("mongoose");
const RefundDef = require("./Refund.model");
const PatientPaymentDef = require("../organizationFinance/models/PatientPayment.model");
const PatientInvoiceDef = require("../organizationFinance/models/PatientInvoice.model");
const PaymentAllocationDef = require("../organizationFinance/models/PaymentAllocation.model");
const FinancialLedgerDef = require("../organizationFinance/models/FinancialLedger.model");
const getModel = require("@core/db/getModel");
const journalService = require("../services/journal.service");
const journalRetryService = require("../resilience/journalRetry.service");
const financialCircuit = require("../guards/financialCircuit.guard");
const {
  deriveStatusFromAmounts
} = require("../organizationFinance/services/invoiceStatus.service");
const eventBus = require("@core/eventBus");
const {
  PAYMENT_REFUNDED,
  FINANCIAL_SNAPSHOT_REQUESTED
} = require("@core/domainEvents");
const outboxService = require("@core/outbox/outbox.service");
const Money = require("@utils/money");
const logger = require("@utils/logger");
// Phase D: centralized request-idempotency store. Lives on the platform DB;
// key/scope/org-scoped. Refund.schema stays untouched — transport-level
// idempotency should not be a domain concern.
const IdempotencyKeyDef = require("@core/IdempotencyKey.model");
let _IdempotencyKey_cache = null;
function IdempotencyKey() {
    return _IdempotencyKey_cache || (_IdempotencyKey_cache = getSharedModel(IdempotencyKeyDef));
}
const {
  v4: uuidv4
} = require("uuid");

// ─── Strict Per-Org Model Resolvers (Phase 3.3) ─────────────────────────────
function _getSecure(connection, def) {
  if (!connection) throw new Error("[RefundService] connection is REQUIRED — per-org mode does not allow fallback");
  return getModel(connection, def);
}

// ─── Idempotency key helper ─────────────────────────────────────────────────
// Reads the HTTP Idempotency-Key header if present and syntactically valid.
// Returns null for: no req / no header / empty / malformed keys. A null
// return means "no idempotency" — the refund proceeds as if the client
// didn't opt in. This preserves 100% backward compatibility for callers
// that never send the header.
//
// Validation pattern (8-128 chars of [A-Za-z0-9_-]) matches the existing
// idempotency middleware so both paths produce the same client contract.
function _readIdempotencyKey(req) {
  if (!req || typeof req !== "object") return null;
  const headers = req.headers || {};
  const raw = headers["idempotency-key"];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Process a patient refund.
 *
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} params.paymentId — payment to refund
 * @param {number} params.amount — refund amount (must be <= payment amount)
 * @param {string} params.reason — required explanation
 * @param {string} params.processedByUserId — who is processing the refund
 * @param {Object} req — Express request (Phase 3.2: provides dbConnection)
 * @returns {Promise<Object>} — created Refund document
 */
async function processRefund({
  organizationId,
  paymentId,
  amount,
  reason,
  processedByUserId
}, req) {
  // ─── Phase D: opt-in request idempotency ───────────────────────────────
  // Clients that send `Idempotency-Key: <key>` get safe retry behavior:
  // the exact same response is returned on replay, and concurrent duplicate
  // requests see 409 REQUEST_ALREADY_IN_PROGRESS. Clients that don't send
  // the header pass through unchanged — zero behavior change.
  //
  // The key lives on the centralized IdempotencyKey collection, NOT on the
  // Refund schema. That keeps transport retries decoupled from domain
  // records and lets the same mechanism cover invoice / ledger / job paths
  // later without per-schema pollution.
  const idempotencyKey = _readIdempotencyKey(req);
  const orgIdStr = String(organizationId);
  let claimedKey = null; // non-null once we own the in-flight row

  if (idempotencyKey) {
    // Fast replay path: completed key → return cached response. Scoped to
    // (key, organizationId, scope:"refund") so a cross-scope key reuse
    // can't return a wrong-operation response.
    const existing = await IdempotencyKey().findOne({
      key: idempotencyKey,
      scope: "refund"
    }).lean();
    if (existing?.status === "completed") {
      logger.info({
        event: "REFUND_IDEMPOTENCY_REPLAY",
        key: idempotencyKey,
        Str
      }, "[RefundService] replay — returning cached refund");
      return existing.response?.body ?? existing.response ?? null;
    }
    if (existing?.status === "in-flight") {
      const err = new Error("REQUEST_ALREADY_IN_PROGRESS");
      err.statusCode = 409;
      err.idempotencyKey = idempotencyKey;
      throw err;
    }

    // Claim the key. Unique index on `key` serializes concurrent claims;
    // exactly one caller wins the insert, the rest get E11000.
    try {
      await IdempotencyKey().create({
        key: idempotencyKey,
        scope: "refund",
        userId: processedByUserId ? String(processedByUserId) : null,
        status: "in-flight"
      });
      claimedKey = idempotencyKey;
      logger.info({
        event: "REFUND_IDEMPOTENCY_CLAIMED",
        key: idempotencyKey,
        Str
      }, "[RefundService] idempotency key claimed");
    } catch (err) {
      if (err.code === 11000) {
        // Lost the race. Re-check the winner's state under the same
        // scope. If they completed → return cached response.
        // Anything else (still in-flight, or a stale "failed" row)
        // → 409 so the client backs off.
        const winner = await IdempotencyKey().findOne({
          key: idempotencyKey,
          scope: "refund"
        }).lean();
        if (winner?.status === "completed") {
          logger.info({
            event: "REFUND_IDEMPOTENCY_REPLAY",
            key: idempotencyKey,
            Str,
            source: "race-loser"
          }, "[RefundService] race-loser replay");
          return winner.response?.body ?? winner.response ?? null;
        }
        const raceErr = new Error("REQUEST_ALREADY_IN_PROGRESS");
        raceErr.statusCode = 409;
        raceErr.idempotencyKey = idempotencyKey;
        throw raceErr;
      }
      throw err;
    }
  }
  const currency = "AED";

  // Circuit breaker: block refund writes if financial integrity is compromised
  await financialCircuit.checkFinancialHealth(organizationId, financialCircuit.OPERATIONS.REFUND_WRITE);
  const connection = req.dbConnection;
  const session = await connection.startSession();
  session.startTransaction();
  try {
    // ─── STEP 1: Fetch and Validate Payment ────────────────────

    // INV-21: Bootstrap query uses getModel(req.dbConnection, Def)

    const PatientPayment = _getSecure(connection, PatientPaymentDef);
    const Refund = _getSecure(connection, RefundDef);
    const PaymentAllocation = _getSecure(connection, PaymentAllocationDef);
    const PatientInvoice = _getSecure(connection, PatientInvoiceDef);
    const payment = await PatientPayment.findOne({
      _id: paymentId
    }).session(session);
    if (!payment) {
      throw new Error("Payment not found or unauthorized.");
    }
    if (payment.status !== "active" && payment.status !== "partially_refunded") {
      throw new Error(`Payment cannot be refunded — current status: ${payment.status}`);
    }

    // Validate amount
    const refundMoney = Money.fromDecimal(amount, currency);
    const paymentMinor = payment.amountMinor || Math.round(payment.amount * 100);

    // Aggregate all previous refunds for this payment
    // secureModel.aggregate prepends $match { organizationId } automatically
    const previousRefunds = await Refund.aggregate([{
      $match: {
        paymentId: payment._id
      }
    }, {
      $group: {
        _id: null,
        totalMinor: {
          $sum: "$amountMinor"
        },
        count: {
          $sum: 1
        }
      }
    }]).session(session);
    const previouslyRefundedMinor = previousRefunds.length > 0 ? previousRefunds[0].totalMinor : 0;
    const previousRefundCount = previousRefunds.length > 0 ? previousRefunds[0].count : 0;
    const remainingMinor = paymentMinor - previouslyRefundedMinor;
    if (refundMoney.amountMinor > remainingMinor) {
      const alreadyRefunded = (previouslyRefundedMinor / 100).toFixed(2);
      const remaining = (remainingMinor / 100).toFixed(2);
      throw new Error(`Refund amount (${amount}) exceeds remaining refundable amount (${remaining}). ` + `Already refunded: ${alreadyRefunded} of ${payment.amount}.`);
    }
    const refundNumber = previousRefundCount + 1;
    const isFullRefund = previouslyRefundedMinor + refundMoney.amountMinor >= paymentMinor;

    // ─── STEP 2: Reverse the Payment Allocation ────────────────

    if (payment.invoiceId) {
      // INV-21: Bootstrap query uses getModel(req.dbConnection, Def)
      const allocation = await PaymentAllocation.findOne({
        paymentId: payment._id
      }).session(session);
      if (allocation) {
        // Reduce the allocated amount
        allocation.allocatedAmount -= refundMoney.toDecimal();
        allocation.allocatedAmountMinor = (allocation.allocatedAmountMinor || 0) - refundMoney.amountMinor;
        await allocation.save({
          session
        });
      }
    }

    // ─── STEP 3: Update Invoice Balance ────────────────────────

    if (payment.invoiceId) {
      // INV-21: Bootstrap query uses getModel(req.dbConnection, Def)
      const invoice = await PatientInvoice.findOne({
        _id: payment.invoiceId
      }).session(session);
      if (invoice) {
        // Increase outstanding amount (reverse the payment)
        invoice.paidAmount = (invoice.paidAmount || 0) - refundMoney.toDecimal();
        invoice.paidAmountMinor = (invoice.paidAmountMinor || 0) - refundMoney.amountMinor;

        // Re-derive invoice status
        invoice.status = deriveStatusFromAmounts(invoice.totalAmountMinor || invoice.totalAmount * 100, invoice.paidAmountMinor || invoice.paidAmount * 100, invoice.status === "voided");
        invoice.version = (invoice.version || 0) + 1;
        await invoice.save({
          session
        });
      }
    }

    // ─── STEP 4: Update Payment Status ─────────────────────────

    payment.status = isFullRefund ? "refunded" : "partially_refunded";
    payment.version = (payment.version || 0) + 1;
    await payment.save({
      session
    });

    // ─── STEP 5: Create Refund Record ──────────────────────────

    const [refund] = await Refund.create([{
      branchId: payment.branchId,
      patientId: payment.patientId,
      paymentId: payment._id,
      invoiceId: payment.invoiceId,
      amount: refundMoney.toDecimal(),
      amountMinor: refundMoney.amountMinor,
      currency,
      refundNumber,
      reason,
      processedByUserId
    }], {
      session
    });

    // ─── STEP 6: Create Financial Ledger Entry ─────────────────

    const FinancialLedger = _getSecure(connection, FinancialLedgerDef);
    await FinancialLedger.create([{
      patientId: payment.patientId,
      type: "PAYMENT_REFUNDED",
      amount: refundMoney.toDecimal(),
      amountMinor: refundMoney.amountMinor,
      currency,
      referenceId: refund._id,
      branchId: payment.branchId,
      performedByUserId: processedByUserId
    }], {
      session
    });

    // ─── STEP 7: Double-Entry Journal (DR Refunds / CR Cash) ───

    try {
      await journalService.recordRefundEntry(refund, session, connection);
    } catch (journalErr) {
      logger.error({
        err: journalErr,
        refundId: refund._id
      }, "[RefundService] Journal entry failed for refund — queued for retry");
      await journalRetryService.enqueue({
        referenceType: "refund",
        referenceId: refund._id,
        payload: {
          refundId: refund._id
        },
        error: journalErr
      });
    }

    // ─── STEP 8: Enqueue Events in Outbox (INSIDE transaction) ──

    const refundEventPayload = {
      eventId: uuidv4(),
      refundId: refund._id,
      paymentId: payment._id,
      invoiceId: payment.invoiceId,
      patientId: payment.patientId,
      amount: refundMoney.toDecimal(),
      amountMinor: refundMoney.amountMinor,
      currency,
      timestamp: new Date()
    };
    await outboxService.enqueue({
      eventType: PAYMENT_REFUNDED,
      aggregateType: "refund",
      aggregateId: refund._id,
      payload: refundEventPayload
    }, session);
    const snapshotPayload = {
      eventId: uuidv4(),
      patientId: payment.patientId,
      trigger: "PAYMENT_REFUNDED"
    };
    await outboxService.enqueue({
      eventType: FINANCIAL_SNAPSHOT_REQUESTED,
      aggregateType: "snapshot",
      aggregateId: refund._id,
      payload: snapshotPayload
    }, session);

    // ─── STEP 9: Commit ─────────────────────────────────────────

    await session.commitTransaction();

    // Immediate emit for low-latency (outbox worker is backup guarantee)
    eventBus.emit(PAYMENT_REFUNDED, refundEventPayload);
    eventBus.emit(FINANCIAL_SNAPSHOT_REQUESTED, snapshotPayload);
    logger.info({
      refundId: refund._id,
      paymentId: payment._id,
      amount: refundMoney.toDecimal(),
      organizationId
    }, "[RefundService] ✅ Refund processed successfully");
    if (claimedKey) {
      // Cache the response for replay. Best-effort — if this update
      // fails, the refund itself has already committed successfully;
      // the in-flight row stays until its 24h TTL clears, at which
      // point retries can proceed again. Don't let a cache-write
      // failure mask a real refund success.
      try {
        await IdempotencyKey().updateOne({
          key: claimedKey,
          scope: "refund"
        }, {
          $set: {
            status: "completed",
            "response.body": typeof refund.toObject === "function" ? refund.toObject() : refund
          }
        });
        logger.debug({
          event: "REFUND_IDEMPOTENCY_STORED",
          key: claimedKey,
          refundId: refund._id
        }, "[RefundService] response cached on idempotency key");
      } catch (storeErr) {
        logger.error({
          event: "REFUND_IDEMPOTENCY_STORE_FAILED",
          key: claimedKey,
          err: storeErr.message
        }, "[RefundService] failed to cache idempotency response — non-fatal, refund succeeded");
      }
    }
    return refund;
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    if (claimedKey) {
      // Delete the in-flight row so a retry with the same key can
      // proceed immediately. NOT marking "failed" because a failed
      // row blocks retries on the unique-key index until TTL (24h).
      // Deletion lets the client fix whatever caused the failure and
      // retry with the same key.
      try {
        await IdempotencyKey().deleteOne({
          key: claimedKey,
          scope: "refund",
          status: "in-flight"
        });
      } catch (cleanupErr) {
        logger.error({
          event: "REFUND_IDEMPOTENCY_CLEANUP_FAILED",
          key: claimedKey,
          err: cleanupErr.message
        }, "[RefundService] failed to release in-flight row — will expire via TTL");
      }
    }
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Get refund history for a patient.
 *
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} [params.patientId]
 * @param {number} [params.limit]
 * @param {number} [params.skip]
 * @param {Object} [req] — Express request (Phase 3.2)
 * @returns {Promise<Array>}
 */
async function getRefunds({
  patientId,
  limit = 50,
  skip = 0
}, req) {
  const connection = req?.dbConnection || null;
  const Refund = _getSecure(connection, RefundDef);
  const query = {};
  if (patientId) query.patientId = patientId;
  return Refund.find(query).sort({
    createdAt: -1
  }).skip(skip).limit(limit).populate("paymentId", "amount paymentMethod").populate("processedByUserId", "firstName lastName").lean();
}
module.exports = {
  processRefund,
  getRefunds
};