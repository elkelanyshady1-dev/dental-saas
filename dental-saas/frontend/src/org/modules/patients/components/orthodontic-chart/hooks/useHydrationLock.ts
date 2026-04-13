/**
 * useHydrationLock.ts — P2-1 Extraction from SnapshotEditor
 *
 * ROLE:
 *   Manages the hydration lock ref that prevents React Query server refetches
 *   from overwriting active, unsaved chart edits.
 *
 * INVARIANT (P0-5):
 *   Once the lock is engaged (first user mutation), ALL HYDRATE_SNAPSHOT
 *   useEffects in the host component must check `isHydrationLocked()` before
 *   dispatching. The lock is only released by:
 *     1. A successful snapshot save (explicit commit)
 *     2. An explicit manual "reset/refresh" by the user
 *
 * USAGE:
 *   const { isHydrationLocked, lockHydration, unlockHydration } = useHydrationLock();
 *
 *   // In hydration effects:
 *   if (isHydrationLocked()) return;
 *   dispatch({ type: 'HYDRATE_SNAPSHOT', payload: newState });
 *
 *   // When user first makes an edit:
 *   lockHydration();
 *
 *   // After successful save:
 *   unlockHydration();
 */

import { useRef, useCallback } from 'react';

export interface UseHydrationLockReturn {
  /**
   * Returns true if there are active, unsaved edits that must not be
   * overwritten by server-side state hydration.
   */
  isHydrationLocked: () => boolean;

  /**
   * Engage the hydration lock. Call this on the first user mutation
   * (inside saveToHistory) to prevent React Query refetches from clobbering
   * in-progress work.
   */
  lockHydration: () => void;

  /**
   * Release the hydration lock. Call this after:
   *   - A successful snapshot save (handleSaveSnapshot success path), OR
   *   - An explicit user-initiated chart reset/refresh.
   *
   * After unlock, the next React Query refetch is permitted to hydrate state.
   */
  unlockHydration: () => void;
}

/**
 * Manages the ref-backed boolean that controls server-state hydration.
 *
 * Implemented as a ref (not useState) so that:
 *   - Toggling the lock does NOT trigger a re-render
 *   - Callbacks that read the lock (closure-captured) always get the live value
 *   - Zero risk of stale closure bugs on the lock flag itself
 */
export function useHydrationLock(): UseHydrationLockReturn {
  const lockedRef = useRef(false);

  const isHydrationLocked = useCallback(() => lockedRef.current, []);

  const lockHydration = useCallback(() => {
    lockedRef.current = true;
  }, []);

  const unlockHydration = useCallback(() => {
    lockedRef.current = false;
  }, []);

  return { isHydrationLocked, lockHydration, unlockHydration };
}
