/**
 * invoiceAction.controller.js
 * Platform Billing — Invoice Detail + Action Endpoints
 *
 * Fills the gaps in the invoice API surface:
 *
 *   GET  /billing/invoices/:invoiceId          → getInvoice (full detail + line items)
 *   POST /billing/invoices/:invoiceId/void     → voidInvoice (draft only)
 *   POST /billing/invoices/:invoiceId/uncollectible → markUncollectible (open only)
 *   GET  /billing/invoices/:invoiceId/payments → listInvoicePayments
 *   GET  /billing/invoices/:invoiceId/public   → getPublicInvoice (unauthenticated)
 *
 * All mutations go through invoiceStateMachine.assertTransition() — no inline
 * status string comparisons anywhere in this file (Sentinel §2).
 *
 * CAPABILITY guards are enforced at the route level — this controller trusts
 * that platformProtect + requirePlatformCapability have already run.
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const PlatformInvoice = require("../models/PlatformInvoice.model").default;
const PaymentAttempt = require("../models/PaymentAttempt.model").default;
const Organization = require("@shared/models/Organization").default;
const { writeLedgerEntry } = require("../models/BillingLedger.model");
const { assertTransition, assertEditable, assertVoidable } = require("../services/invoiceStateMachine");
const { deriveInvoiceSummary, buildSyntheticLineItem } = require("../services/invoiceCalculator");
const { emitBillingTimelineEvent } = require("../services/billingTimeline.service");
const logger = require("@utils/logger");

// ─── Audit fallback ───────────────────────────────────────────────────────────
let auditLog;
try {
    auditLog = require("../../../domain/services/platformAudit.service").log;
} catch {
    auditLog = async (e) => logger.info(e, "[InvoiceAction][AuditFallback]");
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * _resolveLineItems
 * Returns the invoice's existing lineItems, or a synthetic line item for
 * legacy invoices that pre-date the itemised billing upgrade.
 * This satisfies Section 14 (data migration) — old invoices display correctly.
 */
function _resolveLineItems(invoice) {
    if (Array.isArray(invoice.lineItems) && invoice.lineItems.length > 0) {
        return invoice.lineItems;
    }
    // Legacy invoice: synthesise a single line item from totalAmount
    return [buildSyntheticLineItem(invoice)];
}

// ─── GET /billing/invoices/:invoiceId ────────────────────────────────────────

/**
 * @swagger
 * /api/platform/billing/invoices/{invoiceId}:
 *   get:
 *     summary: Get full invoice detail including line items
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Full invoice detail with line items and financial summary
 *       404:
 *         description: Invoice not found
 */
exports.getInvoice = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        if (!mongoose.isValidObjectId(invoiceId)) {
            return res.status(400).json({ success: false, error: "Invalid invoiceId" });
        }

        const invoice = await PlatformInvoice.findById(invoiceId)
            .populate("contractId", "planCode planVersionTag lockedPrice currency contractStatus")
            .populate("planVersionId", "versionTag templateCode")
            .lean();

        if (!invoice) {
            return res.status(404).json({ success: false, error: "Invoice not found" });
        }

        const organization = await Organization
            .findById(invoice.organizationId)
            .select("name billingCountry regionCode")
            .lean();

        const summary = deriveInvoiceSummary(invoice);
        const lineItems = _resolveLineItems(invoice);

        return res.json({
            success: true,
            data: {
                ...invoice,
                lineItems,
                organization: organization || null,
                summary
            },
            requestId: req.requestId
        });

    } catch (err) {
        logger.error({ err, requestId: req.requestId }, "[invoiceAction] getInvoice failed");
        return res.status(500).json({ success: false, error: "Internal server error", requestId: req.requestId });
    }
};

// ─── POST /billing/invoices/:invoiceId/void ──────────────────────────────────

/**
 * @swagger
 * /api/platform/billing/invoices/{invoiceId}/void:
 *   post:
 *     summary: Void an invoice (DRAFT only)
 *     description: >
 *       Marks a DRAFT invoice as VOID. Only draft invoices may be voided through
 *       this endpoint. An open invoice with captured payment cannot be voided —
 *       issue a refund first.
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: invoiceId
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
 *                 description: Optional reason for voiding
 *     responses:
 *       200:
 *         description: Invoice voided
 *       409:
 *         description: Invoice not in a voidable state
 *       404:
 *         description: Invoice not found
 */
