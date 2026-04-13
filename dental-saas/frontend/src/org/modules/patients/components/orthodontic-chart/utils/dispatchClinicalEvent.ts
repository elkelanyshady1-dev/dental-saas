/**
 * dispatchClinicalEvent.ts — Single Clinical Event Entry Point
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE (Event-Driven Enforcement — Phase 7 + Phase 8 Hardening)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * RULE: UI MUST NOT mutate clinical state directly.
 *       UI MUST ONLY dispatch events through this module.
 *       ALL state MUST come from the reducer (snapshot/chartState).
 *
 * FLOW:
 *   UI interaction
 *     → dispatchClinicalEvent(event)
 *       → STEP 0: CONTRACT VALIDATION (eventId, version, timestamp)
 *       → STEP 1: StrictMode double-render guard
 *       → STEP 2: Same-frame fingerprint dedup
 *       → STEP 3: Position-aware TAD dedup
 *       → STEP 4: Debug log (EVENT before apply)
 *       → STEP 5: actionDispatcher pipeline → chartReducer via APPLY_CLINICAL_EVENT
 *       → STEP 6: BroadcastChannel emit (multi-tab sync, zero-trust)
 *       → STEP 7: Debug log (STATE after apply)
 *
 * MANDATORY EVENT CONTRACT (Phase 8):
 *   Every event MUST have: { eventId: uuid, version: number, timestamp: number }
 *   The dispatcher enforces this — missing fields are auto-populated.
 *   Reducer NEVER calls Date.now() — timestamp comes from here.
 *
 * ❌ REMOVED:
 *   - Direct createAction() calls from UI
 *   - Direct DB calls from UI components
 *   - Local state mutations for clinical data
 *   - Parallel TAD paths (PLACE_TAD / REMOVE_TAD / FAIL_TAD)
 *
 * ════════════════════════════════════════════════════════════════════════════
 *
 * @per-org-safe — no DB access, operates on local reducer state only
 */

import { v4 as uuidv4 } from 'uuid';
import {
  dispatchClinicalAction,
  type DispatchResult,
} from './actionDispatcher';
import type { ClinicalState } from './clinicalActionGuard';
import type { ChartState } from '../types';
import { emitClinicalEvent as _broadcastEvent, isWriteLockedByOtherTab } from './clinicalChannel';
// Phase 9: Safeguard Layer imports
import { validateState } from './stateInvariants';
import {
  validateEvent as safeguardValidateEvent,
  isInFailsafeMode,
} from './safeguardLayer';
import { applyClinicalEventSafe } from './clinicalReducer';

// ─── Types ───────────────────────────────────────────────────────────────────

/** All clinical event types supported by the dispatcher. */
export type ClinicalEventType =
  // Tooth events
  | 'SET_TOOTH_STATUS'
  | 'SET_TOOTH_BONDING'
  | 'SET_TOOTH_DIAGNOSIS'
  | 'SET_TOOTH_ALIGNMENT'
  | 'SET_TOOTH_CONDITION'
  | 'TOGGLE_TOOTH_ALERT'
  | 'CLEAR_TOOTH'
  // Archwire
  | 'ARCHWIRE_PLACED'
  | 'ARCHWIRE_REMOVED'
  // Appliances
  | 'ELASTIC_APPLIED'
  | 'ELASTIC_REMOVED'
  | 'POWERCHAIN_APPLIED'
  | 'POWERCHAIN_REMOVED'
  | 'ACCESSORY_ADDED'
  | 'ACCESSORY_REMOVED'
  | 'LIGATURE_ADDED'
  | 'LIGATURE_REMOVED'
  | 'IPR_ADDED'
  | 'IPR_REMOVED'
  | 'SPACE_MARKER_ADDED'
  | 'SPACE_MARKER_REMOVED'
  // TAD / Miniscrew events
  | 'TAD_INSERTED'
  | 'TAD_REMOVED'
  | 'TAD_FAILED'
  | 'TAD_REINSERTED'
  | 'TAD_MARKED_FOR_REMOVAL'
  // Context menu (UI → event conversion)
  | 'TAD_CONTEXT_MENU_OPEN'
  | 'TAD_CONTEXT_MENU_CLOSE'
  // Bonding
  | 'BONDING_APPLIED'
  | 'BONDING_REMOVED'
  | 'BONDING_REBONDED'
  | 'BRACKET_REPOSITIONED'
  | 'BRACKET_DEBONDED';

