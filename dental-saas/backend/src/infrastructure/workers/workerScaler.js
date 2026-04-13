/**
 * workerScaler.js
 * Platform Infrastructure — BullMQ Dynamic Worker Concurrency Scaler
 * v1.0
 *
 * Polls queue depth every 10 seconds and adjusts worker concurrency
 * to match load. Uses BullMQ Worker.concurrency setter (available in BullMQ >= 3.x).
 *
 * Scaling tiers:
 *   waiting < 10  → concurrency 1   (idle)
 *   waiting < 50  → concurrency 2   (light load)
 *   waiting < 200 → concurrency 4   (moderate load)
 *   waiting >= 200→ concurrency 8   (burst)
 *
 * PLANE: Platform / Infrastructure
 */

"use strict";

const logger = require("../../utils/logger");

// ─── Scaling tiers ─────────────────────────────────────────────────────────────
const TIERS = [
    { threshold: 200, concurrency: 8 },
    { threshold: 50, concurrency: 4 },
    { threshold: 10, concurrency: 2 },
    { threshold: 0, concurrency: 1 },
];

function getConcurrency(waiting) {
    for (const tier of TIERS) {
        if (waiting >= tier.threshold) return tier.concurrency;
    }
    return 1;
}

/**
 * startWorkerScaler
 *
 * @param {Object} params
 * @param {import("bullmq").Queue}  params.queue  - The queue to monitor
 * @param {import("bullmq").Worker} params.worker - The worker to scale
 * @param {string} params.label  - Label for logs (e.g. "email", "sms")
 * @param {number} [params.intervalMs=10000] - Poll interval in ms
 * @returns {{ stop: () => void }}
 */
function startWorkerScaler({ queue, worker, label, intervalMs = 10_000 }) {
    let currentConcurrency = worker.opts?.concurrency ?? 1;
    let stopped = false;

    async function scale() {
        if (stopped) return;
        try {
            const counts = await queue.getJobCounts("waiting", "active");
            const waiting = counts.waiting ?? 0;
            const target = getConcurrency(waiting);

            if (target !== currentConcurrency) {
                // BullMQ >= 3.x exposes worker.concurrency as a settable property
                // In older versions this falls back gracefully (no throw)
                try {
                    worker.concurrency = target;
                } catch {
                    // BullMQ version doesn't support dynamic concurrency
                    // Log once then disable scaling for this worker
                    logger.warn(
                        { label },
                        "[WorkerScaler] BullMQ version does not support dynamic concurrency — scaler disabled"
                    );
                    stop();
                    return;
                }
                logger.info(
                    { label, waiting, from: currentConcurrency, to: target },
                    "[WorkerScaler] Scaled worker concurrency"
                );
                currentConcurrency = target;
            }
        } catch (err) {
            logger.warn({ label, err: err.message }, "[WorkerScaler] Poll error (non-critical)");
        }
    }

    // Run immediately, then on interval
    scale();
    const timer = setInterval(scale, intervalMs);

    function stop() {
        stopped = true;
        clearInterval(timer);
        logger.info({ label }, "[WorkerScaler] Stopped");
    }

    return { stop };
}

module.exports = { startWorkerScaler, getConcurrency };
