/**
 * effectivePlanBuilder.js
 * Phase v6.0 — Add-On Monetization Engine
 */

"use strict";

const { getPlatformConnection } = require("@core/db/dbResolver");
const getModel = require("@core/db/getModel");
const OrgAddOnDef = require("../../organization/billing/models/orgAddOn.model");
const { resolvePlan } = require("./planResolver");

/**
 * buildEffectivePlan
 * Computes the aggregate plan capabilities for an organization.
 * 
 * @param {string} organizationId 
 * @returns {Promise<Object>} Unified plan object with combined benefits
 */
async function buildEffectivePlan(organizationId) {
    const basePlan = await resolvePlan(organizationId);
    const conn = getPlatformConnection();
    const OrgAddOn = getModel(conn, OrgAddOnDef);
    const activeAddOns = await OrgAddOn.find({
        organizationId,
        status: "active"
    }).populate("addOnId");

    // Start with a clean deep copy of base plan capabilities to avoid mutating cache
    const effectivePlan = JSON.parse(JSON.stringify(basePlan.toObject ? basePlan.toObject() : basePlan));

    // Track used add-ons for debugging/billing
    effectivePlan.activeAddOnCodes = [];

    for (const orgAddOn of activeAddOns) {
        const addOn = orgAddOn.addOnId;
        if (!addOn || !addOn.isActive) continue;

        effectivePlan.activeAddOnCodes.push(addOn.code);

        // Apply benefits based on type
        switch (addOn.type) {
            case "LIMIT":
                // Increment numeric limits (e.g. maxUsers, maxBranches)
                Object.keys(addOn.benefits).forEach(key => {
                    if (typeof effectivePlan.limits[key] === 'number') {
                        // -1 means unlimited, so if either is -1, result is -1
                        if (effectivePlan.limits[key] === -1 || addOn.benefits[key] === -1) {
                            effectivePlan.limits[key] = -1;
                        } else {
                            effectivePlan.limits[key] += addOn.benefits[key];
                        }
                    }
                });
                break;

            case "QUOTA":
                // Increment communication quotas
                Object.keys(addOn.benefits).forEach(key => {
                    if (typeof effectivePlan.modules?.communication?.[key] === 'number') {
                        effectivePlan.modules.communication[key] += addOn.benefits[key];
                    }
                });
                // Phase 4.0b: Also increment storage quotas if applicable
                if (effectivePlan.quotas) {
                    Object.keys(addOn.benefits).forEach(key => {
                        if (typeof effectivePlan.quotas[key] === 'number') {
                            if (effectivePlan.quotas[key] === -1 || addOn.benefits[key] === -1) {
                                effectivePlan.quotas[key] = -1;
                            } else {
                                effectivePlan.quotas[key] += addOn.benefits[key];
                            }
                        }
                    });
                }
                break;

            case "FEATURE":
                // Enable boolean features or modules
                Object.keys(addOn.benefits).forEach(key => {
                    // If it's a module flag
                    if (effectivePlan.modules[key] !== undefined) {
                        if (typeof effectivePlan.modules[key] === 'boolean') {
                            effectivePlan.modules[key] = effectivePlan.modules[key] || addOn.benefits[key];
                        } else if (typeof effectivePlan.modules[key] === 'object') {
                            effectivePlan.modules[key].enabled = effectivePlan.modules[key].enabled || addOn.benefits[key];
                        }
                    }
                });
                break;
        }
    }

    return effectivePlan;
}

module.exports = {
    buildEffectivePlan
};
