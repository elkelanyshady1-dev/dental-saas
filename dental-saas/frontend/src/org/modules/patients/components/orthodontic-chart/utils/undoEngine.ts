/**
 * undoEngine.ts — Event-Based Undo/Redo with State History
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE (Phase 8 — Production Hardening)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * RULE: Undo MUST NOT trigger new events.
 *       Undo restores a previous state snapshot — it does NOT dispatch
 *       inverse events. This prevents undo from corrupting the event log.
 *
 * STRUCTURE:
 *   {
 *     past:    ChartState[],  // previous states (most recent last)
 *     present: ChartState,    // current state
 *     future:  ChartState[],  // undone states (for redo)
 *   }
 *
 * INVARIANTS:
 *   - pushState() saves current state to past, sets new state as present
 *   - undo() moves present → future, restores past.pop() as present
 *   - redo() moves present → past, restores future.pop() as present
 *   - History is bounded (MAX_HISTORY_SIZE) to prevent memory leaks
 *   - HYDRATE actions (DB sync, snapshot restore) CLEAR history
 *   - TADs are EXCLUDED from undo (DB is SSOT — hydration handles them)
 *
 * SAFETY:
 *   ❌ FORBIDDEN: dispatch(inverseEvent) during undo
 *   ✅ ALLOWED:   setState(history.past[history.past.length - 1])
 *
 * @pure — all functions return new objects, no mutations
 */

import type { ChartState } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UndoableState {
  readonly past:    readonly ChartState[];
  readonly present: ChartState;
  readonly future:  readonly ChartState[];
}

/** Maximum number of undo steps. Prevents unbounded memory growth. */
const MAX_HISTORY_SIZE = 50;

// ─── Factory ─────────────────────────────────────────────────────────────────

/** Create initial undoable state wrapping the current chart state. */
export function createUndoableState(initialState: ChartState): UndoableState {
  return {
    past:    [],
    present: initialState,
    future:  [],
  };
}

// ─── Core Operations (PURE) ──────────────────────────────────────────────────

/**
 * Push a new state onto the history stack.
 * Call this BEFORE applying a clinical event to save a checkpoint.
 *
 * RULE: Clears future (redo) stack — new actions invalidate redo history.
 * RULE: Trims past to MAX_HISTORY_SIZE to prevent memory leaks.
 * RULE: TADs are excluded — miniscrews from present are NOT saved to past.
 */
export function pushState(
  history: UndoableState,
  newPresent: ChartState,
): UndoableState {
  // Exclude TADs from history — they come from DB hydration, not undo
  const stateForHistory = _excludeTads(history.present);

  const past = [...history.past, stateForHistory];

  // Trim oldest entries if past exceeds max
  const trimmedPast = past.length > MAX_HISTORY_SIZE
    ? past.slice(past.length - MAX_HISTORY_SIZE)
    : past;

  return {
    past:    trimmedPast,
    present: newPresent,
    future:  [], // new action clears redo stack
  };
}

/**
 * Undo — restore previous state.
 *
 * RULE: Does NOT dispatch new events. Simply swaps state snapshots.
 * RULE: Preserves current miniscrews (TADs are DB-driven, not undoable).
 *
 * Returns null if nothing to undo.
 */
export function undo(history: UndoableState): UndoableState | null {
  if (history.past.length === 0) return null;

  const past = [...history.past];
  const previousState = past.pop()!;

  // Preserve current TADs — they are not part of undo
  const restored: ChartState = {
    ...previousState,
    miniscrews: history.present.miniscrews,
  };

  return {
    past,
    present: restored,
    future:  [...history.future, _excludeTads(history.present)],
  };
}

/**
 * Redo — restore next undone state.
 *
 * RULE: Does NOT dispatch new events. Simply swaps state snapshots.
 * RULE: Preserves current miniscrews (TADs are DB-driven, not undoable).
 *
 * Returns null if nothing to redo.
 */
export function redo(history: UndoableState): UndoableState | null {
  if (history.future.length === 0) return null;

  const future = [...history.future];
  const nextState = future.pop()!;

  // Preserve current TADs
  const restored: ChartState = {
    ...nextState,
    miniscrews: history.present.miniscrews,
  };

  return {
    past:    [...history.past, _excludeTads(history.present)],
    present: restored,
    future,
  };
}

/**
 * Clear all history. Call after HYDRATE operations (snapshot restore, DB sync)
 * since hydrated state invalidates previous history.
 */
export function clearHistory(history: UndoableState): UndoableState {
  return {
    past:    [],
    present: history.present,
    future:  [],
  };
}

/**
 * Replace present without saving to history.
 * Used for non-undoable state changes (TAD hydration, bonding sync).
 */
export function replacePresent(
  history: UndoableState,
  newPresent: ChartState,
): UndoableState {
  return {
    past:    history.past,
    present: newPresent,
    future:  history.future,
  };
}

// ─── Selectors ───────────────────────────────────────────────────────────────

export function canUndo(history: UndoableState): boolean {
  return history.past.length > 0;
}

export function canRedo(history: UndoableState): boolean {
  return history.future.length > 0;
}

export function undoDepth(history: UndoableState): number {
  return history.past.length;
}

export function redoDepth(history: UndoableState): number {
  return history.future.length;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Exclude TADs from a state snapshot before saving to history.
 * TADs are DB-driven (not undoable) — including them would cause
 * ghost TADs to reappear on undo.
 */
function _excludeTads(state: ChartState): ChartState {
  return { ...state, miniscrews: [] };
}
