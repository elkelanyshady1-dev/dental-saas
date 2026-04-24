/**
 * paymentApplicationService.js
 * Platform Billing — Payment Application Engine
 * v21.0 — Full SaaS Financial Lifecycle
 *
 * PURPOSE:
 * Applies a manual payment to a PlatformInvoice and:
 *   1. Creates a PaymentAttempt record
 *   2. Updates invoice.amountPaid and recomputes amountRemaining
 *   3. Transitions invoice status (open → partial → paid)
 *   4. Writes a BillingLedger entry
 *   5. If fully paid → triggers contract re-activation check
 *
 * INVARIANTS:
 *   - Payment cannot exceed invoice total (PAYMENT_NOT_GREATER_THAN_INVOICE)
 *   - Invoice must be in an accepting state (open, partial)
 *   - All mutations are atomic (session-wrapped)
 *
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const PlatformInvoiceDef = require("../models/PlatformInvoice.model");
const PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
const PaymentAttemptDef = require("../models/PaymentAttempt.model");
const PaymentAttempt = getPlatformModel(PaymentAttemptDef);
const OrgContractDef = require("../models/OrgContract.model");
const OrgContract = getPlatformModel(OrgContractDef);
const {
  writeLedgerEntry
} = require("../models/BillingLedger.model");
const {
  emitBillingTimelineEvent
} = require("./billingTimeline.service");
const logger = require("@utils/logger");
// Section 3: Safe money utilities — eliminate floating-point precision artifacts
const {
  roundCurrency,
  toMinorUnits,
  assertPrecision
} = require("@utils/money");
let activateContract;
try {
  activateContract = require("./contractActivation.service").activateContract;
} catch {
  activateContract = null;
}

// ─── Acceptable invoice statuses for payment ──────────────────────────────────
const PAYMENT_ACCEPTING_STATUSES = new Set(["open", "issued", "partial", "overdue"]);

/**
 * _computeInvoiceStatus
 * Derives the correct invoice status from the amountPaid vs totalAmount.
 *
 * @param {number} amountPaid
 * @param {number} totalAmount
 * @param {string} currentStatus  Current status (to detect overdue)
 * @returns {string}
 */
function _computeInvoiceStatus(amountPaid, totalAmount, currentStatus) {
  if (amountPaid <= 0) return currentStatus === "overdue" ? "overdue" : "open";
  if (amountPaid >= totalAmount) return "paid";
  return "partial";
}

/**
 * applyPayment
 * Core payment application engine.
 *
 * @param {object} opts
 * @param {string|ObjectId} opts.invoiceId
 * @param {number}         opts.amount          Decimal amount (e.g. 99.00)
 * @param {string}         opts.method          cash | bank | card | manual
 * @param {string}         [opts.transactionRef] Reference/receipt number
 * @param {string}         [opts.provider]      Defaults to "manual"
 * @param {string|ObjectId} [opts.actorId]      Platform user ID
 * @param {string}         [opts.requestId]
 *
 * @returns {Promise<{invoice: object, payment: object}>}
 * @throws {Error} with .statusCode for HTTP mapping
 */
