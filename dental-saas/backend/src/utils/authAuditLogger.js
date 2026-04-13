/**
 * authAuditLogger.js — Centralized Authorization Audit Logger
 *
 * Logs the complete authorization trace for every request that goes
 * through auth middleware. Creates structured, queryable log entries
 * suitable for:
 *   - Compliance auditing (ISO 27001, SOC 2)
 *   - Security incident investigation
 *   - Performance analysis of auth decisions
 *   - Anomaly detection (unusual denial patterns)
 *
 * Log Format:
 *   {
 *     type: "AUTH_TRACE",
 *     requestId: "...",
 *     userId: "...",
 *     organizationId: "...",
 *     role: "...",
 *     method: "POST",
 *     path: "/api/v1/org/patients",
 *     statusCode: 200,
 *     duration: 45,
 *     stepCount: 4,
 *     steps: [ ... ],
 *     hasDenial: false,
 *     denialLayer: null,
 *   }
 *
 * PLANE: Org only.
 */

"use strict";

const logger = require("@utils/logger");

// ─── Log Level Decision ─────────────────────────────────────────────────────
//
// INFO  — default for all successful requests (all steps ALLOW)
// WARN  — if any step resulted in DENY (request may still succeed
//         due to shadow mode, but the denial is noteworthy)
// ERROR — never used here (errors are handled by error handlers)

/**
 * Log the complete auth trace for a request.
 *
 * @param {import("express").Request} req — Express request with req.authTrace
 */
function logAuthTrace(req) {
    if (!req.authTrace || !req.authTrace.steps || req.authTrace.steps.length === 0) {
        return;
    }

    const trace = req.authTrace;
    const steps = trace.steps;

    // Determine if any denial occurred
    const denialStep = steps.find(s => s.result === "DENY");
    const hasDenial = !!denialStep;
    const denialLayer = denialStep?.layer || null;

    // Build the structured log entry
    const logEntry = {
        type: "AUTH_TRACE",
        requestId: trace.requestId,
        userId: req.user?._id?.toString() || null,
        organizationId: (req.organizationId || req.user?.organizationId || "").toString() || null,
        role: req.user?.roleId?.name || req.user?.role || null,
        method: trace.method,
        path: trace.path,
        statusCode: trace.statusCode || null,
        duration: trace.duration || (Date.now() - trace.startTime),
        stepCount: steps.length,
        hasDenial,
        denialLayer,
        steps: steps.map(s => ({
            layer: s.layer,
            result: s.result,
            permission: s.permission || null,
            resource: s.resource || null,
            reason: s.reason || null,
            elapsed: s.elapsed,
        })),
    };

    // Log at appropriate level
    const message = hasDenial
        ? `[AuthTrace] ${trace.method} ${trace.path} — DENIED at ${denialLayer} (${steps.length} steps, ${logEntry.duration}ms)`
        : `[AuthTrace] ${trace.method} ${trace.path} — OK (${steps.length} steps, ${logEntry.duration}ms)`;

    if (hasDenial) {
        logger.warn(logEntry, message);
    } else {
        logger.info(logEntry, message);
    }
}

/**
 * Get a summary of the auth trace (for downstream introspection).
 *
 * @param {import("express").Request} req
 * @returns {{ steps: number, hasDenial: boolean, layers: string[] } | null}
 */
function getAuthTraceSummary(req) {
    if (!req.authTrace) return null;

    const steps = req.authTrace.steps || [];
    return {
        steps: steps.length,
        hasDenial: steps.some(s => s.result === "DENY"),
        layers: [...new Set(steps.map(s => s.layer))],
        denials: steps.filter(s => s.result === "DENY").map(s => ({
            layer: s.layer,
            permission: s.permission,
            reason: s.reason,
        })),
    };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    logAuthTrace,
    getAuthTraceSummary,
};
