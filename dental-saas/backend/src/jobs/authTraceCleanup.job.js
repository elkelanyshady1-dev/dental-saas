/**
 * authTraceCleanup.job.js
 * Phase 20 — Auth Trace Retention Policy (TASK-AUTH-INT-007)
 *
 * PURPOSE:
 * Periodically purges auth trace documents that have exceeded the
 * configured retention period. This prevents unbounded MongoDB growth
 * from high-volume trace collection.
 *
 * RETENTION POLICY:
 *   Default: 30 days (configurable via AUTH_TRACE_RETENTION_DAYS env var)
 *   Denial traces are subject to the same retention — they are always
 *   persisted during their lifetime but pruned identically.
 *
 * SCHEDULE:
 *   Default: Daily at 02:30 UTC (configurable via CRON_AUTH_TRACE_CLEANUP)
 *   Disable via JOB_AUTH_TRACE_CLEANUP=false
 *
 * LOGGING:
 *   AUTH_TRACE_CLEANUP_OK     → INFO  — purge succeeded (with deleted count)
 *   AUTH_TRACE_CLEANUP_FAILED → ERROR — purge failed
 *
 * PLANE: Infrastructure/Jobs
 * READ-WRITE: Deletes expired auth trace documents only.
 */

"use strict";

const cron = require("node-cron");
const logger = require("../utils/logger");
const { deleteTracesOlderThan } = require("../services/authTracePersistence.service");

let _job = null;

/**
 * Get the retention period cutoff date.
 * @returns {Date}
 */
function _getCutoffDate() {
    const retentionDays = parseInt(process.env.AUTH_TRACE_RETENTION_DAYS, 10) || 30;
    return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
}

/**
 * Core job logic — extracted so runNow() can call it directly.
 * @returns {Promise<{ deletedCount: number, cutoffDate: Date }>}
 */
async function runAuthTraceCleanup() {
    const cutoffDate = _getCutoffDate();
    const correlationId = `auth-trace-cleanup-${Date.now()}`;

    logger.info(
        {
            job: "authTraceCleanup",
            correlationId,
            cutoffDate: cutoffDate.toISOString(),
            retentionDays: parseInt(process.env.AUTH_TRACE_RETENTION_DAYS, 10) || 30,
        },
        "[AuthTraceCleanupJob] Starting auth trace cleanup"
    );

    try {
        const deletedCount = await deleteTracesOlderThan(cutoffDate);

        if (deletedCount > 0) {
            logger.info(
                {
                    event: "AUTH_TRACE_CLEANUP_OK",
                    correlationId,
                    deletedCount,
                    cutoffDate: cutoffDate.toISOString(),
                },
                `[AuthTraceCleanupJob] ✓ Purged ${deletedCount} expired auth trace(s)`
            );
        } else {
            logger.info(
                {
                    event: "AUTH_TRACE_CLEANUP_OK",
                    correlationId,
                    deletedCount: 0,
                    cutoffDate: cutoffDate.toISOString(),
                },
                "[AuthTraceCleanupJob] ✓ No expired auth traces to purge"
            );
        }

        return { deletedCount, cutoffDate };
    } catch (err) {
        logger.error(
            {
                event: "AUTH_TRACE_CLEANUP_FAILED",
                correlationId,
                error: err.message,
            },
            "[AuthTraceCleanupJob] ❌ Auth trace cleanup failed"
        );
        throw err;
    }
}

/**
 * start — Register this job with the cron scheduler.
 * Called by jobs/index.js as part of startAllJobs().
 *
 * @param {string} schedule - cron expression (default: daily at 02:30 UTC)
 */
function start(schedule = "30 2 * * *") {
    if (_job) { _job.stop(); }

    _job = cron.schedule(schedule, async () => {
        try {
            await runAuthTraceCleanup();
        } catch (_) {
            // Error already logged — suppress so the scheduler keeps running
        }
    }, { scheduled: true, timezone: process.env.CRON_TIMEZONE || "UTC" });

    logger.info({ schedule }, "[AuthTraceCleanupJob] Registered");
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
 * Called by jobs/index.js runJobNow("authTraceCleanup").
 *
 * @returns {Promise<{ deletedCount: number, cutoffDate: Date }>}
 */
async function runNow() {
    logger.info("[AuthTraceCleanupJob] Manual trigger via runNow()");
    return runAuthTraceCleanup();
}

module.exports = { start, stop, runNow };
