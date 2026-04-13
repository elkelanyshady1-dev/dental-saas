/**
 * useUndoHistory.ts — P2-1 Extraction from SnapshotEditor
 *
 * ROLE:
 *   Manages the multi-level undo stack for the clinical chart editor.
 *
 * DESIGN:
 *   Two parallel ref-backed stacks, always same length:
 *     historyRef:         ChartState[]    — snapshots of chart state before each mutation
 *     undoSideEffectsRef: UndoSideEffect[] — DB-side effects that must also be rolled back
 *
 *   Refs (not state) are used so that pushing to the stack does NOT cause a
 *   re-render. Only `canUndo` is React state — drives the Undo button visibility.
 *
 * SUPPORTED SIDE-EFFECT TYPES:
 *   TAD_INSERTED — undo must also call the DB to delete the TAD record, because
 *                  the DB is the source of truth for miniscrews. A pure in-memory
 *                  rollback would leave orphaned records in the database.
 *
 * USAGE:
 *   const { canUndo, saveToHistory, undo } = useUndoHistory({
 *     chartStateRef,
 *     dispatch,
 *     onSnapshotModeExit,          // called when saveToHistory() exits snapshot preview
 *     onHydrationLock,             // called when saveToHistory() locks hydration (P0-5)
 *     removeTadFromDb,             // async fn(tadId) — calls the TAD delete mutation
 *   });
 *
 *   // Before a mutation:
 *   saveToHistory();               // no side-effect
 *   saveToHistory({ type: 'TAD_INSERTED', tadDbId: tempId }); // with side-effect backfill
 *
 *   // Undo button:
 *   if (canUndo) undo();
 *
 * STACK CAP:
 *   Hard-capped at MAX_HISTORY_SIZE (20) entries to prevent unbounded memory growth.
 */

import { useRef, useState, useCallback } from 'react';
import type { ChartState, ChartAction } from '../types';

// ── Side-effect descriptor ───────────────────────────────────────────────────

/**
 * Describes a DB-side operation that was performed alongside a chart mutation
 * and must be reversed when the corresponding undo() is called.
 *
 * null = no DB side-effect; undo is purely in-memory.
 */
export type UndoSideEffect =
  | { type: 'TAD_INSERTED'; tadDbId: string }
  | null;

// ── Hook options ─────────────────────────────────────────────────────────────

export interface UseUndoHistoryOptions {
  /** Ref to the latest chart state (updated by the host component on each render). */
  chartStateRef: React.MutableRefObject<ChartState>;

  /** Reducer dispatch — used to restore previous state or remove TAD from local state. */
  dispatch: React.Dispatch<ChartAction>;

  /**
   * Called inside saveToHistory() when the host is in snapshot-preview mode.
   * Snapshot mode must be exited the moment the user makes any edit.
   */
  onSnapshotModeExit?: () => void;

  /**
   * Called inside saveToHistory() to engage the hydration lock (P0-5).
   * After this is called, React Query refetches must NOT overwrite chart state
   * until the snapshot is saved and the lock is explicitly released.
   */
  onHydrationLock?: () => void;

  /**
   * Async function that deletes a TAD from the database.
   * Required to correctly undo TAD_INSERTED side-effects.
   * Signature mirrors useTads.useRemoveTad / removeAllTadsMutation.mutateAsync.
   *
   * @param tadId - The stable DB _id of the TAD to delete.
   * @returns Promise that resolves when the delete succeeds.
   */
  removeTadFromDb?: (tadId: string) => Promise<void>;
}

// ── Hook return ──────────────────────────────────────────────────────────────

export interface UseUndoHistoryReturn {
  /** True when the undo stack has at least one entry. Drives Undo button state. */
  canUndo: boolean;

  /**
   * Push the current chart state onto the undo stack before applying a mutation.
   * Also engages the hydration lock and exits snapshot-preview mode.
   *
   * @param sideEffect - Optional DB side-effect to reverse on undo.
   *                     Pass an object with { type: 'TAD_INSERTED', tadDbId }
   *                     immediately after creating the TAD — backfill tadDbId
   *                     once the DB responds with the real _id.
   */
  saveToHistory: (sideEffect?: UndoSideEffect) => void;

  /**
   * Pop the last state off the stack and restore it.
   * If the popped entry has a TAD_INSERTED side-effect, also deletes the TAD from DB.
   */
  undo: () => void;

