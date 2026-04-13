/**
 * authAnomalyDetector.js — Authorization Anomaly Detection Engine
 *
 * Detects suspicious authorization patterns from persisted auth traces.
 * Runs asynchronously as a post-persist hook — NEVER blocks request lifecycle.
 *
 * Detection Rules:
 *   1. EXCESSIVE_DENIALS     — user denied > threshold times in a sliding window
 *   2. CROSS_ORG_ATTEMPT     — mismatch between token org and resource org
 *   3. ROLE_BEHAVIOR_DEVIATION — role performing actions outside normal pattern
 *
 * Output: AUTH_ANOMALY log events + SecurityAlert records (via securityAlerts service)
 *
 * PLANE: Org only.
 * Phase 20 — TASK-AUTH-INT-003
 */

"use strict";

const logger = require("@utils/logger");

// ─── In-Memory Sliding Windows ──────────────────────────────────────────────
//
// We use per-user denial counters in a sliding window to detect anomalies
// without introducing expensive DB queries on every request.

const _userDenials = new Map(); // userId → [{timestamp, path, permission}]
const WINDOW_MS = 60_000;       // 1-minute sliding window
const CLEANUP_INTERVAL_MS = 30_000; // Cleanup every 30s

// ─── Detection Thresholds ───────────────────────────────────────────────────

const THRESHOLDS = {
    EXCESSIVE_DENIALS: {
        maxDenials: parseInt(process.env.AUTH_ANOMALY_DENIAL_THRESHOLD, 10) || 10,
        windowMs: WINDOW_MS,
        severity: "HIGH",
    },
    ROLE_BEHAVIOR_DEVIATION: {
        severity: "MEDIUM",
        // assistant accessing admin-level resources
        suspiciousPermissions: [
            "security.manage",
            "staff.manage",
            "users.create",
            "users.delete",
            "branches.delete",
            "branches.create",
        ],
        suspiciousRoles: ["assistant", "receptionist", "lab_technician"],
    },
};

// ─── Window Helpers ─────────────────────────────────────────────────────────

let _lastCleanup = Date.now();

function _cleanWindows() {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [userId, denials] of _userDenials) {
        const filtered = denials.filter(d => d.timestamp > cutoff);
        if (filtered.length === 0) {
            _userDenials.delete(userId);
        } else {
            _userDenials.set(userId, filtered);
        }
    }
    _lastCleanup = Date.now();
}

// ─── Core: Analyze Trace ────────────────────────────────────────────────────

/**
 * Analyze a persisted auth trace for anomalies.
 * Registered as a post-persist hook in authTracePersistence.
 *
 * @param {Object} traceDoc — the persisted AuthTrace document
 */
async function analyzeTrace(traceDoc) {
    if (!traceDoc) return;

    // Periodic cleanup
    if (Date.now() - _lastCleanup > CLEANUP_INTERVAL_MS) {
        _cleanWindows();
    }

    const anomalies = [];

    // ── Rule 1: EXCESSIVE_DENIALS ──
    if (traceDoc.hasDenial && traceDoc.userId) {
        const userId = traceDoc.userId.toString();
        anomalies.push(..._checkExcessiveDenials(userId, traceDoc));
    }

    // ── Rule 2: CROSS_ORG_ATTEMPT ──
    // Detected by checking if resource context has a different org
    // (This check relies on route-level validation, but traces can expose it)
    if (traceDoc.hasDenial && traceDoc.denialLayer === "RBAC") {
        anomalies.push(..._checkCrossOrgAttempt(traceDoc));
    }

    // ── Rule 3: ROLE_BEHAVIOR_DEVIATION ──
    if (traceDoc.hasDenial && traceDoc.role) {
        anomalies.push(..._checkRoleBehaviorDeviation(traceDoc));
    }

    // Emit anomalies
    for (const anomaly of anomalies) {
        _emitAnomaly(anomaly, traceDoc);
    }
}

// ─── Detection Rule Implementations ─────────────────────────────────────────

