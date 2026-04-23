/**
 * invoices.routes.js
 * Billing Domain — Patient Invoice Routes
 *
 * Wraps the existing FinancialOrchestrator and FinancialReadService
 * with RBAC-guarded HTTP endpoints.
 *
 * Mounted at: /api/v1/org/invoices
 * Guards: orgProtect → organizationContext → subscriptionGuard → requireEntitlement → requireOrgPermission
 * LOCATION: billingDomain/routes/ (Phase G restructure)
 *
 * PLANE ISOLATION:
 * This is ORG-PLANE patient billing — NOT platform billing.
 * Platform invoices are at /api/platform/billing/*
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
const financialOrchestrator = require("../organizationFinance/services/ledger.orchestrator.service");
const financialReadService = require("../organizationFinance/services/clinicLedger.service");
const logger = require("@utils/logger");
const {
  fieldFilterMiddleware
} = require("@rbac/fieldFilter");
const policyMiddleware = require("@rbac/policyMiddleware");
const {
  fieldWriteGuardMiddleware
} = require("@rbac/fieldWriteGuard");
const validate = require("@middleware/validate");
const {
  createInvoiceSchema,
  voidInvoiceSchema
} = require("../validators/invoice.validator"); // billingDomain/validators/

const requireEntitlement = require("@middleware/requireEntitlement");
const {
  autoAudit
} = require("@middleware/auditInterceptor");

// Phase X.2.2 — subscriptionGuard removed (requireEntitlement in moduleLoader is SSOT).
router.use(orgProtect, organizationContext, requireEntitlement("finance"), autoAudit("Invoice"));

/**
 * @swagger
 * /invoices:
 *   get:
 *     summary: List patient invoices (scoped by org + branch)
 *     tags: [Patient Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, issued, partially_paid, paid, voided] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated invoice list
 */
router.get("/", requireOrgPermission(P.INVOICES_READ), fieldFilterMiddleware("invoice"), async (req, res) => {
  try {
    const {
      patientId,
      status
    } = req.query;
    const filter = {};
    if (patientId) filter.patientId = patientId;
    if (status) filter.status = status;
    const invoices = await financialReadService.listInvoices(req, filter, {
      limit: Math.min(parseInt(req.query.limit) || 50, 100),
      skip: ((parseInt(req.query.page) || 1) - 1) * (parseInt(req.query.limit) || 50)
    });
    return res.json({
      success: true,
      data: invoices
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: {
        code: "LIST_ERROR",
        message: err.message
      }
    });
  }
});

/**
 * @swagger
 * /invoices/{id}:
 *   get:
 *     summary: Get patient invoice by ID
 *     tags: [Patient Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Invoice details
 *       404:
 *         description: Invoice not found
 */
router.get("/:id", requireOrgPermission(P.INVOICES_READ), fieldFilterMiddleware("invoice"), async (req, res) => {
  try {
    const invoice = await financialReadService.getInvoiceById(req, req.params.id);
    if (!invoice) return res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Invoice not found"
      }
    });
    return res.json({
      success: true,
      data: invoice
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: {
        code: "GET_ERROR",
        message: err.message
      }
    });
  }
});

/**
 * @swagger
 * /invoices:
 *   post:
 *     summary: Create patient invoice (server-side total calculation)
 *     tags: [Patient Invoices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, branchId, regionCode]
 *             properties:
 *               patientId: { type: string }
 *               branchId: { type: string }
 *               regionCode: { type: string, description: "ISO country code" }
 *               treatments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     treatmentId: { type: string }
 *                     procedureName: { type: string }
 *                     toothNumber: { type: string }
 *                     unitPrice: { type: number }
 *                     quantity: { type: integer }
 *               charges:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type: { type: string }
 *                     description: { type: string }
 *                     amount: { type: number }
 *                     appointmentId: { type: string }
 *               discount: { type: number, default: 0 }
 *               insuranceCovered: { type: number, default: 0 }
 *               tax: { type: number, default: 0 }
 *     responses:
 *       201:
 *         description: Invoice created with server-calculated totals
 *       400:
 *         description: Validation error
 */
router.post("/", requireOrgPermission(P.INVOICES_CREATE), policyMiddleware(P.INVOICES_CREATE), fieldWriteGuardMiddleware("invoice"), validate(createInvoiceSchema), async (req, res) => {
  try {
    const invoice = await financialOrchestrator.createInvoice({
      ...req.body,
      issuedByUserId: req.user._id,
      treatmentOperatorId: req.body.treatmentOperatorId || req.user._id,
      ipAddress: req.ip
    }, req);
    logger.info(`[Invoices] Created invoice for patient ${req.body.patientId} in org ${req.organizationId}`);
    return res.status(201).json({
      success: true,
      data: invoice
    });
  } catch (err) {
    return res.status(err.statusCode || 400).json({
      success: false,
      error: {
        code: "CREATE_ERROR",
        message: err.message
      }
    });
  }
});

/**
 * @swagger
 * /invoices/{id}/void:
 *   post:
 *     summary: Void an invoice (immutable once voided)
 *     tags: [Patient Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [voidedReason, expectedVersion]
 *             properties:
 *               voidedReason: { type: string }
 *               expectedVersion: { type: integer }
 *     responses:
 *       200:
 *         description: Invoice voided
 *       400:
 *         description: Already voided or version conflict
 */
router.post("/:id/void", requireOrgPermission(P.INVOICES_DELETE), policyMiddleware(P.INVOICES_DELETE), validate(voidInvoiceSchema), async (req, res) => {
  try {
    const invoice = await financialOrchestrator.voidInvoice({
      invoiceId: req.params.id,
      voidedByUserId: req.user._id,
      voidedReason: req.body.voidedReason,
      expectedVersion: req.body.expectedVersion
    }, req);
    return res.json({
      success: true,
      data: invoice
    });
  } catch (err) {
    return res.status(err.statusCode || 400).json({
      success: false,
      error: {
        code: "VOID_ERROR",
        message: err.message
      }
    });
  }
});
module.exports = router;