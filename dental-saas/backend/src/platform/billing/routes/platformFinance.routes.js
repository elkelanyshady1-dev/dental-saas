/**
 * platformFinance.routes.js
 * Platform Finance — Read API Routes
 *
 * Mounts under the platform billing router (billing.routes.js).
 * All routes are strictly read-only (GET) for finance data.
 *
 * Route matrix:
 *
 *   GET /billing/invoices              → list invoices (paginated)
 *   GET /billing/invoices/export       → CSV download
 *   GET /billing/invoices/:id/pdf      → PDF download
 *   GET /billing/ledger                → list ledger entries (read-only)
 *   GET /billing/ledger/export         → CSV download
 *   GET /billing/payments              → list payment attempts
 *   GET /billing/payments/export       → CSV download
 *   GET /billing/revenue               → revenue analytics metrics
 *   GET /billing/organizations/:orgId/credits → credit balance (v22.0)
 *
 * RBAC guards (Sentinel §3):
 *   VIEW_ORGANIZATIONS       → invoice reads (finance data visible to operations)
 *   VIEW_AUDIT_LOGS          → ledger reads (immutable financial audit data)
 *   VIEW_PLATFORM_ANALYTICS  → payment + revenue analytics
 *
 * PLANE: Platform
 */

"use strict";

const express = require("express");
const router = express.Router();

const platformProtect = require("../../../middleware/platformProtect");
const requirePlatformCapability = require("../../../middleware/requirePlatformCapability");
const { PLATFORM_CAPABILITIES } = require("@contracts/platformContract.cjs.js");
const CAP = PLATFORM_CAPABILITIES;

const asyncHandler = require("@utils/asyncHandler");

// ── Controllers ──────────────────────────────────────────────────────────────
const invoiceListCtrl = require("../controllers/billingInvoiceList.controller");
const invoiceActionCtrl = require("../controllers/invoiceAction.controller");
const ledgerCtrl = require("../controllers/billingLedger.controller");
const paymentsCtrl = require("../controllers/billingPayments.controller");
const revenueCtrl = require("../controllers/billingRevenue.controller");
const creditsCtrl = require("../controllers/billingCredits.controller");

// ── Guard sets ────────────────────────────────────────────────────────────────
const pInvoiceRead = [platformProtect, requirePlatformCapability(CAP.VIEW_ORGANIZATIONS)];
const pInvoiceWrite = [platformProtect, requirePlatformCapability(CAP.MANAGE_SUBSCRIPTIONS)];
const pLedgerRead = [platformProtect, requirePlatformCapability(CAP.VIEW_AUDIT_LOGS)];
const pAnalytics = [platformProtect, requirePlatformCapability(CAP.VIEW_PLATFORM_ANALYTICS)];

// ─────────────────────────────────────────────────────────────────────────────
// INVOICES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/billing/invoices:
 *   get:
 *     summary: List platform invoices (paginated)
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, open, paid, void, uncollectible] }
 *       - in: query
 *         name: organizationId
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Paginated invoice list
 */
router.get("/billing/invoices", ...pInvoiceRead, asyncHandler(invoiceListCtrl.list));

/**
 * @swagger
 * /api/platform/billing/invoices/export:
 *   get:
 *     summary: Export invoices as CSV
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: CSV file stream
 *         content: { text/csv: {} }
 */
router.get("/billing/invoices/export", ...pInvoiceRead, asyncHandler(invoiceListCtrl.exportCsv));

/**
 * @swagger
 * /api/platform/billing/invoices/{invoiceId}/pdf:
 *   get:
 *     summary: Get invoice as PDF — inline preview or file download
 *     description: >
 *       Returns a rendered PDF for the given invoice.
 *       Supports both `Authorization: Bearer <token>` header and `?token=<JWT>`
 *       query parameter (for browser window.open / new tab where headers cannot be set).
 *       Use `?mode=inline` (default) for browser preview, `?mode=download` for save dialog.
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: token
 *         required: false
 *         description: JWT token (alternative to Authorization header for browser-direct access)
 *         schema: { type: string }
 *       - in: query
 *         name: mode
 *         required: false
 *         description: >
 *           "inline" (default) — Content-Disposition: inline, browser opens PDF viewer.
 *           "download" — Content-Disposition: attachment, browser triggers save dialog.
 *         schema:
 *           type: string
 *           enum: [inline, download]
 *           default: inline
 *     responses:
 *       200:
 *         description: PDF file
 *         content: { application/pdf: {} }
 *       401:
 *         description: Unauthorized — no or invalid token
 *       404:
 *         description: Invoice not found
 */
router.get("/billing/invoices/:invoiceId/pdf", ...pInvoiceRead, asyncHandler(invoiceListCtrl.pdf));

/**
 * @swagger
 * /api/platform/billing/invoices/{invoiceId}:
 *   get:
 *     summary: Get full invoice detail including line items and financial summary
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Full invoice detail with line items, organization, and summary
 *       404:
 *         description: Invoice not found
 */