function _checkExcessiveDenials(userId, traceDoc) {
    const anomalies = [];

    // Add to sliding window
    if (!_userDenials.has(userId)) {
        _userDenials.set(userId, []);
    }

    const denials = _userDenials.get(userId);
    denials.push({
        timestamp: Date.now(),
        path: traceDoc.path,
        permission: traceDoc.steps?.find(s => s.result === "DENY")?.permission || null,
    });

    // Check threshold
    const cutoff = Date.now() - THRESHOLDS.EXCESSIVE_DENIALS.windowMs;
    const recentDenials = denials.filter(d => d.timestamp > cutoff);
    _userDenials.set(userId, recentDenials);

    if (recentDenials.length >= THRESHOLDS.EXCESSIVE_DENIALS.maxDenials) {
        anomalies.push({
            type: "EXCESSIVE_DENIALS",
            severity: THRESHOLDS.EXCESSIVE_DENIALS.severity,
            userId,
            organizationId: traceDoc.organizationId,
            details: {
                count: recentDenials.length,
                timeframeMs: THRESHOLDS.EXCESSIVE_DENIALS.windowMs,
                recentPaths: [...new Set(recentDenials.map(d => d.path))].slice(0, 10),
                recentPermissions: [...new Set(recentDenials.map(d => d.permission).filter(Boolean))].slice(0, 10),
            },
        });

        // Reset window to avoid flooding (dedup)
        _userDenials.set(userId, []);
    }

    return anomalies;
}

function _checkCrossOrgAttempt(traceDoc) {
    // This is a signal-based detection — the actual cross-org check happens
    // at middleware level. If RBAC denied and the denial reason mentions
    // "organization", it may indicate a cross-org attempt.
    const rbacDenial = traceDoc.steps?.find(
        s => s.layer === "RBAC" && s.result === "DENY"
    );
    if (!rbacDenial) return [];

    const reason = (rbacDenial.reason || "").toLowerCase();
    if (reason.includes("organization") || reason.includes("org mismatch")) {
        return [{
            type: "CROSS_ORG_ATTEMPT",
            severity: "CRITICAL",
            userId: traceDoc.userId,
            organizationId: traceDoc.organizationId,
            details: {
                path: traceDoc.path,
                method: traceDoc.method,
                denialReason: rbacDenial.reason,
                role: traceDoc.role,
            },
        }];
    }

    return [];
}

function _checkRoleBehaviorDeviation(traceDoc) {
    const config = THRESHOLDS.ROLE_BEHAVIOR_DEVIATION;

    // Only check if role is in suspicious list
    if (!config.suspiciousRoles.includes(traceDoc.role)) return [];

    // Check if any denied permission is admin-level
    const deniedSteps = (traceDoc.steps || []).filter(s => s.result === "DENY");
    const adminAttempts = deniedSteps.filter(s =>
        s.permission && config.suspiciousPermissions.includes(s.permission)
    );

    if (adminAttempts.length === 0) return [];

    return [{
        type: "ROLE_BEHAVIOR_DEVIATION",
        severity: config.severity,
        userId: traceDoc.userId,
        organizationId: traceDoc.organizationId,
        details: {
            role: traceDoc.role,
            attemptedPermissions: adminAttempts.map(s => s.permission),
            path: traceDoc.path,
            method: traceDoc.method,
        },
    }];
}

// ─── Anomaly Emission ───────────────────────────────────────────────────────

function _emitAnomaly(anomaly, traceDoc) {
    logger.warn(
        {
            type: "AUTH_ANOMALY",
            anomalyType: anomaly.type,
            severity: anomaly.severity,
            userId: anomaly.userId?.toString(),
            organizationId: anomaly.organizationId?.toString(),
            path: traceDoc.path,
            method: traceDoc.method,
            role: traceDoc.role,
            details: anomaly.details,
        },
        `[AuthAnomaly] ${anomaly.type} — severity ${anomaly.severity}` +
        ` — user ${anomaly.userId} — org ${anomaly.organizationId}`
    );
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    analyzeTrace,
    THRESHOLDS,
};
