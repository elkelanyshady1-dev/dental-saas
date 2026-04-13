/**
 * checkout.controller.js
 * Org Plane — Self-Serve Checkout Endpoint
 *
 * POST /api/org/billing/checkout-session
 *
 * Guard: orgProtect (org JWT required — organizationId from token, never body)
 *
 * SENTINEL COMPLIANCE:
 *   ✅ No inline role checks
 *   ✅ organizationId sourced from req.organizationId (set by orgProtect)
 *   ✅ Calls orchestrator — no direct business logic in controller
 */

"use strict";

const { createCheckoutSession } = require("./checkoutOrchestrator.service");
const logger = require("../../../utils/logger");
const { authorize } = require("../../../utils/authorize");

/**
 * @swagger
 * /api/org/billing/checkout-session:
 *   post:
 *     summary: Create a self-serve checkout session
 *     description: |
 *       Initiates a subscription checkout session for the authenticated organization.
 *       - Validates the PlanVersion (must be active + visibility="public")
 *       - Runs the pricing engine to compute lockedPrice, currency, and providerPriceId
 *       - Creates an OrgContract (pending_activation if trial is running, else draft)
 *       - Creates a PlatformInvoice tied to the contract
 *       - Opens a provider checkout session and returns the URL
 *       - After payment: webhook → invoice marked paid → contract activates automatically
 *     tags: [Org Billing]
 *     security:
 *       - orgBearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planVersionId
 *               - billingInterval
 *               - provider
 *             properties:
 *               planVersionId:
 *                 type: string
 *                 description: MongoDB ObjectId of the PlanVersion to subscribe to
 *                 example: "64f1a2b3c4d5e6f7a8b9c0d1"
 *               billingInterval:
 *                 type: string
 *                 enum: [monthly, yearly, biennial]
 *                 description: Price cadence to lock on the contract
 *                 example: "monthly"
 *               provider:
 *                 type: string
 *                 enum: [stripe, paymob, paypal]
 *                 description: Payment provider to use for this checkout
 *                 example: "stripe"
 *               country:
 *                 type: string
 *                 description: |
 *                   ISO 3166-1 alpha-2 country code for pricing region resolution.
 *                   Falls back to org.country if not provided.
 *                 example: "EG"
 *               coupon:
 *                 type: string
 *                 description: Optional coupon / discount code
 *                 example: "LAUNCH25"
 *               taxRate:
 *                 type: number
 *                 description: |
 *                   Optional tax rate as a decimal (e.g. 0.14 = 14%).
 *                   Defaults to 0 if not provided.
 *                 example: 0.14
 *     responses:
 *       200:
 *         description: Checkout session created successfully
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
 *                     checkoutUrl:
 *                       type: string
 *                       description: Provider redirect URL — send the user here to complete payment
 *                       example: "https://checkout.stripe.com/pay/cs_test_..."
 *                     contractId:
 *                       type: string
 *                       description: OrgContract created for this session
 *                       example: "64f1a2b3c4d5e6f7a8b9c0d2"
 *                     invoiceId:
 *                       type: string
 *                       description: PlatformInvoice awaiting payment confirmation
 *                       example: "64f1a2b3c4d5e6f7a8b9c0d3"
 *                     contractStatus:
 *                       type: string
 *                       description: |
 *                         "pending_activation" if org has an active trial (activates after trial ends).
 *                         "draft" if no trial (activates immediately on payment).
 *                       enum: [draft, pending_activation]
 *                       example: "pending_activation"
 *       400:
 *         description: Validation error (invalid interval, plan not active, org archived, etc.)
 *       403:
 *         description: Plan not publicly available or invalid org token
 *       404:
 *         description: Organization or PlanVersion not found
 *       500:
 *         description: Internal error — checkout session creation failed
 */
exports.createSession = async (req, res) => {
    authorize(req, "accounting.create");
    // organizationId is ALWAYS from the verified org JWT — never from body
    const organizationId = req.context.organizationId;

    const {
        planVersionId,
        billingInterval,
        provider,
        country,
        coupon,
        taxRate
    } = req.body;

    // ── Input guard ───────────────────────────────────────────────────────────
    if (!planVersionId || !billingInterval || !provider) {
        return res.status(400).json({
            success: false,
            error: {
                code: "MISSING_REQUIRED_FIELDS",
                message: "planVersionId, billingInterval, and provider are required"
            }
        });
    }

    try {
        const result = await createCheckoutSession({
            organizationId,
            planVersionId,
            billingInterval,
            provider,
            country: country || null,
            coupon: coupon || null,
            taxRate: typeof taxRate === "number" ? taxRate : 0
        });

        logger.info({
            organizationId,
            planVersionId,
            billingInterval,
            provider,
            contractId: result.contractId,
            invoiceId: result.invoiceId
        }, "[CheckoutController] Checkout session created");

        return res.status(200).json({
            success: true,
            data: result
        });

    } catch (err) {
        const status = err.status || 500;
        const code = err.code || "CHECKOUT_ERROR";

        logger.error({
            err,
            organizationId,
            planVersionId,
            provider
        }, "[CheckoutController] Checkout session creation failed");

        return res.status(status).json({
            success: false,
            error: { code, message: err.message }
        });
    }
};
