/**
 * refundProcessor.service.js
 * Sprint 7.2 — Enterprise Refund Processor
 *
 * Orchestrates the full refund lifecycle:
 *   1) requestRefund()    — creates RefundExecutionRecord in refund_requested state
 *   2) approveRefund()    — transitions to refund_approved
 *   3) rejectRefund()     — transitions to refund_rejected
 *   4) processRefund()    — executes with provider, handles revenue reversal
 *
 * Guarantees:
 *   - Strict state machine via refundStateMachine.js
 *   - Idempotency via idempotencyKey + providerRefundId
 *   - Revenue reversal using stored exchange rate (no FX re-resolution)
 *   - Forensic-grade BillingAuditLog events for every transition
 *   - Fraud controls via refundPolicy.service.js
 *
 * PLANE: Platform / Billing
 * COLLECTIONS: refundexecutionrecords, platforminvoices, revenueschedules,
 *              orgcontracts, billingauditlogs
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const RefundExecutionRecordDef = require("@shared/models/RefundExecutionRecord");
const RefundExecutionRecord = getPlatformModel(RefundExecutionRecordDef);
const PlatformInvoiceDef = require("../models/PlatformInvoice.model");
const PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
const OrgContractDef = require("../models/OrgContract.model");
const OrgContract = getPlatformModel(OrgContractDef);
const RevenueScheduleDef = require("../../finance/models/RevenueSchedule.model");
const RevenueSchedule = getPlatformModel(RevenueScheduleDef);
const {
  assertValidRefundTransition
} = require("../domain/refundStateMachine");
const {
  validateRefundEligibility
} = require("./refundPolicy.service");
const {
  logBillingEvent
} = require("./billingAuditLog.service");
const {
  getProvider
} = require("../providers/paymentProviderFactory");
const logger = require("@utils/logger");
const SYSTEM_ACTOR = "000000000000000000000000";

// ─── requestRefund ────────────────────────────────────────────────────────────
/**
 * Creates a new RefundExecutionRecord in "refund_requested" state.
 * Runs policy validation.
 *
 * @param {object} params
 * @param {string} params.invoiceId
 * @param {string} params.contractId
 * @param {number} params.amount        - Decimal amount to refund
 * @param {string} params.reasonCode    - e.g. "customer_request", "service_failure"
 * @param {string} params.requestedBy   - PlatformUser._id or "system"
 * @param {string} [params.idempotencyKey]
 *
 * @returns {Promise<{ record: object, requiresApproval: boolean, fraudFlag: boolean }>}
 */
async function requestRefund({
  invoiceId,
  contractId,
  amount,
  reasonCode,
  requestedBy,
  idempotencyKey
}) {
  // ── Idempotency check ───────────────────────────────────────────────────
  if (idempotencyKey) {
    const existing = await RefundExecutionRecord.findOne({
      idempotencyKey
    }).lean();
    if (existing) {
      logger.info({
        idempotencyKey,
        recordId: existing._id
      }, "[RefundProcessor] Idempotent skip on requestRefund");
      return {
        record: existing,
        requiresApproval: false,
        fraudFlag: false,
        idempotent: true
      };
    }
  }

  // ── Load invoice + contract ─────────────────────────────────────────────
  const invoice = await PlatformInvoice.findById(invoiceId).lean();
  if (!invoice) {
    const err = new Error(`PlatformInvoice ${invoiceId} not found`);
    err.status = 404;
    err.code = "INVOICE_NOT_FOUND";
    throw err;
  }
  const contract = await OrgContract.findById(contractId || invoice.contractId).lean();
  if (!contract) {
    const err = new Error(`OrgContract not found for invoice ${invoiceId}`);
    err.status = 404;
    err.code = "CONTRACT_NOT_FOUND";
    throw err;
  }

  // ── Policy validation ───────────────────────────────────────────────────
  const decision = await validateRefundEligibility(contract, invoice, amount, invoice.organizationId.toString());
  if (!decision.allowed) {
    const err = new Error(`Refund not eligible: ${decision.reason}`);
    err.status = 422;
    err.code = "REFUND_POLICY_DENIED";
    throw err;
  }

  // ── Amount guard ────────────────────────────────────────────────────────
  const alreadyRefunded = invoice.refundedAmountMinor || 0;
  const requestedMinor = Math.round(amount * 100);
  const remainingRefundable = invoice.totalAmountMinor - alreadyRefunded;
  if (requestedMinor > remainingRefundable) {
    const err = new Error(`Refund amount (${requestedMinor} minor) exceeds remaining refundable amount (${remainingRefundable} minor).`);
    err.status = 422;
    err.code = "REFUND_EXCEEDS_INVOICE";
    throw err;
  }

  // ── Create record ───────────────────────────────────────────────────────
  const key = idempotencyKey || `refund-${invoiceId}-${requestedMinor}-${Date.now()}`;
  const record = await RefundExecutionRecord.create({
    organizationId: invoice.organizationId,
    invoiceId: invoice._id,
    contractId: contract._id,
    regionCode: invoice.regionCode || "GLOBAL",
    amountMinor: requestedMinor,
    status: "refund_requested",
    reasonCode,
    requestedBy,
    idempotencyKey: key,
    providerChargeId: invoice.providerPaymentId || null
  });

  // ── BillingAuditLog ─────────────────────────────────────────────────────
  await logBillingEvent({
    organizationId: invoice.organizationId,
    contractId: contract._id,
    invoiceId: invoice._id,
    eventType: "REFUND_REQUESTED",
    performedBy: requestedBy,
    metadata: {
      refundId: record._id.toString(),
      amountMinor: requestedMinor,
      reasonCode,
      fraudFlag: decision.fraudFlag,
      requiresApproval: decision.requiresApproval
    }
  });
  if (decision.fraudFlag) {
    logger.warn({
      recordId: record._id,
      organizationId: invoice.organizationId
    }, "[RefundProcessor] FRAUD FLAG: velocity limit reached on refund request");
  }
  logger.info({
    recordId: record._id,
    invoiceId,
    amount,
    requiresApproval: decision.requiresApproval
  }, "[RefundProcessor] Refund requested");
  return {
    record,
    requiresApproval: decision.requiresApproval,
    fraudFlag: decision.fraudFlag
  };
}

