/**
 * retryWorker.js
 * Core Infrastructure — Event Outbox Self-Healing Worker
 *
 * Periodically runs retryService.runCycle() to detect and retry
 * stuck eventoutbox entries across the platform DB and every tenant
 * DB. Complements (does NOT replace) the live outbox.worker:
 *
 *   outbox.worker       — fast path. Polls cached (active) tenant
 *                         connections every 5s for brand-new events.
 *                         Only sees orgs that currently have a warm
 *                         connection in dbManager's cache.
 *
 *   retryWorker (this)  — self-healing path. Every RETRY_INTERVAL_MS,
 *                         enumerates ALL organizations, warms their
 *                         connection if needed, and re-processes
 *                         events older than RETRY_STALE_THRESHOLD_MS.
 *                         Closes the gap for orgs that have gone idle.
 *
 * CONFIG (env):
 *   RETRY_INTERVAL_MS         default 60000
 *   RETRY_WORKER_ENABLED      default "true"
 *
 * SAFETY:
 *   - Non-blocking: single setInterval, no unbounded Promise chains
 *   - Re-entrancy guard: `isRunning` prevents overlapping cycles
 *   - Errors in a cycle are caught and logged — worker never crashes
 *   - Clean stop(): clears the interval and waits for the in-flight
 *     cycle to finish
 *
 * LIFECYCLE (match outbox.worker API):
 *   retryWorker.start()
 *   retryWorker.stop()
 *
 * PLANE: Core Infrastructure (cross-cutting)
 */

"use strict";

const retryService = require("./retryService");
const logger = require("@utils/logger");
const workerHealth = require("../../infrastructure/workers/workerHealthRegistry");

// ─── Config ──────────────────────────────────────────────────────────────────

const RETRY_INTERVAL_MS = parseInt(process.env.RETRY_INTERVAL_MS || "60000", 10);
const ENABLED = (process.env.RETRY_WORKER_ENABLED || "true").toLowerCase() !== "false";

// ─── State ───────────────────────────────────────────────────────────────────

let timer = null;
let isRunning = false;
let inflight = null;

// ─── Cycle ───────────────────────────────────────────────────────────────────

async function tick() {
    if (isRunning) {
        logger.debug(
            { event: "RETRY_WORKER_TICK_SKIP" },
            "[RetryWorker] Previous cycle still running — skipping"
        );
        return;
    }

    isRunning = true;
    inflight = (async () => {
        try {
            await retryService.runCycle();
        } catch (err) {
            logger.error(
                { event: "RETRY_WORKER_CYCLE_ERROR", err: err.message, stack: err.stack },
                "[RetryWorker] Unhandled cycle error"
            );
        } finally {
            isRunning = false;
            inflight = null;
        }
    })();
    return inflight;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

function start() {
    if (timer) return;

    if (!ENABLED) {
        logger.info(
            { event: "RETRY_WORKER_DISABLED" },
            "[RetryWorker] Disabled via RETRY_WORKER_ENABLED=false"
        );
        return;
    }

    workerHealth.register("retryWorker");

    logger.info(
        {
            event: "RETRY_WORKER_STARTING",
            intervalMs: RETRY_INTERVAL_MS,
            maxRetries: retryService.config.MAX_RETRIES,
            batchSize: retryService.config.RETRY_BATCH_SIZE,
            staleThresholdMs: retryService.config.STALE_THRESHOLD_MS,
            concurrency: retryService.config.RETRY_CONCURRENCY,
        },
        "[RetryWorker] Starting outbox self-healing worker"
    );

    // Kick off first cycle slightly delayed so boot isn't blocked.
    setTimeout(() => tick().catch(() => {}), 10_000);

    // ALLOWED_POLLING: OUTBOX
    timer = setInterval(() => {
        tick().catch(() => {
            /* errors are already logged inside tick() */
        });
    }, RETRY_INTERVAL_MS);

    workerHealth.markReady("retryWorker");
    logger.info("[BOOT] RetryWorker started");
}

async function stop() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    if (inflight) {
        try { await inflight; } catch (_) { /* already logged */ }
    }
    logger.info("[RetryWorker] Stopped");
}

module.exports = {
    start,
    stop,
    tick,          // exposed for tests / manual trigger
    runCycle: retryService.runCycle,
};