async function applyPayment({
  invoiceId,
  amount,
  method = "manual",
  transactionRef = null,
  provider = "manual",
  actorId = null,
  requestId = null,
  idempotencyKey = null,
  // v21.1: client-supplied dedup key (Idempotency-Key header)
  session: externalSession = null // v22.1: external session from orchestrator
}) {
  if (!invoiceId) throw Object.assign(new Error("invoiceId is required"), {
    statusCode: 400
  });
  if (!amount || isNaN(amount) || amount <= 0) {
    throw Object.assign(new Error("Payment amount must be a positive number"), {
      statusCode: 400
    });
  }

  // Section 8: Normalize input to exactly 2dp before any computation
  const safeAmount = roundCurrency(Number(amount));

  // Section 10: assertPrecision — reject sub-cent values (e.g. 3647.0899999999997)
  // This catches floating-point artifacts passed from frontend or upstream services.
  assertPrecision(safeAmount, "payment amount");

  // ── v21.1: Idempotency check (pre-session) ──────────────────────────────
  // If the same Idempotency-Key arrives again (API retry / network timeout),
  // return the original result without touching the DB a second time.
  if (idempotencyKey) {
    const existing = await PaymentAttempt.findOne({
      idempotencyKey
    }).lean();
    if (existing) {
      const existingInvoice = await PlatformInvoice.findById(existing.invoiceId).lean();
      logger.info({
        idempotencyKey,
        paymentId: existing._id,
        invoiceId: existing.invoiceId,
        requestId
      }, "[paymentApplicationService] Idempotent replay — returning original payment attempt");
      return {
        invoice: existingInvoice,
        payment: existing,
        idempotent: true // flag so controller can respond with 200 (not 201)
      };
    }
  }

  // ── Session management ───────────────────────────────────────────────────
  // v22.1: When called from BillingOrchestrator.upgradeSubscription(), an external
  // session is provided. We reuse it — no nested transaction.
  // When called standalone (HTTP controller), we create our own.
  const ownsSession = !externalSession;
  const session = externalSession || (await mongoose.startSession());
  if (ownsSession) session.startTransaction();
  try {
    // ── Load invoice ──────────────────────────────────────────────────────
    const invoice = await PlatformInvoice.findById(invoiceId).session(session);
    if (!invoice) {
      throw Object.assign(new Error("Invoice not found"), {
        statusCode: 404
      });
    }

    // ── Guard: status ─────────────────────────────────────────────────────────────────────
    if (!PAYMENT_ACCEPTING_STATUSES.has(invoice.status)) {
      throw Object.assign(new Error(`Invoice in status "${invoice.status}" cannot receive payments. Only open/partial/overdue invoices accept payments.`), {
        statusCode: 409,
        code: "INVOICE_NOT_PAYABLE"
      });
    }

    // Section 5: roundCurrency on remaining balance computation
    // Prevents floating-point drift: e.g. 3647.09 - 0 = 3647.0899999999997
    const amountRemaining = roundCurrency(invoice.totalAmount - (invoice.amountPaid || 0));
    if (safeAmount > amountRemaining + 0.001) {
      // 0.001 tolerance for borderline floats
      throw Object.assign(new Error(`Payment amount ${safeAmount} exceeds remaining balance ${amountRemaining.toFixed(2)} — PAYMENT_NOT_GREATER_THAN_INVOICE`), {
        statusCode: 422,
        code: "PAYMENT_EXCEEDS_BALANCE"
      });
    }

    // ── Create PaymentAttempt ────────────────────────────────────────────────────────────
    const [payment] = await PaymentAttempt.create([{
      invoiceId: invoice._id,
      contractId: invoice.contractId,
      organizationId: invoice.organizationId,
      provider,
      providerPaymentId: transactionRef,
      amount: safeAmount,
      // Section 8: always use the rounded amount
      currency: invoice.currency,
      status: "captured",
      method: method || "manual",
      idempotencyKey: idempotencyKey || null,
      attemptNumber: 1,
      requestId,
      metadata: {
        actorId,
        transactionRef
      }
    }], {
      session
    });

    // ── Update invoice amountPaid (Section 5: all arithmetic via roundCurrency) ───────────
    const prevStatus = invoice.status;
    invoice.amountPaid = roundCurrency((invoice.amountPaid || 0) + safeAmount);
    invoice.amountRemaining = roundCurrency(Math.max(0, invoice.totalAmount - invoice.amountPaid));
    invoice.paymentStatus = invoice.amountPaid >= invoice.totalAmount ? "captured" : "authorized";
    const newStatus = _computeInvoiceStatus(invoice.amountPaid, invoice.totalAmount, invoice.status);
    invoice.status = newStatus;
    if (newStatus === "paid") {
      invoice.paidAt = new Date();
    }
    await invoice.save({
      session
    });
    if (ownsSession) await session.commitTransaction();
    logger.info({
      invoiceId: invoice._id,
      paymentId: payment._id,
      amount: safeAmount,
      // Section 8: log the safe amount
      amountMinor: toMinorUnits(safeAmount, invoice.currency),
      // Section 9
      newStatus,
      prevStatus,
      actorId,
      requestId
    }, "[paymentApplicationService] Payment applied");

    // ── Ledger entry (post-commit, non-blocking) ────────────────────────────────────
    setImmediate(async () => {
      try {
        await writeLedgerEntry({
          eventType: newStatus === "paid" ? "payment.succeeded" : "payment.partial",
          organizationId: invoice.organizationId,
          contractId: invoice.contractId,
          invoiceId: invoice._id,
          paymentAttemptId: payment._id,
          provider: provider || "manual",
          amount: safeAmount,
          // Section 9: always store minor units in ledger for precision
          amountMinor: toMinorUnits(safeAmount, invoice.currency),
          currency: invoice.currency,
          source: "paymentApplication",
          actorType: actorId ? "user" : "system",
          metadata: {
            method,
            transactionRef,
            actorId,
            requestId,
            previousStatus: prevStatus,
            newStatus,
            amountPaid: invoice.amountPaid,
            amountPaidMinor: toMinorUnits(invoice.amountPaid, invoice.currency),
            totalAmount: invoice.totalAmount,
            totalAmountMinor: toMinorUnits(invoice.totalAmount, invoice.currency)
          }
        });
      } catch (e) {
        logger.error({
          err: e
        }, "[paymentApplicationService] Ledger write failed (non-fatal)");
      }
    });

    // ── Timeline (non-blocking) ───────────────────────────────────────────
    setImmediate(async () => {
      try {
        await emitBillingTimelineEvent({
          organizationId: invoice.organizationId,
          contractId: invoice.contractId,
          invoiceId: invoice._id,
          eventType: newStatus === "paid" ? "INVOICE_PAID" : "PAYMENT_PARTIAL",
          source: "user",
          payload: {
            amount,
            method,
            transactionRef,
            amountPaid: invoice.amountPaid,
            totalAmount: invoice.totalAmount
          }
        });
      } catch (e) {
        logger.error({
          err: e
        }, "[paymentApplicationService] Timeline emit failed (non-fatal)");
      }
    });

    // v23.0: Emit EventBus domain event when invoice is fully paid
    if (newStatus === "paid") {
      setImmediate(() => {
        try {
          const eventBus = require("@core/eventBus");
          const Events = require("@core/domainEvents");
          eventBus.emit(Events.PLATFORM_INVOICE_PAID, {
            organizationId: invoice.organizationId,
            invoiceId: invoice._id,
            contractId: invoice.contractId,
            amount: safeAmount,
            currency: invoice.currency,
            method,
            actorId
          }, "paymentApplicationService");
        } catch (e) {
          logger.error({
            err: e
          }, "[paymentApplicationService] EventBus PLATFORM_INVOICE_PAID emit failed (non-fatal)");
        }
      });
    }

    // ── If fully paid → activate or reactivate contract ──────────────────
    // Section 4 (invoice-first): pending_payment → active on payment
    // Section 4 (dunning): suspended → active on payment
    if (newStatus === "paid" && activateContract) {
      setImmediate(async () => {
        try {
          const contract = await OrgContract.findById(invoice.contractId);
          if (!contract) return;
          if (contract.contractStatus === "pending_payment") {
            // ── Primary invoice-first path: pending_payment → active ────────
            // Call the full activateContract service (handles supersession,
            // entitlements, org.currentContractId update).
            await activateContract(String(contract._id), String(invoice._id),
            // invoice is now paid — INVOICE_NOT_PAID guard will pass
            {
              activatedBy: actorId || null,
              correlationId: requestId || null
              // No external session — this runs post-commit in setImmediate
            });
            logger.info({
              contractId: String(contract._id),
              invoiceId: String(invoice._id),
              actorId
            }, "[paymentApplicationService] pending_payment contract activated after payment");
            await writeLedgerEntry({
              eventType: "contract.activated",
              organizationId: invoice.organizationId,
              contractId: invoice.contractId,
              invoiceId: invoice._id,
              paymentAttemptId: payment._id,
              provider: provider || "manual",
              amount: 0,
              currency: invoice.currency,
              source: "paymentApplication",
              actorType: actorId ? "user" : "system",
              metadata: {
                reason: "Invoice-first activation: contract activated after invoice paid",
                activationPath: "pending_payment",
                actorId,
                requestId
              }
            });
          } else if (contract.contractStatus === "suspended") {
            // ── PHASE 4 — PAY-002 fix: Route suspended reactivation through
            // full activation pipeline (entitlements, org pointer, timeline) ──
            // skipInvoiceCheck=true: payment already verified above.
            await activateContract(String(contract._id), String(invoice._id), {
              activatedBy: actorId || null,
              correlationId: requestId || null,
              skipInvoiceCheck: true // payment was already committed
            });
            logger.info({
              contractId: String(contract._id),
              invoiceId: String(invoice._id)
            }, "[paymentApplicationService] Suspended contract reactivated via full activation pipeline");
            await writeLedgerEntry({
              eventType: "contract.activated",
              organizationId: invoice.organizationId,
              contractId: invoice.contractId,
              invoiceId: invoice._id,
              paymentAttemptId: payment._id,
              provider: "internal",
              amount: 0,
              currency: invoice.currency,
              source: "paymentApplication",
              actorType: "system",
              metadata: {
                reason: "Suspended contract reactivated after payment received (full pipeline)",
                activationPath: "suspended",
                requestId
              }
            });
          }
        } catch (e) {
          logger.error({
            err: e,
            contractId: invoice.contractId,
            invoiceId: invoice._id
          }, "[paymentApplicationService] Contract activation after payment failed (non-fatal)");
        }
      });
    }
    return {
      invoice: invoice.toObject(),
      payment: payment.toObject()
    };
  } catch (err) {
    if (ownsSession) {
      try {
        await session.abortTransaction();
      } catch {/* ignore abort error */}
    }
    throw err;
  } finally {
    if (ownsSession) session.endSession();
  }
}

