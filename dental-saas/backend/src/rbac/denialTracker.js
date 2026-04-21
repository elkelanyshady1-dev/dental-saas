/**
 * denialTracker.js — Policy Denial Metrics Store
 * v2.0 — Phase 6 cleanup (Redis persistence removed)
 *
 * Tracks per-endpoint and per-permission denial statistics for the
 * Security Monitoring Dashboard. Storage is per-process in-memory
 * (circular buffers + Maps) — Redis persistence across restarts was
 * dropped when Redis was eradicated in Phase 6. For multi-instance
 * deployments, each instance carries its own counters; aggregate via
 * the metrics collector rather than relying on this module.
 *
 * Metrics tracked:
 *   - denied_requests_per_endpoint
 *   - denied_requests_per_permission
 *   - denial_reasons breakdown
 *   - role distribution of denials
 *
 * PLANE: Org only.
 */

"use strict";

const logger = require("@utils/logger");

// ─── Denial Classification ──────────────────────────────────────────────────

/**
 * Classify a denial by its reason string.
 * Returns:
 *   "expected"  — ownership, branch scope, time-of-day rules (working as designed)
 *   "critical"  — entitlement, RBAC, escalation failures (investigate immediately)
 *   "unknown"   — unclassified reason (needs rule mapping)
 */
function classifyDenial(reason) {
    if (!reason || typeof reason !== "string") return "unknown";
    const r = reason.toLowerCase();

    // Expected denials — these are the security system working correctly
    if (r.includes("ownership") || r.includes("owner")) return "expected";
    if (r.includes("branch") || r.includes("branch_mismatch")) return "expected";
    if (r.includes("time") || r.includes("after_hours")) return "expected";
    if (r.includes("self_only") || r.includes("self-filter")) return "expected";

    // Critical denials — entitlement or privilege violations
    if (r.includes("entitlement") || r.includes("feature_disabled")) return "critical";
    if (r.includes("rbac") || r.includes("permission_denied")) return "critical";
    if (r.includes("escalation") || r.includes("admin")) return "critical";
    if (r.includes("subscription") || r.includes("plan")) return "critical";

    return "unknown";
}

// ─── In-Memory Store ───────────────────────────────────────────────────────

const _memoryStore = {
    byEndpoint: new Map(),
    byPermission: new Map(),
    byRole: new Map(),
    byType: new Map(), // expected | critical | unknown
    recentDenials: [], // Circular buffer of last 100 denials
};

const MAX_RECENT_DENIALS = 100;

// ─── Record Denial ─────────────────────────────────────────────────────────

/**
 * Record a policy denial event.
 *
 * @param {Object} denial
 * @param {string} denial.endpoint — e.g., "PUT /api/v1/org/patients/:id"
 * @param {string} denial.permission — e.g., "patients.update"
 * @param {string} denial.reason — denial reason from policy engine
 * @param {string} denial.userRole — role of the denied user
 * @param {string} denial.userId — user ID
 * @param {string} denial.organizationId — org ID
 * @param {boolean} [denial.isShadow=false] — whether this was a shadow-mode denial
 */
async function recordDenial(denial) {
    const {
        endpoint,
        permission,
        reason,
        userRole,
        userId,
        organizationId,
        isShadow = false,
    } = denial;

    const timestamp = new Date().toISOString();
    const type = classifyDenial(reason);

    // ── In-memory tracking ──
    _incrementMap(_memoryStore.byEndpoint, endpoint);
    _incrementMap(_memoryStore.byPermission, permission);
    _incrementMap(_memoryStore.byRole, userRole || "unknown");
    _incrementMap(_memoryStore.byType, type);

    // Circular buffer
    _memoryStore.recentDenials.push({
        endpoint,
        permission,
        reason,
        type,
        userRole,
        userId,
        organizationId,
        isShadow,
        timestamp,
    });

    if (_memoryStore.recentDenials.length > MAX_RECENT_DENIALS) {
        _memoryStore.recentDenials.shift();
    }

    // ── Phase 1+2: Evaluate alerting thresholds (fire-and-forget) ──
    try {
        const alertsService = require("../organization/security/securityAlerts.service");
        alertsService.evaluateDenialThresholds({ ...denial, type }).catch((err) => {
            logger.warn({ err: err.message }, "[DenialTracker] Alert evaluation failed");
        });
    } catch {
        // securityAlerts service not loaded yet — skip
    }
}

// ─── Read Denial Stats ─────────────────────────────────────────────────────

/**
 * Get denial statistics for the monitoring dashboard.
 *
 * @param {string} organizationId
 * @returns {Promise<Object>}
 */
async function getDenialStats(/* organizationId */) {
    return {
        topDeniedEndpoints: _mapToSorted(_memoryStore.byEndpoint),
        topDeniedPermissions: _mapToSorted(_memoryStore.byPermission),
        denialsByRole: Object.fromEntries(_memoryStore.byRole),
        denialsByType: {
            expected: _memoryStore.byType.get("expected") || 0,
            critical: _memoryStore.byType.get("critical") || 0,
            unknown: _memoryStore.byType.get("unknown") || 0,
        },
        recentDenials: [..._memoryStore.recentDenials].reverse().slice(0, 50),
        source: "memory",
    };
}

/**
 * Reset denial stats (for the current instance).
 */
async function resetDenialStats(/* organizationId */) {
    _memoryStore.byEndpoint.clear();
    _memoryStore.byPermission.clear();
    _memoryStore.byRole.clear();
    _memoryStore.byType.clear();
    _memoryStore.recentDenials.length = 0;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function _incrementMap(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
}

function _mapToSorted(map) {
    return [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, count]) => ({ name, count }));
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    recordDenial,
    getDenialStats,
    resetDenialStats,
    classifyDenial,
};
