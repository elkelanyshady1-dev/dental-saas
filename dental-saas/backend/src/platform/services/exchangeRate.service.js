/**
 * exchangeRate.service.js
 * Sprint 7.1 — Exchange Rate Resolution Service
 *
 * Responsible for:
 *   1) resolveRate(fromCurrency, toCurrency, onDate?) → number
 *      Finds the most recent ExchangeRate effective on or before onDate.
 *
 *   2) upsertRate({ fromCurrency, toCurrency, rate, effectiveDate, source, createdBy })
 *      Admin write — creates or updates a rate for the given date.
 *
 *   3) listRates({ fromCurrency?, toCurrency?, limit? }) → ExchangeRate[]
 *
 * Resolution logic:
 *   - If fromCurrency === toCurrency → return 1.0 (no DB lookup)
 *   - Find most recent rate for (from → to) where effectiveDate <= onDate
 *   - If not found → throw (explicit failure, no silent 1.0 default)
 *
 * PLANE: Platform / Finance
 */

"use strict";

const ExchangeRate = require("../finance/models/ExchangeRate.model").default;
const logger = require("@utils/logger");

/**
 * resolveRate
 * Returns exchange rate from → to as of onDate (defaults to now).
 * Permanently safe to call at recognition time — result is then stored on the schedule.
 *
 * @param {string} fromCurrency - ISO 4217, e.g. "EGP"
 * @param {string} toCurrency   - ISO 4217, e.g. "USD"
 * @param {Date}   [onDate]     - Date to resolve rate for (defaults to now)
 * @returns {Promise<number>}   - Exchange rate (e.g. 0.032)
 * @throws  {Error}             - If no rate found for the pair
 */
async function resolveRate(fromCurrency, toCurrency, onDate = new Date()) {
    // ── Same currency: no conversion needed ───────────────────────────────────
    if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
        return 1.0;
    }

    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    // ── Query: most recent rate on or before onDate ───────────────────────────
    const rate = await ExchangeRate.findOne({
        fromCurrency: from,
        toCurrency: to,
        effectiveDate: { $lte: onDate }
    })
        .sort({ effectiveDate: -1 })
        .lean();

    if (!rate) {
        const msg = `[ExchangeRate] No rate found for ${from} → ${to} on or before ${onDate.toISOString()}`;
        logger.warn({ from, to, onDate }, msg);
        throw new Error(msg);
    }

    logger.debug({ from, to, rate: rate.rate, effectiveDate: rate.effectiveDate },
        "[ExchangeRate] Rate resolved");

    return rate.rate;
}

/**
 * upsertRate
 * Admin write — creates or replaces the rate for a specific currency pair and date.
 * Idempotent: updating the same pair+date replaces the existing record.
 *
 * @param {object} params
 * @param {string} params.fromCurrency
 * @param {string} params.toCurrency
 * @param {number} params.rate
 * @param {Date|string} params.effectiveDate
 * @param {string} [params.source="manual"]
 * @param {string} [params.createdBy="system"]
 * @returns {Promise<ExchangeRate>}
 */
async function upsertRate({
    fromCurrency,
    toCurrency,
    rate,
    effectiveDate,
    source = "manual",
    createdBy = "system"
}) {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    const date = new Date(effectiveDate);
    const isOverride = (source === "manual");

    // Upsert — unique index on (from, to, effectiveDate, isOverride) ensures idempotency
    const doc = await ExchangeRate.findOneAndUpdate(
        { fromCurrency: from, toCurrency: to, effectiveDate: date, isOverride },
        { fromCurrency: from, toCurrency: to, rate, effectiveDate: date, source, isOverride, createdBy },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    logger.info({ from, to, rate, effectiveDate: date, isOverride }, "[ExchangeRate] Rate upserted");
    return doc;
}

/**
 * listRates
 * Admin read — returns recent rates, optionally filtered by currency pair.
 *
 * @param {object} [opts]
 * @param {string} [opts.fromCurrency]
 * @param {string} [opts.toCurrency]
 * @param {number} [opts.limit=50]
 * @returns {Promise<ExchangeRate[]>}
 */
async function listRates({ fromCurrency, toCurrency, limit = 50, isOverride } = {}) {
    const filter = {};
    if (fromCurrency) filter.fromCurrency = fromCurrency.toUpperCase();
    if (toCurrency) filter.toCurrency = toCurrency.toUpperCase();
    if (isOverride !== undefined) filter.isOverride = isOverride;

    return ExchangeRate.find(filter)
        .sort({ isOverride: -1, effectiveDate: -1 }) // overrides first within same date bucket
        .limit(Math.min(limit, 200))
        .lean();
}

module.exports = { resolveRate, upsertRate, listRates };
