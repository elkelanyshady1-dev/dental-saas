/**
 * contractLifecycle.controller.js
 * Platform Billing — Contract Lifecycle Action Endpoints
 * v21.0 — Full SaaS Financial Lifecycle
 *
 * Endpoints:
 *   POST /contracts/:id/suspend   → suspendContract
 *   POST /contracts/:id/void      → voidContract
 *   POST /billing/invoices/:invoiceId/pay → manualPayInvoice
 *   POST /billing/payments/:paymentId/refund → refundPayment
 *
 * CAPABILITY: MANAGE_SUBSCRIPTIONS (mutations) via route guards.
 * PLANE: Platform — no org-plane imports.
 */

"use strict";

const mongoose = require("mongoose");
const { suspendContract, voidContract } = require("../services/contractLifecycleService");
const { applyPayment, refundPayment } = require("../services/paymentApplicationService");
const logger = require("@utils/logger");

// ─── Audit fallback ───────────────────────────────────────────────────────────
let auditLog;
try {
    auditLog = require("../../../domain/services/platformAudit.service").log;
} catch {
    auditLog = async (e) => logger.info(e, "[ContractLifecycle][AuditFallback]");
}

// ─── Error handler helper ─────────────────────────────────────────────────────
function _handleError(res, err, requestId, label) {
    const statusCode = err.statusCode || err.status || 500;
    const code = err.code || "INTERNAL_ERROR";

    if (statusCode < 500) {
        return res.status(statusCode).json({
            success: false,
            error: { code, message: err.message },
            requestId
        });
    }

    logger.error({ err, requestId }, `[contractLifecycle] ${label} failed`);
    return res.status(500).json({ success: false, error: "Internal server error", requestId });
}

// ─── POST /contracts/:id/suspend ─────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/contracts/{id}/suspend:
 *   post:
 *     summary: Suspend a contract (non-payment)
 *     description: >
 *       Moves an active or grace contract to "suspended" status.
 *       The subscription remains in the system but access should be restricted
 *       by the org runtime entitlement check.
 *       Ledger event: subscription.canceled (ACTION=CONTRACT_SUSPENDED)
 *     tags: [Contracts]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Payment overdue — grace period expired"
 *     responses:
 *       200:
 *         description: Contract suspended
 *       409:
 *         description: Contract not in a suspendable state
 *       404:
 *         description: Contract not found
 */
exports.suspendContractAction = async (req, res) => {
    try {
        const { id } = req.params;
        const actorId = req.platformUser?._id;
        const { reason = "Non-payment" } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, error: "Invalid contract ID" });
        }

        const contract = await suspendContract(id, {
            reason,
            actorId,
            actorType: "user",
            requestId: req.requestId
        });

        logger.info({ contractId: id, actorId }, "[contractLifecycle] Contract suspended via API");

        setImmediate(async () => {
            try {
                await auditLog({
                    action: "CONTRACT_SUSPENDED",
                    actorId,
                    metadata: { contractId: id, reason }
                });
            } catch { /* non-fatal */ }
        });

        return res.json({
            success: true,
            data: contract,
            message: `Contract suspended. Reason: ${reason}`
        });

    } catch (err) {
        return _handleError(res, err, req.requestId, "suspendContract");
    }
};

// ─── POST /contracts/:id/void ─────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/contracts/{id}/void:
 *   post:
 *     summary: Void a contract (no paid invoices allowed)
 *     description: >
 *       Voids a contract permanently. Only allowed if zero paid invoices exist.
 *       If paid invoices exist, refund them first.
 *       Ledger event: subscription.canceled (ACTION=CONTRACT_VOIDED)
 *     tags: [Contracts]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contract voided
 *       409:
 *         description: Contract has paid invoices or is in a terminal state
 *       404:
 *         description: Contract not found
 */
