/**
 * safeguard.service.js — Clinical State Safeguard Service (Phase 9)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ROLE: Backend state consistency verification and invariant enforcement.
 *
 * This service provides:
 *   1. State consistency verification (UI ↔ DB comparison endpoint)
 *   2. Post-reducer state invariant validation (backend-side)
 *   3. Snapshot ↔ event replay parity check
 *   4. Orphan detection and cleanup reporting
 *
 * INVARIANTS:
 *   - ALL functions enforce DB isolation via req.dbConnection
 *   - PURE validation functions have no side effects
 *   - Consistency checks are READ-ONLY — never mutate state
 *
 * @per-org-compliant — all DB calls enforce req.dbConnection isolation
 */

"use strict";

const enforceDbIsolation = require("../../../core/db/dbIsolation.guard");
const getModel           = require("../../../core/db/getModel");
const ClinicalEventDef   = require("../models/ClinicalEvent.model");
const logger             = require("@utils/logger");
const {
  buildStateFromEvents,
  buildClinicalState,
  getInitialClinicalState,
  replayEvents,
  getAllEventsForCase,
} = require("./eventReplay.service");
const {
  applyClinicalEvent,
  upgradeEvent,
} = require("../shared/clinicalReducer");

// ─── Valid FDI tooth numbers ────────────────────────────────────────────────
const VALID_FDI = new Set();
for (const q of [10, 20, 30, 40]) {
  for (let p = 1; p <= 8; p++) {
    VALID_FDI.add(q + p);
  }
}

// ─── PART 2: Backend State Invariant Validation ─────────────────────────────

/**
 * validateChartState — Run domain invariants against a chart state.
 *
 * PURE — no DB calls, no side effects.
 * Mirrors the frontend stateInvariants.ts checks on the backend.
 *
 * @param {Object} state — Chart state to validate
 * @returns {{ valid: boolean, violations: Array<{ code: string, message: string, severity: string }> }}
 */
function validateChartState(state) {
  const violations = [];

  // ── Invariant 1: No duplicate TAD positions ─────────────────────────────
  {
    const positionKeys = new Set();
    for (const ms of (state.miniscrews ?? [])) {
      if (ms.status === "removed") continue;
      const key = `${ms.toothId}:${ms.anchorType}`;
      if (positionKeys.has(key)) {
        violations.push({
          code: "DUPLICATE_TAD_POSITION",
          message: `Duplicate TAD at tooth ${ms.toothId}, position ${ms.anchorType}`,
          severity: "critical",
        });
      }
      positionKeys.add(key);
    }
  }

  // ── Invariant 2: No duplicate entity IDs ────────────────────────────────
  {
    const collections = [
      { name: "miniscrews", items: state.miniscrews ?? [] },
      { name: "elastics",   items: state.elastics   ?? [] },
      { name: "powerChains", items: state.powerChains ?? [] },
      { name: "accessories", items: state.accessories ?? [] },
      { name: "ligatures",   items: state.ligatures   ?? [] },
      { name: "iprMarkers",  items: state.iprMarkers  ?? [] },
      { name: "spaceMarkers", items: state.spaceMarkers ?? [] },
    ];

    for (const { name, items } of collections) {
      const seenIds = new Set();
      for (const item of items) {
        const id = item.id ?? item._id?.toString();
        if (!id) continue;
        if (seenIds.has(id)) {
          violations.push({
            code: "DUPLICATE_ENTITY_ID",
            message: `Duplicate ID "${id}" in ${name}`,
            severity: "critical",
          });
        }
        seenIds.add(id);
      }
    }
  }

  // ── Invariant 3: Tooth range correctness ────────────────────────────────
  for (const tooth of (state.upperTeeth ?? [])) {
    if (tooth.id >= 30) {
      violations.push({
        code: "TOOTH_RANGE_VIOLATION",
        message: `Upper tooth ${tooth.id} has id >= 30`,
        severity: "critical",
      });
    }
  }
  for (const tooth of (state.lowerTeeth ?? [])) {
    if (tooth.id < 30) {
      violations.push({
        code: "TOOTH_RANGE_VIOLATION",
        message: `Lower tooth ${tooth.id} has id < 30`,
        severity: "critical",
      });
    }
  }

  // ── Invariant 4: No orphan miniscrews ───────────────────────────────────
  for (const ms of (state.miniscrews ?? [])) {
    if (ms.toothId != null && !VALID_FDI.has(ms.toothId)) {
      violations.push({
        code: "ORPHAN_MINISCREW",
        message: `Miniscrew ${ms.id} references invalid FDI tooth ${ms.toothId}`,
        severity: "critical",
      });
    }
  }

  // ── Invariant 5: All entity IDs present ─────────────────────────────────
  for (const name of ["miniscrews", "elastics", "powerChains", "accessories", "ligatures"]) {
    const items = state[name] ?? [];
    for (let i = 0; i < items.length; i++) {
      if (!items[i].id && !items[i]._id) {
        violations.push({
          code: "MISSING_ENTITY_ID",
          message: `Entity at index ${i} in ${name} has no ID`,
          severity: "critical",
        });
      }
    }
  }

  return {
    valid: violations.filter((v) => v.severity === "critical").length === 0,
    violations,
  };
}

