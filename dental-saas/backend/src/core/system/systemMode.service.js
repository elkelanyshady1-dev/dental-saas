/**
 * systemMode.service.js — Global System Degradation Bus
 * Core Infrastructure (cross-cutting)
 *
 * PURPOSE:
 *   A single in-process registry that aggregates degradation signals from
 *   every infrastructure dependency (Redis, MongoDB, external APIs, …) into
 *   one system-wide mode. Consumers subscribe once and react to changes
 *   without having to wire up to every individual subsystem.
 *
 * MODES:
 *   normal   — all subsystems healthy
 *   degraded — at least one non-critical subsystem is partial
 *   fallback — at least one critical subsystem (Redis, DB) is unavailable
 *
 * USAGE:
 *   const systemMode = require("@core/system/systemMode.service");
 *
 *   // Subsystem reports its state:
 *   systemMode.reportSubsystem("redis", "fallback", { reason: "max_retries" });
 *
 *   // Consumer subscribes:
 *   systemMode.on("change", ({ mode, subsystems }) => { ... });
 *
 *   // Consumer reads current state:
 *   systemMode.getMode();           // "normal" | "degraded" | "fallback"
 *   systemMode.getSubsystems();     // { redis: "normal", db: "normal", ... }
 *
 * DESIGN NOTES:
 *   - Single dependency (logger) to prevent circular imports; Redis
 *     manager and other subsystems import THIS, not the other way round.
 *   - Aggregation rule: fallback > degraded > normal. If any subsystem is
 *     in fallback, the system is in fallback. Else if any is degraded,
 *     the system is degraded. Else normal.
 *   - EventEmitter-based: zero coupling between publishers and subscribers.
 */

"use strict";

const EventEmitter = require("events");
const logger = require("../../utils/logger");

const MODES = Object.freeze({
    NORMAL:   "normal",
    DEGRADED: "degraded",
    FALLBACK: "fallback",
});

const _subsystems = Object.create(null);  // { name: mode }
let _systemMode = MODES.NORMAL;
const _bus = new EventEmitter();
_bus.setMaxListeners(50);

function _computeAggregate() {
    let hasFallback = false;
    let hasDegraded = false;
    for (const mode of Object.values(_subsystems)) {
        if (mode === MODES.FALLBACK) hasFallback = true;
        else if (mode === MODES.DEGRADED) hasDegraded = true;
    }
    if (hasFallback) return MODES.FALLBACK;
    if (hasDegraded) return MODES.DEGRADED;
    return MODES.NORMAL;
}

/**
 * Report the current mode of a subsystem. Triggers a system-wide "change"
 * event if the aggregate mode changes.
 *
 * @param {string} name       — subsystem identifier ("redis", "db", "storage")
 * @param {string} mode       — "normal" | "degraded" | "fallback"
 * @param {object} [context]  — structured metadata for the log line
 */
function reportSubsystem(name, mode, context = {}) {
    if (!Object.values(MODES).includes(mode)) {
        throw new Error(`systemMode: invalid mode "${mode}" for ${name}`);
    }

    const prev = _subsystems[name];
    if (prev === mode) return;

    _subsystems[name] = mode;
    const nextSystem = _computeAggregate();

    logger.info(
        { event: "SUBSYSTEM_MODE_CHANGE", subsystem: name, from: prev ?? "unset", to: mode, systemMode: nextSystem, ...context },
        `[SystemMode] ${name}: ${prev ?? "unset"} → ${mode}`
    );

    if (nextSystem !== _systemMode) {
        const prevSystem = _systemMode;
        _systemMode = nextSystem;
        logger.warn(
            { event: "SYSTEM_MODE_CHANGE", from: prevSystem, to: nextSystem, source: name },
            `[SystemMode] SYSTEM: ${prevSystem} → ${nextSystem}`
        );
        _bus.emit("change", { mode: nextSystem, previous: prevSystem, source: name, subsystems: { ..._subsystems } });
    }
}

function getMode() {
    return _systemMode;
}

function getSubsystems() {
    return { ..._subsystems };
}

function isHealthy() {
    return _systemMode === MODES.NORMAL;
}

function on(event, listener) {
    _bus.on(event, listener);
    return () => _bus.off(event, listener);
}

function off(event, listener) {
    _bus.off(event, listener);
}

module.exports = {
    MODES,
    reportSubsystem,
    getMode,
    getSubsystems,
    isHealthy,
    on,
    off,
};
