/**
 * securityMetrics.service.js — Security System Metrics
 * v2.0 — Phase 6 cleanup (Redis counter path removed)
 *
 * Tracks operational metrics for the security subsystem:
 *   - policyEvaluationTimeMs — avg/p50/p95/p99 of policy evaluations
 *   - cacheHitRate — cache hit/miss ratio
 *   - deniedRatio — denied vs total access count
 *   - alertRate — alerts created per hour
 *
 * Storage: per-process in-memory circular buffers.
 * Multi-instance note: each instance keeps its own buffer (there's no
 * shared counter anymore). For aggregate telemetry, scrape each instance
 * individually or front with a metrics collector.
 *
 * Exposed via GET /security/metrics (controller delegates here).
 *
 * PLANE: Org only.
 */

"use strict";

const logger = require("@utils/logger");

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_SAMPLES = 1000; // Circular buffer size for latency samples

// ─── In-Memory Stores ───────────────────────────────────────────────────────

/**
 * Per-org metrics stored in memory for fast access.
 * Structure: orgId → { evaluationTimes, cacheHits, cacheMisses, allowed, denied, alertsCreated }
 */
const _orgMetrics = new Map();

function _getOrgMetrics(organizationId) {
    if (!_orgMetrics.has(organizationId)) {
        _orgMetrics.set(organizationId, {
            evaluationTimes: [],   // Circular buffer of policy eval durations (ms)
            cacheHits: 0,
            cacheMisses: 0,
            allowed: 0,
            denied: 0,
            alertsCreated: 0,
            lastReset: Date.now(),
        });
    }
    return _orgMetrics.get(organizationId);
}

// ─── Recording Functions ────────────────────────────────────────────────────

/**
 * Record a policy evaluation duration.
 * @param {string} organizationId
 * @param {number} durationMs — evaluation time in milliseconds
 */
function recordPolicyEvaluation(organizationId, durationMs) {
    if (!organizationId) return;

    const m = _getOrgMetrics(organizationId);
    m.evaluationTimes.push(durationMs);
    if (m.evaluationTimes.length > MAX_SAMPLES) {
        m.evaluationTimes.shift();
    }
}

/**
 * Record a cache hit or miss.
 * @param {string} organizationId
 * @param {boolean} isHit
 */
function recordCacheAccess(organizationId, isHit) {
    if (!organizationId) return;

    const m = _getOrgMetrics(organizationId);
    if (isHit) {
        m.cacheHits++;
    } else {
        m.cacheMisses++;
    }
}

/**
 * Record an access decision (allowed/denied).
 * @param {string} organizationId
 * @param {boolean} isAllowed
 */
function recordAccessDecision(organizationId, isAllowed) {
    if (!organizationId) return;

    const m = _getOrgMetrics(organizationId);
    if (isAllowed) {
        m.allowed++;
    } else {
        m.denied++;
    }
}

/**
 * Record an alert creation event.
 * @param {string} organizationId
 */
function recordAlertCreated(organizationId) {
    if (!organizationId) return;

    const m = _getOrgMetrics(organizationId);
    m.alertsCreated++;
}

// ─── Query Functions ────────────────────────────────────────────────────────

/**
 * Get computed metrics for an organization.
 * @param {string} organizationId
 * @returns {Object} Computed metrics snapshot
 */
function getMetrics(organizationId) {
    const m = _getOrgMetrics(organizationId);
    const uptime = Date.now() - m.lastReset;

    // ── Latency percentiles ──
    const sortedTimes = [...m.evaluationTimes].sort((a, b) => a - b);
    const len = sortedTimes.length;

    const latencyStats =
        len > 0
            ? {
                  avg: _round(
                      sortedTimes.reduce((a, b) => a + b, 0) / len
                  ),
                  p50: _round(_percentile(sortedTimes, 50)),
                  p95: _round(_percentile(sortedTimes, 95)),
                  p99: _round(_percentile(sortedTimes, 99)),
                  min: _round(sortedTimes[0]),
                  max: _round(sortedTimes[len - 1]),
                  sampleCount: len,
              }
            : {
                  avg: 0,
                  p50: 0,
                  p95: 0,
                  p99: 0,
                  min: 0,
                  max: 0,
                  sampleCount: 0,
              };

    // ── Cache hit rate ──
    const totalCache = m.cacheHits + m.cacheMisses;
    const cacheHitRate =
        totalCache > 0
            ? _round((m.cacheHits / totalCache) * 100)
            : 0;

    // ── Denial ratio ──
    const totalAccess = m.allowed + m.denied;
    const deniedRatio =
        totalAccess > 0
            ? _round((m.denied / totalAccess) * 100)
            : 0;

    return {
        policyEvaluation: latencyStats,
        cache: {
            hitRate: cacheHitRate,
            hits: m.cacheHits,
            misses: m.cacheMisses,
            total: totalCache,
        },
        access: {
            allowed: m.allowed,
            denied: m.denied,
            total: totalAccess,
            deniedRatio,
        },
        alerts: {
            created: m.alertsCreated,
        },
        meta: {
            uptimeMs: uptime,
            uptimeHuman: _formatUptime(uptime),
            lastReset: new Date(m.lastReset).toISOString(),
            sampleWindow: MAX_SAMPLES,
        },
    };
}

/**
 * Reset metrics for an organization (admin action).
 * @param {string} organizationId
 */
function resetMetrics(organizationId) {
    _orgMetrics.delete(organizationId);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function _percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}

function _round(n) {
    return Math.round(n * 100) / 100;
}

function _formatUptime(ms) {
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    return `${hours}h ${minutes}m`;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    recordPolicyEvaluation,
    recordCacheAccess,
    recordAccessDecision,
    recordAlertCreated,
    getMetrics,
    resetMetrics,
};
