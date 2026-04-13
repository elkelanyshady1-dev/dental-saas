/**
 * observability.guardian.js
 * Platform Guardian Layer — Observability Module
 *
 * Provides:
 *   - safeSerialize(err)    : Circular-safe error serializer
 *   - guardianLogger        : Scoped logger with guardian prefix
 *   - healthSnapshot()      : In-process health snapshot
 *   - getPlatformMetrics()  : Runtime metric counters
 *
 * Design:
 *   All guardian modules import from this file for their logging needs.
 *   Metrics are in-memory counters — no external dependency required.
 *   Snapshot integrates with the existing Pino logger (no new transport).
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const { getPlatformConnection } = require("@core/db/dbResolver");
const logger = require("@utils/logger");

// ─── In-Memory Metrics ────────────────────────────────────────────────────────

const _metrics = {
    startupGuardianRuns: 0,
    runtimeGuardianRuns: 0,
    invariantViolations: 0,
    commercialBlockedEvents: 0,
    provisioningChecks: 0,
    healthSnapshotRequests: 0,
    lastRuntimeCheckAt: null,
    lastStartupCheckAt: null
};

// ─── Safe Serializer ──────────────────────────────────────────────────────────

/**
 * safeSerialize
 * Converts an Error (or any value) to a plain JSON-safe object.
 * Handles circular references (e.g. MongoDB session objects).
 *
 * @param {any} err
 * @returns {object}
 */
function safeSerialize(err) {
    if (!err) return { message: "unknown error" };
    if (typeof err !== "object") return { message: String(err) };

    try {
        return {
            name: err.name || "Error",
            message: err.message || "unknown",
            code: err.code || undefined,
            stack: err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : undefined
        };
    } catch {
        return { message: "[non-serializable error]" };
    }
}

// ─── Guardian-Scoped Logger ───────────────────────────────────────────────────

const guardianLogger = {
    info: (meta, msg) => logger.info({ guardian: true, ...meta }, `[Guardian] ${msg}`),
    warn: (meta, msg) => logger.warn({ guardian: true, ...meta }, `[Guardian] ${msg}`),
    error: (meta, msg) => logger.error({ guardian: true, ...meta }, `[Guardian] ${msg}`),
    debug: (meta, msg) => logger.debug({ guardian: true, ...meta }, `[Guardian] ${msg}`),
    critical: (meta, msg) => logger.error({ guardian: true, severity: "CRITICAL", ...meta }, `[Guardian][CRITICAL] ${msg}`)
};

// ─── Health Snapshot ──────────────────────────────────────────────────────────

/**
 * healthSnapshot
 * Returns a JSON-safe snapshot of current platform health indicators.
 * Safe to call at any time — never throws.
 *
 * @returns {object}
 */
function healthSnapshot() {
    _metrics.healthSnapshotRequests++;

    const dbState = ["disconnected", "connected", "connecting", "disconnecting"];

    try {
        return {
            timestamp: new Date().toISOString(),
            process: {
                pid: process.pid,
                uptime: Math.round(process.uptime()),
                memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                nodeVersion: process.version,
                env: process.env.NODE_ENV || "unknown"
            },
            database: {
                state: dbState[getPlatformConnection().readyState] || "unknown",
                host: getPlatformConnection().host || "disconnected",
                name: getPlatformConnection().name || "unknown",
                modelsRegistered: Object.keys(getPlatformConnection().models).length
            },
            guardian: {
                mode: process.env.PLATFORM_GUARDIAN_MODE || "permissive",
                metrics: { ..._metrics }
            }
        };
    } catch (err) {
        return {
            timestamp: new Date().toISOString(),
            error: safeSerialize(err),
            partial: true
        };
    }
}

// ─── Metric Incrementors ──────────────────────────────────────────────────────

function incrementMetric(key) {
    if (key in _metrics) {
        _metrics[key]++;
    }
}

function setMetric(key, value) {
    _metrics[key] = value;
}

// ─── Platform Metrics ─────────────────────────────────────────────────────────

/**
 * getPlatformMetrics
 * Returns a copy of current in-memory guardian metrics.
 * @returns {object}
 */
function getPlatformMetrics() {
    return { ..._metrics };
}

module.exports = {
    safeSerialize,
    guardianLogger,
    healthSnapshot,
    getPlatformMetrics,
    incrementMetric,
    setMetric
};
