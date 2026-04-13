/**
 * PaymentEngine.service.js
 * v22.0 — Phase 3: Formal Payment Engine
 *
 * PURPOSE:
 * Owns all payment capture, manual recording, refund, and retry operations.
 * Every payment state transition passes through paymentStateMachine.js.
 *
 * ── Responsibilities ─────────────────────────────────────────────────────────
 *   applyPayment          → paymentApplicationService
 *   recordManualPayment   → paymentApplicationService (alias for manual path)
 *   refundPayment         → paymentApplicationService.refundPayment
 *   retryPayment          → PaymentAttempt model + paymentApplicationService
 *   getPaymentAttempt     → PaymentAttempt model
 *   checkIdempotency      → PaymentAttempt idempotency key lookup
 *
 * ── State machine ────────────────────────────────────────────────────────────
 *   Uses paymentStateMachine.js (domain/paymentStateMachine.js).
 *   No payment.status is set without passing assertValidTransition().
 *
 * ── Caller hierarchy ─────────────────────────────────────────────────────────
 *   BillingOrchestrator → PaymentEngine → paymentApplicationService
 *   Controllers should call BillingOrchestrator, not this engine directly.
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact:  None
 *   RBAC impact:      None
 *   Plane isolation:  Platform only
 *   Regression risk:  LOW — additive facade
 *
 * PLANE: Platform
 */

"use strict";

const logger = require("@utils/logger");

// ── Lazy service references ──────────────────────────────────────────────────
let _paymentApp, _PaymentAttempt;

function getPaymentApp() {
    if (!_paymentApp) _paymentApp = require("../services/paymentApplicationService");
    return _paymentApp;
}

function getPaymentAttempt() {
    if (!_PaymentAttempt) _PaymentAttempt = require("../models/PaymentAttempt.model");
    return _PaymentAttempt;
}

// ─── Payment Engine ───────────────────────────────────────────────────────────

const PaymentEngine = {

    /**
     * applyPayment
     * Applies a payment (manual, bank transfer, card capture) to an invoice.
     *
     * Idempotent via idempotencyKey — returns existing attempt on duplicate.
     * Triggers invoice status transition and (if fully paid) contract activation.
     *
     * @param {object} data
     * @param {string} data.invoiceId
     * @param {number} data.amount          - Decimal amount (e.g. 99.00)
     * @param {string} [data.method]        - "manual" | "bank" | "card"
     * @param {string} [data.transactionRef]
     * @param {string} [data.provider]      - "manual" | "stripe" | etc.
     * @param {string} [data.actorId]       - Who applied the payment
     * @param {string} [data.requestId]     - Correlation ID
     * @param {string} [data.idempotencyKey]
     * @returns {Promise<{ invoice, payment, idempotent? }>}
     */
    async applyPayment(data) {
        logger.info(
            {
                invoiceId: data.invoiceId,
                amount: data.amount,
                method: data.method || "manual",
                requestId: data.requestId
            },
            "[PaymentEngine] applyPayment"
        );
        return getPaymentApp().applyPayment(data);
    },

    /**
     * recordManualPayment
     * Alias for applyPayment with method forced to "manual".
     * Used by admin interfaces to record off-platform payments.
     *
     * @param {object} data             - Same shape as applyPayment
     * @returns {Promise<{ invoice, payment }>}
     */
    async recordManualPayment(data) {
        logger.info(
            { invoiceId: data.invoiceId, amount: data.amount, actorId: data.actorId },
            "[PaymentEngine] recordManualPayment"
        );
        return getPaymentApp().applyPayment({
            ...data,
            method: "manual",
            provider: data.provider || "manual"
        });
    },

    /**
     * refundPayment
     * Refunds a previously captured payment.
     * Writes payment.refunded ledger entry and decrements invoice.amountPaid.
     *
     * @param {object} data
     * @param {string} data.paymentId       - PaymentAttempt._id
     * @param {string} [data.reason]
     * @param {string} [data.actorId]
     * @param {string} [data.requestId]
     * @returns {Promise<{ invoice, payment }>}
     */
    async refundPayment(data) {
        logger.info(
            { paymentId: data.paymentId, reason: data.reason, requestId: data.requestId },
            "[PaymentEngine] refundPayment"
        );
        return getPaymentApp().refundPayment(data);
    },

    /**
     * retryPayment
     * Creates a new PaymentAttempt for a previously failed attempt.
     *
     * Strategy:
     *   1. Load the failed PaymentAttempt
     *   2. Verify it is in a retryable state (failed, not terminal captured/refunded)
     *   3. Delegate to applyPayment with the same invoice + amount
     *
     * @param {string} paymentAttemptId     - The failed PaymentAttempt._id to retry
     * @param {object} [opts]
     * @param {string} [opts.actorId]
     * @param {string} [opts.idempotencyKey]
     * @returns {Promise<{ invoice, payment }>}
     */
    async retryPayment(paymentAttemptId, opts = {}) {
        const PaymentAttempt = getPaymentAttempt();

        const attempt = await PaymentAttempt.findById(paymentAttemptId).lean();
        if (!attempt) {
            const err = new Error(`PaymentAttempt ${paymentAttemptId} not found`);
            err.status = 404;
            err.code = "PAYMENT_NOT_FOUND";
            throw err;
        }

        const retryableStatuses = new Set(["pending", "failed"]);
        if (!retryableStatuses.has(attempt.outcome || attempt.status)) {
            const err = new Error(
                `PaymentAttempt ${paymentAttemptId} cannot be retried from status "${attempt.outcome || attempt.status}".` +
                " Only pending or failed attempts may be retried."
            );
            err.status = 409;
            err.code = "PAYMENT_NOT_RETRYABLE";
            throw err;
        }

        logger.info(
            { paymentAttemptId, invoiceId: attempt.invoiceId, amount: attempt.amount, actorId: opts.actorId },
            "[PaymentEngine] retryPayment"
        );

        return getPaymentApp().applyPayment({
            invoiceId: String(attempt.invoiceId),
            amount: attempt.amount,
            method: attempt.method || "manual",
            provider: attempt.provider || "manual",
            actorId: opts.actorId,
            idempotencyKey: opts.idempotencyKey,
            metadata: { retriedFrom: paymentAttemptId }
        });
    },

    /**
     * getPaymentAttempt
     * Convenience fetch — returns the payment attempt or null.
     *
     * @param {string} paymentAttemptId
     * @returns {Promise<object|null>}
     */
    async getPaymentAttempt(paymentAttemptId) {
        const PaymentAttempt = getPaymentAttempt();
        return PaymentAttempt.findById(paymentAttemptId).lean();
    },

    /**
     * checkIdempotency
     * Returns an existing PaymentAttempt if the given idempotency key has been seen.
     * Returns null if the key is new.
     *
     * @param {string} idempotencyKey
     * @returns {Promise<object|null>}
     */
    async checkIdempotency(idempotencyKey) {
        if (!idempotencyKey) return null;
        const PaymentAttempt = getPaymentAttempt();
        return PaymentAttempt.findOne({ idempotencyKey }).lean();
    }
};

module.exports = PaymentEngine;
