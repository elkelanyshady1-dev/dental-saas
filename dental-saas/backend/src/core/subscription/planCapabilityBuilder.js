/**
 * planCapabilityBuilder.js
 * Phase v5.0 → v12.0 — Plan Policy Engine + Feature Registry Normalization
 *
 * TASK-ENTITLEMENT-SYSTEM-002:
 * Now uses FEATURE_REGISTRY.normalizeModules() to map PlanVersion schema keys
 * (e.g., "orthodonticsAdv") to canonical application keys (e.g., "orthodontics").
 *
 * This is the SINGLE CHOKE-POINT where raw PlanVersion data enters the
 * request pipeline. ALL downstream consumers receive normalized keys:
 *   subscriptionGuard → req.planCapabilities.modules (NORMALIZED)
 *   unifiedCapabilityMiddleware → req.capabilities.modules (NORMALIZED)
 *   requireEntitlement → reads normalized keys
 *
 * PLANE: Shared — called by subscriptionGuard (org plane).
 */

"use strict";

const { normalizeModules, buildFeatureCapabilities } = require("../../platform/featureRegistry");

/**
 * buildPlanCapabilities
 * Transforms a raw PlanVersion document into a structured capability object.
 *
 * @param {Object} plan - The PlanVersion document (lean or Mongoose)
 * @returns {Object} Structured capabilities with normalized module keys
 */
function buildPlanCapabilities(plan) {
    if (!plan) return {};

    const rawModules = plan.modules || {};

    // ── Normalize schema keys → canonical application keys ──
    // This resolves the orthodonticsAdv → orthodontics mismatch (and any future ones)
    const modules = normalizeModules(rawModules);

    // ── Derive sub-feature capabilities from module state ──
    const featureCapabilities = buildFeatureCapabilities(modules);

    return {
        modules,            // Normalized: { orthodontics: true, ... }
        rawModules,         // Original for debugging: { orthodonticsAdv: true, ... }
        limits: plan.limits || {},
        features: {
            // Legacy convenience flags (backward compat)
            canUseInventory: modules.inventory === true,
            canUseLab: modules.lab === true,
            canUseAdvancedOrtho: modules.orthodontics === true,
            canUseCommunication: modules.communication === true,
            // Sub-feature capabilities
            ...featureCapabilities,
        },
    };
}

module.exports = { buildPlanCapabilities };
