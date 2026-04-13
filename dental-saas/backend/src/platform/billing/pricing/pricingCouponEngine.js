/**
 * pricingCouponEngine.js
 * Platform Billing — Pricing Engine
 *
 * Applies coupon/discount to a base price.
 *
 * Coupon shape (stored in OrgContract.appliedCoupon):
 * {
 *   code:       string    — coupon code (for audit)
 *   type:       "percentage" | "fixed"
 *   value:      number    — % amount or fixed amount
 *   maxUses:    number?   — optional cap
 *   expiresAt:  Date?     — optional expiry
 * }
 *
 * Rules:
 *   - percentage: deducted as (price * value / 100)
 *   - fixed:      deducted as flat amount; floor at 0
 *   - unknown type: no discount, warn in return value
 *   - Coupon is validated before calling this function.
 *     This engine does NOT hit the DB — validation is the caller's job.
 *
 * PLANE: Platform
 */

"use strict";

/**
 * applyCoupon
 *
 * @param {number} price     - Base price (before coupon)
 * @param {object} [coupon]  - Coupon object (nullable)
 * @returns {{ price: number, discountAmount: number, applied: boolean, warn?: string }}
 */
function applyCoupon(price, coupon) {
    if (!coupon) {
        return { price, discountAmount: 0, applied: false };
    }

    if (typeof price !== "number" || isNaN(price)) {
        throw new Error("[PricingCouponEngine] price must be a valid number");
    }

    const { type, value } = coupon;

    if (type === "percentage") {
        if (typeof value !== "number" || value < 0 || value > 100) {
            return { price, discountAmount: 0, applied: false, warn: "Invalid percentage coupon value" };
        }
        const discount = (price * value) / 100;
        return {
            price: Math.max(price - discount, 0),
            discountAmount: discount,
            applied: true
        };
    }

    if (type === "fixed") {
        if (typeof value !== "number" || value < 0) {
            return { price, discountAmount: 0, applied: false, warn: "Invalid fixed coupon value" };
        }
        const discount = Math.min(value, price); // never exceed the price
        return {
            price: Math.max(price - discount, 0),
            discountAmount: discount,
            applied: true
        };
    }

    // Unknown type — pass through with warning
    return {
        price,
        discountAmount: 0,
        applied: false,
        warn: `Unknown coupon type: "${type}"`
    };
}

module.exports = { applyCoupon };
