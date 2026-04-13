/**
 * tad.service.js — TADs Engine Service Layer
 *
 * Rules:
 *   - All mutations append to events[] — NEVER overwrite history
 *   - failureCount is incremented atomically via $inc
 *   - status is always derived from the latest event type
 *   - organizationId must be passed for all queries (multi-tenant safety)
 *
 * @per-org-compliant — All operations use getModel(req.dbConnection, ...) for per-org DB isolation.
 */

"use strict";

const TadDef            = require("../models/Tad.model");
const TadSettingsDef    = require("../models/TadSettings.model");
const getModel          = require("../../../core/db/getModel");
const enforceDbIsolation = require("../../../core/db/dbIsolation.guard");
const logger            = require("@utils/logger");
const clinicalEventService = require("./clinicalEvent.service");

// ─── Per-Request Model Resolution ─────────────────────────────────────────────
function _getModels(req) {
    enforceDbIsolation(req);
    const conn = req.dbConnection;
    return {
        Tad:         getModel(conn, TadDef),
        TadSettings: getModel(conn, TadSettingsDef),
    };
}

// ─── Internal Helper ──────────────────────────────────────────────────────────

const _findTad = async (Tad, organizationId, tadId) => {
  const tad = await Tad.findOne({ _id: tadId, organizationId });
  if (!tad) {
    const err = new Error("TAD not found");
    err.statusCode = 404;
    throw err;
  }
  return tad;
};

// ─── Create TAD (Insert) ──────────────────────────────────────────────────────

/**
 * createTad — Insert a new TAD and log the INSERTED event.
 */
const createTad = async (req, {
  organizationId,
  caseId,
  patientId,
  snapshotId,
  toothNumber,
  position,
  positionLabel,
  brand,
  diameter,
  length,
  chartPosition,
  performedBy,
}) => {
  const { Tad } = _getModels(req);

  // ── Duplicate Prevention ───────────────────────────────────────────────────
  // Only one ACTIVE TAD per (case, toothNumber, anchorType) is allowed.
  const dupFilter = {
    organizationId,
    caseId,
    toothNumber,
    status: "ACTIVE",
  };
  if (chartPosition?.anchorType) {
    dupFilter["chartPosition.anchorType"] = chartPosition.anchorType;
  }
  const existing = await Tad.findOne(dupFilter).lean();
  if (existing) {
    const err = new Error(
      `An active TAD already exists at tooth ${toothNumber}` +
      (chartPosition?.anchorType ? ` (${chartPosition.anchorType})` : "")
    );
    err.statusCode = 409;
    throw err;
  }

  // P0-3: Wrap create + event log in an atomic transaction so a logEventSync
  // failure rolls back the Tad insert — no silent state divergence.
  let tad;
  const session = await req.dbConnection.startSession();
  try {
    await session.withTransaction(async () => {
      const [created] = await Tad.create([{
        organizationId,
        caseId,
        patientId,
        snapshotId: snapshotId || null,
        toothNumber,
        position,
        positionLabel: positionLabel || `TAD @ ${toothNumber}`,
        brand,
        diameter,
        length,
        status: "ACTIVE",
        failureCount: 0,
        hasActiveAlert: false,
        chartPosition: chartPosition || {},
        events: [{ type: "INSERTED", performedBy: performedBy || null }],
      }], { session });
      tad = created;

      // P0-3: blocking — failure rolls back the entire transaction
      await clinicalEventService.logEventSync(req, {
        caseId,
        patientId,
        visitId:   req.activeVisit?._id,        // 🔴 Phase 2: required
        snapshotId,
        type: "TAD_INSERTED",
        severity: "info",
        // P0-2: payload._id provides the stable entity ID the reducer requires
        payload: { _id: tad._id.toString(), toothNumber, position, positionLabel, brand, diameter, length },
        metadata: {
          toothId: toothNumber,
          relatedEntityId: tad._id,
          relatedEntityType: "Tad",
        },
      }, { session });
    });
  } finally {
    await session.endSession();
  }

  logger.info(`[TADs] Created TAD ${tad._id} for case ${caseId}`);
  return tad;
};

// ─── Mark for Removal ─────────────────────────────────────────────────────────

/**
 * markForRemoval — Flag a TAD as needing removal.
 * Sets hasActiveAlert to trigger UI badge.
 */
