/**
 * useSnapshots.ts — Clinical Snapshot React Query Hooks
 *
 * SERVER STATE LAW (per architecture rules):
 *   ✅ useQuery  — for all reads
 *   ✅ useMutation + invalidateQueries — for all writes
 *   ❌ useState(apiData)  — FORBIDDEN
 *   ❌ refetch()          — FORBIDDEN
 *   ❌ window.location.reload() — FORBIDDEN
 *
 * IMMUTABILITY PRINCIPLE:
 *   createSnapshot always creates a NEW document — never overwrites.
 *   updateSnapshotMetadata only patches name/appointmentId.
 *   softDeleteSnapshot sets isDeleted = true — hard delete is FORBIDDEN.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listSnapshotsByCase,
  getLatestSnapshot,
  getSnapshotById,
  createSnapshot,
  updateSnapshotMetadata,
  deleteSnapshot,
  type CreateSnapshotPayload,
  type UpdateSnapshotPayload,
  type SnapshotListItem,
  type SnapshotDTO,
} from '../api/snapshot.api';
import { getTimeline } from '../api/case.api';
import type { TimelineEntry } from '../types';
import {
  getDerivedClinicalState,
  getDerivedStateFromSnapshot,
  getEventsSinceSnapshot,
  getTimeTravelState,
  getZeroReplayState,
  type DerivedClinicalStateDTO,
  type EventsSinceDTO,
} from '../api/clinicalState.api';

// ─── ObjectId Guard ────────────────────────────────────────────────────────────
const isValidObjectId = (id: string | undefined): id is string =>
  typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

// ─── Query Keys ────────────────────────────────────────────────────────────────

export const SNAPSHOT_KEYS = {
  /** List of list items for a case (no chartState) */
  list:   (caseId: string) => ['snapshots', 'list', caseId]   as const,
  /** Latest full snapshot for a case (includes chartState) */
  latest: (caseId: string) => ['snapshots', 'latest', caseId] as const,
  /** Single full snapshot by _id */
  byId:   (id: string)     => ['snapshots', 'id', id]         as const,
  /** Case timeline (unified visits) */
  timeline: (caseId: string) => ['snapshots', 'timeline', caseId] as const,
  // Phase 4: Derived clinical state (snapshot + replayed events)
  /** Derived clinical state for a case (latest snapshot + all events after it) */
  derivedState:         (caseId: string)     => ['clinical-state', 'derived', caseId]               as const,
  /** Derived state from a specific snapshot checkpoint */
  derivedFromSnapshot:  (caseId: string, snapshotId: string) => ['clinical-state', 'snapshot', caseId, snapshotId] as const,
  /** Raw events since a snapshot (lightweight) */
  eventsSince:          (caseId: string, snapshotId: string) => ['clinical-state', 'events-since', caseId, snapshotId] as const,
  // Phase 5: Event-only replay (no snapshot required)
  /** Time-travel: derived state replayed up to a specific timestamp */
  timeTravel:   (caseId: string, until: string)  => ['clinical-state', 'time-travel', caseId, until] as const,
  /** Zero replay: state from events alone, no snapshot (DEV testing) */
  zeroReplay:   (caseId: string)                 => ['clinical-state', 'zero', caseId]               as const,
};

// ─── Read Hooks ────────────────────────────────────────────────────────────────

/**
 * useSnapshots
 *
 * Returns the list of snapshot list-items for a case (no chartState).
 * Used by SnapshotSelector dropdown to populate the version list.
 *
 * Result is sorted newest-first by the backend.
 */
export function useSnapshots(caseId: string | undefined) {
  return useQuery<SnapshotListItem[]>({
    queryKey: SNAPSHOT_KEYS.list(caseId ?? ''),
    queryFn:  async () => {
      try {
        return await listSnapshotsByCase(caseId!);
      } catch (err: any) {
        // 404 = no snapshots yet (new case) — return empty list, not an error
        if (err?.response?.status === 404) return [];
        throw err;
      }
    },
    enabled:  isValidObjectId(caseId),
    staleTime: 30_000,
  });
}

/**
 * useLatestSnapshot
 *
 * Returns the most recently created non-deleted snapshot (full DTO with chartState).
 * Used for auto-loading the editor on open.
 *
 * VISIT-FIRST ARCHITECTURE: only fetches when an active visit exists.
 * Without a visit, there is nothing to build on — skip the fetch entirely.
 *
 * @param caseId       - OrthodonticCase._id
 * @param activeVisitId - active VisitRecord._id (undefined = no active visit → skip fetch)
 */
export function useLatestSnapshot(
  caseId: string | undefined,
  activeVisitId: string | undefined
) {
  return useQuery<SnapshotDTO | null>({
    queryKey: SNAPSHOT_KEYS.latest(caseId ?? ''),
    queryFn:  () => getLatestSnapshot(caseId!),
    // Only fetch once a visit is active — prevents 404 noise on initial load
    enabled:   isValidObjectId(caseId) && isValidObjectId(activeVisitId),
    staleTime: 60_000,
  });
}

