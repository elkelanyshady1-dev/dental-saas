/**
 * fxSync.job.js
 * Sprint 7.2 — Daily FX Rate Auto-Sync Job
 *
 * Schedule: 00:30 UTC daily (before renewal at 00:05 next day, after midnight reset)
 *
 * Behavior:
 *   1) Fetch BillingSettings → baseReportingCurrency + exchangeRateSource
 *   2) If exchangeRateSource = "manual" → skip (log and exit)
 *   3) For each supported currency pair:
 *        a) Fetch rate from provider (currently: placeholder stub)
 *        b) Check if a MANUAL OVERRIDE exists for today → if yes, skip this pair
 *        c) Insert ExchangeRate with source="auto", isOverride=false
 *   4) Log results
 *
 * Critical invariant:
 *   Auto rates NEVER overwrite manual overrides.
 *   The unique index is (from, to, effectiveDate, isOverride) so they can coexist.
 *
 * Provider integration:
 *   Replace _fetchRateFromProvider() with real API call when exchangeRateSource="external_api".
 *   Supported providers: open_exchange_rates, ecb, fixer_io (future).
 *
 * Register at bootstrap:
 *   require('./jobs/fxSync.job').start()
 *
 * PLANE: jobs / finance
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const cron = require("node-cron");
const ExchangeRateDef = require("../platform/finance/models/ExchangeRate.model");
let _ExchangeRate_cache = null;
function ExchangeRate() {
    return _ExchangeRate_cache || (_ExchangeRate_cache = getPlatformModel(ExchangeRateDef));
}
const {
  getBillingSettings
} = require("../platform/billing/services/billingSettings.service");
const logger = require("../utils/logger");

// ─── Supported currency pairs to sync ─────────────────────────────────────────
// Add additional pairs here as the platform expands to new markets.
// Format: [fromCurrency, toCurrency]
const SUPPORTED_PAIRS = [["EGP", "USD"], ["SAR", "USD"], ["AED", "USD"], ["EUR", "USD"], ["GBP", "USD"], ["USD", "EUR"], ["EGP", "EUR"]];

// ─── Provider stub ─────────────────────────────────────────────────────────────
/**
 * _fetchRateFromProvider
 * Placeholder — replace with real HTTP call when exchangeRateSource = "external_api".
 *
 * @param {string} from
 * @param {string} to
 * @returns {Promise<number|null>} - null signals provider unavailable for this pair
 */
async function _fetchRateFromProvider(from, to) {
  // TODO: Integrate with real provider when exchangeRateSource = "external_api"
  // Example: openexchangerates.org, fixer.io, ECB data feed
  // For now: return null so no rates are auto-inserted in dev without provider config
  logger.debug({
    from,
    to
  }, "[FxSync] Provider fetch (stub) — returning null");
  return null;
}

// ─── _syncPair ─────────────────────────────────────────────────────────────────
/**
 * Sync a single currency pair for the given effective date.
 * Skips silently if a manual override already exists for this pair+date.
 *
 * @returns {Promise<"inserted"|"skipped_override"|"skipped_no_rate"|"error">}
 */
async function _syncPair(from, to, effectiveDate) {
  try {
    // ── Safety: skip if manual override exists for today ─────────────────
    const existingOverride = await ExchangeRate().findOne({
      fromCurrency: from,
      toCurrency: to,
      effectiveDate,
      isOverride: true
    }).lean();
    if (existingOverride) {
      logger.info({
        from,
        to,
        effectiveDate
      }, "[FxSync] Manual override present — auto rate skipped");
      return "skipped_override";
    }

    // ── Fetch from provider ──────────────────────────────────────────────
    const rate = await _fetchRateFromProvider(from, to);
    if (rate === null) {
      logger.debug({
        from,
        to
      }, "[FxSync] Provider returned null — skipping pair");
      return "skipped_no_rate";
    }

    // ── Upsert auto rate (safe: unique index prevents double-insert) ─────
    await ExchangeRate().findOneAndUpdate({
      fromCurrency: from,
      toCurrency: to,
      effectiveDate,
      isOverride: false
    }, {
      fromCurrency: from,
      toCurrency: to,
      rate,
      effectiveDate,
      source: "auto",
      isOverride: false,
      createdBy: "system"
    }, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    });
    logger.info({
      from,
      to,
      rate,
      effectiveDate
    }, "[FxSync] Auto rate inserted");
    return "inserted";
  } catch (err) {
    logger.error({
      err,
      from,
      to
    }, "[FxSync] Error syncing pair");
    return "error";
  }
}

// ─── syncFxRates ───────────────────────────────────────────────────────────────
/**
 * Core sync logic — can be triggered manually or via cron.
 * @returns {Promise<{ inserted: number, skippedOverride: number, skippedNoRate: number, errors: number }>}
 */
async function syncFxRates() {
  const settings = await getBillingSettings();
  if (settings.exchangeRateSource !== "external_api") {
    logger.info({
      exchangeRateSource: settings.exchangeRateSource
    }, "[FxSync] exchangeRateSource is not 'external_api' — auto sync skipped");
    return {
      inserted: 0,
      skippedOverride: 0,
      skippedNoRate: 0,
      errors: 0,
      skippedConfig: true
    };
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // normalize to midnight UTC

  const stats = {
    inserted: 0,
    skippedOverride: 0,
    skippedNoRate: 0,
    errors: 0
  };
  const pairs = SUPPORTED_PAIRS.filter(([, to]) => to === settings.baseReportingCurrency.toUpperCase() || SUPPORTED_PAIRS.some(([f]) => f === settings.baseReportingCurrency.toUpperCase()));
  for (const [from, to] of pairs) {
    const result = await _syncPair(from, to, today);
    if (result === "inserted") stats.inserted++;else if (result === "skipped_override") stats.skippedOverride++;else if (result === "skipped_no_rate") stats.skippedNoRate++;else if (result === "error") stats.errors++;
  }
  logger.info({
    stats
  }, "[FxSync] Sync complete");
  return stats;
}

// ─── Cron wrapper ──────────────────────────────────────────────────────────────
let _job = null;

/**
 * start — register the daily FX sync cron.
 * @param {string} [schedule="30 0 * * *"] — 00:30 UTC daily
 */
function start(schedule = "30 0 * * *") {
  if (_job) {
    _job.stop();
  }
  _job = cron.schedule(schedule, async () => {
    logger.info({
      job: "fxSync",
      at: new Date().toISOString()
    }, "[FxSyncJob] Starting daily run");
    try {
      const stats = await syncFxRates();
      logger.info({
        stats
      }, "[FxSyncJob] Complete");
    } catch (err) {
      logger.error({
        err
      }, "[FxSyncJob] Unhandled error");
    }
  }, {
    scheduled: true,
    timezone: process.env.CRON_TIMEZONE || "UTC"
  });
  logger.info({
    schedule
  }, "[FxSyncJob] Registered");
}
function stop() {
  if (_job) {
    _job.stop();
    _job = null;
  }
}
async function runNow() {
  logger.info("[FxSyncJob] Manual trigger");
  return syncFxRates();
}
module.exports = {
  start,
  stop,
  runNow,
  syncFxRates
};