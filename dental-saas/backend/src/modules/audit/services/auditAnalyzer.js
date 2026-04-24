/**
 * auditAnalyzer.js
 * ═══════════════════════════════════════════════════════════════
 * Organization Plane — Audit Intelligence Engine
 *
 * Transforms raw audit logs into actionable security alerts.
 * Runs anomaly detection heuristics against audit data windows
 * and emits structured alert objects.
 *
 * ── DETECTION RULES ─────────────────────────────────────────────
 *
 *   1. EXCESSIVE_MUTATIONS     — Too many edits to a single entity
 *   2. BULK_DELETE_DETECTED    — Mass deletion pattern
 *   3. CROSS_BRANCH_ACCESS     — User accessing data outside assigned branches
 *   4. OFF_HOURS_ACTIVITY      — Critical mutations outside business hours
 *   5. RAPID_FIRE_REQUESTS     — Rate anomaly (many actions in short window)
 *   6. PERMISSION_DENIAL_SPIKE — Unusual number of denied requests
 *   7. SENSITIVE_DATA_ACCESS   — Financial/clinical data access patterns
 *   8. ACCOUNT_TAKEOVER_RISK   — Failed login + successful access pattern
 *
 * ── ALERT SEVERITY ──────────────────────────────────────────────
 *
 *   CRITICAL  — Requires immediate investigation
 *   HIGH      — Should be reviewed within 24 hours
 *   MEDIUM    — Monitor for escalation
 *   LOW       — Informational anomaly
 *
 * PLANE: Org only.
 *
 * @module modules/audit/services/auditAnalyzer
 */

"use strict";

const logger = require("../../../utils/logger");

// ─── Thresholds (configurable per deployment) ───────────────────────────────

const THRESHOLDS = {
  // Max entity edits in a time window before flagging
  EXCESSIVE_EDITS: 20,
  EXCESSIVE_EDITS_WINDOW_MINUTES: 60,
  // Max deletes in a time window before flagging
  BULK_DELETE_COUNT: 5,
  BULK_DELETE_WINDOW_MINUTES: 30,
  // Max actions from one user in a short window
  RAPID_FIRE_COUNT: 50,
  RAPID_FIRE_WINDOW_MINUTES: 5,
  // Max permission denials before flagging
  DENIAL_SPIKE_COUNT: 10,
  DENIAL_SPIKE_WINDOW_MINUTES: 15,
  // Business hours (24h format, UTC by default)
  BUSINESS_HOURS_START: 6,
  // 6:00 AM
  BUSINESS_HOURS_END: 23 // 11:00 PM
};

// ─── Alert Types ────────────────────────────────────────────────────────────

const ALERT_TYPES = {
  EXCESSIVE_MUTATIONS: "EXCESSIVE_MUTATIONS",
  BULK_DELETE_DETECTED: "BULK_DELETE_DETECTED",
  CROSS_BRANCH_ACCESS: "CROSS_BRANCH_ACCESS",
  OFF_HOURS_ACTIVITY: "OFF_HOURS_ACTIVITY",
  RAPID_FIRE_REQUESTS: "RAPID_FIRE_REQUESTS",
  PERMISSION_DENIAL_SPIKE: "PERMISSION_DENIAL_SPIKE",
  SENSITIVE_DATA_ACCESS: "SENSITIVE_DATA_ACCESS"
};
const SEVERITY = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
};

/**
 * Create a structured alert object.
 * @param {Object} params
 * @returns {Object}
 */
function createAlert({
  type,
  severity,
  message,
  details,
  actorId,
  organizationId
}) {
  return {
    type,
    severity,
    message,
    details: details || {},
    actorId: actorId || null,
    detectedAt: new Date().toISOString()
  };
}

// ─── Detection Rules ────────────────────────────────────────────────────────

/**
 * Rule 1: Excessive mutations to a single entity
 */
function detectExcessiveMutations(logs, organizationId) {
  const alerts = [];
  const entityEditCounts = {};
  const updateActions = logs.filter(l => l.action?.endsWith("_UPDATED") || l.action?.endsWith("_CREATED"));
  for (const log of updateActions) {
    const key = `${log.entityType}:${log.entityId}`;
    if (!entityEditCounts[key]) entityEditCounts[key] = [];
    entityEditCounts[key].push(log);
  }
  for (const [key, edits] of Object.entries(entityEditCounts)) {
    if (edits.length >= THRESHOLDS.EXCESSIVE_EDITS) {
      const [entityType, entityId] = key.split(":");
      alerts.push(createAlert({
        type: ALERT_TYPES.EXCESSIVE_MUTATIONS,
        severity: SEVERITY.HIGH,
        message: `Excessive edits detected: ${edits.length} mutations on ${entityType} (${entityId})`,
        details: {
          entityType,
          entityId,
          editCount: edits.length,
          actors: [...new Set(edits.map(e => e.actorId?.toString()))],
          timeSpan: {
            first: edits[edits.length - 1]?.createdAt,
            last: edits[0]?.createdAt
          }
        }
      }));
    }
  }
  return alerts;
}

