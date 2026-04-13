/**
 * validateReplay.ts — Production-Hardened Replay Validation Utility
 *
 * ════════════════════════════════════════════════════════════════════════════
 * PHASE 8: PRODUCTION HARDENING — SNAPSHOT + UNDO/REDO DRIFT DETECTION
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PURPOSE:
 *   After a snapshot save, after undo/redo operations, and always in dev mode,
 *   this utility replays ALL events against a base state and compares the
 *   replayed result against the current state to detect drift/corruption.
 *
 * INVARIANTS:
 *   - PURE function — no side effects except console.warn in the wrapper
 *   - Uses applyClinicalEvent (raw) to replay without idempotency filtering
 *   - Deep structural comparison ignores internal bookkeeping fields
 *   - Returns detailed driftKeys array for debugging
 *   - Safe for production (logs warnings, does not throw)
 *
 * USAGE:
 *   // After snapshot save or undo/redo
 *   const result = validateReplay(baseState, events, currentState);
 *   if (!result.valid) {
 *     console.warn('State drift detected:', result.driftKeys);
 *   }
 *
 *   // In production: silent verification
 *   // In dev mode: always verify + console.warn on drift
 *
 * DESIGN NOTES:
 *   - We use raw applyClinicalEvent (not applyClinicalEventSafe)
 *     because applyClinicalEventSafe includes idempotency logic that would
 *     hide true drift. We want to see if replaying events produces
 *     identical state.
 *   - Ignored fields: _processedEventIds, _meta, internal bookkeeping
 *   - Structural diff finds the minimal set of divergent keys
 */

import type { ChartState } from '../types';
import { applyClinicalEvent, upgradeEvent, type ClinicalEventLike } from './clinicalReducer';

// ─── Core Validation Types ──────────────────────────────────────────────────

export interface ReplayValidationResult {
  /** True if replayed state === current state (within tolerance) */
  valid: boolean;
  /** The state after replaying all events from base */
  replayedState: ChartState;
  /** Array of key paths where state diverged (e.g., ['miniscrews[0].id', 'upperTeeth']) */
  driftKeys: string[];
  /** Human-readable summary of validation result */
  details: string;
}

// ─── Structural Diff Engine ────────────────────────────────────────────────

/**
 * _deepEqual — Recursive structural equality check.
 *
 * Compares two values recursively, handling nested objects and arrays.
 * Treats undefined and null as different (strict comparison).
 * Used by _structuralDiff to find divergent paths.
 *
 * @param a — first value
 * @param b — second value
 * @returns true if structurally equal
 */
function _deepEqual(a: any, b: any): boolean {
  // Primitive types
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a === null || b === null) return false;

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => _deepEqual(val, b[idx]));
  }

  // Objects
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) => _deepEqual(a[key], b[key]));
}

/**
 * _structuralDiff — Find all key paths where two states diverge.
 *
 * Recursively walks both objects and collects paths to any value mismatch.
 * Returns an empty array if objects are deeply equal.
 * Used to pinpoint which parts of state are affected by drift.
 *
 * IGNORED FIELDS (internal bookkeeping):
 *   - _processedEventIds
 *   - _meta
 *   - Any field starting with _
 *
 * @param a — first state (or sub-object)
 * @param b — second state (or sub-object)
 * @param path — current key path (for recursion)
 * @returns array of divergent key paths
 */
