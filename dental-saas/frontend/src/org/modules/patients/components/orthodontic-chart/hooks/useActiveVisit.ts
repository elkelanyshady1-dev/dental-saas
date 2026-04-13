/**
 * useActiveVisit.ts — Phase 2: Visit Session React Query Hook
 *
 * SERVER STATE LAW:
 *   ✅ useQuery  — for getActiveVisit (read)
 *   ✅ useMutation + invalidateQueries — for start/end/cancel
 *   ❌ useState(apiData)  — FORBIDDEN
 *
 * USAGE:
 *   const { data: activeVisit, isLoading } = useActiveVisit(caseId);
 *   const startVisit = useStartVisit(caseId);
 *   const endVisit   = useEndVisit();
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getActiveVisit,
  startVisit,
  endVisit,
  cancelVisit,
  updateVisitNotes,
  addVoiceNote,
  sendHeartbeat,
  takeoverVisit,
  type ActiveVisit,
  type AddVoiceNotePayload,
} from '../api/visitSession.api';

// ─── Query Keys ────────────────────────────────────────────────────────────────

export const VISIT_KEYS = {
  active: (caseId: string) => ['visit', 'active', caseId] as const,
};

const isValidObjectId = (id: string | undefined): id is string =>
  typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

// ─── useActiveVisit ───────────────────────────────────────────────────────────

/**
 * Returns the currently active VisitRecord for a case, or null if none exists.
 * Polls every 30 seconds to detect if another tab/user started or ended a visit.
 */
export function useActiveVisit(caseId: string | undefined) {
  return useQuery<ActiveVisit | null>({
    queryKey: VISIT_KEYS.active(caseId ?? ''),
    queryFn:  () => getActiveVisit(caseId!),
    enabled:  isValidObjectId(caseId),
    staleTime: 10_000,      // 10 s — visits change infrequently
    refetchInterval: 30_000, // poll 30 s — detect external changes
  });
}

// ─── useStartVisit ────────────────────────────────────────────────────────────

/**
 * Opens a new visit session for a case.
 * Invalidates the active-visit query on success so the UI reflects the new session.
 */
export function useStartVisit(caseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { appointmentId?: string | null; phaseId?: string | null; visitType?: string }) =>
      startVisit(caseId!, opts),

    onSuccess: () => {
      if (!caseId) return;
      qc.invalidateQueries({ queryKey: VISIT_KEYS.active(caseId) });
    },

    onError: (err: any) => {
      console.error('[useStartVisit] failed:', err?.response?.data?.error?.message ?? err.message);
    },
  });
}

// ─── useEndVisit ──────────────────────────────────────────────────────────────

/**
 * Closes the active visit session (marks it completed).
 * Receives the snapshotId that was just saved to link visit ↔ snapshot.
 */
export function useEndVisit(caseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      visitId,
      snapshotId,
      visitDate,
    }: {
      visitId: string;
      snapshotId?: string | null;
      visitDate?: string | null;
    }) => endVisit(visitId, { snapshotId, visitDate }),

    onSuccess: () => {
      if (!caseId) return;
      qc.invalidateQueries({ queryKey: VISIT_KEYS.active(caseId) });
    },

    onError: (err: any) => {
      console.error('[useEndVisit] failed:', err?.response?.data?.error?.message ?? err.message);
    },
  });
}

// ─── useUpdateVisitNotes ──────────────────────────────────────────────────────

/**
 * Persists visit-level notes in real-time (debounced autosave).
 * Fire-and-forget mutation — does NOT invalidate the active-visit query to
 * avoid race conditions with the debounce timer.
 * Optimistically updates the cached active visit with the new notes value.
 */
export function useUpdateVisitNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ visitId, notes }: { visitId: string; notes: string }) =>
      updateVisitNotes(visitId, notes),

    // Optimistic update: write notes into the cached visit immediately
    onMutate: async ({ visitId, notes }) => {
      // Find which caseId key this visitId belongs to (look through all active-visit caches)
      const queries = qc.getQueriesData<ActiveVisit | null>({ queryKey: ['visit', 'active'] });
      for (const [key, visit] of queries) {
        if (visit?._id === visitId || visit?.id === visitId) {
          qc.setQueryData<ActiveVisit | null>(key, prev =>
            prev ? { ...prev, notes } : prev
          );
        }
      }
    },

    onError: (err: any) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[useUpdateVisitNotes] failed silently:', err?.message);
      }
    },
  });
}

// ─── useAddVoiceNote ──────────────────────────────────────────────────────────

/**
 * Appends a voice note URL reference to the active visit.
 */
export function useAddVoiceNote(caseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ visitId, payload }: { visitId: string; payload: AddVoiceNotePayload }) =>
      addVoiceNote(visitId, payload),

    onSuccess: () => {
      if (!caseId) return;
      qc.invalidateQueries({ queryKey: VISIT_KEYS.active(caseId) });
    },

    onError: (err: any) => {
      console.error('[useAddVoiceNote] failed:', err?.message);
    },
  });
}

// ─── useSendHeartbeat ─────────────────────────────────────────────────────────

/**
 * Returns a stable function that sends a heartbeat for the given visitId.
 * Used inside a setInterval in SnapshotEditor — fire-and-forget, never throws.
 */
export function useSendHeartbeat() {
  return useMutation({
    mutationFn: (visitId: string) => sendHeartbeat(visitId),
    // No invalidation — heartbeat is a silent keep-alive
    onError: () => {}, // swallow — already handled in API layer
  });
}

// ─── useTakeoverVisit ────────────────────────────────────────────────────────

/**
 * Forcibly transfers the soft lock to the current user.
 * Invalidates the active-visit query so the UI reflects the new owner.
 */
export function useTakeoverVisit(caseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (visitId: string) => takeoverVisit(visitId),

    onSuccess: () => {
      if (!caseId) return;
      qc.invalidateQueries({ queryKey: VISIT_KEYS.active(caseId) });
    },

    onError: (err: any) => {
      console.error('[useTakeoverVisit] failed:', err?.response?.data?.error?.message ?? err.message);
    },
  });
}

// ─── useCancelVisit ───────────────────────────────────────────────────────────

/**
 * Cancels the active visit session (user abandons without saving a snapshot).
 */
export function useCancelVisit(caseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (visitId: string) => cancelVisit(visitId),

    onSuccess: () => {
      if (!caseId) return;
      qc.invalidateQueries({ queryKey: VISIT_KEYS.active(caseId) });
    },

    onError: (err: any) => {
      console.error('[useCancelVisit] failed:', err?.response?.data?.error?.message ?? err.message);
    },
  });
}