/**
 * POST /billing/invoices/:invoiceId/pay
 * Swagger annotation is in invoiceAction.controller.js (applyPayment).
 * Sentinel §3: POST mutation → MANAGE_SUBSCRIPTIONS guard.
 * Order: MUST be before GET /billing/invoices/:invoiceId to prevent Express
 * resolving "pay" as an invoiceId ObjectId.
 */
router.post("/billing/invoices/:invoiceId/pay", ...pInvoiceWrite, asyncHandler(invoiceActionCtrl.applyPayment));

router.get("/billing/invoices/:invoiceId", ...pInvoiceRead, asyncHandler(invoiceActionCtrl.getInvoice));


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
 *         description: Payment attempt history for this invoice
 */
router.get("/billing/invoices/:invoiceId/payments", ...pInvoiceRead, asyncHandler(invoiceActionCtrl.listInvoicePayments));

/**
 * @swagger
 * /api/platform/billing/invoices/{invoiceId}/void:
 *   post:
 *     summary: Void a DRAFT invoice (admin action)
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
 *         description: Invoice successfully voided
 *       409:
 *         description: Invalid state transition
 */
router.post("/billing/invoices/:invoiceId/void", ...pInvoiceWrite, asyncHandler(invoiceActionCtrl.voidInvoice));

/**
 * @swagger
 * /api/platform/billing/invoices/{invoiceId}/uncollectible:
 *   post:
 *     summary: Mark an OPEN invoice as uncollectible (after dunning exhausted)
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Invoice marked as uncollectible
 *       409:
 *         description: Invalid state transition
 */
router.post("/billing/invoices/:invoiceId/uncollectible", ...pInvoiceWrite, asyncHandler(invoiceActionCtrl.markUncollectible));

/**
 * @swagger
 * /api/platform/billing/invoices/{invoiceId}/public:
 *   get:
 *     summary: Get public invoice data (no authentication required)
 *     description: >
 *       Sanitised invoice view for hosted invoice pages and customer-facing
 *       share links. Internal fields (contractId, metadata, audit) are excluded.
 *     tags: [Finance]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Public invoice payload
 *       404:
 *         description: Invoice not found
 */
// AUTH_ONLY exception: public invoice page — intentionally unauthenticated (Sentinel §3)
router.get("/billing/invoices/:invoiceId/public", asyncHandler(invoiceActionCtrl.getPublicInvoice));


// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/billing/ledger/transaction/{id}:
 *   get:
 *     summary: Get a double-entry ledger transaction by ID (drilldown)
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Transaction detail with balanced entries and origin event
 *       404:
 *         description: Transaction not found
 */
// IMPORTANT: must be registered BEFORE /billing/ledger to avoid Express path conflict
router.get("/billing/ledger/transaction/:id", ...pLedgerRead, asyncHandler(ledgerCtrl.getTransaction));

/**
 * @swagger
 * /api/platform/billing/ledger:
 *   get:
 *     summary: Read immutable billing ledger (paginated)
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: eventType
 *         schema: { type: string }
 *       - in: query
 *         name: organizationId
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Ledger entries enriched with double-entry transaction links
 */
router.get("/billing/ledger", ...pLedgerRead, asyncHandler(ledgerCtrl.list));

/**
 * @swagger
 * /api/platform/billing/ledger/export:
 *   get:
 *     summary: Export ledger as CSV
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: CSV file stream
 *         content: { text/csv: {} }
 */
router.get("/billing/ledger/export", ...pLedgerRead, asyncHandler(ledgerCtrl.exportCsv));

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/billing/payments:
 *   get:
 *     summary: List payment attempts (paginated)
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema: { type: string }
 *       - in: query
 *         name: invoiceId
 *         schema: { type: string }
 *       - in: query
 *         name: provider
 *         schema: { type: string, enum: [stripe, paymob, paypal, manual] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [initiated, authorized, captured, failed, refunded, disputed] }
 *     responses:
 *       200:
 *         description: Payment attempt list
 */
router.get("/billing/payments", ...pAnalytics, asyncHandler(paymentsCtrl.list));

/**
 * @swagger
 * /api/platform/billing/payments/export:
 *   get:
 *     summary: Export payment history as CSV
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: CSV file stream
 *         content: { text/csv: {} }
 */
router.get("/billing/payments/export", ...pAnalytics, asyncHandler(paymentsCtrl.exportCsv));

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/billing/revenue:
 *   get:
 *     summary: Revenue analytics metrics (MRR, ARR, churn rate, etc.)
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Revenue metrics object
 */
router.get("/billing/revenue", ...pAnalytics, asyncHandler(revenueCtrl.getMetrics));

// ─────────────────────────────────────────────────────────────────────────────
// CREDIT BALANCE (v22.0)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/billing/organizations/{orgId}/credits:
 *   get:
 *     summary: Get credit balance and credit history for an organization
 *     tags: [Finance]
 *     security: [{ platformBearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Credit balance and credit activity
 *       400:
 *         description: Invalid organization ID
 */
router.get("/billing/organizations/:orgId/credits", ...pInvoiceRead, asyncHandler(creditsCtrl.getCredits));

module.exports = router;
