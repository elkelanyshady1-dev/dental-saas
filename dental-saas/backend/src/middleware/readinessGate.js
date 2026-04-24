/**
 * readinessGate.js — System Readiness Gate Middleware
 * Infrastructure — Phase 4: Runtime Readiness
 *
 * Returns 503 for ALL requests until the system is fully ready:
 *   - DB connected
 *   - Workers operational
 *   - Redis validated
 *   - Validators passed
 *
 * EXCEPTIONS:
 *   - /api/health — always allowed (for load balancer probes)
 *   - /metrics — always allowed (for Prometheus scraping)
 *
 * PLANE: Infrastructure (cross-cutting)
 */

"use strict";

// ─── Global Readiness Flag ─────────────────────────────────────────────────

let _isSystemReady = false;

/**
 * Set the system readiness state.
 * Called once by server.js after all boot phases complete.
 * @param {boolean} ready
 */
function setSystemReady(ready) {
    _isSystemReady = !!ready;
}

/**
 * Check if the system is ready.
 * @returns {boolean}
 */
function isSystemReady() {
    return _isSystemReady;
}

// ─── Middleware ─────────────────────────────────────────────────────────────

/**
 * Express middleware that blocks requests until system is fully ready.
 * Allows health check and metrics endpoints through at all times.
 */
function readinessGateMiddleware(req, res, next) {
    // Always allow health probes and metrics (load balancer / Prometheus)
    if (req.path === "/api/health" || req.path === "/metrics") {
        return next();
    }

    if (!_isSystemReady) {
        return res.status(503).json({
            success: false,
            code: "SYSTEM_NOT_READY",
            message: "System is starting up. Please retry shortly.",
        });
    }

    next();
}

module.exports = {
    readinessGateMiddleware,
    setSystemReady,
    isSystemReady,
};
