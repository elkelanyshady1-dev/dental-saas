/**
 * billingIntegrity.job.js
 * Sprint 5 — Billing Integrity Monitoring (Production Safety Layer)
 *
 * PURPOSE:
 * Runs billing invariant checks every 15 minutes to detect financial data
 * corruption early — before it compounds into revenue discrepancies or
 * audit failures.
 *
 * CHECKS PERFORMED (via runFullIntegrityCheck):
 *   1. Payment Totals Parity     — ledger payments match invoice paid totals
 *   2. Ledger Revenue Replay     — net revenue reconstructible from events
 *   3. Anomaly Detection         — negative invoices, orphans, duplicates,
 *                                  PAYMENT_WITHOUT_INVOICE
 *
 * LOGGING:
 *   INTEGRITY OK   → INFO  event: BILLING_INTEGRITY_OK
 *   VIOLATION      → ERROR event: BILLING_INTEGRITY_VIOLATION
 *   JOB FAILURE    → ERROR event: BILLING_INTEGRITY_JOB_FAILED
 *
 * PLANE: Infrastructure/Jobs — calls Platform billing services (read-only).
 * NO WRITES — this job is 100% read-only; it never modifies any collection.
 */
// Default schedule: every 15 minutes ("*/15 * * * *")
// Override via CRON_BILLING_INTEGRITY env var. Disable via JOB_BILLING_INTEGRITY=false.


"use strict";

const cron = require("node-cron");
const logger = require("../utils/logger");
const { runFullIntegrityCheck } = require("../platform/billing/services/billingInvariantMonitor.service");

let _job = null;

/**
 * Core job logic — extracted so runNow() can call it directly.
 * @returns {Promise<object>} The integrity check result
 */
async function runBillingIntegrityCheck() {
    const correlationId = `billing-integrity-cron-${Date.now()}`;

    logger.info(
        { job: "billingIntegrity", correlationId, at: new Date().toISOString() },
        "[BillingIntegrityJob] Starting integrity scan"
    );

    try {
        const result = await runFullIntegrityCheck({ correlationId });

        if (!result.ok) {
            logger.error(
                {
                    event: "BILLING_INTEGRITY_VIOLATION",
                    correlationId,
                    anomalyCount: result.anomalies?.length ?? 0,
                    anomalies: result.anomalies,
                    checks: result.checks
                },
                "[BillingIntegrityJob] ⚠ Billing integrity violation detected"
            );
        } else {
            logger.info(
                {
                    event: "BILLING_INTEGRITY_OK",
                    correlationId,
                    checks: result.checks
                },
                "[BillingIntegrityJob] ✓ Billing integrity OK"
            );
        }

        return result;

    } catch (err) {
        logger.error(
            {
                event: "BILLING_INTEGRITY_JOB_FAILED",
                correlationId,
                error: err.message
            },
            "[BillingIntegrityJob] ❌ Integrity job threw unhandled error"
        );
        throw err;
    }
}

/**
 * start — Register this job with the cron scheduler.
 * Called by jobs/index.js as part of startAllJobs().
 *
 * @param {string} schedule - cron expression (default: every 15 minutes)
 */
function start(schedule = "*/15 * * * *") {
    if (_job) { _job.stop(); }

    _job = cron.schedule(schedule, async () => {
        try {
            await runBillingIntegrityCheck();
        } catch (_) {
            // Error already logged inside runBillingIntegrityCheck — suppress here
            // so one failed run does not crash the scheduler.
        }
    }, { scheduled: true, timezone: process.env.CRON_TIMEZONE || "UTC" });

    logger.info({ schedule }, "[BillingIntegrityJob] Registered");
}

/**
 * stop — Gracefully unschedule the job.
 * Called by jobs/index.js as part of stopAllJobs().
 */
function stop() {
    if (_job) {
        _job.stop();
        _job = null;
    }
}

/**
 * runNow — Manual trigger for admin / CI use.
 * Called by jobs/index.js runJobNow("billingIntegrity").
 *
 * @returns {Promise<object>} The integrity check result
 */
async function runNow() {
    logger.info("[BillingIntegrityJob] Manual trigger via runNow()");
    return runBillingIntegrityCheck();
}

module.exports = { start, stop, runNow };