function _structuralDiff(a: any, b: any, path: string = ''): string[] {
  const drifts: string[] = [];

  // Ignore internal bookkeeping fields
  if (path.includes('_processedEventIds') || path.includes('_meta') || path.endsWith('_')) {
    return drifts;
  }

  // Primitives and null/undefined
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    if (!_deepEqual(a, b)) {
      drifts.push(path || '<root>');
    }
    return drifts;
  }

  // Array length mismatch
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      drifts.push(`${path || '<root>'}.length`);
      return drifts;
    }
    // Recursively compare array elements
    for (let i = 0; i < a.length; i++) {
      const newPath = path ? `${path}[${i}]` : `[${i}]`;
      drifts.push(..._structuralDiff(a[i], b[i], newPath));
    }
    return drifts;
  }

  // Both must be objects (one array, one not is a type mismatch)
  if (Array.isArray(a) !== Array.isArray(b)) {
    drifts.push(path || '<root>');
    return drifts;
  }

  // Object key mismatch
  const keysA = new Set(Object.keys(a));
  const keysB = new Set(Object.keys(b));
  const allKeys = new Set([...keysA, ...keysB]);

  for (const key of allKeys) {
    if (key.startsWith('_')) continue; // Skip internal fields

    const newPath = path ? `${path}.${key}` : key;
    const hasInA = keysA.has(key);
    const hasInB = keysB.has(key);

    if (hasInA && !hasInB) {
      drifts.push(`${newPath} (missing in current)`);
      continue;
    }
    if (!hasInA && hasInB) {
      drifts.push(`${newPath} (extra in current)`);
      continue;
    }

    // Both have key — recurse
    drifts.push(..._structuralDiff(a[key], b[key], newPath));
  }

  return drifts;
}

// ─── Core Validation Logic ──────────────────────────────────────────────────

/**
 * validateReplay — Deterministic state reconstruction and validation.
 *
 * Replays all events from baseState and compares result against currentState.
 * This is the core validation logic (pure, no side effects).
 *
 * ALGORITHM:
 *   1. Start with baseState
 *   2. For each event in order:
 *      - Upgrade event (version migration)
 *      - Apply event using raw applyClinicalEvent
 *      - Store intermediate state
 *   3. Deep-compare final replayed state vs currentState
 *   4. Return validation result with drift keys
 *
 * IMPORTANT:
 *   - Uses raw applyClinicalEvent (not applyClinicalEventSafe)
 *     to avoid idempotency masking. We want to see if events are deterministic.
 *   - If any event throws, the error is propagated (signals data corruption)
 *   - Returns detailed driftKeys for debugging/logging
 *
 * @param baseState — the state to start replay from (e.g., snapshot)
 * @param events — array of clinical events to replay
 * @param currentState — the state we expect after applying all events
 * @returns validation result with validity, replayed state, and drift keys
 * @throws if any event upgrade/application fails (signals corruption)
 */
export function validateReplay(
  baseState: ChartState,
  events: ClinicalEventLike[],
  currentState: ChartState,
): ReplayValidationResult {
  let replayedState = baseState;

  // ─ Replay all events from base ──────────────────────────────────────────
  try {
    for (const event of events) {
      const upgraded = upgradeEvent(event);
      replayedState = applyClinicalEvent(replayedState, upgraded);
    }
  } catch (err) {
    // Event application failed — data corruption or invalid event
    const driftKeys = _structuralDiff(replayedState, currentState);
    const errorMessage = err instanceof Error ? err.message : String(err);

    return {
      valid: false,
      replayedState,
      driftKeys,
      details: `Event replay failed: ${errorMessage}. Drifted keys: ${driftKeys.join(', ')}`,
    };
  }

  // ─ Compare replayed vs current ──────────────────────────────────────────
  const driftKeys = _structuralDiff(replayedState, currentState);
  const valid = driftKeys.length === 0;

  const details = valid
    ? `Replay validation passed: ${events.length} events replayed, state matches current`
    : `Replay validation failed: ${driftKeys.length} drift point(s) detected: ${driftKeys.slice(0, 5).join(', ')}${driftKeys.length > 5 ? '...' : ''}`;

  return {
    valid,
    replayedState,
    driftKeys,
    details,
  };
}

// ─── Production Wrapper ──────────────────────────────────────────────────────