// ─── PART 3: UI ↔ DB Consistency Verification ──────────────────────────────

/**
 * verifyStateConsistency — Compare client-submitted state against server-derived state.
 *
 * The server rebuilds the current state from events (source of truth),
 * then compares it structurally against what the UI believes is the state.
 *
 * @param {Object} req      — Express request (for DB isolation)
 * @param {string} caseId   — Orthodontic case ID
 * @param {Object} uiState  — The chart state as reported by the frontend
 * @returns {{ consistent: boolean, differences: string[], serverState: Object }}
 */
async function verifyStateConsistency(req, caseId, uiState) {
  enforceDbIsolation(req);

  // Rebuild authoritative state from events
  const serverResult = await buildStateFromEvents(req, caseId);
  const serverState  = serverResult.chartState ?? serverResult;

  const differences = [];

  // ── Entity count comparison ─────────────────────────────────────────────
  const checks = [
    { name: "miniscrews",   ui: (uiState.miniscrews   ?? []).length, db: (serverState.miniscrews   ?? []).length },
    { name: "elastics",     ui: (uiState.elastics     ?? []).length, db: (serverState.elastics     ?? []).length },
    { name: "powerChains",  ui: (uiState.powerChains  ?? []).length, db: (serverState.powerChains  ?? []).length },
    { name: "accessories",  ui: (uiState.accessories  ?? []).length, db: (serverState.accessories  ?? []).length },
    { name: "ligatures",    ui: (uiState.ligatures    ?? []).length, db: (serverState.ligatures    ?? []).length },
    { name: "iprMarkers",   ui: (uiState.iprMarkers   ?? []).length, db: (serverState.iprMarkers   ?? []).length },
    { name: "spaceMarkers", ui: (uiState.spaceMarkers ?? []).length, db: (serverState.spaceMarkers ?? []).length },
  ];

  for (const { name, ui, db } of checks) {
    if (ui !== db) {
      differences.push(`${name}: UI=${ui}, DB=${db}`);
    }
  }

  // ── Archwire comparison ─────────────────────────────────────────────────
  if (!!uiState.upperArchwire !== !!serverState.upperArchwire) {
    differences.push(`upperArchwire: UI=${!!uiState.upperArchwire}, DB=${!!serverState.upperArchwire}`);
  }
  if (!!uiState.lowerArchwire !== !!serverState.lowerArchwire) {
    differences.push(`lowerArchwire: UI=${!!uiState.lowerArchwire}, DB=${!!serverState.lowerArchwire}`);
  }

  // ── Entity ID set comparison ────────────────────────────────────────────
  const uiMsIds  = new Set((uiState.miniscrews ?? []).map((m) => m.id ?? m._id?.toString()));
  const dbMsIds  = new Set((serverState.miniscrews ?? []).map((m) => m.id ?? m._id?.toString()));

  for (const id of uiMsIds) {
    if (id && !dbMsIds.has(id)) differences.push(`miniscrew ${id}: in UI but not DB`);
  }
  for (const id of dbMsIds) {
    if (id && !uiMsIds.has(id)) differences.push(`miniscrew ${id}: in DB but not UI`);
  }

  const consistent = differences.length === 0;

  if (!consistent) {
    logger.warn({
      event:       "STATE_CONSISTENCY_MISMATCH",
      caseId,
      orgId:       req.context.organizationId,
      differences,
      diffCount:   differences.length,
    }, "[Safeguard] UI ↔ DB state mismatch detected");
  }

  return { consistent, differences, serverState };
}

