/**
 * platformPlanImpact.controller.js
 * Platform Billing — Plan Version Revenue Impact Preview
 *
 * Provides a Stripe-style pre-publish safety preview:
 * shows how many organizations are on a given PlanVersion
 * and the estimated monthly revenue before an admin publishes a new version.
 *
 * This is a READ-ONLY analytics endpoint.
 *
 * Architecture:
 *   - Queries OrgContract (source of truth for revenue locked price)
 *   - Never modifies Plan, PlanVersion, OrgContract, or Organization
 *   - Revenue is estimated from OrgContract.lockedPrice — not from future pricing
 *
 * PLANE:              Platform
 * COLLECTION ACCESS:  planversions (read), orgcontracts (read)
 * BILLING LOGIC:      NONE modified
 */

"use strict";

const PlanVersion = require("../models/PlanVersion.model").default;
const OrgContract = require("../models/OrgContract.model").default;
const logger = require("@utils/logger");

/**
 * @swagger
 * /api/platform/plan-versions/{versionId}/impact:
 *   get:
 *     summary: Preview revenue impact before publishing a plan version
 *     description: |
 *       Returns a Stripe-style safety preview of how many organizations are currently
 *       on this PlanVersion and the estimated monthly revenue they represent.
 *
 *       Intended use: display a confirmation banner before an admin publishes
 *       a new version that replaces the current active version.
 *
 *       **Read-only** — no data is modified.
 *
 *       Required capability: VIEW_PLATFORM_ANALYTICS
 *     tags: [Platform Plan Versions]
 *     security:
 *       - platformToken: []
 *     parameters:
 *       - in: path
 *         name: versionId
 *         required: true
 *         description: PlanVersion._id to preview impact for
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Revenue impact summary
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
 *                     versionId:
 *                       type: string
 *                       example: "64fa12c8e913b3001f3a0001"
 *                     templateCode:
 *                       type: string
 *                       example: "pro"
 *                     versionTag:
 *                       type: string
 *                       example: "v3"
 *                     versionStatus:
 *                       type: string
 *                       enum: [draft, active, deprecated]
 *                       example: "active"
 *                     organizationsAffected:
 *                       type: integer
 *                       description: Number of orgs with an active OrgContract on this version
 *                       example: 84
 *                     estimatedMonthlyRevenue:
 *                       type: number
 *                       description: Sum of lockedPrice across all active contracts on this version
 *                       example: 4116
 *                     currency:
 *                       type: string
 *                       description: Currency from the first pricing region, or "MIXED" if contracts use multiple currencies
 *                       example: "USD"
 *                     contractCount:
 *                       type: integer
 *                       description: Total active OrgContract docs (equals organizationsAffected unless an org has multiple)
 *                       example: 84
 *       404:
 *         description: PlanVersion not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal error
 */
exports.previewPlanVersionImpact = async (req, res) => {
    try {
        const { versionId } = req.params;

        // ── 1. Load PlanVersion ────────────────────────────────────────────────
        const version = await PlanVersion.findById(versionId).lean();
        if (!version) {
            return res.status(404).json({
                success: false,
                message: "PlanVersion not found"
            });
        }

        // ── 2. Aggregate active contracts on this version ──────────────────────
        // We query OrgContract (source of truth for commercial terms):
        //   - planVersionId matches this version
        //   - contractStatus === "active" (only live subscriptions count)
        //
        // Note: we intentionally do NOT filter by billing interval here.
        // Revenue aggregation is done in lockedPrice terms so it's interval-agnostic.
        const activeContracts = await OrgContract.find({
            planVersionId: versionId,
            contractStatus: "active"
        })
            .select("organizationId lockedPrice currency")
            .lean();

        const orgCount = activeContracts.length;
        const contractCount = activeContracts.length;

        // ── 3. Compute estimated revenue ───────────────────────────────────────
        // lockedPrice is the authoritative monthly subscription price for each contract.
        // Sum gives the estimated monthly revenue if all contracts renew.
        const monthlyRevenue = activeContracts.reduce(
            (sum, c) => sum + (c.lockedPrice || 0),
            0
        );

        // ── 4. Resolve currency ────────────────────────────────────────────────
        // Prefer the primary region currency from the version's pricing definition.
        // Fall back to contract-level currency detection.
        const versionCurrency = version.pricing?.regions?.[0]?.currency;

        let resolvedCurrency = versionCurrency || "USD";
        if (!versionCurrency && activeContracts.length > 0) {
            // Check whether contracts use a uniform currency
            const currencies = [...new Set(activeContracts.map(c => c.currency).filter(Boolean))];
            resolvedCurrency = currencies.length === 1 ? currencies[0] : "MIXED";
        }

        // ── 5. Log for observability ───────────────────────────────────────────
        logger.info(
            {
                versionId,
                templateCode: version.templateCode,
                versionTag: version.versionTag,
                orgCount,
                monthlyRevenue,
                actorId: req.platformUser._id
            },
            "[PlanImpactController] Impact preview served"
        );

        return res.json({
            success: true,
            data: {
                versionId,
                templateCode: version.templateCode,
                versionTag: version.versionTag,
                versionStatus: version.status,
                organizationsAffected: orgCount,
                estimatedMonthlyRevenue: monthlyRevenue,
                currency: resolvedCurrency,
                contractCount
            }
        });
    } catch (err) {
        logger.error({ err }, "[PlanImpactController] previewPlanVersionImpact failed");
        return res.status(500).json({ success: false, message: err.message });
    }
};
