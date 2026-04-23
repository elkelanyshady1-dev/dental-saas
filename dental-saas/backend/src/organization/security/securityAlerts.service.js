/**
 * securityAlerts.service.js — Security Alerting + Anomaly Detection
 *
 * Phases 1 & 2 of Security Analytics:
 *   - Threshold-based alerting (high denial rate, brute force)
 *   - Simple anomaly detection (suspicious access patterns)
 *   - Alert lifecycle management (create, acknowledge, resolve)
 *   - Deduplication to prevent alert flooding
 *
 * How it works:
 *   1. denialTracker calls `evaluateDenialThresholds()` after each denial
 *   2. This service checks in-memory sliding windows for threshold violations
 *   3. If threshold is breached → creates a SecurityAlert (with dedup key)
 *   4. Frontend polls `getActiveAlerts()` for the alert panel
 *
 * Rules engine intentionally kept simple — threshold-based first, then evolve.
 *
 * PLANE: Org only.
 */

"use strict";

const SecurityAlert = require("./models/SecurityAlert").default;
const logger = require("@utils/logger");

// ── Secure Model Instance ──────────────────────────────────────────────────
const Alert = SecurityAlert;

// ─── Sliding Window Storage (per-org) ───────────────────────────────────────

/**
 * In-memory sliding windows for real-time threshold detection.
 * Structure: orgId → { denials: [{timestamp, userId, endpoint, permission}], accessByUser: Map }
 */
const _windows = new Map();
const WINDOW_SIZE_MS = 60_000; // 1 minute sliding window
const DEDUP_COOLDOWN_MS = 5 * 60_000; // 5 min dedup window (same alert type per org)

// ─── Threshold Configuration ────────────────────────────────────────────────

const THRESHOLDS = {
    // Phase 1: Denial rate spike
    HIGH_DENIAL_RATE: {
        denials_per_minute: 50,
        severity: "HIGH",
        message: "Spike in denied access attempts detected",
    },
    // Phase 1: Single user brute force
    BRUTE_FORCE_ATTEMPT: {
        denials_per_user_per_minute: 15,
        severity: "CRITICAL",
        message: "Possible brute-force access attempt from single user",
    },
    // Phase 2: Suspicious access — rapid patient record access
    SUSPICIOUS_ACCESS: {
        unique_patients_per_minute: 20,
        severity: "HIGH",
        message: "Suspicious access pattern — rapid patient record access",
    },
    // Phase 2: Privilege escalation — repeated admin endpoint denials
    PRIVILEGE_ESCALATION: {
        admin_denials_per_minute: 10,
        severity: "CRITICAL",
        message: "Repeated unauthorized admin resource access attempts",
    },
    // Phase 3: Critical denial classification spike
    CRITICAL_DENIAL_SPIKE: {
        critical_denials_per_minute: 20,
        severity: "HIGH",
        message: "Spike in critical-classified denials (entitlement/RBAC failures)",
    },
    // Phase 3: Unknown denial classification spike
    UNKNOWN_DENIAL_SPIKE: {
        unknown_denials_per_minute: 10,
        severity: "MEDIUM",
        message: "Multiple unclassified denials detected — review denial classification rules",
    },
};

// ─── Window Helpers ─────────────────────────────────────────────────────────

function _getOrgWindow(organizationId) {
    if (!_windows.has(organizationId)) {
        _windows.set(organizationId, {
            denials: [],
            patientAccess: new Map(), // userId → Set<patientId>
            lastCleanup: Date.now(),
        });
    }
    return _windows.get(organizationId);
}

function _cleanWindow(window) {
    const cutoff = Date.now() - WINDOW_SIZE_MS;

    // Clean denials
    window.denials = window.denials.filter((d) => d.timestamp > cutoff);

    // Clean patient access map (remove entries older than window)
    for (const [userId, entries] of window.patientAccess) {
        const filtered = entries.filter((e) => e.timestamp > cutoff);
        if (filtered.length === 0) {
            window.patientAccess.delete(userId);
        } else {
            window.patientAccess.set(userId, filtered);
        }
    }

    window.lastCleanup = Date.now();
}

// ─── Core: Record Denial Event & Evaluate Thresholds ────────────────────────

/**
 * Called by denialTracker after each denial is recorded.
 * Evaluates all threshold rules and triggers alerts if breached.
 *
 * @param {Object} denial
 * @param {string} denial.endpoint
 * @param {string} denial.permission
 * @param {string} denial.userRole
 * @param {string} denial.userId
 * @param {string} denial.organizationId
 */
