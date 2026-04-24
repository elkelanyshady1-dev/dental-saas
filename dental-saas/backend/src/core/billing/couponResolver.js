/**
 * Phase v6_1 — Coupon System
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const CouponDef = require("../../platform/domain/models/coupon.model");
const Coupon = getPlatformModel(CouponDef);
class CouponValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CouponValidationError";
    this.statusCode = 400;
  }
}
const {
  Money
} = require("../../utils/money");

/**
 * applyCoupon
 * Validates and applies a coupon to an invoice draft.
 * 
 * @param {Object} invoiceDraft - The current invoice state before tax
 * @param {string} couponCode - The code provided by the user
 * @param {Object} orgContext - Contains billingCountry and plan details
 * @returns {Promise<Object>} Updated invoice draft
 */
async function applyCoupon(invoiceDraft, couponCode, orgContext) {
  if (!couponCode) return invoiceDraft;

  // 1. Fetch Coupon
  const coupon = await Coupon.findOne({
    code: couponCode.toUpperCase()
  });
  if (!coupon) {
    throw new CouponValidationError("Invalid coupon code.");
  }
  const currency = invoiceDraft.currency || "USD";

  // 2. Validate Active Status & Expiry
  if (!coupon.isActive) {
    throw new CouponValidationError("This coupon is no longer active.");
  }
  if (coupon.expiresAt && new Date() > coupon.expiresAt) {
    throw new CouponValidationError("This coupon has expired.");
  }

  // 3. Validate Usage Limits
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    throw new CouponValidationError("This coupon has reached its usage limit.");
  }

  // 4. Validate Geo-Restrictions
  if (coupon.countries && coupon.countries.length > 0) {
    if (!coupon.countries.includes(orgContext.billingCountry)) {
      throw new CouponValidationError("This coupon is not valid in your billing region.");
    }
  }

  // 5. Validate Plan Restrictions
  if (coupon.applicablePlans && coupon.applicablePlans.length > 0) {
    if (!coupon.applicablePlans.includes(orgContext.planCode)) {
      throw new CouponValidationError("This coupon cannot be applied to your current plan.");
    }
  }

  // 6. Calculate Discount (v8.2 Precision)
  const subtotalMoney = Money.fromDecimal(invoiceDraft.subtotalAmount, currency);
  let discountMoney = Money.fromMinor(0, currency);
  if (coupon.type === "percentage") {
    // v8.2 Requirement: percent must be integer
    if (!Number.isInteger(coupon.value)) {
      throw new Error("Enterprise Invariant Violation: Coupon value must be integer percent");
    }
    discountMoney = subtotalMoney.applyPercentage(coupon.value);
  } else if (coupon.type === "fixed") {
    const couponMoney = Money.fromDecimal(coupon.value, currency);
    // Prevent negative total
    discountMoney = subtotalMoney.amountMinor < couponMoney.amountMinor ? subtotalMoney : couponMoney;
  }
  invoiceDraft.couponDiscountAmount = discountMoney.toDecimal();
  invoiceDraft.couponCode = coupon.code;
  invoiceDraft.subtotalAmount = subtotalMoney.subtract(discountMoney).toDecimal();
  return invoiceDraft;
}

/**
 * incrementCouponUsage
 * Safely increments the use count for a coupon.
 * @param {string} couponCode 
 */
async function incrementCouponUsage(couponCode) {
  if (!couponCode) return;

  // OAV-style increment
  const result = await Coupon.updateOne({
    code: couponCode,
    $or: [{
      maxUses: null
    }, {
      $expr: {
        $lt: ["$usedCount", "$maxUses"]
      }
    }]
  }, {
    $inc: {
      usedCount: 1,
      version: 1
    }
  });
  if (result.modifiedCount === 0) {
    // Either not found or reached max uses concurrently
    throw new Error("Unable to apply coupon. It may have reached its usage limit.");
  }
}
module.exports = {
  applyCoupon,
  incrementCouponUsage,
  CouponValidationError
};