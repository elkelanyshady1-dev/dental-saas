/**
 * pricingEngine.service.js
 * Platform Billing — Central Pricing Authority
 *
 * THE ONLY place in the codebase that may compute a contract price.
 *
 * Architecture:
 *
 *   PlanVersion.pricing.regions[]
 *         ↓
 *   pricingRegionResolver   → finds correct region + currency
 *         ↓
 *   resolveBasePrice        → reads monthly/yearly/biennial from region
 *         ↓
 *   pricingCouponEngine     → applies discount
 *         ↓
 *   pricingTaxEngine        → applies tax (post-coupon)
 *         ↓
 *   pricingProviderResolver → resolves stripe/paymob price ID from region
 *         ↓
 *   { finalPrice, currency, region, discountAmount, taxAmount, providerPriceId }
 *
 * Rules:
 *   1. Controllers MUST NOT compute prices. Call computePrice() instead.
 *   2. Trial contracts bypass this engine entirely (lockedPrice = 0, caller sets it).
 *   3. Sales overrides (overridePrice) skip region+coupon+tax — override wins.
 *   4. OrgContract.lockedPrice is the result of this function — immutable after creation.
 *   5. PlatformInvoice ALWAYS reads lockedPrice from OrgContract — never re-computes.
 *
 * PLANE: Platform
 * COLLECTION: N/A (pure computation, no DB writes)
 */

"use strict";

const { resolveRegionFromCountry } = require("./pricingRegionResolver");
const { applyCoupon } = require("./pricingCouponEngine");
const { applyTax } = require("./pricingTaxEngine");
const { resolveProviderPriceId } = require("./pricingProviderResolver");
const { resolvePriceV3 } = require("./pricingResolverV3.service");
const logger = require("@utils/logger");

// ─── Feature flag: PRICING_ENGINE ─────────────────────────────────────────────
// "v2" (default) → uses existing countries[] resolution
// "v3"           → uses region-based resolution with overrides
const PRICING_ENGINE_VERSION = process.env.PRICING_ENGINE || "v2";

