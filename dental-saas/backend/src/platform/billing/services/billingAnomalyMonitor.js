/**
 * billingAnomalyMonitor.js
 * Platform Billing — Runtime Anomaly Monitor
 *
 * Detects real-time billing anomalies that must trigger immediate kill switch activation.
 *
 * Rules enforced:
 *   RULE_1: invoice amount > 10× the average active plan price
 *   RULE_2: invoice amount = 0 for a paid (non-trial) contract
 *   RULE_3: more than 100 billing attempts in any 60-second rolling window
 *
 * When any rule fires:
 *   → activateBillingKillSwitch(reason, "anomaly-detection")
 *   → structured log: billing: true, event: "BILLING_ANOMALY_DETECTED"
 *
 * Usage:
 *   const monitor = require('./billingAnomalyMonitor');
 *   await monitor.checkInvoiceAnomaly({ amountMinor, contractId, organizationId });
 *   await monitor.checkBillingRateLimit(organizationId);
 *
 * PLANE: Platform
 * ALL CHECKS ARE NON-BLOCKING: a monitor failure never crashes the caller.
 */

"use strict";

const logger = require("@utils/logger");
const { activateBillingKillSwitch } = require("./billingControlService");

// ─── Constants ────────────────────────────────────────────────────────────────

const ANOMALY_MULTIPLIER = 10;          // invoice > 10× avg plan price → anomaly
const RATE_LIMIT_MAX = 100;             // max billing attempts per window
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60-second rolling window

// ─── In-process rate limit counter ───────────────────────────────────────────
// Intentionally simple: counts total billing operations globally (not per-org)
// for ultra-fast hot-path check. Per-org rate limiting can be added later via Redis.

let _billingAttemptCount = 0;
let _windowStart = Date.now();

function _recordBillingAttempt() {
    const now = Date.now();
    if (now - _windowStart > RATE_LIMIT_WINDOW_MS) {
        _billingAttemptCount = 0;
        _windowStart = now;
    }
    _billingAttemptCount++;
    return _billingAttemptCount;
}

// ─── Rule 1: Invoice amount anomaly ──────────────────────────────────────────

/**
 * checkInvoiceAnomaly
 *
 * Checks two rules on a generated invoice before it is committed:
 *   RULE_1: amountMinor > 10× avgPlanPriceMinor
 *   RULE_2: amountMinor === 0 for a non-trial contract (lockedPrice > 0)
 *
 * @param {object} opts
 * @param {number}  opts.amountMinor       - Invoice amount in minor currency units
 * @param {number}  opts.avgPlanPriceMinor - Platform average plan price (minor units)
 * @param {boolean} opts.isTrial           - Whether this is a trial (zero-price) contract
 * @param {string}  [opts.contractId]      - For logging
 * @param {string}  [opts.organizationId]  - For logging
 * @returns {Promise<{ anomalyDetected: boolean, rule?: string, reason?: string }>}
 */
