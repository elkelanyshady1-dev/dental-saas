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
const { deriveStatusFromAmounts } = require("../organizationFinance/services/invoiceStatus.service");
const eventBus = require("@core/eventBus");
const { PAYMENT_REFUNDED, FINANCIAL_SNAPSHOT_REQUESTED } = require("@core/domainEvents");
const outboxService = require("@core/outbox/outbox.service");

const Money = require("@utils/money");
const logger = require("@utils/logger");
const { v4: uuidv4 } = require("uuid");

// ─── Strict Per-Org Model Resolvers (Phase 3.3) ─────────────────────────────
function _getSecure(connection, def) {
    if (!connection) throw new Error("[RefundService] connection is REQUIRED — per-org mode does not allow fallback");
    return getModel(connection, def);
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
async function processRefund({ organizationId, paymentId, amount, reason, processedByUserId }, req) {
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
            _id: paymentId,
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
        const previousRefunds = await Refund.aggregate([
            { $match: { paymentId: payment._id } },
            { $group: { _id: null, totalMinor: { $sum: "$amountMinor" }, count: { $sum: 1 } } },
        ]).session(session);

        const previouslyRefundedMinor = previousRefunds.length > 0 ? previousRefunds[0].totalMinor : 0;
        const previousRefundCount = previousRefunds.length > 0 ? previousRefunds[0].count : 0;
        const remainingMinor = paymentMinor - previouslyRefundedMinor;

        if (refundMoney.amountMinor > remainingMinor) {
            const alreadyRefunded = (previouslyRefundedMinor / 100).toFixed(2);
            const remaining = (remainingMinor / 100).toFixed(2);
            throw new Error(
                `Refund amount (${amount}) exceeds remaining refundable amount (${remaining}). ` +
                `Already refunded: ${alreadyRefunded} of ${payment.amount}.`
            );
        }

        const refundNumber = previousRefundCount + 1;
        const isFullRefund = (previouslyRefundedMinor + refundMoney.amountMinor) >= paymentMinor;

        // ─── STEP 2: Reverse the Payment Allocation ────────────────

        if (payment.invoiceId) {
            // INV-21: Bootstrap query uses getModel(req.dbConnection, Def)
            const allocation = await PaymentAllocation.findOne({
                paymentId: payment._id,
            }).session(session);

            if (allocation) {
                // Reduce the allocated amount
                allocation.allocatedAmount -= refundMoney.toDecimal();
                allocation.allocatedAmountMinor = (allocation.allocatedAmountMinor || 0) - refundMoney.amountMinor;
                await allocation.save({ session });
            }
        }

        // ─── STEP 3: Update Invoice Balance ────────────────────────

        if (payment.invoiceId) {
            // INV-21: Bootstrap query uses getModel(req.dbConnection, Def)
            const invoice = await PatientInvoice.findOne({
                _id: payment.invoiceId,
            }).session(session);

            if (invoice) {
                // Increase outstanding amount (reverse the payment)
                invoice.paidAmount = (invoice.paidAmount || 0) - refundMoney.toDecimal();
                invoice.paidAmountMinor = (invoice.paidAmountMinor || 0) - refundMoney.amountMinor;

                // Re-derive invoice status
                invoice.status = deriveStatusFromAmounts(
                    invoice.totalAmountMinor || invoice.totalAmount * 100,
                    invoice.paidAmountMinor || invoice.paidAmount * 100,
                    invoice.status === "voided"
                );

                invoice.version = (invoice.version || 0) + 1;
                await invoice.save({ session });
            }
        }

        // ─── STEP 4: Update Payment Status ─────────────────────────

        payment.status = isFullRefund ? "refunded" : "partially_refunded";
        payment.version = (payment.version || 0) + 1;
        await payment.save({ session });

        // ─── STEP 5: Create Refund Record ──────────────────────────

        const [refund] = await Refund.create(
            [
                {
                    organizationId,
                    branchId: payment.branchId,
                    patientId: payment.patientId,
                    paymentId: payment._id,
                    invoiceId: payment.invoiceId,
                    amount: refundMoney.toDecimal(),
                    amountMinor: refundMoney.amountMinor,
                    currency,
                    refundNumber,
                    reason,
                    processedByUserId,
                },
            ],
            { session }
        );

        // ─── STEP 6: Create Financial Ledger Entry ─────────────────

        const FinancialLedger = _getSecure(connection, FinancialLedgerDef);
        await FinancialLedger.create(
            [
                {
                    organizationId,
                    patientId: payment.patientId,
                    type: "PAYMENT_REFUNDED",
                    amount: refundMoney.toDecimal(),
                    amountMinor: refundMoney.amountMinor,
                    currency,
                    referenceId: refund._id,
                    branchId: payment.branchId,
                    performedByUserId: processedByUserId,
                },
            ],
            { session }
        );

        // ─── STEP 7: Double-Entry Journal (DR Refunds / CR Cash) ───

        try {
            await journalService.recordRefundEntry(refund, session, connection);
        } catch (journalErr) {
            logger.error(
                { err: journalErr, refundId: refund._id },
                "[RefundService] Journal entry failed for refund — queued for retry"
            );
            await journalRetryService.enqueue({
                organizationId,
                referenceType: "refund",
                referenceId: refund._id,
                payload: { refundId: refund._id },
                error: journalErr,
            });
        }

        // ─── STEP 8: Enqueue Events in Outbox (INSIDE transaction) ──

        const refundEventPayload = {
            eventId: uuidv4(),
            organizationId,
            refundId: refund._id,
            paymentId: payment._id,
            invoiceId: payment.invoiceId,
            patientId: payment.patientId,
            amount: refundMoney.toDecimal(),
            amountMinor: refundMoney.amountMinor,
            currency,
            timestamp: new Date(),
        };

        await outboxService.enqueue({
            organizationId,
            eventType: PAYMENT_REFUNDED,
            aggregateType: "refund",
            aggregateId: refund._id,
            payload: refundEventPayload,
        }, session);

        const snapshotPayload = {
            eventId: uuidv4(),
            organizationId,
            patientId: payment.patientId,
            trigger: "PAYMENT_REFUNDED",
        };

        await outboxService.enqueue({
            organizationId,
            eventType: FINANCIAL_SNAPSHOT_REQUESTED,
            aggregateType: "snapshot",
            aggregateId: refund._id,
            payload: snapshotPayload,
        }, session);

        // ─── STEP 9: Commit ─────────────────────────────────────────

        await session.commitTransaction();

        // Immediate emit for low-latency (outbox worker is backup guarantee)
        eventBus.emit(PAYMENT_REFUNDED, refundEventPayload);
        eventBus.emit(FINANCIAL_SNAPSHOT_REQUESTED, snapshotPayload);

        logger.info(
            {
                refundId: refund._id,
                paymentId: payment._id,
                amount: refundMoney.toDecimal(),
                organizationId,
            },
            "[RefundService] ✅ Refund processed successfully"
        );

        return refund;
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
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
async function getRefunds({ organizationId, patientId, limit = 50, skip = 0 }, req) {

    const connection = req?.dbConnection || null;
    const Refund = _getSecure(connection, RefundDef);

    const query = {};
    if (patientId) query.patientId = patientId;

    return Refund.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("paymentId", "amount paymentMethod")
        .populate("processedByUserId", "firstName lastName")
        .lean();
}

module.exports = {
    processRefund,
    getRefunds,
};
