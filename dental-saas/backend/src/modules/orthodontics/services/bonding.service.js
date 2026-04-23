/**
 * bonding.service.js — Bonding Engine Service Layer
 *
 * Responsibilities:
 *   - Atomic upsert: BONDED vs REBONDED logic per tooth
 *   - Debond: marks tooth DEBONDED + appends history event
 *   - Analytics: debond rate per case (mirrors TAD failure rate pattern)
 *   - Settings: getSettings with safe defaults fallback
 *   - TAD linking: resolves nearby TADs from Tad model using caseId
 *
 * Architecture:
 *   - organizationId ALWAYS from req.context (never from body)
 *   - No inline filtering inside org DB — organizationId enforced at query level
 *   - History is append-only — never splice or delete events
 *
 * @per-org-compliant — All operations use getModel(req.dbConnection, ...) for per-org DB isolation.
 */

"use strict";

const BondingDef = require("../models/Bonding.model");
const BondingSettingsDef = require("../models/BondingSettings.model");
const getModel = require("../../../core/db/getModel");
const enforceDbIsolation = require("../../../core/db/dbIsolation.guard");
const clinicalEventService = require("./clinicalEvent.service");

// ─── Per-Request Model Resolution ─────────────────────────────────────────────
// Binds models to the org's DB connection (req.dbConnection).
// This is REQUIRED for DB_MODE=per-org. Without it, queries hit the platform DB
// which has no clinical data.
function _getModels(req) {
  enforceDbIsolation(req);
  const conn = req.dbConnection;
  return {
    Bonding: getModel(conn, BondingDef),
    BondingSettings: getModel(conn, BondingSettingsDef)
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  brands: ["3M", "Ormco", "American Orthodontics", "Dentsply Sirona", "Forestadent", "GC"],
  slotSizes: ["0.022", "0.018"],
  defaultPrescription: "MBT",
  defaultSlot: "0.022",
  debondAlertThreshold: 20
};

// ─── Apply Bonding (Bulk Upsert) ──────────────────────────────────────────────

/**
 * Applies bonding to one or more teeth in a case.
 *
 * For each tooth:
 *   - If no record exists → CREATE new Bonding (action: BONDED)
 *   - If record exists    → UPDATE in-place + append REBONDED event
 *
 * @param {Object}   req            - Express request (for per-org DB connection)
 * @param {Object}   context        - from req.context: { organizationId, userId }
 * @param {string}   caseId         - OrthodonticCase._id
 * @param {string}   patientId      - Patient._id
 * @param {number[]} teeth          - FDI tooth numbers
 * @param {Object}   data           - { type, prescription, slot, bondingHeight, bondingPosition, brand, source, snapshotId }
 * @param {string[]} [linkedTadIds] - TAD._id references for anchorage linkage
 * @returns {Promise<Object[]>}     - Array of saved Bonding documents
 */
const applyBonding = async (req, context, caseId, patientId, teeth, data, linkedTadIds = []) => {
  const {
    Bonding
  } = _getModels(req);
  const {
    userId
  } = context;
  let results;

  // AUDIT FIX: Wrap all bonding creates/updates + event log in a single transaction.
  // Previously the Promise.all and logEventSync were independent — if the event log
  // failed, bonding records persisted without an audit trail entry.
  const session = await req.dbConnection.startSession();
  try {
    await session.withTransaction(async () => {
      results = await Promise.all(teeth.map(async tooth => {
        const existing = await Bonding.findOne({
          caseId,
          tooth
        });
        if (existing) {
          // ── Rebonding: update fields + append event ──────────────────────
          const historyEntry = {
            action: "REBONDED",
            value: {
              ...data,
              linkedTadIds
            },
            performedBy: userId || null,
            notes: data.notes || null
          };
          Object.assign(existing, {
            type: data.type || existing.type,
            prescription: data.prescription ?? existing.prescription,
            slot: data.slot ?? existing.slot,
            bondingHeight: data.bondingHeight ?? existing.bondingHeight,
            bondingPosition: data.bondingPosition ?? existing.bondingPosition,
            brand: data.brand ?? existing.brand,
            source: data.source || existing.source,
            snapshotId: data.snapshotId || existing.snapshotId,
            linkedTadIds: linkedTadIds.length > 0 ? linkedTadIds : existing.linkedTadIds,
            status: "ACTIVE"
          });
          existing.history.push(historyEntry);
          return existing.save({
            session
          });
        }

        // ── New bonding: create record ────────────────────────────────────
        const [created] = await Bonding.create([{
          caseId,
          patientId,
          snapshotId: data.snapshotId || null,
          tooth,
          type: data.type || "BRACKET",
          prescription: data.prescription || null,
          slot: data.slot || null,
          bondingHeight: data.bondingHeight || null,
          bondingPosition: data.bondingPosition || null,
          brand: data.brand || null,
          source: data.source || {
            type: "manual",
            referenceGroup: null
          },
          linkedTadIds,
          status: "ACTIVE",
          history: [{
            action: "BONDED",
            value: {
              ...data,
              linkedTadIds
            },
            performedBy: userId || null,
            notes: data.notes || null
          }]
        }], {
          session
        });
        return created;
      }));

      // P0-3: blocking event log — atomic with bonding creates/updates
      await clinicalEventService.logEventSync(req, {
        caseId,
        patientId,
        visitId: req.activeVisit?._id,
        snapshotId: data.snapshotId,
        type: "BONDING_APPLIED",
        severity: "info",
        // P0-2: payload._id is the first bonding record's ID (stable entity reference)
        payload: {
          _id: results[0]?._id?.toString(),
          teeth,
          type: data.type,
          prescription: data.prescription,
          slot: data.slot,
          bondingHeight: data.bondingHeight,
          bondingPosition: data.bondingPosition,
          brand: data.brand,
          source: data.source,
          linkedTadIds
        },
        metadata: {
          relatedEntityId: results[0]?._id,
          relatedEntityType: "Bonding"
        }
      }, {
        session
      });
    });
  } finally {
    await session.endSession();
  }
  return results;
};

// ─── Debond Tooth ─────────────────────────────────────────────────────────────

/**
 * Marks a bonded tooth as DEBONDED.
 *
 * @param {Object} req        - Express request (for per-org DB connection)
 * @param {Object} context    - { organizationId, userId }
 * @param {string} bondingId  - Bonding._id
 * @param {string} [reason]   - Clinical reason for debonding
 */
const debondTooth = async (req, context, bondingId, reason = null) => {
  const {
    Bonding
  } = _getModels(req);
  const {
    userId
  } = context;
  const bonding = await Bonding.findOne({
    _id: bondingId
  });
  if (!bonding) throw Object.assign(new Error("Bonding record not found"), {
    statusCode: 404
  });
  if (bonding.status === "DEBONDED") {
    throw Object.assign(new Error("Tooth is already debonded"), {
      statusCode: 409
    });
  }
  bonding.status = "DEBONDED";
  bonding.history.push({
    action: "DEBONDED",
    value: {
      reason
    },
    performedBy: userId || null,
    notes: reason
  });

  // P0-3: save + event in one transaction
  let saved;
  const _debondSession = await req.dbConnection.startSession();
  try {
    await _debondSession.withTransaction(async () => {
      saved = await bonding.save({
        session: _debondSession
      });
      await clinicalEventService.logEventSync(req, {
        caseId: bonding.caseId,
        patientId: bonding.patientId,
        visitId: req.activeVisit?._id,
        snapshotId: bonding.snapshotId,
        type: "BONDING_REMOVED",
        severity: "info",
        payload: {
          reason,
          tooth: bonding.tooth
        },
        metadata: {
          toothId: bonding.tooth,
          relatedEntityId: bonding._id,
          relatedEntityType: "Bonding"
        }
      }, {
        session: _debondSession
      });
    });
  } finally {
    await _debondSession.endSession();
  }
  return saved;
};

// ─── Reposition Tooth ────────────────────────────────────────────────────────

/**
 * Repositions a bonded bracket (updates height/position + appends event).
 *
 * @param {Object} req          - Express request (for per-org DB connection)
 * @param {Object} context      - { organizationId, userId }
 * @param {string} bondingId    - Bonding._id
 * @param {Object} newPosition  - { bondingHeight, bondingPosition, notes }
 */
const repositionBracket = async (req, context, bondingId, newPosition) => {
  const {
    Bonding
  } = _getModels(req);
  const {
    userId
  } = context;
  const bonding = await Bonding.findOne({
    _id: bondingId
  });
  if (!bonding) throw Object.assign(new Error("Bonding record not found"), {
    statusCode: 404
  });
  if (bonding.status === "DEBONDED") {
    throw Object.assign(new Error("Cannot reposition a debonded bracket"), {
      statusCode: 409
    });
  }
  bonding.bondingHeight = newPosition.bondingHeight ?? bonding.bondingHeight;
  bonding.bondingPosition = newPosition.bondingPosition ?? bonding.bondingPosition;
  bonding.history.push({
    action: "REPOSITIONED",
    value: newPosition,
    performedBy: userId || null,
    notes: newPosition.notes || null
  });

  // P0-3: save + event in one transaction
  let saved;
  const _repoSession = await req.dbConnection.startSession();
  try {
    await _repoSession.withTransaction(async () => {
      saved = await bonding.save({
        session: _repoSession
      });
      await clinicalEventService.logEventSync(req, {
        caseId: bonding.caseId,
        patientId: bonding.patientId,
        visitId: req.activeVisit?._id,
        snapshotId: bonding.snapshotId,
        type: "BRACKET_REPOSITIONED",
        severity: "info",
        payload: {
          tooth: bonding.tooth,
          bondingHeight: newPosition.bondingHeight,
          bondingPosition: newPosition.bondingPosition
        },
        metadata: {
          toothId: bonding.tooth,
          relatedEntityId: bonding._id,
          relatedEntityType: "Bonding"
        }
      }, {
        session: _repoSession
      });
    });
  } finally {
    await _repoSession.endSession();
  }
  return saved;
};

// ─── Get Bondings for a Case ──────────────────────────────────────────────────

/**
 * Returns all bondings for a case (ACTIVE + DEBONDED).
 *
 * @param {Object} req      - Express request (for per-org DB connection)
 * @param {Object} context  - { organizationId }
 * @param {string} caseId
 * @returns {Promise<Object[]>}
 */
const getBondingsByCase = async (req, context, caseId) => {
  const {
    Bonding
  } = _getModels(req);
  const {} = context;
  return Bonding.find({
    caseId
  }).sort({
    tooth: 1
  }).lean();
};

// ─── Debond Rate Analytics ───────────────────────────────────────────────────

/**
 * Calculates the debond rate for a case.
 * Mirrors the TAD failure rate pattern.
 *
 * @param {Object} req      - Express request (for per-org DB connection)
 * @param {Object} context  - { organizationId }
 * @param {string} caseId
 * @returns {{ rate: number, debonded: number, total: number }}
 */
const getDebondRate = async (req, context, caseId) => {
  const {
    Bonding
  } = _getModels(req);
  const {} = context;
  const all = await Bonding.find({
    caseId
  }).lean();
  const total = all.length;
  if (total === 0) return {
    rate: 0,
    debonded: 0,
    total: 0
  };
  const debonded = all.filter(b => b.status === "DEBONDED").length;
  const rate = Math.round(debonded / total * 100);
  return {
    rate,
    debonded,
    total
  };
};

// ─── Settings ────────────────────────────────────────────────────────────────

/**
 * Gets per-org bonding settings, returning safe defaults if not configured.
 *
 * @param {Object} req      - Express request (for per-org DB connection)
 * @param {Object} context  - { organizationId }
 * @returns {Object}        - BondingSettings or hardcoded defaults
 */
const getSettings = async (req, context) => {
  const {
    BondingSettings
  } = _getModels(req);
  // Per-org DB: BondingSettings is a single-doc collection per org — no filter needed.
  const settings = await BondingSettings.findOne({}).lean();
  return settings || {
    ...DEFAULT_SETTINGS
  };
};

/**
 * Upserts per-org bonding settings.
 *
 * @param {Object} req      - Express request (for per-org DB connection)
 * @param {Object} context  - { organizationId }
 * @param {Object} updates  - Partial BondingSettings fields
 */
const updateSettings = async (req, context, updates) => {
  const {
    BondingSettings
  } = _getModels(req);
  // Per-org DB: BondingSettings is a single-doc collection per org — upsert on empty filter.
  return BondingSettings.findOneAndUpdate({}, {
    $set: updates
  }, {
    upsert: true,
    new: true,
    runValidators: true
  });
};

// ─── Get Single Bonding by ID ────────────────────────────────────────────────
// Used by ownership guard to resolve caseId from a bonding record.

const getBondingById = async (req, context, bondingId) => {
  const {
    Bonding
  } = _getModels(req);
  const {} = context;
  return Bonding.findOne({
    _id: bondingId
  }).lean();
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  applyBonding,
  debondTooth,
  repositionBracket,
  getBondingsByCase,
  getBondingById,
  getDebondRate,
  getSettings,
  updateSettings
};