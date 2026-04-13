/**
 * chartReducer.ts — Phase 2 Full Event Engine
 *
 * Pure reducer for ALL chart state slices.
 * Replaces all useState chart state with a single deterministic dispatch path.
 *
 * Rules:
 *   - MUST be pure (no async, no API calls, no side effects)
 *   - Manages ALL clinical chart state
 *   - DB-driven state (TADs, bonding) hydrated via HYDRATE_TADS / HYDRATE_TEETH
 *   - Snapshot restore uses HYDRATE_SNAPSHOT (bypasses undo history)
 *   - RESET_CHART returns to canonical default state
 *
 * Undo strategy:
 *   - dispatchWithHistory() in SnapshotEditor saves state to historyRef before dispatch
 *   - TADs are EXCLUDED from undo (DB is SSOT — hydration effect handles them)
 *   - Snapshots restored via HYDRATE_SNAPSHOT also bypass history
 */

import type { ChartState, ChartAction, ClinicalStatus, AlertValue } from '../types';
import { UPPER_TEETH, LOWER_TEETH, normalizeTeeth } from '../types';
import { applyClinicalEvent, applyClinicalEventSafe, upgradeEvent } from './clinicalReducer';

export const initialChartState: ChartState = {
  upperTeeth:   [...UPPER_TEETH],
  lowerTeeth:   [...LOWER_TEETH],
  miniscrews:   [],
  upperArchwire: undefined,
  lowerArchwire: undefined,
  elastics:     [],
  appliances:   [],
  powerChains:  [],
  accessories:  [],
  ligatures:    [],
  iprMarkers:   [],
  spaceMarkers: [],
};

