/**
 * planValidator.js
 * v20.2 Phase 7B — Client-Side Plan Validation (UX Layer Only)
 *
 * ARCHITECTURAL INVARIANT:
 * This validator is UX-level only. Backend is the final authority.
 * Does NOT validate pricing authority, subscription rules, or billing integration.
 */

const STRIPE_PRICE_ID_REGEX = /^price_[a-zA-Z0-9_]+$/;
const PAYMOB_PRICE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate a plan object for form submission.
 * @param {object} plan - The plan object to validate
 * @param {object} options
 * @param {boolean} options.isNew - Whether this is a new plan (code required)
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string }> }}
 */
export function validatePlan(plan, { isNew = false } = {}) {
    const errors = [];

    // ── General ──────────────────────────────────────────────────────
    // PlanVersion schema fields: label (required), versionTag (required)
    // templateCode is server-controlled — not validated client-side.
    if (!plan.label?.trim()) {
        errors.push({ field: "label", tab: "General", message: "Plan name (label) is required" });
    }

    if (isNew && !plan.versionTag?.trim()) {
        errors.push({ field: "versionTag", tab: "General", message: "Version tag is required (e.g. 1.0.0)" });
    }

    if (plan.versionTag && !/^[\w.-]+$/.test(plan.versionTag)) {
        errors.push({ field: "versionTag", tab: "General", message: "Version tag must be alphanumeric (e.g. 1.0.0, v2, 2.1-beta)" });
    }

    // ── Limits ───────────────────────────────────────────────────────
    const limits = plan.limits || {};
    if (limits.maxUsers !== undefined && limits.maxUsers !== -1 && limits.maxUsers < 1) {
        errors.push({ field: "limits.maxUsers", tab: "Limits", message: "Max users must be -1 (unlimited) or ≥ 1" });
    }

    if (limits.maxBranches !== undefined && limits.maxBranches !== -1 && limits.maxBranches < 1) {
        errors.push({ field: "limits.maxBranches", tab: "Limits", message: "Max branches must be -1 (unlimited) or ≥ 1" });
    }

    // ── Regional Pricing ─────────────────────────────────────────────
    const regions = plan.pricing?.regions || [];
    const allCountries = new Map(); // country → regionIndex

    regions.forEach((region, idx) => {
        const label = `Region ${idx + 1}`;

        if (!region.regionCode?.trim()) {
            errors.push({ field: `pricing.regions[${idx}].regionCode`, tab: "Regional Pricing", message: `${label}: Region code is required` });
        }

        if (!region.currency?.trim()) {
            errors.push({ field: `pricing.regions[${idx}].currency`, tab: "Regional Pricing", message: `${label}: Currency is required` });
        }

        // At least one duration key present with price >= 0
        // Zero-priced plans (trial-tier) are legitimate
        const hasDuration = (
            (region.monthly !== undefined && region.monthly !== null) ||
            (region.yearly !== undefined && region.yearly !== null) ||
            (region.biennial !== undefined && region.biennial !== null)
        );
        if (!hasDuration) {
            errors.push({ field: `pricing.regions[${idx}].durations`, tab: "Regional Pricing", message: `${label}: At least one duration price must be defined` });
        }

        // Non-negative pricing
        if (region.monthly !== undefined && region.monthly !== null && region.monthly < 0) {
            errors.push({ field: `pricing.regions[${idx}].monthly`, tab: "Regional Pricing", message: `${label}: Monthly price cannot be negative` });
        }
        if (region.yearly !== undefined && region.yearly !== null && region.yearly < 0) {
            errors.push({ field: `pricing.regions[${idx}].yearly`, tab: "Regional Pricing", message: `${label}: Yearly price cannot be negative` });
        }
        if (region.biennial !== undefined && region.biennial !== null && region.biennial < 0) {
            errors.push({ field: `pricing.regions[${idx}].biennial`, tab: "Regional Pricing", message: `${label}: Biennial price cannot be negative` });
        }

        // Provider price ID format validation (optional — only validate if present)
        const providerPriceIds = region.providerPriceIds || {};
        ["monthly", "yearly", "biennial"].forEach(duration => {
            const stripeId = providerPriceIds.stripe?.[duration];
            if (stripeId && !STRIPE_PRICE_ID_REGEX.test(stripeId)) {
                errors.push({
                    field: `pricing.regions[${idx}].providerPriceIds.stripe.${duration}`,
                    tab: "Regional Pricing",
                    message: `${label}: Invalid Stripe price ID format (must start with price_)`
                });
            }
            const paymobId = providerPriceIds.paymob?.[duration];
            if (paymobId && !PAYMOB_PRICE_ID_REGEX.test(paymobId)) {
                errors.push({
                    field: `pricing.regions[${idx}].providerPriceIds.paymob.${duration}`,
                    tab: "Regional Pricing",
                    message: `${label}: Invalid Paymob price ID format`
                });
            }
        });

        // Country overlap detection
        (region.countries || []).forEach(country => {
            if (allCountries.has(country)) {
                const otherIdx = allCountries.get(country);
                errors.push({
                    field: `pricing.regions[${idx}].countries`,
                    tab: "Regional Pricing",
                    message: `${label}: Country "${country}" already assigned to Region ${otherIdx + 1}`
                });
            } else {
                allCountries.set(country, idx);
            }
        });
    });

    return { valid: errors.length === 0, errors };
}

/**
 * Get errors grouped by tab for UI indicators.
 * @param {Array<{ field: string, tab: string, message: string }>} errors
 * @returns {Object<string, Array<{ field: string, message: string }>>}
 */
export function groupErrorsByTab(errors) {
    const grouped = {};
    errors.forEach(({ tab, ...rest }) => {
        if (!grouped[tab]) grouped[tab] = [];
        grouped[tab].push(rest);
    });
    return grouped;
}
