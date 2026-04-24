/**
 * audit.dto.js — Audit Timeline DTO Builders
 *
 * Wraps audit service output in standard envelopes.
 * Audit data is already shaped by the service layer —
 * these builders enforce consistent response structure.
 *
 * PLANE: Org only.
 */

"use strict";

/**
 * buildAuditTimelineDTO — wraps timeline/activity query results.
 * The service returns { logs, totalPages, currentPage, totalLogs }.
 */
function buildAuditTimelineDTO(raw) {
  if (!raw) return {
    logs: [],
    totalPages: 0,
    currentPage: 1,
    totalLogs: 0
  };
  return {
    logs: Array.isArray(raw.logs) ? raw.logs : [],
    totalPages: raw.totalPages ?? 0,
    currentPage: raw.currentPage ?? 1,
    totalLogs: raw.totalLogs ?? 0
  };
}

/**
 * buildAuditStatsDTO — wraps aggregated stats.
 */
function buildAuditStatsDTO(raw) {
  if (!raw) return {};
  return {
    totalActions: raw.totalActions ?? 0,
    uniqueUsers: raw.uniqueUsers ?? 0,
    byCategory: raw.byCategory ?? {},
    byAction: raw.byAction ?? {},
    dailyTrend: Array.isArray(raw.dailyTrend) ? raw.dailyTrend : []
  };
}

/**
 * buildAuditAlertsDTO — wraps anomaly detection results.
 */
function buildAuditAlertsDTO({
  alerts,
  analysisWindow,
  logsAnalyzed
}) {
  return {
    alerts: Array.isArray(alerts) ? alerts : [],
    alertCount: Array.isArray(alerts) ? alerts.length : 0,
    analysisWindow: analysisWindow ?? {},
    logsAnalyzed: logsAnalyzed ?? 0
  };
}

/**
 * buildAuditExportDTO — wraps export data.
 */
function buildAuditExportDTO({
  records,
  dateRange,
  organizationId
}) {
  return {
    exportedAt: new Date().toISOString(),
    dateRange: dateRange ?? {},
    recordCount: Array.isArray(records) ? records.length : 0,
    records: Array.isArray(records) ? records : []
  };
}

/**
 * buildGovernanceStatusDTO — wraps governance violation data.
 */
function buildGovernanceStatusDTO({
  violations,
  stats
}) {
  return {
    violations: Array.isArray(violations) ? violations : [],
    stats: stats ?? {}
  };
}
module.exports = {
  buildAuditTimelineDTO,
  buildAuditStatsDTO,
  buildAuditAlertsDTO,
  buildAuditExportDTO,
  buildGovernanceStatusDTO
};