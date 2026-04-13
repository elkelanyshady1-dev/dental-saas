/**
 * pricingTaxEngine.js
 * Platform Billing — Pricing Engine
 *
 * Applies tax rate to a post-coupon price.
 *
 * Design decisions:
 *   - Tax is applied AFTER coupon (tax on discounted price)
 *   - taxRate is a decimal (0.14 = 14%, 0.20 = 20%)
 *   - Returns both the tax amount and the total for invoice line items
 *   - Does NOT look up tax rates from DB — caller provides the rate
 *     (org.country → tax rate is the caller's responsibility)
 *
 * Common rates for reference (not hardcoded here):
 *   EG: 0.14  (Egyptian VAT 14%)
 *   SA: 0.15  (Saudi VAT 15%)
 *   AE: 0.05  (UAE VAT 5%)
 *   EU: 0.20  (EU standard VAT 20%)
 *   US: 0     (handled at Stripe/payment provider level)
 *
 * PLANE: Platform
 */

"use strict";

/**
 * applyTax
 *
 * @param {number} price      - Post-coupon price
 * @param {number} [taxRate]  - Decimal tax rate (0.14 = 14%). Null/undefined = no tax.
 * @returns {{ price: number, taxAmount: number, taxRate: number }}
 */
function applyTax(price, taxRate) {
    if (typeof price !== "number" || isNaN(price)) {
        throw new Error("[PricingTaxEngine] price must be a valid number");
    }

    if (!taxRate || taxRate === 0) {
        return { price, taxAmount: 0, taxRate: 0 };
    }

    if (typeof taxRate !== "number" || taxRate < 0 || taxRate > 1) {
        throw new Error(
            `[PricingTaxEngine] taxRate must be a decimal between 0 and 1 (e.g. 0.14 for 14%). Got: ${taxRate}`
        );
    }

    const taxAmount = price * taxRate;
    return {
        price: price + taxAmount,
        taxAmount,
        taxRate
    };
}

module.exports = { applyTax };
