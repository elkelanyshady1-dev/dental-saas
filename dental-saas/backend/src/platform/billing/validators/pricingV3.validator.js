/**
 * pricingV3.validator.js
 * Platform Billing — v3 Pricing Data Integrity Validator
 *
 * Called before persisting pricingV3 data to the database.
 * Enforces invariants that Mongoose schema validation alone cannot catch:
 *
 *   1. No duplicate regionCode entries
 *   2. No duplicate override countries within a region
 *   3. No country that is both overridden AND excluded
 *   4. Override countries must belong to the correct region
 *   5. Currency codes are valid ISO 4217
 *   6. Prices are non-negative numbers
 *
 * PLANE: Platform
 */

"use strict";

const { mapCountryToRegion, VALID_REGION_CODES } = require("../constants/regionMap.constant");

// ─── Common ISO 4217 currency codes ──────────────────────────────────────────
const VALID_CURRENCIES = [
    "USD", "EUR", "GBP", "EGP", "SAR", "AED", "KWD", "QAR",
    "BHD", "OMR", "JOD", "MAD", "TND", "INR", "SGD", "AUD",
    "NZD", "JPY", "KRW", "MYR", "THB", "IDR", "VND", "PKR",
    "BDT", "LKR", "CNY", "TWD", "HKD", "PHP", "ZAR", "NGN",
    "KES", "GHS", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK",
    "HUF", "RON", "TRY", "CAD", "MXN", "BRL", "ARS"
];

/**
 * Validates a pricingV3 object before persistence.
 *
 * @param {object} pricing - The pricingV3 object to validate
 * @throws {Error} With descriptive message if validation fails
 * @returns {void}
 */
function validatePricingV3(pricing) {
    if (!pricing || typeof pricing !== "object") {
        throw new Error("[PricingV3Validator] pricingV3 payload is required and must be an object.");
    }

    // ── Validate Global Default ──────────────────────────────────────────────
    if (!pricing.default) {
        throw new Error(
            "[PricingV3Validator] pricingV3.default is required. " +
            "It serves as the fallback pricing for uncovered countries."
        );
    }
    validatePriceTier(pricing.default, "pricingV3.default");

    // ── Validate Regions Array ───────────────────────────────────────────────
    if (!Array.isArray(pricing.regions)) {
        throw new Error("[PricingV3Validator] pricingV3.regions must be an array.");
    }

    if (pricing.regions.length === 0) {
        throw new Error(
            "[PricingV3Validator] pricingV3.regions must contain at least one region. " +
            "Configure pricing for US, EU, MEA, or APAC."
        );
    }

    // ── Check for Duplicate Region Codes ─────────────────────────────────────
    const regionCodes = pricing.regions.map(r => r.regionCode);
    const uniqueRegionCodes = new Set(regionCodes);
    if (uniqueRegionCodes.size !== regionCodes.length) {
        const duplicates = regionCodes.filter((code, i) => regionCodes.indexOf(code) !== i);
        throw new Error(
            `[PricingV3Validator] Duplicate regionCode(s) found: [${[...new Set(duplicates)].join(", ")}]. ` +
            `Each region may only appear once.`
        );
    }

    // ── Validate Each Region ─────────────────────────────────────────────────
    for (const region of pricing.regions) {
        validateRegion(region);
    }
}

/**
 * Validates a single region entry.
 * @param {object} region
 */
function validateRegion(region) {
    const ctx = `region "${region.regionCode}"`;

    // ── Region code must be valid ────────────────────────────────────────────
    if (!region.regionCode || !VALID_REGION_CODES.includes(region.regionCode.toUpperCase())) {
        throw new Error(
            `[PricingV3Validator] Invalid regionCode: "${region.regionCode}". ` +
            `Must be one of: ${VALID_REGION_CODES.join(", ")}`
        );
    }

    // ── Region default pricing ───────────────────────────────────────────────
    validatePriceTier(region, ctx);

    // ── Validate Overrides ───────────────────────────────────────────────────
    if (region.overrides && Array.isArray(region.overrides)) {
        const overrideCountries = region.overrides.map(o => (o.country || "").toUpperCase());

        // Check for duplicate override countries
        const uniqueOverrides = new Set(overrideCountries);
        if (uniqueOverrides.size !== overrideCountries.length) {
            const dups = overrideCountries.filter((c, i) => overrideCountries.indexOf(c) !== i);
            throw new Error(
                `[PricingV3Validator] Duplicate override countries in ${ctx}: [${[...new Set(dups)].join(", ")}]. ` +
                `Each country may only have one override per region.`
            );
        }

        // Validate each override entry
        for (const override of region.overrides) {
            validateOverride(override, region.regionCode);
        }

        // ── Conflict Check: Override + Exclusion ─────────────────────────────
        const excludedSet = new Set((region.excludedCountries || []).map(c => c.toUpperCase()));
        for (const overrideCountry of overrideCountries) {
            if (excludedSet.has(overrideCountry)) {
                throw new Error(
                    `[PricingV3Validator] Country "${overrideCountry}" in ${ctx} cannot be ` +
                    `both overridden AND excluded. Remove it from either overrides[] or excludedCountries[].`
                );
            }
        }
    }

    // ── Validate Excluded Countries ──────────────────────────────────────────
    if (region.excludedCountries && Array.isArray(region.excludedCountries)) {
        for (const country of region.excludedCountries) {
            const mappedRegion = mapCountryToRegion(country);
            if (mappedRegion && mappedRegion !== region.regionCode.toUpperCase()) {
                throw new Error(
                    `[PricingV3Validator] Excluded country "${country}" in ${ctx} ` +
                    `actually belongs to region "${mappedRegion}". ` +
                    `Only countries in this region can be excluded from it.`
                );
            }
        }
    }
}

