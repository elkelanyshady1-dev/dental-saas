/**
 * assetMetrics.service.js — in-process counters for the U-CAP
 * Observability Dashboard (Part 3).
 *
 * Scope
 *   - Process-wide (not per-org). The admin dashboard is a single-tenant
 *     view of THIS node's activity; multi-node aggregation lives in
 *     whatever real metrics sink the platform grows into.
 *   - Zero dependency — pure `Map` + rolling window. No Prometheus, no
 *     StatsD, no external service. Replace with a real exporter later
 *     without changing callers.
 *
 * Counters tracked
 *   asset_job_started
 *   asset_job_progress            (high-cadence — sampled in admin view)
 *   asset_job_success
 *   asset_job_failed
 *   asset_job_retry
 *   export_started
 *   export_success
 *   export_failed
 *
 * Durations
 *   avg_processing_time           (rolling mean over last 100 samples)
 *
 * Activity feed
 *   Last N events (default 50) with { type, caseId, photoId, at }.
 *   Powers the live "recent activity" panel.
 */

"use strict";

const DURATION_WINDOW = Number(process.env.METRICS_DURATION_WINDOW) || 100;
const ACTIVITY_WINDOW = Number(process.env.METRICS_ACTIVITY_WINDOW) || 50;

const _counters  = new Map();
const _durations = new Map(); // metricKey → rolling sample array (last N)
const _activity  = [];         // ring buffer, newest at [0]
let   _bootAt    = new Date();

/** Strictly positive integer accumulation. */
function increment(key, by = 1) {
    _counters.set(key, (_counters.get(key) ?? 0) + by);
}

/** Track a duration sample in ms for rolling averages. */
function observeDuration(key, ms) {
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return;
    let arr = _durations.get(key);
    if (!arr) { arr = []; _durations.set(key, arr); }
    arr.unshift(ms);
    if (arr.length > DURATION_WINDOW) arr.length = DURATION_WINDOW;
}

/** Push a human-readable activity entry (consumed by the dashboard feed). */
function recordActivity(entry) {
    const row = {
        at: new Date().toISOString(),
        ...entry,
    };
    _activity.unshift(row);
    if (_activity.length > ACTIVITY_WINDOW) _activity.length = ACTIVITY_WINDOW;
}

/** Computed-average helper with an "—" fallback for never-observed keys. */
function _avg(key) {
    const arr = _durations.get(key);
    if (!arr || arr.length === 0) return null;
    const sum = arr.reduce((a, b) => a + b, 0);
    return Math.round(sum / arr.length);
}

/**
 * Snapshot the current state for the /admin/metrics/assets endpoint.
 * Returned object is serializable JSON.
 */
function snapshot() {
    const counters = Object.fromEntries(_counters.entries());
    const totalSuccess = counters.asset_job_success ?? 0;
    const totalFailed  = counters.asset_job_failed  ?? 0;
    const totalStarted = counters.asset_job_started ?? 0;
    const activeJobs   = Math.max(0, totalStarted - totalSuccess - totalFailed);

    return {
        bootAt:   _bootAt.toISOString(),
        counters,
        computed: {
            active_jobs:          activeJobs,
            avg_processing_time:  _avg("avg_processing_time"),
        },
        activity: _activity.slice(0, ACTIVITY_WINDOW),
    };
}

/** Test-only reset. */
function _reset() {
    _counters.clear();
    _durations.clear();
    _activity.length = 0;
    _bootAt = new Date();
}

module.exports = {
    increment,
    observeDuration,
    recordActivity,
    snapshot,
    _reset,
};