exports.voidInvoice = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const actorId = req.platformUser?._id;
        const { reason = "" } = req.body;

        if (!mongoose.isValidObjectId(invoiceId)) {
            return res.status(400).json({ success: false, error: "Invalid invoiceId" });
        }

        const invoice = await PlatformInvoice.findById(invoiceId);
        if (!invoice) {
            return res.status(404).json({ success: false, error: "Invoice not found" });
        }

        // ── Safety Rule 4 (v22.0): Reject void if any payment has been applied ──
        // assertVoidable throws 422 CANNOT_VOID_PAID_INVOICE if amountPaid > 0
        // or 409 INVALID_INVOICE_TRANSITION if the status is not voidable.
        assertVoidable(invoice, invoiceId);

        // State machine guard — throws 409 with structured error if not allowed
        assertTransition(invoice.status, "void", invoiceId);

        const previousStatus = invoice.status;
        invoice.status = "void";
        invoice.voidedAt = new Date();
        if (reason) invoice.metadata.set("voidReason", reason);
        await invoice.save();

        logger.info(
            { invoiceId, from: previousStatus, to: "void", actorId },
            "[invoiceAction] Invoice voided"
        );

        // Ledger entry (void does not move money, so amount = 0)
        await writeLedgerEntry({
            eventType: "invoice.voided",
            organizationId: invoice.organizationId,
            contractId: invoice.contractId,
            invoiceId: invoice._id,
            provider: "internal",
            amount: 0,
            currency: invoice.currency,
            source: "manualAdjustment",
            actorType: "user",
            metadata: { previousStatus, voidReason: reason || null, actorId }
        });

        // Timeline (non-blocking)
        setImmediate(async () => {
            await emitBillingTimelineEvent({
                organizationId: invoice.organizationId,
                contractId: invoice.contractId,
                invoiceId: invoice._id,
                eventType: "INVOICE_VOIDED",
                source: "user",
                payload: { previousStatus, voidReason: reason || null, actorId }
            });
        });

        // Audit
        setImmediate(async () => {
            try {
                await auditLog({
                    action: "INVOICE_VOIDED",
                    organizationId: invoice.organizationId,
                    actorId,
                    metadata: {
                        invoiceId: invoice._id,
                        invoiceNumber: invoice.invoiceNumber,
                        previousStatus,
                        voidReason: reason || null
                    }
                });
            } catch (e) {
                logger.error({ err: e }, "[invoiceAction] Audit log failed (non-fatal)");
            }
        });

        return res.json({
            success: true,
            data: invoice,
            message: `Invoice ${invoice.invoiceNumber || invoiceId} voided.`
        });

    } catch (err) {
        if (err.code === "CANNOT_VOID_PAID_INVOICE") {
            return res.status(422).json({
                success: false,
                error: { code: err.code, message: err.message, amountPaid: err.amountPaid }
            });
        }
        if (err.code === "INVALID_INVOICE_TRANSITION") {
            return res.status(err.status || 409).json({
                success: false,
                error: { code: err.code, message: err.message }
            });
        }
        logger.error({ err, requestId: req.requestId }, "[invoiceAction] voidInvoice failed");
        return res.status(500).json({ success: false, error: "Internal server error", requestId: req.requestId });
    }
};


// ─── POST /billing/invoices/:invoiceId/uncollectible ─────────────────────────

/**
 * @swagger
 * /api/platform/billing/invoices/{invoiceId}/uncollectible:
 *   post:
 *     summary: Mark an open invoice as uncollectible (after dunning exhausted)
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: invoiceId
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
 *         description: Invoice marked uncollectible
 *       409:
 *         description: Invoice not in a state that allows this transition
 */
exports.markUncollectible = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const actorId = req.platformUser?._id;
        const { reason = "" } = req.body;

        if (!mongoose.isValidObjectId(invoiceId)) {
            return res.status(400).json({ success: false, error: "Invalid invoiceId" });
        }

        const invoice = await PlatformInvoice.findById(invoiceId);
        if (!invoice) {
            return res.status(404).json({ success: false, error: "Invoice not found" });
        }

        assertTransition(invoice.status, "uncollectible", invoiceId);

        const previousStatus = invoice.status;
        invoice.status = "uncollectible";
        invoice.paymentStatus = "failed";
        if (reason) invoice.metadata.set("uncollectibleReason", reason);
        await invoice.save();

        logger.info(
            { invoiceId, from: previousStatus, to: "uncollectible", actorId },
            "[invoiceAction] Invoice marked uncollectible"
        );

        setImmediate(async () => {
            await emitBillingTimelineEvent({
                organizationId: invoice.organizationId,
                contractId: invoice.contractId,
                invoiceId: invoice._id,
                eventType: "INVOICE_UNCOLLECTIBLE",
                source: "user",
                payload: { previousStatus, reason: reason || null, actorId }
            });
        });

        return res.json({
            success: true,
            data: invoice,
            message: `Invoice ${invoice.invoiceNumber || invoiceId} marked as uncollectible.`
        });

    } catch (err) {
        if (err.code === "INVALID_INVOICE_TRANSITION") {
            return res.status(err.status || 409).json({
                success: false,
                error: { code: err.code, message: err.message }
            });
        }
        logger.error({ err, requestId: req.requestId }, "[invoiceAction] markUncollectible failed");
        return res.status(500).json({ success: false, error: "Internal server error", requestId: req.requestId });
    }
};