/**
 * Validates a single country override entry.
 * @param {object} override
 * @param {string} parentRegionCode
 */
function validateOverride(override, parentRegionCode) {
    const iso = (override.country || "").toUpperCase();
    const ctx = `override for country "${iso}" in region "${parentRegionCode}"`;

    if (!iso) {
        throw new Error(`[PricingV3Validator] Override is missing "country" field in region "${parentRegionCode}".`);
    }

    // Verify override country belongs to the parent region
    const actualRegion = mapCountryToRegion(iso);
    if (actualRegion && actualRegion !== parentRegionCode.toUpperCase()) {
        throw new Error(
            `[PricingV3Validator] ${ctx}: Country "${iso}" belongs to region "${actualRegion}", ` +
            `not "${parentRegionCode}". Move this override to the correct region.`
        );
    }

    validatePriceTier(override, ctx);
}

/**
 * Validates a pricing tier (currency + monthly + yearly).
 * @param {object} tier
 * @param {string} context - For error messages
 */
function validatePriceTier(tier, context) {
    // Currency
    if (!tier.currency) {
        throw new Error(`[PricingV3Validator] Missing currency in ${context}.`);
    }
    const currency = tier.currency.toUpperCase();
    if (!VALID_CURRENCIES.includes(currency)) {
        throw new Error(
            `[PricingV3Validator] Invalid currency "${currency}" in ${context}. ` +
            `Must be a valid ISO 4217 code.`
        );
    }

    // Monthly
    if (tier.monthly === undefined || tier.monthly === null) {
        throw new Error(`[PricingV3Validator] Missing monthly price in ${context}.`);
    }
    if (typeof tier.monthly !== "number" || tier.monthly < 0) {
        throw new Error(`[PricingV3Validator] Invalid monthly price (${tier.monthly}) in ${context}. Must be >= 0.`);
    }

    // Yearly
    if (tier.yearly === undefined || tier.yearly === null) {
        throw new Error(`[PricingV3Validator] Missing yearly price in ${context}.`);
    }
    if (typeof tier.yearly !== "number" || tier.yearly < 0) {
        throw new Error(`[PricingV3Validator] Invalid yearly price (${tier.yearly}) in ${context}. Must be >= 0.`);
    }
}

/**
 * validatePricingShape
 * Phase 1 — Pricing Decoupling guard.
 *
 * Ensures a plan document carries at least one recognised pricing shape:
 *   - `pricing.global`          → new canonical USD shape (preferred)
 *   - `pricing.regions[]`       → legacy region-keyed shape
 *   - `pricing.pricingV3`       → legacy v3 structure
 *
 * Throws INVALID_PRICING_CONFIG when none of the above are present so that
 * we never persist a plan with an unresolvable price.
 *
 * NOT wired into the controller yet — call explicitly from plan-authoring
 * paths once `pricing.global` is populated everywhere (see Phase 4 cleanup).
 *
 * @param {object} pricing - The `pricing` subdocument from a PlanTemplate or PlanVersion.
 * @throws {Error} with code INVALID_PRICING_CONFIG if no shape is present.
 */
function validatePricingShape(pricing) {
    if (!pricing || typeof pricing !== "object") {
        const err = new Error("INVALID_PRICING_CONFIG: pricing is required.");
        err.code = "INVALID_PRICING_CONFIG";
        throw err;
    }

    const hasGlobal = !!pricing.global && typeof pricing.global.amountMonthly === "number";
    const hasRegions = Array.isArray(pricing.regions) && pricing.regions.length > 0;
    const hasV3 = !!pricing.pricingV3?.default;

    if (!hasGlobal && !hasRegions && !hasV3) {
        const err = new Error(
            "INVALID_PRICING_CONFIG: pricing must include at least one of " +
            "`global`, `regions[]`, or `pricingV3`."
        );
        err.code = "INVALID_PRICING_CONFIG";
        throw err;
    }
}

module.exports = {
    validatePricingV3,
    validatePricingShape,
    VALID_CURRENCIES,
};
