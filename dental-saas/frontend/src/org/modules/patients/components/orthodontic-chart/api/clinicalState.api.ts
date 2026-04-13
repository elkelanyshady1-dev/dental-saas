/**
 * clinicalState.api.ts — Phase 4 Event Replay API Client
 *
 * Typed wrapper for the clinical state endpoints:
 *   GET /api/v1/org/clinical-state/:caseId
 *   GET /api/v1/org/clinical-state/:caseId/snapshots/:snapshotId
 *   GET /api/v1/org/clinical-state/:caseId/events-since/:snapshotId
 *
 * Usage in hooks:
 *   const { data } = useDerivedClinicalState(caseId);
 *   // data.derivedState is the current chartState (snapshot + replayed events)
 */

import api from "@/services/api";

const BASE = "/org/clinical-state";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Minimal event shape returned by the replay engine */
export interface ClinicalEventReplay {
  _id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
  snapshotId?: string;
}

/** Full derived clinical state response (Phase 5: snapshot is optional) */
export interface DerivedClinicalStateDTO {
  snapshotId:   string | null;
  snapshot:     Record<string, unknown> | null;
  events:       ClinicalEventReplay[];
  derivedState: Record<string, unknown>;
  eventCount:   number;
  /** Phase 5: number of events replayed on top of the snapshot checkpoint */
  eventOffset:  number | null;
  /** Phase 5: true when state was built from zero (no snapshot existed) */
  fromZero:     boolean;
  /** Time-travel: ISO timestamp used as the replay ceiling */
  timeTravelTo?: string;
  /** Debug mode: step-by-step replay trace (dev only) */
  steps?: Array<{ event: ClinicalEventReplay; stateAfter: Record<string, unknown> }>;
}

/** Lightweight events-since response */
export interface EventsSinceDTO {
  snapshotId: string;
  checkpointDate: string;
  events: ClinicalEventReplay[];
  eventCount: number;
}

// ── API Functions ──────────────────────────────────────────────────────────────

/**
 * getDerivedClinicalState
 *
 * Returns the current clinical truth: latest snapshot + all events after it.
 * derivedState is the chartState to show in the UI on load.
 */
export async function getDerivedClinicalState(caseId: string): Promise<DerivedClinicalStateDTO> {
  const res = await api.get(`${BASE}/${caseId}`);
  return res.data.data;
}

/**
 * getDerivedStateFromSnapshot
 *
 * Returns derived state from a specific snapshot checkpoint.
 * Used when the user selects a specific point on the timeline.
 */
export async function getDerivedStateFromSnapshot(
  caseId: string,
  snapshotId: string
): Promise<DerivedClinicalStateDTO> {
  const res = await api.get(`${BASE}/${caseId}/snapshots/${snapshotId}`);
  return res.data.data;
}

/**
 * getEventsSinceSnapshot
 *
 * Returns only the raw events since a snapshot (no derivedState computed).
 * Lightweight — used for incremental event polling or sidebar event lists.
 */
export async function getEventsSinceSnapshot(
  caseId: string,
  snapshotId: string
): Promise<EventsSinceDTO> {
  const res = await api.get(`${BASE}/${caseId}/events-since/${snapshotId}`);
  return res.data.data;
}

/**
 * getTimeTravelState
 *
 * Phase 5 time-travel: returns derived state replayed up to `until` timestamp.
 * All events after `until` are excluded — reconstructs historical chart state.
 *
 * @param caseId - OrthodonticCase._id
 * @param until  - ISO 8601 timestamp ceiling (inclusive)
 */
export async function getTimeTravelState(
  caseId: string,
  until: string
): Promise<DerivedClinicalStateDTO> {
  const res = await api.get(`${BASE}/${caseId}`, { params: { until } });
  return res.data.data;
}

/**
 * getZeroReplayState (DEV only)
 *
 * Phase 5 correctness test: replays ALL events from zero, ignoring any snapshots.
 * Use this to verify the system works without any snapshot documents.
 */
export async function getZeroReplayState(caseId: string): Promise<DerivedClinicalStateDTO> {
  const res = await api.get(`${BASE}/${caseId}/zero`);
  return res.data.data;
}

// ── Phase 5: Timeline & Time Travel ───────────────────────────────────────────

/** Full ClinicalEvent shape returned by the timeline endpoint */
export interface TimelineEvent {
  _id:       string;
  eventId:   string;
  type:      string;
  sequence:  number;
  visitId:   string | null;
  payload:   Record<string, unknown>;
  createdAt: string;
  createdBy: string | null;
}

export interface TimelineFilters {
  visitId?: string;
  type?:    string;
  toothId?: number;
}

export interface TimelineDTO {
  events:     TimelineEvent[];
  eventCount: number;
}

export interface StateAtEventDTO {
  targetEvent:  TimelineEvent;
  derivedState: Record<string, unknown>;
  eventCount:   number;
  replayedUpTo: number;
}

/**
 * getCaseTimeline
 *
 * Phase 5: Returns the full chronological event log for a case.
 * Supports server-side filtering by visitId, type, and toothId.
 */
export async function getCaseTimeline(
  caseId: string,
  filters?: TimelineFilters
): Promise<TimelineDTO> {
  const params: Record<string, string> = {};
  if (filters?.visitId)           params.visitId = filters.visitId;
  if (filters?.type)              params.type    = filters.type;
  if (filters?.toothId != null)   params.toothId = String(filters.toothId);

  const res = await api.get(`${BASE}/${caseId}/timeline`, { params });
  return res.data.data;
}

/**
 * getStateAtEvent
 *
 * Phase 5 time travel: replays all events up to and including `eventId`,
 * returning the chart state as it existed at that exact moment.
 */
export async function getStateAtEvent(
  caseId: string,
  eventId: string
): Promise<StateAtEventDTO> {
  const res = await api.get(`${BASE}/${caseId}/events/${eventId}/state`);
  return res.data.data;
}