/**
 * validateReplayAfterSave — Production-safe validation wrapper.
 *
 * Calls validateReplay and logs warnings if drift is detected.
 * Safe for production use — logs warnings but does not throw.
 *
 * BEHAVIOR:
 *   - In dev mode: ALWAYS validates and warns on any drift
 *   - In production: validates silently, warns only if drift detected
 *   - Never throws — errors are logged and returned in result
 *
 * LOGGING:
 *   - console.warn() on drift detection (key paths and summary)
 *   - context describes when validation occurred (after save, undo, etc.)
 *
 * @param baseState — snapshot or checkpoint state
 * @param events — array of clinical events to replay
 * @param currentState — current chart state after mutations
 * @param context — optional description of validation context (e.g., "after snapshot save")
 * @returns validation result
 */
export function validateReplayAfterSave(
  baseState: ChartState,
  events: ClinicalEventLike[],
  currentState: ChartState,
  context: string = 'after mutation',
): ReplayValidationResult {
  const result = validateReplay(baseState, events, currentState);

  if (process.env.NODE_ENV === 'development' || !result.valid) {
    if (!result.valid) {
      console.warn(
        `[DRIFT] Replay validation failed ${context}:`,
        {
          driftKeys: result.driftKeys,
          details: result.details,
          eventCount: events.length,
          timestamp: new Date().toISOString(),
        },
      );
    } else if (process.env.NODE_ENV === 'development') {
      // In dev mode, log successful validations for audit
      console.debug(
        `[REPLAY_OK] Validated ${events.length} events ${context}`,
        { details: result.details },
      );
    }
  }

  return result;
}

// ─── Dev-Mode Utilities ──────────────────────────────────────────────────────

/**
 * debugReplay — Step-by-step event replay with detailed logging.
 *
 * Replays events one by one and logs the result of each step.
 * Use for investigating drift or verifying event handling logic.
 * Only call in dev mode — performance is poor for large event streams.
 *
 * OUTPUT:
 *   - Each step: event type, payload, resulting state hash
 *   - After each event: summary of state changes
 *   - Final: overall validation result
 *
 * @param baseState — initial state
 * @param events — events to replay
 * @param currentState — expected final state
 * @returns same as validateReplay, but with console.debug output
 */
export function debugReplay(
  baseState: ChartState,
  events: ClinicalEventLike[],
  currentState: ChartState,
): ReplayValidationResult {
  let replayedState = baseState;
  const stateSnapshots: Array<{ step: number; state: ChartState; eventType: string }> = [];

  console.debug('[DEBUG REPLAY] Starting deterministic replay...');
  console.debug(`[DEBUG REPLAY] Base state:`, baseState);
  console.debug(`[DEBUG REPLAY] Event stream length: ${events.length}`);

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    try {
      const upgraded = upgradeEvent(event);
      const prevState = replayedState;
      replayedState = applyClinicalEvent(replayedState, upgraded);

      const changed = !_deepEqual(prevState, replayedState);
      console.debug(
        `[STEP ${i + 1}/${events.length}] ${event.type}`,
        {
          eventId: event.eventId,
          changed,
          payload: event.payload,
        },
      );

      stateSnapshots.push({
        step: i + 1,
        state: replayedState,
        eventType: event.type,
      });
    } catch (err) {
      console.error(`[REPLAY ERROR] Failed at step ${i + 1}:`, event, err);
      break;
    }
  }

  const result = validateReplay(baseState, events, currentState);
  console.debug('[DEBUG REPLAY] Final result:', {
    valid: result.valid,
    driftCount: result.driftKeys.length,
    driftKeys: result.driftKeys,
    details: result.details,
  });

  return result;
}

/**
 * replayFromEmpty — Convenience function to replay events from an empty state.
 *
 * Useful for testing: creates an empty baseline and replays events,
 * verifying that events alone can reconstruct the current state.
 *
 * @param emptyState — initial empty state (typically 32 healthy teeth, no appliances)
 * @param events — events to replay
 * @param currentState — expected result
 * @returns validation result
 */
export function replayFromEmpty(
  emptyState: ChartState,
  events: ClinicalEventLike[],
  currentState: ChartState,
): ReplayValidationResult {
  return validateReplay(emptyState, events, currentState);
}