async function checkInvoiceAnomaly({ amountMinor, avgPlanPriceMinor, isTrial = false, contractId, organizationId }) {
    try {
        const threshold = avgPlanPriceMinor * ANOMALY_MULTIPLIER;

        // RULE_1: invoice amount > 10× average plan price
        if (avgPlanPriceMinor > 0 && amountMinor > threshold) {
            const reason = `RULE_1_EXCESSIVE_AMOUNT: invoice ${amountMinor} > ${ANOMALY_MULTIPLIER}× avg plan price ${avgPlanPriceMinor} (threshold: ${threshold})`;

            logger.error({
                billing: true,
                event: "BILLING_ANOMALY_DETECTED",
                rule: "RULE_1_EXCESSIVE_AMOUNT",
                amountMinor,
                threshold,
                avgPlanPriceMinor,
                contractId,
                organizationId
            }, "[BILLING] BILLING_ANOMALY_DETECTED — excessive invoice amount");

            await activateBillingKillSwitch(reason, "anomaly-detection", "anomaly-monitor").catch(err => {
                logger.error({ billing: true, err: err.message }, "[BillingAnomalyMonitor] Failed to activate kill switch");
            });

            return { anomalyDetected: true, rule: "RULE_1_EXCESSIVE_AMOUNT", reason };
        }

        // RULE_2: zero amount invoice for a paid (non-trial) contract
        if (!isTrial && amountMinor === 0) {
            const reason = `RULE_2_ZERO_AMOUNT_PAID_CONTRACT: invoice amount is 0 for non-trial contract ${contractId}`;

            logger.error({
                billing: true,
                event: "BILLING_ANOMALY_DETECTED",
                rule: "RULE_2_ZERO_AMOUNT_PAID_CONTRACT",
                amountMinor,
                contractId,
                organizationId
            }, "[BILLING] BILLING_ANOMALY_DETECTED — zero-amount invoice on paid contract");

            await activateBillingKillSwitch(reason, "anomaly-detection", "anomaly-monitor").catch(err => {
                logger.error({ billing: true, err: err.message }, "[BillingAnomalyMonitor] Failed to activate kill switch");
            });

            return { anomalyDetected: true, rule: "RULE_2_ZERO_AMOUNT_PAID_CONTRACT", reason };
        }

        return { anomalyDetected: false };

    } catch (err) {
        // Monitor failure must never block billing — log and pass
        logger.error(
            { billing: true, event: "BILLING_ANOMALY_MONITOR_ERROR", err: err.message },
            "[BillingAnomalyMonitor] checkInvoiceAnomaly threw — non-fatal"
        );
        return { anomalyDetected: false };
    }
}

// ─── Rule 3: Billing rate limit ───────────────────────────────────────────────

/**
 * checkBillingRateLimit
 *
 * Increments the global billing attempt counter and checks if it exceeds
 * RATE_LIMIT_MAX within RATE_LIMIT_WINDOW_MS.
 *
 * Call this at the start of every billing operation (invoice generation,
 * subscription creation, Stripe charge attempt).
 *
 * @param {string} [context]         - Caller description for logging
 * @param {string} [organizationId]  - For log correlation
 * @returns {Promise<{ rateLimitExceeded: boolean, count: number }>}
 */
async function checkBillingRateLimit(context = "unknown", organizationId = null) {
    try {
        const count = _recordBillingAttempt();

        if (count > RATE_LIMIT_MAX) {
            const reason = `RULE_3_RATE_LIMIT_EXCEEDED: ${count} billing attempts in ${RATE_LIMIT_WINDOW_MS / 1000}s window (max: ${RATE_LIMIT_MAX})`;

            logger.error({
                billing: true,
                event: "BILLING_ANOMALY_DETECTED",
                rule: "RULE_3_RATE_LIMIT_EXCEEDED",
                count,
                windowMs: RATE_LIMIT_WINDOW_MS,
                limit: RATE_LIMIT_MAX,
                context,
                organizationId
            }, "[BILLING] BILLING_ANOMALY_DETECTED — billing rate limit exceeded");

            await activateBillingKillSwitch(reason, "anomaly-detection", "anomaly-monitor").catch(err => {
                logger.error({ billing: true, err: err.message }, "[BillingAnomalyMonitor] Failed to activate kill switch");
            });

            return { rateLimitExceeded: true, count };
        }

        return { rateLimitExceeded: false, count };

    } catch (err) {
        logger.error(
            { billing: true, event: "BILLING_ANOMALY_MONITOR_ERROR", err: err.message },
            "[BillingAnomalyMonitor] checkBillingRateLimit threw — non-fatal"
        );
        return { rateLimitExceeded: false, count: 0 };
    }
}

/**
 * resetRateLimitCounter
 * For testing only — resets the in-process billing attempt counter.
 */
function resetRateLimitCounter() {
    _billingAttemptCount = 0;
    _windowStart = Date.now();
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    checkInvoiceAnomaly,
    checkBillingRateLimit,
    resetRateLimitCounter,
    ANOMALY_MULTIPLIER,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS
};