exports.voidContractAction = async (req, res) => {
    try {
        const { id } = req.params;
        const actorId = req.platformUser?._id;
        const { reason = "" } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, error: "Invalid contract ID" });
        }

        const contract = await voidContract(id, {
            reason,
            actorId,
            requestId: req.requestId
        });

        logger.info({ contractId: id, actorId }, "[contractLifecycle] Contract voided via API");

        setImmediate(async () => {
            try {
                await auditLog({
                    action: "CONTRACT_VOIDED",
                    actorId,
                    metadata: { contractId: id, reason }
                });
            } catch { /* non-fatal */ }
        });

        return res.json({
            success: true,
            data: contract,
            message: `Contract voided.${reason ? ` Reason: ${reason}` : ""}`
        });

    } catch (err) {
        return _handleError(res, err, req.requestId, "voidContract");
    }
};

// ─── POST /billing/invoices/:invoiceId/pay ────────────────────────────────────

/**
 * @swagger
 * /api/platform/billing/invoices/{invoiceId}/pay:
 *   post:
 *     summary: Apply a manual payment to an invoice
 *     description: >
 *       Applies a payment to an open/partial/overdue invoice.
 *       Creates a PaymentAttempt record, updates invoice amountPaid,
 *       transitions status (open → partial → paid), and writes ledger entry.
 *       If payment completes the invoice AND contract is suspended → reactivates contract.
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 99.00
 *               method:
 *                 type: string
 *                 enum: [cash, bank, card, manual]
 *                 example: manual
 *               transactionRef:
 *                 type: string
 *               provider:
 *                 type: string
 *                 enum: [manual, stripe, paymob, paypal]
 *                 default: manual
 *     responses:
 *       200:
 *         description: Payment applied
 *       409:
 *         description: Invoice not in payable state or payment exceeds balance
 *       400:
 *         description: Invalid amount or invoiceId
 */
exports.manualPayInvoice = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const actorId = req.platformUser?._id;
        const { amount, method = "manual", transactionRef = null, provider = "manual" } = req.body;

        // v21.1: Idempotency key — prevents duplicate charges on API retries
        const idempotencyKey = req.headers["idempotency-key"] || null;

        if (!mongoose.isValidObjectId(invoiceId)) {
            return res.status(400).json({ success: false, error: "Invalid invoiceId" });
        }

        if (!amount || isNaN(amount) || Number(amount) <= 0) {
            return res.status(400).json({ success: false, error: "amount must be a positive number" });
        }

        const result = await applyPayment({
            invoiceId,
            amount: Number(amount),
            method,
            transactionRef,
            provider,
            actorId,
            requestId: req.requestId,
            idempotencyKey   // v21.1
        });

        // If this was an idempotent replay, tell the client via header
        if (result.idempotent) {
            res.set("X-Idempotent-Replayed", "true");
        }

        return res.json({
            success: true,
            data: result,
            message: `Payment of ${amount} applied. Invoice status: ${result.invoice.status}`
        });

    } catch (err) {
        return _handleError(res, err, req.requestId, "manualPayInvoice");
    }
};

// ─── POST /billing/payments/:paymentId/refund ─────────────────────────────────

/**
 * @swagger
 * /api/platform/billing/payments/{paymentId}/refund:
 *   post:
 *     summary: Refund a captured payment
 *     description: >
 *       Marks a captured PaymentAttempt as refunded.
 *       Reduces invoice.amountPaid and recomputes invoice status.
 *       Writes a ledger entry (invoice.refunded).
 *       The ledger is append-only — refund creates a new entry, never modifies existing ones.
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment refunded, invoice status updated
 *       409:
 *         description: Payment already refunded or not in captured state
 *       404:
 *         description: Payment not found
 */
exports.refundPaymentAction = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const actorId = req.platformUser?._id;
        const { reason = "" } = req.body;

        if (!mongoose.isValidObjectId(paymentId)) {
            return res.status(400).json({ success: false, error: "Invalid paymentId" });
        }

        const result = await refundPayment({
            paymentId,
            reason,
            actorId,
            requestId: req.requestId
        });

        setImmediate(async () => {
            try {
                await auditLog({
                    action: "PAYMENT_REFUNDED",
                    actorId,
                    metadata: { paymentId, reason, invoiceId: result.invoice._id }
                });
            } catch { /* non-fatal */ }
        });

        return res.json({
            success: true,
            data: result,
            message: `Payment refunded. Invoice status: ${result.invoice.status}`
        });

    } catch (err) {
        return _handleError(res, err, req.requestId, "refundPayment");
    }
};
