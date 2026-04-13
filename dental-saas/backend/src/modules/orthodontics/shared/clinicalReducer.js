/**
 * clinicalReducer.js — Canonical Shared Clinical Event Reducer
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ROLE: Single source of truth for clinical event → state transitions.
 *
 * THIS IS THE AUTHORITATIVE IMPLEMENTATION.
 * The frontend mirrors this in:
 *   frontend/src/org/modules/patients/components/orthodontic-chart/utils/clinicalReducer.ts
 *
 * Any logic change MUST be applied to BOTH files simultaneously.
 * They are kept in sync by convention — there is no automated sync mechanism.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * INVARIANTS (Phase 8 — Production Hardening):
 *   - applyClinicalEvent() is PURE — no DB calls, no logging, no side-effects, no Date.now()
 *   - Returns a new state object — input state is NEVER mutated
 *   - Unknown event types return the input state unchanged (idempotent skip)
 *   - upgradeEvent() prepares events for version migration before apply
 *   - ALL timestamps come from event.timestamp or payload.timestamp — NEVER from Date.now()
 *   - Entity-level dedup: byId existence check prevents structural duplication
 *   - Position-level dedup: tooth+anchorType check for TADs
 *
 * EVENT VERSION HISTORY:
 *   v1 (Phase 2–5):  Base granular events — SET_TOOTH_*, ARCHWIRE_*, ELASTIC_*, etc.
 *   (future):        Any structural changes bump the version number
 *
 * TOOTH ID CONVENTIONS (FDI notation):
 *   Upper quadrants: 11–18 (UR), 21–28 (UL) → toothId < 30
 *   Lower quadrants: 31–38 (LL), 41–48 (LR) → toothId >= 30
 *   Arch discriminator: toothId < 30 → upperTeeth, else lowerTeeth
 *
 * @pure
 * @per-org-safe — no DB access, safe to call from any context
 */

"use strict";

// ─── FDI Order (anatomical sequence for position resolution) ─────────────────
const FDI_ORDER = [
  18, 17, 16, 15, 14, 13, 12, 11,
  21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41,
  31, 32, 33, 34, 35, 36, 37, 38,
];

/**
 * resolveMiniscrewPosition — deterministic interradicular position resolver.
 * PURE — no DB calls, no side effects.
 *
 * Clinical anatomy rules (FDI notation):
 *   Mesial  = toward midline (position digit decreases within quadrant)
 *   Distal  = away from midline (position digit increases within quadrant)
 *   Cross-midline: 11↔21 (upper), 31↔41 (lower)
 *
 * @param {number} tooth      — FDI tooth number
 * @param {string} anchorType — 'mesial' | 'distal' | 'apical' | 'infrazygomatic'
 * @returns {{ type: string, between?: [number, number], tooth?: number } | null}
 */
function _resolveMiniscrewPosition(tooth, anchorType) {
  if (anchorType === 'infrazygomatic') return { type: 'infrazygomatic', tooth };
  if (anchorType === 'apical')         return { type: 'apical', tooth };

  const quadrant = Math.floor(tooth / 10);
  const position = tooth % 10;

  if (anchorType === 'mesial') {
    if (position === 1) {
      const crossTooth = { 1: 21, 2: 11, 3: 41, 4: 31 };
      const neighbor = crossTooth[quadrant];
      if (!neighbor) return null;
      return { type: 'interradicular', between: [tooth, neighbor] };
    }
    const mesialNeighbor = tooth - 1;
    if (mesialNeighbor % 10 < 1) return null;
    return { type: 'interradicular', between: [tooth, mesialNeighbor] };
  }

  if (anchorType === 'distal') {
    if (position >= 8) return null;
    const distalNeighbor = tooth + 1;
    if (distalNeighbor % 10 > 8) return null;
    return { type: 'interradicular', between: [tooth, distalNeighbor] };
  }

  return null;
}

// ─── Tooth helpers (pure) ─────────────────────────────────────────────────────