/**
 * refundPayment
 * Refunds a captured PaymentAttempt.
 * Reverses amountPaid on the invoice and recomputes invoice status.
 *
 * INVARIANT: Ledger is append-only — a new "payment.refunded" entry is created.
 *
 * @param {object} opts
 * @param {string|ObjectId} opts.paymentId
 * @param {string}          [opts.reason]
 * @param {string|ObjectId} [opts.actorId]
 * @param {string}          [opts.requestId]
 *
 * @returns {Promise<{invoice: object, payment: object}>}
 */
async function refundPayment({
  paymentId,
  reason = "",
  actorId = null,
  requestId = null
}) {
  if (!paymentId) throw Object.assign(new Error("paymentId is required"), {
    statusCode: 400
  });
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const payment = await PaymentAttempt.findById(paymentId).session(session);
    if (!payment) {
      throw Object.assign(new Error("Payment not found"), {
        statusCode: 404
      });
    }
    if (payment.status === "refunded") {
      throw Object.assign(new Error("Payment has already been refunded"), {
        statusCode: 409,
        code: "ALREADY_REFUNDED"
      });
    }
    if (payment.status !== "captured") {
      throw Object.assign(new Error(`Payment in status "${payment.status}" cannot be refunded. Only captured payments can be refunded.`), {
        statusCode: 409,
        code: "NOT_REFUNDABLE"
      });
    }

    // Mark payment as refunded
    payment.status = "refunded";
    payment.metadata = {
      ...payment.metadata,
      refundReason: reason,
      refundedBy: actorId,
      refundedAt: new Date()
    };
    await payment.save({
      session
    });

    // Update invoice amountPaid
    const invoice = await PlatformInvoice.findById(payment.invoiceId).session(session);
    if (!invoice) {
      throw Object.assign(new Error("Associated invoice not found"), {
        statusCode: 404
      });
    }
    const prevStatus = invoice.status;
    invoice.amountPaid = Math.max(0, (invoice.amountPaid || 0) - payment.amount);
    invoice.amountRemaining = Math.max(0, invoice.totalAmount - invoice.amountPaid);

    // Recompute status
    const newStatus = _computeInvoiceStatus(invoice.amountPaid, invoice.totalAmount, invoice.status);
    // Special case: fully refunded invoice goes back to "open"
    invoice.status = invoice.amountPaid <= 0 ? "open" : newStatus;
    if (invoice.status !== "paid") {
      invoice.paidAt = null;
    }
    invoice.paymentStatus = invoice.amountPaid <= 0 ? "refunded" : "partially_refunded";
    await invoice.save({
      session
    });
    await session.commitTransaction();
    logger.info({
      paymentId: payment._id,
      invoiceId: invoice._id,
      amount: payment.amount,
      prevStatus,
      newStatus: invoice.status,
      actorId
    }, "[paymentApplicationService] Payment refunded");

    // ── Ledger entry ──────────────────────────────────────────────────────
    setImmediate(async () => {
      try {
        await writeLedgerEntry({
          eventType: "payment.refunded",
          // v21.0: explicit event type
          organizationId: invoice.organizationId,
          contractId: invoice.contractId,
          invoiceId: invoice._id,
          paymentAttemptId: payment._id,
          // v21.0: traceability
          provider: payment.provider || "manual",
          amount: payment.amount,
          currency: invoice.currency,
          source: "paymentApplication",
          // v21.0: correct source
          actorType: actorId ? "user" : "system",
          metadata: {
            refundReason: reason,
            actorId,
            requestId,
            previousStatus: prevStatus,
            newInvoiceStatus: invoice.status,
            amountPaid: invoice.amountPaid
          }
        });
      } catch (e) {
        logger.error({
          err: e
        }, "[paymentApplicationService] Refund ledger write failed (non-fatal)");
      }
    });
    return {
      invoice: invoice.toObject(),
      payment: payment.toObject()
    };
  } catch (err) {
    try {
      await session.abortTransaction();
    } catch {/* ignore */}
    throw err;
  } finally {
    session.endSession();
  }
}
module.exports = {
  applyPayment,
  refundPayment
};