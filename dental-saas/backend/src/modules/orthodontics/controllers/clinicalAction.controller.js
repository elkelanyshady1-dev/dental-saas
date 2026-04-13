/**
 * clinicalAction.controller.js — Phase 3 Clinical Appliance HTTP Controller
 *
 * SECURITY MODEL (enforced on ALL mutations):
 *   1. authorize(req, "orthodontics.full")  ← RBAC
 *   2. checkCaseOwnership()                   ← Case-level isolation
 *   3. Service call                           ← Business logic
 *
 * organizationId ALWAYS from req.context (JWT SSOT — never req.body).
 *
 * Endpoint summary:
 *   POST /archwire/apply      → applyArchwire
 *   POST /archwire/remove/:id → removeArchwire
 *   POST /elastic/apply       → applyElastic
 *   POST /elastic/remove/:id  → removeElastic
 *   POST /powerchain/apply    → applyPowerchain
 *   POST /powerchain/remove/:id → removePowerchain
 *   POST /accessory/add       → addAccessory
 *   POST /accessory/remove/:id → removeAccessory
 *   POST /ligature/add        → addLigature
 *   POST /ligature/remove/:id → removeLigature
 *   POST /ipr/add             → addIPR
 *   POST /ipr/remove/:id      → removeIPR
 *   POST /space/add           → addSpaceMarker
 *   POST /space/remove/:id    → removeSpaceMarker
 *   GET  /list?caseId&domain  → listActiveByCase
 */

"use strict";

const mongoose             = require("mongoose");
const clinicalActionService = require("../services/clinicalAction.service");
const { authorize }        = require("../../../utils/authorize");
const { checkCaseOwnership } = require("../utils/ownership.guard");
const logger               = require("@utils/logger");
const { buildClinicalActionDTO, buildClinicalActionListItemDTO } = require("../clinical/dto/clinicalAction.dto");

const isValidId = (id) => mongoose.isValidObjectId(id);

// ─── Shared validation helpers ─────────────────────────────────────────────────

function _requireBodyFields(res, body, fields) {
  const missing = fields.filter(f => body[f] == null || body[f] === "");
  if (missing.length > 0) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: `Missing required fields: ${missing.join(", ")}` },
    });
    return false;
  }
  return true;
}

function _requireIds(res, ...ids) {
  const invalid = ids.filter(id => !isValidId(id));
  if (invalid.length > 0) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "One or more IDs are invalid ObjectIds" },
    });
    return false;
  }
  return true;
}

// ─── Shared: remove handler factory ───────────────────────────────────────────
function _makeRemoveHandler(serviceFn, logLabel) {
  return async (req, res) => {
    try {
      authorize(req, "orthodontics.full");
      const { id } = req.params;
      const { reason } = req.body;
      if (!isValidId(id)) {
        return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid action ID" } });
      }
      const doc = await serviceFn(req, id, reason || null);
      logger.info(`[ClinicalAction] ${logLabel} removed: ${id} by ${req.context.userId}`);
      return res.json({ success: true, data: buildClinicalActionDTO(doc) });
    } catch (err) {
      logger.error(`[ClinicalAction] remove error (${logLabel}): ${err.message}`);
      return res.status(err.statusCode || 500).json({ success: false, error: { code: "REMOVE_ERROR", message: err.message } });
    }
  };
}

// ── List (all domains or filtered by domain) ──────────────────────────────────

async function listActiveByCase(req, res) {
  try {
    authorize(req, "orthodontics.read");
    const { caseId, domain } = req.query;
    if (!caseId || !isValidId(caseId)) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "caseId is required and must be a valid ObjectId" } });
    }
    const results = await clinicalActionService.listActiveByCase(req, caseId, domain || null);
    return res.json({ success: true, data: results.map(buildClinicalActionListItemDTO) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: { code: "LIST_ERROR", message: err.message } });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ARCHWIRE
// ══════════════════════════════════════════════════════════════════════════════

