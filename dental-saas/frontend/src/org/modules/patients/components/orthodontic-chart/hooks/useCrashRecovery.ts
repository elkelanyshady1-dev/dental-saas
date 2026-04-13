/**
 * useCrashRecovery.ts — Phase 8 PART 4: Crash Recovery Hook
 *
 * ════════════════════════════════════════════════════════════════════════════
 * PURPOSE:
 *   When the browser tab crashes, the user refreshes, or React unmounts
 *   unexpectedly, this hook reconstructs clinical state from the server:
 *     1. Fetch the latest snapshot for the case
 *     2. Fetch all events since that snapshot
 *     3. Replay events over the snapshot to reconstruct current state
 *     4. Replace local reducer state with the recovered state
 *     5. Reset sequence tracking to match server high-water mark
 *
 * INVARIANTS:
 *   - Recovery is triggered ONLY by explicit user action or on mount detection
 *   - Recovery replaces the ENTIRE local state — no merge, no conflict resolution
 *   - After recovery, hydration lock is released so React Query can sync
 *   - Sequence tracking is reset to prevent false out-of-order rejections
 *
 * DEPENDENCIES:
 *   - getDerivedClinicalState API (eventReplay.service on backend)
 *   - applyClinicalEvent (pure reducer) for client-side verification
 *   - resetSequenceTracking (from dispatchClinicalEvent) for sequence reset
 *
 * @per-org-safe — uses API calls that are org-scoped by JWT
 * ════════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getDerivedClinicalState } from '../api/clinicalState.api';
import { SNAPSHOT_KEYS } from './useSnapshots';
import { resetSequenceTracking } from '../utils/dispatchClinicalEvent';
import type { ChartState } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrashRecoveryState {
  /** Whether a recovery operation is in progress */
  isRecovering: boolean;
  /** Last recovery attempt result */
  lastRecovery: {
    success: boolean;
    timestamp: number;
    eventsReplayed: number;
    details: string;
  } | null;
  /** Error from the most recent failed recovery, if any */
  error: string | null;
}

export interface UseCrashRecoveryReturn {
  /** Current recovery state */
  state: CrashRecoveryState;
  /**
   * Trigger crash recovery for a case.
   * Fetches latest server state and replaces local reducer state.
   *
   * @param caseId - The orthodontic case ID to recover
   * @returns The recovered ChartState, or null on failure
   */
  recoverState: (caseId: string) => Promise<ChartState | null>;
}

interface CrashRecoveryConfig {
  /** React dispatch function to hydrate recovered state into the reducer */
  dispatch: (action: { type: string; payload: unknown }) => void;
  /** Release the hydration lock so React Query can sync after recovery */
  unlockHydration?: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useCrashRecovery
 *
 * Provides a `recoverState(caseId)` function that:
 *   1. Calls the server-side derived clinical state endpoint
 *   2. Receives: { derivedState, baseSnapshotId, eventsApplied, lastSequence }
 *   3. Dispatches HYDRATE_SNAPSHOT to replace local state
 *   4. Resets the per-case sequence tracking
 *   5. Invalidates all snapshot/clinical-state React Query caches
 *   6. Unlocks hydration so future React Query refetches are allowed
 *
 * @param config - dispatch function and optional hydration unlock
 */
export function useCrashRecovery(config: CrashRecoveryConfig): UseCrashRecoveryReturn {
  const { dispatch, unlockHydration } = config;
  const queryClient = useQueryClient();
  const isRecoveringRef = useRef(false);

  const [recoveryState, setRecoveryState] = useState<CrashRecoveryState>({
    isRecovering: false,
    lastRecovery: null,
    error: null,
  });

  const recoverState = useCallback(async (caseId: string): Promise<ChartState | null> => {
    // Prevent concurrent recovery attempts
    if (isRecoveringRef.current) {
      console.warn('[CrashRecovery] Recovery already in progress, skipping.');
      return null;
    }

    isRecoveringRef.current = true;
    setRecoveryState((prev) => ({ ...prev, isRecovering: true, error: null }));

    try {
      // ── Step 1: Fetch server-derived state ────────────────────────────────
      // The backend's eventReplay.service handles:
      //   - Finding the latest snapshot
      //   - Fetching all events after it
      //   - Replaying events over snapshot chartState
      //   - Returning the final derived state
      const serverState = await getDerivedClinicalState(caseId);

      if (!serverState?.derivedState) {
        throw new Error('Server returned empty derived state — no snapshot or events found.');
      }

      const recoveredChartState = serverState.derivedState as unknown as ChartState;
      const eventsApplied = (serverState as any).eventsApplied ?? 0;

      // ── Step 2: Replace local state with recovered state ──────────────────
      dispatch({
        type: 'HYDRATE_SNAPSHOT',
        payload: { chartState: recoveredChartState },
      });

      // ── Step 3: Reset sequence tracking ───────────────────────────────────
      // After recovery, the sequence high-water mark must match the server's
      // last sequence to prevent false out-of-order rejections for new events.
      resetSequenceTracking(caseId);

      // ── Step 4: Invalidate React Query caches ─────────────────────────────
      // Force all snapshot and clinical-state queries to refetch from server.
      queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEYS.list(caseId) });
      queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEYS.latest(caseId) });
      queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEYS.derivedState(caseId) });
      queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEYS.timeline(caseId) });

      // ── Step 5: Unlock hydration ──────────────────────────────────────────
      // Allow React Query refetches to update state normally going forward.
      unlockHydration?.();

      const result = {
        success: true,
        timestamp: Date.now(),
        eventsReplayed: eventsApplied,
        details: `Recovered state from server. Base snapshot + ${eventsApplied} events replayed.`,
      };

      setRecoveryState({
        isRecovering: false,
        lastRecovery: result,
        error: null,
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log('[CrashRecovery] State recovered successfully:', result.details);
      }

      return recoveredChartState;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      console.error('[CrashRecovery] CRITICAL: Recovery failed:', errorMessage);

      setRecoveryState({
        isRecovering: false,
        lastRecovery: {
          success: false,
          timestamp: Date.now(),
          eventsReplayed: 0,
          details: `Recovery failed: ${errorMessage}`,
        },
        error: errorMessage,
      });

      return null;

    } finally {
      isRecoveringRef.current = false;
    }
  }, [dispatch, unlockHydration, queryClient]);

  return { state: recoveryState, recoverState };
}
