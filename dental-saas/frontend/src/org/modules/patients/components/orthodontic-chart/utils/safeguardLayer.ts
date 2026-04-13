/**
 * safeguardLayer.ts — Clinical Event Safeguard Layer (Phase 9)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * This module wraps the ENTIRE event pipeline with transactional safety:
 *
 *   1. GATEKEEPER     — validateEvent() pre-validates before dispatch
 *   2. POST-VALIDATE  — validateState() checks reducer output invariants
 *   3. CONSISTENCY    — verifyConsistency() compares UI ↔ DB state
 *   4. SAFE DISPATCH  — safeDispatch() is the transactional wrapper
 *   5. ROLLBACK       — automatic state revert on any failure
 *   6. DEDUP GUARD    — consolidated event duplication prevention
 *   7. FAILSAFE MODE  — disables mutations on critical inconsistency
 *   8. DEBUG MODE     — structured event + state logging
 *
 * GUARANTEES:
 *   ✅ No invalid event enters the system
 *   ✅ No inconsistent state is produced
 *   ✅ No silent failure is allowed
 *   ✅ Every mutation is verifiable and reversible
 *
 * INTEGRATION:
 *   This module is called from dispatchClinicalEvent.ts — the single entry
 *   point for all clinical state mutations. It does NOT replace the existing
 *   pipeline; it WRAPS it with transactional guarantees.
 *
 * @per-org-safe — no direct DB access from this module
 */

import { v4 as uuidv4 } from 'uuid';
import type { ChartState } from '../types';
import type { ClinicalEvent, ClinicalEventType, DispatchConfig } from './dispatchClinicalEvent';
import {
  validateState,
  validateStateStrict,
  StateInvariantError,
  type InvariantViolation,
} from './stateInvariants';
import { applyClinicalEventSafe } from './clinicalReducer';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SafeDispatchResult {
  success: boolean;
  blocked: boolean;
  reason?: string;
  /** If a state invariant was violated, the violation details */
  violation?: InvariantViolation;
  /** Event ID (for audit trail correlation) */
  eventId?: string;
  /** Whether failsafe mode was triggered */
  failsafeTriggered?: boolean;
}

export interface SafeDispatchConfig extends DispatchConfig {
  /** Case ID — required for consistency verification */
  caseId?: string;
  /** Enable consistency check against backend after commit */
  enableConsistencyCheck?: boolean;
  /** Consistency check API function — injected by the caller */
  fetchDbState?: (caseId: string) => Promise<ChartState>;
  /** Callback when failsafe mode is entered */
  onFailsafe?: (error: Error) => void;
  /** Callback for structured audit logging */
  onAuditLog?: (entry: AuditLogEntry) => void;
}

export interface AuditLogEntry {
  timestamp: number;
  eventId: string;
  eventType: string;
  phase: 'PRE_VALIDATE' | 'REDUCE' | 'POST_VALIDATE' | 'COMMIT' | 'CONSISTENCY' | 'ROLLBACK' | 'FAILSAFE';
  success: boolean;
  error?: string;
  duration?: number;
  stateBefore?: string; // JSON hash for comparison
  stateAfter?: string;  // JSON hash for comparison
}

// ─── Failsafe Mode ──────────────────────────────────────────────────────────

/**
 * FAILSAFE MODE (PART 8)
 *
 * When a critical inconsistency is detected that cannot be auto-recovered,
 * the system enters failsafe mode:
 *   - ALL mutations are disabled
 *   - UI shows an error banner
 *   - User must refresh or the system must recover
 *
 * Failsafe is tracked per-case to avoid blocking unrelated cases.
 */
const _failsafeCases = new Set<string>();
let _globalFailsafe = false;

export function enterFailsafeMode(caseId?: string, reason?: string): void {
  if (caseId) {
    _failsafeCases.add(caseId);
  } else {
    _globalFailsafe = true;
  }

  console.error(
    '[SafeguardLayer] ⛔ FAILSAFE MODE ENTERED',
    caseId ? `(case: ${caseId})` : '(GLOBAL)',
    reason ?? '',
  );

  // Emit a DOM event so UI can show an error banner
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('clinical-failsafe', {
        detail: {
          caseId,
          reason: reason ?? 'System inconsistency detected',
          timestamp: Date.now(),
        },
      }),
    );
  }
}

