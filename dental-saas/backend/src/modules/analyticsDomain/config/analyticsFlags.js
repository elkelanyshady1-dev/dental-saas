/**
 * analyticsFlags.js — Feature flags for the analytics domain.
 *
 * USE_LEDGER_ANALYTICS: when true, revenue analytics read from the
 *   double-entry JournalEntry ledger (SSOT) instead of raw PatientInvoice /
 *   PatientPayment collections. Default: true (ledger is the source of truth
 *   once it's been populated for the org).
 *
 * Controls:
 *   - env var ANALYTICS_LEDGER_MODE = "ledger" | "legacy" | "auto"
 *     (unset → "ledger")
 *   - per-request override via req.headers["x-analytics-mode"] (dev / ops only;
 *     gated by requireOrgPermission(ANALYTICS_READ) upstream, so only trusted
 *     callers can supply it).
 *
 * "auto" mode: use ledger if the org has any JournalEntry rows within the
 *   requested window; fall back to legacy otherwise. Safe for orgs that haven't
 *   backfilled yet.
 */

"use strict";

function getAnalyticsMode(req) {
    const header = typeof req?.headers?.["x-analytics-mode"] === "string"
        ? req.headers["x-analytics-mode"].toLowerCase()
        : null;
    if (header && ["ledger", "legacy", "auto"].includes(header)) return header;

    const env = (process.env.ANALYTICS_LEDGER_MODE || "").toLowerCase();
    if (env === "legacy" || env === "ledger" || env === "auto") return env;

    return "ledger";
}

function shouldUseLedger(req) {
    return getAnalyticsMode(req) === "ledger";
}

function shouldAutoDetect(req) {
    return getAnalyticsMode(req) === "auto";
}

module.exports = {
    getAnalyticsMode,
    shouldUseLedger,
    shouldAutoDetect,
};
