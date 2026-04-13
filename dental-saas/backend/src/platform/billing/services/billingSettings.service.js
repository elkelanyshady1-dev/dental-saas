/**
 * billingSettings.service.js
 * Sprint 7 — BillingSettings Singleton Accessor
 *
 * getBillingSettings() — returns the singleton BillingSettings document.
 * Creates the default document if it does not exist (upsert pattern).
 *
 * All renewal engine components MUST call this instead of using hardcoded constants.
 *
 * PLANE: Platform (shared service — called by cron jobs)
 */

"use strict";

const BillingSettings = require("../models/BillingSettings.model").default;
const logger = require("@utils/logger");

// In-memory cache with TTL (60s) to avoid hitting DB on every cron tick
let _cache = null;
let _cacheAt = null;
const CACHE_TTL_MS = 60_000;

/**
 * getBillingSettings
 * Returns the singleton BillingSettings document.
 * Creates default if absent. Cached for 60s.
 *
 * @returns {Promise<{ retryScheduleDays: number[], gracePeriodDays: number, maxRetries: number }>}
 */
async function getBillingSettings() {
    const now = Date.now();
    if (_cache && _cacheAt && now - _cacheAt < CACHE_TTL_MS) {
        return _cache;
    }

    let settings = await BillingSettings.findOne().lean();

    if (!settings) {
        logger.info("[BillingSettings] No settings document found — creating default");
        try {
            const doc = await BillingSettings.create({});
            settings = doc.toObject();
        } catch (err) {
            // Race condition: another process may have inserted simultaneously
            settings = await BillingSettings.findOne().lean();
            if (!settings) throw err;
        }
    }

    _cache = settings;
    _cacheAt = now;

    return settings;
}

/**
 * updateBillingSettings
 * Overwrites the singleton document fields.
 * Invalidates in-memory cache.
 *
 * @param {object} updates - Partial BillingSettings fields
 * @returns {Promise<BillingSettings>}
 */
async function updateBillingSettings(updates) {
    let settings = await BillingSettings.findOne();

    if (!settings) {
        settings = new BillingSettings(updates);
    } else {
        Object.assign(settings, updates);
    }

    await settings.save();
    _cache = null;
    _cacheAt = null;

    logger.info({ updates }, "[BillingSettings] Settings updated");
    return settings;
}

/**
 * invalidateCache — force-refresh on next call.
 * Useful after updateBillingSettings in tests.
 */
function invalidateCache() {
    _cache = null;
    _cacheAt = null;
}

module.exports = { getBillingSettings, updateBillingSettings, invalidateCache };
