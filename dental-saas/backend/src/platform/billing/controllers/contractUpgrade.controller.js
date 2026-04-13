/**
 * contractUpgrade.controller.js
 * Platform Billing — Atomic Contract Upgrade Endpoints
 *
 * Endpoints:
 *   POST /api/platform/contracts/preview  → previewUpgrade
 *   POST /api/platform/contracts/upgrade  → upgradeSubscription
 *
 * Both delegate to BillingOrchestratorService.
 * No business logic lives in this controller.
 *
 * CAPABILITY: MANAGE_SUBSCRIPTIONS (via route guards in contracts.routes.js)
 * PLANE: Platform — no org-plane imports.
 */

"use strict";

const mongoose = require("mongoose");
const BillingOrchestrator = require("../orchestrator/BillingOrchestrator.service");
const logger = require("@utils/logger");

// ─── Audit fallback ───────────────────────────────────────────────────────────
let auditLog;
try {
    auditLog = require("../../../domain/services/platformAudit.service").log;
} catch {
    auditLog = async (e) => logger.info(e, "[ContractUpgrade][AuditFallback]");
}

// ─── POST /contracts/preview ──────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/contracts/preview:
 *   post:
 *     summary: Preview upgrade pricing without creating any records
 *     description: >
 *       Read-only pricing preview. Computes the exact price that would be charged
 *       for upgrading to the specified plan, applying the org's billing country,
 *       pricingEngine (tax/coupon/seat), and any admin discounts passed in the body.
 *       No DB writes — safe to poll from the Contract Builder Wizard on every change.
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Contracts]
 *     security: [{ platformBearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, planVersionId]
 *             properties:
 *               organizationId:
 *                 type: string
 *               planVersionId:
 *                 type: string
 *               billingInterval:
 *                 type: string
 *                 enum: [monthly, yearly, biennial]
 *                 default: monthly
 *               discountPercent:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Admin discount percentage (applied on top of pricing engine)
 *               discountAmount:
 *                 type: number
 *                 minimum: 0
 *                 description: Admin flat discount amount (mutually exclusive with discountPercent)
 *               customPriceOverride:
 *                 type: number
 *                 minimum: 0
 *                 description: Explicit locked price override (sales contract / negotiated price)
 *               couponCode:
 *                 type: string
 *                 description: Coupon code to apply via pricing engine
 *     responses:
 *       200:
 *         description: Pricing preview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     basePrice:
 *                       type: number
 *                       description: Price before admin discount
 *                       example: 2500.00
 *                     finalPrice:
 *                       type: number
 *                       description: Price after all discounts
 *                       example: 2000.00
 *                     price:
 *                       type: number
 *                       description: Alias for finalPrice (frontend compatibility)
 *                       example: 2000.00
 *                     currency:
 *                       type: string
 *                       example: EGP
 *                     billingInterval:
 *                       type: string
 *                       example: yearly
 *                     tax:
 *                       type: number
 *                       example: 280.00
 *                     discount:
 *                       type: number
 *                       description: Total discount applied (coupon + admin)
 *                       example: 500.00
 *                     regionCode:
 *                       type: string
 *                       example: MEA
 *                     planCode:
 *                       type: string
 *                       example: enterprise
 *                     versionTag:
 *                       type: string
 *                       example: v1.1
 *                     label:
 *                       type: string
 *                       example: "Enterprise Plan v1.1"
 *                     breakdown:
 *                       type: object
 *             example:
 *               success: true
 *               data:
 *                 basePrice: 2500
 *                 finalPrice: 2000
 *                 price: 2000
 *                 currency: EGP
 *                 billingInterval: yearly
 *                 tax: 0
 *                 discount: 500
 *                 regionCode: MEA
 *                 planCode: enterprise
 *                 versionTag: v1.1
 *                 label: "Enterprise Plan v1.1"
 *       400:
 *         description: Invalid inputs or plan version is a draft
 *       404:
 *         description: Organization or PlanVersion not found
 */
exports.previewUpgrade = async (req, res) => {
    try {
        const {
            organizationId,
            planVersionId,
            billingInterval = "monthly",
            discountPercent,
            discountAmount,
            customPriceOverride,
            couponCode
        } = req.body;

        if (!organizationId || !mongoose.isValidObjectId(organizationId)) {
            return res.status(400).json({ success: false, message: "organizationId is required and must be a valid ObjectId" });
        }
        if (!planVersionId || !mongoose.isValidObjectId(planVersionId)) {
            return res.status(400).json({ success: false, message: "planVersionId is required and must be a valid ObjectId" });
        }

        const preview = await BillingOrchestrator.previewUpgradePrice({
            organizationId,
            planVersionId,
            billingInterval,
            discountPercent: discountPercent ? Number(discountPercent) : undefined,
            discountAmount: discountAmount ? Number(discountAmount) : undefined,
            customPriceOverride: customPriceOverride !== undefined ? Number(customPriceOverride) : undefined,
            couponCode: couponCode || undefined
        });

        return res.json({ success: true, data: preview });

    } catch (err) {
        const status = err.status || err.statusCode || 500;
        if (status < 500) {
            return res.status(status).json({ success: false, message: err.message, code: err.code });
        }
        logger.error({ err, requestId: req.requestId }, "[ContractUpgrade] previewUpgrade failed");
        return res.status(500).json({ success: false, message: "Internal error during pricing preview" });
    }
};


// ─── POST /contracts/upgrade ──────────────────────────────────────────────────

/**
 * @swagger
 * /api/platform/contracts/upgrade:
 *   post:
 *     summary: Create subscription contract (invoice-first lifecycle)
 *     description: >
 *       Executes the invoice-first upgrade lifecycle inside a single MongoDB transaction.
 *
 *       **Invoice-First Flow (v3.0):**
 *         1. Create OrgContract → draft
 *         2. Advance contract → ready
 *         3. Generate PlatformInvoice
 *         4. Issue invoice (draft → issued)
 *         5. Advance contract → pending_payment
 *         6. Commit
 *
 *       **Activation (automatic — not in this endpoint):**
 *         Payment is recorded via POST /api/platform/billing/payments/record
 *         When invoice.status = "paid", paymentApplicationService automatically:
 *         - transitions contract pending_payment → active
 *         - applies entitlements to the organization
 *         - writes contract.activated ledger entry
 *
 *       On any failure the entire transaction is aborted.
 *       source is normalized: "platform_admin" → "sales".
 *       Origin details stored in contract.metadata.
 *
 *       Required capability: MANAGE_SUBSCRIPTIONS.
 *     tags: [Platform Contracts]
 *     security: [{ platformBearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, planVersionId]
 *             properties:
 *               organizationId:
 *                 type: string
 *               planVersionId:
 *                 type: string
 *                 description: Target PlanVersion _id
 *               billingInterval:
 *                 type: string
 *                 enum: [monthly, yearly, biennial]
 *                 default: monthly
 *               paymentMethod:
 *                 type: string
 *                 enum: [manual, cash, bank_transfer, pos, stripe, paymob]
 *                 default: manual
 *               paymentTerms:
 *                 type: string
 *                 enum: [due_on_receipt, net15, net30, net60]
 *                 default: due_on_receipt
 *               autoRenew:
 *                 type: boolean
 *                 default: true
 *               contractStartDate:
 *                 type: string
 *                 format: date
 *                 description: Contract effective start (defaults to today if omitted)
 *               contractEndDate:
 *                 type: string
 *                 format: date
 *                 description: Contract end date (null = open-ended)
 *               trialDaysOverride:
 *                 type: integer
 *                 minimum: 0
 *               discountPercent:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *               discountAmount:
 *                 type: number
 *                 minimum: 0
 *               customPriceOverride:
 *                 type: number
 *                 minimum: 0
 *               couponCode:
 *                 type: string
 *               entitlementOverrides:
 *                 type: object
 *                 example:
 *                   maxBranches: 20
 *                   maxUsers: 500
 *                   supportTier: premium
 *     responses:
 *       200:
 *         description: Contract created — status pending_payment, invoice issued and awaiting payment
 *         content:
 *           application/json:
 *             examples:
 *               pending_payment:
 *                 summary: Invoice-first (all contracts enter pending_payment)
 *                 value:
 *                   success: true
 *                   message: "Contract created. Invoice issued and awaiting payment to activate."
 *                   data:
 *                     contractId: "65a1b2c3d4e5f6a7b8c9d0e1"
 *                     status: pending_payment
 *                     invoiceId: "65a1b2c3d4e5f6a7b8c9d0e2"
 *                     amountDue: 2000
 *                     currency: EGP
 *                     billingInterval: yearly
 *                     effectiveFrom: "2026-03-07T04:05:21.000Z"
 *                     paymentMethod: manual
 *       400:
 *         description: Validation error (invalid IDs, draft plan, invalid interval, invalid status for invoice generation)
 *       404:
 *         description: Organization or PlanVersion not found
 *       409:
 *         description: |
 *           Conflict — one of:
 *           - CONTRACT_ALREADY_PENDING_PAYMENT: org already has an open pending_payment contract
 *           - ORG_ARCHIVED: organization is archived
 *       422:
 *         description: Contract state machine violation (invalid status transition)
 *       500:
 *         description: Transaction aborted — no partial state persisted
 */
exports.upgradeSubscription = async (req, res) => {
    const requestId = req.requestId || req.headers["x-request-id"] || null;
    const actorId = req.platformUser?._id;

    try {
        const {
            organizationId,
            planVersionId,
            billingInterval = "monthly",
            paymentMethod = "manual",
            paymentTerms = "due_on_receipt",
            autoRenew = true,
            // Contract Builder fields (Sections 4-7)
            contractStartDate,
            contractEndDate,
            trialDaysOverride,
            discountPercent,
            discountAmount,
            customPriceOverride,
            couponCode,
            entitlementOverrides,
            // Grace Access (promo) fields — from Contract Builder UI
            accessType,    // "paid" | "trial" | "promo"  — explicit UI intent
            graceDays,     // number — only relevant when accessType === "promo"
        } = req.body;

        // ── Input validation ──────────────────────────────────────────────────
        if (!organizationId || !mongoose.isValidObjectId(organizationId)) {
            return res.status(400).json({ success: false, message: "organizationId is required and must be a valid ObjectId" });
        }
        if (!planVersionId || !mongoose.isValidObjectId(planVersionId)) {
            return res.status(400).json({ success: false, message: "planVersionId is required and must be a valid ObjectId" });
        }
        const validIntervals = ["monthly", "yearly", "biennial"];
        if (!validIntervals.includes(billingInterval)) {
            return res.status(400).json({ success: false, message: `billingInterval must be one of: ${validIntervals.join(", ")}` });
        }
        if (discountPercent !== undefined && (typeof discountPercent !== "number" || discountPercent < 0 || discountPercent > 100)) {
            return res.status(400).json({ success: false, message: "discountPercent must be a number 0-100" });
        }
        if (customPriceOverride !== undefined && (typeof customPriceOverride !== "number" || customPriceOverride < 0)) {
            return res.status(400).json({ success: false, message: "customPriceOverride must be a non-negative number" });
        }
        // v23.0: trialDaysOverride validation — prevents unbounded trial injection
        if (trialDaysOverride !== undefined) {
            const parsed = Number(trialDaysOverride);
            if (!Number.isFinite(parsed) || parsed < 0 || parsed > 90 || !Number.isInteger(parsed)) {
                return res.status(400).json({ success: false, message: "trialDaysOverride must be an integer between 0 and 90" });
            }
        }

        // Grace Access (promo) validation
        const VALID_ACCESS_TYPES = ["paid", "trial", "promo"];
        if (accessType !== undefined && !VALID_ACCESS_TYPES.includes(accessType)) {
            return res.status(400).json({ success: false, message: `accessType must be one of: ${VALID_ACCESS_TYPES.join(", ")}` });
        }
        if (accessType === "promo") {
            const gd = Number(graceDays);
            if (!Number.isFinite(gd) || gd < 1 || gd > 365 || !Number.isInteger(gd)) {
                return res.status(400).json({ success: false, message: "graceDays must be an integer between 1 and 365 when accessType is promo" });
            }
        }

        logger.info(
            { organizationId, planVersionId, billingInterval, paymentMethod, actorId, requestId },
            "[ContractUpgrade] upgradeSubscription — request received"
        );

        // ── Delegate to orchestrator (atomic) ─────────────────────────────────
        const result = await BillingOrchestrator.upgradeSubscription({
            organizationId,
            planVersionId,
            billingInterval,
            paymentMethod,
            paymentTerms,
            autoRenew: Boolean(autoRenew),
            contractStartDate,
            contractEndDate,
            trialDaysOverride: trialDaysOverride ? Number(trialDaysOverride) : undefined,
            discountPercent: discountPercent ? Number(discountPercent) : undefined,
            discountAmount: discountAmount ? Number(discountAmount) : undefined,
            customPriceOverride: customPriceOverride !== undefined ? Number(customPriceOverride) : undefined,
            couponCode,
            entitlementOverrides,
            // Grace Access — forward explicit UI intent to orchestrator
            accessType: accessType || undefined,
            graceDays: graceDays ? Number(graceDays) : undefined,
            actorId,
            requestId
        });

        // ── Audit log (non-blocking, post-response) ─────────────────────────────────────────
        setImmediate(async () => {
            try {
                await auditLog({
                    action: "SUBSCRIPTION_UPGRADED",
                    actorId,
                    metadata: {
                        organizationId,
                        planVersionId,
                        contractId: result.contractId,
                        invoiceId: result.invoiceId,
                        status: result.status,
                        amountDue: result.amountDue,
                        currency: result.currency,
                        effectiveFrom: result.effectiveFrom,
                        paymentMethod: result.paymentMethod,
                        billingInterval: result.billingInterval,
                        requestId
                    }
                });
            } catch { /* non-fatal */ }
        });

        // Access-type-aware response message
        const message =
            result.accessType === "promo"
                ? `Grace Access activated — ${result.promoDays ?? graceDays} days of free access.`
                : result.accessType === "trial"
                ? "Trial contract activated. No invoice generated."
                : "Contract created. Invoice issued and awaiting payment to activate.";

        return res.json({ success: true, data: result, message });

    } catch (err) {
        const status = err.status || err.statusCode || 500;
        const code = err.code || "UPGRADE_FAILED";
        const message = err.message || "Unknown error during upgrade";

        // Always log the real error with full context
        logger.error({
            err,
            stack: err.stack,
            code,
            status,
            requestId
        }, `[ContractUpgrade] upgradeSubscription failed — ${code}: ${message}`);

        if (status < 500) {
            return res.status(status).json({
                success: false,
                code,
                message,
                requestId
            });
        }

        // For 500s: expose the real error message (not a generic one) so
        // the admin can debug without checking server logs.
        return res.status(500).json({
            success: false,
            code,
            message: `Upgrade failed: ${message}. The transaction was aborted — no changes were made.`,
            requestId
        });
    }
};
