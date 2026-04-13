/**
 * governanceEngine.js
 * ═══════════════════════════════════════════════════════════════
 * Organization Plane — System Governance Monitor
 *
 * Tracks and reports governance violations:
 *   - Missing zero-trust guards on routes
 *   - Unauthorized access attempts
 *   - RBAC bypass attempts
 *   - Plane isolation violations
 *   - Configuration drift
 *
 * Violations are logged with structured data for monitoring systems
 * (ELK, Datadog, CloudWatch) and stored in-memory for the
 * governance dashboard.
 *
 * ── VIOLATION SEVERITY ──────────────────────────────────────────
 *
 *   CRITICAL — Security boundary violated → STOP & alert
 *   HIGH     — Governance rule broken → alert & log
 *   MEDIUM   — Policy drift detected → log & monitor
 *   LOW      — Informational → log only
 *
 * PLANE: Meta (monitors both org + platform).
 *
 * @module core/security/governanceEngine
 */

"use strict";

const logger = require("../../utils/logger");

// ─── In-Memory Violation Buffer ─────────────────────────────────────────────
// Circular buffer of recent violations for the governance dashboard.
// Oldest violations are discarded when the buffer is full.
const MAX_VIOLATIONS = 500;
const _violations = [];

// ─── Violation Rules ────────────────────────────────────────────────────────

const GOVERNANCE_RULES = {
    MISSING_ZEROTRUST:      "MISSING_ZEROTRUST",
    UNAUTHORIZED_ACCESS:    "UNAUTHORIZED_ACCESS",
    RBAC_BYPASS_ATTEMPT:    "RBAC_BYPASS_ATTEMPT",
    PLANE_ISOLATION:        "PLANE_ISOLATION",
    RAW_ROLE_CHECK:         "RAW_ROLE_CHECK",
    UNGUARDED_ROUTE:        "UNGUARDED_ROUTE",
    CAPABILITY_DRIFT:       "CAPABILITY_DRIFT",
    TENANT_ISOLATION:       "TENANT_ISOLATION",
    CONFIG_DRIFT:           "CONFIG_DRIFT",
    SWAGGER_MISSING:        "SWAGGER_MISSING",
};

const SEVERITY = {
    CRITICAL: "critical",
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low",
};

/**
 * logViolation — Record a governance violation.
 *
 * @param {Object} event
 * @param {string} event.rule — Rule that was violated (from GOVERNANCE_RULES)
 * @param {string} event.severity — Severity level
 * @param {string} event.message — Human-readable description
 * @param {string} [event.route] — Affected route
 * @param {string} [event.userId] — User who triggered the violation
 * @param {string} [event.organizationId] — Affected organization
 * @param {Object} [event.details] — Additional context
 */
function logViolation(event) {
    const violation = {
        type: "GOVERNANCE_VIOLATION",
        rule: event.rule || "UNKNOWN",
        severity: event.severity || SEVERITY.HIGH,
        message: event.message || "Governance violation detected",
        route: event.route || null,
        userId: event.userId || null,
        organizationId: event.organizationId || null,
        details: event.details || {},
        timestamp: new Date().toISOString(),
    };

    // Structured log for monitoring systems
    const logLevel = violation.severity === SEVERITY.CRITICAL ? "error" : "warn";
    logger[logLevel]({
        event: "GOVERNANCE_VIOLATION",
        ...violation,
    }, `[Governance] ${violation.rule}: ${violation.message}`);

    // Buffer for dashboard
    _violations.push(violation);
    if (_violations.length > MAX_VIOLATIONS) {
        _violations.shift(); // Remove oldest
    }

    return violation;
}

// ─── Convenience Methods ────────────────────────────────────────────────────

/**
 * logUnauthorizedAccess — Record an unauthorized access attempt.
 */
function logUnauthorizedAccess(req, reason) {
    return logViolation({
        rule: GOVERNANCE_RULES.UNAUTHORIZED_ACCESS,
        severity: SEVERITY.HIGH,
        message: `Unauthorized access attempt: ${reason}`,
        route: req?.originalUrl,
        userId: req?.user?._id?.toString() || req?.user?.id,
        organizationId: req?.organizationId,
        details: {
            method: req?.method,
            ip: req?.ip,
            userAgent: req?.headers?.["user-agent"],
            reason,
        },
    });
}

/**
 * logMissingGuard — Record a route missing zero-trust guard.
 */
function logMissingGuard(method, path) {
    return logViolation({
        rule: GOVERNANCE_RULES.MISSING_ZEROTRUST,
        severity: SEVERITY.CRITICAL,
        message: `Route missing zero-trust guard: ${method.toUpperCase()} ${path}`,
        route: path,
        details: { method: method.toUpperCase() },
    });
}

/**
 * logPlaneViolation — Record a plane isolation violation.
 */
function logPlaneViolation(source, target, details) {
    return logViolation({
        rule: GOVERNANCE_RULES.PLANE_ISOLATION,
        severity: SEVERITY.CRITICAL,
        message: `Plane isolation violation: ${source} → ${target}`,
        details: { source, target, ...details },
    });
}

/**
 * logTenantIsolation — Record a tenant isolation violation.
 */
function logTenantIsolation(userId, requestedOrgId, actualOrgId) {
    return logViolation({
        rule: GOVERNANCE_RULES.TENANT_ISOLATION,
        severity: SEVERITY.CRITICAL,
        message: `Tenant isolation violation: User ${userId} attempted cross-tenant access`,
        userId,
        details: {
            requestedOrgId,
            actualOrgId,
        },
    });
}

// ─── Query Methods ──────────────────────────────────────────────────────────

/**
 * getViolations — Get recent governance violations.
 * @param {Object} [filters]
 * @param {string} [filters.rule]
 * @param {string} [filters.severity]
 * @param {number} [filters.limit=50]
 * @returns {Array<Object>}
 */
function getViolations(filters = {}) {
    let results = [..._violations].reverse(); // newest first

    if (filters.rule) {
        results = results.filter(v => v.rule === filters.rule);
    }
    if (filters.severity) {
        results = results.filter(v => v.severity === filters.severity);
    }

    return results.slice(0, filters.limit || 50);
}

/**
 * getViolationStats — Aggregate violation statistics.
 * @returns {Object}
 */
function getViolationStats() {
    const byRule = {};
    const bySeverity = {};

    for (const v of _violations) {
        byRule[v.rule] = (byRule[v.rule] || 0) + 1;
        bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
    }

    return {
        total: _violations.length,
        byRule,
        bySeverity,
        oldest: _violations[0]?.timestamp || null,
        newest: _violations[_violations.length - 1]?.timestamp || null,
    };
}

/**
 * clearViolations — Clear violation buffer (for tests).
 */
function clearViolations() {
    _violations.length = 0;
}

module.exports = {
    logViolation,
    logUnauthorizedAccess,
    logMissingGuard,
    logPlaneViolation,
    logTenantIsolation,
    getViolations,
    getViolationStats,
    clearViolations,
    GOVERNANCE_RULES,
    SEVERITY,
};
