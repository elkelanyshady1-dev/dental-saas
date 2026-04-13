/**
 * snapshotIntegrity.ts — Snapshot Integrity & Deterministic Replay Tool
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE (Phase 8 — Production Hardening)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * RULE: Snapshot = reducer(initialState, events)
 *       A snapshot is ONLY a performance cache. It must NEVER be mutated directly.
 *       State can always be rebuilt from events alone.
 *
 * NEVER:
 *   ❌ mutate snapshot after creation
 *   ❌ store derived/computed state in snapshot
 *   ❌ trust snapshot without verification
 *
 * ALWAYS:
 *   ✅ verify snapshot against event replay
 *   ✅ rebuild from events if snapshot is corrupted
 *   ✅ hash state for fast integrity checks
 *
 * TOOLS:
 *   - hashState(state)                    — SHA-256 fingerprint of state
 *   - replay(events, initialState?)       — deterministic state reconstruction
 *   - verifySnapshot(snapshot, events)    — compare snapshot vs replay
 *   - debugReplay(events)                 — step-by-step replay with logging
 *
 * @pure — all functions are pure (except console.log in debug mode)
 */

import type { ChartState } from '../types';
import { applyClinicalEvent, upgradeEvent, type ClinicalEventLike } from './clinicalReducer';
import { hasProcessedEvent, markProcessed } from './normalizedEntities';

// ─── State Hashing ──────────────────────────────────────────────────────────

/**
 * hashState — deterministic fingerprint of a chart state.
 *
 * Uses stable JSON stringification (sorted keys) + SHA-256.
 * Two identical states ALWAYS produce the same hash.
 * Used for snapshot integrity verification and idempotency checks.
 *
 * @param state — ChartState to hash
 * @returns hex-encoded SHA-256 hash string
 */
export async function hashState(state: ChartState): Promise<string> {
  const serialized = _stableStringify(state);
  const buffer = new TextEncoder().encode(serialized);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback: simple FNV-1a hash for environments without crypto.subtle
  return _fnv1a(serialized);
}

/**
 * hashStateSync — synchronous fingerprint (FNV-1a, faster, less collision-resistant).
 * Use for dev-mode assertions where async is inconvenient.
 */
export function hashStateSync(state: ChartState): string {
  return _fnv1a(_stableStringify(state));
}

// ─── Deterministic Replay ───────────────────────────────────────────────────

/**
 * Initial clinical state — canonical zero state (32 healthy FDI teeth).
 * Mirrors backend's getInitialClinicalState() exactly.
 */
export function getInitialClinicalState(): ChartState {
  const FDI_TOOTH_TYPES: Record<number, string> = {
    1: 'incisor', 2: 'incisor', 3: 'canine',
    4: 'premolar', 5: 'premolar',
    6: 'molar', 7: 'molar', 8: 'molar',
  };

  const makeTooth = (id: number, isUpper: boolean) => ({
    id,
    type:           FDI_TOOTH_TYPES[id % 10] ?? 'molar',
    status:         'healthy' as const,
    isUpper,
    clinicalStatus: { diagnosis: null, alignment: null, condition: null },
    clinicalAlerts: [],
  });

  return {
    upperTeeth:    [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28].map(id => makeTooth(id, true)),
    lowerTeeth:    [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38].map(id => makeTooth(id, false)),
    miniscrews:    [],
    upperArchwire: undefined,
    lowerArchwire: undefined,
    elastics:      [],
    appliances:    [],
    powerChains:   [],
    accessories:   [],
    ligatures:     [],
    iprMarkers:    [],
    spaceMarkers:  [],
  } as ChartState;
}

/**
 * replay — deterministic state reconstruction from events.
 *
 * RULE: Snapshot = replay(events)
 *       If this ever disagrees with a stored snapshot, the snapshot is WRONG.
 *
 * PURE — no side effects, no API calls.
 * Events MUST be sorted chronologically (oldest first).
 *
 * @param events       — ordered array of ClinicalEvent documents
 * @param initialState — base state (defaults to canonical zero state)
 * @returns final chart state
 */
export function replay(
  events: ClinicalEventLike[],
  initialState?: ChartState,
): ChartState {
  const base = initialState ?? getInitialClinicalState();

  if (!Array.isArray(events) || events.length === 0) return { ...base };

  // Phase 8: eventId idempotency during replay
  const seenEventIds = new Set<string>();

  return events.reduce((state, event) => {
    try {
      // Idempotency: skip duplicate eventIds
      if (event.eventId) {
        if (seenEventIds.has(event.eventId)) return state;
        seenEventIds.add(event.eventId);
      }

      const upgraded = upgradeEvent(event);
      return applyClinicalEvent(state, upgraded);
    } catch {
      // Never let a single corrupted event break the entire replay chain
      return state;
    }
  }, { ...base });
}