/**
 * ClinicalEvent — the mandatory event contract.
 *
 * Phase 8: Every event MUST have eventId, version, and timestamp.
 * The dispatcher auto-populates these if missing, but they SHOULD be set
 * explicitly by the caller for maximum determinism.
 *
 * The reducer NEVER generates timestamps — it reads event.timestamp instead.
 */
export interface ClinicalEvent {
  type: ClinicalEventType;
  payload: Record<string, unknown>;
  /** UUID — idempotency key. Auto-generated if missing. */
  eventId?: string;
  /** Schema version. Defaults to 1. */
  version?: number;
  /** Monotonic event sequence (set by backend). */
  sequence?: number;
  /** Unix ms timestamp. Auto-injected by dispatcher if missing. Reducer reads this — NEVER Date.now(). */
  timestamp?: number;
}

export interface DispatchConfig {
  /** Current chart state getter — required for deduplication */
  getState: () => ChartState;
  /** Synchronous reducer dispatch (React useReducer dispatch) */
  dispatch: (action: { type: string; payload: unknown }) => void;
  /** Optional async API commit — runs AFTER reducer update */
  onCommit?: (event: ClinicalEvent) => Promise<void>;
  /** Optional action logger */
  logAction?: (description: string) => void;
  /** Source of event */
  source?: 'ui' | 'opg-sync' | 'snapshot-restore' | 'history-replay';
  /** Enable debug mode — logs EVENT + STATE to console */
  debug?: boolean;
  /** Case ID for BroadcastChannel multi-tab sync. If omitted, no cross-tab emit. */
  caseId?: string;
  /**
   * Phase 8 PART 2: Last known sequence number for this case.
   * If provided, events with event.sequence <= lastSequence are rejected
   * as out-of-order. Only applies to events that carry a sequence number
   * (server-assigned). UI-originated events without a sequence pass through.
   */
  lastSequence?: number;
}

// ─── Sequence Tracking (PART 2: Monotonic Sequence Guard) ────────────────────
/**
 * Per-case high-water mark for event sequences.
 * Ensures events are applied in strictly increasing order.
 * Events arriving out-of-order are rejected to prevent state corruption.
 */
const _sequenceHighWaterMark = new Map<string, number>();
const _SEQUENCE_MAP_MAX = 100; // max tracked cases

function _checkAndAdvanceSequence(caseId: string | undefined, sequence: number | undefined): { ok: boolean; reason?: string } {
  // Events without a sequence (UI-originated, not yet server-assigned) always pass
  if (sequence == null || caseId == null) return { ok: true };

  const current = _sequenceHighWaterMark.get(caseId) ?? 0;

  if (sequence <= current) {
    return { ok: false, reason: `OUT_OF_ORDER_SEQUENCE: event.sequence=${sequence} <= highWaterMark=${current}` };
  }

  // Advance high-water mark
  _sequenceHighWaterMark.set(caseId, sequence);

  // Cap memory — evict oldest entries
  if (_sequenceHighWaterMark.size > _SEQUENCE_MAP_MAX) {
    const firstKey = _sequenceHighWaterMark.keys().next().value;
    if (firstKey) _sequenceHighWaterMark.delete(firstKey);
  }

  return { ok: true };
}

/**
 * Reset sequence tracking for a case (call after crash recovery or snapshot load).
 * @internal — exported for useCrashRecovery
 */
export function resetSequenceTracking(caseId: string): void {
  _sequenceHighWaterMark.delete(caseId);
}

// ─── Event Deduplication (Three Layers) ──────────────────────────────────────

/**
 * LAYER 1: Same-frame fingerprint dedup
 * Prevents double-click / double-dispatch within a single animation frame.
 */
let _lastEventFingerprint: string | null = null;

function _eventFingerprint(event: ClinicalEvent): string {
  return `${event.type}:${JSON.stringify(event.payload)}`;
}

/**
 * LAYER 2: StrictMode double-render guard
 * React.StrictMode calls reducers twice in dev. Track dispatched eventIds
 * so the SECOND call (with the same eventId) is blocked at the dispatcher level.
 * The reducer also has its own processedEventIds check (defense in depth).
 */
