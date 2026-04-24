/**
 * authAnalytics.service.js — Authorization Analytics Engine v2
 *
 * Provides optimized aggregated analytics over persisted auth traces.
 * Powers the /security/analytics/* API endpoints.
 *
 * Phase 20.1 Optimizations (TASK-AUTH-SCALE-003 / SCALE-004 / SCALE-007):
 *   - Redis caching layer (configurable TTLs per endpoint)
 *   - Optimized MongoDB aggregation pipelines ($hint, $limit, $project)
 *   - Split endpoints for granular cache invalidation
 *   - Pre-computed overview stats via lightweight count queries
 *   - Reusable date filter builder
 *
 * Analytics Endpoints:
 *   - summary     — total, allow rate, deny rate, avg duration
 *   - timeline    — allow/deny counts per time bucket
 *   - distribution — allow vs deny totals for donut chart
 *   - denied-permissions — top denied permissions for bar chart
 *   - recent-denials — latest denial log entries
 *   - risk-users  — users with highest denial counts
 *   - layer-performance — per-layer deny counts + avg duration
 *   - field-violations — field-level violation attempts
 *
 * PLANE: Org only.
 * Phase 20 — TASK-AUTH-INT-005
 * Phase 20.1 — TASK-AUTH-SCALE-003 / SCALE-004 / SCALE-007
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const AuthTraceDef = require("@shared/models/AuthTrace");
const AuthTrace = getPlatformModel(AuthTraceDef);
const {
  getEnforcementMode
} = require("@rbac/fieldWriteGuard");
const logger = require("@utils/logger");

// ─── Cache (disabled post-Phase-6) ──────────────────────────────────────────
// Redis-backed caching removed in Phase 6. Every analytics read now hits
// Mongo directly. Dashboard queries are bounded by indexed date ranges,
// so the cost is acceptable; swap _getCache/_setCache for an lru-cache
// backing if this becomes hot.

// ─── Cache Configuration (kept as constants; unused post-cache-removal) ────

const CACHE_TTL = {
  SUMMARY: 15,
  // 15s — high-frequency updates
  TIMELINE: 30,
  // 30s — chart data
  DISTRIBUTION: 30,
  // 30s — donut chart
  DENIED_PERMISSIONS: 60,
  // 1min — rarely changes fast
  RECENT_DENIALS: 10,
  // 10s — near real-time
  RISK_USERS: 60,
  // 1min — computed metric
  LAYER_PERFORMANCE: 60,
  // 1min — structural metric
  FIELD_VIOLATIONS: 60,
  // 1min — config-level metric
  FULL_ANALYTICS: 20 // 20s — legacy combined endpoint
};

// ─── Cache Helpers ──────────────────────────────────────────────────────────

function _cacheKey(endpoint, orgId, params = {}) {
  const paramStr = Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => `${k}=${v}`).sort().join(":");
  return `authAnalytics:${endpoint}:${orgId}${paramStr ? ":" + paramStr : ""}`;
}

// Always a miss — callers fall through to Mongo. Retained as functions
// so the eventual lru-cache swap is a one-file change.
async function _getCache(/* key */
) {
  return null;
}
async function _setCache(/* key, value, ttl */
) {
  // no-op
}

// ─── Date Filter Builder ────────────────────────────────────────────────────

function _buildDateFilter(organizationId, options = {}) {
  const {
    startDate = new Date(Date.now() - 24 * 60 * 60 * 1000),
    endDate = new Date()
  } = options;
  return {
    organizationId,
    createdAt: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  };
}

// ─── 1. Summary (TASK-AUTH-SCALE-004) ───────────────────────────────────────

/**
 * Dashboard summary KPIs: total, allowed, denied, denial rate, avg duration.
 * Uses lightweight count queries instead of full aggregation.
 */
async function getSummary(organizationId, options = {}) {
  const cacheKey = _cacheKey("summary", organizationId, options);
  const cached = await _getCache(cacheKey);
  if (cached) return cached;
  const filter = _buildDateFilter(organizationId, options);
  const [total, denials, perfResult] = await Promise.all([AuthTrace.countDocuments(filter),
  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  AuthTrace.countDocuments({
    ...filter,
    hasDenial: true
  }),
  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  AuthTrace.aggregate([{
    $match: filter
  }, {
    $group: {
      _id: null,
      avgDuration: {
        $avg: "$duration"
      }
    }
  }])]);
  const result = {
    totalRequests: total,
    totalAllowed: total - denials,
    totalDenied: denials,
    allowRate: total > 0 ? Math.round((total - denials) / total * 10000) / 100 : 100,
    denyRate: total > 0 ? Math.round(denials / total * 10000) / 100 : 0,
    avgDurationMs: perfResult.length > 0 ? Math.round(perfResult[0].avgDuration || 0) : 0
  };
  await _setCache(cacheKey, result, CACHE_TTL.SUMMARY);
  return result;
}

