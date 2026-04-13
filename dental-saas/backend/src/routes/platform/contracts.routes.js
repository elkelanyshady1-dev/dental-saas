/**
 * contracts.routes.js
 * Sprint 2 — Contract Engine (Parallel Mode)
 *
 * All routes under /api/platform/*
 * Guarded by: platformProtect + authorizePlatformPermission(MANAGE_SUBSCRIPTIONS)
 *
 * Contract lifecycle:
 *   POST   /contracts                        → create draft contract
 *   PATCH  /contracts/:id/status             → terminate contract
 *   POST   /contracts/:id/replace            → create replacement draft
 *   POST   /contracts/:id/upload-document    → attach signed document reference
 *
 * Invoice lifecycle:
 *   POST   /contracts/:id/invoice            → generate invoice for contract
 *   GET    /contracts/:id/invoices           → list invoices for contract
 *   GET    /invoices/:id                     → get single invoice
 *   POST   /invoices/:id/pay                 → record payment (manual or provider intent)
 */

"use strict";

const express = require("express");
const router = express.Router();

const platformProtect = require("../../middleware/platformProtect");
const authorizePlatformPermission = require("../../middleware/authorizePlatformPermission");
const { PLATFORM_CAPABILITIES } = require('@contracts/platformContract.cjs.js');
const CAP = PLATFORM_CAPABILITIES;

const contractController = require("../../platform/billing/controllers/platformContract.controller");
const invoiceController = require("../../platform/billing/controllers/platformInvoice.controller");
const dashboardController = require("../../platform/billing/controllers/contractsDashboard.controller");
const contractUpgradeController = require("../../platform/billing/controllers/contractUpgrade.controller");

// Guard shorthand — all contract/invoice management requires MANAGE_SUBSCRIPTIONS
const pSub = [platformProtect, authorizePlatformPermission(CAP.MANAGE_SUBSCRIPTIONS)];
// Guard shorthand — analytics read (dashboard)
const pAnalytics = [platformProtect, authorizePlatformPermission(CAP.VIEW_PLATFORM_ANALYTICS)];
// Guard shorthand - org read (VIEW_ORGANIZATIONS)
const pOrgView = [platformProtect, authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS)];

// ─── DASHBOARD ENDPOINTS (must be before /:id routes to avoid path collision) ─

/**
 * @swagger
 * /api/platform/contracts/needs-renewal:
 *   get:
 *     summary: Contracts needing renewal attention
 *     description: |
 *       Returns paginated list of active contracts that require immediate attention:
 *       - Expiring within `lookaheadDays` (default 14)
 *       - Currently in dunning (charge failing, retrying)
 *       - In grace period (pending suspension)
 *       Includes org name, invoice status, dunning state, and priority classification.
 *       Required capability: VIEW_PLATFORM_ANALYTICS.
 *     tags: [Platform Contracts]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: query
 *         name: lookaheadDays
 *         schema:
 *           type: integer
 *           default: 14
 *           minimum: 1
 *           maximum: 90
 *         description: Days ahead to include expiring contracts (1–90)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 200
 *     responses:
 *       200:
 *         description: Contracts needing attention
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       contractId:
 *                         type: string
 *                       orgName:
 *                         type: string
 *                       contractStatus:
 *                         type: string
 *                       effectiveTo:
 *                         type: string
 *                         format: date-time
 *                       daysToExpiry:
 *                         type: integer
 *                       salesManaged:
 *                         type: boolean
 *                       dunning:
 *                         type: object
 *                       invoice:
 *                         type: object
 *                       priority:
 *                         type: string
 *                         enum: [critical, high, medium, low]
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *                 summary:
 *                   type: object
 *                   properties:
 *                     expiringSoon:
 *                       type: integer
 *                     inDunning:
 *                       type: integer
 *                     inGrace:
 *                       type: integer
 *                 meta:
 *                   type: object
 *       400:
 *         description: Invalid lookaheadDays parameter
 */
router.get("/contracts/needs-renewal", ...pAnalytics, dashboardController.getContractsNeedingRenewal);


