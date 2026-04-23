/**
 * wallet.routes.js
 * Billing Domain — Patient Wallet Routes
 *
 * Mounted at: /api/v1/org/wallet
 * Guards: orgProtect → organizationContext → requireEntitlement → requireOrgPermission → policyMiddleware → autoAudit
 *
 * PLANE ISOLATION:
 * This is ORG-PLANE patient wallet operations.
 *
 * Phase P0.3 — Full wallet service with idempotency + journal + outbox.
 */

"use strict";

const express = require("express");
const router = express.Router();
const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const {
  P
} = require("@rbac/orgPermissions");
const policyMiddleware = require("@rbac/policyMiddleware");
const {
  fieldFilterMiddleware
} = require("@rbac/fieldFilter");
const requireEntitlement = require("@middleware/requireEntitlement");
const {
  autoAudit
} = require("@middleware/auditInterceptor");
const validate = require("@middleware/validate");
const walletService = require("../organizationFinance/services/patientWallet.service");
const {
  creditWalletSchema,
  debitWalletSchema
} = require("../validators/wallet.validator");
const {
  checkPatientOwnership
} = require("../../patientDomain/access/patientOwnership.guard");
const logger = require("@utils/logger");

// ─── Error handler ──────────────────────────────────────────────────────────
function sendWalletError(res, err, fallbackCode) {
  const status = err.statusCode || err.status || 400;
  return res.status(status).json({
    success: false,
    error: {
      code: err.code || fallbackCode,
      message: err.message,
      availableBalance: err.availableBalance ?? undefined
    }
  });
}

// ─── Middleware stack ────────────────────────────────────────────────────────
router.use(orgProtect, organizationContext, requireEntitlement("finance"), autoAudit("Wallet"));

/**
 * @swagger
 * /wallet/credit:
 *   post:
 *     summary: Credit a patient's wallet (add prepaid funds)
 *     tags: [Patient Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, branchId, amount, reason, idempotencyKey]
 *             properties:
 *               patientId: { type: string }
 *               branchId: { type: string }
 *               amount: { type: number, minimum: 0.01 }
 *               reason: { type: string }
 *               idempotencyKey: { type: string }
 *     responses:
 *       201:
 *         description: Wallet credited
 *       400:
 *         description: Validation error
 */
router.post("/credit", requireOrgPermission(P.PAYMENTS_CREATE), policyMiddleware(P.PAYMENTS_CREATE), validate(creditWalletSchema), async (req, res) => {
  try {
    // Ownership: verify actor has branch access to this patient
    await checkPatientOwnership({
      patientId: req.body.patientId,
      userId: req.context.userId,
      req
    });
    const txn = await walletService.creditWallet({
      ...req.body,
      processedByUserId: req.user._id
    }, req);
    logger.info({
      patientId: req.body.patientId,
      amount: req.body.amount
    }, "[WalletRoutes] Credit recorded");
    return res.status(201).json({
      success: true,
      data: txn
    });
  } catch (err) {
    return sendWalletError(res, err, "WALLET_CREDIT_ERROR");
  }
});

/**
 * @swagger
 * /wallet/debit:
 *   post:
 *     summary: Debit a patient's wallet (use prepaid funds)
 *     tags: [Patient Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, branchId, amount, reason, idempotencyKey]
 *             properties:
 *               patientId: { type: string }
 *               branchId: { type: string }
 *               amount: { type: number, minimum: 0.01 }
 *               invoiceId: { type: string }
 *               reason: { type: string }
 *               idempotencyKey: { type: string }
 *     responses:
 *       201:
 *         description: Wallet debited
 *       400:
 *         description: Insufficient balance or validation error
 */
router.post("/debit", requireOrgPermission(P.PAYMENTS_CREATE), policyMiddleware(P.PAYMENTS_CREATE), validate(debitWalletSchema), async (req, res) => {
  try {
    await checkPatientOwnership({
      patientId: req.body.patientId,
      userId: req.context.userId,
      req
    });
    const txn = await walletService.debitWallet({
      ...req.body,
      processedByUserId: req.user._id
    }, req);
    logger.info({
      patientId: req.body.patientId,
      amount: req.body.amount
    }, "[WalletRoutes] Debit recorded");
    return res.status(201).json({
      success: true,
      data: txn
    });
  } catch (err) {
    return sendWalletError(res, err, "WALLET_DEBIT_ERROR");
  }
});

/**
 * @swagger
 * /wallet/{patientId}/balance:
 *   get:
 *     summary: Get patient wallet balance
 *     tags: [Patient Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Current wallet balance
 */
router.get("/:patientId/balance", requireOrgPermission(P.PAYMENTS_READ), fieldFilterMiddleware("payment"), async (req, res) => {
  try {
    const balance = await walletService.getBalance({
      patientId: req.params.patientId
    }, req);
    return res.json({
      success: true,
      data: balance
    });
  } catch (err) {
    return sendWalletError(res, err, "BALANCE_ERROR");
  }
});

/**
 * @swagger
 * /wallet/{patientId}/transactions:
 *   get:
 *     summary: Get patient wallet transaction history
 *     tags: [Patient Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated transaction history
 */
router.get("/:patientId/transactions", requireOrgPermission(P.PAYMENTS_READ), fieldFilterMiddleware("payment"), async (req, res) => {
  try {
    const result = await walletService.getTransactions({
      patientId: req.params.patientId,
      page: req.query.page,
      limit: req.query.limit
    }, req);
    return res.json({
      success: true,
      ...result
    });
  } catch (err) {
    return sendWalletError(res, err, "TRANSACTIONS_ERROR");
  }
});
module.exports = router;