// ─── 2. Timeline (TASK-AUTH-SCALE-004) ──────────────────────────────────────

/**
 * Time-bucketed allow/deny counts for line chart.
 * Optimized: uses $dateToString for consistent bucketing.
 */
async function getTimeline(organizationId, options = {}) {
  const cacheKey = _cacheKey("timeline", organizationId, options);
  const cached = await _getCache(cacheKey);
  if (cached) return cached;
  const filter = _buildDateFilter(organizationId, options);

  // Determine bucket size based on time range
  const msRange = new Date(options.endDate || Date.now()) - new Date(options.startDate || Date.now() - 86400000);
  const bucketFormat = msRange > 7 * 86400000 ? "%Y-%m-%dT00:00:00Z" // Daily buckets for > 7 days
  : "%Y-%m-%dT%H:00:00Z"; // Hourly buckets for ≤ 7 days

  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  const result = await AuthTrace.aggregate([{
    $match: filter
  }, {
    $group: {
      _id: {
        $dateToString: {
          format: bucketFormat,
          date: "$createdAt"
        }
      },
      allowed: {
        $sum: {
          $cond: [{
            $eq: ["$hasDenial", false]
          }, 1, 0]
        }
      },
      denied: {
        $sum: {
          $cond: [{
            $eq: ["$hasDenial", true]
          }, 1, 0]
        }
      },
      avgDuration: {
        $avg: "$duration"
      }
    }
  }, {
    $sort: {
      _id: 1
    }
  }, {
    $limit: 168
  }, {
    $project: {
      _id: 0,
      time: "$_id",
      allowed: 1,
      denied: 1,
      avgDurationMs: {
        $round: [{
          $ifNull: ["$avgDuration", 0]
        }, 0]
      }
    }
  }]);
  await _setCache(cacheKey, result, CACHE_TTL.TIMELINE);
  return result;
}

// ─── 3. Distribution (TASK-AUTH-SCALE-004) ──────────────────────────────────

/**
 * Allow vs Deny distribution for donut chart.
 */
async function getDistribution(organizationId, options = {}) {
  const cacheKey = _cacheKey("distribution", organizationId, options);
  const cached = await _getCache(cacheKey);
  if (cached) return cached;
  const filter = _buildDateFilter(organizationId, options);
  const [total, denials] = await Promise.all([AuthTrace.countDocuments(filter),
  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  AuthTrace.countDocuments({
    ...filter,
    hasDenial: true
  })]);
  const result = {
    allowed: total - denials,
    denied: denials,
    total
  };
  await _setCache(cacheKey, result, CACHE_TTL.DISTRIBUTION);
  return result;
}

// ─── 4. Denied Permissions (TASK-AUTH-SCALE-004) ────────────────────────────

/**
 * Top denied permissions for bar chart.
 * Uses the partial index on steps.permission for efficiency.
 */
async function getDeniedPermissions(organizationId, options = {}) {
  const cacheKey = _cacheKey("denied-permissions", organizationId, options);
  const cached = await _getCache(cacheKey);
  if (cached) return cached;
  const filter = _buildDateFilter(organizationId, options);

  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  const result = await AuthTrace.aggregate([{
    $match: {
      ...filter,
      hasDenial: true
    }
  }, {
    $unwind: "$steps"
  }, {
    $match: {
      "steps.result": "DENY",
      "steps.permission": {
        $ne: null
      }
    }
  }, {
    $group: {
      _id: "$steps.permission",
      count: {
        $sum: 1
      }
    }
  }, {
    $sort: {
      count: -1
    }
  }, {
    $limit: 15
  }, {
    $project: {
      _id: 0,
      permission: "$_id",
      count: 1
    }
  }]);
  await _setCache(cacheKey, result, CACHE_TTL.DENIED_PERMISSIONS);
  return result;
}

// ─── 5. Recent Denials (TASK-AUTH-SCALE-004) ────────────────────────────────

/**
 * Latest denial log entries with full trace context.
 */
