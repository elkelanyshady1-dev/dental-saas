/**
 * auditTimeline.controller.js
 * ═══════════════════════════════════════════════════════════════
 * Organization Plane — Audit Timeline HTTP Handlers
 *
 * Exposes audit trail data via REST endpoints for the org UI.
 * All endpoints are tenant-isolated (organizationId from JWT context).
 *
 * PLANE: Org only.
 *
 * @module modules/audit/controllers/auditTimeline.controller
 */

"use strict";

const auditTimelineService = require("../services/auditTimeline.service");
const {
  analyzeAuditLogs
} = require("../services/auditAnalyzer");
const {
  getViolations,
  getViolationStats
} = require("../../../core/security/governanceEngine");
const logger = require("../../../utils/logger");

/**
 * GET /api/v1/org/audit/entity/:entityId
 * Retrieve audit timeline for a specific entity (patient, appointment, etc.)
 *
 * Query params:
 *   - entityType (optional) — Filter by type (e.g., "Patient")
 *   - category (optional) — Filter by category (patient, appointment, treatment, etc.)
 *   - page (optional, default: 1)
 *   - limit (optional, default: 50, max: 100)
 */
async function getEntityTimeline(req, res) {
  try {
    const {
      entityId
    } = req.params;
    const {
      entityType,
      category,
      page = 1,
      limit = 50
    } = req.query;
    const result = await auditTimelineService.getEntityTimeline({
      entityId,
      regionCode: req.regionCode,
      entityType,
      category,
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10) || 50, 100)
    });
    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    logger.error({
      event: "AUDIT_TIMELINE_QUERY_FAILED",
      entityId: req.params.entityId,
      err: err.message
    }, "[AuditTimeline] Entity timeline query failed");
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve audit timeline"
      }
    });
  }
}

/**
 * GET /api/v1/org/audit/user/:userId
 * Retrieve activity history for a specific user.
 */
async function getUserActivity(req, res) {
  try {
    const {
      userId
    } = req.params;
    const {
      category,
      page = 1,
      limit = 50
    } = req.query;
    const result = await auditTimelineService.getUserActivity({
      userId,
      regionCode: req.regionCode,
      category,
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10) || 50, 100)
    });
    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    logger.error({
      event: "AUDIT_USER_ACTIVITY_FAILED",
      userId: req.params.userId,
      err: err.message
    }, "[AuditTimeline] User activity query failed");
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve user activity"
      }
    });
  }
}

/**
 * GET /api/v1/org/audit/timeline
 * Organization-wide audit trail with filters.
 */
async function getOrgTimeline(req, res) {
  try {
    const {
      category,
      action,
      search,
      from,
      to,
      page = 1,
      limit = 50
    } = req.query;
    const result = await auditTimelineService.getOrgTimeline({
      regionCode: req.regionCode,
      category,
      action,
      search,
      from,
      to,
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10) || 50, 100)
    });
    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    logger.error({
      event: "AUDIT_ORG_TIMELINE_FAILED",
      err: err.message
    }, "[AuditTimeline] Org timeline query failed");
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve audit timeline"
      }
    });
  }
}

/**
 * GET /api/v1/org/audit/stats
 * Aggregated audit statistics for the dashboard.
 */
async function getAuditStats(req, res) {
  try {
    const {
      days = 7
    } = req.query;
    const result = await auditTimelineService.getAuditStats({
      regionCode: req.regionCode,
      days: parseInt(days, 10) || 7
    });
    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    logger.error({
      event: "AUDIT_STATS_FAILED",
      err: err.message
    }, "[AuditTimeline] Stats query failed");
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve audit stats"
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 14 — Audit Intelligence + Export + Governance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/org/audit/alerts
 * Run anomaly detection on recent audit logs and return security alerts.
 *
 * Query params:
 *   - hours (optional, default: 24) — Lookback window in hours
 */
async function getAuditAlerts(req, res) {
  try {
    const hours = parseInt(req.query.hours, 10) || 24;
    const since = new Date();
    since.setHours(since.getHours() - hours);

    // Fetch recent logs for analysis
    const result = await auditTimelineService.getOrgTimeline({
      regionCode: req.regionCode,
      from: since.toISOString(),
      page: 1,
      limit: 1000 // Analysis needs a larger window
    });

    // Run intelligence engine
    const alerts = analyzeAuditLogs(result.logs, req.organizationId);
    return res.json({
      success: true,
      data: {
        alerts,
        alertCount: alerts.length,
        analysisWindow: {
          hours,
          since: since.toISOString()
        },
        logsAnalyzed: result.logs.length
      }
    });
  } catch (err) {
    logger.error({
      event: "AUDIT_ALERTS_FAILED",
      err: err.message
    }, "[AuditTimeline] Alerts query failed");
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to generate audit alerts"
      }
    });
  }
}