/**
 * applyPayment
 * POST /billing/invoices/:invoiceId/pay
 *
 * Delegates to paymentApplicationService.applyPayment — the canonical
 * payment engine with atomic DB transaction, idempotency, and ledger write.
 *
 * Replaces the old pattern of calling the engine ad-hoc from BillingTab.
 * Guard: MANAGE_SUBSCRIPTIONS (applied at route level).
 *
 * @swagger
 * /api/platform/billing/invoices/{invoiceId}/pay:
 *   post:
 *     summary: Apply a manual payment to an invoice
 *     description: >
 *       Records a captured payment against the given invoice.
 *       Updates amountPaid, amountRemaining, invoice status, and writes a
 *       BillingLedger entry (payment.succeeded or payment.partial).
 *       Idempotent when called with the same idempotencyKey.
 *       Required capability: MANAGE_SUBSCRIPTIONS.
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
 *                 description: Decimal amount to apply (e.g. 3647.09)
 *                 example: 3647.09
 *               method:
 *                 type: string
 *                 enum: [manual, cash, bank, card]
 *                 default: manual
 *               provider:
 *                 type: string
 *                 enum: [manual, stripe, paymob, paypal]
 *                 default: manual
 *               transactionRef:
 *                 type: string
 *                 description: Optional external transaction reference
 *               idempotencyKey:
 *                 type: string
 *                 description: Client-supplied idempotency key (prevents double-submit)
 *     responses:
 *       200:
 *         description: Payment applied — returns updated invoice and payment record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoice:
 *                       type: object
 *                     payment:
 *                       type: object
 *                 amountDue:
 *                   type: number
 *                   description: Remaining balance after this payment (2dp)
 *                 status:
 *                   type: string
 *                   description: New invoice status after payment
 *       400:
 *         description: Invalid invoiceId or missing/non-positive amount
 *       404:
 *         description: Invoice not found
 *       409:
 *         description: Invoice not in a payable state (INVOICE_NOT_PAYABLE)
 *       422:
 *         description: Payment exceeds remaining balance (PAYMENT_EXCEEDS_BALANCE)
 */
exports.applyPayment = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const actorId = req.platformUser?._id?.toString();
        const requestId = req.requestId;

        if (!mongoose.isValidObjectId(invoiceId)) {
            return res.status(400).json({ success: false, error: "Invalid invoiceId" });
        }

        const { amount, method, provider, transactionRef, idempotencyKey } = req.body;

        if (!amount || isNaN(amount) || Number(amount) <= 0) {
            return res.status(400).json({
                success: false,
                error: "amount must be a positive number"
            });
        }

        // Lazy-load to avoid circular dependency at module init
        const { applyPayment } = require("../services/paymentApplicationService");

        const result = await applyPayment({
            invoiceId,
            amount: Number(amount),
            method: method || "manual",
            provider: provider || "manual",
            transactionRef: transactionRef || null,
            actorId,
            idempotencyKey: idempotencyKey || null,
            requestId
        });

        logger.info(
            { invoiceId, amount, actorId, requestId, newStatus: result.invoice.status },
            "[invoiceAction] billing.payment.succeeded — manual payment applied"
        );

        return res.json({
            success: true,
            data: result,
            status: result.invoice.status,
            amountDue: result.invoice.amountRemaining ?? 0,
            message: result.invoice.status === "paid"
                ? "Invoice fully paid"
                : `Partial payment applied — remaining: ${(result.invoice.amountRemaining ?? 0).toFixed(2)} ${result.invoice.currency}`
        });

    } catch (err) {
        // Structured error codes from paymentApplicationService
        if (err.code === "PAYMENT_EXCEEDS_BALANCE") {
            return res.status(422).json({ success: false, error: { code: err.code, message: err.message } });
        }
        if (err.code === "INVOICE_NOT_PAYABLE") {
            return res.status(409).json({ success: false, error: { code: err.code, message: err.message } });
        }
        if (err.statusCode === 400 || err.statusCode === 404) {
            return res.status(err.statusCode).json({ success: false, error: err.message });
        }
        logger.error({ err, requestId: req.requestId }, "[invoiceAction] applyPayment failed");
        return res.status(500).json({ success: false, error: "Internal server error", requestId: req.requestId });
    }
};


