/**
 * useClinicalTimeline.ts — Phase 5: Clinical Timeline & Time Travel Hooks
 *
 * SERVER STATE LAW:
 *   ✅ useQuery  — for getCaseTimeline and getStateAtEvent
 *   ❌ useState(apiData) — FORBIDDEN
 *   ❌ refetch()         — FORBIDDEN
 *
 * USAGE:
 *   const { data: timeline } = useClinicalTimeline(caseId);
 *   const { data: snapshot } = useStateAtEvent(caseId, eventId);
 */

import { useQuery } from '@tanstack/react-query';
import {
  getCaseTimeline,
  getStateAtEvent,
  type TimelineFilters,
  type TimelineDTO,
  type StateAtEventDTO,
} from '../api/clinicalState.api';

// ─── Query Keys ────────────────────────────────────────────────────────────────

export const TIMELINE_KEYS = {
  timeline:    (caseId: string, filters?: TimelineFilters) =>
    ['clinical-timeline', caseId, filters ?? {}] as const,
  stateAtEvent: (caseId: string, eventId: string) =>
    ['clinical-state-at-event', caseId, eventId] as const,
};

const isValidObjectId = (id: string | undefined): id is string =>
  typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

// ─── useClinicalTimeline ──────────────────────────────────────────────────────

/**
 * Returns the full chronological event log for a case.
 * Supports optional filtering by visitId, event type, or toothId.
 *
 * staleTime is 0 — timelines should always reflect the latest state.
 * gcTime is 60s — keep in memory briefly for tab switching.
 */
export function useClinicalTimeline(
  caseId: string | undefined,
  filters?: TimelineFilters
) {
  return useQuery<TimelineDTO>({
    queryKey: TIMELINE_KEYS.timeline(caseId ?? '', filters),
    queryFn:  () => getCaseTimeline(caseId!, filters),
    enabled:  isValidObjectId(caseId),
    staleTime: 0,
    gcTime:    60_000,
  });
}

// ─── useStateAtEvent ──────────────────────────────────────────────────────────

/**
 * Time travel: replays all events up to and including `eventId`,
 * returning the chart state as it existed at that exact moment.
 *
 * staleTime is Infinity — replay result is deterministic and immutable.
 * Only fetches when both caseId and eventId are valid ObjectIds.
 */
export function useStateAtEvent(
  caseId: string | undefined,
  eventId: string | null | undefined
) {
  return useQuery<StateAtEventDTO>({
    queryKey: TIMELINE_KEYS.stateAtEvent(caseId ?? '', eventId ?? ''),
    queryFn:  () => getStateAtEvent(caseId!, eventId!),
    enabled:  isValidObjectId(caseId) && isValidObjectId(eventId ?? undefined),
    staleTime: Infinity,   // deterministic replay — never re-fetch for the same eventId
    gcTime:    5 * 60_000, // keep 5 min in case user scrubs timeline quickly
  });
}
