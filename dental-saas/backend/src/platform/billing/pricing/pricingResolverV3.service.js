/**
 * pricingResolverV3.service.js
 * Platform Billing — v3 Region-Based Pricing Resolution Engine
 *
 * Resolution Priority:
 *   1. Country Override (exact match → override pricing)
 *   2. Region Default   (if country is not excluded from region)
 *   3. Global Default   (pricingV3.default fallback)
 *
 * This service is ONLY called when:
 *   - PRICING_ENGINE=v3 env flag is set
 *   - AND planVersion.pricingV3 is populated
 *
 * If either condition is false, the system falls back to v2
 * (pricingEngine.service.js → pricingRegionResolver.js).
 *
 * PLANE: Platform
 */

"use strict";

const { mapCountryToRegion } = require("../constants/regionMap.constant");
const logger = require("@utils/logger");

/**
 * Resolves the correct pricing tier for a given country code.
 *
 * @param {object} options
 * @param {object} options.planVersion   - PlanVersion document (must have pricingV3 populated)
 * @param {string} options.countryCode   - ISO 3166-1 alpha-2 (e.g., "EG", "US")
 * @param {string} [options.billingInterval="monthly"] - "monthly" | "yearly"
 *
 * @returns {{
 *   currency: string,
 *   price: number,
 *   regionCode: string,
 *   resolvedVia: "override" | "region" | "global",
 *   providerPriceIds: { stripe?: string, paymob?: string } | null
 * }}
 *
 * @throws {Error} If pricingV3 is not configured or country cannot be resolved.
 */
function resolvePriceV3({ planVersion, countryCode, billingInterval = "monthly" }) {
    if (!planVersion?.pricingV3) {
        throw new Error(
            "[PricingResolverV3] pricingV3 is not configured on this PlanVersion. " +
            "Cannot resolve v3 pricing. Ensure PRICING_ENGINE=v3 only when plans have pricingV3 data."
        );
    }

    if (!["monthly", "yearly"].includes(billingInterval)) {
        throw new Error(
            `[PricingResolverV3] Invalid billingInterval: "${billingInterval}". Must be "monthly" or "yearly".`
        );
    }

    const iso = (countryCode || "").toUpperCase().trim();
    if (!iso) {
        throw new Error("[PricingResolverV3] countryCode is required for v3 pricing resolution.");
    }

    const pv3 = planVersion.pricingV3;
    const regionCode = mapCountryToRegion(iso);

    // ── Step 1: Find matching region ──────────────────────────────────────────
    let matchedRegion = null;
    if (regionCode) {
        matchedRegion = pv3.regions.find(r => r.regionCode === regionCode);
    }

    // ── Observability: region not configured ──────────────────────────────────
    if (!matchedRegion && regionCode) {
        logger.warn({
            country: iso, regionCode, planVersionId: planVersion._id,
            configuredRegions: pv3.regions.map(r => r.regionCode)
        }, "[PRICING_FALLBACK_GLOBAL] Region mapped but not configured in pricingV3 — falling to global default");
    } else if (!regionCode) {
        logger.warn({
            country: iso, planVersionId: planVersion._id
        }, "[PRICING_FALLBACK_GLOBAL] Country not mapped to any region — falling to global default");
    }

    // ── Step 2: Check for Country Override (highest priority) ─────────────────
    if (matchedRegion && matchedRegion.overrides && matchedRegion.overrides.length > 0) {
        const override = matchedRegion.overrides.find(o => o.country === iso);
        if (override) {
            const providerKey = `${billingInterval}`;
            return {
                currency: override.currency,
                price: override[billingInterval],
                regionCode: matchedRegion.regionCode,
                resolvedVia: "override",
                providerPriceIds: {
                    stripe: override[`stripePriceId_${providerKey}`] || null,
                    paymob: override[`paymobPriceId_${providerKey}`] || null,
                },
                override: {
                    country: override.country,
                    currency: override.currency,
                    monthly: override.monthly,
                    yearly: override.yearly,
                }
            };
        }
    }

    // ── Step 3: Check if country is excluded from region ──────────────────────
    if (matchedRegion) {
        const isExcluded = (matchedRegion.excludedCountries || []).includes(iso);

        if (!isExcluded) {
            // ── Step 3a: Apply Region Default Pricing ─────────────────────────
            const providerIds = matchedRegion.providerPriceIds || {};
            return {
                currency: matchedRegion.currency,
                price: matchedRegion[billingInterval],
                regionCode: matchedRegion.regionCode,
                resolvedVia: "region",
                providerPriceIds: {
                    stripe: providerIds?.stripe?.[billingInterval] || null,
                    paymob: providerIds?.paymob?.[billingInterval] || null,
                },
                override: null
            };
        }
        // If excluded, fall through to global default
        logger.info({
            country: iso, regionCode: matchedRegion.regionCode,
            planVersionId: planVersion._id
        }, "[PRICING_COUNTRY_EXCLUDED] Country excluded from region — falling to global default");
    }

    // ── Step 4: Global Default Fallback ───────────────────────────────────────
    if (!pv3.default) {
        throw new Error(
            `[PricingResolverV3] No pricing available for country "${iso}". ` +
            `Region "${regionCode || "UNKNOWN"}" ${matchedRegion ? "excludes this country" : "has no pricing configured"}. ` +
            `Global default pricing is also missing on PlanVersion ${planVersion._id}.`
        );
    }

    return {
        currency: pv3.default.currency,
        price: pv3.default[billingInterval],
        regionCode: regionCode || "GLOBAL",
        resolvedVia: "global",
        providerPriceIds: null,
        override: null
    };
}

