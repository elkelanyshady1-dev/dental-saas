/**
 * regionMap.constant.js
 * Platform Billing — Region Mapping Constants (v3)
 *
 * Canonical country-to-region mapping for the v3 pricing engine.
 * Used by pricingResolverV3.service.js for automatic region detection
 * based on the subscribing organization's country.
 *
 * Region codes: US | EU | MEA | APAC
 *
 * Rules:
 *   1. Every country maps to exactly ONE region.
 *   2. Unknown countries return null (caller must handle fallback).
 *   3. This map is used by the resolver, NOT by the schema validation.
 *      The schema enum on regionCode enforces the allowed values.
 *
 * PLANE: Platform
 */

"use strict";

// ─── Country → Region Mapping ─────────────────────────────────────────────────
const COUNTRY_REGION_MAP = {
    // ── US Region ─────────────────────────────────────────────────────────────
    US: "US",
    CA: "US",
    MX: "US",
    // Carribean
    PR: "US",
    JM: "US",

    // ── EU Region ─────────────────────────────────────────────────────────────
    GB: "EU",
    FR: "EU",
    DE: "EU",
    IT: "EU",
    ES: "EU",
    NL: "EU",
    SE: "EU",
    NO: "EU",
    DK: "EU",
    FI: "EU",
    PL: "EU",
    AT: "EU",
    BE: "EU",
    CH: "EU",
    PT: "EU",
    IE: "EU",
    GR: "EU",
    CZ: "EU",
    RO: "EU",
    HU: "EU",
    TR: "EU",

    // ── MEA Region (Middle East & Africa) ─────────────────────────────────────
    EG: "MEA",
    SA: "MEA",
    AE: "MEA",
    KW: "MEA",
    QA: "MEA",
    BH: "MEA",
    OM: "MEA",
    JO: "MEA",
    LB: "MEA",
    MA: "MEA",
    TN: "MEA",
    DZ: "MEA",
    LY: "MEA",
    IQ: "MEA",
    SD: "MEA",
    YE: "MEA",
    PS: "MEA",
    SY: "MEA",

    // Sub-Saharan Africa
    NG: "MEA",
    ZA: "MEA",
    KE: "MEA",
    GH: "MEA",

    // ── APAC Region (Asia Pacific) ────────────────────────────────────────────
    IN: "APAC",
    SG: "APAC",
    AU: "APAC",
    NZ: "APAC",
    JP: "APAC",
    KR: "APAC",
    PH: "APAC",
    MY: "APAC",
    TH: "APAC",
    ID: "APAC",
    VN: "APAC",
    PK: "APAC",
    BD: "APAC",
    LK: "APAC",
    CN: "APAC",
    TW: "APAC",
    HK: "APAC",
};

// ─── Region metadata (for admin UI display) ───────────────────────────────────
const REGION_METADATA = {
    US: {
        name: "North America",
        defaultCurrency: "USD",
        emoji: "🇺🇸",
    },
    EU: {
        name: "Europe",
        defaultCurrency: "EUR",
        emoji: "🇪🇺",
    },
    MEA: {
        name: "Middle East & Africa",
        defaultCurrency: "USD",
        emoji: "🌍",
    },
    APAC: {
        name: "Asia Pacific",
        defaultCurrency: "USD",
        emoji: "🌏",
    },
};

const VALID_REGION_CODES = Object.keys(REGION_METADATA);

/**
 * Maps an ISO 3166-1 alpha-2 country code to its region code.
 * @param {string} countryCode - ISO country code (e.g., "EG", "US")
 * @returns {string|null} Region code or null if unmapped
 */
function mapCountryToRegion(countryCode) {
    if (!countryCode || typeof countryCode !== "string") return null;
    return COUNTRY_REGION_MAP[countryCode.toUpperCase().trim()] || null;
}

/**
 * Returns all country codes that belong to a given region.
 * @param {string} regionCode - Region code (e.g., "MEA")
 * @returns {string[]} Array of ISO country codes
 */
function getCountriesForRegion(regionCode) {
    if (!regionCode) return [];
    const rc = regionCode.toUpperCase().trim();
    return Object.entries(COUNTRY_REGION_MAP)
        .filter(([, region]) => region === rc)
        .map(([country]) => country);
}

module.exports = {
    COUNTRY_REGION_MAP,
    REGION_METADATA,
    VALID_REGION_CODES,
    mapCountryToRegion,
    getCountriesForRegion,
};
