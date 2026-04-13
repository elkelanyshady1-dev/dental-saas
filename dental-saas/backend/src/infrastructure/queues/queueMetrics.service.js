/**
 * queueMetrics.service.js — Global Queue Observability Service
 * Phase B.2 — Runtime Maturity & Architecture Optimization
 *
 * PURPOSE:
 * Provides unified queue health metrics across all BullMQ queues in the system.
 * Exposes a single endpoint for dashboards, SLO tracking, and alerting.
 *
 * Registered queues:
 *   - authTraceQueue     — auth trace async persistence
 *   - emailQueue         — transactional email delivery
 *   - communicationQueue — SMS/WhatsApp/push delivery
 *   - notificationQueue  — in-app notification delivery
 *
 * Each queue reports: waiting, active, completed, failed, delayed, isPaused.
 *
 * PLANE: Infrastructure / shared.
 */

"use strict";

const logger = require("@utils/logger");

// ─── Queue Registry ─────────────────────────────────────────────────────────

/**
 * @type {{ name: string, getHealth: () => Promise<Object> }[]}
 * Registered queue health providers. Each provides a getHealth() function
 * that returns standardized queue metrics.
 */
const _registeredQueues = [];

/**
 * registerQueue(name, healthFn)
 *
 * Register a queue's health function with the global metrics system.
 * Should be called at boot time from each queue module.
 *
 * @param {string} name — human-readable queue name
 * @param {() => Promise<Object>} healthFn — async function returning queue metrics
 */
function registerQueue(name, healthFn) {
    if (typeof healthFn !== "function") {
        logger.warn({ name }, `[queueMetrics] Attempted to register queue "${name}" with invalid health function`);
        return;
    }

    // Prevent duplicate registration
    if (_registeredQueues.some(q => q.name === name)) {
        logger.warn({ name }, `[queueMetrics] Queue "${name}" already registered — skipping`);
        return;
    }

    _registeredQueues.push({ name, getHealth: healthFn });
    logger.info({ name, total: _registeredQueues.length }, `[queueMetrics] Queue "${name}" registered`);
}

// ─── Metrics Collection ─────────────────────────────────────────────────────

/**
 * getAllQueueMetrics()
 *
 * Collects health metrics from all registered queues in parallel.
 * Failures for individual queues are captured and reported but
 * do NOT block collection from other queues.
 *
 * @returns {Promise<{ queues: Object[], summary: Object, collectedAt: string }>}
 */
async function getAllQueueMetrics() {
    const results = await Promise.allSettled(
        _registeredQueues.map(async (q) => {
            try {
                const health = await q.getHealth();
                return { name: q.name, ...health };
            } catch (err) {
                return {
                    name: q.name,
                    status: "error",
                    error: err.message,
                };
            }
        })
    );

    const queues = results.map(r =>
        r.status === "fulfilled" ? r.value : { name: "unknown", status: "error", error: r.reason?.message }
    );

    // Aggregate summary
    let totalWaiting = 0;
    let totalActive = 0;
    let totalCompleted = 0;
    let totalFailed = 0;
    let totalDelayed = 0;
    let healthyCount = 0;
    let errorCount = 0;

    for (const q of queues) {
        if (q.status === "healthy" && q.counts) {
            totalWaiting += q.counts.waiting || 0;
            totalActive += q.counts.active || 0;
            totalCompleted += q.counts.completed || 0;
            totalFailed += q.counts.failed || 0;
            totalDelayed += q.counts.delayed || 0;
            healthyCount++;
        } else {
            errorCount++;
        }
    }

    return {
        queues,
        summary: {
            totalQueues: queues.length,
            healthy: healthyCount,
            errored: errorCount,
            totalWaiting,
            totalActive,
            totalCompleted,
            totalFailed,
            totalDelayed,
        },
        collectedAt: new Date().toISOString(),
    };
}

/**
 * getRegisteredQueueNames — Returns the names of all registered queues.
 * @returns {string[]}
 */
function getRegisteredQueueNames() {
    return _registeredQueues.map(q => q.name);
}

module.exports = {
    registerQueue,
    getAllQueueMetrics,
    getRegisteredQueueNames,
};
