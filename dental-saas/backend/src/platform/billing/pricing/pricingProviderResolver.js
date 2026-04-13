/**
 * pricingProviderResolver.js
 * Platform Billing — Pricing Engine
 *
 * Resolves the payment provider's price identifier for a given
 * PlanVersion region + billing interval.
 *
 * Reads from the REAL schema shape:
 *   PlanVersion.pricing.regions[].providerPriceIds = {
 *     stripe:  { monthly, yearly, biennial },
 *     paymob:  { monthly, yearly, biennial },
 *     paddle:  { monthly, yearly, biennial },   ← future
 *     adyen:   { monthly, yearly, biennial }    ← future
 *   }
 *
 * Provider Support:
 *   ✅ stripe   — live
 *   ✅ paymob   — live
 *   ⬜ paddle   — schema ready, provider not wired
 *   ⬜ adyen    — schema ready, provider not wired
 *   ✅ manual   — always returns null (no provider ID needed)
 *
 * Returns null when:
 *   - Provider is "manual"
 *   - Provider not listed in providerPriceIds
 *   - Region not found in PlanVersion
 *   - Billing interval not found for that provider+region
 *   Callers must handle null gracefully (manual invoicing fallback).
 *
 * PLANE: Platform
 */

"use strict";

const SUPPORTED_PROVIDERS = ["stripe", "paymob", "paddle", "adyen", "manual"];
const SUPPORTED_INTERVALS = ["monthly", "yearly", "biennial"];

/**
 * resolveProviderPriceId
 *
 * @param {object} options
 * @param {object}   options.planVersion      - PlanVersion lean document
 * @param {string}   options.provider         - "stripe" | "paymob" | "paddle" | "adyen" | "manual"
 * @param {string}   options.regionCode       - Region code matched by pricingRegionResolver
 * @param {string}   options.billingInterval  - "monthly" | "yearly" | "biennial"
 * @returns {string | null}  Provider price ID or null
 */
function resolveProviderPriceId({ planVersion, provider, regionCode, billingInterval }) {
    // Manual invoicing has no provider price ID
    if (!provider || provider === "manual") return null;

    if (!SUPPORTED_PROVIDERS.includes(provider)) {
        throw new Error(
            `[PricingProviderResolver] Unknown provider "${provider}". ` +
            `Supported: ${SUPPORTED_PROVIDERS.join(", ")}`
        );
    }

    if (!SUPPORTED_INTERVALS.includes(billingInterval)) {
        throw new Error(
            `[PricingProviderResolver] Unknown billing interval "${billingInterval}". ` +
            `Supported: ${SUPPORTED_INTERVALS.join(", ")}`
        );
    }

    const regions = planVersion?.pricing?.regions;
    if (!regions || regions.length === 0) return null;

    // ── Find the region block that matches the resolved regionCode ────────────
    // Try exact regionCode match first, then fall back to first region as default
    const region =
        regions.find(r => r.regionCode === regionCode) ||
        regions.find(r => r.regionCode === "GLOBAL") ||
        regions[0];

    if (!region) return null;

    // ── Resolve provider price ID from the region block ───────────────────────
    const priceId = region.providerPriceIds?.[provider]?.[billingInterval];
    return priceId || null;
}

/**
 * listConfiguredProviders
 *
 * Returns which providers have at least one price ID configured on a version,
 * useful for the platform UI to surface configuration gaps.
 *
 * @param {object} planVersion - PlanVersion lean document
 * @returns {string[]}  Array of configured provider names
 */
function listConfiguredProviders(planVersion) {
    const regions = planVersion?.pricing?.regions || [];
    const configured = new Set();

    for (const region of regions) {
        for (const provider of SUPPORTED_PROVIDERS.filter(p => p !== "manual")) {
            const ids = region.providerPriceIds?.[provider];
            if (ids && Object.values(ids).some(Boolean)) {
                configured.add(provider);
            }
        }
    }

    return Array.from(configured);
}

module.exports = {
    resolveProviderPriceId,
    listConfiguredProviders,
    SUPPORTED_PROVIDERS,
    SUPPORTED_INTERVALS,
};