// ─── Staged Rollout: Org-Level v3 Gate ────────────────────────────────────────
// PRICING_V3_ORGS = comma-separated list of organization IDs to enable v3 for.
// If empty AND PRICING_ENGINE=v3, v3 is enabled globally (full rollout).
// If populated, ONLY those orgs use v3 (canary mode).
const PRICING_V3_ALLOWED_ORGS = (process.env.PRICING_V3_ORGS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

/**
 * Determines whether v3 pricing should be used for a given context.
 * @param {string|null} organizationId - Optional org ID for canary gating
 * @returns {boolean}
 */
function isV3Enabled(organizationId) {
    if (PRICING_ENGINE_VERSION !== "v3") return false;
    // If no allowlist → global rollout (all orgs use v3)
    if (PRICING_V3_ALLOWED_ORGS.length === 0) return true;
    // If allowlist → canary mode (only listed orgs)
    return PRICING_V3_ALLOWED_ORGS.includes(String(organizationId));
}

// ─── Per-seat pricing ─────────────────────────────────────────────────────────
// If a PlanVersion supports seat-based pricing, the price grows linearly
// above the base seat count. Stored at PlanVersion.pricing.perSeat.
function resolvePerSeatAddition(planVersion, seats) {
    const perSeatRate = planVersion?.pricing?.perSeat;
    if (!perSeatRate || seats <= 1) return 0;
    return (seats - 1) * perSeatRate;
}

// ─── Base price resolution ────────────────────────────────────────────────────
// Reads from PlanVersion.pricing.regions[].{monthly|yearly|biennial}
// Uses the matched region from resolveRegionFromCountry.
// Falls back to first region if no country match found.
function resolveBasePrice(planVersion, billingInterval, resolvedRegionResult) {
    const { fromPlanVersion, _region } = resolvedRegionResult;
    const regions = planVersion?.pricing?.regions || [];

    let region = null;

    if (fromPlanVersion && _region) {
        // Exact match from region resolver
        region = _region;
    } else if (regions.length > 0) {
        // Fallback: try regionCode match, then GLOBAL, then first
        const { regionCode } = resolvedRegionResult;
        region =
            regions.find(r => r.regionCode === regionCode) ||
            regions.find(r => r.regionCode === "GLOBAL") ||
            regions[0];
    }

    if (!region) {
        throw new Error(
            `[PricingEngine] No pricing region found for PlanVersion ${planVersion._id}. ` +
            `Ensure at least one region is configured.`
        );
    }

    const price = region[billingInterval];
    if (price === undefined || price === null) {
        throw new Error(
            `[PricingEngine] Billing interval "${billingInterval}" not configured ` +
            `in region "${region.regionCode}" of PlanVersion ${planVersion._id}.`
        );
    }

    return { price, region };
}

// ─── Main exported function ───────────────────────────────────────────────────

/**
 * computePrice
 *
 * @param {object} options
 * @param {object}   options.planVersion        - PlanVersion lean or Mongoose document (required)
 * @param {string}   [options.billingInterval]  - "monthly" | "yearly" | "biennial" (default: "monthly")
 * @param {string}   [options.country]          - ISO 3166-1 alpha-2 country code (for region resolution)
 * @param {object}   [options.coupon]           - Coupon object (optional)
 * @param {number}   [options.taxRate]          - Decimal tax rate (0.14 = 14%). Null = no tax.
 * @param {number}   [options.seats]            - Number of seats (default: 1)
 * @param {number}   [options.overridePrice]    - Explicit price override (e.g. sales contract custom price)
 *                                               When provided: skips region/coupon/tax. Provider ID still resolved.
 * @param {string}   [options.overrideCurrency] - Must accompany overridePrice for explicit currency
 * @param {string}   [options.provider]         - "stripe"|"paymob"|"paddle"|"adyen"|"manual" (default: "manual")
 *
 * @returns {Promise<{
 *   finalPrice:      number,   — the price to lock into OrgContract.lockedPrice
 *   currency:        string,   — ISO currency code
 *   regionCode:      string,   — resolved region code
 *   billingInterval: string,
 *   discountAmount:  number,   — coupon discount applied (0 if no coupon)
 *   taxAmount:       number,   — tax applied (0 if no tax)
 *   taxRate:         number,   — actual tax rate used
 *   providerPriceId: string|null,  — provider's price identifier (null for manual)
 *   isOverride:      boolean,  — true if overridePrice was used (sales contract)
 *   breakdown: {
 *     basePrice:      number,
 *     afterCoupon:    number,
 *     afterTax:       number,
 *     perSeatAddition:number
 *   }
 * }>}
 */
async function computePrice({
    planVersion,
    billingInterval = "monthly",
    country,
    coupon,
    taxRate,
    seats = 1,
    overridePrice,
    overrideCurrency,
    provider = "manual",
    organizationId = null
}) {
    if (!planVersion) {
        throw new Error("[PricingEngine] planVersion is required");
    }
    if (!["monthly", "yearly", "biennial"].includes(billingInterval)) {
        throw new Error(`[PricingEngine] Invalid billingInterval: "${billingInterval}"`);
    }

    // ── OVERRIDE PATH (sales contracts) ──────────────────────────────────────
    // When overridePrice is provided, the caller is setting a custom price
    // (e.g. negotiated sales contract). Coupon + tax are bypassed.
    // The provider price ID is still resolved (even at override price, the
    // provider needs the correct price object ID for Stripe charges).
    if (overridePrice !== undefined) {
        if (typeof overridePrice !== "number" || overridePrice < 0) {
            throw new Error("[PricingEngine] overridePrice must be a non-negative number");
        }

        const regions = planVersion?.pricing?.regions || [];
        const regionResult = resolveRegionFromCountry(country, regions);
        const currency = overrideCurrency || regionResult.currency || "USD";

        const providerPriceId = resolveProviderPriceId({
            planVersion,
            provider,
            regionCode: regionResult.regionCode,
            billingInterval
        });

        // ── Provider guard ──────────────────────────────────────────────────
        // Prevent launching a provider checkout without a configured price ID.
        // This catches missing Stripe/Paymob plan mappings before they hit payment APIs.
        if (provider !== "manual" && !providerPriceId) {
            throw new Error(
                `[PricingEngine] Provider price ID missing for provider="${provider}" ` +
                `region="${regionResult.regionCode}" interval="${billingInterval}" ` +
                `on PlanVersion ${planVersion._id}. ` +
                `Configure providerPriceIds.${provider}.${billingInterval} in the region block, ` +
                `or use provider="manual" for invoice-only contracts.`
            );
        }

        return {
            finalPrice: overridePrice,
            currency: currency.toUpperCase(),
            regionCode: regionResult.regionCode,
            billingInterval,
            discountAmount: 0,
            taxAmount: 0,
            taxRate: 0,
            providerPriceId,
            isOverride: true,
            snapshot: {
                regionCode: regionResult.regionCode,
                billingInterval,
                basePrice: overridePrice,
                perSeatAddition: 0,
                discountAmount: 0,
                taxRate: 0,
                taxAmount: 0,
                couponApplied: false,
                isOverride: true,
                snapshotType: "computed"
            },
            breakdown: {
                basePrice: overridePrice,
                afterCoupon: overridePrice,
                afterTax: overridePrice,
                perSeatAddition: 0
            }
        };
    }

    // ── v3 ENGINE PATH (Region-Based with Overrides) ────────────────────────────
    // When PRICING_ENGINE=v3 and the PlanVersion has pricingV3 configured,
    // delegate to the v3 resolver for base price resolution.
    // The result is then fed through the standard coupon → tax → provider pipeline.
    if (isV3Enabled(organizationId) && planVersion?.pricingV3) {
        const v3Result = resolvePriceV3({
            planVersion,
            countryCode: country,
            billingInterval
        });

        const v3BasePrice = v3Result.price;
        const v3PerSeat = resolvePerSeatAddition(planVersion, seats);
        let v3WorkingPrice = v3BasePrice + v3PerSeat;

        const v3CouponResult = applyCoupon(v3WorkingPrice, coupon);
        v3WorkingPrice = v3CouponResult.price;

        const v3TaxResult = applyTax(v3WorkingPrice, taxRate);
        const v3FinalPrice = v3TaxResult.price;

        // Resolve provider price ID from v3 result
        let v3ProviderPriceId = null;
        if (v3Result.providerPriceIds) {
            v3ProviderPriceId = v3Result.providerPriceIds[provider] || null;
        }
        // Fallback: check region-level provider IDs via existing resolver
        if (!v3ProviderPriceId) {
            v3ProviderPriceId = resolveProviderPriceId({
                planVersion,
                provider,
                regionCode: v3Result.regionCode,
                billingInterval
            });
        }

        // ── Provider guard ──────────────────────────────────────────────────
        if (provider !== "manual" && !v3ProviderPriceId) {
            logger.error({
                provider, regionCode: v3Result.regionCode, billingInterval,
                resolvedVia: v3Result.resolvedVia, planVersionId: planVersion._id
            }, "[PricingEngine/v3] MISSING_PROVIDER_PRICE_ID");
            throw new Error(
                `[PricingEngine/v3] Provider price ID missing for provider="${provider}" ` +
                `region="${v3Result.regionCode}" interval="${billingInterval}" ` +
                `(resolved via: ${v3Result.resolvedVia}) on PlanVersion ${planVersion._id}.`
            );
        }

        // ── Zero-price safety guard ─────────────────────────────────────────
        if (v3FinalPrice <= 0 && !coupon) {
            logger.warn({
                orgId: organizationId, country, regionCode: v3Result.regionCode,
                resolvedVia: v3Result.resolvedVia, basePrice: v3BasePrice,
                finalPrice: v3FinalPrice, planVersionId: planVersion._id
            }, "[PricingEngine/v3] ZERO_PRICE_DETECTED — pricing resolved to ≤ 0 without coupon");
        }

        // ── Observability: Structured pricing resolution log ────────────────
        logger.info({
            orgId: organizationId,
            planVersionId: planVersion._id,
            country,
            regionCode: v3Result.regionCode,
            resolvedVia: v3Result.resolvedVia,
            basePrice: v3BasePrice,
            finalPrice: v3FinalPrice,
            currency: v3Result.currency,
            provider,
            billingInterval,
            perSeatAddition: v3PerSeat,
            discountAmount: v3CouponResult.discountAmount,
            taxAmount: v3TaxResult.taxAmount,
            providerPriceId: v3ProviderPriceId || null
        }, "[PRICING_RESOLUTION] v3 pricing resolved");

        return {
            finalPrice: v3FinalPrice,
            currency: v3Result.currency.toUpperCase(),
            regionCode: v3Result.regionCode,
            billingInterval,
            discountAmount: v3CouponResult.discountAmount,
            taxAmount: v3TaxResult.taxAmount,
            taxRate: v3TaxResult.taxRate,
            providerPriceId: v3ProviderPriceId,
            isOverride: false,
            pricingEngine: "v3",
            resolvedVia: v3Result.resolvedVia,
            snapshot: {
                regionCode: v3Result.regionCode,
                billingInterval,
                basePrice: v3BasePrice,
                perSeatAddition: v3PerSeat,
                discountAmount: v3CouponResult.discountAmount,
                taxRate: v3TaxResult.taxRate,
                taxAmount: v3TaxResult.taxAmount,
                couponApplied: Boolean(coupon),
                isOverride: false,
                resolvedVia: v3Result.resolvedVia,
                snapshotType: "computed"
            },
            breakdown: {
                basePrice: v3BasePrice,
                afterCoupon: v3BasePrice + v3PerSeat - v3CouponResult.discountAmount,
                afterTax: v3FinalPrice,
                perSeatAddition: v3PerSeat
            }
        };
    }

    // ── STANDARD PATH (v2 — countries[] resolution) ───────────────────────────

    // 1. Resolve region from country code against PlanVersion regions
    const regions = planVersion?.pricing?.regions || [];
    const regionResult = resolveRegionFromCountry(country, regions);

    // 2. Resolve base price from matched region
    const { price: basePrice, region: matchedRegion } = resolveBasePrice(
        planVersion,
        billingInterval,
        regionResult
    );

    // 3. Per-seat addition
    const perSeatAddition = resolvePerSeatAddition(planVersion, seats);
    let workingPrice = basePrice + perSeatAddition;

    // 4. Apply coupon
    const couponResult = applyCoupon(workingPrice, coupon);
    workingPrice = couponResult.price;
    const discountAmount = couponResult.discountAmount;

    // 5. Apply tax
    const taxResult = applyTax(workingPrice, taxRate);
    const finalPrice = taxResult.price;
    const taxAmount = taxResult.taxAmount;

    // 6. Resolve provider price ID from the matched region
    const providerPriceId = resolveProviderPriceId({
        planVersion,
        provider,
        regionCode: matchedRegion?.regionCode || regionResult.regionCode,
        billingInterval
    });

    // ── Provider guard ──────────────────────────────────────────────────
    if (provider !== "manual" && !providerPriceId) {
        throw new Error(
            `[PricingEngine] Provider price ID missing for provider="${provider}" ` +
            `region="${matchedRegion?.regionCode || regionResult.regionCode}" interval="${billingInterval}" ` +
            `on PlanVersion ${planVersion._id}. ` +
            `Configure providerPriceIds.${provider}.${billingInterval} in the region block, ` +
            `or use provider="manual" for invoice-only contracts.`
        );
    }

    const resolvedRegionCode = matchedRegion?.regionCode || regionResult.regionCode;
    const resolvedCurrency = (matchedRegion?.currency || regionResult.currency || "USD").toUpperCase();

    return {
        finalPrice,
        currency: resolvedCurrency,
        regionCode: resolvedRegionCode,
        billingInterval,
        discountAmount,
        taxAmount,
        taxRate: taxResult.taxRate,
        providerPriceId,
        isOverride: false,
        snapshot: {
            regionCode: resolvedRegionCode,
            billingInterval,
            basePrice,
            perSeatAddition,
            discountAmount,
            taxRate: taxResult.taxRate,
            taxAmount,
            couponApplied: Boolean(coupon),
            isOverride: false,
            snapshotType: "computed"
        },
        breakdown: {
            basePrice,
            afterCoupon: basePrice + perSeatAddition - discountAmount,
            afterTax: finalPrice,
            perSeatAddition
        }
    };
}

module.exports = { computePrice, isV3Enabled };