// ─── approveRefund ────────────────────────────────────────────────────────────
/**
 * Transitions refund from refund_under_review → refund_approved.
 * Only callable by superadmin actors.
 *
 * @param {string} refundId  - RefundExecutionRecord._id
 * @param {string} approvedBy - PlatformUser._id
 */
async function approveRefund(refundId, approvedBy) {
  const record = await RefundExecutionRecord.findById(refundId);
  if (!record) {
    const err = new Error(`RefundExecutionRecord ${refundId} not found`);
    err.status = 404;
    err.code = "REFUND_NOT_FOUND";
    throw err;
  }

  // Auto-advance from refund_requested → refund_under_review → refund_approved
  // if record was created at refund_requested directly
  const currentStatus = record.status;
  if (currentStatus === "refund_requested") {
    assertValidRefundTransition("refund_requested", "refund_under_review");
    record.status = "refund_under_review";
  }
  assertValidRefundTransition(record.status, "refund_approved");
  record.status = "refund_approved";
  record.approvedBy = approvedBy;
  await record.save();
  await logBillingEvent({
    organizationId: record.organizationId,
    contractId: record.contractId,
    invoiceId: record.invoiceId,
    eventType: "REFUND_APPROVED",
    performedBy: approvedBy,
    metadata: {
      refundId: record._id.toString(),
      amountMinor: record.amountMinor,
      reasonCode: record.reasonCode
    }
  });
  logger.info({
    refundId,
    approvedBy
  }, "[RefundProcessor] Refund approved");
  return record;
}

// ─── rejectRefund ─────────────────────────────────────────────────────────────
/**
 * Transitions refund to refund_rejected (terminal state).
 *
 * @param {string} refundId
 * @param {string} rejectedBy
 * @param {string} [reason]
 */
async function rejectRefund(refundId, rejectedBy, reason = "manual_rejection") {
  const record = await RefundExecutionRecord.findById(refundId);
  if (!record) {
    const err = new Error(`RefundExecutionRecord ${refundId} not found`);
    err.status = 404;
    err.code = "REFUND_NOT_FOUND";
    throw err;
  }
  if (record.status === "refund_requested") {
    record.status = "refund_under_review";
  }
  assertValidRefundTransition(record.status, "refund_rejected");
  record.status = "refund_rejected";
  record.processedBy = rejectedBy;
  record.reasonCode = reason;
  await record.save();
  await logBillingEvent({
    organizationId: record.organizationId,
    contractId: record.contractId,
    invoiceId: record.invoiceId,
    eventType: "REFUND_REJECTED",
    performedBy: rejectedBy,
    metadata: {
      refundId: record._id.toString(),
      reason
    }
  });
  logger.info({
    refundId,
    rejectedBy,
    reason
  }, "[RefundProcessor] Refund rejected");
  return record;
}

// ─── processRefund ────────────────────────────────────────────────────────────
/**
 * Executes the actual refund via payment provider.
 * Handles:
 *   - Provider call
 *   - PlatformInvoice refundedAmountMinor update
 *   - RevenueSchedule reversal (proportional, using stored exchangeRate)
 *   - Idempotency guard via providerRefundId
 *
 * @param {string} refundId
 * @param {string} processedBy
 */
