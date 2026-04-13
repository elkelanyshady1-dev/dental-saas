/**
 * planRevenueImpact.service.js
 * Platform Billing — Plan Version Revenue Impact + Simulation
 *
 * Provides a Stripe-style pre-publish safety preview:
 *   • How many organizations have an active contract on a given PlanVersion
 *   • Their current locked monthly revenue
 *   • Simulated monthly revenue at a hypothetical new price (optional)
 *   • Revenue delta (simulated − current)
 *   • Number of distinct countries represented
 *
 * READ-ONLY. Never writes, never calls billing engine.
 *
 * Used by:
 *   GET /api/platform/plan-versions/:id/revenue-impact
 *   GET /api/platform/plan-versions/:id/revenue-impact?simulatePrice=79
 *   → platformPlanVersion.controller.js → getPlanRevenueImpactController
 *
 * PLANE:              Platform
 * BILLING LOGIC:      NONE modified
 * CONTRACT LIFECYCLE: NONE modified
 * PRICING ENGINE:     NONE modified
 * COLLECTION ACCESS:  orgcontracts (read — aggregate only)
 */

"use strict";

const mongoose = require("mongoose");
const OrgContract = require("../models/OrgContract.model").default;

/**
 * Aggregate revenue impact data for a given PlanVersion,
 * with an optional hypothetical price simulation.
 *
 * Simulation is computed in-process from the aggregation result —
 * no second DB query, no writes, no pricing engine calls.
 *
 * @param {string|import('mongoose').Types.ObjectId} planVersionId
 * @param {number|null} [simulatedPrice=null]
 *   If provided: hypothetical per-org price to use for simulation.
 *   If null/undefined: simulatedRevenue === currentRevenue, delta === 0.
 * @returns {Promise<{
 *   organizations:    number,
 *   currentRevenue:   number,
 *   simulatedRevenue: number,
 *   revenueDelta:     number,
 *   deltaDirection:   "increase"|"decrease"|"neutral",
 *   countries:        number,
 *   countryCodes:     string[]
 * }>}
 */
async function getPlanRevenueImpact(planVersionId, simulatedPrice = null) {
    // Cast to ObjectId — $match on _id-referenced fields requires ObjectId type,
    // not a raw string, for the index to be used correctly.
    const versionOid = typeof planVersionId === "string"
        ? new mongoose.Types.ObjectId(planVersionId)
        : planVersionId;

    // Single aggregation: count orgs, sum lockedPrice, collect country codes.
    // Simulation math is done in-process — no second round-trip needed.
    const result = await OrgContract.aggregate([
        {
            $match: {
                planVersionId: versionOid,
                contractStatus: "active"
            }
        },
        {
            $group: {
                _id: null,
                organizations: { $sum: 1 },
                currentRevenue: { $sum: "$lockedPrice" },
                // Collect unique non-null country codes for geographic spread
                countryCodes: { $addToSet: "$countryCode" }
            }
        },
        {
            $project: {
                _id: 0,
                organizations: 1,
                currentRevenue: 1,
                // Filter nulls/empty from the set before counting
                countryCodes: {
                    $filter: {
                        input: "$countryCodes",
                        as: "cc",
                        cond: {
                            $and: [
                                { $ne: ["$$cc", null] },
                                { $ne: ["$$cc", ""] }
                            ]
                        }
                    }
                }
            }
        }
    ]);

    // Zero-data case — version has no active contracts yet
    if (!result.length) {
        return {
            organizations: 0,
            currentRevenue: 0,
            simulatedRevenue: 0,
            revenueDelta: 0,
            deltaDirection: "neutral",
            countries: 0,
            countryCodes: []
        };
    }

    const row = result[0];
    const organizations = row.organizations;
    const currentRevenue = row.currentRevenue;
    const sortedCodes = (row.countryCodes || []).sort();

    // ── Simulation ────────────────────────────────────────────────────────────
    // simulatedRevenue: if a price is provided, it's the per-org rate × org count.
    // This matches Stripe's model — "what revenue would this version earn if all
    // current subscribers were on the new price?"
    //
    // NOTE: This is intentionally a READ-ONLY projection.
    //       It does NOT update lockedPrice, modify contracts, or touch the billing engine.
    const simPrice = (simulatedPrice != null && Number.isFinite(Number(simulatedPrice)))
        ? Number(simulatedPrice)
        : null;
    const simulatedRevenue = simPrice !== null
        ? Math.round(organizations * simPrice * 100) / 100   // 2 d.p. precision
        : currentRevenue;                                     // no simulation — delta = 0

    const revenueDelta = Math.round((simulatedRevenue - currentRevenue) * 100) / 100;
    const deltaDirection = revenueDelta > 0 ? "increase"
        : revenueDelta < 0 ? "decrease"
            : "neutral";

    return {
        organizations,
        currentRevenue,
        simulatedRevenue,
        revenueDelta,
        deltaDirection,
        countries: sortedCodes.length,
        countryCodes: sortedCodes
    };
}

module.exports = { getPlanRevenueImpact };
