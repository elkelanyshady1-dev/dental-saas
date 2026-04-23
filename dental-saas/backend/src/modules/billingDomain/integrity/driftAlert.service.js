/**
 * driftAlert.service.js — Financial Drift Alert System
 * Billing Domain — Ledger Hardening
 *
 * Monitors reconciliation results and triggers alerts when
 * financial drift is detected between the ledger and source data.
 *
 * ALERT ACTIONS:
 * 1. Log critical error (always)
 * 2. Emit domain event (for subscribers)
 * 3. Create persistent alert record (for dashboard)
 * 4. Future: Send notification (email/Slack)
 *
 * PLANE: Org only.
 * Phase 3.2 — Connection-aware model resolution via getModel.
 *
 * SECURITY: Queries use secureModel + signed system context (Wave 7 RLS).
 */

"use strict";

const mongoose = require("mongoose");
const eventBus = require("@core/eventBus");
const logger = require("@utils/logger");

// ─── Alert Model (embedded, lightweight) ────────────────────────────────────

const driftAlertSchema = new mongoose.Schema({
  severity: {
    type: String,
    required: true,
    enum: ["warning", "critical", "fatal"]
  },
  type: {
    type: String,
    required: true,
    enum: ["account_discrepancy", "missing_journal_entry", "duplicate_journal_entry", "unbalanced_entry", "retry_exhausted"]
  },
  account: {
    type: String
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ["open", "acknowledged", "resolved"],
    default: "open"
  },
  resolvedAt: {
    type: Date
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});
driftAlertSchema.index({
  status: 1,
  createdAt: -1
});
driftAlertSchema.index({
  type: 1,
  status: 1
});
const driftAlertModelName = "DriftAlert";

// Canonical model definition for getModel compatibility
const DriftAlertDef = {
  modelName: driftAlertModelName,
  schema: driftAlertSchema,
  default: mongoose.models[driftAlertModelName] || mongoose.model(driftAlertModelName, driftAlertSchema)
};
const getModel = require("@core/db/getModel");

// ─── Strict Per-Org Model Resolvers (Phase 3.3) ─────────────────────────────
function _getSecureDriftAlert(connection) {
  if (!connection) throw new Error("[DriftAlertService] connection is REQUIRED — per-org mode does not allow fallback");
  return getModel(connection, DriftAlertDef);
}
function _getDriftAlert(connection) {
  if (!connection) throw new Error("[DriftAlertService] connection is REQUIRED — per-org mode does not allow fallback");
  return getModel(connection, DriftAlertDef);
}

// ─── Alert Processing ───────────────────────────────────────────────────────

/**
 * Process reconciliation report and raise alerts for any discrepancies.
 *
 * @param {Object} report — output from reconciliation.service.reconcileOrganization()
 * @returns {Promise<{alertsCreated: number}>}
 */
async function processReconciliationReport(report) {
  if (report.status === "balanced") {
    return {
      alertsCreated: 0
    };
  }
  let alertsCreated = 0;

  // Account discrepancies
  for (const disc of report.discrepancies) {
    const severity = classifySeverity(disc.diffMinor);
    await createAlert({
      severity,
      type: "account_discrepancy",
      account: disc.account,
      details: {
        label: disc.label,
        ledgerMinor: disc.ledgerMinor,
        sourceMinor: disc.sourceMinor,
        diffMinor: disc.diffMinor,
        diff: disc.diff,
        reconciledAt: report.timestamp
      }
    });
    alertsCreated++;
  }

  // Coverage gaps (missing journal entries)
  for (const gap of report.coverageGaps) {
    await createAlert({
      severity: "critical",
      type: "missing_journal_entry",
      details: {
        sourceType: gap.sourceType,
        sourceId: gap.sourceId,
        amountMinor: gap.amountMinor,
        createdAt: gap.createdAt,
        reconciledAt: report.timestamp
      }
    });
    alertsCreated++;
  }
  logger.error({
    organizationId: report.organizationId,
    alertsCreated,
    discrepancies: report.discrepancies.length,
    coverageGaps: report.coverageGaps.length
  }, "[DriftAlert] ⚠ Financial drift alerts created");
  return {
    alertsCreated
  };
}

// ─── Alert Creation ─────────────────────────────────────────────────────────

/**
 * Create a drift alert and emit an event.
 * Deduplicates: won't create another open alert for the same org+type+account.
 */
async function createAlert({
  organizationId,
  severity,
  type,
  account,
  details,
  connection
}) {
  // Deduplicate: check for existing open alert of same type
  const existing = await _getSecureDriftAlert(connection).findOne({
    type,
    account: account || null,
    status: "open"
  });
  if (existing) {
    // Update details with latest data
    existing.details = {
      ...existing.details,
      ...details,
      updatedCount: (existing.details?.updatedCount || 0) + 1
    };
    await existing.save();
    return existing;
  }

  // Create new alert (organizationId explicitly provided, no req context)
  const DriftAlert = _getDriftAlert(connection);
  const alert = await DriftAlert.create({
    severity,
    type,
    account,
    details
  });

  // Emit event for downstream listeners (future: notification service)
  eventBus.emit("financial.drift.detected", {
    alertId: alert._id,
    severity,
    type,
    account,
    details
  });
  return alert;
}

// ─── Alert for Retry Exhaustion ─────────────────────────────────────────────

/**
 * Raise alert when a journal retry job is exhausted (all attempts failed).
 *
 * @param {Object} retryJob — JournalRetry document in "dead" status
 */
async function alertRetryExhausted(retryJob) {
  return createAlert({
    severity: "fatal",
    type: "retry_exhausted",
    details: {
      retryJobId: retryJob._id,
      referenceType: retryJob.referenceType,
      referenceId: retryJob.referenceId,
      attempts: retryJob.attempts,
      lastError: retryJob.lastError
    }
  });
}

// ─── Severity Classification ────────────────────────────────────────────────

/**
 * Classify drift severity by amount.
 * @param {number} diffMinor — absolute difference in minor units
 * @returns {"warning"|"critical"|"fatal"}
 */
function classifySeverity(diffMinor) {
  const abs = Math.abs(diffMinor);
  if (abs <= 100) return "warning"; // ≤ 1 AED: rounding issue
  if (abs <= 10000) return "critical"; // ≤ 100 AED: real discrepancy
  return "fatal"; // > 100 AED: serious issue
}

// ─── Alert Queries ──────────────────────────────────────────────────────────

/**
 * Get all open alerts for an organization.
 */
async function getOpenAlerts(organizationId, connection = null) {
  return _getSecureDriftAlert(connection).find({
    status: "open"
  }).sort({
    createdAt: -1
  }).lean();
}

/**
 * Acknowledge (mark as seen) an alert.
 */
async function acknowledgeAlert(alertId, connection = null) {
  const DriftAlert = _getDriftAlert(connection);
  return DriftAlert.findByIdAndUpdate(alertId, {
    $set: {
      status: "acknowledged"
    }
  }, {
    new: true
  });
}

/**
 * Resolve (close) an alert.
 */
async function resolveAlert(alertId, resolvedBy, connection = null) {
  const DriftAlert = _getDriftAlert(connection);
  return DriftAlert.findByIdAndUpdate(alertId, {
    $set: {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedBy
    }
  }, {
    new: true
  });
}

/**
 * Get alert statistics for an organization.
 */
async function getAlertStats(organizationId, connection = null) {
  // secureModel.aggregate prepends $match { organizationId } automatically
  const results = await _getSecureDriftAlert(connection).aggregate([{
    $group: {
      _id: "$status",
      count: {
        $sum: 1
      }
    }
  }]);
  const stats = {
    open: 0,
    acknowledged: 0,
    resolved: 0
  };
  for (const r of results) {
    stats[r._id] = r.count;
  }
  return stats;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  DriftAlertDef,
  driftAlertModelName,
  driftAlertSchema,
  processReconciliationReport,
  createAlert,
  alertRetryExhausted,
  classifySeverity,
  getOpenAlerts,
  acknowledgeAlert,
  resolveAlert,
  getAlertStats
};