async function applyArchwire(req, res) {
  try {
    authorize(req, "orthodontics.full");
    const { caseId, patientId, arch, material, size, brand, snapshotId } = req.body;
    if (!_requireBodyFields(res, req.body, ["caseId", "patientId", "arch", "material", "size"])) return;
    if (!_requireIds(res, caseId, patientId)) return;
    await checkCaseOwnership(req, caseId);

    const doc = await clinicalActionService.applyArchwire(req, caseId, patientId, { arch, material, size, brand, snapshotId });
    return res.status(201).json({ success: true, data: buildClinicalActionDTO(doc) });
  } catch (err) {
    logger.error(`[ClinicalAction] applyArchwire: ${err.message}`);
    return res.status(err.statusCode || 500).json({ success: false, error: { code: "ARCHWIRE_ERROR", message: err.message } });
  }
}

const removeArchwire = _makeRemoveHandler(clinicalActionService.removeArchwire, "Archwire");

// ══════════════════════════════════════════════════════════════════════════════
// ELASTIC
// ══════════════════════════════════════════════════════════════════════════════

async function applyElastic(req, res) {
  try {
    authorize(req, "orthodontics.full");
    const { caseId, patientId, fromTooth, toTooth, type, size, snapshotId } = req.body;
    if (!_requireBodyFields(res, req.body, ["caseId", "patientId", "fromTooth", "toTooth", "type"])) return;
    if (!_requireIds(res, caseId, patientId)) return;
    if (typeof fromTooth !== "number" || typeof toTooth !== "number") {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "fromTooth and toTooth must be numbers" } });
    }
    await checkCaseOwnership(req, caseId);

    const doc = await clinicalActionService.applyElastic(req, caseId, patientId, { fromTooth, toTooth, type, size, snapshotId });
    return res.status(201).json({ success: true, data: buildClinicalActionDTO(doc) });
  } catch (err) {
    logger.error(`[ClinicalAction] applyElastic: ${err.message}`);
    return res.status(err.statusCode || 500).json({ success: false, error: { code: "ELASTIC_ERROR", message: err.message } });
  }
}

const removeElastic = _makeRemoveHandler(clinicalActionService.removeElastic, "Elastic");

// ══════════════════════════════════════════════════════════════════════════════
// POWERCHAIN
// ══════════════════════════════════════════════════════════════════════════════

async function applyPowerchain(req, res) {
  try {
    authorize(req, "orthodontics.full");
    const { caseId, patientId, arch, segments, type, snapshotId } = req.body;
    if (!_requireBodyFields(res, req.body, ["caseId", "patientId", "arch"])) return;
    if (!_requireIds(res, caseId, patientId)) return;
    await checkCaseOwnership(req, caseId);

    const doc = await clinicalActionService.applyPowerchain(req, caseId, patientId, { arch, segments, type, snapshotId });
    return res.status(201).json({ success: true, data: buildClinicalActionDTO(doc) });
  } catch (err) {
    logger.error(`[ClinicalAction] applyPowerchain: ${err.message}`);
    return res.status(err.statusCode || 500).json({ success: false, error: { code: "POWERCHAIN_ERROR", message: err.message } });
  }
}

const removePowerchain = _makeRemoveHandler(clinicalActionService.removePowerchain, "PowerChain");

// ══════════════════════════════════════════════════════════════════════════════
// ACCESSORY
// ══════════════════════════════════════════════════════════════════════════════

async function addAccessory(req, res) {
  try {
    authorize(req, "orthodontics.full");
    const { caseId, patientId, toothId, type, notes, snapshotId } = req.body;
    if (!_requireBodyFields(res, req.body, ["caseId", "patientId", "toothId", "type"])) return;
    if (!_requireIds(res, caseId, patientId)) return;
    await checkCaseOwnership(req, caseId);

    const doc = await clinicalActionService.addAccessory(req, caseId, patientId, { toothId, type, notes, snapshotId });
    return res.status(201).json({ success: true, data: buildClinicalActionDTO(doc) });
  } catch (err) {
    logger.error(`[ClinicalAction] addAccessory: ${err.message}`);
    return res.status(err.statusCode || 500).json({ success: false, error: { code: "ACCESSORY_ERROR", message: err.message } });
  }
}

