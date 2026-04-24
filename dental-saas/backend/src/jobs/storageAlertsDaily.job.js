/**
 * storageAlertsDaily.job.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Daily storage-quota alert sweep.
 *
 * Schedule: 02:00 UTC daily (after authTraceCleanup at 02:30).
 *
 * Behavior:
 *   1. Load all active organizations from platform DB.
 *   2. For each org, read storageUsedMB from OrgUsage (platform snapshot).
 *   3. Resolve maxStorageMB via buildEffectivePlan (includes add-ons).
 *   4. Compute percentUsed.
 *   5. Call maybeDispatchStorageAlert — anti-spam is enforced inside.
 *
 * Platform-plane rules:
 *   - Reads ONLY from platform DB (OrgUsage, Organization, OrgAddOn via
 *     buildEffectivePlan). No per-org DB connections.
 *   - Non-fatal per org — one bad org never halts the sweep.
 *
 * Env gates:
 *   JOB_STORAGE_ALERTS_DAILY=false   disable this job
 *   CRON_STORAGE_ALERTS_DAILY        override cron schedule
 *
 * PLANE: jobs / storage
 */

"use strict";

const cron = require("node-cron");
const { getPlatformConnection }     = require("@core/db/dbResolver");
const getModel                      = require("@core/db/getModel");
const OrgUsageDef                   = require("@core/usage/OrgUsage.model");
const { buildEffectivePlan }        = require("@core/subscription/effectivePlanBuilder");
const { maybeDispatchStorageAlert } = require("@modules/storage/services/storageAlertDispatcher.service");
const logger                        = require("@utils/logger");

// ─── _sweepAllOrgs ────────────────────────────────────────────────────────────

async function _sweepAllOrgs() {
    const conn     = getPlatformConnection();
    const OrgUsage = getModel(conn, OrgUsageDef);

    // Fetch all OrgUsage docs — platform snapshot, no per-org DB hop
    const usageDocs = await OrgUsage.find({}).select("organizationId storageUsedMB").lean();

    const stats = { total: 0, dispatched: 0, skipped: 0, errors: 0 };

    for (const doc of usageDocs) {
        stats.total++;
        const orgId = doc.organizationId;

        try {
            let maxStorageMB = null;
            try {
                const effectivePlan = await buildEffectivePlan(orgId);
                maxStorageMB =
                    effectivePlan?.quotas?.storageMB ||
                    effectivePlan?.limits?.maxStorageMB ||
                    null;
            } catch {
                // Fail-open: treat as unlimited if plan resolution fails
            }

            const isUnlimited = !maxStorageMB || maxStorageMB <= 0 || maxStorageMB === -1;
            const usedMB      = doc.storageUsedMB || 0;
            const percentUsed = isUnlimited
                ? 0
                : Math.min(Math.round((usedMB / maxStorageMB) * 10000) / 100, 100);

            await maybeDispatchStorageAlert({ organizationId: orgId, percentUsed, isUnlimited });
            stats.dispatched++;

        } catch (err) {
            stats.errors++;
            logger.warn(
                { err: err.message, organizationId: String(orgId) },
                "[StorageAlertsDaily] Per-org sweep error (skipped)"
            );
        }
    }

    logger.info({ stats }, "[StorageAlertsDaily] Sweep complete");
    return stats;
}

// ─── Cron wrapper ─────────────────────────────────────────────────────────────

let _job = null;

/**
 * @param {string} [schedule="0 2 * * *"] — 02:00 UTC daily
 */
function start(schedule = "0 2 * * *") {
    if (_job) { _job.stop(); }
    _job = cron.schedule(schedule, async () => {
        logger.info({ job: "storageAlertsDaily", at: new Date().toISOString() },
            "[StorageAlertsDaily] Starting daily sweep");
        try {
            await _sweepAllOrgs();
        } catch (err) {
            logger.error({ err }, "[StorageAlertsDaily] Unhandled error");
        }
    }, { scheduled: true, timezone: process.env.CRON_TIMEZONE || "UTC" });
    logger.info({ schedule }, "[StorageAlertsDaily] Registered");
}

function stop() { if (_job) { _job.stop(); _job = null; } }
async function runNow() { logger.info("[StorageAlertsDaily] Manual trigger"); return _sweepAllOrgs(); }

module.exports = { start, stop, runNow };
