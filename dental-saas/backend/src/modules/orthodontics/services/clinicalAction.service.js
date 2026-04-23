/**
 * clinicalAction.service.js — Phase 3 Clinical Appliance Service
 *
 * Provides atomic persistence + event emission for ALL clinical appliance domains:
 *   - Archwires     (ARCHWIRE_PLACED / ARCHWIRE_REMOVED)
 *   - Elastics      (ELASTIC_APPLIED / ELASTIC_REMOVED)
 *   - PowerChains   (POWERCHAIN_APPLIED / POWERCHAIN_REMOVED)
 *   - Accessories   (ACCESSORY_ADDED / ACCESSORY_REMOVED)
 *   - Ligatures     (LIGATURE_ADDED / LIGATURE_REMOVED)
 *   - IPR Markers   (IPR_ADDED / IPR_REMOVED)
 *   - Space Markers (SPACE_MARKER_ADDED / SPACE_MARKER_REMOVED)
 *
 * INVARIANTS:
 *   - organizationId ALWAYS from req.context (JWT SSOT — never from body)
 *   - Per-org DB isolation via getModel(req.dbConnection, ...)
 *   - Every mutation emits a ClinicalEvent (transactional via logEventSync)
 *   - Removals use soft-delete (status: REMOVED) with audit fields
 *
 * @per-org-compliant
 */

"use strict";

const ClinicalActionDef = require("../models/ClinicalAction.model");
const getModel = require("../../../core/db/getModel");
const enforceDbIsolation = require("../../../core/db/dbIsolation.guard");
const clinicalEventService = require("./clinicalEvent.service");
const logger = require("@utils/logger");

// ─── Per-Request Model Resolution ─────────────────────────────────────────────
function _getModels(req) {
  enforceDbIsolation(req);
  return {
    ClinicalAction: getModel(req.dbConnection, ClinicalActionDef)
  };
}

// ─── Shared: ownership guard helper ───────────────────────────────────────────
// Finds an active action document and verifies organizational ownership.
async function _resolveAction(req, actionId) {
  const {
    ClinicalAction
  } = _getModels(req);
  const action = await ClinicalAction.findOne({
    _id: actionId,
    status: "ACTIVE"
  });
  if (!action) {
    const err = new Error("Clinical action not found or already removed");
    err.statusCode = 404;
    throw err;
  }
  return action;
}

// ─── Shared: create + log (TRANSACTIONAL) ────────────────────────────────────
async function _createAction(req, {
  caseId,
  patientId,
  snapshotId,
  domain,
  actionType,
  eventType,
  payload
}) {
  const {
    ClinicalAction
  } = _getModels(req);
  const {
    userId
  } = req.context;
  let doc;
  // AUDIT FIX: Wrap ClinicalAction.create + logEventSync in a single MongoDB
  // transaction. If the event log fails, the ClinicalAction record is rolled back.
  // Uses req.dbConnection.startSession() for per-org DB isolation (never mongoose.startSession).
  const session = await req.dbConnection.startSession();
  try {
    await session.withTransaction(async () => {
      const [created] = await ClinicalAction.create([{
        caseId,
        patientId,
        snapshotId: snapshotId || null,
        domain,
        actionType,
        payload,
        createdBy: userId
      }], {
        session
      });
      doc = created;

      // P0-3: blocking event log — atomic with the DB write
      await clinicalEventService.logEventSync(req, {
        type: eventType,
        caseId,
        patientId,
        visitId: req.activeVisit?._id,
        // P0-2: supply payload._id so entity-ID-required events pass contract validation
        payload: {
          _id: doc._id.toString(),
          ...payload
        },
        metadata: {
          relatedEntityId: doc._id,
          relatedEntityType: "ClinicalAction"
        }
      }, {
        session
      });
    });
  } finally {
    await session.endSession();
  }
  logger.info({
    event: eventType,
    domain,
    caseId,
    orgId: organizationId,
    docId: doc._id
  });
  return doc;
}

