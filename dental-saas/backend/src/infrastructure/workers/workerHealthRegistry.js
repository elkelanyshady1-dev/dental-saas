/**
 * workerHealthRegistry.js — Worker Readiness Tracker
 * Infrastructure — Phase 4: Runtime Readiness
 *
 * Tracks the lifecycle status of all background workers (polling + BullMQ).
 * Used by the boot sequence to guarantee workers are operational before
 * accepting HTTP traffic.
 *
 * ARCHITECTURE:
 * - Workers call register() on creation, markReady() on successful init
 * - Boot sequence calls waitForAll() to block until all registered workers are ready
 * - Each worker has a configurable timeout (default 10s)
 * - If a worker fails or times out, its status moves to "failed"
 *
 * INVARIANTS:
 * 1. No HTTP traffic until all registered workers report ready
 * 2. Failed workers are surfaced in health checks and startup audit
 * 3. Registry is singleton — safe for multi-require
 *
 * PLANE: Infrastructure
 */

"use strict";

const logger = require("@utils/logger");

// ─── Registry State ────────────────────────────────────────────────────────

/** @type {Map<string, { status: "starting"|"ready"|"failed"|"stopped", registeredAt: Date, readyAt?: Date, error?: string }>} */
const _workers = new Map();

/** @type {Map<string, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
const _waiters = new Map();

const DEFAULT_TIMEOUT_MS = 15_000; // 15 seconds max wait per worker

// ─── Registration ──────────────────────────────────────────────────────────

/**
 * Register a worker as starting. Must be called before markReady/markFailed.
 * @param {string} name — unique worker identifier
 */
function register(name) {
    if (_workers.has(name)) {
        logger.warn({ worker: name }, "[WorkerHealthRegistry] Worker already registered — updating status to starting");
    }

    _workers.set(name, {
        status: "starting",
        registeredAt: new Date(),
    });

    logger.debug({ worker: name }, "[WorkerHealthRegistry] Worker registered");
}

/**
 * Mark a worker as ready (operational).
 * Resolves any pending waitForWorker() promise.
 * @param {string} name
 */
function markReady(name) {
    const entry = _workers.get(name);
    if (!entry) {
        logger.warn({ worker: name }, "[WorkerHealthRegistry] markReady called for unregistered worker — registering");
        _workers.set(name, { status: "ready", registeredAt: new Date(), readyAt: new Date() });
    } else {
        entry.status = "ready";
        entry.readyAt = new Date();
    }

    // Resolve any pending waiter
    const waiter = _waiters.get(name);
    if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve();
        _waiters.delete(name);
    }

    logger.info({ worker: name }, "[WorkerHealthRegistry] Worker ready");
}

/**
 * Mark a worker as failed.
 * Rejects any pending waitForWorker() promise.
 * @param {string} name
 * @param {string} [error] — error message
 */
function markFailed(name, error) {
    const entry = _workers.get(name);
    if (entry) {
        entry.status = "failed";
        entry.error = error;
    } else {
        _workers.set(name, { status: "failed", registeredAt: new Date(), error });
    }

    // Reject any pending waiter
    const waiter = _waiters.get(name);
    if (waiter) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(`Worker "${name}" failed: ${error}`));
        _waiters.delete(name);
    }

    logger.error({ worker: name, error }, "[WorkerHealthRegistry] Worker failed");
}

/**
 * Mark a worker as stopped (graceful shutdown).
 * @param {string} name
 */
function markStopped(name) {
    const entry = _workers.get(name);
    if (entry) {
        entry.status = "stopped";
    }
}

// ─── Waiting ───────────────────────────────────────────────────────────────

/**
 * Wait for a specific worker to become ready.
 * Resolves immediately if already ready. Rejects on timeout or failure.
 *
 * @param {string} name
 * @param {number} [timeoutMs=DEFAULT_TIMEOUT_MS]
 * @returns {Promise<void>}
 */
function waitForWorker(name, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const entry = _workers.get(name);

    // Already ready
    if (entry?.status === "ready") return Promise.resolve();

    // Already failed
    if (entry?.status === "failed") {
        return Promise.reject(new Error(`Worker "${name}" already in failed state: ${entry.error}`));
    }

    // Wait for readiness
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            _waiters.delete(name);
            const current = _workers.get(name);
            if (current) current.status = "failed";
            reject(new Error(`Worker "${name}" readiness timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        _waiters.set(name, { resolve, reject, timer });
    });
}

/**
 * Wait for all registered workers to become ready.
 * @param {number} [timeoutMs=DEFAULT_TIMEOUT_MS]
 * @returns {Promise<void>}
 */
async function waitForAll(timeoutMs = DEFAULT_TIMEOUT_MS) {
    const names = Array.from(_workers.keys());
    if (names.length === 0) return;

    await Promise.all(names.map((name) => waitForWorker(name, timeoutMs)));
}

// ─── Queries ───────────────────────────────────────────────────────────────

/**
 * Get the current status of all registered workers.
 * @returns {Object<string, { status: string, registeredAt: Date, readyAt?: Date, error?: string }>}
 */
function getStatus() {
    const result = {};
    for (const [name, entry] of _workers) {
        result[name] = { ...entry };
    }
    return result;
}

/**
 * Check if all registered workers are ready.
 * @returns {boolean}
 */
function allReady() {
    if (_workers.size === 0) return true;
    for (const entry of _workers.values()) {
        if (entry.status !== "ready") return false;
    }
    return true;
}

/**
 * Get names of workers that are NOT ready.
 * @returns {string[]}
 */
function getNotReady() {
    const result = [];
    for (const [name, entry] of _workers) {
        if (entry.status !== "ready") result.push(name);
    }
    return result;
}

/**
 * Get list of ready worker names.
 * @returns {string[]}
 */
function getReadyWorkers() {
    const result = [];
    for (const [name, entry] of _workers) {
        if (entry.status === "ready") result.push(name);
    }
    return result;
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
    register,
    markReady,
    markFailed,
    markStopped,
    waitForWorker,
    waitForAll,
    getStatus,
    allReady,
    getNotReady,
    getReadyWorkers,
};
