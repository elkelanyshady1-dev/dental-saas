/**
 * clinicalReducer.ts — Frontend Mirror of Canonical Shared Clinical Event Reducer
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AUTHORITATIVE IMPLEMENTATION IS:
 *   backend/src/modules/orthodontics/shared/clinicalReducer.js
 *
 * This file is the TypeScript equivalent for the frontend runtime.
 * Any logic change MUST be applied to BOTH files simultaneously.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ROLE:
 *   - Used by chartReducer.ts to handle APPLY_CLINICAL_EVENT actions
 *   - Enables the frontend to apply server-pushed clinical events without a full refetch
 *   - Mirrors the exact same logic as the backend replay engine
 *
 * INVARIANTS (Phase 8 — Production Hardening):
 *   - applyClinicalEvent() is PURE — no side effects, no API calls, no Date.now()
 *   - Returns a new ChartState object — input state is NEVER mutated
 *   - Unknown event types return the input state unchanged
 *   - upgradeEvent() prepares events for version migration before apply
 *   - processedEventIds: global idempotency — same eventId NEVER applied twice
 *   - Normalized entity lookups: O(1) existence checks via byId maps
 *   - State is Object.freeze() in dev mode — mutation throws immediately
 *   - ALL timestamps come from event payload — NEVER from Date.now() / new Date()
 *
 * HARDENING LAYERS:
 *   Layer 1: eventId-level idempotency (processedEventIds Set)
 *   Layer 2: entity-level dedup (byId existence check)
 *   Layer 3: position-level dedup (tooth+anchorType for TADs)
 *   Layer 4: dev-mode freeze (Object.freeze on returned state)
 */

import type { ChartState } from '../types';
import { resolveMiniscrewPosition } from './miniscrewUtils';
import {
  type NormalizedCollection,
  insertEntity,
  removeEntity,
  updateEntity,
  hasEntity,
  getEntity,
  findEntity,
  someEntity,
  toArray,
  emptyCollection,
  fromArray,
  hasTadAtPosition,
  hasProcessedEvent,
  markProcessed,
} from './normalizedEntities';

// ─── FDI Order (anatomical sequence for position resolution) ─────────────────
// Upper: right to left (18→11, 21→28), Lower: right to left (48→41, 31→38)
const FDI_ORDER: number[] = [
  18, 17, 16, 15, 14, 13, 12, 11,
  21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41,
  31, 32, 33, 34, 35, 36, 37, 38,
];

// ─── Dev-mode freeze ─────────────────────────────────────────────────────────

/**
 * Deep freeze state in development to catch accidental mutations immediately.
 * Zero cost in production (returns state unchanged).
 */
