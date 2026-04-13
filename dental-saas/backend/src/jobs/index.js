/**
 * jobs/index.js
 * Centralized Job Registry — Dental SaaS Platform
 *
 * ALL cron jobs must be registered here.
 * DO NOT require job files directly in server.js or app.js.
 *
 * Usage:
 *   const { startAllJobs, stopAllJobs } = require('./src/jobs');
 *   startAllJobs();
 *
 * Schedule overview (UTC):
 *   00:05        contractRenewal    — daily charge / invoice / expire
 *   00:10        trialActivation    — trial expiry → activate pending / suspend
 *   01:05        graceEnforcement   — suspend orgs past grace window
 *   :05          dunningProcessor   — hourly dunning retry
 *   :10          fxSync             — hourly FX rate sync
 *   02:30        authTraceCleanup   — daily auth trace retention purge (Phase 20)
 *   every-15min  billingIntegrity   — financial invariant monitoring (read-only)
 *
 * PLANE: infrastructure/jobs
 */

"use strict";

const logger = require("../utils/logger");

// ─── Job Modules ──────────────────────────────────────────────────────────────

const contractRenewalJob = require("./contractRenewal.job");
const trialActivationJob = require("./trialActivation.job");
const graceEnforcementJob = require("./graceEnforcement.job");
const dunningProcessorJob = require("./dunningProcessor.job");
const fxSyncJob = require("./fxSync.job");
const billingIntegrityJob = require("./billingIntegrity.job");
const authTraceCleanupJob = require("./authTraceCleanup.job");

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * JOB_REGISTRY
 *
 * Each entry:
 *   name     — human-readable label for logs
 *   module   — job module (must export start/stop/runNow)
 *   schedule — cron expression (UTC)
 *   enabled  — toggle via env if needed
 */
const JOB_REGISTRY = [
    {
        name: "contractRenewal",
        module: contractRenewalJob,
        schedule: process.env.CRON_CONTRACT_RENEWAL || "5 0 * * *",
        enabled: process.env.JOB_CONTRACT_RENEWAL !== "false"
    },
    {
        name: "trialActivation",
        module: trialActivationJob,
        schedule: process.env.CRON_TRIAL_ACTIVATION || "10 0 * * *",
        enabled: process.env.JOB_TRIAL_ACTIVATION !== "false"
    },
    {
        name: "graceEnforcement",
        module: graceEnforcementJob,
        schedule: process.env.CRON_GRACE_ENFORCEMENT || "5 1 * * *",
        enabled: process.env.JOB_GRACE_ENFORCEMENT !== "false"
    },
    {
        name: "dunningProcessor",
        module: dunningProcessorJob,
        schedule: process.env.CRON_DUNNING_PROCESSOR || "5 * * * *",
        enabled: process.env.JOB_DUNNING_PROCESSOR !== "false"
    },
    {
        name: "fxSync",
        module: fxSyncJob,
        schedule: process.env.CRON_FX_SYNC || "30 0 * * *",
        enabled: process.env.JOB_FX_SYNC !== "false"
    },
    {
        // Billing Invariant Monitor — runs every 15 minutes.
        // Detects payment parity violations, PAYMENT_WITHOUT_INVOICE,
        // negative invoices, orphaned invoices, duplicate invoice numbers.
        // READ-ONLY: never mutates any collection.
        name: "billingIntegrity",
        module: billingIntegrityJob,
        schedule: process.env.CRON_BILLING_INTEGRITY || "*/15 * * * *",
        enabled: process.env.JOB_BILLING_INTEGRITY !== "false"
    },
    {
        // Auth Trace Cleanup — runs daily at 02:30 UTC.
        // Purges auth trace documents older than AUTH_TRACE_RETENTION_DAYS (default 30).
        // Phase 20 TASK-AUTH-INT-007.
        name: "authTraceCleanup",
        module: authTraceCleanupJob,
        schedule: process.env.CRON_AUTH_TRACE_CLEANUP || "30 2 * * *",
        enabled: process.env.JOB_AUTH_TRACE_CLEANUP !== "false"
    },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * startAllJobs
 *
 * Starts all enabled jobs. Call once after DB is connected.
 * @param {object} [options]
 * @param {string[]} [options.only] — if provided, only start jobs with these names
 */
function startAllJobs(options = {}) {
    const { only } = options;

    logger.info({ jobCount: JOB_REGISTRY.length }, "[JobRegistry] Starting all jobs");

    for (const job of JOB_REGISTRY) {
        if (only && !only.includes(job.name)) continue;

        if (!job.enabled) {
            logger.info({ job: job.name }, "[JobRegistry] Job disabled by env — skipping");
            continue;
        }

        try {
            job.module.start(job.schedule);
            logger.info({ job: job.name, schedule: job.schedule }, "[JobRegistry] ✅ Job started");
        } catch (err) {
            // One bad job must not crash the entire registry
            logger.error(
                { job: job.name, err: { message: err.message } },
                "[JobRegistry] ❌ Failed to start job"
            );
        }
    }
}

/**
 * stopAllJobs
 *
 * Graceful shutdown — stops all running jobs.
 * Call from process.on("SIGTERM") / "SIGINT" handlers.
 */
function stopAllJobs() {
    logger.info("[JobRegistry] Stopping all jobs");

    for (const job of JOB_REGISTRY) {
        try {
            if (typeof job.module.stop === "function") {
                job.module.stop();
                logger.info({ job: job.name }, "[JobRegistry] Job stopped");
            }
        } catch (err) {
            logger.error(
                { job: job.name, err: { message: err.message } },
                "[JobRegistry] Error stopping job"
            );
        }
    }
}

/**
 * runJobNow
 *
 * Manual trigger for a specific job by name (admin / test use).
 * @param {string} jobName
 */
async function runJobNow(jobName) {
    const entry = JOB_REGISTRY.find(j => j.name === jobName);
    if (!entry) throw new Error(`Job "${jobName}" not found in registry`);
    if (typeof entry.module.runNow !== "function") {
        throw new Error(`Job "${jobName}" does not expose runNow()`);
    }
    logger.info({ job: jobName }, "[JobRegistry] Manual runNow triggered");
    return entry.module.runNow();
}

module.exports = { startAllJobs, stopAllJobs, runJobNow };