// ─── Shared: soft-remove + log (TRANSACTIONAL) ───────────────────────────────
async function _removeAction(req, actionId, eventType, reason = null) {
  const action = await _resolveAction(req, actionId);
  const {
    userId
  } = req.context;

  // AUDIT FIX: Wrap soft-delete + logEventSync in a single MongoDB transaction.
  // If the event log fails, the status change is rolled back — the action stays ACTIVE.
  const session = await req.dbConnection.startSession();
  try {
    await session.withTransaction(async () => {
      action.status = "REMOVED";
      action.removedBy = userId;
      action.removedAt = new Date();
      action.removalReason = reason;
      await action.save({
        session
      });

      // P0-3: blocking event log — atomic with the status update
      await clinicalEventService.logEventSync(req, {
        type: eventType,
        caseId: action.caseId,
        patientId: action.patientId,
        visitId: req.activeVisit?._id,
        payload: {
          actionId,
          reason,
          ...action.payload
        },
        metadata: {
          relatedEntityId: action._id,
          relatedEntityType: "ClinicalAction"
        }
      }, {
        session
      });
    });
  } finally {
    await session.endSession();
  }
  logger.info({
    event: eventType,
    domain: action.domain,
    caseId: action.caseId,
    orgId: req.context.organizationId
  });
  return action;
}