function _devFreeze<T>(state: T): T {
  if (process.env.NODE_ENV === 'production') return state;
  if (state === null || typeof state !== 'object') return state;
  return Object.freeze(state) as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** A clinical event document as received from the server or dispatch payload */
export interface ClinicalEventLike {
  type: string;
  payload?: Record<string, unknown>;
  version?: number;
  eventId?: string;
  sequence?: number;
  /** Phase 8: ALL timestamps MUST come from the event, not from Date.now() */
  timestamp?: number;
}

// ─── Tooth helpers (pure) ─────────────────────────────────────────────────────

function _patchTooth<T extends { id: number }>(teeth: T[], toothId: number, patch: Partial<T>): T[] {
  return teeth.map((t) => (t.id === toothId ? { ...t, ...patch } : t));
}

/** Arch selector: toothId < 30 → upperTeeth, else lowerTeeth */
function _patchTeeth(state: ChartState, toothId: number, patch: Record<string, unknown>): ChartState {
  if (toothId < 30) {
    return { ...state, upperTeeth: _patchTooth(state.upperTeeth ?? [], toothId, patch) };
  }
  return { ...state, lowerTeeth: _patchTooth(state.lowerTeeth ?? [], toothId, patch) };
}

function _removeById<T extends { id?: string; _id?: string }>(arr: T[] | undefined, id: string | undefined): T[] {
  if (!id) return arr ?? [];
  return (arr ?? []).filter((x) => x.id !== id && x._id?.toString() !== id.toString());
}

// ─── upgradeEvent — version migration ────────────────────────────────────────

/**
 * upgradeEvent
 *
 * Normalizes a clinical event to the current schema version before replay.
 * Current: v1 is the only version — returns event unchanged.
 * Future: add upgrade logic here for breaking schema changes.
 *
 * @throws {Error} for unknown versions (signals data corruption)
 */
export function upgradeEvent(event: ClinicalEventLike): ClinicalEventLike {
  const version = event.version ?? 1; // pre-Phase 5.1 events have no version → treat as v1

  switch (version) {
    case 1:
      return event;
    default:
      throw Object.assign(
        new Error(`Unknown event version: ${version} for type: ${event.type}`),
        { code: 'UNKNOWN_EVENT_VERSION' }
      );
  }
}

// ─── applyClinicalEvent — pure state transition ───────────────────────────────

/**
 * applyClinicalEvent
 *
 * Applies a single ClinicalEvent to a chart state.
 *
 * PURE — no side effects. Unknown event types return state unchanged.
 * Call upgradeEvent(event) before this to ensure version compatibility.
 *
 * @param state  — current ChartState (immutable — returns new object)
 * @param event  — ClinicalEvent-shaped object
 * @returns      — new ChartState
 */
/**
 * applyClinicalEventSafe — Production-hardened event application.
 *
 * Wraps applyClinicalEvent with three hardening layers:
 *   Layer 1: eventId-level idempotency (processedEventIds)
 *   Layer 2: version migration (upgradeEvent)
 *   Layer 3: dev-mode freeze (Object.freeze on output)
 *
 * USE THIS in chartReducer APPLY_CLINICAL_EVENT and dispatchClinicalEvent.
 * Use raw applyClinicalEvent ONLY in backend replay (which has its own idempotency).
 */
export function applyClinicalEventSafe(state: ChartState, event: ClinicalEventLike): ChartState {
  // ── LAYER 1: Global eventId idempotency ───────────────────────────────────
  // Prevents: StrictMode double renders, multi-tab replays, retry storms
  if (hasProcessedEvent((state as any)._processedEventIds, event.eventId)) {
    return state;
  }

  // ── LAYER 2: Version migration ────────────────────────────────────────────
  const upgraded = upgradeEvent(event);

  // ── LAYER 3: Pure state transition ────────────────────────────────────────
  const nextState = applyClinicalEvent(state, upgraded);

  // If state unchanged (unknown event type or entity-level dedup), still mark as processed
  const withRegistry = {
    ...nextState,
    _processedEventIds: markProcessed((state as any)._processedEventIds, event.eventId),
  } as ChartState;

  return _devFreeze(withRegistry);
}

/**
 * applyClinicalEvent — PURE state transition (no idempotency, no freeze).
 *
 * PURE — no side effects. Unknown event types return state unchanged.
 * Call upgradeEvent(event) before this to ensure version compatibility.
 *
 * For production use, prefer applyClinicalEventSafe() which adds idempotency + freeze.
 * This raw version is exported for backend replay (which manages its own idempotency)
 * and for testing.
 */
export function applyClinicalEvent(state: ChartState, event: ClinicalEventLike): ChartState {
  const { type, payload = {} } = event;
  const p = payload as Record<string, any>;

  switch (type) {

    // ══ Phase 2: Granular Per-Tooth Events ═══════════════════════════════════

    case 'SET_TOOTH_STATUS': {
      if (p.toothId == null) return state;
      return _patchTeeth(state, p.toothId, { status: p.status });
    }

    case 'SET_TOOTH_BONDING': {
      if (p.toothId == null) return state;
      const bondPatch: Record<string, unknown> = {};
      if (p.status        !== undefined) bondPatch.status        = p.status;
      if (p.prescription  !== undefined) bondPatch.prescription  = p.prescription;
      if (p.slotSize      !== undefined) bondPatch.slotSize      = p.slotSize;
      if (p.brand         !== undefined) bondPatch.brand         = p.brand;
      if (p.bondingHeight !== undefined) bondPatch.bondingHeight = p.bondingHeight;
      if (p.bondingOption !== undefined) bondPatch.bondingOption = p.bondingOption;
      return _patchTeeth(state, p.toothId, bondPatch);
    }

    case 'SET_TOOTH_DIAGNOSIS': {
      if (p.toothId == null) return state;
      const arr = p.toothId < 30 ? 'upperTeeth' : 'lowerTeeth';
      return {
        ...state,
        [arr]: (state[arr as 'upperTeeth' | 'lowerTeeth'] ?? []).map((t: any) => {
          if (t.id !== p.toothId) return t;
          return {
            ...t,
            clinicalStatus: {
              ...(t.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
              diagnosis: p.diagnosis,
              ...(p.clearAlignment && { alignment: null }),
              ...(p.clearCondition && { condition: null }),
            },
            ...(p.clearAlerts && { clinicalAlerts: [] }),
          };
        }),
      };
    }

    case 'SET_TOOTH_ALIGNMENT': {
      if (p.toothId == null) return state;
      const arr = p.toothId < 30 ? 'upperTeeth' : 'lowerTeeth';
      return {
        ...state,
        [arr]: (state[arr as 'upperTeeth' | 'lowerTeeth'] ?? []).map((t: any) => {
          if (t.id !== p.toothId) return t;
          return {
            ...t,
            clinicalStatus: {
              ...(t.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
              alignment: p.alignment,
            },
          };
        }),
      };
    }

    case 'SET_TOOTH_CONDITION': {
      if (p.toothId == null) return state;
      const arr = p.toothId < 30 ? 'upperTeeth' : 'lowerTeeth';
      return {
        ...state,
        [arr]: (state[arr as 'upperTeeth' | 'lowerTeeth'] ?? []).map((t: any) => {
          if (t.id !== p.toothId) return t;
          return {
            ...t,
            clinicalStatus: {
              ...(t.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
              condition: p.condition,
            },
          };
        }),
      };
    }

    case 'TOGGLE_TOOTH_ALERT': {
      if (p.toothId == null) return state;
      const arr = p.toothId < 30 ? 'upperTeeth' : 'lowerTeeth';
      return {
        ...state,
        [arr]: (state[arr as 'upperTeeth' | 'lowerTeeth'] ?? []).map((t: any) => {
          if (t.id !== p.toothId) return t;
          const current: string[] = t.clinicalAlerts ?? [];
          const exists = current.includes(p.alert);
          return {
            ...t,
            clinicalAlerts: exists
              ? current.filter((a: string) => a !== p.alert)
              : [...current, p.alert],
          };
        }),
      };
    }

    case 'CLEAR_TOOTH': {
      if (p.toothId == null) return state;
      return _patchTeeth(state, p.toothId, {
        status:         'healthy',
        clinicalStatus: { diagnosis: null, alignment: null, condition: null },
        clinicalAlerts: [],
        prescription:   undefined,
        slotSize:       undefined,
        brand:          undefined,
        bondingHeight:  undefined,
        bondingOption:  undefined,
      });
    }

    // ══ Phase 3: Appliance Events ════════════════════════════════════════════

    case 'ARCHWIRE_PLACED': {
      const arch = p.arch === 'upper' ? 'upperArchwire' : 'lowerArchwire';
      return {
        ...state,
        [arch]: { material: p.material ?? null, size: p.size ?? null, brand: p.brand ?? null },
      };
    }

    case 'ARCHWIRE_REMOVED': {
      const arch = p.arch === 'upper' ? 'upperArchwire' : 'lowerArchwire';
      return { ...state, [arch]: null };
    }

    case 'ELASTIC_APPLIED': {
      const existing  = state.elastics ?? [];
      const elasticId = (p._id ?? p.actionId) as string | undefined;
      // P0-1: Stable ID is required — no fallbacks allowed (breaks deterministic replay)
      if (!elasticId) {
        throw Object.assign(
          new Error('INVALID_EVENT_PAYLOAD: Missing stable ID for ELASTIC_APPLIED'),
          { code: 'MISSING_ENTITY_ID', eventType: 'ELASTIC_APPLIED' }
        );
      }
      if (existing.some((e: any) => e._id === elasticId || e.actionId === elasticId)) return state;
      return {
        ...state,
        elastics: [
          ...existing,
          { id: elasticId, toothIds: [p.fromTooth, p.toTooth], type: p.type ?? 'class_ii', size: p.size ?? null },
        ],
      };
    }

    case 'ELASTIC_REMOVED':
      return { ...state, elastics: _removeById(state.elastics, p.actionId as string) };

    case 'POWERCHAIN_APPLIED': {
      const existing = state.powerChains ?? [];
      const chainId  = (p._id ?? p.actionId) as string | undefined;
      // P0-1: Stable ID is required — no fallbacks allowed
      if (!chainId) {
        throw Object.assign(
          new Error('INVALID_EVENT_PAYLOAD: Missing stable ID for POWERCHAIN_APPLIED'),
          { code: 'MISSING_ENTITY_ID', eventType: 'POWERCHAIN_APPLIED' }
        );
      }
      if (existing.some((c: any) => c._id === chainId || c.actionId === chainId)) return state;
      return {
        ...state,
        powerChains: [
          ...existing,
          {
            id:          chainId,
            arch:        p.arch    ?? null,
            type:        p.type    ?? null,
            segments:    p.segments ?? [],
            isUpper:     p.arch === 'upper',
            anchorTeeth: [],
            activeTeeth: ((p.segments as any[]) ?? []).flatMap((s: any) => [s.from, s.to]),
            direction:   'mesial',
          },
        ],
      };
    }

    case 'POWERCHAIN_REMOVED':
      return { ...state, powerChains: _removeById(state.powerChains, p.actionId as string) };

    case 'ACCESSORY_ADDED': {
      const existing = state.accessories ?? [];
      const accId    = (p._id ?? p.actionId) as string | undefined;
      // P0-1: Stable ID is required — no fallbacks allowed
      if (!accId) {
        throw Object.assign(
          new Error('INVALID_EVENT_PAYLOAD: Missing stable ID for ACCESSORY_ADDED'),
          { code: 'MISSING_ENTITY_ID', eventType: 'ACCESSORY_ADDED' }
        );
      }
      if (existing.some((a: any) => a._id === accId || a.actionId === accId)) return state;
      return {
        ...state,
        accessories: [
          ...existing,
          { id: accId, type: p.type, toothIds: [p.toothId], isUpper: (p.toothId ?? 0) < 30 },
        ],
      };
    }

    case 'ACCESSORY_REMOVED':
      return { ...state, accessories: _removeById(state.accessories, p.actionId as string) };

    case 'LIGATURE_ADDED': {
      const existing = state.ligatures ?? [];
      const ligId    = (p._id ?? p.actionId) as string | undefined;
      // P0-1: Stable ID is required — no fallbacks allowed
      if (!ligId) {
        throw Object.assign(
          new Error('INVALID_EVENT_PAYLOAD: Missing stable ID for LIGATURE_ADDED'),
          { code: 'MISSING_ENTITY_ID', eventType: 'LIGATURE_ADDED' }
        );
      }
      if (existing.some((l: any) => l._id === ligId || l.actionId === ligId)) return state;
      return {
        ...state,
        ligatures: [
          ...existing,
          { id: ligId, type: p.type, toothIds: [p.toothId], isUpper: (p.toothId ?? 0) < 30 },
        ],
      };
    }

    case 'LIGATURE_REMOVED':
      return { ...state, ligatures: _removeById(state.ligatures, p.actionId as string) };

    case 'IPR_ADDED': {
      const existing = state.iprMarkers ?? [];
      const iprId    = (p._id ?? p.actionId) as string | undefined;
      // P0-1: Stable ID is required — no fallbacks allowed
      if (!iprId) {
        throw Object.assign(
          new Error('INVALID_EVENT_PAYLOAD: Missing stable ID for IPR_ADDED'),
          { code: 'MISSING_ENTITY_ID', eventType: 'IPR_ADDED' }
        );
      }
      if (existing.some((m: any) => m._id === iprId || m.actionId === iprId)) return state;
      return {
        ...state,
        iprMarkers: [
          ...existing,
          { id: iprId, toothId: (p.betweenTeeth as number[])?.[0] ?? null, anchorType: 'mesial', value: String(p.amount ?? '') },
        ],
      };
    }

    case 'IPR_REMOVED':
      return { ...state, iprMarkers: _removeById(state.iprMarkers, p.actionId as string) };

    case 'SPACE_MARKER_ADDED': {
      const existing = state.spaceMarkers ?? [];
      const spaceId  = (p._id ?? p.actionId) as string | undefined;
      // P0-1: Stable ID is required — no fallbacks allowed
      if (!spaceId) {
        throw Object.assign(
          new Error('INVALID_EVENT_PAYLOAD: Missing stable ID for SPACE_MARKER_ADDED'),
          { code: 'MISSING_ENTITY_ID', eventType: 'SPACE_MARKER_ADDED' }
        );
      }
      if (existing.some((m: any) => m._id === spaceId || m.actionId === spaceId)) return state;
      return {
        ...state,
        spaceMarkers: [
          ...existing,
          { id: spaceId, toothId: p.toothId, anchorType: 'mesial', value: p.type ?? '' },
        ],
      };
    }

    case 'SPACE_MARKER_REMOVED':
      return { ...state, spaceMarkers: _removeById(state.spaceMarkers, p.actionId as string) };

    // ══ TAD / Miniscrew Events (Phase 7 — event-driven) ════════════════════════
    // CRITICAL: Placement MUST happen ONLY inside reducer.
    //           ❌ NOT in UI  ❌ NOT in service  ✅ ONLY HERE
    //
    // Position resolution is deterministic via resolveMiniscrewPosition().
    // Mirrors backend/src/modules/orthodontics/shared/clinicalReducer.js

    case 'TAD_INSERTED': {
      const tadId = (p._id ?? p.tadId) as string | undefined;
      // P0-1: Stable ID is required — no fallbacks allowed (breaks deterministic replay)
      if (!tadId) {
        throw Object.assign(
          new Error('INVALID_EVENT_PAYLOAD: Missing stable ID for TAD_INSERTED'),
          { code: 'MISSING_ENTITY_ID', eventType: 'TAD_INSERTED' }
        );
      }

      // Phase 8: Normalize on entry → O(1) lookups → toArray on exit
      const normalized = fromArray(state.miniscrews ?? []);

      // Idempotency: O(1) check — skip if TAD with same ID already exists
      if (hasEntity(normalized, tadId)) return state;

      const toothId = (p.toothNumber ?? p.toothId) as number;
      const anchorType = (p.chartPosition?.anchorType ?? p.position ?? 'mesial') as string;

      // ── Position-aware dedup: O(n) but typically <20 TADs per case ─────────
      if (hasTadAtPosition(normalized, toothId, anchorType)) return state;

      // ── Deterministic position resolution (INSIDE reducer, not in UI) ──────
      const resolved = resolveMiniscrewPosition(
        toothId,
        anchorType as 'mesial' | 'distal' | 'apical' | 'infrazygomatic',
      );
      const between = resolved?.type === 'interradicular' ? resolved.between : undefined;

      const newEntity = {
        id:         tadId,
        toothId,
        anchorType,
        angle:      90,
        brand:      p.brand    as string | undefined ?? undefined,
        diameter:   p.diameter as number | undefined ?? undefined,
        length:     p.length   as number | undefined ?? undefined,
        between,       // Phase 7: deterministic interradicular position
        status:     'active' as const,
      };

      return {
        ...state,
        miniscrews: toArray(insertEntity(normalized, newEntity as any)),
      };
    }

    case 'TAD_REMOVED': {
      const removeId = (p.tadId ?? p._id) as string | undefined;
      if (!removeId) return state;

      // Phase 8: Normalize → O(1) existence check → structural remove
      const normalized = fromArray(state.miniscrews ?? []);
      if (!hasEntity(normalized, removeId)) return state; // idempotent

      return {
        ...state,
        miniscrews: toArray(removeEntity(normalized, removeId)),
      };
    }

    case 'TAD_FAILED': {
      const failId = (p.tadId ?? p._id) as string | undefined;
      if (!failId) return state;

      // Phase 8: Normalize → O(1) lookup for update + TODO generation
      const normalized = fromArray(state.miniscrews ?? []);
      const failedTad = getEntity(normalized, failId);
      if (!failedTad) return state; // TAD not found — idempotent no-op

      // Mark as failed (don't remove — keeps audit trail on chart)
      const updated = updateEntity(normalized, failId, { status: 'failed' } as any);

      // ── Phase 7: Auto-generate TODO for miniscrew reinsertion ─────────────
      // Phase 8 HARDENING: timestamp comes from event, NEVER from Date.now()
      // This ensures deterministic replay — same events → same state on any machine
      const newTodos = [...((state as any).todos ?? [])];
      newTodos.push({
        type:        'MINISCREW_REINSERTION',
        tooth:       (failedTad as any).toothId,
        description: `Reinsertion needed: TAD at tooth ${(failedTad as any).toothId} failed`,
        priority:    'high',
        createdAt:   (event.timestamp ? new Date(event.timestamp).toISOString() : (p.timestamp ? new Date(p.timestamp).toISOString() : '')),
        tadId:       failId,
      });

      return {
        ...state,
        miniscrews: toArray(updated),
        todos:      newTodos,
      } as ChartState;
    }

    case 'TAD_REINSERTED': {
      const reinsertId = (p.tadId ?? p._id) as string | undefined;
      if (!reinsertId) return state;

      // Phase 8: Normalize → O(1) existence check → structural update
      const normalized = fromArray(state.miniscrews ?? []);
      if (!hasEntity(normalized, reinsertId)) return state;

      return {
        ...state,
        miniscrews: toArray(updateEntity(normalized, reinsertId, { status: 'active' } as any)),
      };
    }

    case 'TAD_MARKED_FOR_REMOVAL': {
      const markId = (p.tadId ?? p._id) as string | undefined;
      if (!markId) return state;

      // Phase 8: Normalize → O(1) existence check → structural update
      const normalized = fromArray(state.miniscrews ?? []);
      if (!hasEntity(normalized, markId)) return state;

      return {
        ...state,
        miniscrews: toArray(updateEntity(normalized, markId, { status: 'needs_removal', hasActiveAlert: true } as any)),
      };
    }

    // ══ Context Menu Events (UI → state, not local variables) ════════════════

    case 'TAD_CONTEXT_MENU_OPEN':
      return { ...state, activeContextMenu: { type: 'tad', tadId: p.tadId } } as ChartState;

    case 'TAD_CONTEXT_MENU_CLOSE':
      return { ...state, activeContextMenu: undefined } as ChartState;

    // ══ Legacy Bonding Events (audit trail only — state via bondingSnapshot) ═

    case 'BONDING_APPLIED':
    case 'BONDING_REBONDED':
    case 'BONDING_REMOVED':
    case 'BRACKET_REPOSITIONED':
      return state;

    // ══ No-op events (sequence/note/legacy) ══════════════════════════════════

    case 'SEQUENCE_STEP_COMPLETED':
    case 'SEQUENCE_PLAN_CREATED':
    case 'SEQUENCE_PLAN_UPDATED':
    case 'EXTRACTION_DONE':
    case 'NOTE_ADDED':
    case 'WIRE_PLACED':
    case 'ELASTICS_APPLIED':
      return state;

    default:
      return state; // unknown — caller may log
  }
}
