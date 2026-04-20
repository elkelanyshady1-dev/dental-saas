/**
 * reconciliation.job.js — Scheduled Financial Reconciliation
 * Billing Domain — Ledger Hardening
 *
 * Periodically runs reconciliation for all active organizations
 * and triggers drift alerts when discrepancies are found.
 *
 * SCHEDULE: Every 10 minutes (configurable via env)
 *
 * INVARIANTS:
 * 1. Non-blocking — failures in one org don't affect others
 * 2. Logged — every run is timestamped and summarized
 * 3. Alert-driven — drift triggers DriftAlert creation
 *
 * PLANE: System process (no HTTP context)
 *
 * @per-org-transactional — Internal scheduled job with explicit organizationId per cycle.
 */

"use strict";

const reconciliationService = require("../integrity/reconciliation.service");
const driftAlertService = require("../integrity/driftAlert.service");
const logger = require("@utils/logger");

// ─── Configuration ──────────────────────────────────────────────────────────

const RECONCILIATION_INTERVAL_MS = parseInt(
    process.env.RECONCILIATION_INTERVAL_MS || String(10 * 60 * 1000), // 10 minutes
    10
);

let jobTimer = null;

// ─── Core Job ───────────────────────────────────────────────────────────────

/**
 * Run reconciliation for all active organizations.
 */
async function runReconciliation() {
    const startTime = Date.now();

    try {
        // Lazy-load Organization model to avoid circular deps
        const Organization = require("mongoose").model("Organization");

        const orgs = await Organization.find(
            { active: { $ne: false } },
            { _id: 1 }
        ).lean();

        logger.info(
            { orgCount: orgs.length },
            "[ReconciliationJob] Starting scheduled reconciliation"
        );

        let balanced = 0;
        let drifted = 0;
        let errors = 0;

        for (const org of orgs) {
            try {
                const report = await reconciliationService.reconcileOrganization(org._id);

                if (report.status === "drift") {
                    await driftAlertService.processReconciliationReport(report);
                    drifted++;
                } else {
                    balanced++;
                }
            } catch (orgErr) {
                errors++;
                logger.error(
                    { organizationId: org._id, err: orgErr.message },
                    "[ReconciliationJob] Failed to reconcile organization"
                );
            }
        }

        const durationMs = Date.now() - startTime;

        logger.info(
            { balanced, drifted, errors, durationMs },
            "[ReconciliationJob] ✅ Scheduled reconciliation complete"
        );
    } catch (err) {
        logger.error(
            { err },
            "[ReconciliationJob] Fatal error in reconciliation job"
        );
    }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

/**
 * Start the reconciliation job on a schedule.
 */
function start() {
    if (jobTimer) return;

    logger.info(
        { intervalMs: RECONCILIATION_INTERVAL_MS },
        "[ReconciliationJob] Starting scheduled reconciliation job"
    );

    // Don't run immediately on boot — wait for first interval
    // ALLOWED_POLLING: SCHEDULER
    jobTimer = setInterval(runReconciliation, RECONCILIATION_INTERVAL_MS);
}

/**
 * Stop the reconciliation job.
 */
function stop() {
    if (jobTimer) {
        clearInterval(jobTimer);
        jobTimer = null;
        logger.info("[ReconciliationJob] Stopped");
    }
}

/**
 * Run reconciliation once (on-demand).
 */
async function runOnce() {
    return runReconciliation();
}

module.exports = {
    start,
    stop,
    runOnce,
};
