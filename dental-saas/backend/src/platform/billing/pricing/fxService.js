/**
 * fxService.js
 * Platform Billing — FX Service for Checkout Hot Path
 *
 * Thin wrapper around the existing fxResolver.service.resolveExchangeRate().
 * Adds a 60-second in-process cache so the checkout and public pricing paths
 * can call it repeatedly without hammering the exchangerates collection.
 *
 * Resolution chain (delegated to fxResolver):
 *   1) Manual override (ExchangeRate.isOverride = true) — admin pinned
 *   2) Auto rate (source = "auto") — daily fxSync.job
 *   3) Identity (from === to) → rate = 1.0
 *   4) None found → throws
 *
 * This is the single entrypoint for CHECKOUT-TIME currency conversion.
 * Revenue-recognition code continues to call fxResolver directly so that
 * historical rate locking (effectiveDate in the past) bypasses the cache.
 *
 * PLANE: Platform / Billing
 */

"use strict";

const { resolveExchangeRate } = require("@platform/finance/services/fxResolver.service");
const logger = require("@utils/logger");

// ─── In-Process Cache ────────────────────────────────────────────────────────
// Checkout hot-path cache. Keyed by "FROM>TO". Entries expire after TTL ms.
// A single process typically sees 1–2 currency pairs (USD>EGP today), so the
// cache stays tiny. Deliberately NOT a shared cache (Redis) — one round trip
// per minute to Mongo is acceptable, and local caches avoid stampede bugs.
const TTL_MS = 60 * 1000;
const cache = new Map(); // key -> { rate, expiresAt, source, effectiveDate }

function _cacheKey(from, to) {
    return `${from.toUpperCase()}>${to.toUpperCase()}`;
}

/**
 * getRate
 * Returns the current USD→EGP (or any pair) rate for checkout-time conversion.
 *
 * @param {string} from - ISO 4217 (e.g. "USD")
 * @param {string} to   - ISO 4217 (e.g. "EGP")
 * @returns {Promise<number>} rate — multiply `from` amount by this to get `to`
 * @throws {Error} if no rate is available (propagated from fxResolver)
 */
async function getRate(from, to) {
    const key = _cacheKey(from, to);
    const now = Date.now();

    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
        _emitFxRateUsed({ from, to, rate: cached.rate, source: cached.source, cached: true });
        return cached.rate;
    }

    // Identity bypass — cached for the normal TTL
    if (from.toUpperCase() === to.toUpperCase()) {
        cache.set(key, { rate: 1.0, expiresAt: now + TTL_MS, source: "identity", effectiveDate: new Date() });
        _emitFxRateUsed({ from, to, rate: 1.0, source: "identity", cached: false });
        return 1.0;
    }

    // ── Delegate to the canonical resolver (manual > auto > throw) ──────────
    // v4: Hard-fail on missing rate. resolveExchangeRate throws when nothing
    // is on record; we re-throw with a stable error code so callers (checkout,
    // pricing engine) can surface FX_RATE_UNAVAILABLE cleanly.
    let resolved;
    try {
        resolved = await resolveExchangeRate(from, to, new Date());
    } catch (err) {
        const fxErr = new Error(`FX_RATE_UNAVAILABLE: no ${from}→${to} rate on record`);
        fxErr.code = "FX_RATE_UNAVAILABLE";
        fxErr.cause = err;
        logger.error({ from, to, err: err.message }, "[fxService] FX rate unavailable");
        throw fxErr;
    }

    if (!resolved || typeof resolved.rate !== "number") {
        const fxErr = new Error(`FX_RATE_UNAVAILABLE: resolver returned no rate for ${from}→${to}`);
        fxErr.code = "FX_RATE_UNAVAILABLE";
        logger.error({ from, to, resolved }, "[fxService] FX rate resolver returned nothing");
        throw fxErr;
    }

    // ── Staleness gate ───────────────────────────────────────────────────────
    // In production, reject rates older than 48h UNLESS they were pinned by
    // an admin (source === "manual"). Manual overrides are explicitly
    // operator-pinned, so staleness is intentional (e.g. fixed contractual
    // rate). Non-production environments (dev, staging, CI) stay permissive
    // so tests and local dev keep working without a fresh fx sync.
    const ageMs = now - new Date(resolved.effectiveDate).getTime();
    const ageHours = Math.round(ageMs / 3600000);
    const isStale = ageMs > 48 * 3600 * 1000;
    const isProd = process.env.NODE_ENV === "production";
    const isManualOverride = resolved.source === "manual" || resolved.isOverride === true;

    if (isStale && isProd && !isManualOverride) {
        const staleErr = new Error(
            `FX_RATE_STALE: ${from}→${to} rate is ${ageHours}h old (>48h). ` +
            `Check fxSync.job health or pin a manual override.`
        );
        staleErr.code = "FX_RATE_STALE";
        staleErr.details = { from, to, ageHours, effectiveDate: resolved.effectiveDate, source: resolved.source };
        logger.error(staleErr.details, "[fxService] FX rate stale — blocking checkout");
        throw staleErr;
    }

    if (isStale) {
        logger.warn({
            from, to, ageHours,
            effectiveDate: resolved.effectiveDate, source: resolved.source,
            isProd, isManualOverride
        }, "[fxService] FX rate stale (>48h) — allowed (non-prod or manual override)");
    }

    cache.set(key, {
        rate: resolved.rate,
        expiresAt: now + TTL_MS,
        source: resolved.source,
        effectiveDate: resolved.effectiveDate
    });

    _emitFxRateUsed({ from, to, rate: resolved.rate, source: resolved.source, cached: false, ageHours });
    return resolved.rate;
}

// ─── Log Helpers ──────────────────────────────────────────────────────────────
// Standardized structured event per v4 billing hardening spec (Task A5).
function _emitFxRateUsed({ from, to, rate, source, cached, ageHours }) {
    logger.info({
        event: "FX_RATE_USED",
        from, to, rate, source,
        cached: Boolean(cached),
        ageHours: ageHours ?? null
    }, "[fxService] FX_RATE_USED");
}

/**
 * invalidate — clear the in-process cache.
 * Called by the admin FX override endpoint so a freshly-pinned rate takes
 * effect on the next checkout without waiting for TTL expiry.
 *
 * @param {string} [from] - optional pair filter (e.g. "USD")
 * @param {string} [to]   - optional pair filter (e.g. "EGP")
 *   If both provided, only that key is dropped. Otherwise the whole cache
 *   is cleared (safe default — the cache is tiny).
 */
function invalidate(from, to) {
    if (from && to) {
        cache.delete(_cacheKey(from, to));
        return;
    }
    cache.clear();
}

/**
 * _peek — test-only cache inspection
 * @internal
 */
function _peek(from, to) {
    return cache.get(_cacheKey(from, to)) || null;
}

module.exports = { getRate, invalidate, _peek, TTL_MS };