/** Patch a single tooth by toothId in an array. Returns new array. */
function _patchTooth(teeth, toothId, patch) {
  return teeth.map((t) => (t.id === toothId ? { ...t, ...patch } : t));
}

/**
 * Arch selector: toothId < 30 → upperTeeth, else lowerTeeth.
 * Applies patch to matching tooth and returns new state.
 */
function _patchTeeth(state, toothId, patch) {
  if (toothId < 30) {
    return { ...state, upperTeeth: _patchTooth(state.upperTeeth ?? [], toothId, patch) };
  }
  return { ...state, lowerTeeth: _patchTooth(state.lowerTeeth ?? [], toothId, patch) };
}

/** Remove item by .id or ._id from an array. Returns new array. */
function _removeById(arr, id) {
  return (arr ?? []).filter((x) => x.id !== id && x._id?.toString() !== id?.toString());
}

// ─── upgradeEvent — version migration ────────────────────────────────────────

/**
 * upgradeEvent
 *
 * Normalizes an event document to the current event schema before replay.
 * Handles version migration for events persisted before schema changes.
 *
 * CURRENT: v1 is the only version — returns event unchanged.
 * FUTURE:  Add upgrade logic here when schema breaking changes occur.
 *
 * @param {Object} event — raw ClinicalEvent document
 * @returns {Object}     — event normalized to current version
 * @throws {Error}       — for unknown versions (signals data corruption)
 */
function upgradeEvent(event) {
  const version = event.version ?? 1; // pre-Phase 5.1 events have no version field → treat as v1

  switch (version) {
    case 1:
      return event; // current version — no transformation needed
    default:
      throw Object.assign(
        new Error(`Unknown event version: ${version} for type: ${event.type}`),
        { code: 'UNKNOWN_EVENT_VERSION', eventId: event.eventId, eventType: event.type }
      );
  }
}

// ─── applyClinicalEvent — pure state transition ────────────────────────────────

/**
 * applyClinicalEvent
 *
 * Applies a single ClinicalEvent to a chart state.
 *
 * PURE — no side effects, no logging, no DB calls.
 * Input state is NEVER mutated. Returns a new state object.
 * Unknown event types return the input state unchanged.
 *
 * Call upgradeEvent(event) before this to ensure version compatibility.
 *
 * @param {Object} state  — current chart state (immutable)
 * @param {Object} event  — { type: string, payload?: Object, timestamp?: number, eventId?: string, version?: number }
 * @returns {Object}      — new chart state
 */