// ─── GET /billing/invoices/:invoiceId/payments ───────────────────────────────

/**
 * @swagger
 * /api/platform/billing/invoices/{invoiceId}/payments:
 *   get:
 *     summary: List all payment attempts for a specific invoice
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Payment attempt list for this invoice
 *       404:
 *         description: Invoice not found
 */
exports.listInvoicePayments = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        if (!mongoose.isValidObjectId(invoiceId)) {
            return res.status(400).json({ success: false, error: "Invalid invoiceId" });
        }

        // Verify invoice exists
        const invoiceExists = await PlatformInvoice.exists({ _id: invoiceId });
        if (!invoiceExists) {
            return res.status(404).json({ success: false, error: "Invoice not found" });
        }

        const payments = await PaymentAttempt
            .find({ invoiceId: new mongoose.Types.ObjectId(invoiceId) })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        return res.json({
            success: true,
            data: payments,
            total: payments.length,
            requestId: req.requestId
        });

    } catch (err) {
        logger.error({ err, requestId: req.requestId }, "[invoiceAction] listInvoicePayments failed");
        return res.status(500).json({ success: false, error: "Internal server error", requestId: req.requestId });
    }
};

// ─── GET /billing/invoices/:invoiceId/public ─────────────────────────────────

/**
 * @swagger
 * /api/platform/billing/invoices/{invoiceId}/public:
 *   get:
 *     summary: Get public invoice data (no authentication required)
 *     description: >
 *       Returns a sanitised view of the invoice suitable for a hosted invoice
 *       page. Sensitive internal fields (contractId details, metadata, audit
 *       fields) are excluded. This endpoint is intentionally unauthenticated
 *       to allow customers to view their invoices via a shared link.
 *     tags: [Finance]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Public invoice view
 *       404:
 *         description: Invoice not found
 */
exports.getPublicInvoice = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        if (!mongoose.isValidObjectId(invoiceId)) {
            return res.status(400).json({ success: false, error: "Invalid invoice reference" });
        }

        const invoice = await PlatformInvoice
            .findById(invoiceId)
            .select(
                "invoiceNumber status paymentStatus currency " +
                "lineItems subtotalAmount taxPercent taxAmount totalAmount " +
                "couponCode couponDiscountAmount creditApplied " +
                "billingCycleStart billingCycleEnd dueDate paidAt createdAt " +
                "organizationId invoiceType"
            )
            .lean();

        if (!invoice) {
            return res.status(404).json({ success: false, error: "Invoice not found" });
        }

        // Only expose org name + country — never internal IDs or internal fields
        const org = await Organization
            .findById(invoice.organizationId)
            .select("name billingCountry")
            .lean();

        const lineItems = _resolveLineItems(invoice);
        const summary = deriveInvoiceSummary(invoice);

        // Build sanitised public payload
        const publicInvoice = {
            invoiceNumber: invoice.invoiceNumber || String(invoice._id).slice(-8).toUpperCase(),
            status: invoice.status,
            paymentStatus: invoice.paymentStatus,
            currency: invoice.currency,
            lineItems,
            subtotal: summary.subtotal,
            discount: summary.discount,
            creditApplied: summary.creditApplied,
            tax: summary.tax,
            total: summary.total,
            remainingAmount: summary.remainingAmount,
            billingCycleStart: invoice.billingCycleStart,
            billingCycleEnd: invoice.billingCycleEnd,
            dueDate: invoice.dueDate,
            paidAt: invoice.paidAt,
            issuedAt: invoice.createdAt,
            organization: org ? {
                name: org.name,
                billingCountry: org.billingCountry  // ISO code only — Sentinel §4
            } : null
        };

        return res.json({
            success: true,
            data: publicInvoice
        });

    } catch (err) {
        logger.error({ err }, "[invoiceAction] getPublicInvoice failed");
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};