/**
 * @swagger
 * /api/platform/contracts/sales:
 *   post:
 *     summary: Create a custom-price sales contract
 *     description: |
 *       Creates a sales-originated OrgContract with a custom price, bypassing the catalog pricing.
 *
 *       Lifecycle rules (TDS unified trial model):
 *       - If the org has an active trial contract → new contract status = `pending_activation`,
 *         effectiveFrom = trial.effectiveTo (activates automatically via trialActivation.job)
 *       - If no active trial → status = `draft` (generate invoice + payment to activate)
 *
 *       PlanVersions with `visibility="sales"` are accessible via this endpoint (not on public list).
 *       Source = "sales" is tagged on the contract for analytics and UI badges.
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Contracts]
 *     security:
 *       - platformToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organizationId
 *               - planVersionId
 *               - customPrice
 *               - currency
 *             properties:
 *               organizationId:
 *                 type: string
 *               planVersionId:
 *                 type: string
 *               customPrice:
 *                 type: number
 *                 minimum: 0
 *                 description: Custom price overriding catalog (e.g. 299.00)
 *               currency:
 *                 type: string
 *                 example: USD
 *               durationMonths:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 120
 *                 default: 12
 *               autoRenew:
 *                 type: boolean
 *                 default: false
 *               gracePeriodDays:
 *                 type: integer
 *                 default: 7
 *               salesOwnerId:
 *                 type: string
 *                 description: PlatformUser ID of the sales rep (defaults to actor)
 *               notes:
 *                 type: string
 *                 description: Internal sales notes (stored in contract metadata)
 *     responses:
 *       201:
 *         description: Sales contract created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                 scheduledForTrialEnd:
 *                   type: boolean
 *                 trialEndsAt:
 *                   type: string
 *                   format: date-time
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error (missing fields, invalid price/duration)
 *       404:
 *         description: Organization or PlanVersion not found
 *       409:
 *         description: Duplicate pending_activation or sales-draft contract exists
 */
router.post("/contracts/sales", ...pSub, contractController.createSalesContract);

/**
 * @swagger
 * /api/platform/contracts:
 *   post:
 *     summary: Create a new OrgContract
 *     description: "Creates a draft OrgContract for an organization. Requires a valid active PlanVersion. Activation requires a paid invoice. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Contracts]
 *     security:
 *       - platformToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organizationId
 *               - planVersionId
 *               - lockedPrice
 *               - currency
 *               - effectiveFrom
 *             properties:
 *               organizationId:
 *                 type: string
 *               planVersionId:
 *                 type: string
 *               lockedPrice:
 *                 type: number
 *               currency:
 *                 type: string
 *               effectiveFrom:
 *                 type: string
 *                 format: date-time
 *               effectiveTo:
 *                 type: string
 *                 format: date-time
 *               trialDays:
 *                 type: integer
 *               autoRenew:
 *                 type: boolean
 *               gracePeriodDays:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Contract created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *       404:
 *         description: Organization or PlanVersion not found
 *       409:
 *         description: Draft contract already exists
 */
// ─── UPGRADE ROUTES (must be before POST /contracts to avoid path overlap) ───

// POST /contracts/preview — read-only pricing preview (no writes)
// Sentinel: POST → MANAGE_* (write capability for consistency — this is an admin-intent action)
router.post("/contracts/preview", ...pSub, contractUpgradeController.previewUpgrade);

// POST /contracts/upgrade — atomic multi-engine upgrade (transaction-guarded)
// Sentinel: POST → MANAGE_*
router.post("/contracts/upgrade", ...pSub, contractUpgradeController.upgradeSubscription);

router.post("/contracts", ...pSub, contractController.createContract);


/**
 * @swagger
 * /api/platform/contracts/{id}/status:
 *   patch:
 *     summary: Update contract status
 *     description: "Terminates a contract. Only terminated is allowed via this endpoint. Activation is performed by the payment flow. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Contracts]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contractStatus
 *             properties:
 *               contractStatus:
 *                 type: string
 *                 enum: [terminated]
 *               terminationReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contract updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       404:
 *         description: Contract not found
 *       409:
 *         description: Contract already in terminal state
 */
router.patch("/contracts/:id/status", ...pSub, contractController.updateContractStatus);

