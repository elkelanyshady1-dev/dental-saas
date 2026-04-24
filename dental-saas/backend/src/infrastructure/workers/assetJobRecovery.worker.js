"use strict";

/**
 * assetJobRecovery.worker.js — boot-time recovery for U-CAP self-worker jobs.
 *
 * Per enterprise hardening §1.1: on every server boot we scan every org's
 * Photo collection for rows with processingStatus in {pending, failed}
 * and retryCount < MAX_ATTEMPTS, then re-enqueue them. This is the ONLY
 * mechanism that rescues jobs from a mid-process crash — the in-memory
 * p-limit queue holds no state across restarts.
 *
 * Contract
 *   - Safe to require() from any boot point after DB is connected.
 *   - Never throws: a failing org logs + is skipped.
 *   - Runs once per process. Subsequent calls are no-ops.
 *   - Gated by ENABLE_WORKERS so tests / CLI scripts don't trigger it.
 */

const logger = require("@utils/logger");

let _started = false;

/**
 * Start the recovery sweep. Exposed separately from the side-effect
 * import path so server.js can call it AFTER mongoose.connect() resolves.
 */
async function startAssetJobRecovery() {
    if (_started) return;
    _started = true;

    if (process.env.ENABLE_WORKERS === "false") {
        logger.info({ event: "ASSET_JOB_RECOVERY_SKIP", reason: "ENABLE_WORKERS=false" });
        return;
    }

    try {
        const queue = require("@modules/orthodontics/services/assetJob.queue");
        // Importing the service wires init() on the queue (one-shot).
        require("@modules/orthodontics/services/assetJob.service");

        // Defer to next tick so the HTTP listener comes up first — the
        // recovery scan is purely server-internal and not on the critical
        // path for accepting traffic.
        setImmediate(async () => {
            try {
                const result = await queue.recoverAllOrgs();
                logger.info({
                    event: "ASSET_JOB_RECOVERY_BOOT",
                    ...result,
                }, "[assetJobRecovery] boot sweep complete");
            } catch (err) {
                logger.warn({
                    event: "ASSET_JOB_RECOVERY_BOOT_FAILED",
                    err:   err.message,
                });
            }
        });
    } catch (err) {
        logger.warn({
            event: "ASSET_JOB_RECOVERY_INIT_FAILED",
            err:   err.message,
        });
    }
}

module.exports = { startAssetJobRecovery };
