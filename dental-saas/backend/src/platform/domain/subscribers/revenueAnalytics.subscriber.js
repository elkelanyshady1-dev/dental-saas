/**
 * revenueAnalytics.subscriber.js
 * Phase v6.5 — Revenue Analytics Engine
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const RevenueAnalyticsDef = require("../models/revenueAnalytics.model");
const RevenueAnalytics = getPlatformModel(RevenueAnalyticsDef);
/**
 * processInvoicePaid
 * Idempotently increments the revenue snapshot based on a paid invoice.
 * Note: Invoice must include billingCountry in its metadata or payload.
 * 
 * @param {Object} payload 
 */
async function processInvoicePaid(payload) {
  const {
    invoiceId,
    countryCode,
    basePlanAmountMinor = 0,
    addOnAmountMinor = 0,
    overageAmountMinor = 0,
    taxAmountMinor = 0,
    totalAmountMinor = 0,
    datePaid
  } = payload;
  if (!invoiceId || !countryCode || !datePaid) {
    console.error("[RevenueAnalytics] Missing required payload data for invoice processing.");
    return;
  }

  // v8.2.1 Integrity Check: Ensure all inputs are integers
  const inputs = [basePlanAmountMinor, addOnAmountMinor, overageAmountMinor, taxAmountMinor, totalAmountMinor];
  if (inputs.some(val => !Number.isInteger(val))) {
    throw new Error(`Precision Guard: Non-integer value detected in RevenueAnalytics subscriber for invoice ${invoiceId}`);
  }
  const paidDate = new Date(datePaid);
  const month = paidDate.getUTCMonth() + 1;
  const year = paidDate.getUTCFullYear();

  // Net revenue = Total - Tax (All in Minor Units)
  const netRevenueMinor = totalAmountMinor - taxAmountMinor;
  try {
    await RevenueAnalytics.updateOne({
      month,
      year,
      countryCode
    }, {
      $inc: {
        totalRevenueMinor: totalAmountMinor,
        planRevenueMinor: basePlanAmountMinor,
        addOnRevenueMinor: addOnAmountMinor,
        overageRevenueMinor: overageAmountMinor,
        taxCollectedMinor: taxAmountMinor,
        netRevenueMinor: netRevenueMinor,
        version: 1
      }
    }, {
      upsert: true,
      setDefaultsOnInsert: true
    });
    console.log(`[RevenueAnalytics] Snapshot updated for ${countryCode} ${month}/${year}`);
  } catch (err) {
    console.error(`[RevenueAnalytics] Failed to update snapshot for ${invoiceId}:`, err);
  }
}
module.exports = {
  processInvoicePaid
};