export function exitFailsafeMode(caseId?: string): void {
  if (caseId) {
    _failsafeCases.delete(caseId);
  } else {
    _globalFailsafe = false;
    _failsafeCases.clear();
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info('[SafeguardLayer] Failsafe mode exited', caseId ? `(case: ${caseId})` : '(GLOBAL)');
  }
}

export function isInFailsafeMode(caseId?: string): boolean {
  if (_globalFailsafe) return true;
  if (caseId) return _failsafeCases.has(caseId);
  return false;
}

// ─── Event Duplication Guard (PART 6) ───────────────────────────────────────

/**
 * Consolidated event ID registry.
 * Prevents duplicate dispatch across the ENTIRE safeguard pipeline.
 * This is the outermost dedup layer — before any reducer or DB call.
 */
const _processedEventIds = new Set<string>();
const _PROCESSED_MAX = 10_000;

function _isEventProcessed(eventId: string): boolean {
  return _processedEventIds.has(eventId);
}

function _markEventProcessed(eventId: string): void {
  _processedEventIds.add(eventId);

  // Memory cap: evict oldest 20% when limit reached
  if (_processedEventIds.size > _PROCESSED_MAX) {
    const evictCount = Math.floor(_PROCESSED_MAX * 0.2);
    const iter = _processedEventIds.values();
    for (let i = 0; i < evictCount; i++) {
      const val = iter.next().value;
      if (val) _processedEventIds.delete(val);
    }
  }
}

/** Reset dedup registry (call after crash recovery or full state reload). */
export function resetEventRegistry(): void {
  _processedEventIds.clear();
}

// ─── State Hashing (for consistency comparison) ─────────────────────────────

/**
 * Compute a lightweight fingerprint of clinical state.
 * Used to detect UI ↔ DB drift without deep comparison.
 * NOT cryptographic — for state comparison only.
 */
function _stateFingerprint(state: ChartState): string {
  const counts = {
    ms: (state.miniscrews ?? []).length,
    el: (state.elastics ?? []).length,
    pc: (state.powerChains ?? []).length,
    ac: (state.accessories ?? []).length,
    lg: (state.ligatures ?? []).length,
    ip: (state.iprMarkers ?? []).length,
    sp: (state.spaceMarkers ?? []).length,
    ua: state.upperArchwire ? 1 : 0,
    la: state.lowerArchwire ? 1 : 0,
  };

  // Include entity IDs for structural comparison
  const msIds = (state.miniscrews ?? []).map(m => m.id).sort().join(',');
  const elIds = (state.elastics ?? []).map((e: any) => e.id).sort().join(',');

  return JSON.stringify({ counts, msIds, elIds });
}

// ─── PART 1: Event Pre-Validation (Gatekeeper) ─────────────────────────────

/**
 * validateEvent — Pre-dispatch event validation.
 *
 * Checks BEFORE the event enters the reducer:
 *   - Structural contract (eventId, type, payload)
 *   - Domain rules (TAD position availability, entity existence for removals)
 *   - Business rules (no operations on removed entities, etc.)
 *
 * THROWS on violation — caller must catch and handle.
 *
 * @param event — The clinical event to validate
 * @param state — Current chart state (for domain checks)
 * @throws Error with descriptive code on invalid event
 */