export function chartReducer(state: ChartState, action: ChartAction): ChartState {
  switch (action.type) {

    // ── TAD ───────────────────────────────────────────────────────────────────

    case 'HYDRATE_TADS':
      // Full replacement — from DB sync or snapshot restore
      return { ...state, miniscrews: action.payload };

    // ── DEPRECATED: Direct TAD mutations ─────────────────────────────────────
    // Phase 7: All TAD state changes MUST go through APPLY_CLINICAL_EVENT.
    // These cases are kept ONLY for backward compatibility during migration.
    // New code MUST use dispatchClinicalEvent() instead.
    //
    //   ❌ dispatch({ type: 'PLACE_TAD', payload: {...} })
    //   ✅ dispatchClinicalEvent({ type: 'TAD_INSERTED', payload: {...} }, config)

    case 'PLACE_TAD': {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[chartReducer] DEPRECATED: PLACE_TAD — use dispatchClinicalEvent({ type: "TAD_INSERTED" }) instead'
        );
      }
      // Route through clinical event path for consistency
      const tadEvent = { type: 'TAD_INSERTED', payload: { _id: action.payload.id, toothId: action.payload.toothId, position: action.payload.anchorType, brand: action.payload.brand, diameter: action.payload.diameter, length: action.payload.length } };
      return applyClinicalEvent(state, upgradeEvent(tadEvent));
    }

    case 'REMOVE_TAD': {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[chartReducer] DEPRECATED: REMOVE_TAD — use dispatchClinicalEvent({ type: "TAD_REMOVED" }) instead'
        );
      }
      return applyClinicalEvent(state, upgradeEvent({ type: 'TAD_REMOVED', payload: { tadId: action.payload } }));
    }

    case 'FAIL_TAD': {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[chartReducer] DEPRECATED: FAIL_TAD — use dispatchClinicalEvent({ type: "TAD_FAILED" }) instead'
        );
      }
      return applyClinicalEvent(state, upgradeEvent({ type: 'TAD_FAILED', payload: { tadId: action.payload } }));
    }

    case 'HEAL_TAD': {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[chartReducer] DEPRECATED: HEAL_TAD — use dispatchClinicalEvent({ type: "TAD_REINSERTED" }) instead'
        );
      }
      return applyClinicalEvent(state, upgradeEvent({ type: 'TAD_REINSERTED', payload: { tadId: action.payload } }));
    }

    // ── Archwire ─────────────────────────────────────────────────────────────

    case 'SET_ARCHWIRE':
      return action.payload.arch === 'upper'
        ? { ...state, upperArchwire: action.payload.wire }
        : { ...state, lowerArchwire: action.payload.wire };

    case 'REMOVE_ARCHWIRE':
      return action.payload.arch === 'upper'
        ? { ...state, upperArchwire: undefined }
        : { ...state, lowerArchwire: undefined };

    // ── Teeth ─────────────────────────────────────────────────────────────────

    case 'HYDRATE_TEETH':
      // DB-driven hydration (bonding engine sync) — replaces both arches
      // normalizeTeeth ensures every tooth has valid anchors (UI crash prevention)
      return {
        ...state,
        upperTeeth: normalizeTeeth(action.payload.upper),
        lowerTeeth: normalizeTeeth(action.payload.lower),
      };

    case 'UPDATE_TEETH':
      // @deprecated — use granular SET_TOOTH_* actions for new mutations.
      // Kept for: undo history restore (HYDRATE_SNAPSHOT uses full-arch replacement).
      return {
        ...state,
        upperTeeth: normalizeTeeth(action.payload.upper),
        lowerTeeth: normalizeTeeth(action.payload.lower),
      };

    // ── Granular Tooth Actions — Phase 2 (V3 Event Sourcing) ──────────────────
    // Each case patches a single tooth by toothId. Upper arch = toothId < 30.

    case 'SET_TOOTH_STATUS': {
      const { toothId, status } = action.payload;
      const isUpper = toothId < 30;
      return isUpper
        ? { ...state, upperTeeth: state.upperTeeth.map(t => t.id === toothId ? { ...t, status } : t) }
        : { ...state, lowerTeeth: state.lowerTeeth.map(t => t.id === toothId ? { ...t, status } : t) };
    }

    case 'SET_TOOTH_BONDING': {
      const { toothId, status, prescription, slotSize, brand, bondingHeight, bondingOption, prescriptionValues } = action.payload;
      const isUpper = toothId < 30;
      const patch = (t: typeof state.upperTeeth[0]): typeof state.upperTeeth[0] =>
        t.id !== toothId ? t : {
          ...t,
          status,
          ...(prescription        !== undefined && { prescription: prescription as typeof t['prescription'] }),
          ...(slotSize            !== undefined && { slotSize: slotSize as typeof t['slotSize'] }),
          ...(brand               !== undefined && { brand: brand as typeof t['brand'] }),
          ...(bondingHeight       !== undefined && { bondingHeight }),
          ...(bondingOption       !== undefined && { bondingOption: bondingOption as typeof t['bondingOption'] }),
          ...(prescriptionValues  !== undefined && { prescriptionValues: prescriptionValues as typeof t['prescriptionValues'] }),
        } as typeof state.upperTeeth[0];
      return isUpper
        ? { ...state, upperTeeth: state.upperTeeth.map(patch) }
        : { ...state, lowerTeeth: state.lowerTeeth.map(patch) };
    }

    case 'SET_TOOTH_DIAGNOSIS': {
      const { toothId, diagnosis, clearAlignment, clearCondition, clearAlerts } = action.payload;
      const isUpper = toothId < 30;
      const patch = (t: typeof state.upperTeeth[0]) =>
        t.id !== toothId ? t : {
          ...t,
          clinicalStatus: {
            ...(t.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
            diagnosis,
            ...(clearAlignment && { alignment: null }),
            ...(clearCondition && { condition: null }),
          } as ClinicalStatus,
          ...(clearAlerts && { clinicalAlerts: [] as AlertValue[] }),
        };
      return isUpper
        ? { ...state, upperTeeth: state.upperTeeth.map(patch) }
        : { ...state, lowerTeeth: state.lowerTeeth.map(patch) };
    }

    case 'SET_TOOTH_ALIGNMENT': {
      const { toothId, alignment } = action.payload;
      const isUpper = toothId < 30;
      const patch = (t: typeof state.upperTeeth[0]) =>
        t.id !== toothId ? t : {
          ...t,
          clinicalStatus: {
            ...(t.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
            alignment,
          } as ClinicalStatus,
        };
      return isUpper
        ? { ...state, upperTeeth: state.upperTeeth.map(patch) }
        : { ...state, lowerTeeth: state.lowerTeeth.map(patch) };
    }

    case 'SET_TOOTH_CONDITION': {
      const { toothId, condition } = action.payload;
      const isUpper = toothId < 30;
      const patch = (t: typeof state.upperTeeth[0]) =>
        t.id !== toothId ? t : {
          ...t,
          clinicalStatus: {
            ...(t.clinicalStatus ?? { diagnosis: null, alignment: null, condition: null }),
            condition,
          } as ClinicalStatus,
        };
      return isUpper
        ? { ...state, upperTeeth: state.upperTeeth.map(patch) }
        : { ...state, lowerTeeth: state.lowerTeeth.map(patch) };
    }

    case 'TOGGLE_TOOTH_ALERT': {
      const { toothId, alert } = action.payload;
      const isUpper = toothId < 30;
      const patch = (t: typeof state.upperTeeth[0]) => {
        if (t.id !== toothId) return t;
        const existing: AlertValue[] = (t.clinicalAlerts ?? []) as AlertValue[];
        return {
          ...t,
          clinicalAlerts: (existing.includes(alert as AlertValue)
            ? existing.filter((a) => a !== alert)
            : [...existing, alert as AlertValue]) as AlertValue[],
        };
      };
      return isUpper
        ? { ...state, upperTeeth: state.upperTeeth.map(patch) }
        : { ...state, lowerTeeth: state.lowerTeeth.map(patch) };
    }

    case 'CLEAR_TOOTH': {
      const { toothId } = action.payload;
      const isUpper = toothId < 30;
      const patch = (t: typeof state.upperTeeth[0]) =>
        t.id !== toothId ? t : {
          ...t,
          clinicalStatus: { diagnosis: null, alignment: null, condition: null } as ClinicalStatus,
          clinicalAlerts: [] as AlertValue[],
        };
      return isUpper
        ? { ...state, upperTeeth: state.upperTeeth.map(patch) }
        : { ...state, lowerTeeth: state.lowerTeeth.map(patch) };
    }

    // ── Snapshot ─────────────────────────────────────────────────────────────

    case 'HYDRATE_SNAPSHOT':
      // Full or partial state replacement — from snapshot restore or undo
      // TADs (miniscrews) are NOT included — they come from DB hydration
      // normalizeTeeth ensures anchors safety on every snapshot restore
      return {
        ...state,
        ...action.payload,
        ...(action.payload.upperTeeth ? { upperTeeth: normalizeTeeth(action.payload.upperTeeth) } : {}),
        ...(action.payload.lowerTeeth ? { lowerTeeth: normalizeTeeth(action.payload.lowerTeeth) } : {}),
      };

    case 'HYDRATE_BONDING_SNAPSHOT': {
      // Apply snapshot bonding state to teeth — runs during snapshot restore.
      type BondRecord = { bracketType: string | null; prescription: string | null; slotSize: string | null; brand: string | null; bondingHeight: number | null; status: string };
      const bondMap = new Map<number, BondRecord>();
      for (const b of (action.payload ?? [])) {
        // Payload field 'slot' maps to reducer field 'slotSize'
        const record: BondRecord = { bracketType: null, prescription: b.prescription ?? null, slotSize: b.slot ?? null, brand: b.brand ?? null, bondingHeight: b.bondingHeight ?? null, status: b.status ?? 'ACTIVE' };
        bondMap.set(b.tooth, record);
      }

      const applyBonding = (teeth: typeof state.upperTeeth): typeof state.upperTeeth =>
        teeth.map((tooth) => {
          const bond = bondMap.get(tooth.id);
          if (!bond) return tooth;
          if (bond.status === 'DEBONDED') return { ...tooth, status: 'healthy' as typeof tooth.status };
          // Map bracketType to tooth status
          const statusMap: Record<string, typeof tooth.status> = { BRACKET: 'bracket', BAND: 'band', TUBE: 'molar-tube' };
          return {
            ...tooth,
            status:        statusMap[bond.bracketType ?? ''] ?? 'bracket' as typeof tooth.status,
            prescription:  bond.prescription  ?? undefined as typeof tooth.prescription,
            slotSize:      bond.slotSize      ?? undefined as typeof tooth.slotSize,
            brand:         bond.brand         ?? undefined as typeof tooth.brand,
            bondingHeight: bond.bondingHeight ?? undefined,
          } as typeof tooth;
        });

      return {
        ...state,
        upperTeeth: applyBonding(state.upperTeeth),
        lowerTeeth: applyBonding(state.lowerTeeth),
      };
    }

    case 'HYDRATE_TAD_SNAPSHOT': {
      // Replace miniscrews from snapshot TAD data — runs during snapshot restore.
      // Maps snapshot TAD status → chart Miniscrew status vocabulary.
      const STATUS_MAP: Record<string, 'active' | 'healing' | 'failed'> = {
        ACTIVE:        'active',
        NEEDS_REMOVAL: 'healing',
        FAILED:        'failed',
      };
      const miniscrews = (action.payload ?? []).map((t: any) => ({
        id:         `snap-${t.toothNumber}-${t.position}`,
        toothId:    t.chartPosition?.toothId    ?? t.toothNumber,
        anchorType: (t.chartPosition?.anchorType ?? 'apical') as any,
        angle:      90,
        brand:      t.brand    ?? undefined,
        diameter:   t.diameter ?? undefined,
        length:     t.length   ?? undefined,
        status:     STATUS_MAP[t.status] ?? 'active',
      }));
      return { ...state, miniscrews };
    }

    case 'RESET_CHART':
      return { ...initialChartState };

    // ── Context Menu (Phase 7 — event-driven, state-based rendering) ────────
    case 'OPEN_CONTEXT_MENU':
      return { ...state, activeContextMenu: action.payload } as ChartState;

    case 'CLOSE_CONTEXT_MENU':
      return { ...state, activeContextMenu: undefined } as ChartState;

    // ── Elastics ─────────────────────────────────────────────────────────────

    case 'ADD_ELASTIC':
      return { ...state, elastics: [...state.elastics, action.payload] };

    case 'REMOVE_ELASTIC':
      return { ...state, elastics: state.elastics.filter(e => e.id !== action.payload) };

    // ── Appliances ───────────────────────────────────────────────────────────

    case 'REMOVE_APPLIANCE':
      return { ...state, appliances: state.appliances.filter(a => a.id !== action.payload) };

    // ── PowerChains ──────────────────────────────────────────────────────────

    case 'ADD_POWERCHAIN':
      return { ...state, powerChains: [...state.powerChains, action.payload] };

    case 'REMOVE_POWERCHAIN':
      return { ...state, powerChains: state.powerChains.filter(p => p.id !== action.payload) };

    // ── Accessories ──────────────────────────────────────────────────────────

    case 'ADD_ACCESSORY':
      return { ...state, accessories: [...state.accessories, action.payload] };

    case 'REMOVE_ACCESSORY':
      return { ...state, accessories: state.accessories.filter(a => a.id !== action.payload) };

    // ── Ligatures ────────────────────────────────────────────────────────────

    case 'ADD_LIGATURE':
      return { ...state, ligatures: [...state.ligatures, action.payload] };

    case 'REMOVE_LIGATURE':
      return { ...state, ligatures: state.ligatures.filter(l => l.id !== action.payload) };

    // ── IPR Markers ──────────────────────────────────────────────────────────

    case 'ADD_IPR':
      return { ...state, iprMarkers: [...state.iprMarkers, action.payload] };

    case 'REMOVE_IPR':
      return { ...state, iprMarkers: state.iprMarkers.filter(m => m.id !== action.payload) };

    // ── Space Markers ────────────────────────────────────────────────────────

    case 'ADD_SPACE':
      return { ...state, spaceMarkers: [...state.spaceMarkers, action.payload] };

    case 'REMOVE_SPACE':
      return { ...state, spaceMarkers: state.spaceMarkers.filter(m => m.id !== action.payload) };

    // ── Phase 5.1 + Phase 8: Server-pushed clinical event (incremental sync) ──
    // Allows applying a raw ClinicalEvent document directly to the local chart state.
    // Uses applyClinicalEventSafe() which adds:
    //   - eventId-level idempotency (processedEventIds registry)
    //   - version migration (upgradeEvent)
    //   - dev-mode state freeze (mutation detection)
    //
    // Usage: dispatch({ type: 'APPLY_CLINICAL_EVENT', payload: serverEvent })
    // When: real-time server-push, optimistic event application, collaborative mode.
    case 'APPLY_CLINICAL_EVENT': {
      try {
        return applyClinicalEventSafe(state, action.payload);
      } catch {
        // Unknown version or malformed event — log and skip rather than crash
        if (process.env.NODE_ENV !== 'production') {
          console.error('[chartReducer] APPLY_CLINICAL_EVENT failed for:', action.payload?.type);
        }
        return state;
      }
    }

    default:
      return state;
  }
}
