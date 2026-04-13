/**
 * billingIntegrity.controller.js
 * Sprint 5 — Admin Billing Integrity Debug Endpoint
 *
 * ENDPOINT:
 *   GET /api/platform/billing/integrity-check
 *
 * GUARD:
 *   platformProtect + VIEW_PLATFORM_ANALYTICS
 *   (VIEW_BILLING does not exist in PLATFORM_CAPABILITIES — Sentinel Rule #1)
 *
 * RESPONSE (Section 5 shape):
 *
 *   Healthy:
 *   {
 *     "success": true,
 *     "ok": true,
 *     "checks": {
 *       "paymentTotals": "ok",
 *       "replayRevenue": "ok",
 *       "anomalyDetection": "ok"
 *     },
 *     "anomalies": []
 *   }
 *
 *   Corrupted state:
 *   {
 *     "success": true,
 *     "ok": false,
 *     "checks": { "paymentTotals": "failed" },
 *     "anomalies": [
 *       {
 *         "type": "PAYMENT_WITHOUT_INVOICE",
 *         "ledgerId": "...",
 *         "organizationId": "..."
 *       }
 *     ]
 *   }
 *
 * OPTIONS (query params):
 *   ?organizationId=<id>   — scope to a single org
 *   ?currency=USD          — scope to a single currency
 *   ?from=ISO-DATE         — start of scan window
 *   ?to=ISO-DATE           — end of scan window
 *
 * READ-ONLY. Never writes to any collection.
 *
 * PLANE: Platform
 */

"use strict";

const { runFullIntegrityCheck } = require("../services/billingInvariantMonitor.service");
const logger = require("@utils/logger");

/**
 * @swagger
 * /api/platform/billing/integrity-check:
 *   get:
 *     summary: Run billing invariant integrity check
 *     description: |
 *       Executes all billing invariant checks and returns a structured health report.
 *       Read-only — never modifies any collection.
 *
 *       Checks performed:
 *         1. Payment Totals Parity — ledger vs invoice totals
 *         2. Ledger Revenue Replay — net revenue reconstructible from events
 *         3. Anomaly Detection     — negative invoices, orphans, duplicates,
 *                                    PAYMENT_WITHOUT_INVOICE
 *
 *       Required capability: VIEW_PLATFORM_ANALYTICS
 *     tags: [Billing Integrity]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: string
 *         description: Scope check to a single organization
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           example: USD
 *         description: "Scope check to a single currency (ISO 4217)"
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start of date range (inclusive)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End of date range (inclusive)
 *     responses:
 *       200:
 *         description: Integrity check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 ok:
 *                   type: boolean
 *                   description: true if all checks passed and no anomalies found
 *                 checks:
 *                   type: object
 *                   properties:
 *                     paymentTotals:
 *                       type: string
 *                       enum: [ok, failed]
 *                     replayRevenue:
 *                       type: string
 *                       enum: [ok, failed]
 *                     anomalyDetection:
 *                       type: string
 *                       enum: [ok, failed]
 *                 anomalies:
 *                   type: array
 *                   description: Flat list of detected anomalies (empty if ok=true)
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum:
 *                           - NET_NEGATIVE_ORG
 *                           - NEGATIVE_INVOICE
 *                           - ORPHANED_INVOICE
 *                           - PAID_INVOICE_NO_LEDGER
 *                           - DUPLICATE_INVOICE_NUMBER
 *                           - PAYMENT_WITHOUT_INVOICE
 *                       organizationId:
 *                         type: string
 *                         nullable: true
 *                       ledgerId:
 *                         type: string
 *                         nullable: true
 *                       invoiceId:
 *                         type: string
 *                         nullable: true
 *       500:
 *         description: Internal error during integrity check
 */
exports.getBillingIntegrityStatus = async (req, res) => {
    const correlationId = `admin-integrity-${Date.now()}`;

    try {
        // Optional: allow scoping via query params for targeted diagnostics
        const opts = { correlationId };
        if (req.query.organizationId) opts.organizationId = req.query.organizationId;
        if (req.query.currency) opts.currency = req.query.currency;
        if (req.query.from) opts.from = new Date(req.query.from);
        if (req.query.to) opts.to = new Date(req.query.to);

        const result = await runFullIntegrityCheck(opts);

        logger.info(
            {
                event: "BILLING_INTEGRITY_ADMIN_CHECK",
                actorId: req.platformUser?._id,
                ok: result.ok,
                correlationId,
                anomalyCount: result.anomalies?.length ?? 0
            },
            "[BillingIntegrityController] Admin integrity check served"
        );

        // Section 5: { success, ok, checks, anomalies } flat shape
        return res.json({
            success: true,
            ok: result.ok,
            checks: result.checks,
            anomalies: result.anomalies,
            // Include full diagnostic for admin inspection
            correlationId: result.correlationId,
            ranAt: result.ranAt,
            paymentTotals: result.paymentTotals,
            revenueReplay: result.revenueReplay,
            anomalyDetection: result.anomalyDetection
        });

    } catch (err) {
        logger.error(
            { err, correlationId, actorId: req.platformUser?._id },
            "[BillingIntegrityController] Integrity check failed"
        );
        return res.status(500).json({
            success: false,
            message: "Billing integrity check failed. See server logs.",
            correlationId
        });
    }
};
