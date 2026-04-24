/**
 * coupon.aggregate.service.js
 * Phase v6.1 — Coupon System
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const CouponDef = require("../models/coupon.model");
let _Coupon_cache = null;
function Coupon() {
    return _Coupon_cache || (_Coupon_cache = getPlatformModel(CouponDef));
}
async function createCoupon(data) {
  if (data.code) data.code = data.code.toUpperCase();
  return await Coupon().create(data);
}
async function updateCoupon(id, version, updateData) {
  const coupon = await Coupon().findById(id);
  if (!coupon) throw new Error("COUPON_NOT_FOUND");
  if (version !== undefined && coupon.version !== version) {
    throw new Error("COUPON_VERSION_CONFLICT");
  }
  if (updateData.code) updateData.code = updateData.code.toUpperCase();
  Object.assign(coupon, updateData);
  coupon.version += 1;
  await coupon.save();
  return coupon;
}
module.exports = {
  createCoupon,
  updateCoupon
};