async function processRefund(refundId, processedBy) {
  const record = await RefundExecutionRecord.findById(refundId);
  if (!record) {
    const err = new Error(`RefundExecutionRecord ${refundId} not found`);
    err.status = 404;
    err.code = "REFUND_NOT_FOUND";
    throw err;
  }

  // ── Idempotency: already completed? ────────────────────────────────────
  if (record.status === "refund_completed") {
    logger.info({
      refundId
    }, "[RefundProcessor] Idempotent skip — already completed");
    return {
      record,
      idempotent: true
    };
  }

  // ── Idempotency: provider refund already exists? ────────────────────────
  if (record.providerRefundId) {
    const byProvider = await RefundExecutionRecord.findOne({
      providerRefundId: record.providerRefundId,
      status: "refund_completed"
    }).lean();
    if (byProvider && byProvider._id.toString() !== refundId) {
      logger.warn({
        refundId,
        providerRefundId: record.providerRefundId
      }, "[RefundProcessor] Duplicate providerRefundId detected — skipping");
      return {
        record,
        idempotent: true
      };
    }
  }
  assertValidRefundTransition(record.status, "refund_processing");
  const invoice = await PlatformInvoice.findById(record.invoiceId);
  if (!invoice) {
    const err = new Error(`PlatformInvoice ${record.invoiceId} not found during processing`);
    err.status = 404;
    err.code = "INVOICE_NOT_FOUND";
    throw err;
  }
  const contract = await OrgContract.findById(record.contractId).lean();

  // Transition to processing
  record.status = "refund_processing";
  record.processedBy = processedBy;
  await record.save();
  await logBillingEvent({
    organizationId: record.organizationId,
    contractId: record.contractId,
    invoiceId: record.invoiceId,
    eventType: "REFUND_PROCESSED",
    performedBy: processedBy,
    metadata: {
      refundId: record._id.toString(),
      amountMinor: record.amountMinor
    }
  });

  // ── Provider call ───────────────────────────────────────────────────────
  let providerRefund = null;
  try {
    if (contract?.paymentProvider && invoice.providerPaymentId) {
      const provider = getProvider(contract.paymentProvider);
      providerRefund = await provider.refundPayment(invoice.providerPaymentId, record.amountMinor, record.idempotencyKey);
    } else {
      // Manual refund path (no provider) — treat as succeeded
      providerRefund = {
        status: "succeeded",
        id: `manual:${Date.now()}`
      };
    }
  } catch (providerErr) {
    logger.error({
      providerErr,
      refundId
    }, "[RefundProcessor] Provider refund call failed");
    await _failRefund(record, providerErr.message);
    await logBillingEvent({
      organizationId: record.organizationId,
      contractId: record.contractId,
      invoiceId: record.invoiceId,
      eventType: "REFUND_FAILED",
      performedBy: processedBy,
      metadata: {
        refundId: record._id.toString(),
        reason: providerErr.message
      }
    });
    throw providerErr;
  }
  if (!providerRefund || providerRefund.status === "failed") {
    await _failRefund(record, "provider_rejected");
    const err = new Error("Provider rejected the refund request");
    err.code = "PROVIDER_REFUND_REJECTED";
    err.status = 502;
    throw err;
  }

  // ── Transactional update ────────────────────────────────────────────────
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const lInv = await PlatformInvoice.findById(invoice._id).session(session);

    // ── Update refund tracking fields ─────────────────────────────────────
    lInv.refundedAmountMinor = (lInv.refundedAmountMinor || 0) + record.amountMinor;
    const refundedDecimal = record.amountMinor / 100;
    const isFullRefund = lInv.refundedAmountMinor >= lInv.totalAmountMinor;
    if (isFullRefund) {
      lInv.paymentStatus = "refunded";
    } else {
      lInv.paymentStatus = "partially_refunded";
    }

    // ── v22.0: Update amountPaid / amountRemaining (Section 4 refund policy) ──
    // amountPaid decreases by the refunded amount; amountRemaining increases accordingly.
    // This keeps the INVOICE_TOTAL_MATCH invariant valid post-refund.
    const prevAmountPaid = lInv.amountPaid ?? 0;
    lInv.amountPaid = Math.max(0, prevAmountPaid - refundedDecimal);
    lInv.amountRemaining = Math.max(0, (lInv.totalAmount || 0) - lInv.amountPaid);
    await lInv.save({
      session
    });

    // ── Revenue Reversal ─────────────────────────────────────────────────
    const previousSchedule = {};
    const schedule = await RevenueSchedule.findOne({
      invoiceId: invoice._id
    }).session(session);
    if (schedule && schedule.totalAmount > 0) {
      Object.assign(previousSchedule, {
        recognizedAmount: schedule.recognizedAmount,
        deferredAmount: schedule.deferredAmount,
        normalizedRecognizedAmount: schedule.normalizedRecognizedAmount,
        normalizedDeferredAmount: schedule.normalizedDeferredAmount
      });

      // Proportional reversal: prorate recognized vs deferred
      const recognizedRatio = schedule.recognizedAmount / schedule.totalAmount;
      const recognizedReversal = refundedDecimal * recognizedRatio;
      const deferredReversal = refundedDecimal - recognizedReversal;
      schedule.recognizedAmount = Math.max(0, schedule.recognizedAmount - recognizedReversal);
      schedule.deferredAmount = Math.max(0, schedule.deferredAmount - deferredReversal);
      schedule.totalAmount = Math.max(0, schedule.totalAmount - refundedDecimal);

      // Integrity invariant: recognized + deferred === totalAmount (post-refund)
      const integritySum = schedule.recognizedAmount + schedule.deferredAmount;
      const integrityTarget = schedule.totalAmount;
      const epsilon = 0.005; // floating-point tolerance
      if (Math.abs(integritySum - integrityTarget) > epsilon) {
        await session.abortTransaction();
        session.endSession();
        const intErr = new Error(`[RefundProcessor] Revenue integrity violation: ` + `recognized(${schedule.recognizedAmount}) + deferred(${schedule.deferredAmount}) ` + `!= total(${schedule.totalAmount})`);
        intErr.code = "REVENUE_INTEGRITY_VIOLATION";
        intErr.status = 500;
        throw intErr;
      }

      // Normalized fields — use stored exchangeRate, NEVER re-resolve FX
      const rate = schedule.exchangeRate || 1.0;
      schedule.normalizedRecognizedAmount = Math.max(0, schedule.normalizedRecognizedAmount - recognizedReversal * rate);
      schedule.normalizedDeferredAmount = Math.max(0, schedule.normalizedDeferredAmount - deferredReversal * rate);
      schedule.normalizedTotalAmount = Math.max(0, schedule.normalizedTotalAmount - refundedDecimal * rate);
      await schedule.save({
        session
      });
    }

    // Finalize refund record
    record.status = "refund_completed";
    record.providerRefundId = providerRefund.id;
    record.originalExchangeRate = schedule?.exchangeRate || null;
    record.originalNormalizedAmount = schedule ? record.amountMinor / 100 * (schedule.exchangeRate || 1) : null;
    await record.save({
      session
    });
    await session.commitTransaction();
    session.endSession();

    // ── Final BillingAuditLog ─────────────────────────────────────────────
    await logBillingEvent({
      organizationId: record.organizationId,
      contractId: record.contractId,
      invoiceId: record.invoiceId,
      eventType: "REFUND_PROCESSED",
      performedBy: processedBy,
      previousState: previousSchedule,
      newState: schedule ? {
        recognizedAmount: schedule.recognizedAmount,
        deferredAmount: schedule.deferredAmount,
        totalAmount: schedule.totalAmount
      } : null,
      metadata: {
        refundId: record._id.toString(),
        amountMinor: record.amountMinor,
        providerRefundId: providerRefund.id,
        isFullRefund,
        exchangeRateUsed: schedule?.exchangeRate || 1.0,
        stage: "REFUND_COMPLETED"
      }
    });

    // ── v22.0: Write immutable BillingLedger entry (Section 4 refund policy) ──
    // writeLedgerEntry is non-throwing — ledger failure never blocks the refund response.
    const {
      writeLedgerEntry
    } = require("../models/BillingLedger.model");
    await writeLedgerEntry({
      eventType: "payment.refunded",
      organizationId: record.organizationId,
      contractId: record.contractId,
      invoiceId: record.invoiceId,
      provider: invoice.providerPaymentId ? invoice.currency : "internal",
      amount: refundedDecimal,
      currency: invoice.currency,
      source: "refundEngine",
      actorType: processedBy === SYSTEM_ACTOR ? "system" : "user",
      metadata: {
        refundId: record._id.toString(),
        amountMinor: record.amountMinor,
        providerRefundId: providerRefund.id,
        isFullRefund,
        reasonCode: record.reasonCode
      }
    });
    logger.info({
      refundId,
      providerRefundId: providerRefund.id,
      amountMinor: record.amountMinor
    }, "[RefundProcessor] Refund completed");
    return {
      record,
      providerRefundId: providerRefund.id
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    await _failRefund(record, err.message);
    throw err;
  }
}

// ─── _failRefund ──────────────────────────────────────────────────────────────
async function _failRefund(record, reason) {
  try {
    assertValidRefundTransition(record.status, "refund_failed");
    record.status = "refund_failed";
    record.reasonCode = record.reasonCode || reason;
    await record.save();
  } catch (smErr) {
    // If state machine rejects (already terminal), just log
    logger.warn({
      smErr: smErr.message,
      refundId: record._id
    }, "[RefundProcessor] State machine rejected fail transition (may already be terminal)");
  }
}
module.exports = {
  requestRefund,
  approveRefund,
  rejectRefund,
  processRefund
};