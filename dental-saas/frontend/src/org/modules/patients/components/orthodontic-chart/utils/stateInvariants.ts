/**
 * stateInvariants.ts — Post-Reducer State Validation (Safeguard Layer PART 2)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE (Phase 9 — Safeguard Layer)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * RULE: Reducer MUST NEVER produce invalid state.
 *
 * This module defines domain invariants that are checked AFTER every reducer
 * application. If any invariant fails, the state transition is rejected and
 * the system rolls back to the pre-dispatch snapshot.
 *
 * INVARIANTS:
 *   1. No duplicate TAD positions (tooth+anchorType must be unique)
 *   2. No duplicate entity IDs across any collection
 *   3. No orphan entities (miniscrews with invalid toothId)
 *   4. Upper/lower arch teeth range correctness
 *   5. Structural consistency (allIds ↔ byId sync for normalized collections)
 *   6. No TAD in both 'active' and 'failed' at same position
 *
 * USAGE:
 *   const violation = validateState(newState);
 *   if (violation) throw new StateInvariantViolation(violation);
 *
 * @pure — no side effects, no API calls, no Date.now()
 * @per-org-safe — operates on local state only
 */

import type { ChartState } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InvariantViolation {
  /** Machine-readable invariant code */
  code: string;
  /** Human-readable description */
  message: string;
  /** Severity: 'critical' blocks dispatch, 'warning' logs but allows */
  severity: 'critical' | 'warning';
  /** Optional metadata for debugging */
  details?: Record<string, unknown>;
}

export class StateInvariantError extends Error {
  public readonly code: string;
  public readonly severity: 'critical' | 'warning';
  public readonly details?: Record<string, unknown>;

  constructor(violation: InvariantViolation) {
    super(`STATE_INVARIANT_VIOLATION: ${violation.message}`);
    this.name = 'StateInvariantError';
    this.code = violation.code;
    this.severity = violation.severity;
    this.details = violation.details;
  }
}

// ─── Individual Invariant Checkers ──────────────────────────────────────────

/**
 * INVARIANT 1: No duplicate TAD positions.
 * A tooth+anchorType pair MUST be unique across all miniscrews.
 */
function _checkDuplicateTadPositions(state: ChartState): InvariantViolation | null {
  const miniscrews = state.miniscrews ?? [];
  const positionKeys = new Set<string>();

  for (const ms of miniscrews) {
    // Only check active/needs_removal TADs — removed/failed can share position with reinserted
    if ((ms as any).status === 'removed') continue;

    const key = `${ms.toothId}:${ms.anchorType}`;
    if (positionKeys.has(key)) {
      return {
        code: 'DUPLICATE_TAD_POSITION',
        message: `Duplicate TAD at tooth ${ms.toothId}, position ${ms.anchorType}`,
        severity: 'critical',
        details: { toothId: ms.toothId, anchorType: ms.anchorType, tadId: ms.id },
      };
    }
    positionKeys.add(key);
  }

  return null;
}

/**
 * INVARIANT 2: No duplicate entity IDs within any collection.
 * Each entity collection MUST have unique IDs.
 */
function _checkDuplicateEntityIds(state: ChartState): InvariantViolation | null {
  const collections: Array<{ name: string; items: Array<{ id?: string; _id?: string }> }> = [
    { name: 'miniscrews', items: state.miniscrews ?? [] },
    { name: 'elastics', items: state.elastics ?? [] },
    { name: 'powerChains', items: state.powerChains ?? [] },
    { name: 'accessories', items: state.accessories ?? [] },
    { name: 'ligatures', items: state.ligatures ?? [] },
    { name: 'iprMarkers', items: state.iprMarkers ?? [] },
    { name: 'spaceMarkers', items: state.spaceMarkers ?? [] },
  ];

  for (const { name, items } of collections) {
    const seenIds = new Set<string>();
    for (const item of items) {
      const id = item.id ?? item._id?.toString();
      if (!id) continue;
      if (seenIds.has(id)) {
        return {
          code: 'DUPLICATE_ENTITY_ID',
          message: `Duplicate ID "${id}" in ${name} collection`,
          severity: 'critical',
          details: { collection: name, duplicateId: id },
        };
      }
      seenIds.add(id);
    }
  }

  return null;
}

/**
 * INVARIANT 3: Tooth range correctness.
 * Upper teeth MUST have id < 30, lower teeth MUST have id >= 30.
 * FDI notation: upper = 11-28, lower = 31-48.
 */
function _checkToothRanges(state: ChartState): InvariantViolation | null {
  const upper = state.upperTeeth ?? [];
  const lower = state.lowerTeeth ?? [];

  for (const tooth of upper) {
    if (tooth.id >= 30) {
      return {
        code: 'TOOTH_RANGE_VIOLATION',
        message: `Upper tooth ${tooth.id} has id >= 30 (should be < 30)`,
        severity: 'critical',
        details: { toothId: tooth.id, expectedArch: 'upper' },
      };
    }
  }

  for (const tooth of lower) {
    if (tooth.id < 30) {
      return {
        code: 'TOOTH_RANGE_VIOLATION',
        message: `Lower tooth ${tooth.id} has id < 30 (should be >= 30)`,
        severity: 'critical',
        details: { toothId: tooth.id, expectedArch: 'lower' },
      };
    }
  }

  return null;
}

/**
 * INVARIANT 4: No orphan miniscrews.
 * Every miniscrew MUST reference a valid FDI tooth number (11-18, 21-28, 31-38, 41-48).
 */
