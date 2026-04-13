/**
 * guardMetrics.js — Lightweight Guard Execution Metrics
 * 
 * Tracks guard executions for observability without heavy dependencies.
 * Can be wired into Prometheus or simple console logging.
 *
 * USAGE:
 *   const { trackGuard } = require("@core/guards/guardMetrics");
 *   trackGuard("ownershipCheck", req.user?._id, { patientId });
 */

"use strict";

const logger = require("../../utils/logger");

// In-memory counters (lightweight — no external deps)
const _counters = new Map();

/**
 * Track a guard execution.
 * @param {string} guardName - The guard being executed
 * @param {string} [userId] - The user triggering the guard
 * @param {Object} [meta] - Additional metadata
 */
function trackGuard(guardName, userId = null, meta = {}) {
    const count = (_counters.get(guardName) || 0) + 1;
    _counters.set(guardName, count);

    if (count % 1000 === 0) {
        logger.info({
            event: "GUARD_METRICS_CHECKPOINT",
            guard: guardName,
            totalExecutions: count,
        }, `[Guards] ${guardName} executed ${count} times`);
    }
}

/**
 * Get current guard metrics snapshot.
 * @returns {Object} Map of guard names to execution counts
 */
function getGuardMetrics() {
    const snapshot = {};
    for (const [key, value] of _counters) {
        snapshot[key] = value;
    }
    return snapshot;
}

/**
 * Reset all counters (for testing).
 */
function resetGuardMetrics() {
    _counters.clear();
}

module.exports = {
    trackGuard,
    getGuardMetrics,
    resetGuardMetrics,
};