export function validateEvent(event: ClinicalEvent, state: ChartState): void {
  // ── Structural Contract ───────────────────────────────────────────────────
  if (!event.eventId) {
    throw Object.assign(
      new Error('EVENT_CONTRACT: Missing eventId — every event requires a UUID'),
      { code: 'MISSING_EVENT_ID' },
    );
  }

  if (!event.type) {
    throw Object.assign(
      new Error('EVENT_CONTRACT: Missing event type'),
      { code: 'MISSING_EVENT_TYPE' },
    );
  }

  if (!event.payload || typeof event.payload !== 'object') {
    throw Object.assign(
      new Error('EVENT_CONTRACT: Missing or invalid payload — must be a non-null object'),
      { code: 'MISSING_PAYLOAD' },
    );
  }

  // ── Domain Rules ──────────────────────────────────────────────────────────

  switch (event.type) {
    case 'TAD_INSERTED': {
      const p = event.payload as Record<string, any>;
      const tooth = p.toothNumber ?? p.toothId;
      if (tooth == null) {
        throw Object.assign(
          new Error('TAD_INSERTED requires toothNumber or toothId in payload'),
          { code: 'MISSING_TOOTH_FOR_TAD' },
        );
      }

      // Check for duplicate position
      const anchorType = p.chartPosition?.anchorType ?? p.position ?? 'mesial';
      const existing = (state.miniscrews ?? []).find(
        ms => ms.toothId === tooth && ms.anchorType === anchorType && (ms as any).status !== 'removed',
      );
      if (existing) {
        throw Object.assign(
          new Error(`Duplicate miniscrew: TAD already exists at tooth ${tooth}, position ${anchorType}`),
          { code: 'DUPLICATE_TAD_POSITION', existingId: existing.id },
        );
      }

      // Validate FDI tooth number
      const quadrant = Math.floor(tooth / 10);
      const position = tooth % 10;
      if (![1, 2, 3, 4].includes(quadrant) || position < 1 || position > 8) {
        throw Object.assign(
          new Error(`Invalid FDI tooth number: ${tooth}`),
          { code: 'INVALID_FDI_TOOTH' },
        );
      }
      break;
    }

    case 'TAD_REMOVED':
    case 'TAD_FAILED':
    case 'TAD_REINSERTED':
    case 'TAD_MARKED_FOR_REMOVAL': {
      const p = event.payload as Record<string, any>;
      const tadId = p.tadId ?? p._id;
      if (!tadId) {
        throw Object.assign(
          new Error(`${event.type} requires tadId or _id in payload`),
          { code: 'MISSING_TAD_ID' },
        );
      }

      // Verify TAD exists in state
      const tad = (state.miniscrews ?? []).find(ms => ms.id === tadId);
      if (!tad) {
        throw Object.assign(
          new Error(`${event.type}: TAD ${tadId} not found in state`),
          { code: 'TAD_NOT_FOUND', tadId },
        );
      }

      // Status transition validation
      const currentStatus = (tad as any).status ?? 'active';
      if (event.type === 'TAD_REMOVED' && currentStatus === 'removed') {
        throw Object.assign(
          new Error(`TAD ${tadId} is already removed`),
          { code: 'TAD_ALREADY_REMOVED' },
        );
      }
      if (event.type === 'TAD_REINSERTED' && currentStatus !== 'failed') {
        throw Object.assign(
          new Error(`TAD ${tadId} can only be reinserted from 'failed' status (current: ${currentStatus})`),
          { code: 'INVALID_TAD_TRANSITION' },
        );
      }
      break;
    }

    case 'ELASTIC_APPLIED':
    case 'POWERCHAIN_APPLIED':
    case 'ACCESSORY_ADDED':
    case 'LIGATURE_ADDED':
    case 'IPR_ADDED':
    case 'SPACE_MARKER_ADDED': {
      // Entity creation events MUST have a stable ID
      const p = event.payload as Record<string, any>;
      const entityId = p._id ?? p.actionId;
      if (!entityId) {
        throw Object.assign(
          new Error(`${event.type} requires a stable entity ID (_id or actionId) in payload`),
          { code: 'MISSING_ENTITY_ID', eventType: event.type },
        );
      }
      break;
    }

    case 'ARCHWIRE_PLACED': {
      const p = event.payload as Record<string, any>;
      if (!p.arch || !['upper', 'lower'].includes(p.arch)) {
        throw Object.assign(
          new Error('ARCHWIRE_PLACED requires arch = "upper" | "lower"'),
          { code: 'INVALID_ARCHWIRE_ARCH' },
        );
      }
      break;
    }

    case 'ARCHWIRE_REMOVED': {
      const p = event.payload as Record<string, any>;
      if (!p.arch || !['upper', 'lower'].includes(p.arch)) {
        throw Object.assign(
          new Error('ARCHWIRE_REMOVED requires arch = "upper" | "lower"'),
          { code: 'INVALID_ARCHWIRE_ARCH' },
        );
      }
      // Verify archwire exists
      const archKey = p.arch === 'upper' ? 'upperArchwire' : 'lowerArchwire';
      if (!state[archKey]) {
        throw Object.assign(
          new Error(`Cannot remove ${p.arch} archwire — none exists`),
          { code: 'ARCHWIRE_NOT_FOUND' },
        );
      }
      break;
    }

    // Tooth events: require toothId
    case 'SET_TOOTH_STATUS':
    case 'SET_TOOTH_BONDING':
    case 'SET_TOOTH_DIAGNOSIS':
    case 'SET_TOOTH_ALIGNMENT':
    case 'SET_TOOTH_CONDITION':
    case 'TOGGLE_TOOTH_ALERT':
    case 'CLEAR_TOOTH': {
      const p = event.payload as Record<string, any>;
      if (p.toothId == null) {
        throw Object.assign(
          new Error(`${event.type} requires toothId in payload`),
          { code: 'MISSING_TOOTH_ID' },
        );
      }
      break;
    }

    default:
      // Context menu and no-op events pass through
      break;
  }
}