const markForRemoval = async (req, { organizationId, tadId, reason, healingWeeks, notes, performedBy }) => {
  const { Tad } = _getModels(req);
  const tad = await _findTad(Tad, organizationId, tadId);

  const scheduledDate = healingWeeks
    ? new Date(Date.now() + healingWeeks * 7 * 24 * 60 * 60 * 1000)
    : null;

  tad.status = "NEEDS_REMOVAL";
  tad.hasActiveAlert = true;
  tad.scheduledReinsertAt = scheduledDate;

  tad.events.push({
    type: "MARKED_FOR_REMOVAL",
    reason: reason || null,
    notes: notes || null,
    scheduledReinsertAt: scheduledDate,
    performedBy: performedBy || null,
  });

  // P0-3: save + event in one transaction
  const _session = await req.dbConnection.startSession();
  try {
    await _session.withTransaction(async () => {
      await tad.save({ session: _session });
      await clinicalEventService.logEventSync(req, {
        caseId: tad.caseId,
        patientId: tad.patientId,
        visitId:   req.activeVisit?._id,
        type: "TAD_MARKED_FOR_REMOVAL",
        severity: "warning",
        payload: { reason, healingWeeks, scheduledReinsertAt: tad.scheduledReinsertAt },
        metadata: { toothId: tad.toothNumber, relatedEntityId: tad._id, relatedEntityType: "Tad" },
      }, { session: _session });
    });
  } finally {
    await _session.endSession();
  }

  logger.info(`[TADs] TAD ${tadId} marked for removal (reason: ${reason})`);
  return tad;
};

// ─── Remove TAD ───────────────────────────────────────────────────────────────

/**
 * removeTad — Physically remove a TAD, optionally scheduling reinsertion.
 */
const removeTad = async (req, { organizationId, tadId, reason, healingWeeks, notes, performedBy }) => {
  const { Tad } = _getModels(req);
  const tad = await _findTad(Tad, organizationId, tadId);

  const scheduledDate = healingWeeks
    ? new Date(Date.now() + healingWeeks * 7 * 24 * 60 * 60 * 1000)
    : null;

  tad.status = "REMOVED";
  tad.hasActiveAlert = false;
  tad.scheduledReinsertAt = scheduledDate;

  tad.events.push({
    type: "REMOVED",
    reason: reason || null,
    notes: notes || null,
    scheduledReinsertAt: scheduledDate,
    performedBy: performedBy || null,
  });

  // P0-3: save + event in one transaction
  const _session = await req.dbConnection.startSession();
  try {
    await _session.withTransaction(async () => {
      await tad.save({ session: _session });
      await clinicalEventService.logEventSync(req, {
        caseId: tad.caseId,
        patientId: tad.patientId,
        visitId:   req.activeVisit?._id,
        type: "TAD_REMOVED",
        severity: "info",
        payload: { reason, healingWeeks },
        metadata: { toothId: tad.toothNumber, relatedEntityId: tad._id, relatedEntityType: "Tad" },
      }, { session: _session });
    });
  } finally {
    await _session.endSession();
  }

  logger.info(`[TADs] TAD ${tadId} removed`);
  return tad;
};

// ─── Fail TAD ─────────────────────────────────────────────────────────────────

/**
 * failTad — Record a clinical failure.
 * Uses atomic $inc for failureCount to prevent race conditions under concurrent writes.
 * Single findOneAndUpdate replaces load-modify-save — no intermediate stale reads.
 */
const failTad = async (req, { organizationId, tadId, reason, notes, performedBy }) => {
  const { Tad } = _getModels(req);

  // AUDIT FIX: Wrap findOneAndUpdate + logEventSync in a single MongoDB transaction.
  // Previously the TAD status change and event log were independent — if the event
  // log failed, the TAD was marked FAILED without an audit trail entry.
  let updated;
  const _failSession = await req.dbConnection.startSession();
  try {
    await _failSession.withTransaction(async () => {
      updated = await Tad.findOneAndUpdate(
        { _id: tadId, organizationId },
        {
          $set: { status: "FAILED", hasActiveAlert: true },
          $inc: { failureCount: 1 },
          $push: {
            events: {
              type: "FAILED",
              reason: reason || null,
              notes: notes || null,
              performedBy: performedBy || null,
            },
          },
        },
        { new: true, session: _failSession }
      );

      if (!updated) {
        const err = new Error("TAD not found");
        err.statusCode = 404;
        throw err;
      }

      // P0-3: event log must succeed or throw — failure rolls back the status change
      await clinicalEventService.logEventSync(req, {
        caseId: updated.caseId,
        patientId: updated.patientId,
        visitId:   req.activeVisit?._id,
        type: "TAD_FAILED",
        severity: "critical",
        payload: { reason, failureCount: updated.failureCount },
        metadata: { toothId: updated.toothNumber, relatedEntityId: updated._id, relatedEntityType: "Tad" },
      }, { session: _failSession });
    });
  } finally {
    await _failSession.endSession();
  }

  logger.warn(`[TADs] TAD ${tadId} failed (count: ${updated.failureCount}, reason: ${reason})`);
  return updated;
};

