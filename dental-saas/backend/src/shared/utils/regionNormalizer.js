/**
 * regionNormalizer.js
 * Shared Utility — Country Code → Platform Region Normalization
 * v1.0
 *
 * Converts ISO 3166-1 alpha-2 country codes (EG, SA, AE)
 * to canonical platform regions (MEA, EU, US, APAC).
 *
 * Used by:
 *   - edgeRouter.js (normalizing edge-detected country to region)
 *   - authController.js (login region guard comparison)
 *   - authMiddleware.js (JWT region validation)
 *
 * INVARIANT: Organization.regionCode is the source of truth.
 *            Phone verification determines the org region at signup.
 *            This utility normalizes edge/CDN-detected country codes
 *            to the same region vocabulary.
 *
 * PLANE: Shared / Utils
 */

"use strict";

// ─── Country → Region mapping ─────────────────────────────────────────────────
// Covers all platform-supported countries.
// Countries not in this map are returned as-is (passthrough).
const COUNTRY_TO_REGION = {
    // Middle East & Africa (MEA)
    EG: "MEA",
    SA: "MEA",
    AE: "MEA",
    QA: "MEA",
    KW: "MEA",
    BH: "MEA",
    OM: "MEA",
    JO: "MEA",
    LB: "MEA",
    IQ: "MEA",
    PS: "MEA",
    YE: "MEA",
    LY: "MEA",
    SD: "MEA",
    TN: "MEA",
    MA: "MEA",
    DZ: "MEA",

    // United States & North America (US)
    US: "US",
    CA: "US",
    MX: "US",
    PR: "US",

    // Europe (EU)
    GB: "EU",
    DE: "EU",
    FR: "EU",
    IT: "EU",
    ES: "EU",
    NL: "EU",
    BE: "EU",
    CH: "EU",
    AT: "EU",
    SE: "EU",
    NO: "EU",
    DK: "EU",
    FI: "EU",
    PL: "EU",
    PT: "EU",
    IE: "EU",
    CZ: "EU",
    RO: "EU",
    GR: "EU",

    // Asia-Pacific (APAC)
    IN: "APAC",
    SG: "APAC",
    JP: "APAC",
    AU: "APAC",
    NZ: "APAC",
    KR: "APAC",
    TH: "APAC",
    MY: "APAC",
    ID: "APAC",
    PH: "APAC",
    VN: "APAC",
    HK: "APAC",
    TW: "APAC",
    CN: "APAC",
};

/**
 * normalizeRegion
 * Converts a country code, region code, or mixed input to a canonical platform region.
 *
 * @param {string|null|undefined} input - Country code (EG), region code (MEA), or null
 * @returns {string|null} - Canonical region code (MEA, EU, US, APAC) or passthrough, or null
 *
 * @example
 *   normalizeRegion("EG")   → "MEA"
 *   normalizeRegion("MEA")  → "MEA"  (already canonical)
 *   normalizeRegion("US")   → "US"
 *   normalizeRegion("gb")   → "EU"   (case insensitive)
 *   normalizeRegion(null)   → null
 */
function normalizeRegion(input) {
    if (!input) return null;

    const value = input.toUpperCase().trim();

    // If it's a country code, map to region
    if (COUNTRY_TO_REGION[value]) {
        return COUNTRY_TO_REGION[value];
    }

    // Already a canonical region code or unknown — passthrough
    return value;
}

/**
 * isCountryCode
 * Checks if an input is a known country code vs a region code.
 *
 * @param {string} input
 * @returns {boolean}
 */
function isCountryCode(input) {
    if (!input) return false;
    return !!COUNTRY_TO_REGION[input.toUpperCase().trim()];
}

module.exports = {
    normalizeRegion,
    isCountryCode,
    COUNTRY_TO_REGION,
};