/**
 * Legacy v2 fallback — delegates to the existing v2 pricing logic.
 * Called when pricingV3 is null/undefined on the PlanVersion.
 *
 * @param {object} planVersion
 * @param {string} countryCode
 * @param {string} billingInterval
 * @returns {{ currency: string, price: number, regionCode: string, resolvedVia: "legacy_v2" }}
 */
function resolveLegacyPricing(planVersion, countryCode, billingInterval = "monthly") {
    const regions = planVersion?.pricing?.regions || [];
    const iso = (countryCode || "").toUpperCase().trim();

    // v2 resolution: find region by countries[] array
    let matchedRegion = null;
    if (iso && regions.length > 0) {
        matchedRegion = regions.find(r =>
            Array.isArray(r.countries) && r.countries.includes(iso)
        );
    }

    // Fallback to first region if no country match
    if (!matchedRegion && regions.length > 0) {
        matchedRegion = regions[0];
    }

    if (!matchedRegion) {
        throw new Error(
            `[PricingResolverV3] No legacy v2 pricing available for country "${iso}" ` +
            `on PlanVersion ${planVersion._id}. No regions configured.`
        );
    }

    return {
        currency: matchedRegion.currency,
        price: matchedRegion[billingInterval] || matchedRegion.monthly,
        regionCode: matchedRegion.regionCode,
        resolvedVia: "legacy_v2",
        providerPriceIds: {
            stripe: matchedRegion.providerPriceIds?.stripe?.[billingInterval] || null,
            paymob: matchedRegion.providerPriceIds?.paymob?.[billingInterval] || null,
        },
        override: null,
        // Carry legacy region reference for downstream compatibility
        _legacyRegion: matchedRegion
    };
}

/**
 * Unified entry point — auto-selects v2 or v3 based on planVersion state.
 * This is the RECOMMENDED function to call from the billing engine.
 *
 * @param {object} options
 * @param {object} options.planVersion
 * @param {string} options.countryCode
 * @param {string} [options.billingInterval]
 * @returns {object} Resolved pricing result
 */
function resolvePrice({ planVersion, countryCode, billingInterval = "monthly" }) {
    const engineMode = process.env.PRICING_ENGINE || "v2";

    // Use v3 resolver if flag is set AND v3 data exists
    if (engineMode === "v3" && planVersion?.pricingV3) {
        return resolvePriceV3({ planVersion, countryCode, billingInterval });
    }

    // Fallback to v2
    return resolveLegacyPricing(planVersion, countryCode, billingInterval);
}

module.exports = {
    resolvePriceV3,
    resolveLegacyPricing,
    resolvePrice,
};