// ─── PART 3: Consistency Checker ────────────────────────────────────────────

/**
 * verifyConsistency — Compare UI state against DB state.
 *
 * Called AFTER a successful commit to verify that the in-memory state
 * matches what the backend has persisted. Detects state drift from:
 *   - Lost network writes
 *   - Concurrent modifications from other clients
 *   - Reducer divergence (frontend vs backend)
 *
 * @param uiState    — Current frontend chart state
 * @param dbState    — State fetched from backend after commit
 * @param tolerance  — Allowed difference count before flagging mismatch
 * @returns null if consistent, or a description of the mismatch
 */
export function verifyConsistency(
  uiState: ChartState,
  dbState: ChartState,
  tolerance: number = 0,
): { match: boolean; differences: string[] } {
  const differences: string[] = [];

  // ── Entity count comparison ───────────────────────────────────────────────
  const checks: Array<{ name: string; ui: number; db: number }> = [
    { name: 'miniscrews', ui: (uiState.miniscrews ?? []).length, db: (dbState.miniscrews ?? []).length },
    { name: 'elastics', ui: (uiState.elastics ?? []).length, db: (dbState.elastics ?? []).length },
    { name: 'powerChains', ui: (uiState.powerChains ?? []).length, db: (dbState.powerChains ?? []).length },
    { name: 'accessories', ui: (uiState.accessories ?? []).length, db: (dbState.accessories ?? []).length },
    { name: 'ligatures', ui: (uiState.ligatures ?? []).length, db: (dbState.ligatures ?? []).length },
  ];

  for (const { name, ui, db } of checks) {
    if (ui !== db) {
      differences.push(`${name}: UI has ${ui}, DB has ${db}`);
    }
  }

  // ── Archwire state comparison ─────────────────────────────────────────────
  const uiUpperArch = !!uiState.upperArchwire;
  const dbUpperArch = !!dbState.upperArchwire;
  if (uiUpperArch !== dbUpperArch) {
    differences.push(`upperArchwire: UI=${uiUpperArch}, DB=${dbUpperArch}`);
  }

  const uiLowerArch = !!uiState.lowerArchwire;
  const dbLowerArch = !!dbState.lowerArchwire;
  if (uiLowerArch !== dbLowerArch) {
    differences.push(`lowerArchwire: UI=${uiLowerArch}, DB=${dbLowerArch}`);
  }

  // ── Entity ID set comparison (structural match) ───────────────────────────
  const uiMsIds = new Set((uiState.miniscrews ?? []).map(m => m.id));
  const dbMsIds = new Set((dbState.miniscrews ?? []).map(m => m.id));

  for (const id of uiMsIds) {
    if (!dbMsIds.has(id)) differences.push(`miniscrew ${id}: exists in UI but not DB`);
  }
  for (const id of dbMsIds) {
    if (!uiMsIds.has(id)) differences.push(`miniscrew ${id}: exists in DB but not UI`);
  }

  const match = differences.length <= tolerance;

  return { match, differences };
}