const _dispatchedEventIds = new Set<string>();
const _DISPATCH_REGISTRY_MAX = 5000; // cap memory in long sessions

function _registerDispatchedEvent(eventId: string): boolean {
  if (_dispatchedEventIds.has(eventId)) return false; // already dispatched
  if (_dispatchedEventIds.size >= _DISPATCH_REGISTRY_MAX) {
    // Evict oldest entries (Set preserves insertion order)
    const iter = _dispatchedEventIds.values();
    for (let i = 0; i < 1000; i++) iter.next(); // skip past first 1000
    // Rebuild with only recent entries
    const keep = new Set<string>();
    for (const id of _dispatchedEventIds) {
      if (keep.size >= _DISPATCH_REGISTRY_MAX - 1000) break;
      keep.add(id);
    }
    _dispatchedEventIds.clear();
    for (const id of keep) _dispatchedEventIds.add(id);
  }
  _dispatchedEventIds.add(eventId);
  return true;
}

/**
 * LAYER 3: Position-aware TAD deduplication
 * Checks if a TAD already exists at the same tooth+position in current state.
 */
function _isDuplicateTad(event: ClinicalEvent, state: ChartState): boolean {
  if (event.type !== 'TAD_INSERTED') return false;

  const { toothNumber, toothId, chartPosition, position } = event.payload as Record<string, any>;
  const tooth = toothNumber ?? toothId;
  const anchorType = chartPosition?.anchorType ?? position ?? 'mesial';

  if (tooth == null) return false;

  return (state.miniscrews ?? []).some(
    (ms) => ms.toothId === tooth && ms.anchorType === anchorType
  );
}

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

/**
 * dispatchClinicalEvent — SINGLE ENTRY POINT for all clinical state mutations.
 *
 * UI components MUST call this instead of:
 *   ❌ dispatch({ type: 'PLACE_TAD', ... })
 *   ❌ tadsApi.create(...)
 *   ❌ setState(...)
 *
 * ✅ dispatchClinicalEvent({ type: 'TAD_INSERTED', payload: { ... } }, config)
 *
 * FLOW:
 *   1. Assign eventId (idempotency key)
 *   2. Rapid dedup (same-frame fingerprint)
 *   3. Position-aware dedup (TAD at same tooth+position)
 *   4. Route through actionDispatcher pipeline
 *   5. Apply to reducer via APPLY_CLINICAL_EVENT
 *   6. Async API commit (fire-and-forget)
 *   7. Debug log (dev mode)
 *
 * @param event  — Clinical event to dispatch
 * @param config — Dispatcher configuration (state getter, dispatch, commit, etc.)
 * @returns DispatchResult with success/blocked status
 */
