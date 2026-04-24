/**
 * revenueSchedule.service.js
 * Sprint 7.2 — Revenue Schedule Creation + Multi-Currency Normalization (Hybrid FX)
 *
 * createRevenueScheduleOnPayment(invoice, contract, session?)
 *
 * On invoice payment:
 *   1) Fetch BillingSettings → baseReportingCurrency
 *   2) Resolve ExchangeRate for (invoice.currency → baseReportingCurrency)
 *      - Rate is locked at creation time (never re-fetched)
 *   3) Create RevenueSchedule with both original and normalized amounts
 *   4) Emit DEFERRED_REVENUE_UPDATED to BillingAuditLog
 *
 * Idempotent: skips creation if schedule already exists for this invoice.
 *
 * PLANE: Platform / Finance
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const RevenueScheduleDef = require("../finance/models/RevenueSchedule.model");
let _RevenueSchedule_cache = null;
function RevenueSchedule() {
    return _RevenueSchedule_cache || (_RevenueSchedule_cache = getPlatformModel(RevenueScheduleDef));
}
const {
  getBillingSettings
} = require("./billing/services/billingSettings.service");
const {
  resolveExchangeRate
} = require("../finance/services/fxResolver.service");
const {
  logBillingEvent
} = require("./billing/services/billingAuditLog.service");
const logger = require("@utils/logger");
const SYSTEM_ACTOR = "000000000000000000000000";

/**
 * createRevenueScheduleOnPayment
 *
 * @param {object} invoice  - PlatformInvoice lean or document
 * @param {object} contract - OrgContract lean or document (for contractId fallback)
 * @param {mongoose.ClientSession} [session]
 * @returns {Promise<RevenueSchedule|null>}
 */
async function createRevenueScheduleOnPayment(invoice, contract, session = null) {
  try {
    // Idempotency: skip if already created
    const existing = await RevenueSchedule().findOne({
      invoiceId: invoice._id
    });
    if (existing) {
      logger.info({
        invoiceId: invoice._id,
        scheduleId: existing._id
      }, "[RevenueSchedule] Already exists — skipping creation");
      return existing;
    }
    const now = new Date();
    const startDate = invoice.billingCycleStart ? new Date(invoice.billingCycleStart) : new Date(invoice.createdAt || now);
    const endDate = invoice.billingCycleEnd ? new Date(invoice.billingCycleEnd) : _addMonths(startDate, 1);

    // ── Calculate total periods ──────────────────────────────────────────
    const diffMs = endDate.getTime() - startDate.getTime();
    const totalPeriods = Math.max(1, Math.round(diffMs / (30.44 * 86_400_000)));
    const amount = invoice.totalAmount || 0;
    const perPeriod = +(amount / totalPeriods).toFixed(6);

    // ── Multi-currency normalization ─────────────────────────────────────
    const settings = await getBillingSettings();
    const baseReportingCurrency = settings.baseReportingCurrency || "USD";
    const invoiceCurrency = (invoice.currency || "").toUpperCase();
    let exchangeRate = 1.0;
    let fxSource = "identity";
    let fxIsOverride = false;
    let normalizationError = null;
    if (invoiceCurrency && invoiceCurrency !== baseReportingCurrency) {
      try {
        const resolution = await resolveExchangeRate(invoiceCurrency, baseReportingCurrency, now);
        exchangeRate = resolution.rate;
        fxSource = resolution.source; // "manual" | "auto"
        fxIsOverride = resolution.isOverride;
      } catch (rateErr) {
        normalizationError = rateErr.message;
        exchangeRate = null;
        logger.warn({
          invoiceCurrency,
          baseReportingCurrency,
          invoiceId: invoice._id
        }, "[RevenueSchedule] Exchange rate not found — normalizedAmounts will be 0");
      }
    }

    // Pre-compute normalized amounts (null if rate unavailable)
    const normalizedTotal = exchangeRate !== null ? +(amount * exchangeRate).toFixed(6) : null;
    const normalizedPerPeriod = exchangeRate !== null ? +(perPeriod * exchangeRate).toFixed(6) : null;
    const sched = new (RevenueSchedule())({
      organizationId: invoice.organizationId,
      contractId: invoice.contractId || contract._id,
      invoiceId: invoice._id,
      // Original currency
      currency: invoiceCurrency,
      originalCurrency: invoiceCurrency,
      totalAmount: amount,
      recognizedAmount: 0,
      deferredAmount: amount,
      // Recognition schedule
      recognitionFrequency: "monthly",
      startDate,
      endDate,
      totalPeriods,
      amountPerPeriod: perPeriod,
      periodsRecognized: 0,
      lastRecognitionDate: null,
      status: "active",
      // Normalized currency (locked rate)
      normalizedCurrency: baseReportingCurrency,
      exchangeRate: exchangeRate ?? 0,
      // 0 flags missing rate for ops team
      normalizedTotalAmount: normalizedTotal ?? 0,
      normalizedRecognizedAmount: 0,
      normalizedDeferredAmount: normalizedTotal ?? 0,
      normalizedAmountPerPeriod: normalizedPerPeriod ?? 0
    });
    const opts = session ? {
      session
    } : {};
    await sched.save(opts);
    await logBillingEvent({
      organizationId: invoice.organizationId,
      contractId: invoice.contractId || contract._id,
      invoiceId: invoice._id,
      eventType: "DEFERRED_REVENUE_UPDATED",
      previousState: null,
      newState: {
        deferredAmount: amount,
        recognizedAmount: 0,
        totalPeriods,
        normalizedCurrency: baseReportingCurrency,
        exchangeRate,
        fxSource,
        fxIsOverride,
        normalizedTotalAmount: normalizedTotal
      },
      performedBy: SYSTEM_ACTOR,
      metadata: {
        scheduleId: sched._id,
        currency: invoiceCurrency,
        amount,
        normalizationError: normalizationError || undefined
      },
      session
    });
    logger.info({
      scheduleId: sched._id,
      invoiceId: invoice._id,
      totalPeriods,
      exchangeRate,
      fxSource,
      fxIsOverride,
      normalizedTotal
    }, "[RevenueSchedule] Created");
    return sched;
  } catch (err) {
    logger.error({
      err,
      invoiceId: invoice?._id
    }, "[RevenueSchedule] createRevenueScheduleOnPayment failed (non-fatal)");
    return null;
  }
}
function _addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
module.exports = {
  createRevenueScheduleOnPayment
};