/**
 * @swagger
 * /api/platform/contracts/{id}/replace:
 *   post:
 *     summary: Replace an existing contract
 *     description: "Creates a replacement draft contract. The source contract is superseded only when the replacement is activated via a paid invoice. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Contracts]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planVersionId:
 *                 type: string
 *               lockedPrice:
 *                 type: number
 *               currency:
 *                 type: string
 *               autoRenew:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Replacement contract created in draft
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       404:
 *         description: Source contract not found
 *       409:
 *         description: Pending draft already exists
 */
router.post("/contracts/:id/replace", ...pSub, contractController.replaceContract);

/**
 * @swagger
 * /api/platform/contracts/{id}/upload-document:
 *   post:
 *     summary: Attach signed document reference to contract
 *     description: "Records a signed contract document URL or S3 key against the contract. Does not perform the upload itself. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Contracts]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               documentUrl:
 *                 type: string
 *               documentKey:
 *                 type: string
 *               documentLabel:
 *                 type: string
 *     responses:
 *       200:
 *         description: Document reference saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing document reference
 *       404:
 *         description: Contract not found
 */
router.post("/contracts/:id/upload-document", ...pSub, contractController.uploadContractDocument);

// ─── INVOICE ENDPOINTS ────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/contracts/{id}/invoice:
 *   post:
 *     summary: Generate invoice for a contract
 *     description: "Creates a PlatformInvoice for the contract. Calculates base price, applies coupon/credit, applies tax, and sets status=open. Idempotent per billing period. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Contracts]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               billingInterval:
 *                 type: string
 *                 enum: [monthly, yearly, biennial]
 *     responses:
 *       201:
 *         description: Invoice created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       200:
 *         description: Existing invoice returned (idempotent)
 *       404:
 *         description: Contract not found
 */
router.post("/contracts/:id/invoice", ...pSub, invoiceController.generateInvoice);

/**
 * @swagger
 * /api/platform/contracts/{id}/invoices:
 *   get:
 *     summary: List invoices for a contract
 *     description: "Returns paginated list of PlatformInvoices linked to a contract. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Contracts]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated invoice list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 */
router.get("/contracts/:id/invoices", ...pSub, invoiceController.listContractInvoices);

/**
 * @swagger
 * /api/platform/invoices/{id}:
 *   get:
 *     summary: Get invoice details
 *     description: "Returns a single PlatformInvoice with contract and plan version details. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Contracts]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       404:
 *         description: Invoice not found
 */
router.get("/invoices/:id", ...pSub, invoiceController.getInvoice);

/**
 * @swagger
 * /api/platform/invoices/{id}/pay:
 *   post:
 *     summary: Record payment for an invoice
 *     description: "Records a payment against a PlatformInvoice. Manual methods (cash, bank_transfer, pos) immediately mark the invoice paid and activate the contract. Provider methods (stripe, paymob, paypal) record payment intent. Required capability: MANAGE_SUBSCRIPTIONS."
 *     tags: [Platform Contracts]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentMethod
 *             properties:
 *               paymentMethod:
 *                 type: string
 *                 enum: [cash, bank_transfer, pos, stripe, paymob, paypal]
 *               paymentMetadata:
 *                 type: object
 *               providerPaymentId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid payment method or missing metadata
 *       404:
 *         description: Invoice not found
 *       409:
 *         description: Invoice in non-payable state
 */
router.post("/invoices/:id/pay", ...pSub, (req, res) => { return res.status(410).json({ success: false, error: { code: "ENDPOINT_DEPRECATED", message: "Deprecated v21. Use POST /api/platform/billing/invoices/:invoiceId/pay" } }); });

// ─── CONTRACT CONTROL ENDPOINTS ───────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/contracts/{id}/auto-renew:
 *   patch:
 *     summary: Toggle auto-renew and/or salesManaged on a contract
 *     description: |
 *       Controls the renewal behaviour for an active contract.
 *       - `autoRenew: false` → contract expires at period end (no charge, no invoice)
 *       - `salesManaged: true` → renewal generates an issued invoice only (no auto-charge)
 *       - `salesManaged: false` → renewal attempts auto-charge via payment provider
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Contracts]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: OrgContract _id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - autoRenew
 *             properties:
 *               autoRenew:
 *                 type: boolean
 *                 description: Enable or disable automatic renewal
 *               salesManaged:
 *                 type: boolean
 *                 description: If true, renewal issues invoice only (no auto-charge)
 *     responses:
 *       200:
 *         description: autoRenew updated
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
 *                     contractId:
 *                       type: string
 *                     autoRenew:
 *                       type: boolean
 *                     salesManaged:
 *                       type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: autoRenew missing or not boolean
 *       404:
 *         description: Contract not found
 *       409:
 *         description: Contract in terminal state (cannot be modified)
 */