const removeAccessory = _makeRemoveHandler(clinicalActionService.removeAccessory, "Accessory");

// ══════════════════════════════════════════════════════════════════════════════
// LIGATURE
// ══════════════════════════════════════════════════════════════════════════════

async function addLigature(req, res) {
  try {
    authorize(req, "orthodontics.full");
    const { caseId, patientId, toothId, type, notes, snapshotId } = req.body;
    if (!_requireBodyFields(res, req.body, ["caseId", "patientId", "toothId", "type"])) return;
    if (!_requireIds(res, caseId, patientId)) return;
    await checkCaseOwnership(req, caseId);

    const doc = await clinicalActionService.addLigature(req, caseId, patientId, { toothId, type, notes, snapshotId });
    return res.status(201).json({ success: true, data: buildClinicalActionDTO(doc) });
  } catch (err) {
    logger.error(`[ClinicalAction] addLigature: ${err.message}`);
    return res.status(err.statusCode || 500).json({ success: false, error: { code: "LIGATURE_ERROR", message: err.message } });
  }
}

const removeLigature = _makeRemoveHandler(clinicalActionService.removeLigature, "Ligature");

// ══════════════════════════════════════════════════════════════════════════════
// IPR
// ══════════════════════════════════════════════════════════════════════════════

async function addIPR(req, res) {
  try {
    authorize(req, "orthodontics.full");
    const { caseId, patientId, betweenTeeth, amount, notes, snapshotId } = req.body;
    if (!_requireBodyFields(res, req.body, ["caseId", "patientId", "betweenTeeth", "amount"])) return;
    if (!_requireIds(res, caseId, patientId)) return;
    if (!Array.isArray(betweenTeeth) || betweenTeeth.length !== 2) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "betweenTeeth must be a 2-element array of tooth IDs" } });
    }
    await checkCaseOwnership(req, caseId);

    const doc = await clinicalActionService.addIPR(req, caseId, patientId, { betweenTeeth, amount: Number(amount), notes, snapshotId });
    return res.status(201).json({ success: true, data: buildClinicalActionDTO(doc) });
  } catch (err) {
    logger.error(`[ClinicalAction] addIPR: ${err.message}`);
    return res.status(err.statusCode || 500).json({ success: false, error: { code: "IPR_ERROR", message: err.message } });
  }
}

const removeIPR = _makeRemoveHandler(clinicalActionService.removeIPR, "IPR");

// ══════════════════════════════════════════════════════════════════════════════
// SPACE MARKER
// ══════════════════════════════════════════════════════════════════════════════

async function addSpaceMarker(req, res) {
  try {
    authorize(req, "orthodontics.full");
    const { caseId, patientId, toothId, type, notes, snapshotId } = req.body;
    if (!_requireBodyFields(res, req.body, ["caseId", "patientId", "toothId", "type"])) return;
    if (!_requireIds(res, caseId, patientId)) return;
    await checkCaseOwnership(req, caseId);

    const doc = await clinicalActionService.addSpaceMarker(req, caseId, patientId, { toothId, type, notes, snapshotId });
    return res.status(201).json({ success: true, data: buildClinicalActionDTO(doc) });
  } catch (err) {
    logger.error(`[ClinicalAction] addSpaceMarker: ${err.message}`);
    return res.status(err.statusCode || 500).json({ success: false, error: { code: "SPACE_MARKER_ERROR", message: err.message } });
  }
}

const removeSpaceMarker = _makeRemoveHandler(clinicalActionService.removeSpaceMarker, "SpaceMarker");

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  listActiveByCase,
  applyArchwire,    removeArchwire,
  applyElastic,     removeElastic,
  applyPowerchain,  removePowerchain,
  addAccessory,     removeAccessory,
  addLigature,      removeLigature,
  addIPR,           removeIPR,
  addSpaceMarker,   removeSpaceMarker,
};
