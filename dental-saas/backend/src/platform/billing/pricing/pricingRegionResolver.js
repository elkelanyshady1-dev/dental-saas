/**
 * pricingRegionResolver.js
 * Platform Billing — Pricing Engine
 *
 * Resolves a country ISO code → regionCode → currency.
 *
 * Design:
 *   - Source of truth is PlanVersion.pricing.regions[].countries[]
 *   - This file handles FALLBACK only when no matching region is found
 *     in PlanVersion data. PlanVersion regions are always checked first.
 *   - The static map here covers "default" routing for countries not
 *     explicitly listed in any region.
 *
 * ISO Country Rule (Sentinel §4):
 *   - Input MUST be ISO 3166-1 alpha-2 (EG, SA, AE, US, GB, etc.)
 *   - Display names are never accepted or stored
 *
 * PLANE: Platform
 */

"use strict";

// ─── Fallback region map ──────────────────────────────────────────────────────
// Used ONLY when a country is not covered by any PlanVersion region.
// Extend this as new markets are added.
const COUNTRY_TO_REGION_FALLBACK = {
    // North America
    US: "US", CA: "US", MX: "US",

    // Europe
    GB: "EU", FR: "EU", DE: "EU", IT: "EU", ES: "EU",
    NL: "EU", SE: "EU", NO: "EU", DK: "EU", FI: "EU",
    PL: "EU", AT: "EU", BE: "EU", CH: "EU", PT: "EU",

    // MEA (Middle East & Africa)
    EG: "MEA", SA: "MEA", AE: "MEA", KW: "MEA",
    QA: "MEA", BH: "MEA", OM: "MEA", JO: "MEA",
    LB: "MEA", MA: "MEA", TN: "MEA", DZ: "MEA",
    LY: "MEA", IQ: "MEA", SD: "MEA", YE: "MEA",

    // Asia Pacific
    IN: "APAC", SG: "APAC", AU: "APAC", NZ: "APAC",
    JP: "APAC", KR: "APAC", PH: "APAC", MY: "APAC",
    TH: "APAC", ID: "APAC", VN: "APAC",
};

// ─── Fallback currency map ────────────────────────────────────────────────────
const REGION_TO_CURRENCY_FALLBACK = {
    US: "USD",
    EU: "EUR",
    MEA: "USD",  // Most MEA contracts priced in USD at platform level
    APAC: "USD",
    GLOBAL: "USD",
};

/**
 * resolveRegionFromCountry
 *
 * Attempts to find a matching region from PlanVersion.pricing.regions[]
 * before falling back to the static map.
 *
 * @param {string} countryCode  - ISO 3166-1 alpha-2 (required, uppercase)
 * @param {Array}  [regions]    - PlanVersion.pricing.regions[] (optional)
 * @returns {{ regionCode: string, currency: string | null }}
 *   currency is null if the region was found in the fallback map (caller
 *   must use the PlanVersion region's currency field).
 */
function resolveRegionFromCountry(countryCode, regions = []) {
    if (!countryCode || typeof countryCode !== "string") {
        return { regionCode: "GLOBAL", currency: "USD", fromPlanVersion: false };
    }

    const iso = countryCode.toUpperCase().trim();

    // ── 1. Check PlanVersion regions first (authoritative) ────────────────────
    if (regions && regions.length > 0) {
        const match = regions.find(r =>
            Array.isArray(r.countries) && r.countries.includes(iso)
        );
        if (match) {
            return {
                regionCode: match.regionCode,
                currency: match.currency,
                fromPlanVersion: true,
                _region: match          // carry raw region for price lookup
            };
        }
    }

    // ── 2. Fallback to static map ──────────────────────────────────────────────
    const regionCode = COUNTRY_TO_REGION_FALLBACK[iso] || "GLOBAL";
    const currency = REGION_TO_CURRENCY_FALLBACK[regionCode] || "USD";

    return { regionCode, currency, fromPlanVersion: false };
}

/**
 * resolveRegionCode
 * Simple utility used by non-pricing code (e.g. org provisioning).
 */
function resolveRegionCode(countryCode) {
    const iso = (countryCode || "").toUpperCase().trim();
    return COUNTRY_TO_REGION_FALLBACK[iso] || null;
    // null is allowed by Organization schema enum — "GLOBAL" is not
}

module.exports = {
    resolveRegionFromCountry,
    resolveRegionCode,
    COUNTRY_TO_REGION_FALLBACK,
    REGION_TO_CURRENCY_FALLBACK,
};