function applyClinicalEvent(state, event) {
  const { type, payload = {} } = event;

  switch (type) {

    // ══ Phase 2: Granular Per-Tooth Events ═══════════════════════════════════

    case 'SET_TOOTH_STATUS': {
      if (payload.toothId == null) return state;
      return _patchTeeth(state, payload.toothId, { status: payload.status });
    }

    case 'SET_TOOTH_BONDING': {
      if (payload.toothId == null) return state;
      const bondPatch = {};
      if (payload.status        !== undefined) bondPatch.status        = payload.status;
      if (payload.prescription  !== undefined) bondPatch.prescription  = payload.prescription;
      if (payload.slotSize      !== undefined) bondPatch.slotSize      = payload.slotSize;
      if (payload.brand         !== undefined) bondPatch.brand         = payload.brand;
      if (payload.bondingHeight !== undefined) bondPatch.bondingHeight = payload.bondingHeight;
      if (payload.bondingOption !== undefined) bondPatch.bondingOption = payload.bondingOption;
      return _patchTeeth(state, payload.toothId, bondPatch);
    }

    case 'SET_TOOTH_DIAGNOSIS': {
      if (payload.toothId == null) return state;
      const arr = payload.toothId < 30 ? 'upperTeeth' : 'lowerTeeth';
      return {
        ...state,
        [arr]: (state[arr] ?? []).map((t) => {
          if (t.id !== payload.toothId) return t;
          return {
            ...t,
            clinicalStatus: {
              ...(t.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
              diagnosis: payload.diagnosis,
              ...(payload.clearAlignment && { alignment: null }),
              ...(payload.clearCondition && { condition: null }),
            },
            ...(payload.clearAlerts && { clinicalAlerts: [] }),
          };
        }),
      };
    }

    case 'SET_TOOTH_ALIGNMENT': {
      if (payload.toothId == null) return state;
      const arr = payload.toothId < 30 ? 'upperTeeth' : 'lowerTeeth';
      return {
        ...state,
        [arr]: (state[arr] ?? []).map((t) => {
          if (t.id !== payload.toothId) return t;
          return {
            ...t,
            clinicalStatus: {
              ...(t.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
              alignment: payload.alignment,
            },
          };
        }),
      };
    }

    case 'SET_TOOTH_CONDITION': {
      if (payload.toothId == null) return state;
      const arr = payload.toothId < 30 ? 'upperTeeth' : 'lowerTeeth';
      return {
        ...state,
        [arr]: (state[arr] ?? []).map((t) => {
          if (t.id !== payload.toothId) return t;
          return {
            ...t,
            clinicalStatus: {
              ...(t.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
              condition: payload.condition,
            },
          };
        }),
      };
    }

    case 'TOGGLE_TOOTH_ALERT': {
      if (payload.toothId == null) return state;
      const arr = payload.toothId < 30 ? 'upperTeeth' : 'lowerTeeth';
      return {
        ...state,
        [arr]: (state[arr] ?? []).map((t) => {
          if (t.id !== payload.toothId) return t;
          const current = t.clinicalAlerts ?? [];
          const exists  = current.includes(payload.alert);
          return {
            ...t,
            clinicalAlerts: exists
              ? current.filter((a) => a !== payload.alert)
              : [...current, payload.alert],
          };
        }),
      };
    }

    case 'CLEAR_TOOTH': {
      if (payload.toothId == null) return state;
      return _patchTeeth(state, payload.toothId, {
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
      const arch = payload.arch === 'upper' ? 'upperArchwire' : 'lowerArchwire';
      return {
        ...state,
        [arch]: {
          material: payload.material ?? null,
          size:     payload.size     ?? null,
          brand:    payload.brand    ?? null,
        },
      };
    }

    case 'ARCHWIRE_REMOVED': {
      const arch = payload.arch === 'upper' ? 'upperArchwire' : 'lowerArchwire';
      return { ...state, [arch]: null };
    }

    case 'ELASTIC_APPLIED': {
      const existing  = state.elastics ?? [];
      const elasticId = payload._id ?? payload.actionId ?? null;
      // P0-1: Stable ID is required — no fallbacks allowed (breaks deterministic replay)
      if (!elasticId) {
        throw Object.assign(
          new Error("INVALID_EVENT_PAYLOAD: Missing stable ID for ELASTIC_APPLIED"),
          { code: 'MISSING_ENTITY_ID', eventType: 'ELASTIC_APPLIED' }
        );
      }
      // Payload-level idempotency check (catches in-memory duplicates without eventId)
      if (existing.some((e) => e._id === elasticId || e.actionId === elasticId)) {
        return state;
      }
      return {
        ...state,
        elastics: [
          ...existing,
          {
            id:       elasticId,
            toothIds: [payload.fromTooth, payload.toTooth],
            type:     payload.type ?? 'class_ii',
            size:     payload.size ?? null,
          },
        ],
      };
    }

    case 'ELASTIC_REMOVED':
      return { ...state, elastics: _removeById(state.elastics, payload.actionId) };

    case 'POWERCHAIN_APPLIED': {
      const existing = state.powerChains ?? [];
      const chainId  = payload._id ?? payload.actionId ?? null;
      // P0-1: Stable ID is required — no fallbacks allowed
      if (!chainId) {
        throw Object.assign(
          new Error("INVALID_EVENT_PAYLOAD: Missing stable ID for POWERCHAIN_APPLIED"),
          { code: 'MISSING_ENTITY_ID', eventType: 'POWERCHAIN_APPLIED' }
        );
      }
      if (existing.some((c) => c._id === chainId || c.actionId === chainId)) {
        return state;
      }
      return {
        ...state,
        powerChains: [
          ...existing,
          {
            id:          chainId,
            arch:        payload.arch ?? null,
            type:        payload.type ?? null,
            segments:    payload.segments ?? [],
            isUpper:     payload.arch === 'upper',
            anchorTeeth: [],
            activeTeeth: (payload.segments ?? []).flatMap((s) => [s.from, s.to]),
            direction:   'mesial',
          },
        ],
      };
    }

    case 'POWERCHAIN_REMOVED':
      return { ...state, powerChains: _removeById(state.powerChains, payload.actionId) };

    case 'ACCESSORY_ADDED': {
      const existing = state.accessories ?? [];
      const accId    = payload._id ?? payload.actionId ?? null;
      // P0-1: Stable ID is required — no fallbacks allowed
      if (!accId) {
        throw Object.assign(
          new Error("INVALID_EVENT_PAYLOAD: Missing stable ID for ACCESSORY_ADDED"),
          { code: 'MISSING_ENTITY_ID', eventType: 'ACCESSORY_ADDED' }
        );
      }
      if (existing.some((a) => a._id === accId || a.actionId === accId)) {
        return state;
      }
      return {
        ...state,
        accessories: [
          ...existing,
          {
            id:       accId,
            type:     payload.type,
            toothIds: [payload.toothId],
            isUpper:  (payload.toothId ?? 0) < 30,
          },
        ],
      };
    }

    case 'ACCESSORY_REMOVED':
      return { ...state, accessories: _removeById(state.accessories, payload.actionId) };

    case 'LIGATURE_ADDED': {
      const existing = state.ligatures ?? [];
      const ligId    = payload._id ?? payload.actionId ?? null;
      // P0-1: Stable ID is required — no fallbacks allowed
      if (!ligId) {
        throw Object.assign(
          new Error("INVALID_EVENT_PAYLOAD: Missing stable ID for LIGATURE_ADDED"),
          { code: 'MISSING_ENTITY_ID', eventType: 'LIGATURE_ADDED' }
        );
      }
      if (existing.some((l) => l._id === ligId || l.actionId === ligId)) {
        return state;
      }
      return {
        ...state,
        ligatures: [
          ...existing,
          {
            id:       ligId,
            type:     payload.type,
            toothIds: [payload.toothId],
            isUpper:  (payload.toothId ?? 0) < 30,
          },
        ],
      };
    }

    case 'LIGATURE_REMOVED':
      return { ...state, ligatures: _removeById(state.ligatures, payload.actionId) };

    case 'IPR_ADDED': {
      const existing = state.iprMarkers ?? [];
      const iprId    = payload._id ?? payload.actionId ?? null;
      // P0-1: Stable ID is required — no fallbacks allowed
      if (!iprId) {
        throw Object.assign(
          new Error("INVALID_EVENT_PAYLOAD: Missing stable ID for IPR_ADDED"),
          { code: 'MISSING_ENTITY_ID', eventType: 'IPR_ADDED' }
        );
      }
      if (existing.some((m) => m._id === iprId || m.actionId === iprId)) {
        return state;
      }
      return {
        ...state,
        iprMarkers: [
          ...existing,
          {
            id:         iprId,
            toothId:    (payload.betweenTeeth ?? [])[0] ?? null,
            anchorType: 'mesial',
            value:      String(payload.amount ?? ''),
          },
        ],
      };
    }

    case 'IPR_REMOVED':
      return { ...state, iprMarkers: _removeById(state.iprMarkers, payload.actionId) };

    case 'SPACE_MARKER_ADDED': {
      const existing = state.spaceMarkers ?? [];
      const spaceId  = payload._id ?? payload.actionId ?? null;
      // P0-1: Stable ID is required — no fallbacks allowed
      if (!spaceId) {
        throw Object.assign(
          new Error("INVALID_EVENT_PAYLOAD: Missing stable ID for SPACE_MARKER_ADDED"),
          { code: 'MISSING_ENTITY_ID', eventType: 'SPACE_MARKER_ADDED' }
        );
      }
      if (existing.some((m) => m._id === spaceId || m.actionId === spaceId)) {
        return state;
      }
      return {
        ...state,
        spaceMarkers: [
          ...existing,
          {
            id:         spaceId,
            toothId:    payload.toothId,
            anchorType: 'mesial',
            value:      payload.type ?? '',
          },
        ],
      };
    }

    case 'SPACE_MARKER_REMOVED':
      return { ...state, spaceMarkers: _removeById(state.spaceMarkers, payload.actionId) };

    // ══ Legacy TAD Events ════════════════════════════════════════════════════

    case 'TAD_INSERTED': {
      const existing = state.miniscrews ?? [];
      const tadId    = payload._id ?? payload.tadId ?? null;
      // P0-1: Stable ID is required — no fallbacks allowed (breaks deterministic replay)
      if (!tadId) {
        throw Object.assign(
          new Error("INVALID_EVENT_PAYLOAD: Missing stable ID for TAD_INSERTED"),
          { code: 'MISSING_ENTITY_ID', eventType: 'TAD_INSERTED' }
        );
      }
      // Idempotency: skip if TAD with same ID already exists
      if (existing.some((m) => m._id?.toString() === tadId?.toString() || m.id === tadId)) {
        return state;
      }

      const toothId    = payload.toothNumber ?? payload.toothId;
      const anchorType = payload.chartPosition?.anchorType ?? payload.position ?? 'mesial';

      // Position-aware dedup: block if TAD already at same tooth+position
      if (existing.some((m) => m.toothId === toothId && m.anchorType === anchorType)) {
        return state;
      }

      // Deterministic position resolution (INSIDE reducer, not in service or UI)
      const resolved = _resolveMiniscrewPosition(toothId, anchorType);
      const between  = resolved?.type === 'interradicular' ? resolved.between : undefined;

      return {
        ...state,
        miniscrews: [
          ...existing,
          {
            id:         tadId,
            toothId,
            anchorType,
            angle:      90,
            brand:      payload.brand    ?? null,
            diameter:   payload.diameter ?? null,
            length:     payload.length   ?? null,
            between,       // Phase 7: deterministic interradicular position
            status:     'active',
          },
        ],
      };
    }

    case 'TAD_REMOVED': {
      const removeId = payload.tadId ?? payload._id;
      if (!removeId) return state;
      return {
        ...state,
        miniscrews: (state.miniscrews ?? []).filter(
          (m) => m.id !== removeId && m._id?.toString() !== removeId?.toString()
        ),
      };
    }

    case 'TAD_FAILED': {
      const failId = payload.tadId ?? payload._id;
      if (!failId) return state;

      // Mark as failed (keep on chart for audit trail — don't remove)
      const updatedMiniscrews = (state.miniscrews ?? []).map((m) =>
        (m.id === failId || m._id?.toString() === failId?.toString())
          ? { ...m, status: 'failed' }
          : m
      );

      // Auto-generate TODO for miniscrew reinsertion
      // Phase 8 HARDENING: timestamp comes from event, NEVER from Date.now()
      // This ensures deterministic replay — same events → same state on any machine
      const failedTad = (state.miniscrews ?? []).find(
        (m) => m.id === failId || m._id?.toString() === failId?.toString()
      );
      const newTodos = [...(state.todos ?? [])];
      if (failedTad) {
        newTodos.push({
          type:        'MINISCREW_REINSERTION',
          tooth:       failedTad.toothId,
          description: `Reinsertion needed: TAD at tooth ${failedTad.toothId} failed`,
          priority:    'high',
          createdAt:   (event.timestamp ? new Date(event.timestamp).toISOString() : (payload.timestamp ? new Date(payload.timestamp).toISOString() : '')),
          tadId:       failId,
        });
      }

      return {
        ...state,
        miniscrews: updatedMiniscrews,
        todos:      newTodos,
      };
    }

    case 'TAD_REINSERTED': {
      const reinsertId = payload.tadId ?? payload._id;
      if (!reinsertId) return state;
      return {
        ...state,
        miniscrews: (state.miniscrews ?? []).map((m) =>
          (m.id === reinsertId || m._id?.toString() === reinsertId?.toString())
            ? { ...m, status: 'active' }
            : m
        ),
      };
    }

    case 'TAD_MARKED_FOR_REMOVAL': {
      const markId = payload.tadId ?? payload._id;
      if (!markId) return state;
      return {
        ...state,
        miniscrews: (state.miniscrews ?? []).map((m) =>
          (m.id === markId || m._id?.toString() === markId?.toString())
            ? { ...m, status: 'needs_removal', hasActiveAlert: true }
            : m
        ),
      };
    }

    // ══ Legacy Bonding Events (audit trail only — state captured in bondingSnapshot) ═

    case 'BONDING_APPLIED':
    case 'BONDING_REBONDED':
    case 'BONDING_REMOVED':
    case 'BRACKET_REPOSITIONED':
      return state; // bonding state comes from bondingSnapshot, not event replay

    // ══ No-op events (sequence/note/legacy) ══════════════════════════════════

    case 'SEQUENCE_STEP_COMPLETED':
    case 'SEQUENCE_PLAN_CREATED':
    case 'SEQUENCE_PLAN_UPDATED':
    case 'EXTRACTION_DONE':
    case 'NOTE_ADDED':
    case 'WIRE_PLACED':       // legacy — superseded by ARCHWIRE_PLACED
    case 'ELASTICS_APPLIED':  // legacy — superseded by ELASTIC_APPLIED
      return state;

    // ══ Unknown — return state unchanged (caller may log) ════════════════════

    default:
      return state;
  }
}

// ─── Phase 9: Post-Reducer Validation (Safeguard Layer) ─────────────────────

/**
 * applyClinicalEventSafe — Production-hardened event application with
 * post-reducer invariant validation.
 *
 * Wraps applyClinicalEvent with:
 *   1. Version migration (upgradeEvent)
 *   2. Pure state transition (applyClinicalEvent)
 *   3. Post-reducer invariant check (validateChartState from safeguard.service)
 *
 * If the resulting state violates any critical invariant, throws
 * STATE_INVARIANT_VIOLATION — caller must handle rollback.
 *
 * @param {Object} state — current chart state (immutable)
 * @param {Object} event — clinical event
 * @returns {Object}     — new chart state (validated)
 * @throws {Error}       — if state invariant violated
 */
function applyClinicalEventSafe(state, event) {
  const upgraded = upgradeEvent(event);
  const newState = applyClinicalEvent(state, upgraded);

  // Post-reducer invariant validation
  // Lazy-require to avoid circular dependency — safeguard.service imports us
  let validateChartState;
  try {
    validateChartState = require("../services/safeguard.service").validateChartState;
  } catch {
    // safeguard.service not yet available (e.g., during early bootstrap or test)
    return newState;
  }

  const validation = validateChartState(newState);
  if (!validation.valid) {
    const critical = validation.violations.find((v) => v.severity === "critical");
    throw Object.assign(
      new Error(`STATE_INVARIANT_VIOLATION: ${critical?.message ?? "unknown"}`),
      {
        code: "STATE_INVARIANT_VIOLATION",
        violations: validation.violations,
        eventType: event.type,
        eventId: event.eventId,
      }
    );
  }

  return newState;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  applyClinicalEvent,
  applyClinicalEventSafe,
  upgradeEvent,
  // Internal helpers exported for testing
  _patchTooth,
  _patchTeeth,
  _removeById,
  _resolveMiniscrewPosition,
};