async function evaluateDenialThresholds(denial) {
    const { endpoint, permission, userRole, userId, organizationId } = denial;
    if (!organizationId) return;

    const window = _getOrgWindow(organizationId);

    // Add to sliding window
    window.denials.push({
        timestamp: Date.now(),
        userId,
        endpoint,
        permission,
        userRole,
        type: denial.type || "unknown",
    });

    // Periodic cleanup (every 30s)
    if (Date.now() - window.lastCleanup > 30_000) {
        _cleanWindow(window);
    }

    const now = Date.now();
    const cutoff = now - WINDOW_SIZE_MS;
    const recentDenials = window.denials.filter((d) => d.timestamp > cutoff);

    // ── Rule 1: HIGH_DENIAL_RATE ──
    if (recentDenials.length >= THRESHOLDS.HIGH_DENIAL_RATE.denials_per_minute) {
        await _createAlertIfNotDuped(organizationId, {
            type: "HIGH_DENIAL_RATE",
            severity: THRESHOLDS.HIGH_DENIAL_RATE.severity,
            message: THRESHOLDS.HIGH_DENIAL_RATE.message,
            details: {
                denialCount: recentDenials.length,
                windowMs: WINDOW_SIZE_MS,
                topEndpoints: _topN(recentDenials, "endpoint", 5),
                topPermissions: _topN(recentDenials, "permission", 5),
            },
        });
    }

    // ── Rule 2: BRUTE_FORCE_ATTEMPT (per user) ──
    if (userId) {
        const userDenials = recentDenials.filter((d) => d.userId === userId);
        if (
            userDenials.length >=
            THRESHOLDS.BRUTE_FORCE_ATTEMPT.denials_per_user_per_minute
        ) {
            await _createAlertIfNotDuped(organizationId, {
                type: "BRUTE_FORCE_ATTEMPT",
                severity: THRESHOLDS.BRUTE_FORCE_ATTEMPT.severity,
                message: THRESHOLDS.BRUTE_FORCE_ATTEMPT.message,
                triggeredByUserId: userId,
                details: {
                    userId,
                    userRole,
                    denialCount: userDenials.length,
                    endpoints: [
                        ...new Set(userDenials.map((d) => d.endpoint)),
                    ],
                },
            });
        }
    }

    // ── Rule 3: PRIVILEGE_ESCALATION (admin endpoint denials) ──
    const adminPermissions = [
        "security.manage",
        "staff.manage",
        "users.delete",
        "branches.delete",
    ];
    if (adminPermissions.includes(permission)) {
        const adminDenials = recentDenials.filter((d) =>
            adminPermissions.includes(d.permission)
        );
        if (
            adminDenials.length >=
            THRESHOLDS.PRIVILEGE_ESCALATION.admin_denials_per_minute
        ) {
            await _createAlertIfNotDuped(organizationId, {
                type: "PRIVILEGE_ESCALATION",
                severity: THRESHOLDS.PRIVILEGE_ESCALATION.severity,
                message: THRESHOLDS.PRIVILEGE_ESCALATION.message,
                triggeredByUserId: userId,
                details: {
                    adminDenialCount: adminDenials.length,
                    users: [
                        ...new Set(adminDenials.map((d) => d.userId)),
                    ].filter(Boolean),
                    permissions: [
                        ...new Set(adminDenials.map((d) => d.permission)),
                    ],
                },
            });
        }
    }

    // ── Rule 5: CRITICAL_DENIAL_SPIKE (type-based) ──
    const criticalDenials = recentDenials.filter((d) => d.type === "critical");
    if (
        criticalDenials.length >=
        THRESHOLDS.CRITICAL_DENIAL_SPIKE.critical_denials_per_minute
    ) {
        await _createAlertIfNotDuped(organizationId, {
            type: "CRITICAL_DENIAL_SPIKE",
            severity: THRESHOLDS.CRITICAL_DENIAL_SPIKE.severity,
            message: THRESHOLDS.CRITICAL_DENIAL_SPIKE.message,
            details: {
                criticalDenialCount: criticalDenials.length,
                windowMs: WINDOW_SIZE_MS,
                topPermissions: _topN(criticalDenials, "permission", 5),
            },
        });
    }

    // ── Rule 6: UNKNOWN_DENIAL_SPIKE (type-based) ──
    const unknownDenials = recentDenials.filter((d) => d.type === "unknown");
    if (
        unknownDenials.length >=
        THRESHOLDS.UNKNOWN_DENIAL_SPIKE.unknown_denials_per_minute
    ) {
        await _createAlertIfNotDuped(organizationId, {
            type: "UNKNOWN_DENIAL_SPIKE",
            severity: THRESHOLDS.UNKNOWN_DENIAL_SPIKE.severity,
            message: THRESHOLDS.UNKNOWN_DENIAL_SPIKE.message,
            details: {
                unknownDenialCount: unknownDenials.length,
                windowMs: WINDOW_SIZE_MS,
                topEndpoints: _topN(unknownDenials, "endpoint", 5),
            },
        });
    }
}

/**
 * Record patient access for anomaly detection.
 * Called from patient read endpoints (middleware hook).
 *
 * @param {Object} access
 * @param {string} access.userId
 * @param {string} access.patientId
 * @param {string} access.organizationId
 */