/**
 * GET /api/v1/org/audit/export
 * Export audit logs for legal/compliance purposes.
 *
 * Query params:
 *   - from (required) — Start date (ISO)
 *   - to (required) — End date (ISO)
 *   - category (optional) — Filter by category
 *   - format (optional, default: "json") — Export format
 *
 * Response: JSON array with complete audit records.
 * Content-Disposition header triggers browser download.
 */
async function exportAuditLogs(req, res) {
  try {
    const {
      from,
      to,
      category
    } = req.query;
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Query params 'from' and 'to' are required"
        }
      });
    }

    // Validate date range (max 90 days to prevent memory issues)
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const daysDiff = (toDate - fromDate) / (1000 * 60 * 60 * 24);
    if (daysDiff > 90) {
      return res.status(400).json({
        success: false,
        error: {
          code: "RANGE_TOO_LARGE",
          message: "Export range cannot exceed 90 days"
        }
      });
    }
    if (daysDiff < 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_RANGE",
          message: "'from' must be before 'to'"
        }
      });
    }

    // Fetch all logs in the date range (paginated internally)
    const allLogs = [];
    let page = 1;
    const batchSize = 500;
    while (true) {
      const batch = await auditTimelineService.getOrgTimeline({
        regionCode: req.regionCode,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        category,
        page,
        limit: batchSize
      });
      allLogs.push(...batch.logs);
      if (page >= batch.totalPages || batch.logs.length === 0) break;
      page++;

      // Safety limit: max 10,000 records per export
      if (allLogs.length >= 10000) break;
    }

    // Set download headers
    const filename = `audit_export_${req.organizationId}_${fromDate.toISOString().split("T")[0]}_to_${toDate.toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Log the export action for audit chain integrity
    logger.info({
      event: "AUDIT_EXPORT",
      organizationId: req.organizationId,
      userId: req.user?._id,
      recordCount: allLogs.length,
      dateRange: {
        from: fromDate.toISOString(),
        to: toDate.toISOString()
      }
    }, `[AuditTimeline] Audit export: ${allLogs.length} records`);
    return res.json({
      success: true,
      data: {
        exportedAt: new Date().toISOString(),
        dateRange: {
          from: fromDate.toISOString(),
          to: toDate.toISOString()
        },
        recordCount: allLogs.length,
        records: allLogs
      }
    });
  } catch (err) {
    logger.error({
      event: "AUDIT_EXPORT_FAILED",
      err: err.message
    }, "[AuditTimeline] Export failed");
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to export audit logs"
      }
    });
  }
}

/**
 * GET /api/v1/org/audit/governance
 * Real-time governance violation dashboard.
 *
 * Returns recent violations detected by the governance engine
 * and aggregate statistics.
 */
async function getGovernanceStatus(req, res) {
  try {
    const {
      rule,
      severity,
      limit = 50
    } = req.query;
    const violations = getViolations({
      rule,
      severity,
      limit: parseInt(limit, 10) || 50
    });
    const stats = getViolationStats();
    return res.json({
      success: true,
      data: {
        violations,
        stats
      }
    });
  } catch (err) {
    logger.error({
      event: "GOVERNANCE_STATUS_FAILED",
      err: err.message
    }, "[AuditTimeline] Governance status query failed");
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to retrieve governance status"
      }
    });
  }
}
module.exports = {
  getEntityTimeline,
  getUserActivity,
  getOrgTimeline,
  getAuditStats,
  getAuditAlerts,
  exportAuditLogs,
  getGovernanceStatus
};