// ─── List active actions for a case + domain ──────────────────────────────────
async function listActiveByCase(req, caseId, domain = null) {
  const {
    ClinicalAction
  } = _getModels(req);
  const query = {
    caseId,
    status: "ACTIVE"
  };
  if (domain) query.domain = domain;
  return ClinicalAction.find(query).sort({
    createdAt: -1
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ARCHWIRE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * applyArchwire — Place an archwire for a case/arch.
 * @param {Object} req
 * @param {string} caseId
 * @param {string} patientId
 * @param {{ arch: string, material: string, size: string, brand?: string, snapshotId?: string }} data
 */
async function applyArchwire(req, caseId, patientId, data) {
  return _createAction(req, {
    caseId,
    patientId,
    snapshotId: data.snapshotId,
    domain: "archwire",
    actionType: "ARCHWIRE_PLACED",
    eventType: "ARCHWIRE_PLACED",
    payload: {
      arch: data.arch,
      material: data.material,
      size: data.size,
      brand: data.brand || null
    }
  });
}

/**
 * removeArchwire — Soft-delete an archwire record.
 */
async function removeArchwire(req, actionId, reason = null) {
  return _removeAction(req, actionId, "ARCHWIRE_REMOVED", reason);
}

// ══════════════════════════════════════════════════════════════════════════════
// ELASTIC
// ══════════════════════════════════════════════════════════════════════════════

/**
 * applyElastic — Register a new elastic connection.
 * @param {{ fromTooth: number, toTooth: number, type: string, size?: string }} data
 */
async function applyElastic(req, caseId, patientId, data) {
  return _createAction(req, {
    caseId,
    patientId,
    snapshotId: data.snapshotId,
    domain: "elastic",
    actionType: "ELASTIC_APPLIED",
    eventType: "ELASTIC_APPLIED",
    payload: {
      fromTooth: data.fromTooth,
      toTooth: data.toTooth,
      type: data.type,
      size: data.size || null
    }
  });
}
async function removeElastic(req, actionId, reason = null) {
  return _removeAction(req, actionId, "ELASTIC_REMOVED", reason);
}

// ══════════════════════════════════════════════════════════════════════════════
// POWERCHAIN
// ══════════════════════════════════════════════════════════════════════════════

/**
 * applyPowerchain — Register a powerchain placement.
 * @param {{ arch: string, segments: Array<{ from: number, to: number }>, type?: string }} data
 */
async function applyPowerchain(req, caseId, patientId, data) {
  return _createAction(req, {
    caseId,
    patientId,
    snapshotId: data.snapshotId,
    domain: "powerchain",
    actionType: "POWERCHAIN_APPLIED",
    eventType: "POWERCHAIN_APPLIED",
    payload: {
      arch: data.arch,
      segments: data.segments || [],
      type: data.type || null
    }
  });
}
async function removePowerchain(req, actionId, reason = null) {
  return _removeAction(req, actionId, "POWERCHAIN_REMOVED", reason);
}

// ══════════════════════════════════════════════════════════════════════════════
// ACCESSORY
// ══════════════════════════════════════════════════════════════════════════════

/**
 * addAccessory — Register an accessory on a tooth.
 * @param {{ toothId: number, type: string, notes?: string }} data
 */
async function addAccessory(req, caseId, patientId, data) {
  return _createAction(req, {
    caseId,
    patientId,
    snapshotId: data.snapshotId,
    domain: "accessory",
    actionType: "ACCESSORY_ADDED",
    eventType: "ACCESSORY_ADDED",
    payload: {
      toothId: data.toothId,
      type: data.type,
      notes: data.notes || null
    }
  });
}
async function removeAccessory(req, actionId, reason = null) {
  return _removeAction(req, actionId, "ACCESSORY_REMOVED", reason);
}

// ══════════════════════════════════════════════════════════════════════════════
// LIGATURE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * addLigature — Register a ligature on a tooth.
 * @param {{ toothId: number, type: string, notes?: string }} data
 */
async function addLigature(req, caseId, patientId, data) {
  return _createAction(req, {
    caseId,
    patientId,
    snapshotId: data.snapshotId,
    domain: "ligature",
    actionType: "LIGATURE_ADDED",
    eventType: "LIGATURE_ADDED",
    payload: {
      toothId: data.toothId,
      type: data.type,
      notes: data.notes || null
    }
  });
}
async function removeLigature(req, actionId, reason = null) {
  return _removeAction(req, actionId, "LIGATURE_REMOVED", reason);
}

// ══════════════════════════════════════════════════════════════════════════════
// IPR MARKER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * addIPR — Register an IPR reduction between two teeth.
 * @param {{ betweenTeeth: [number, number], amount: number, notes?: string }} data
 */
async function addIPR(req, caseId, patientId, data) {
  return _createAction(req, {
    caseId,
    patientId,
    snapshotId: data.snapshotId,
    domain: "ipr",
    actionType: "IPR_ADDED",
    eventType: "IPR_ADDED",
    payload: {
      betweenTeeth: data.betweenTeeth,
      amount: data.amount,
      notes: data.notes || null
    }
  });
}
async function removeIPR(req, actionId, reason = null) {
  return _removeAction(req, actionId, "IPR_REMOVED", reason);
}

// ══════════════════════════════════════════════════════════════════════════════
// SPACE MARKER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * addSpaceMarker — Register a space maintenance marker on a tooth.
 * @param {{ toothId: number, type: string, notes?: string }} data
 */
async function addSpaceMarker(req, caseId, patientId, data) {
  return _createAction(req, {
    caseId,
    patientId,
    snapshotId: data.snapshotId,
    domain: "space",
    actionType: "SPACE_MARKER_ADDED",
    eventType: "SPACE_MARKER_ADDED",
    payload: {
      toothId: data.toothId,
      type: data.type,
      notes: data.notes || null
    }
  });
}
async function removeSpaceMarker(req, actionId, reason = null) {
  return _removeAction(req, actionId, "SPACE_MARKER_REMOVED", reason);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Reads
  listActiveByCase,
  // Archwire
  applyArchwire,
  removeArchwire,
  // Elastic
  applyElastic,
  removeElastic,
  // PowerChain
  applyPowerchain,
  removePowerchain,
  // Accessory
  addAccessory,
  removeAccessory,
  // Ligature
  addLigature,
  removeLigature,
  // IPR
  addIPR,
  removeIPR,
  // Space
  addSpaceMarker,
  removeSpaceMarker
};