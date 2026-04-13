/**
 * clinicalEvent.controller.js — Unified Clinical Event Engine V1
 *
 * SECURITY MODEL:
 *   1. authorize(req, "orthodontics.read") — RBAC
 *   2. checkCaseOwnership(req, caseId) — Ownership guard
 *   3. Service call
 */

"use strict";

const clinicalEventService = require("../services/clinicalEvent.service");
const { authorize } = require("../../../utils/authorize");
const { checkCaseOwnership } = require("../utils/ownership.guard");
const mongoose = require("mongoose");

const isValidId = (id) => mongoose.isValidObjectId(id);
const { buildClinicalEventDTO, buildClinicalEventListItemDTO } = require("../clinical/dto/clinicalEvent.dto");

/**
 * GET /api/v1/org/events/case/:caseId
 * Fetch clinical event timeline for a case.
 */
async function getCaseEvents(req, res) {
  try {
    authorize(req, "orthodontics.read");

    const { caseId } = req.params;
    const { type, severity, limit } = req.query;

    if (!caseId || !isValidId(caseId)) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Valid caseId is required" },
      });
    }

    await checkCaseOwnership(req, caseId);

    const events = await clinicalEventService.getEventsByCase(req, caseId, {
      limit: limit ? parseInt(limit) : 100,
      type: type || undefined,
      severity: severity || undefined,
    });

    return res.json({ success: true, data: events.map(buildClinicalEventDTO) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: "EVENT_FETCH_ERROR", message: err.message },
    });
  }
}

/**
 * GET /api/v1/org/events/recent
 * Fetch recent clinical events (dashboard).
 */
async function getRecentEvents(req, res) {
  try {
    authorize(req, "orthodontics.read");

    const { types, severity, limit } = req.query;

    const events = await clinicalEventService.getRecentEvents(req, {
      limit: limit ? parseInt(limit) : 50,
      types: types ? types.split(",") : undefined,
      severity: severity || undefined,
    });

    return res.json({ success: true, data: events.map(buildClinicalEventListItemDTO) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: "EVENT_FETCH_ERROR", message: err.message },
    });
  }
}

/**
 * GET /api/v1/org/events/critical
 * Fetch unresolved critical events (alerts).
 */
async function getCriticalEvents(req, res) {
  try {
    authorize(req, "orthodontics.read");

    const { limit } = req.query;

    const events = await clinicalEventService.getCriticalEvents(req, {
      limit: limit ? parseInt(limit) : 20,
    });

    return res.json({ success: true, data: events.map(buildClinicalEventDTO) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: "EVENT_FETCH_ERROR", message: err.message },
    });
  }
}

module.exports = {
  getCaseEvents,
  getRecentEvents,
  getCriticalEvents,
};
