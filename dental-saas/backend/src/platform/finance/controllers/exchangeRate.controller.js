/**
 * exchangeRate.controller.js
 * Sprint 7.1 — Exchange Rate Admin API
 *
 * POST /api/platform/finance/exchange-rate
 *   → upsertRate()  (MANAGE_PLATFORM_SETTINGS)
 *
 * GET  /api/platform/finance/exchange-rates
 *   → listRates()   (MANAGE_PLATFORM_SETTINGS)
 *
 * PLANE: Platform / Finance
 */

"use strict";

const { upsertRate, listRates } = require("../../services/exchangeRate.service");
const logger = require("@utils/logger");

// ─── POST /api/platform/finance/exchange-rate ──────────────────────────────────
exports.createOrUpdateRate = async (req, res) => {
    try {
        const { fromCurrency, toCurrency, rate, effectiveDate, source } = req.body;

        if (!fromCurrency || !toCurrency || rate === undefined || !effectiveDate) {
            return res.status(400).json({
                success: false,
                error: "fromCurrency, toCurrency, rate, and effectiveDate are required"
            });
        }
        if (typeof rate !== "number" || rate <= 0) {
            return res.status(400).json({
                success: false,
                error: "rate must be a positive number"
            });
        }

        const date = new Date(effectiveDate);
        if (isNaN(date.getTime())) {
            return res.status(400).json({ success: false, error: "Invalid effectiveDate" });
        }

        const doc = await upsertRate({
            fromCurrency,
            toCurrency,
            rate,
            effectiveDate: date,
            source: source || "manual",
            createdBy: req.platformUser?._id?.toString() || "system"
        });

        return res.status(201).json({ success: true, data: doc });

    } catch (err) {
        logger.error({ err }, "[ExchangeRateController] createOrUpdateRate failed");
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// ─── GET /api/platform/finance/exchange-rates ─────────────────────────────────
exports.listExchangeRates = async (req, res) => {
    try {
        const { fromCurrency, toCurrency } = req.query;
        const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
        const isOverride = req.query.isOverride !== undefined
            ? req.query.isOverride === "true"
            : undefined;

        const rates = await listRates({ fromCurrency, toCurrency, limit, isOverride });

        return res.json({
            success: true,
            data: rates,
            count: rates.length,
            baseCurrencyNote: "All rates listed for query. Source: auto=daily sync, manual=admin override."
        });

    } catch (err) {
        logger.error({ err }, "[ExchangeRateController] listExchangeRates failed");
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};