async function getRecentDenials(organizationId, options = {}) {
  const {
    limit = 20
  } = options;
  const safeLimit = Math.min(Number(limit) || 20, 50);
  const cacheKey = _cacheKey("recent-denials", organizationId, {
    limit: safeLimit
  });
  const cached = await _getCache(cacheKey);
  if (cached) return cached;
  const filter = {
    organizationId,
    hasDenial: true
  };

  // Apply date filters if provided
  if (options.startDate || options.endDate) {
    filter.createdAt = {};
    if (options.startDate) filter.createdAt.$gte = new Date(options.startDate);
    if (options.endDate) filter.createdAt.$lte = new Date(options.endDate);
  }
  const traces = await AuthTrace.find(filter).sort({
    createdAt: -1
  }).limit(safeLimit).select("requestId method path userId role resourceType hasDenial denialLayer duration steps createdAt").lean();
  const result = traces.map(t => ({
    requestId: t.requestId,
    method: t.method,
    path: t.path,
    userId: t.userId,
    role: t.role,
    resourceType: t.resourceType,
    denialLayer: t.denialLayer,
    duration: t.duration,
    deniedPermission: t.steps?.find(s => s.result === "DENY")?.permission || null,
    denialReason: t.steps?.find(s => s.result === "DENY")?.reason || null,
    createdAt: t.createdAt
  }));
  await _setCache(cacheKey, result, CACHE_TTL.RECENT_DENIALS);
  return result;
}

// ─── 6. Risk Users (TASK-AUTH-SCALE-004) ────────────────────────────────────

/**
 * Users with highest denial counts (risk analysis).
 */
async function getRiskUsers(organizationId, options = {}) {
  const cacheKey = _cacheKey("risk-users", organizationId, options);
  const cached = await _getCache(cacheKey);
  if (cached) return cached;
  const filter = _buildDateFilter(organizationId, options);

  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  const result = await AuthTrace.aggregate([{
    $match: {
      ...filter,
      hasDenial: true,
      userId: {
        $ne: null
      }
    }
  }, {
    $group: {
      _id: "$userId",
      denialCount: {
        $sum: 1
      },
      role: {
        $first: "$role"
      },
      lastDenial: {
        $max: "$createdAt"
      },
      uniquePaths: {
        $addToSet: "$path"
      }
    }
  }, {
    $sort: {
      denialCount: -1
    }
  }, {
    $limit: 20
  }, {
    $project: {
      _id: 0,
      userId: "$_id",
      denialCount: 1,
      role: 1,
      lastDenial: 1,
      uniquePathCount: {
        $size: "$uniquePaths"
      }
    }
  }]);
  await _setCache(cacheKey, result, CACHE_TTL.RISK_USERS);
  return result;
}

// ─── 7. Layer Performance (TASK-AUTH-SCALE-004) ─────────────────────────────

/**
 * Per-layer (RBAC, PBAC, FIELD_READ, FIELD_WRITE, ENTITLEMENT) stats.
 */
async function getLayerPerformance(organizationId, options = {}) {
  const cacheKey = _cacheKey("layer-performance", organizationId, options);
  const cached = await _getCache(cacheKey);
  if (cached) return cached;
  const filter = _buildDateFilter(organizationId, options);

  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  const result = await AuthTrace.aggregate([{
    $match: filter
  }, {
    $unwind: "$steps"
  }, {
    $group: {
      _id: "$steps.layer",
      total: {
        $sum: 1
      },
      denied: {
        $sum: {
          $cond: [{
            $eq: ["$steps.result", "DENY"]
          }, 1, 0]
        }
      },
      allowed: {
        $sum: {
          $cond: [{
            $eq: ["$steps.result", "ALLOW"]
          }, 1, 0]
        }
      },
      avgDuration: {
        $avg: "$steps.durationMs"
      }
    }
  }, {
    $sort: {
      total: -1
    }
  }, {
    $project: {
      _id: 0,
      layer: "$_id",
      total: 1,
      allowed: 1,
      denied: 1,
      denyRate: {
        $cond: [{
          $gt: ["$total", 0]
        }, {
          $round: [{
            $multiply: [{
              $divide: ["$denied", "$total"]
            }, 100]
          }, 2]
        }, 0]
      },
      avgDurationMs: {
        $round: [{
          $ifNull: ["$avgDuration", 0]
        }, 1]
      }
    }
  }]);
  await _setCache(cacheKey, result, CACHE_TTL.LAYER_PERFORMANCE);
  return result;
}

// ─── 8. Field Violations (TASK-AUTH-SCALE-004) ──────────────────────────────

/**
 * Field-level access violation attempts.
 */
