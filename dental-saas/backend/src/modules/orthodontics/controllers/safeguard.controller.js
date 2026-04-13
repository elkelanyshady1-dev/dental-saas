/**
 * safeguard.controller.js — Clinical State Safeguard Controller (Phase 9)
 *
 * SECURITY MODEL:
 *   1. authorize(req, "orthodontics.read") — RBAC (read for verification)
 *   2. authorize(req, "orthodontics.write") — RBAC (for event pre-validation)
 *   3. checkCaseOwnership(req, caseId) — Ownership guard
 *   4. Service call
 *
 * ENDPOINTS:
 *   POST /safeguard/verify-consistency/:caseId   — UI ↔ DB state comparison
 *   GET  /safeguard/validate-state/:caseId       — Server-side invariant check
 *   POST /safeguard/validate-event/:caseId       — Pre-commit event validation
 *   GET  /safeguard/replay-parity/:caseId        — Snapshot ↔ replay parity check
 *
 * @per-org-compliant — all DB calls via service layer enforce isolation
 */

"use strict";

const safeguardService = require("../services/safeguard.service");
const { authorize }           = require("../../../utils/authorize");
const { checkCaseOwnership }  = require("../utils/ownership.guard");
const { buildStateFromEvents } = require("../services/eventReplay.service");
const mongoose = require("mongoose");

const isValidId = (id) => mongoose.isValidObjectId(id);

/**
 * POST /api/v1/org/safeguard/verify-consistency/:caseId
 *
 * Compares the client-submitted chart state against the server-rebuilt state.
 * Used by the frontend safeguard layer after commit to detect drift.
 *
 * Body: { chartState: ChartState }
 */
async function verifyConsistency(req, res) {
  try {
    authorize(req, "orthodontics.read");

    const { caseId } = req.params;
    if (!caseId || !isValidId(caseId)) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Valid caseId is required" },
      });
    }

    await checkCaseOwnership(req, caseId);

    const { chartState } = req.body;
    if (!chartState || typeof chartState !== "object") {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "chartState is required in request body" },
      });
    }

    const result = await safeguardService.verifyStateConsistency(req, caseId, chartState);

    return res.json({
      success: true,
      data: {
        consistent: result.consistent,
        differences: result.differences,
        // Only include server state in non-production for debugging
        ...(process.env.NODE_ENV !== "production" && { serverState: result.serverState }),
      },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: "CONSISTENCY_CHECK_ERROR", message: err.message },
    });
  }
}

/**
 * GET /api/v1/org/safeguard/validate-state/:caseId
 *
 * Rebuilds the current state from events and runs all backend invariants.
 * Returns the list of violations (if any).
 */
async function validateState(req, res) {
  try {
    authorize(req, "orthodontics.read");

    const { caseId } = req.params;
    if (!caseId || !isValidId(caseId)) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Valid caseId is required" },
      });
    }

    await checkCaseOwnership(req, caseId);

    // Rebuild state from events
    const result = await buildStateFromEvents(req, caseId);
    const chartState = result.chartState ?? result;

    // Run invariants
    const validation = safeguardService.validateChartState(chartState);

    return res.json({
      success: true,
      data: {
        valid: validation.valid,
        violations: validation.violations,
        entityCounts: {
          miniscrews:   (chartState.miniscrews   ?? []).length,
          elastics:     (chartState.elastics     ?? []).length,
          powerChains:  (chartState.powerChains  ?? []).length,
          accessories:  (chartState.accessories  ?? []).length,
          ligatures:    (chartState.ligatures    ?? []).length,
          iprMarkers:   (chartState.iprMarkers   ?? []).length,
          spaceMarkers: (chartState.spaceMarkers ?? []).length,
        },
      },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: "STATE_VALIDATION_ERROR", message: err.message },
    });
  }
}

/**
 * POST /api/v1/org/safeguard/validate-event/:caseId
 *
 * Pre-validates a clinical event against the current server state
 * BEFORE the frontend commits it. Backend-side gatekeeper.
 *
 * Body: { event: ClinicalEvent }
 */
async function validateEvent(req, res) {
  try {
    authorize(req, "orthodontics.write");

    const { caseId } = req.params;
    if (!caseId || !isValidId(caseId)) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Valid caseId is required" },
      });
    }

    await checkCaseOwnership(req, caseId);

    const { event } = req.body;
    if (!event || typeof event !== "object") {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "event is required in request body" },
      });
    }

    const result = await safeguardService.validateEventBeforeCommit(req, caseId, event);

    if (!result.valid) {
      return res.status(422).json({
        success: false,
        error: { code: "EVENT_VALIDATION_FAILED", message: result.error },
      });
    }

    return res.json({ success: true, data: { valid: true } });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: "EVENT_VALIDATION_ERROR", message: err.message },
    });
  }
}

/**
 * GET /api/v1/org/safeguard/replay-parity/:caseId
 *
 * Compares snapshot-based state against full event replay.
 * Detects stale or corrupted snapshots.
 */
async function replayParity(req, res) {
  try {
    authorize(req, "orthodontics.read");

    const { caseId } = req.params;
    if (!caseId || !isValidId(caseId)) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Valid caseId is required" },
      });
    }

    await checkCaseOwnership(req, caseId);

    const result = await safeguardService.verifyReplayParity(req, caseId);

    return res.json({
      success: true,
      data: {
        parity: result.parity,
        differences: result.differences,
      },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: "REPLAY_PARITY_ERROR", message: err.message },
    });
  }
}

module.exports = {
  verifyConsistency,
  validateState,
  validateEvent,
  replayParity,
};