/**
 * useSnapshotById
 *
 * Loads a single full snapshot by ID. Used by "Restore" flow
 * when the user selects a historical version from the sidebar.
 */
export function useSnapshotById(snapshotId: string | undefined) {
  return useQuery<SnapshotDTO>({
    queryKey: SNAPSHOT_KEYS.byId(snapshotId ?? ''),
    queryFn:  () => getSnapshotById(snapshotId!),
    enabled:  !!snapshotId && snapshotId.length === 24,
    staleTime: 5 * 60_000, // snapshots are immutable — long stale time OK
  });
}

/**
 * useCaseTimeline
 *
 * Returns the unified visit-based timeline for a case (Phase 3 Visit System).
 * Returns an array of TimelineEntry objects (enriched Visits).
 */
export function useCaseTimeline(caseId: string | undefined) {
  return useQuery<TimelineEntry[]>({
    queryKey: SNAPSHOT_KEYS.timeline(caseId ?? ''),
    queryFn: async () => {
      try {
        const res = await getTimeline(caseId!);
        return res.data?.data || [];
      } catch (err: any) {
        if (err?.response?.status === 404) return [];
        throw err;
      }
    },
    enabled: isValidObjectId(caseId),
    staleTime: 60_000,
  });
}

// ─── Mutation Hooks ────────────────────────────────────────────────────────────

/**
 * useCreateSnapshot
 *
 * Creates a new clinical snapshot. Always appends — never overwrites.
 * On success, invalidates:
 *   - the snapshot list (sidebar refreshes)
 *   - the latest snapshot (editor auto-reload key)
 */
export function useCreateSnapshot(caseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<CreateSnapshotPayload, 'caseId'>) =>
      createSnapshot({ ...payload, caseId: caseId! }),

    onSuccess: () => {
      if (!caseId) return;
      qc.invalidateQueries({ queryKey: SNAPSHOT_KEYS.list(caseId) });
      qc.invalidateQueries({ queryKey: SNAPSHOT_KEYS.latest(caseId) });
      qc.invalidateQueries({ queryKey: SNAPSHOT_KEYS.timeline(caseId) });
    },

    onError: (err: any) => {
      console.error('[Snapshots] Create failed:', err?.response?.data?.error?.message ?? err.message);
    },
  });
}

/**
 * useUpdateSnapshotMetadata
 *
 * Patches snapshot name and/or appointmentId.
 * chartState is NEVER modified. Invalidates the list to refresh sidebar labels.
 */
export function useUpdateSnapshotMetadata(caseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSnapshotPayload }) =>
      updateSnapshotMetadata(id, patch),

    onSuccess: (_data, variables) => {
      if (caseId) {
        qc.invalidateQueries({ queryKey: SNAPSHOT_KEYS.list(caseId) });
      }
      // Invalidate the specific snapshot cache entry if it's loaded
      qc.invalidateQueries({ queryKey: SNAPSHOT_KEYS.byId(variables.id) });
    },

    onError: (err: any) => {
      console.error('[Snapshots] Update failed:', err?.response?.data?.error?.message ?? err.message);
    },
  });
}

/**
 * useDeleteSnapshot
 *
 * Soft-deletes a snapshot (admin only). isDeleted = true on backend.
 * Hard deletes are STRICTLY FORBIDDEN.
 * Invalidates the list and latest-snapshot query.
 */
export function useDeleteSnapshot(caseId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (snapshotId: string) => deleteSnapshot(snapshotId),

    onSuccess: () => {
      if (!caseId) return;
      qc.invalidateQueries({ queryKey: SNAPSHOT_KEYS.list(caseId) });
      qc.invalidateQueries({ queryKey: SNAPSHOT_KEYS.latest(caseId) });
      // Phase 4: also invalidate derived state
      qc.invalidateQueries({ queryKey: ['clinical-state', 'derived', caseId] });
    },

    onError: (err: any) => {
      console.error('[Snapshots] Delete failed:', err?.response?.data?.error?.message ?? err.message);
    },
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Phase 4: Event Replay Hooks
// ══════════════════════════════════════════════════════════════════════════════

/**
 * useDerivedClinicalState
 *
 * PRIMARY Phase 4 hook.
 *
 * Returns the current clinical truth: latest snapshot + all events after it
 * replayed by the server-side eventReplay.service.
 *
 * derivedState replaces snapshot.chartState as the UI source of truth.
 *
 * USAGE:
 *   const { data: clinicalState } = useDerivedClinicalState(caseId);
 *   const chartState = clinicalState?.derivedState ?? {};
 *
 * Invalidated by:
 *   - useCreateSnapshot onSuccess
 *   - Any onCommit from clinicalActionApi (Phase 3 mutations)
 *
 * @param caseId - OrthodonticCase._id
 */
/**
 * useDerivedClinicalState
 *
 * VISIT-FIRST ARCHITECTURE: only fetches when an active visit exists.
 *
 * @param caseId       - OrthodonticCase._id
 * @param activeVisitId - active VisitRecord._id (undefined = skip fetch)
 */
export function useDerivedClinicalState(
  caseId: string | undefined,
  activeVisitId: string | undefined
) {
  return useQuery<DerivedClinicalStateDTO>({
    queryKey: SNAPSHOT_KEYS.derivedState(caseId ?? ''),
    queryFn:  () => getDerivedClinicalState(caseId!),
    enabled:  isValidObjectId(caseId) && isValidObjectId(activeVisitId),
    staleTime: 10_000,
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 404 || error?.response?.status === 403) return false;
      return failureCount < 2;
    },
  });
}