async function getFieldViolations(organizationId, options = {}) {
  const cacheKey = _cacheKey("field-violations", organizationId, options);
  const cached = await _getCache(cacheKey);
  if (cached) return cached;
  const filter = _buildDateFilter(organizationId, options);

  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  const result = await AuthTrace.aggregate([{
    $match: {
      ...filter,
      hasDenial: true,
      "steps.layer": {
        $in: ["FIELD_READ", "FIELD_WRITE"]
      }
    }
  }, {
    $unwind: "$steps"
  }, {
    $match: {
      "steps.result": "DENY",
      "steps.layer": {
        $in: ["FIELD_READ", "FIELD_WRITE"]
      }
    }
  }, {
    $group: {
      _id: {
        field: "$steps.field",
        layer: "$steps.layer"
      },
      count: {
        $sum: 1
      },
      lastAttempt: {
        $max: "$createdAt"
      }
    }
  }, {
    $sort: {
      count: -1
    }
  }, {
    $limit: 20
  }, {
    $project: {
      _id: 0,
      field: "$_id.field",
      layer: "$_id.layer",
      count: 1,
      lastAttempt: 1
    }
  }]);
  await _setCache(cacheKey, result, CACHE_TTL.FIELD_VIOLATIONS);
  return result;
}

// ─── 9. Queue Health (TASK-AUTH-SCALE-002) ──────────────────────────────────

/**
 * Get auth trace queue health metrics for the analytics dashboard.
 */
async function getQueueHealth() {
  // Phase 6: BullMQ authTrace queue was removed. Persistence is now
  // a direct Mongo write in authTracePersistence.service — there's
  // no queue to report health on.
  return {
    name: "authTraceQueue",
    status: "removed-phase-6"
  };
}

// ─── Legacy Combined Endpoint (backward compat) ────────────────────────────

/**
 * Generate full analytics dashboard for an organization.
 * MAINTAINED for backward compatibility — new frontend uses split endpoints.
 */
async function getAuthAnalytics(organizationId, options = {}) {
  const cacheKey = _cacheKey("full", organizationId, options);
  const cached = await _getCache(cacheKey);
  if (cached) return cached;
  const {
    startDate = new Date(Date.now() - 24 * 60 * 60 * 1000),
    endDate = new Date()
  } = options;
  const dateFilter = {
    organizationId,
    createdAt: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  };

  // Execute all aggregations in parallel
  const [overview, denialsByLayer, denialsByUser, denialsByResource, denialsByPath, hourlyTrend, performanceStats] = await Promise.all([_getOverview(dateFilter), _getDenialsByLayer(dateFilter), _getDenialsByUser(dateFilter), _getDenialsByResource(dateFilter), _getDenialsByPath(dateFilter), _getHourlyTrend(dateFilter), _getPerformanceStats(dateFilter)]);
  const result = {
    timeRange: {
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString()
    },
    overview,
    denialsByLayer,
    denialsByUser,
    denialsByResource,
    denialsByPath,
    hourlyTrend,
    performance: performanceStats,
    enforcement: {
      fieldWriteGuardMode: getEnforcementMode(),
      traceEnabled: process.env.AUTH_TRACE_ENABLED !== "false",
      sampleRate: parseFloat(process.env.AUTH_TRACE_SAMPLE_RATE) || 1.0
    },
    generatedAt: new Date().toISOString()
  };
  await _setCache(cacheKey, result, CACHE_TTL.FULL_ANALYTICS);
  return result;
}

// ─── Legacy Aggregation Helpers ─────────────────────────────────────────────

