/**
 * payments.routes.js
 * Billing Domain — Patient Payment Routes
 *
 * Wraps the existing FinancialOrchestrator and FinancialReadService.
 *
 * Mounted at: /api/v1/org/payments
 * Guards: orgProtect → organizationContext → subscriptionGuard → requireEntitlement → requireOrgPermission → policyMiddleware → fieldFilterMiddleware
 * LOCATION: billingDomain/routes/ (Phase G restructure)
 *
 * PLANE ISOLATION:
 * This is ORG-PLANE patient payments — NOT platform subscription payments.
 */

"use strict";

const express = require("express");
const router = express.Router();

const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const { P } = require("@rbac/orgPermissions");
const policyMiddleware = require("@rbac/policyMiddleware");
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");
const { fieldWriteGuardMiddleware } = require("@rbac/fieldWriteGuard");

const financialOrchestrator = require("../organizationFinance/services/ledger.orchestrator.service");
const financialReadService = require("../organizationFinance/services/clinicLedger.service");
const logger = require("@utils/logger");

const validate = require("@middleware/validate");
const { createPaymentSchema } = require("../validators/payment.validator");  // billingDomain/validators/

const requireEntitlement = require("@middleware/requireEntitlement");

// Phase X.2.2 — subscriptionGuard removed (requireEntitlement in moduleLoader is SSOT).
router.use(orgProtect, organizationContext, requireEntitlement("finance"));

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: List patient payments (scoped by org)
 *     tags: [Patient Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *       - in: query
 *         name: invoiceId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated payment list
 */
router.get("/", requireOrgPermission(P.PAYMENTS_READ), fieldFilterMiddleware("payment"), async (req, res) => {
    try {
        const { patientId, invoiceId } = req.query;
        const filter = {};
        if (patientId) filter.patientId = patientId;
        if (invoiceId) filter.invoiceId = invoiceId;

        const payments = await financialReadService.listPayments(req, filter, {
            limit: Math.min(parseInt(req.query.limit) || 50, 100),
            skip: ((parseInt(req.query.page) || 1) - 1) * (parseInt(req.query.limit) || 50)
        });

        return res.json({ success: true, data: payments });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: "LIST_ERROR", message: err.message } });
    }
});

/**
 * @swagger
 * /payments/{id}:
 *   get:
 *     summary: Get payment by ID
 *     tags: [Patient Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Payment details
 *       404:
 *         description: Payment not found
 */
router.get("/:id", requireOrgPermission(P.PAYMENTS_READ), fieldFilterMiddleware("payment"), async (req, res) => {
    try {
        const payment = await financialReadService.getPaymentById(req, req.params.id);
        if (!payment) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Payment not found" } });
        return res.json({ success: true, data: payment });
    } catch (err) {
        return res.status(500).json({ success: false, error: { code: "GET_ERROR", message: err.message } });
    }
});

/**
 * @swagger
 * /payments:
 *   post:
 *     summary: Record a patient payment (auto-allocates to invoice if provided)
 *     tags: [Patient Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, branchId, amount, paymentMethod]
 *             properties:
 *               patientId: { type: string }
 *               branchId: { type: string }
 *               invoiceId: { type: string, description: "If provided, auto-allocates payment" }
 *               amount: { type: number }
 *               paymentMethod: { type: string, enum: [cash, card, bank_transfer, insurance] }
 *               expectedVersion: { type: integer, description: "Required when invoiceId provided" }
 *     responses:
 *       201:
 *         description: Payment recorded + invoice status updated
 *       400:
 *         description: Validation error
 *       409:
 *         description: Version conflict on invoice
 */
router.post("/", requireOrgPermission(P.PAYMENTS_CREATE), policyMiddleware(P.PAYMENTS_CREATE), fieldWriteGuardMiddleware("payment"), validate(createPaymentSchema), async (req, res) => {
    try {
        const payment = await financialOrchestrator.recordPayment({
            organizationId: req.organizationId,
            ...req.body,
            collectedByUserId: req.user._id
        }, req);

        logger.info(`[Payments] Payment recorded: ${payment.amount} for org ${req.organizationId}`);
        return res.status(201).json({ success: true, data: payment });
    } catch (err) {
        const statusCode = err.name === "VersionConflictError" ? 409 : (err.statusCode || 400);
        return res.status(statusCode).json({ success: false, error: { code: "PAYMENT_ERROR", message: err.message } });
    }
});

module.exports = router;