/**
 * debugReplay — step-by-step replay with logging.
 *
 * Logs every event and the resulting state after each step.
 * Returns the final state plus an array of step records.
 *
 * Usage:
 *   const { state, steps } = debugReplay(events);
 *   console.table(steps.map(s => ({ type: s.event.type, eventId: s.event.eventId })));
 */
export function debugReplay(
  events: ClinicalEventLike[],
  initialState?: ChartState,
): { state: ChartState; steps: Array<{ event: ClinicalEventLike; stateAfter: ChartState }> } {
  const base = initialState ?? getInitialClinicalState();
  const steps: Array<{ event: ClinicalEventLike; stateAfter: ChartState }> = [];

  if (!Array.isArray(events) || events.length === 0) {
    return { state: { ...base }, steps };
  }

  const seenEventIds = new Set<string>();
  let state = { ...base };

  for (const event of events) {
    try {
      if (event.eventId) {
        if (seenEventIds.has(event.eventId)) {
          console.warn('[debugReplay] DUPLICATE eventId skipped:', event.eventId, event.type);
          continue;
        }
        seenEventIds.add(event.eventId);
      }

      const upgraded = upgradeEvent(event);
      const nextState = applyClinicalEvent(state, upgraded);

      console.log('[debugReplay] EVENT:', event.type, event.payload);
      console.log('[debugReplay] STATE:', nextState);

      steps.push({ event, stateAfter: nextState });
      state = nextState;
    } catch (err) {
      console.error('[debugReplay] Event failed:', event.type, err);
      steps.push({ event, stateAfter: state });
    }
  }

  return { state, steps };
}

// ─── Snapshot Verification ──────────────────────────────────────────────────

export interface VerificationResult {
  valid:        boolean;
  snapshotHash: string;
  replayHash:   string;
  eventCount:   number;
  mismatchKeys: string[];
}

/**
 * verifySnapshot — compare stored snapshot against event replay.
 *
 * RULE: If this returns valid=false, the snapshot is corrupt.
 *       The system MUST fall back to event replay (events are truth).
 *
 * @param snapshotState — the chart state stored in the snapshot
 * @param events        — all events used to build that snapshot
 * @param initialState  — base state before events (defaults to canonical zero)
 * @returns VerificationResult with hash comparison and mismatch details
 */
export async function verifySnapshot(
  snapshotState: ChartState,
  events: ClinicalEventLike[],
  initialState?: ChartState,
): Promise<VerificationResult> {
  const replayedState = replay(events, initialState);

  // Exclude internal metadata from comparison
  const snapshotClean = _stripInternalFields(snapshotState);
  const replayClean   = _stripInternalFields(replayedState);

  const snapshotHash = await hashState(snapshotClean);
  const replayHash   = await hashState(replayClean);

  const mismatchKeys = _findMismatchKeys(snapshotClean, replayClean);

  return {
    valid:        snapshotHash === replayHash,
    snapshotHash,
    replayHash,
    eventCount:   events.length,
    mismatchKeys,
  };
}

/**
 * Synchronous snapshot verification (uses FNV-1a hash — faster, less precise).
 */
export function verifySnapshotSync(
  snapshotState: ChartState,
  events: ClinicalEventLike[],
  initialState?: ChartState,
): VerificationResult {
  const replayedState = replay(events, initialState);

  const snapshotClean = _stripInternalFields(snapshotState);
  const replayClean   = _stripInternalFields(replayedState);

  const snapshotHash = hashStateSync(snapshotClean);
  const replayHash   = hashStateSync(replayClean);

  const mismatchKeys = _findMismatchKeys(snapshotClean, replayClean);

  return {
    valid:        snapshotHash === replayHash,
    snapshotHash,
    replayHash,
    eventCount:   events.length,
    mismatchKeys,
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/** Stable JSON.stringify with sorted keys — ensures deterministic hashing. */
function _stableStringify(obj: unknown): string {
  return JSON.stringify(obj, (_, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Set)) {
      return Object.keys(value).sort().reduce((sorted: Record<string, unknown>, key) => {
        sorted[key] = (value as Record<string, unknown>)[key];
        return sorted;
      }, {});
    }
    // Convert Sets to arrays for serialization
    if (value instanceof Set) return Array.from(value);
    return value;
  });
}

/** Strip internal metadata fields before comparison. */
function _stripInternalFields(state: ChartState): ChartState {
  const { _processedEventIds, activeContextMenu, ...clean } = state as any;
  return clean;
}

/** Find top-level keys where snapshot and replay differ. */
function _findMismatchKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const mismatches: string[] = [];

  for (const key of allKeys) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      mismatches.push(key);
    }
  }

  return mismatches;
}

/** FNV-1a hash — fast synchronous hash for dev-mode use. */
function _fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
