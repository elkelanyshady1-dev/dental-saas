/**
 * revenueRecognition.job.js
 * Sprint 7.1 — Monthly Revenue Recognition + Multi-Currency Normalization
 *
 * Schedule: 1st of each month at 02:00 UTC
 *
 * Per RevenueSchedule:
 *   1) Find active schedules with remaining deferredAmount
 *   2) Calculate original monthly portion: min(amountPerPeriod, deferredAmount)
 *   3) Calculate normalized portion: min(normalizedAmountPerPeriod, normalizedDeferredAmount)
 *      → Uses the pre-computed (locked) normalizedAmountPerPeriod — NEVER re-fetches exchange rate
 *   4) Update both original and normalized amounts atomically
 *   5) Sync PlatformInvoice.recognizedRevenue and .deferredRevenue (original amounts)
 *   6) Emit REVENUE_RECOGNIZED to BillingAuditLog
 *
 * PLANE: jobs / finance
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const cron = require("node-cron");
const mongoose = require("mongoose");
const RevenueScheduleDef = require("../platform/finance/models/RevenueSchedule.model");
let _RevenueSchedule_cache = null;
function RevenueSchedule() {
    return _RevenueSchedule_cache || (_RevenueSchedule_cache = getPlatformModel(RevenueScheduleDef));
}
const PlatformInvoiceDef = require("../platform/billing/models/PlatformInvoice.model");
let _PlatformInvoice_cache = null;
function PlatformInvoice() {
    return _PlatformInvoice_cache || (_PlatformInvoice_cache = getPlatformModel(PlatformInvoiceDef));
}
const {
  logBillingEvent
} = require("../platform/billing/services/billingAuditLog.service");
const logger = require("../utils/logger");
const SYSTEM_ACTOR = "000000000000000000000000";

// ─── recognizeRevenue ──────────────────────────────────────────────────────────
/**
 * Core recognition logic — safe to call manually or via cron.
 * @returns {Promise<{ processed: number, fullyRecognized: number, errors: number }>}
 */
async function recognizeRevenue() {
  const now = new Date();
  logger.info({
    action: "revenue_recognition_start",
    now
  }, "[RevenueRecognition] Starting recognition pass");
  const schedules = await RevenueSchedule().find({
    status: "active",
    deferredAmount: {
      $gt: 0
    },
    endDate: {
      $gte: now
    }
  }).lean();
  logger.info({
    count: schedules.length
  }, "[RevenueRecognition] Schedules to process");
  let processed = 0,
    fullyRecognized = 0,
    errors = 0;
  for (const sched of schedules) {
    try {
      // ── Original amounts ─────────────────────────────────────────────
      const portion = Math.min(sched.amountPerPeriod, sched.deferredAmount);
      const newRecognized = +(sched.recognizedAmount + portion).toFixed(6);
      const newDeferred = +(sched.deferredAmount - portion).toFixed(6);
      const isFullyRecog = newDeferred <= 0.001;

      // ── Normalized amounts (use pre-locked rate — never re-fetch) ────
      // Falls back gracefully if normalized fields are 0 (missing rate at creation)
      const normPortion = Math.min(sched.normalizedAmountPerPeriod || 0, sched.normalizedDeferredAmount || 0);
      const newNormRecognized = +((sched.normalizedRecognizedAmount || 0) + normPortion).toFixed(6);
      const newNormDeferred = +((sched.normalizedDeferredAmount || 0) - normPortion).toFixed(6);
      const newNormDeferredFinal = isFullyRecog ? 0 : Math.max(0, newNormDeferred);
      const session = await mongoose.startSession();
      try {
        session.startTransaction();
        const ls = await RevenueSchedule().findById(sched._id).session(session);
        if (!ls || ls.status !== "active") {
          await session.abortTransaction();
          session.endSession();
          continue;
        }

        // Original fields
        ls.recognizedAmount = newRecognized;
        ls.deferredAmount = isFullyRecog ? 0 : newDeferred;
        ls.periodsRecognized = (ls.periodsRecognized || 0) + 1;
        ls.lastRecognitionDate = now;
        // Normalized fields (parallel update, locked rate)
        ls.normalizedRecognizedAmount = newNormRecognized;
        ls.normalizedDeferredAmount = newNormDeferredFinal;
        if (isFullyRecog) ls.status = "fully_recognized";
        await ls.save({
          session
        });

        // ── Sync PlatformInvoice (original amounts) ──────────────────
        await PlatformInvoice().findByIdAndUpdate(sched.invoiceId, {
          $set: {
            recognizedRevenue: newRecognized,
            deferredRevenue: isFullyRecog ? 0 : newDeferred
          }
        }, {
          session
        });
        await logBillingEvent({
          organizationId: sched.organizationId,
          contractId: sched.contractId,
          invoiceId: sched.invoiceId,
          eventType: "REVENUE_RECOGNIZED",
          previousState: {
            recognizedAmount: sched.recognizedAmount,
            deferredAmount: sched.deferredAmount,
            normalizedRecognizedAmount: sched.normalizedRecognizedAmount || 0,
            normalizedDeferredAmount: sched.normalizedDeferredAmount || 0
          },
          newState: {
            recognizedAmount: newRecognized,
            deferredAmount: isFullyRecog ? 0 : newDeferred,
            normalizedRecognizedAmount: newNormRecognized,
            normalizedDeferredAmount: newNormDeferredFinal
          },
          performedBy: SYSTEM_ACTOR,
          metadata: {
            period: now.toISOString().slice(0, 7),
            portion,
            normPortion,
            exchangeRate: sched.exchangeRate,
            originalCurrency: sched.originalCurrency || sched.currency,
            normalizedCurrency: sched.normalizedCurrency,
            isFullyRecognized: isFullyRecog
          },
          session
        });
        await session.commitTransaction();
        session.endSession();
        processed++;
        if (isFullyRecog) fullyRecognized++;
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
      }
    } catch (err) {
      errors++;
      logger.error({
        err,
        scheduleId: sched._id
      }, "[RevenueRecognition] Error processing schedule");
    }
  }
  logger.info({
    processed,
    fullyRecognized,
    errors
  }, "[RevenueRecognition] Recognition pass complete");
  return {
    processed,
    fullyRecognized,
    errors
  };
}

// ─── Cron job wrapper ──────────────────────────────────────────────────────────
let _job = null;
function start(schedule = "0 2 1 * *") {
  if (_job) {
    _job.stop();
  }
  _job = cron.schedule(schedule, async () => {
    logger.info({
      job: "revenueRecognition",
      at: new Date().toISOString()
    }, "[RevenueRecognitionJob] Starting monthly run");
    try {
      const stats = await recognizeRevenue();
      logger.info({
        stats
      }, "[RevenueRecognitionJob] Complete");
    } catch (err) {
      logger.error({
        err
      }, "[RevenueRecognitionJob] Unhandled error");
    }
  }, {
    scheduled: true,
    timezone: process.env.CRON_TIMEZONE || "UTC"
  });
  logger.info({
    schedule
  }, "[RevenueRecognitionJob] Registered");
}
function stop() {
  if (_job) {
    _job.stop();
    _job = null;
  }
}
async function runNow() {
  logger.info("[RevenueRecognitionJob] Manual trigger");
  return recognizeRevenue();
}
module.exports = {
  start,
  stop,
  runNow,
  recognizeRevenue
};