/**
 * denialTracker.js — Policy Denial Metrics Store
 *
 * Tracks per-endpoint and per-permission denial statistics for the
 * Security Monitoring Dashboard. Stores both in-memory (for fast reads)
 * and in Redis (for persistence across restarts).
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

// ─── Redis Client ───────────────────────────────────────────────────────────

let redis;
let _hasRedis = false;

try {
    redis = require("@infra/redis/redisClient");
    if (redis) {
        _hasRedis = redis.status === "ready";
        redis.on("ready", () => { _hasRedis = true; });
        redis.on("error", () => { _hasRedis = false; });
        redis.on("close", () => { _hasRedis = false; });
    }
} catch {
    logger.warn("[DenialTracker] Redis unavailable — in-memory tracking only");
}

// ─── Constants ──────────────────────────────────────────────────────────────

const REDIS_PREFIX = "security:denials";
const REDIS_TTL = 86400; // 24 hours

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

// ─── In-Memory Fallback Store ───────────────────────────────────────────────

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

    // ── Redis persistence (fire-and-forget) ──
    if (_hasRedis) {
        try {
            const orgKey = `${REDIS_PREFIX}:${organizationId}`;
            const pipeline = redis.pipeline();

            // Increment counters
            pipeline.hincrby(`${orgKey}:endpoints`, endpoint, 1);
            pipeline.expire(`${orgKey}:endpoints`, REDIS_TTL);

            pipeline.hincrby(`${orgKey}:permissions`, permission, 1);
            pipeline.expire(`${orgKey}:permissions`, REDIS_TTL);

            pipeline.hincrby(`${orgKey}:roles`, userRole || "unknown", 1);
            pipeline.expire(`${orgKey}:roles`, REDIS_TTL);

            // Store recent denial in sorted set (scored by timestamp)
            // Track type breakdown
            pipeline.hincrby(`${orgKey}:types`, type, 1);
            pipeline.expire(`${orgKey}:types`, REDIS_TTL);

            pipeline.zadd(`${orgKey}:recent`, Date.now(), JSON.stringify({
                endpoint,
                permission,
                reason,
                type,
                userRole,
                isShadow,
                timestamp,
            }));
            // Keep only last 200 entries
            pipeline.zremrangebyrank(`${orgKey}:recent`, 0, -201);
            pipeline.expire(`${orgKey}:recent`, REDIS_TTL);

            await pipeline.exec();
        } catch (err) {
            logger.warn({ err: err.message }, "[DenialTracker] Redis write failed");
        }
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
async function getDenialStats(organizationId) {
    // Try Redis first
    if (_hasRedis) {
        try {
            const orgKey = `${REDIS_PREFIX}:${organizationId}`;
            const [endpoints, permissions, roles, types, recent] = await Promise.all([
                redis.hgetall(`${orgKey}:endpoints`),
                redis.hgetall(`${orgKey}:permissions`),
                redis.hgetall(`${orgKey}:roles`),
                redis.hgetall(`${orgKey}:types`),
                redis.zrevrange(`${orgKey}:recent`, 0, 49, "WITHSCORES"),
            ]);

            return {
                topDeniedEndpoints: _sortByCount(endpoints || {}),
                topDeniedPermissions: _sortByCount(permissions || {}),
                denialsByRole: roles || {},
                denialsByType: _parseTypeCounts(types || {}),
                recentDenials: _parseRecentFromRedis(recent || []),
                source: "redis",
            };
        } catch (err) {
            logger.warn({ err: err.message }, "[DenialTracker] Redis read failed — falling back to memory");
        }
    }

    // Fallback to in-memory
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
 * Reset denial stats for an organization.
 * @param {string} organizationId
 */
async function resetDenialStats(organizationId) {
    // Clear memory
    _memoryStore.byEndpoint.clear();
    _memoryStore.byPermission.clear();
    _memoryStore.byRole.clear();
    _memoryStore.byType.clear();
    _memoryStore.recentDenials.length = 0;

    // Clear Redis
    if (_hasRedis) {
        try {
            const orgKey = `${REDIS_PREFIX}:${organizationId}`;
            await redis.del(
                `${orgKey}:endpoints`,
                `${orgKey}:permissions`,
                `${orgKey}:roles`,
                `${orgKey}:types`,
                `${orgKey}:recent`
            );
        } catch (err) {
            logger.warn({ err: err.message }, "[DenialTracker] Redis reset failed");
        }
    }
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

function _sortByCount(hashObj) {
    return Object.entries(hashObj)
        .map(([name, count]) => ({ name, count: parseInt(count, 10) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
}

function _parseRecentFromRedis(arr) {
    const results = [];
    for (let i = 0; i < arr.length; i += 2) {
        try {
            results.push(JSON.parse(arr[i]));
        } catch {
            // Skip malformed entries
        }
    }
    return results;
}

function _parseTypeCounts(hashObj) {
    return {
        expected: parseInt(hashObj.expected || 0, 10),
        critical: parseInt(hashObj.critical || 0, 10),
        unknown: parseInt(hashObj.unknown || 0, 10),
    };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    recordDenial,
    getDenialStats,
    resetDenialStats,
    classifyDenial,
};