/**
 * useDerivedStateFromSnapshot
 *
 * Returns derived state from a SPECIFIC snapshot checkpoint.
 * Used when the user selects a historical visit on the timeline.
 *
 * The derivedState only includes events AFTER that snapshot —
 * allowing the UI to reconstruct what the chart looked like
 * at any point in the treatment timeline.
 *
 * @param caseId     - OrthodonticCase._id
 * @param snapshotId - The snapshot to use as the base checkpoint
 */
export function useDerivedStateFromSnapshot(
  caseId: string | undefined,
  snapshotId: string | undefined
) {
  return useQuery<DerivedClinicalStateDTO>({
    queryKey: SNAPSHOT_KEYS.derivedFromSnapshot(caseId ?? '', snapshotId ?? ''),
    queryFn:  () => getDerivedStateFromSnapshot(caseId!, snapshotId!),
    enabled:  isValidObjectId(caseId) && isValidObjectId(snapshotId),
    staleTime: 60_000, // Historical snapshots rarely change
  });
}

/**
 * useEventsSinceSnapshot
 *
 * Lightweight hook that returns only the raw event list since a snapshot.
 * Does NOT compute derivedState — used for sidebar event logs or polling.
 *
 * @param caseId     - OrthodonticCase._id
 * @param snapshotId - The snapshot to count events after
 */
export function useEventsSinceSnapshot(
  caseId: string | undefined,
  snapshotId: string | undefined
) {
  return useQuery<EventsSinceDTO>({
    queryKey: SNAPSHOT_KEYS.eventsSince(caseId ?? '', snapshotId ?? ''),
    queryFn:  () => getEventsSinceSnapshot(caseId!, snapshotId!),
    enabled:  isValidObjectId(caseId) && isValidObjectId(snapshotId),
    staleTime: 15_000,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Phase 5: Event as Source of Truth Hooks
// ══════════════════════════════════════════════════════════════════════════════

/**
 * useTimeTravelState
 *
 * Phase 5 time-travel hook.
 * Returns derived clinical state reconstructed by replaying events <= `until`.
 * Enables "what did this chart look like on date X?" queries.
 *
 * - No snapshot is used — always replays from zero up to `until`.
 * - Enables deterministic historical reconstruction independent of snapshot state.
 *
 * @param caseId - OrthodonticCase._id
 * @param until  - ISO 8601 timestamp ceiling (e.g., "2025-03-01T00:00:00Z")
 */
export function useTimeTravelState(
  caseId: string | undefined,
  until: string | undefined
) {
  return useQuery<DerivedClinicalStateDTO>({
    queryKey: SNAPSHOT_KEYS.timeTravel(caseId ?? '', until ?? ''),
    queryFn:  () => getTimeTravelState(caseId!, until!),
    enabled:  isValidObjectId(caseId) && !!until,
    // Historical state is immutable once `until` is in the past — long cache OK
    staleTime: 5 * 60_000,
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 400 || error?.response?.status === 403) return false;
      return failureCount < 2;
    },
  });
}

/**
 * useZeroReplayState
 *
 * Phase 5 correctness verification hook (DEV only).
 * Replays ALL events from the canonical initial state — zero snapshots required.
 *
 * Use case: delete all snapshots, then call this to verify state reconstructs correctly.
 * The derivedState from this hook should match the result of the standard useDerivedClinicalState.
 *
 * NOTE: Backend blocks this endpoint in production (returns 403).
 *
 * @param caseId - OrthodonticCase._id
 */
export function useZeroReplayState(caseId: string | undefined) {
  return useQuery<DerivedClinicalStateDTO>({
    queryKey: SNAPSHOT_KEYS.zeroReplay(caseId ?? ''),
    queryFn:  () => getZeroReplayState(caseId!),
    enabled:  isValidObjectId(caseId),
    // Zero replay is for dev verification — don't cache aggressively
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