// ─── Snapshot ↔ Event Replay Parity Check ───────────────────────────────────

/**
 * verifyReplayParity — Rebuild state from scratch (no snapshot) and compare
 * against the snapshot-accelerated build.
 *
 * If they differ, the snapshot is stale or corrupted and should be rebuilt.
 *
 * @param {Object} req      — Express request
 * @param {string} caseId   — Case ID
 * @returns {{ parity: boolean, differences: string[] }}
 */
async function verifyReplayParity(req, caseId) {
  enforceDbIsolation(req);

  // 1. Build from snapshot (fast path)
  const snapshotState = await buildClinicalState(req, caseId);

  // 2. Build from zero (slow path — full replay)
  const events = await getAllEventsForCase(req, caseId);
  let zeroState = getInitialClinicalState();
  for (const evt of events) {
    try {
      const upgraded = upgradeEvent(evt);
      zeroState = applyClinicalEvent(zeroState, upgraded);
    } catch {
      // Skip malformed events (same behavior as buildStateFromEvents)
    }
  }

  const differences = [];

  // Compare entity counts
  const collections = ["miniscrews", "elastics", "powerChains", "accessories", "ligatures", "iprMarkers", "spaceMarkers"];
  for (const name of collections) {
    const snapshotLen = (snapshotState.chartState?.[name] ?? snapshotState[name] ?? []).length;
    const replayLen   = (zeroState[name] ?? []).length;
    if (snapshotLen !== replayLen) {
      differences.push(`${name}: snapshot=${snapshotLen}, replay=${replayLen}`);
    }
  }

  // Compare archwires
  const snapUpper = !!(snapshotState.chartState?.upperArchwire ?? snapshotState.upperArchwire);
  const replayUpper = !!zeroState.upperArchwire;
  if (snapUpper !== replayUpper) differences.push(`upperArchwire: snapshot=${snapUpper}, replay=${replayUpper}`);

  const snapLower = !!(snapshotState.chartState?.lowerArchwire ?? snapshotState.lowerArchwire);
  const replayLower = !!zeroState.lowerArchwire;
  if (snapLower !== replayLower) differences.push(`lowerArchwire: snapshot=${snapLower}, replay=${replayLower}`);

  const parity = differences.length === 0;

  if (!parity) {
    logger.warn({
      event:       "REPLAY_PARITY_MISMATCH",
      caseId,
      orgId:       req.context.organizationId,
      differences,
    }, "[Safeguard] Snapshot ↔ Replay parity mismatch — snapshot may be stale");
  }

  return { parity, differences };
}

// ─── Pre-Commit Event Validation ────────────────────────────────────────────

/**
 * validateEventBeforeCommit — Validates a clinical event against the current
 * server-side state BEFORE persisting it.
 *
 * This is the backend equivalent of the frontend's validateEvent().
 * It ensures that even if the frontend is compromised or stale, the backend
 * rejects invalid mutations.
 *
 * @param {Object} req     — Express request
 * @param {string} caseId  — Case ID
 * @param {Object} event   — Clinical event to validate
 * @returns {{ valid: boolean, error?: string }}
 */