/**
 * Rule 2: Bulk deletion pattern
 */
function detectBulkDeletes(logs, organizationId) {
  const alerts = [];
  const deletesByUser = {};
  const deleteActions = logs.filter(l => l.action?.endsWith("_DELETED"));
  for (const log of deleteActions) {
    const actorKey = log.actorId?.toString();
    if (!actorKey) continue;
    if (!deletesByUser[actorKey]) deletesByUser[actorKey] = [];
    deletesByUser[actorKey].push(log);
  }
  for (const [actorId, deletes] of Object.entries(deletesByUser)) {
    if (deletes.length >= THRESHOLDS.BULK_DELETE_COUNT) {
      alerts.push(createAlert({
        type: ALERT_TYPES.BULK_DELETE_DETECTED,
        severity: SEVERITY.CRITICAL,
        message: `Bulk deletion detected: ${deletes.length} deletions by user ${actorId}`,
        details: {
          deleteCount: deletes.length,
          entities: deletes.map(d => ({
            entityType: d.entityType,
            entityId: d.entityId?.toString(),
            action: d.action
          }))
        },
        actorId
      }));
    }
  }
  return alerts;
}

/**
 * Rule 3: Cross-branch access attempts
 */
function detectCrossBranchAccess(logs, organizationId) {
  const alerts = [];
  for (const log of logs) {
    // Look for cross-branch indicators in metadata or details
    const isCrossBranch = log.details?.crossBranch === true || log.details?.changes?.crossBranch === true || log.action === "ORG_PERMISSION_DENIED" && log.details?.reason?.includes("branch");
    if (isCrossBranch) {
      alerts.push(createAlert({
        type: ALERT_TYPES.CROSS_BRANCH_ACCESS,
        severity: SEVERITY.HIGH,
        message: `Cross-branch access detected for user ${log.actorId}`,
        details: {
          action: log.action,
          requestedBranch: log.details?.requestedBranch || log.branchId,
          path: log.details?.path
        },
        actorId: log.actorId?.toString()
      }));
    }
  }
  return alerts;
}

/**
 * Rule 4: Off-hours critical activity
 */
function detectOffHoursActivity(logs, organizationId) {
  const alerts = [];
  const criticalActions = ["_DELETED", "_CREATED", "PASSWORD_CHANGED", "ROLE_UPDATED"];
  for (const log of logs) {
    const isCritical = criticalActions.some(suffix => log.action?.endsWith(suffix) || log.action === suffix);
    if (!isCritical) continue;
    const hour = new Date(log.createdAt).getUTCHours();
    if (hour < THRESHOLDS.BUSINESS_HOURS_START || hour >= THRESHOLDS.BUSINESS_HOURS_END) {
      alerts.push(createAlert({
        type: ALERT_TYPES.OFF_HOURS_ACTIVITY,
        severity: SEVERITY.MEDIUM,
        message: `Critical action "${log.action}" performed outside business hours (${hour}:00 UTC)`,
        details: {
          action: log.action,
          hour,
          entityType: log.entityType,
          entityId: log.entityId?.toString()
        },
        actorId: log.actorId?.toString()
      }));
    }
  }
  return alerts;
}

/**
 * Rule 5: Rapid-fire requests (possible bot/script)
 */
function detectRapidFire(logs, organizationId) {
  const alerts = [];
  const actionsByUser = {};
  for (const log of logs) {
    const actorKey = log.actorId?.toString();
    if (!actorKey) continue;
    if (!actionsByUser[actorKey]) actionsByUser[actorKey] = [];
    actionsByUser[actorKey].push(log);
  }
  for (const [actorId, actions] of Object.entries(actionsByUser)) {
    if (actions.length >= THRESHOLDS.RAPID_FIRE_COUNT) {
      // Check time window
      const newest = new Date(actions[0]?.createdAt);
      const oldest = new Date(actions[actions.length - 1]?.createdAt);
      const minuteSpan = (newest - oldest) / (1000 * 60);
      if (minuteSpan <= THRESHOLDS.RAPID_FIRE_WINDOW_MINUTES) {
        alerts.push(createAlert({
          type: ALERT_TYPES.RAPID_FIRE_REQUESTS,
          severity: SEVERITY.HIGH,
          message: `Rapid-fire activity: ${actions.length} actions in ${Math.round(minuteSpan)} minutes by user ${actorId}`,
          details: {
            actionCount: actions.length,
            minuteSpan: Math.round(minuteSpan),
            topActions: Object.entries(actions.reduce((acc, a) => {
              acc[a.action] = (acc[a.action] || 0) + 1;
              return acc;
            }, {})).sort(([, a], [, b]) => b - a).slice(0, 5)
          },
          actorId
        }));
      }
    }
  }
  return alerts;
}