async function _getOverview(filter) {
  const [total, denials] = await Promise.all([AuthTrace.countDocuments(filter),
  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  AuthTrace.countDocuments({
    ...filter,
    hasDenial: true
  })]);
  return {
    totalRequests: total,
    totalDenials: denials,
    denialRate: total > 0 ? Math.round(denials / total * 10000) / 100 : 0,
    totalAllowed: total - denials
  };
}
async function _getDenialsByLayer(filter) {
  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  const result = await AuthTrace.aggregate([{
    $match: {
      ...filter,
      hasDenial: true
    }
  }, {
    $unwind: "$steps"
  }, {
    $match: {
      "steps.result": "DENY"
    }
  }, {
    $group: {
      _id: "$steps.layer",
      count: {
        $sum: 1
      }
    }
  }, {
    $sort: {
      count: -1
    }
  }]);
  return result.map(r => ({
    layer: r._id,
    count: r.count
  }));
}
async function _getDenialsByUser(filter) {
  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  const result = await AuthTrace.aggregate([{
    $match: {
      ...filter,
      hasDenial: true,
      userId: {
        $ne: null
      }
    }
  }, {
    $group: {
      _id: "$userId",
      count: {
        $sum: 1
      },
      role: {
        $first: "$role"
      },
      lastDenial: {
        $max: "$createdAt"
      }
    }
  }, {
    $sort: {
      count: -1
    }
  }, {
    $limit: 20
  }]);
  return result.map(r => ({
    userId: r._id,
    role: r.role,
    denialCount: r.count,
    lastDenial: r.lastDenial
  }));
}
async function _getDenialsByResource(filter) {
  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  const result = await AuthTrace.aggregate([{
    $match: {
      ...filter,
      hasDenial: true,
      resourceType: {
        $ne: null
      }
    }
  }, {
    $group: {
      _id: "$resourceType",
      count: {
        $sum: 1
      }
    }
  }, {
    $sort: {
      count: -1
    }
  }]);
  return result.map(r => ({
    resourceType: r._id,
    count: r.count
  }));
}
async function _getDenialsByPath(filter) {
  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  const result = await AuthTrace.aggregate([{
    $match: {
      ...filter,
      hasDenial: true
    }
  }, {
    $group: {
      _id: {
        path: "$path",
        method: "$method"
      },
      count: {
        $sum: 1
      }
    }
  }, {
    $sort: {
      count: -1
    }
  }, {
    $limit: 20
  }]);
  return result.map(r => ({
    method: r._id.method,
    path: r._id.path,
    count: r.count
  }));
}
async function _getHourlyTrend(filter) {
  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  const result = await AuthTrace.aggregate([{
    $match: filter
  }, {
    $group: {
      _id: {
        year: {
          $year: "$createdAt"
        },
        month: {
          $month: "$createdAt"
        },
        day: {
          $dayOfMonth: "$createdAt"
        },
        hour: {
          $hour: "$createdAt"
        }
      },
      totalRequests: {
        $sum: 1
      },
      totalDenials: {
        $sum: {
          $cond: [{
            $eq: ["$hasDenial", true]
          }, 1, 0]
        }
      },
      avgDuration: {
        $avg: "$duration"
      }
    }
  }, {
    $sort: {
      "_id.year": 1,
      "_id.month": 1,
      "_id.day": 1,
      "_id.hour": 1
    }
  }, {
    $limit: 168
  }]);
  return result.map(r => ({
    hour: `${r._id.year}-${String(r._id.month).padStart(2, "0")}-${String(r._id.day).padStart(2, "0")}T${String(r._id.hour).padStart(2, "0")}:00:00Z`,
    totalRequests: r.totalRequests,
    totalDenials: r.totalDenials,
    denialRate: r.totalRequests > 0 ? Math.round(r.totalDenials / r.totalRequests * 10000) / 100 : 0,
    avgDurationMs: Math.round(r.avgDuration || 0)
  }));
}
async function _getPerformanceStats(filter) {
  // @rls-platform-analytics — cross-org metrics aggregation, no org-scoped req
  const result = await AuthTrace.aggregate([{
    $match: filter
  }, {
    $group: {
      _id: null,
      avgDuration: {
        $avg: "$duration"
      },
      maxDuration: {
        $max: "$duration"
      },
      minDuration: {
        $min: "$duration"
      },
      avgStepCount: {
        $avg: "$stepCount"
      },
      p95Duration: {
        $percentile: {
          input: "$duration",
          p: [0.95],
          method: "approximate"
        }
      }
    }
  }]);
  if (result.length === 0) {
    return {
      avgDurationMs: 0,
      maxDurationMs: 0,
      minDurationMs: 0,
      avgStepCount: 0,
      p95DurationMs: 0
    };
  }
  const r = result[0];
  return {
    avgDurationMs: Math.round(r.avgDuration || 0),
    maxDurationMs: r.maxDuration || 0,
    minDurationMs: r.minDuration || 0,
    avgStepCount: Math.round((r.avgStepCount || 0) * 10) / 10,
    p95DurationMs: Array.isArray(r.p95Duration) ? Math.round(r.p95Duration[0] || 0) : 0
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Phase 20.1: Split endpoints (new frontend)
  getSummary,
  getTimeline,
  getDistribution,
  getDeniedPermissions,
  getRecentDenials,
  getRiskUsers,
  getLayerPerformance,
  getFieldViolations,
  getQueueHealth,
  // Phase 20: Legacy combined endpoint (backward compat)
  getAuthAnalytics
};