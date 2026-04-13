/**
 * Semaphore.js
 * Core Infrastructure — Async Concurrency Limiter
 *
 * A lightweight counting semaphore for limiting concurrent async operations.
 * Used by dbManager to throttle parallel connection creations and prevent
 * CPU spikes + MongoDB overload during burst scenarios.
 *
 * DESIGN CHOICES:
 *   - No external dependencies (pure JS)
 *   - Promise-queue based (no busy-wait)
 *   - Fail-safe: timeout support to prevent infinite queue growth
 *   - Memory-bounded: queue size is observable for metrics
 *
 * Usage:
 *   const sem = new Semaphore(10);
 *   const release = await sem.acquire();
 *   try {
 *       await expensiveOperation();
 *   } finally {
 *       release();
 *   }
 *
 * PLANE: Core Infrastructure
 */

"use strict";

class Semaphore {
    /**
     * @param {number} maxConcurrency — Maximum concurrent permits
     */
    constructor(maxConcurrency) {
        if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
            throw new Error(`[Semaphore] maxConcurrency must be a positive integer, got: ${maxConcurrency}`);
        }
        this._max = maxConcurrency;
        this._current = 0;
        this._queue = [];
    }

    /**
     * acquire
     * Acquires a permit. If all permits are in use, the caller is queued
     * and the returned promise resolves when a permit becomes available.
     *
     * @param {number} [timeoutMs=30000] — Maximum wait time before rejection
     * @returns {Promise<Function>} — Release function (MUST be called when done)
     * @throws {Error} — If the timeout expires while waiting
     */
    acquire(timeoutMs = 30000) {
        if (this._current < this._max) {
            this._current++;
            return Promise.resolve(this._createRelease());
        }

        return new Promise((resolve, reject) => {
            const entry = { resolve, reject, timer: null };

            // Timeout: prevent unbounded queue growth
            if (timeoutMs > 0) {
                entry.timer = setTimeout(() => {
                    // Remove from queue
                    const idx = this._queue.indexOf(entry);
                    if (idx !== -1) this._queue.splice(idx, 1);
                    reject(new Error(
                        `[Semaphore] Acquire timed out after ${timeoutMs}ms ` +
                        `(queue: ${this._queue.length}, active: ${this._current}/${this._max})`
                    ));
                }, timeoutMs);
            }

            this._queue.push(entry);
        });
    }

    /**
     * _createRelease
     * Creates a one-shot release function that decrements the counter
     * and wakes the next queued waiter.
     *
     * @returns {Function}
     */
    _createRelease() {
        let released = false;
        return () => {
            if (released) return; // Idempotent
            released = true;
            this._current--;

            if (this._queue.length > 0) {
                const next = this._queue.shift();
                if (next.timer) clearTimeout(next.timer);
                this._current++;
                next.resolve(this._createRelease());
            }
        };
    }

    /** Current number of active permits */
    get active() {
        return this._current;
    }

    /** Current number of waiters in the queue */
    get waiting() {
        return this._queue.length;
    }

    /** Maximum concurrency */
    get max() {
        return this._max;
    }
}

module.exports = Semaphore;