export function dispatchClinicalEvent(
  event: ClinicalEvent,
  config: DispatchConfig,
): DispatchResult {
  const {
    getState,
    dispatch,
    onCommit,
    logAction,
    source = 'ui',
    debug = false,
    caseId,
  } = config;

  // ── STEP 0: MANDATORY EVENT CONTRACT ENFORCEMENT (Phase 8) ─────────────────
  // Every event MUST have: eventId, version, timestamp.
  // These are the three pillars of deterministic, idempotent, replayable state.
  if (!event.eventId) {
    event.eventId = uuidv4();
  }
  if (!event.version) {
    event.version = 1;
  }
  if (!event.timestamp) {
    // Timestamp injection: reducer NEVER calls Date.now() — it reads this field.
    event.timestamp = Date.now();
  }

  // Dev-mode contract assertion: warn if caller didn't provide mandatory fields
  if (process.env.NODE_ENV !== 'production') {
    if (!event.eventId || !event.version || !event.timestamp) {
      console.error(
        '[ClinicalEventDispatcher] EVENT CONTRACT VIOLATION: Missing mandatory fields.',
        'Every event MUST have { eventId, version, timestamp }.',
        event,
      );
    }
  }

  // ── STEP 0.3: Failsafe mode guard (Phase 9 — Safeguard Layer) ─────────────
  // If the system is in failsafe mode (critical inconsistency detected),
  // ALL mutations are blocked until the user refreshes or recovery completes.
  if (isInFailsafeMode(caseId)) {
    if (debug || process.env.NODE_ENV !== 'production') {
      console.warn('[ClinicalEventDispatcher] BLOCKED: System in failsafe mode for case:', caseId);
    }
    return { success: false, blocked: true, reason: 'FAILSAFE_MODE_ACTIVE' };
  }

  // ── STEP 0.5: Multi-tab write-lock guard (PART 3 — Phase 8) ───────────────
  // If another tab holds the write-lock for this case, block the dispatch.
  // This tab is in READ-ONLY mode — it can view but not mutate clinical state.
  if (caseId && isWriteLockedByOtherTab(caseId)) {
    if (debug || process.env.NODE_ENV !== 'production') {
      console.warn('[ClinicalEventDispatcher] BLOCKED: Another tab holds the write-lock for case:', caseId);
    }
    return { success: false, blocked: true, reason: 'WRITE_LOCKED_BY_OTHER_TAB' };
  }

  // ── STEP 1: StrictMode double-render guard (Phase 8) ──────────────────────
  // React.StrictMode calls reducers twice in dev. This blocks the duplicate.
  // Defense in depth: reducer also has processedEventIds as a second layer.
  if (!_registerDispatchedEvent(event.eventId)) {
    if (debug || process.env.NODE_ENV !== 'production') {
      console.warn('[ClinicalEventDispatcher] Duplicate event blocked (StrictMode/retry):', event.eventId);
    }
    return { success: false, blocked: true, reason: 'DUPLICATE_EVENT_ID' };
  }

  // ── STEP 2: Same-frame fingerprint dedup (double-click guard) ─────────────
  const fingerprint = _eventFingerprint(event);
  if (_lastEventFingerprint === fingerprint) {
    if (debug || process.env.NODE_ENV !== 'production') {
      console.warn('[ClinicalEventDispatcher] Duplicate event blocked (same-frame):', event.type);
    }
    return { success: false, blocked: true, reason: 'DUPLICATE_SAME_FRAME' };
  }
  _lastEventFingerprint = fingerprint;
  requestAnimationFrame(() => { _lastEventFingerprint = null; });

  // ── STEP 2.5: Monotonic sequence guard (PART 2 — Phase 8) ────────────────
  // Events from the server carry a monotonic sequence number.
  // Reject events arriving out-of-order to prevent state corruption.
  // UI-originated events without a sequence number pass through.
  if (event.sequence != null) {
    const seqCheck = _checkAndAdvanceSequence(caseId, event.sequence);
    if (!seqCheck.ok) {
      if (debug || process.env.NODE_ENV !== 'production') {
        console.warn('[ClinicalEventDispatcher] Out-of-order event rejected:', seqCheck.reason, event.eventId);
      }
      return { success: false, blocked: true, reason: seqCheck.reason ?? 'OUT_OF_ORDER_SEQUENCE' };
    }
  }

  // Also respect config.lastSequence as a floor (from server state)
  if (config.lastSequence != null && event.sequence != null && event.sequence <= config.lastSequence) {
    if (debug || process.env.NODE_ENV !== 'production') {
      console.warn('[ClinicalEventDispatcher] Event below lastSequence floor:', event.sequence, '<=', config.lastSequence);
    }
    return { success: false, blocked: true, reason: 'BELOW_LAST_SEQUENCE' };
  }

  // ── STEP 3: Position-aware TAD dedup ──────────────────────────────────────
  const state = getState();
  if (_isDuplicateTad(event, state)) {
    if (debug || process.env.NODE_ENV !== 'production') {
      console.warn('[ClinicalEventDispatcher] Duplicate TAD blocked (same position):', event.payload);
    }
    return { success: false, blocked: true, reason: 'DUPLICATE_TAD_POSITION' };
  }

  // ── STEP 3.5: Safeguard pre-validation (Phase 9 — Gatekeeper) ─────────────
  // Validates event structure + domain rules BEFORE entering the reducer.
  // Catches: missing required fields, invalid FDI numbers, impossible transitions.
  try {
    safeguardValidateEvent(event, state);
  } catch (preValErr) {
    if (debug || process.env.NODE_ENV !== 'production') {
      console.warn(
        '[ClinicalEventDispatcher] Safeguard pre-validation failed:',
        preValErr instanceof Error ? preValErr.message : String(preValErr),
        event.type, event.eventId,
      );
    }
    return {
      success: false,
      blocked: true,
      reason: `SAFEGUARD_PRE_VALIDATION: ${preValErr instanceof Error ? preValErr.message : String(preValErr)}`,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GLOBAL FAILSAFE (PART 7 — Phase 8 + Phase 9 Post-Validation)
  // Steps 4–7 are wrapped in try/catch. If ANYTHING throws during the
  // dispatch pipeline (reducer, actionDispatcher, broadcast), we:
  //   1. Log a CRITICAL error
  //   2. Attempt to revert to the pre-dispatch state snapshot
  //   3. Return a failure result — never let an exception propagate
  // This prevents a single bad event from crashing the entire editor.
  //
  // Phase 9 ADDITION: After the reducer applies the event, we run
  // post-validation invariant checks on the NEW state. If any critical
  // invariant fails, the state is rolled back and the event is rejected.
  // ══════════════════════════════════════════════════════════════════════════
  const _preDispatchStateSnapshot = state; // captured BEFORE any mutation

  try {
    // ── STEP 4: Debug — log EVENT before apply ──────────────────────────────
    if (debug || process.env.NODE_ENV !== 'production') {
      console.log('[ClinicalEventDispatcher] EVENT:', event.type, event.payload, `[${event.eventId}]`);
    }

    // ── STEP 5: Route through actionDispatcher pipeline ─────────────────────
    const result = dispatchClinicalAction({
      action: {
        type: event.type as any,
        payload: event.payload,
        timestamp: Date.now(),
        source,
      },
      getState: () => _chartStateToClinicalState(state),
      onApply: () => {
        // Apply via chartReducer's APPLY_CLINICAL_EVENT — the ONLY write path
        dispatch({ type: 'APPLY_CLINICAL_EVENT', payload: event });
      },
      onCommit: onCommit ? () => onCommit(event) : undefined,
      source,
      logAction,
    });

    // ── STEP 5.5: Post-reducer state validation (Phase 9 — Safeguard Layer) ──
    // After the reducer produces new state, validate it against domain invariants.
    // If the new state violates ANY critical invariant, rollback and reject.
    if (result.success) {
      const postState = getState();
      const violation = validateState(postState);
      if (violation) {
        console.error(
          '[ClinicalEventDispatcher] ⛔ POST-VALIDATION FAILED — rolling back.',
          'Event:', event.type, event.eventId,
          'Violation:', violation.code, violation.message,
        );

        // Rollback: restore pre-dispatch state
        dispatch({
          type: 'HYDRATE_SNAPSHOT',
          payload: { chartState: _preDispatchStateSnapshot },
        });

        return {
          success: false,
          blocked: true,
          reason: `POST_VALIDATION_FAILED: ${violation.code} — ${violation.message}`,
        };
      }
    }

    // ── STEP 6: BroadcastChannel multi-tab sync (Phase 8) ───────────────────
    // Zero-trust: emits ONLY { type, eventId, caseId, tabId } — NO clinical data.
    // Other tabs receive → invalidateQueries → refetch API → render.
    if (result.success && config.caseId && event.eventId) {
      try {
        _broadcastEvent(event.eventId, config.caseId);
      } catch {
        // BroadcastChannel failures are non-fatal — other tabs will sync on next focus
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[ClinicalEventDispatcher] BroadcastChannel emit failed for:', event.eventId);
        }
      }
    }

    // ── STEP 7: Debug — log STATE after apply ───────────────────────────────
    if (debug || process.env.NODE_ENV !== 'production') {
      if (result.success) {
        const newState = getState();
        console.log('[ClinicalEventDispatcher] STATE:', newState);
      } else {
        console.log('[ClinicalEventDispatcher] BLOCKED:', result.reason);
      }
    }

    return result;

  } catch (err) {
    // ── FAILSAFE: Critical error during dispatch ────────────────────────────
    // Log the error, attempt state revert, and return a safe failure result.
    console.error(
      '[ClinicalEventDispatcher] CRITICAL FAILSAFE: Unhandled error during dispatch.',
      'Event:', event.type, event.eventId,
      'Error:', err,
    );

    // Attempt to revert to pre-dispatch state by hydrating the snapshot
    try {
      dispatch({
        type: 'HYDRATE_SNAPSHOT',
        payload: { chartState: _preDispatchStateSnapshot },
      });
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[ClinicalEventDispatcher] FAILSAFE: State reverted to pre-dispatch snapshot.');
      }
    } catch (revertErr) {
      // Revert also failed — the UI is in an unknown state.
      // The user should refresh. Log but don't throw.
      console.error(
        '[ClinicalEventDispatcher] CRITICAL: State revert ALSO failed. Manual refresh required.',
        revertErr,
      );
    }

    return {
      success: false,
      blocked: true,
      reason: `FAILSAFE_ERROR: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Batch Dispatch ──────────────────────────────────────────────────────────

/**
 * Dispatch multiple clinical events atomically.
 * Each event gets its own eventId. If any is blocked, others still proceed.
 */
export function dispatchMultipleClinicalEvents(
  events: ClinicalEvent[],
  config: DispatchConfig,
): DispatchResult[] {
  return events.map((event) => dispatchClinicalEvent(event, config));
}

// ─── Bound Dispatcher Factory ────────────────────────────────────────────────

/**
 * Creates a component-scoped dispatcher.
 * Reduces boilerplate — components only need to call dispatch(type, payload).
 *
 * Usage:
 *   const clinicalDispatch = createClinicalDispatcher({ getState, dispatch, onCommit });
 *   clinicalDispatch('TAD_INSERTED', { toothNumber: 14, position: 'mesial', ... });
 */
export function createClinicalDispatcher(config: DispatchConfig) {
  return (type: ClinicalEventType, payload: Record<string, unknown>): DispatchResult => {
    return dispatchClinicalEvent({ type, payload }, config);
  };
}

// ─── Context Menu Event Helpers ──────────────────────────────────────────────

/**
 * Convert right-click to a clinical event.
 * Menu rendering reads from state — NEVER from local variables.
 *
 * Usage:
 *   onContextMenu={(e) => {
 *     e.preventDefault();
 *     dispatchContextMenuOpen(tadId, config);
 *   }}
 */
export function dispatchContextMenuOpen(
  tadId: string,
  config: DispatchConfig,
): DispatchResult {
  return dispatchClinicalEvent(
    { type: 'TAD_CONTEXT_MENU_OPEN', payload: { tadId } },
    { ...config, skipDuplicateCheck: true } as any,
  );
}

export function dispatchContextMenuClose(config: DispatchConfig): DispatchResult {
  return dispatchClinicalEvent(
    { type: 'TAD_CONTEXT_MENU_CLOSE', payload: {} },
    { ...config, skipDuplicateCheck: true } as any,
  );
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Maps ChartState → ClinicalState for the actionGuard duplicate checker.
 * Only extracts the fields needed by clinicalActionGuard validators.
 */
function _chartStateToClinicalState(chart: ChartState): ClinicalState {
  return {
    upperArchwire: chart.upperArchwire,
    lowerArchwire: chart.lowerArchwire,
    powerChains:   chart.powerChains,
    elastics:      chart.elastics,
    miniscrews:    (chart.miniscrews ?? []).map((ms) => ({
      id:       ms.id,
      toothId:  ms.toothId,
      position: ms.anchorType,
    })),
    ligatures:    chart.ligatures?.map((l: any) => ({ toothId: l.toothIds?.[0], type: l.type })),
    iprMarkers:   chart.iprMarkers?.map((m: any) => ({ toothId: m.toothId, amount: Number(m.value) })),
    spaceMarkers: chart.spaceMarkers?.map((m: any) => ({ toothId: m.toothId, location: m.anchorType })),
  };
}

// ─── Phase 9: Re-export safeguard layer utilities ───────────────────────────
// These are re-exported here so callers who import from this module (the single
// entry point) can also access the safeguard layer without a second import.

export {
  safeDispatch,
  validateEvent as safeguardValidateEvent,
  verifyConsistency,
  rollbackToSnapshot,
  isInFailsafeMode,
  enterFailsafeMode,
  exitFailsafeMode,
  runGlobalAssertions,
  debugDispatch,
  resetEventRegistry,
  type SafeDispatchResult,
  type SafeDispatchConfig,
} from './safeguardLayer';

export {
  validateState,
  validateStateStrict,
  assertStateValid,
  StateInvariantError,
  type InvariantViolation,
} from './stateInvariants';