router.patch("/contracts/:id/auto-renew", ...pSub, contractController.setAutoRenew);

/**
 * @swagger
 * /api/platform/contracts/{id}/cancel:
 *   patch:
 *     summary: Cancel a contract (stop-at-period-end)
 *     description: |
 *       Marks a contract as canceled and disables autoRenew.
 *       The contract is NOT immediately terminated — it remains active until
 *       `effectiveTo`. The renewal engine will see `contractStatus=canceled` and
 *       expire the contract at that point without generating a new invoice or charge.
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Contracts]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: OrgContract _id
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cancellationReason:
 *                 type: string
 *                 description: Optional reason for cancellation
 *     responses:
 *       200:
 *         description: Contract canceled
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
 *                     contractId:
 *                       type: string
 *                     contractStatus:
 *                       type: string
 *                       enum: [canceled]
 *                     effectiveTo:
 *                       type: string
 *                       format: date-time
 *                 message:
 *                   type: string
 *       404:
 *         description: Contract not found
 *       409:
 *         description: Contract already in terminal state
 */
router.patch("/contracts/:id/cancel", ...pSub, contractController.cancelContract);


// GET /contracts/:id � Contract Detail (READ-ONLY)
const contractDetailController = require("../../platform/billing/controllers/contractDetail.controller");
// Sentinel: GET ? VIEW_*
router.get("/contracts/:id", ...pOrgView, contractDetailController.getContractById);

// v21.0: Contract Lifecycle Actions (suspend, void, pay, refund)
const contractLifecycleCtrl = require("../../platform/billing/controllers/contractLifecycle.controller");
// Sentinel: POST -> MANAGE_*
router.post("/contracts/:id/suspend", ...pSub, contractLifecycleCtrl.suspendContractAction);
router.post("/contracts/:id/void", ...pSub, contractLifecycleCtrl.voidContractAction);
router.post("/billing/invoices/:invoiceId/pay", ...pSub, contractLifecycleCtrl.manualPayInvoice);
router.post("/billing/payments/:paymentId/refund", ...pSub, contractLifecycleCtrl.refundPaymentAction);

module.exports = router;

// --- Sprint 8.1: Contract Chain Debugging API ---------------------------------
// READ-ONLY endpoints � no mutation, no financial side-effects.

/**
 * @swagger
 * /api/platform/contracts/{contractId}/chain:
 *   get:
 *     summary: Traverse the contract lifecycle chain
 *     description: |
 *       Returns the full ordered chain of OrgContracts linked by supersession
 *       or previous-contract pointers, starting from the supplied contractId.
 *
 *       **forward (default):** walks `supersededById` � follows the
 *       lifecycle forward (trial ? paid ? upgrade).
 *
 *       **backward:** walks `previousContractId` � follows the chain
 *       in reverse (current ? predecessor).
 *
 *       Chain depth is capped at 50 nodes to guard against corrupt data.
 *       Read-only. Never mutates any contract.
 *       Required capability: VIEW_ORGANIZATIONS.
 *     tags: [Platform Contracts]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: contractId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: direction
 *         schema:
 *           type: string
 *           enum: [forward, backward]
 *           default: forward
 *     responses:
 *       200:
 *         description: Contract chain
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 contractId:
 *                   type: string
 *                 direction:
 *                   type: string
 *                 chainLength:
 *                   type: integer
 *                 truncated:
 *                   type: boolean
 *                 chain:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid contractId or direction
 *       404:
 *         description: Contract not found
 */
// Sentinel: GET ? VIEW_* ?
router.get("/contracts/:contractId/chain", ...pOrgView, contractController.getContractChain);

