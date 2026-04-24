/**
 * ExchangeRate.model.js
 * Sprint 7.2 — Hybrid FX Engine (Auto Sync + Manual Override + Historical Locking)
 *
 * Stores exchange rates used for multi-currency revenue normalization.
 * Rates are locked at recognition time — never recalculated retroactively.
 *
 * Rate resolution order:
 *   1) Find exact rate for (fromCurrency → toCurrency) on effectiveDate
 *   2) Fall back to most recent rate for (fromCurrency → toCurrency) before effectiveDate
 *   3) If none found and fromCurrency === toCurrency → rate = 1
 *   4) If none found → throw (explicit failure, no silent default)
 *
 * Rate entry & resolution:
 *   - Auto rates inserted daily by fxSync.job.js (source="auto", isOverride=false)
 *   - Manual overrides via POST /platform/finance/exchange-rate (source="manual", isOverride=true)
 *
 * Override priority (fxResolver.service.js):
 *   1) Most recent manual override (isOverride=true) on or before date — use if found
 *   2) Most recent auto rate (isOverride=false) on or before date — fallback
 *   3) Neither found → throw (no silent defaults)
 *
 * Index design:
 *   - Unique per (from, to, effectiveDate, isOverride) — allows one auto + one manual per date
 *   - Sort index (from, to, effectiveDate DESC) — fast latest-rate lookup
 *
 * PLANE: Platform / Finance
 * COLLECTION: exchangerates
 */

"use strict";

const mongoose = require("mongoose");
const exchangeRateSchema = new mongoose.Schema({
  // ── Currency Pair ──────────────────────────────────────────────────────
  fromCurrency: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    validate: {
      validator: v => /^[A-Z]{3}$/.test(v),
      message: "fromCurrency must be a valid 3-letter ISO 4217 code"
    }
  },
  toCurrency: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    validate: {
      validator: v => /^[A-Z]{3}$/.test(v),
      message: "toCurrency must be a valid 3-letter ISO 4217 code"
    }
  },
  // ── Rate ──────────────────────────────────────────────────────────────
  // e.g. 1 EGP = 0.032 USD → { fromCurrency: "EGP", toCurrency: "USD", rate: 0.032 }
  rate: {
    type: Number,
    required: true,
    min: [0.000001, "Exchange rate must be positive"]
  },
  // ── Validity ──────────────────────────────────────────────────────────
  // The date this rate was effective from. Used for historical locking.
  effectiveDate: {
    type: Date,
    required: true
  },
  // Source: "auto" = inserted by fxSync.job.js, "manual" = admin override
  source: {
    type: String,
    enum: ["auto", "manual"],
    default: "auto"
  },
  // isOverride: true for manual entries — takes priority over auto rates
  // in fxResolver.service.js resolution logic
  isOverride: {
    type: Boolean,
    default: false
  },
  // Who created this rate (PlatformUser._id or "system" for auto)
  createdBy: {
    type: String,
    default: "system"
  }
}, {
  timestamps: {
    createdAt: true,
    updatedAt: false
  },
  // Immutable — append-only
  collection: "exchangerates"
});

// ─── Indexes ───────────────────────────────────────────────────────────────────
// Primary resolution: most recent rate for a pair (scans by date desc)
exchangeRateSchema.index({
  fromCurrency: 1,
  toCurrency: 1,
  effectiveDate: -1
});
// Override-priority filter: manual-first queries add { isOverride: true } to filter
exchangeRateSchema.index({
  fromCurrency: 1,
  toCurrency: 1,
  isOverride: 1,
  effectiveDate: -1
});
// Uniqueness: one auto rate AND one manual rate per pair per date (isOverride distinguishes them)
exchangeRateSchema.index({
  fromCurrency: 1,
  toCurrency: 1,
  effectiveDate: 1,
  isOverride: 1
}, {
  unique: true
});
const modelName = "ExchangeRate";
module.exports = {
  modelName,
  schema: exchangeRateSchema
};