async function recordPatientAccess({ userId, patientId, organizationId }) {
    if (!organizationId || !userId) return;

    const window = _getOrgWindow(organizationId);

    if (!window.patientAccess.has(userId)) {
        window.patientAccess.set(userId, []);
    }
    window.patientAccess.get(userId).push({
        patientId,
        timestamp: Date.now(),
    });

    // ── Rule 4: SUSPICIOUS_ACCESS (rapid patient access) ──
    const cutoff = Date.now() - WINDOW_SIZE_MS;
    const recentAccess = window.patientAccess
        .get(userId)
        .filter((a) => a.timestamp > cutoff);
    const uniquePatients = new Set(recentAccess.map((a) => a.patientId));

    if (
        uniquePatients.size >=
        THRESHOLDS.SUSPICIOUS_ACCESS.unique_patients_per_minute
    ) {
        await _createAlertIfNotDuped(organizationId, {
            type: "SUSPICIOUS_ACCESS",
            severity: THRESHOLDS.SUSPICIOUS_ACCESS.severity,
            message: THRESHOLDS.SUSPICIOUS_ACCESS.message,
            triggeredByUserId: userId,
            details: {
                userId,
                uniquePatientsAccessed: uniquePatients.size,
                windowMs: WINDOW_SIZE_MS,
            },
        });
    }
}

// ─── Alert CRUD ─────────────────────────────────────────────────────────────

/**
 * Get active alerts for an organization.
 * @param {string} organizationId
 * @param {Object} [options] - { status, severity, page, limit }
 */
async function getAlerts(organizationId, options = {}, req = null) {
    const {
        status,
        severity,
        page = 1,
        limit = 25,
    } = options;

    const filter = {};
    if (status) filter.status = status;
    if (severity) filter.severity = severity;

    const safeLimit = Math.min(Number(limit) || 25, 50);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    // Per-org DB: connection-scoped isolation

    const [alerts, total] = await Promise.all([
        Alert.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(safeLimit)
            .lean(),
        Alert.countDocuments(filter),
    ]);

    return {
        alerts,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total,
            pages: Math.ceil(total / safeLimit),
        },
    };
}

/**
 * Get active alert counts grouped by severity.
 * @param {string} organizationId
 */
async function getAlertSummary(organizationId, req = null) {
    // Per-org DB: connection-scoped isolation

    const pipeline = [
        {
            $match: {
                status: "active",
            },
        },
        {
            $group: {
                _id: "$severity",
                count: { $sum: 1 },
            },
        },
    ];

    // RLS-enforced: per-org connection scopes organizationId $match
    const results = await Alert.aggregate(pipeline);

    const summary = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const r of results) {
        summary[r._id] = r.count;
    }

    return {
        ...summary,
        total: Object.values(summary).reduce((a, b) => a + b, 0),
    };
}

/**
 * Acknowledge an alert.
 * @param {string} alertId
 * @param {string} userId - The user acknowledging the alert
 */
async function acknowledgeAlert(alertId, userId, organizationId) {

    // Per-org DB: connection-scoped isolation
    const alert = await Alert.findById(alertId);
    if (!alert) return null;
    if (alert.status !== "active") return alert;

    await Alert.findByIdAndUpdate(
        alertId,
        {
            status: "acknowledged",
            acknowledgedBy: userId,
            acknowledgedAt: new Date(),
        }
    );

    // Reload
    return Alert.findById(alertId).lean();
}

/**
 * Resolve an alert.
 * @param {string} alertId
 * @param {string} userId - The user resolving the alert
 */
async function resolveAlert(alertId, userId, organizationId) {

    await Alert.findByIdAndUpdate(
        alertId,
        {
            status: "resolved",
            resolvedBy: userId,
            resolvedAt: new Date(),
        }
    );

    // Reload
    return Alert.findById(alertId).lean();
}

// ─── Deduplication Helper ───────────────────────────────────────────────────

/**
 * Creates an alert only if no active alert with the same dedup key
 * exists within the cooldown window.
 */
async function _createAlertIfNotDuped(organizationId, alertData) {
    const dedupKey = `${organizationId}:${alertData.type}:${Math.floor(
        Date.now() / DEDUP_COOLDOWN_MS
    )}`;

    // System context: alert creation is triggered by internal denial tracker

    try {
        // Per-org DB: connection-scoped isolation
        const existing = await Alert.findOne({
            deduplicationKey: dedupKey,
        });
        if (existing) return existing;

        const alert = await Alert.create({
            ...alertData,
            deduplicationKey: dedupKey,
        });

        logger.warn(
            {
                type: alertData.type,
                severity: alertData.severity,
                orgId: organizationId,
            },
            `[SecurityAlerts] Alert created: ${alertData.type}`
        );

        return alert;
    } catch (err) {
        // E11000 duplicate key = dedup working as intended
        if (err.code === 11000) return null;
        logger.error({ err }, "[SecurityAlerts] Failed to create alert");
        return null;
    }
}

// ─── Frequency Helpers ──────────────────────────────────────────────────────

function _topN(entries, field, n) {
    const counts = {};
    for (const e of entries) {
        counts[e[field]] = (counts[e[field]] || 0) + 1;
    }
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([name, count]) => ({ name, count }));
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    evaluateDenialThresholds,
    recordPatientAccess,
    getAlerts,
    getAlertSummary,
    acknowledgeAlert,
    resolveAlert,
    THRESHOLDS,
};
