/**
 * planResolver.js
 * Phase v6.0 — Contract-First Plan Resolution
 *
 * REMOVED: org.planId population (legacy — field no longer in schema)
 * NEW: Resolves plan data from OrgContract.planVersionId
 *
 * Contract-First invariant:
 *   OrgContract.planVersionId → PlanVersion (authoritative commercial reference)
 *   Organization.subscription.currentContractId → OrgContract
 */

"use strict";

const Organization = require("../../shared/models/Organization").default;
const OrgContract = require("../../platform/billing/models/OrgContract.model").default;
const PlanVersion = require("../../platform/billing/models/PlanVersion.model").default;

/**
 * resolvePlan
 * Resolves the active PlanVersion for an organization via its current contract.
 *
 * @param {string} organizationId
 * @returns {Promise<Object>} The PlanVersion document
 */
async function resolvePlan(organizationId) {
    if (!organizationId) {
        throw new Error("Plan Resolution Error: organizationId is required.");
    }

    const org = await Organization.findById(organizationId).lean();
    if (!org) {
        throw new Error(`Plan Resolution Error: Organization ${organizationId} not found.`);
    }

    // Resolve via active contract
    // NOTE: currentContractId is a ROOT-LEVEL field on Organization, NOT under subscription.
    let planVersion = null;

    if (org.currentContractId) {
        const contract = await OrgContract.findById(org.currentContractId).lean();
        if (contract?.planVersionId) {
            planVersion = await PlanVersion.findById(contract.planVersionId).lean();
        }
    }

    if (!planVersion) {
        // Fallback: find any active trial-tier version (for orgs without contracts yet)
        planVersion = await PlanVersion.findOne({ templateCode: "trial-tier", status: "active" }).lean();
    }

    // ── Happy path: PlanVersion resolved (contract or trial-tier DB) ──────
    if (planVersion) {
        if (planVersion.status !== "active") {
            const err = new Error(`PlanVersion '${planVersion.versionTag}' is not active (status: ${planVersion.status}).`);
            err.code = "PLAN_INACTIVE";
            err.planVersionId = planVersion._id?.toString();
            throw err;
        }
        return planVersion;
    }

    // ── STRICT: No plan found — NEVER silently degrade ────────────────────
    // The silent hardcoded fallback was removed in Phase 7 hardening.
    // Every org MUST have an active PlanVersion before serving org requests.
    //
    // To fix: node scripts/seedTrialPlan.js  (creates the trial-tier PlanVersion)
    //         node scripts/enableOrthoFeatures.js  (grants entitlement override)
    const logger = require("../../utils/logger");
    logger.error({
        event:          "PLAN_NOT_FOUND",
        organizationId: String(organizationId),
        hint:           "Run: node scripts/seedTrialPlan.js",
    }, `[PlanResolver] No active PlanVersion found for org ${organizationId}. Run node scripts/seedTrialPlan.js to fix.`);

    const notFoundErr = new Error("PLAN_NOT_FOUND");
    notFoundErr.code = "PLAN_NOT_FOUND";
    notFoundErr.organizationId = String(organizationId);
    throw notFoundErr;
}

/**
 * resolveRegionalPrice
 * Extracts the correct price block for a given country from a PlanVersion.
 *
 * Works for both Plan (legacy) and PlanVersion (new) — pricing structure is identical.
 *
 * @param {Object} planOrVersion - Plan or PlanVersion document
 * @param {string} countryCode - ISO Country Code
 */
function resolveRegionalPrice(planOrVersion, countryCode) {
    if (!planOrVersion || !planOrVersion.pricing) return null;

    const regions = planOrVersion.pricing.regions;
    if (!regions || !Array.isArray(regions)) return null;

    // 1. Find explicit region match by country inclusion
    const region = regions.find(r => r.countries && r.countries.includes(countryCode));
    if (region) return region;

    // 2. Fallback: Find region with code matching country code (e.g. Region "US" for Country "US")
    const specificRegion = regions.find(r => r.regionCode === countryCode);
    if (specificRegion) return specificRegion;

    // 3. Absolute Fallback: first available region
    return regions[0] || null;
}

module.exports = {
    resolvePlan,
    resolveRegionalPrice
};