/**
 * Rule 6: Permission denial spike
 */
function detectDenialSpike(logs, organizationId) {
  const alerts = [];
  const denialActions = ["ORG_PERMISSION_DENIED", "CAPABILITY_DENIED", "ENTITLEMENT_DENIED"];
  const denials = logs.filter(l => denialActions.includes(l.action));
  if (denials.length >= THRESHOLDS.DENIAL_SPIKE_COUNT) {
    const denialsByUser = {};
    for (const d of denials) {
      const key = d.actorId?.toString() || "unknown";
      if (!denialsByUser[key]) denialsByUser[key] = 0;
      denialsByUser[key]++;
    }
    alerts.push(createAlert({
      type: ALERT_TYPES.PERMISSION_DENIAL_SPIKE,
      severity: SEVERITY.HIGH,
      message: `Permission denial spike: ${denials.length} denied requests detected`,
      details: {
        totalDenials: denials.length,
        byUser: denialsByUser,
        deniedPermissions: [...new Set(denials.map(d => d.details?.permission))].filter(Boolean)
      }
    }));
  }
  return alerts;
}

/**
 * Rule 7: Sensitive data access patterns (financial/clinical)
 */
function detectSensitiveAccess(logs, organizationId) {
  const alerts = [];
  const sensitivePatterns = ["INVOICE_CREATED", "PAYMENT_CREATED", "PAYMENT_REFUNDED", "CLINICAL_NOTE_ADDED", "PRESCRIPTION_CREATED"];
  const sensitiveAccess = logs.filter(l => sensitivePatterns.includes(l.action));
  const uniqueActors = new Set(sensitiveAccess.map(l => l.actorId?.toString()));

  // Only alert if unusual volume from a single user
  for (const actorId of uniqueActors) {
    const actorActions = sensitiveAccess.filter(l => l.actorId?.toString() === actorId);
    if (actorActions.length >= 15) {
      alerts.push(createAlert({
        type: ALERT_TYPES.SENSITIVE_DATA_ACCESS,
        severity: SEVERITY.MEDIUM,
        message: `High-volume sensitive data operations: ${actorActions.length} financial/clinical actions by user ${actorId}`,
        details: {
          actionCount: actorActions.length,
          actions: [...new Set(actorActions.map(a => a.action))]
        },
        actorId
      }));
    }
  }
  return alerts;
}

// ─── Main Analyzer ──────────────────────────────────────────────────────────

/**
 * analyzeAuditLogs — Run all detection rules against a set of audit logs.
 *
 * @param {Array<Object>} logs — Audit log entries (should be pre-filtered by time window)
 * @param {string} organizationId — Tenant ID
 * @returns {Array<Object>} alerts — Sorted by severity (critical first)
 */
function analyzeAuditLogs(logs, organizationId) {
  if (!logs || logs.length === 0) return [];
  try {
    const alerts = [...detectExcessiveMutations(logs, organizationId), ...detectBulkDeletes(logs, organizationId), ...detectCrossBranchAccess(logs, organizationId), ...detectOffHoursActivity(logs, organizationId), ...detectRapidFire(logs, organizationId), ...detectDenialSpike(logs, organizationId), ...detectSensitiveAccess(logs, organizationId)];

    // Sort by severity: critical → high → medium → low
    const severityOrder = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3
    };
    alerts.sort((a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99));
    if (alerts.length > 0) {
      logger.info({
        event: "AUDIT_INTELLIGENCE_ALERTS",
        alertCount: alerts.length,
        organizationId,
        severities: alerts.reduce((acc, a) => {
          acc[a.severity] = (acc[a.severity] || 0) + 1;
          return acc;
        }, {})
      }, `[AuditAnalyzer] Generated ${alerts.length} alerts for org ${organizationId}`);
    }
    return alerts;
  } catch (err) {
    logger.error({
      event: "AUDIT_ANALYZER_ERROR",
      organizationId,
      err: err.message
    }, "[AuditAnalyzer] Analysis failed");
    return [];
  }
}
module.exports = {
  analyzeAuditLogs,
  THRESHOLDS,
  ALERT_TYPES,
  SEVERITY,
  // Exported for testing individual rules
  _rules: {
    detectExcessiveMutations,
    detectBulkDeletes,
    detectCrossBranchAccess,
    detectOffHoursActivity,
    detectRapidFire,
    detectDenialSpike,
    detectSensitiveAccess
  }
};