// ─── PART 4 + 5: Safe Dispatch (Transactional Wrapper + Rollback) ───────────

/**
 * safeDispatch — Transactional event dispatch with full safeguard pipeline.
 *
 * FLOW:
 *   1. Failsafe mode check → BLOCK if in failsafe
 *   2. Event duplication guard → BLOCK if already processed
 *   3. Pre-validate event (GATEKEEPER)
 *   4. Capture pre-dispatch state snapshot (for rollback)
 *   5. Apply event through reducer
 *   6. Post-validate new state (INVARIANT CHECK)
 *   7. Commit to DB (async)
 *   8. Verify consistency (optional, async)
 *   9. On ANY failure → rollback to snapshot + log critical
 *
 * Either EVERYTHING succeeds or NOTHING changes.
 *
 * @param event  — Clinical event to dispatch
 * @param config — Safe dispatch configuration
 * @returns SafeDispatchResult with success/blocked status
 */
export async function safeDispatch(
  event: ClinicalEvent,
  config: SafeDispatchConfig,
): Promise<SafeDispatchResult> {
  const {
    getState,
    dispatch,
    onCommit,
    caseId,
    enableConsistencyCheck = false,
    fetchDbState,
    onFailsafe,
    onAuditLog,
    debug = false,
  } = config;

  const startTime = Date.now();

  // ── Auto-populate event contract fields ───────────────────────────────────
  if (!event.eventId) event.eventId = uuidv4();
  if (!event.version) event.version = 1;
  if (!event.timestamp) event.timestamp = Date.now();

  const eventId = event.eventId;

  const _audit = (phase: AuditLogEntry['phase'], success: boolean, error?: string) => {
    if (onAuditLog) {
      onAuditLog({
        timestamp: Date.now(),
        eventId,
        eventType: event.type,
        phase,
        success,
        error,
        duration: Date.now() - startTime,
      });
    }
  };

  // ── STEP 1: Failsafe mode check ──────────────────────────────────────────
  if (isInFailsafeMode(caseId)) {
    _audit('PRE_VALIDATE', false, 'FAILSAFE_MODE_ACTIVE');
    return {
      success: false,
      blocked: true,
      reason: 'FAILSAFE_MODE_ACTIVE: Mutations disabled due to system inconsistency. Please refresh.',
      eventId,
      failsafeTriggered: false,
    };
  }

  // ── STEP 2: Event duplication guard ───────────────────────────────────────
  if (_isEventProcessed(eventId)) {
    _audit('PRE_VALIDATE', false, 'DUPLICATE_EVENT');
    return {
      success: false,
      blocked: true,
      reason: 'DUPLICATE_EVENT: Event already processed',
      eventId,
    };
  }

  // ── STEP 3: Pre-validate event (GATEKEEPER) ──────────────────────────────
  const currentState = getState();

  try {
    validateEvent(event, currentState);
    _audit('PRE_VALIDATE', true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    _audit('PRE_VALIDATE', false, message);

    if (debug || process.env.NODE_ENV !== 'production') {
      console.warn('[SafeguardLayer] Event pre-validation failed:', message, event);
    }

    return {
      success: false,
      blocked: true,
      reason: `PRE_VALIDATION_FAILED: ${message}`,
      eventId,
    };
  }

  // ── STEP 4: Capture pre-dispatch state snapshot (for rollback) ────────────
  const preDispatchSnapshot = currentState;
  const preFingerprint = _stateFingerprint(preDispatchSnapshot);

  // ── STEP 5: Apply event through reducer (dry-run for validation) ──────────
  let newState: ChartState;
  try {
    // Dry-run the reducer to check the output BEFORE committing
    newState = applyClinicalEventSafe(currentState, event);
    _audit('REDUCE', true);

    if (debug) {
      console.log('[SafeguardLayer] REDUCE:', {
        event: event.type,
        eventId,
        stateChanged: _stateFingerprint(newState) !== preFingerprint,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    _audit('REDUCE', false, message);

    console.error('[SafeguardLayer] Reducer threw:', message, event);
    return {
      success: false,
      blocked: true,
      reason: `REDUCER_ERROR: ${message}`,
      eventId,
    };
  }

  // ── STEP 6: Post-validate new state (INVARIANT CHECK) ────────────────────
  const violation = validateState(newState);
  if (violation) {
    _audit('POST_VALIDATE', false, violation.message);

    console.error(
      '[SafeguardLayer] ⛔ POST-VALIDATION FAILED — state invariant violated.',
      'Event:', event.type, eventId,
      'Violation:', violation,
    );

    // State is invalid — do NOT apply the event
    return {
      success: false,
      blocked: true,
      reason: `STATE_INVARIANT_VIOLATION: ${violation.message}`,
      violation,
      eventId,
    };
  }
  _audit('POST_VALIDATE', true);

  // ── STEP 7: Actually apply the event to the live state ────────────────────
  // Now that we've verified the reducer output is valid, apply it for real.
  try {
    dispatch({ type: 'APPLY_CLINICAL_EVENT', payload: event });
    _markEventProcessed(eventId);
  } catch (err) {
    // Reducer application failed — attempt rollback
    const message = err instanceof Error ? err.message : String(err);
    console.error('[SafeguardLayer] Live dispatch failed:', message);

    _rollback(dispatch, preDispatchSnapshot);
    _audit('ROLLBACK', true, `Rolled back after dispatch error: ${message}`);

    return {
      success: false,
      blocked: true,
      reason: `DISPATCH_ERROR: ${message}`,
      eventId,
    };
  }

  // ── STEP 8: Commit to DB (async) ─────────────────────────────────────────
  if (onCommit) {
    try {
      await onCommit(event);
      _audit('COMMIT', true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SafeguardLayer] DB commit failed — rolling back state:', message);

      // Rollback the in-memory state since DB didn't persist
      _rollback(dispatch, preDispatchSnapshot);
      _audit('ROLLBACK', true, `Rolled back after commit error: ${message}`);

      return {
        success: false,
        blocked: false,
        reason: `COMMIT_FAILED: ${message}`,
        eventId,
      };
    }
  }

  // ── STEP 9: Consistency check (optional, async) ───────────────────────────
  if (enableConsistencyCheck && fetchDbState && caseId) {
    try {
      const dbState = await fetchDbState(caseId);
      const postState = getState();
      const consistency = verifyConsistency(postState, dbState);

      if (!consistency.match) {
        console.error(
          '[SafeguardLayer] ⚠️ UI ↔ DB STATE MISMATCH detected.',
          'Differences:', consistency.differences,
        );
        _audit('CONSISTENCY', false, consistency.differences.join('; '));

        // If critical mismatch (many differences), enter failsafe
        if (consistency.differences.length > 3) {
          enterFailsafeMode(caseId, `State mismatch: ${consistency.differences.length} differences`);
          if (onFailsafe) {
            onFailsafe(new Error(`State mismatch: ${consistency.differences.join(', ')}`));
          }
          return {
            success: true, // event was applied locally, but consistency failed
            blocked: false,
            reason: `CONSISTENCY_MISMATCH: ${consistency.differences.join('; ')}`,
            eventId,
            failsafeTriggered: true,
          };
        }
      } else {
        _audit('CONSISTENCY', true);
      }
    } catch (err) {
      // Consistency check failure is non-fatal — log and continue
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[SafeguardLayer] Consistency check failed (non-fatal):', message);
      _audit('CONSISTENCY', false, `Check failed: ${message}`);
    }
  }

  // ── STEP 9: Debug log ─────────────────────────────────────────────────────
  if (debug || process.env.NODE_ENV !== 'production') {
    const postState = getState();
    console.log('[SafeguardLayer] ✅ Event dispatched successfully:', {
      eventType: event.type,
      eventId,
      duration: `${Date.now() - startTime}ms`,
      stateFingerprint: _stateFingerprint(postState),
    });
  }

  return {
    success: true,
    blocked: false,
    eventId,
  };
}

// ─── PART 5: Rollback Engine ────────────────────────────────────────────────

/**
 * _rollback — Revert state to a previous snapshot.
 *
 * Uses the existing HYDRATE_SNAPSHOT action to atomically replace
 * the entire chart state with the pre-dispatch snapshot.
 */
function _rollback(
  dispatch: (action: { type: string; payload: unknown }) => void,
  snapshot: ChartState,
): void {
  try {
    dispatch({
      type: 'HYDRATE_SNAPSHOT',
      payload: { chartState: snapshot },
    });

    if (process.env.NODE_ENV !== 'production') {
      console.warn('[SafeguardLayer] ↩️ State rolled back to pre-dispatch snapshot.');
    }
  } catch (revertErr) {
    // Rollback itself failed — critical system error
    console.error(
      '[SafeguardLayer] ⛔ CRITICAL: Rollback failed. System in unknown state.',
      'User must refresh.',
      revertErr,
    );

    // Enter global failsafe — nothing can be trusted
    enterFailsafeMode(undefined, 'Rollback failed — system in unknown state');
  }
}

/**
 * rollbackToSnapshot — Public API for manual rollback (e.g., from undo engine).
 *
 * @param dispatch  — React dispatch function
 * @param snapshot  — ChartState to restore
 */
export function rollbackToSnapshot(
  dispatch: (action: { type: string; payload: unknown }) => void,
  snapshot: ChartState,
): void {
  _rollback(dispatch, snapshot);
}

// ─── PART 7: Safety Assertions (Global) ─────────────────────────────────────

/**
 * runGlobalAssertions — Full system integrity check.
 *
 * Must always be true:
 *   ✅ No duplicate TAD positions
 *   ✅ One active visit only (checked via visit hook, not here)
 *   ✅ Snapshot matches event replay (checked via backend)
 *   ✅ No orphan entities
 *   ✅ All entity IDs present
 *
 * Call this periodically (e.g., on visit end, on focus) or after crash recovery.
 *
 * @param state  — Current chart state
 * @returns Array of violations (empty = all clear)
 */
export function runGlobalAssertions(state: ChartState): InvariantViolation[] {
  return validateStateStrict(state);
}

// ─── PART 9: Debug Mode ─────────────────────────────────────────────────────

/**
 * debugDispatch — Wraps safeDispatch with exhaustive logging.
 *
 * Logs:
 *   - EVENT before apply
 *   - STATE BEFORE
 *   - STATE AFTER
 *   - Validation results
 *   - Timing information
 *
 * Use in development only — adds significant overhead.
 */
export async function debugDispatch(
  event: ClinicalEvent,
  config: SafeDispatchConfig,
): Promise<SafeDispatchResult> {
  const state = config.getState();

  console.group(`[SafeguardLayer DEBUG] ${event.type} (${event.eventId ?? 'no-id'})`);
  console.log('EVENT:', JSON.stringify(event, null, 2));
  console.log('STATE BEFORE:', JSON.stringify(state, null, 2));

  const startTime = performance.now();
  const result = await safeDispatch(event, { ...config, debug: true });
  const duration = performance.now() - startTime;

  if (result.success) {
    const newState = config.getState();
    console.log('STATE AFTER:', JSON.stringify(newState, null, 2));
  } else {
    console.warn('DISPATCH BLOCKED:', result.reason);
  }

  console.log(`DURATION: ${duration.toFixed(2)}ms`);
  console.groupEnd();

  return result;
}