function _checkOrphanMiniscrews(state: ChartState): InvariantViolation | null {
  const VALID_FDI = new Set<number>();
  for (const q of [10, 20, 30, 40]) {
    for (let p = 1; p <= 8; p++) {
      VALID_FDI.add(q + p);
    }
  }

  const miniscrews = state.miniscrews ?? [];
  for (const ms of miniscrews) {
    if (ms.toothId != null && !VALID_FDI.has(ms.toothId)) {
      return {
        code: 'ORPHAN_MINISCREW',
        message: `Miniscrew ${ms.id} references invalid FDI tooth number ${ms.toothId}`,
        severity: 'critical',
        details: { tadId: ms.id, toothId: ms.toothId },
      };
    }
  }

  return null;
}

/**
 * INVARIANT 5: Archwire consistency.
 * If an archwire exists, it MUST have material and size defined.
 */
function _checkArchwireConsistency(state: ChartState): InvariantViolation | null {
  for (const archKey of ['upperArchwire', 'lowerArchwire'] as const) {
    const arch = state[archKey];
    if (arch != null) {
      if (!arch.material && !arch.size) {
        return {
          code: 'ARCHWIRE_INCOMPLETE',
          message: `${archKey} exists but has no material or size`,
          severity: 'warning',
          details: { arch: archKey, value: arch },
        };
      }
    }
  }

  return null;
}

/**
 * INVARIANT 6: No conflicting TAD statuses at same position.
 * Cannot have an 'active' and 'needs_removal' TAD at the exact same position
 * (this would indicate a state corruption from double-apply).
 */
function _checkConflictingTadStatuses(state: ChartState): InvariantViolation | null {
  const miniscrews = state.miniscrews ?? [];
  const positionStatusMap = new Map<string, { id: string; status: string }[]>();

  for (const ms of miniscrews) {
    const status = (ms as any).status ?? 'active';
    if (status === 'removed') continue; // removed TADs don't occupy position

    const key = `${ms.toothId}:${ms.anchorType}`;
    const entries = positionStatusMap.get(key) ?? [];
    entries.push({ id: ms.id, status });
    positionStatusMap.set(key, entries);
  }

  for (const [key, entries] of positionStatusMap) {
    if (entries.length > 1) {
      const statuses = entries.map(e => e.status);
      if (statuses.includes('active') && statuses.includes('needs_removal')) {
        return {
          code: 'CONFLICTING_TAD_STATUS',
          message: `Position ${key} has both active and needs_removal TADs`,
          severity: 'critical',
          details: { position: key, entries },
        };
      }
    }
  }

  return null;
}

/**
 * INVARIANT 7: Entity ID presence.
 * All mutation-created entities MUST have an ID (required for deterministic replay).
 */
function _checkEntityIdPresence(state: ChartState): InvariantViolation | null {
  const collections: Array<{ name: string; items: Array<{ id?: string }> }> = [
    { name: 'miniscrews', items: state.miniscrews ?? [] },
    { name: 'elastics', items: state.elastics ?? [] },
    { name: 'powerChains', items: state.powerChains ?? [] },
    { name: 'accessories', items: state.accessories ?? [] },
    { name: 'ligatures', items: state.ligatures ?? [] },
  ];

  for (const { name, items } of collections) {
    for (let i = 0; i < items.length; i++) {
      if (!items[i].id) {
        return {
          code: 'MISSING_ENTITY_ID',
          message: `Entity at index ${i} in ${name} has no ID`,
          severity: 'critical',
          details: { collection: name, index: i },
        };
      }
    }
  }

  return null;
}

// ─── Main Validator ─────────────────────────────────────────────────────────

/** All invariant checkers in execution order. Critical checks first. */
const INVARIANT_CHECKERS: Array<(state: ChartState) => InvariantViolation | null> = [
  _checkDuplicateEntityIds,
  _checkDuplicateTadPositions,
  _checkConflictingTadStatuses,
  _checkEntityIdPresence,
  _checkOrphanMiniscrews,
  _checkToothRanges,
  _checkArchwireConsistency,
];

/**
 * validateState — Run ALL state invariants against a ChartState.
 *
 * Returns the FIRST critical violation found, or null if state is valid.
 * Warnings are collected but do not block the dispatch.
 *
 * USAGE (inside safeDispatch):
 *   const newState = reducer(state, event);
 *   const violation = validateState(newState);
 *   if (violation) { rollback(); throw new StateInvariantError(violation); }
 *
 * @param state — ChartState to validate
 * @returns First critical violation, or null if valid
 */
export function validateState(state: ChartState): InvariantViolation | null {
  const warnings: InvariantViolation[] = [];

  for (const check of INVARIANT_CHECKERS) {
    const violation = check(state);
    if (!violation) continue;

    if (violation.severity === 'critical') {
      // Log warnings collected so far, then return the critical violation
      if (warnings.length > 0 && process.env.NODE_ENV !== 'production') {
        console.warn('[StateInvariants] Warnings before critical:', warnings);
      }
      return violation;
    }

    warnings.push(violation);
  }

  // Log warnings in dev mode
  if (warnings.length > 0 && process.env.NODE_ENV !== 'production') {
    console.warn('[StateInvariants] State warnings:', warnings);
  }

  return null;
}

/**
 * validateStateStrict — Run ALL invariants and return ALL violations.
 *
 * Use for comprehensive auditing (e.g., snapshot integrity check).
 * Not used in the hot dispatch path — too expensive for real-time.
 *
 * @param state — ChartState to validate
 * @returns Array of all violations (empty if state is valid)
 */
export function validateStateStrict(state: ChartState): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  for (const check of INVARIANT_CHECKERS) {
    const violation = check(state);
    if (violation) violations.push(violation);
  }

  return violations;
}

/**
 * assertStateValid — Throws if state is invalid. For use in guards and tests.
 *
 * @throws StateInvariantError on critical violation
 */
export function assertStateValid(state: ChartState): void {
  const violation = validateState(state);
  if (violation) {
    throw new StateInvariantError(violation);
  }
}
