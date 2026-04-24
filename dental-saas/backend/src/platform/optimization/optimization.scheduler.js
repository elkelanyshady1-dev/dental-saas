/**
 * optimization.scheduler.js — Background recommendation sweep
 *
 * Runs analyzer.analyzeAll() every OPTIMIZATION_INTERVAL_MS (default 6h).
 * If OPTIMIZATION_AUTO_EXECUTE=true, immediately runs executeBatch().
 *
 * Defaults to RECOMMEND-ONLY mode — operators see recommendations on the
 * dashboard and execute them manually. Auto-execution is opt-in to avoid
 * surprising production with cluster moves.
 *
 * PLANE: Platform.
 */

"use strict";

const logger = require("@utils/logger");
const analyzer = require("./optimizationAnalyzer.service");
const executor = require("./optimizationExecutor.service");

const INTERVAL_MS = parseInt(
    process.env.OPTIMIZATION_INTERVAL_MS || (6 * 60 * 60 * 1000).toString(),
    10
);
const AUTO_EXECUTE = process.env.OPTIMIZATION_AUTO_EXECUTE === "true";
const RUN_ON_BOOT = process.env.OPTIMIZATION_RUN_ON_BOOT === "true";

let _timer = null;
let _running = false;
let _isCycleInFlight = false;
let _lastCycleAt = null;
let _lastCycleStats = null;

async function runCycle() {
    if (_isCycleInFlight) {
        logger.warn(
            { event: "OPTIMIZATION_CYCLE_SKIPPED", reason: "previous-cycle-still-running" },
            "[Optimization] Skipping cycle — previous one is still running"
        );
        return null;
    }
    _isCycleInFlight = true;
    const startedAt = Date.now();
    try {
        logger.info(
            { event: "OPTIMIZATION_CYCLE_STARTED", autoExecute: AUTO_EXECUTE },
            "[Optimization] Cycle starting"
        );

        const sweep = await analyzer.analyzeAll();

        let executions = [];
        if (AUTO_EXECUTE) {
            executions = await executor.executeBatch({
                actor: "scheduler",
                continueOnError: true,
            });
        }

        _lastCycleAt = new Date();
        _lastCycleStats = {
            startedAt: new Date(startedAt),
            durationMs: Date.now() - startedAt,
            analyzed: sweep.analyzed,
            recommendations: sweep.recommendations.length,
            errors: sweep.errors.length,
            autoExecuted: executions.length,
            autoExecutionFailures: executions.filter(e => e.status === "FAILED").length,
        };

        logger.info(
            { event: "OPTIMIZATION_CYCLE_COMPLETE", ..._lastCycleStats },
            `[Optimization] Cycle complete (${sweep.analyzed} analyzed, ${executions.length} auto-executed)`
        );
        return _lastCycleStats;
    } catch (err) {
        logger.error(
            { event: "OPTIMIZATION_CYCLE_FAILED", err: err.message, stack: err.stack },
            "[Optimization] Cycle failed"
        );
        return null;
    } finally {
        _isCycleInFlight = false;
    }
}

function start() {
    if (_running) return;
    if (process.env.NODE_ENV === "test") {
        // Don't auto-start the scheduler in test runs.
        return;
    }
    _running = true;

    logger.info(
        { event: "OPTIMIZATION_SCHEDULER_STARTED", intervalMs: INTERVAL_MS, autoExecute: AUTO_EXECUTE },
        `[Optimization] Scheduler started (every ${Math.round(INTERVAL_MS / 1000)}s, autoExecute=${AUTO_EXECUTE})`
    );

    if (RUN_ON_BOOT) {
        // Defer first cycle by 30s so boot finishes uncluttered.
        setTimeout(() => { runCycle().catch(() => {}); }, 30_000).unref();
    }

    // ALLOWED_POLLING: SCHEDULER
    _timer = setInterval(() => {
        runCycle().catch(() => {});
    }, INTERVAL_MS);
    _timer.unref();
}

function stop() {
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
    }
    _running = false;
    logger.info({ event: "OPTIMIZATION_SCHEDULER_STOPPED" }, "[Optimization] Scheduler stopped");
}

function getStatus() {
    return {
        running: _running,
        autoExecute: AUTO_EXECUTE,
        intervalMs: INTERVAL_MS,
        cycleInFlight: _isCycleInFlight,
        lastCycleAt: _lastCycleAt,
        lastCycleStats: _lastCycleStats,
    };
}

module.exports = { start, stop, runCycle, getStatus };