  /**
   * Reset the undo stack to empty. Call after snapshot save or chart reset.
   * Does NOT call onHydrationLock/onSnapshotModeExit — caller is responsible.
   */
  resetHistory: () => void;
}

// ── Implementation ────────────────────────────────────────────────────────────

const MAX_HISTORY_SIZE = 20;

export function useUndoHistory({
  chartStateRef,
  dispatch,
  onSnapshotModeExit,
  onHydrationLock,
  removeTadFromDb,
}: UseUndoHistoryOptions): UseUndoHistoryReturn {
  // Ref-backed stacks — mutations do NOT trigger re-renders
  const historyRef         = useRef<ChartState[]>([]);
  const undoSideEffectsRef = useRef<UndoSideEffect[]>([]);

  // React state — only `canUndo` needs to be reactive (drives button visibility)
  const [canUndo, setCanUndo] = useState(false);

  // ── saveToHistory ──────────────────────────────────────────────────────────

  const saveToHistory = useCallback((sideEffect: UndoSideEffect = null) => {
    // Exit snapshot-preview mode — any user mutation means live editing
    onSnapshotModeExit?.();

    // Push current state onto both stacks, trim to cap
    historyRef.current = [
      ...historyRef.current,
      chartStateRef.current,
    ].slice(-MAX_HISTORY_SIZE);

    undoSideEffectsRef.current = [
      ...undoSideEffectsRef.current,
      sideEffect,
    ].slice(-MAX_HISTORY_SIZE);

    setCanUndo(true);

    // P0-5: Engage hydration lock — must happen after the first user edit.
    // React Query refetches are now blocked until the snapshot is saved.
    onHydrationLock?.();
  }, [chartStateRef, onSnapshotModeExit, onHydrationLock]);

  // ── undo ──────────────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;

    // Pop both stacks atomically
    const previousState = historyRef.current[historyRef.current.length - 1];
    const sideEffect    = undoSideEffectsRef.current[undoSideEffectsRef.current.length - 1] ?? null;

    historyRef.current         = historyRef.current.slice(0, -1);
    undoSideEffectsRef.current = undoSideEffectsRef.current.slice(0, -1);

    if (historyRef.current.length === 0) setCanUndo(false);

    // P0-9: If the last action inserted a TAD, we must also delete it from DB.
    // Pure in-memory rollback is NOT sufficient — the DB is the source of truth.
    // React Query will invalidate + re-hydrate the TAD list on delete success.
    if (sideEffect?.type === 'TAD_INSERTED' && sideEffect.tadDbId) {
      const { tadDbId } = sideEffect;

      // 1. Optimistically remove from local chart state (fast feedback)
      dispatch({ type: 'REMOVE_TAD', payload: tadDbId });

      // 2. Delete from DB — React Query invalidation re-syncs on success
      if (removeTadFromDb) {
        removeTadFromDb(tadDbId).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[useUndoHistory] TAD DB delete failed on undo:', msg);
        });
      } else {
        console.warn(
          '[useUndoHistory] removeTadFromDb not provided — ' +
          'TAD_INSERTED undo will only update local state, DB record survives'
        );
      }
    }

    // Restore previous chart state.
    // When a TAD side-effect is present, miniscrews are intentionally excluded:
    // the DB delete above triggers React Query invalidation → TAD hydration
    // useEffect re-syncs the miniscrews list from the authoritative server state.
    dispatch({
      type: 'HYDRATE_SNAPSHOT',
      payload: {
        upperTeeth:    previousState.upperTeeth,
        lowerTeeth:    previousState.lowerTeeth,
        elastics:      previousState.elastics,
        appliances:    previousState.appliances,
        powerChains:   previousState.powerChains,
        iprMarkers:    previousState.iprMarkers,
        spaceMarkers:  previousState.spaceMarkers,
        accessories:   previousState.accessories,
        ligatures:     previousState.ligatures,
        upperArchwire: previousState.upperArchwire,
        lowerArchwire: previousState.lowerArchwire,
        // Include miniscrews only when there's no DB side-effect to handle
        ...(sideEffect?.type !== 'TAD_INSERTED' && {
          miniscrews: previousState.miniscrews,
        }),
      },
    });
  }, [dispatch, removeTadFromDb]);

  // ── resetHistory ──────────────────────────────────────────────────────────

  const resetHistory = useCallback(() => {
    historyRef.current         = [];
    undoSideEffectsRef.current = [];
    setCanUndo(false);
  }, []);

  return { canUndo, saveToHistory, undo, resetHistory };
}
