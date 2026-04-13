/**
 * billingCredits.controller.js
 * v22.0 — Organization Credit Balance API
 *
 * Exposes the credit balance computed by the LedgerEngine.
 *
 * Routes:
 *   GET /billing/organizations/:orgId/credits → getCredits
 *
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     organizationId: { type: string }
 *                     creditBalance: { type: number }
 *                     credits:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type: { type: string, enum: [credit, debit] }
 *                           eventType: { type: string }
 *                           amount: { type: number }
 *                           currency: { type: string }
 *                           invoiceId: { type: string }
 *                           createdAt: { type: string, format: date-time }
 *       400:
 *         description: Invalid organization ID
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact:  None — no new capabilities needed
 *   RBAC impact:      Uses VIEW_ORGANIZATIONS (existing)
 *   Route guard:      GET → VIEW_* → compliant
 *   Plane isolation:  Platform only
 *   Regression risk:  LOW — new additive route
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const LedgerEngine = require("../engines/LedgerEngine.service");
const logger = require("@utils/logger");

/**
 * GET /billing/organizations/:orgId/credits
 */
exports.getCredits = async (req, res) => {
    try {
        const { orgId } = req.params;

        if (!mongoose.isValidObjectId(orgId)) {
            return res.status(400).json({
                success: false,
                error: { message: "Invalid organization ID", code: "INVALID_ORG_ID" }
            });
        }

        const { creditBalance, credits } = await LedgerEngine.getCreditBalance(orgId);

        return res.json({
            success: true,
            data: {
                organizationId: orgId,
                creditBalance,
                credits
            }
        });
    } catch (err) {
        logger.error(
            { err, orgId: req.params?.orgId, requestId: req.requestId },
            "[billingCredits] getCredits failed"
        );
        return res.status(500).json({
            success: false,
            error: { message: "Failed to retrieve credit balance", code: "CREDIT_BALANCE_ERROR" }
        });
    }
};
