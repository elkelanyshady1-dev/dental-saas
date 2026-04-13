/**
 * fxResolver.service.js
 * Sprint 7.2 — Hybrid FX Rate Resolver (Manual Override Priority)
 *
 * Resolution logic for two-tier FX engine:
 *
 *   Tier 1 (priority): Manual override
 *     - isOverride = true
 *     - effectiveDate <= resolveDate
 *     - Most recent (sort effectiveDate DESC)
 *
 *   Tier 2 (fallback): Auto rate
 *     - isOverride = false
 *     - effectiveDate <= resolveDate
 *     - Most recent (sort effectiveDate DESC)
 *
 *   No rate found → THROW (explicit failure, no silent defaults)
 *   Same currency → return 1.0 (no DB lookup)
 *
 * This is the ONLY function that should be called by RevenueSchedule creation.
 * The old exchangeRate.service.resolveRate() is for internal use only.
 *
 * PLANE: Platform / Finance
 */

"use strict";

const ExchangeRate = require("../models/ExchangeRate.model").default;
const logger = require("@utils/logger");

/**
 * resolveExchangeRate
 *
 * @param {string} fromCurrency - ISO 4217 source currency (e.g. "EGP")
 * @param {string} toCurrency   - ISO 4217 target currency (e.g. "USD")
 * @param {Date}   [date]       - Effective date (defaults to now)
 * @returns {Promise<{ rate: number, source: string, isOverride: boolean, effectiveDate: Date }>}
 * @throws  {Error}             - If no rate found for the pair
 */
async function resolveExchangeRate(fromCurrency, toCurrency, date = new Date()) {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    // ── Identity: same currency → no conversion ────────────────────────────────
    if (from === to) {
        return { rate: 1.0, source: "identity", isOverride: false, effectiveDate: date };
    }

    const baseQuery = {
        fromCurrency: from,
        toCurrency: to,
        effectiveDate: { $lte: date }
    };

    // ── Tier 1: Manual override (highest priority) ─────────────────────────────
    const override = await ExchangeRate.findOne({ ...baseQuery, isOverride: true })
        .sort({ effectiveDate: -1 })
        .lean();

    if (override) {
        logger.debug({
            from, to, rate: override.rate,
            effectiveDate: override.effectiveDate,
            source: "manual_override"
        }, "[FxResolver] Rate resolved via manual override");
        return {
            rate: override.rate,
            source: "manual",
            isOverride: true,
            effectiveDate: override.effectiveDate
        };
    }

    // ── Tier 2: Auto rate (fallback) ───────────────────────────────────────────
    const autoRate = await ExchangeRate.findOne({ ...baseQuery, isOverride: false })
        .sort({ effectiveDate: -1 })
        .lean();

    if (autoRate) {
        logger.debug({
            from, to, rate: autoRate.rate,
            effectiveDate: autoRate.effectiveDate,
            source: "auto"
        }, "[FxResolver] Rate resolved via auto rate");
        return {
            rate: autoRate.rate,
            source: "auto",
            isOverride: false,
            effectiveDate: autoRate.effectiveDate
        };
    }

    // ── No rate found ──────────────────────────────────────────────────────────
    const msg = `[FxResolver] No exchange rate found for ${from} → ${to} on or before ${date.toISOString()}`;
    logger.warn({ from, to, date }, msg);
    throw new Error(msg);
}

module.exports = { resolveExchangeRate };