// ─── Reinsert TAD ─────────────────────────────────────────────────────────────

/**
 * reinsertTad — Reactivate a previously removed/failed TAD.
 */
const reinsertTad = async (req, { organizationId, tadId, position, positionLabel, notes, performedBy }) => {
  const { Tad } = _getModels(req);
  const tad = await _findTad(Tad, organizationId, tadId);

  if (tad.status === "ACTIVE") {
    const err = new Error("TAD is already active");
    err.statusCode = 409;
    throw err;
  }

  if (position) tad.position = position;
  if (positionLabel) tad.positionLabel = positionLabel;

  tad.status = "ACTIVE";
  tad.hasActiveAlert = false;
  tad.scheduledReinsertAt = null;

  tad.events.push({
    type: "REINSERTED",
    notes: notes || null,
    performedBy: performedBy || null,
  });

  // P0-3: save + event in one transaction
  const _session = await req.dbConnection.startSession();
  try {
    await _session.withTransaction(async () => {
      await tad.save({ session: _session });
      await clinicalEventService.logEventSync(req, {
        caseId: tad.caseId,
        patientId: tad.patientId,
        visitId:   req.activeVisit?._id,
        type: "TAD_REINSERTED",
        severity: "info",
        payload: { position, positionLabel },
        metadata: { toothId: tad.toothNumber, relatedEntityId: tad._id, relatedEntityType: "Tad" },
      }, { session: _session });
    });
  } finally {
    await _session.endSession();
  }

  logger.info(`[TADs] TAD ${tadId} reinserted`);
  return tad;
};

// ─── Analytics: Failure Rate Calculation ─────────────────────────────────────

/**
 * getFailureRate — Case-level failure rate analytics.
 * Edge case: returns 0 if no TADs exist.
 */
const getFailureRate = async (req, { organizationId, caseId }) => {
  const { Tad } = _getModels(req);
  const tads = await Tad.find({ organizationId, caseId }).lean();

  const total = tads.length;
  if (total === 0) return { rate: 0, failed: 0, total: 0 };

  const failed = tads.filter((t) => t.failureCount > 0).length;
  const rate = Math.round((failed / total) * 100);

  return { rate, failed, total };
};

// ─── List + Detail Queries ────────────────────────────────────────────────────

const listByCase = async (req, { organizationId, caseId }) => {
  const { Tad } = _getModels(req);
  // Soft-delete: exclude REMOVED TADs from list. Use ?includeRemoved=true to see all.
  const includeRemoved = req.query?.includeRemoved === "true";
  const filter = { organizationId, caseId };
  if (!includeRemoved) filter.status = { $ne: "REMOVED" };
  return Tad.find(filter).sort({ createdAt: 1 }).lean();
};

const getById = async (req, { organizationId, tadId }) => {
  const { Tad } = _getModels(req);
  return _findTad(Tad, organizationId, tadId);
};

// ─── Settings ─────────────────────────────────────────────────────────────────

const getSettings = async (req, organizationId) => {
  const { TadSettings } = _getModels(req);
  let settings = await TadSettings.findOne({ organizationId }).lean();
  if (!settings) {
    // Return defaults if not yet configured
    settings = {
      organizationId,
      brands: ["Ormco", "3M", "Dentsply", "Forestadent"],
      diameters: ["1.4mm", "1.6mm", "1.8mm", "2.0mm"],
      lengths: ["6mm", "8mm", "10mm", "12mm"],
      alertThresholds: { failureRateWarning: 20, failureRateCritical: 40 },
    };
  }
  return settings;
};

const updateSettings = async (req, organizationId, { brands, diameters, lengths, alertThresholds }) => {
  const { TadSettings } = _getModels(req);
  return TadSettings.findOneAndUpdate(
    { organizationId },
    { $set: { brands, diameters, lengths, alertThresholds } },
    { new: true, upsert: true }
  );
};

// ─── Bulk Remove (soft-delete all ACTIVE TADs for a case) ────────────────────

const removeAllByCase = async (req, { organizationId, caseId, performedBy }) => {
  const { Tad } = _getModels(req);
  const result = await Tad.updateMany(
    { organizationId, caseId, status: "ACTIVE" },
    {
      $set: { status: "REMOVED", hasActiveAlert: false },
      $push: {
        events: {
          type: "REMOVED",
          reason: "bulk_cleanup",
          notes: "Bulk removal — all active TADs",
          performedBy: performedBy || null,
        },
      },
    }
  );
  return { removedCount: result.modifiedCount };
};

module.exports = {
  createTad,
  markForRemoval,
  removeTad,
  failTad,
  reinsertTad,
  getFailureRate,
  listByCase,
  getById,
  getSettings,
  updateSettings,
  removeAllByCase,
};