async function validateEventBeforeCommit(req, caseId, event) {
  enforceDbIsolation(req);

  // Build current state from events
  const result = await buildStateFromEvents(req, caseId);
  const state  = result.chartState ?? result;

  // Structural contract
  if (!event.eventId) return { valid: false, error: "Missing eventId" };
  if (!event.type)    return { valid: false, error: "Missing type" };
  if (!event.payload) return { valid: false, error: "Missing payload" };

  // Domain-specific validation
  switch (event.type) {
    case "TAD_INSERTED": {
      const tooth = event.payload.toothNumber ?? event.payload.toothId;
      if (tooth == null) return { valid: false, error: "TAD_INSERTED requires toothNumber" };

      // FDI validation
      const quadrant = Math.floor(tooth / 10);
      const position = tooth % 10;
      if (![1, 2, 3, 4].includes(quadrant) || position < 1 || position > 8) {
        return { valid: false, error: `Invalid FDI tooth: ${tooth}` };
      }

      // Duplicate check
      const anchorType = event.payload.chartPosition?.anchorType ?? event.payload.position ?? "mesial";
      const existing   = (state.miniscrews ?? []).find(
        (ms) => ms.toothId === tooth && ms.anchorType === anchorType && ms.status !== "removed"
      );
      if (existing) {
        return { valid: false, error: `Duplicate TAD at tooth ${tooth}, position ${anchorType}` };
      }
      break;
    }

    case "TAD_REMOVED":
    case "TAD_FAILED":
    case "TAD_REINSERTED":
    case "TAD_MARKED_FOR_REMOVAL": {
      const tadId = event.payload.tadId ?? event.payload._id;
      if (!tadId) return { valid: false, error: `${event.type} requires tadId` };

      const tad = (state.miniscrews ?? []).find(
        (ms) => ms.id === tadId || ms._id?.toString() === tadId.toString()
      );
      if (!tad) return { valid: false, error: `TAD ${tadId} not found` };

      if (event.type === "TAD_REMOVED" && tad.status === "removed") {
        return { valid: false, error: `TAD ${tadId} already removed` };
      }
      if (event.type === "TAD_REINSERTED" && tad.status !== "failed") {
        return { valid: false, error: `TAD ${tadId} can only be reinserted from failed (current: ${tad.status})` };
      }
      break;
    }

    case "ELASTIC_APPLIED":
    case "POWERCHAIN_APPLIED":
    case "ACCESSORY_ADDED":
    case "LIGATURE_ADDED":
    case "IPR_ADDED":
    case "SPACE_MARKER_ADDED": {
      const entityId = event.payload._id ?? event.payload.actionId;
      if (!entityId) {
        return { valid: false, error: `${event.type} requires _id or actionId` };
      }
      break;
    }

    case "ARCHWIRE_PLACED":
    case "ARCHWIRE_REMOVED": {
      if (!event.payload.arch || !["upper", "lower"].includes(event.payload.arch)) {
        return { valid: false, error: `${event.type} requires arch = 'upper' | 'lower'` };
      }
      if (event.type === "ARCHWIRE_REMOVED") {
        const archKey = event.payload.arch === "upper" ? "upperArchwire" : "lowerArchwire";
        if (!state[archKey]) {
          return { valid: false, error: `Cannot remove ${event.payload.arch} archwire — none exists` };
        }
      }
      break;
    }
  }

  // Dry-run the reducer and validate output
  try {
    const upgraded = upgradeEvent({ ...event, version: event.version ?? 1 });
    const newState = applyClinicalEvent(state, upgraded);
    const validation = validateChartState(newState);

    if (!validation.valid) {
      const critical = validation.violations.find((v) => v.severity === "critical");
      return {
        valid: false,
        error: `Post-reduce invariant violation: ${critical?.message ?? "unknown"}`,
      };
    }
  } catch (err) {
    return { valid: false, error: `Reducer error: ${err.message}` };
  }

  return { valid: true };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // State validation (pure)
  validateChartState,
  // Consistency checks (DB reads)
  verifyStateConsistency,
  verifyReplayParity,
  // Pre-commit validation (DB reads + dry-run)
  validateEventBeforeCommit,
};
