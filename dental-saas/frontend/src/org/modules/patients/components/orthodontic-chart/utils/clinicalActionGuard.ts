/**
 * clinicalActionGuard.ts — Unified Clinical Action Duplicate Prevention
 *
 * ARCHITECTURE:
 *   - Single source of truth for ALL clinical action validation
 *   - Works with state snapshots, not just action history
 *   - Supports UI actions, OPG sync, snapshot restore, history replay
 *
 * USAGE:
 *   const duplicate = checkDuplicateAction(action, currentState);
 *   if (duplicate) { toast.warning('Already applied'); return; }
 */

import type { ArchwireConfig, PowerChainConfig, ElasticConnection } from '../types';

export type ClinicalActionType =
  | 'ARCHWIRE_SET'
  | 'ARCHWIRE_REMOVE'
  | 'BONDING_APPLIED'
  | 'BONDING_REMOVED'
  | 'TAD_INSERTED'
  | 'TAD_REMOVED'
  | 'TAD_FAILED'
  | 'TAD_HEALED'
  | 'TAD_REINSERTED'
  | 'TAD_MARKED_FOR_REMOVAL'
  | 'TAD_CONTEXT_MENU_OPEN'
  | 'TAD_CONTEXT_MENU_CLOSE'
  | 'POWERCHAIN_SET'
  | 'POWERCHAIN_REMOVED'
  | 'ELASTIC_SET'
  | 'ELASTIC_REMOVED'
  | 'LIGATURE_SET'
  | 'LIGATURE_REMOVED'
  | 'ACCESSORY_SET'
  | 'ACCESSORY_REMOVED'
  | 'APPLIANCE_REMOVED'
  | 'IPR_MARKED'
  | 'IPR_REMOVED'
  | 'SPACE_MARKED'
  | 'SPACE_REMOVED'
  // ── Legacy coarse type (deprecated \u2014 replaced by per-tooth actions below) ──
  | 'TOOTH_STATUS_CHANGED'
  | 'TOOTH_TAGGED'
  // ── Granular per-tooth clinical actions (Phase 2 — V3 compatible) ──────────
  | 'SET_TOOTH_STATUS'
  | 'SET_TOOTH_BONDING'
  | 'SET_TOOTH_DIAGNOSIS'
  | 'SET_TOOTH_ALIGNMENT'
  | 'SET_TOOTH_CONDITION'
  | 'TOGGLE_TOOTH_ALERT'
  | 'CLEAR_TOOTH';

export interface ClinicalAction {
  type: ClinicalActionType;
  payload: Record<string, unknown>;
  timestamp: number;
  source?: 'ui' | 'opg-sync' | 'snapshot-restore' | 'history-replay';
  visitId?: string;
}

export interface ClinicalState {
  upperArchwire?: ArchwireConfig;
  lowerArchwire?: ArchwireConfig;
  powerChains?: PowerChainConfig[];
  elastics?: ElasticConnection[];
  bondedTeeth?: Map<number, string>;
  miniscrews?: Array<{ id: string; toothId: number; position: string }>;
  ligatures?: Array<{ toothId: number; type: string }>;
  iprMarkers?: Array<{ toothId: number; amount: number }>;
  spaceMarkers?: Array<{ toothId: number; location: string }>;
}

/** Pass-through validator: always returns false (no duplicate to block). */
const PASS_THROUGH: ActionValidator = () => false;

type ActionValidator = (action: ClinicalAction, state: ClinicalState) => boolean;

const VALIDATORS: Record<ClinicalActionType, ActionValidator> = {
  ARCHWIRE_SET: (action, state) => {
    const { arch, material, size, from, to } = action.payload as {
      arch: 'upper' | 'lower';
      material: string;
      size: string;
      from: number;
      to: number;
    };
    const existing = arch === 'upper' ? state.upperArchwire : state.lowerArchwire;
    if (!existing) return false;
    return (
      existing.material === material &&
      existing.size === size &&
      existing.fromToothId === from &&
      existing.toToothId === to
    );
  },

  ARCHWIRE_REMOVE: (action, state) => {
    const { arch } = action.payload as { arch: 'upper' | 'lower' };
    const existing = arch === 'upper' ? state.upperArchwire : state.lowerArchwire;
    return !existing;
  },

  BONDING_APPLIED: (action, state) => {
    const { teeth, bracketType } = action.payload as {
      teeth: number[];
      bracketType: string;
    };
    if (!state.bondedTeeth) return false;
    return teeth.every(toothId => {
      const existingType = state.bondedTeeth!.get(toothId);
      return existingType === bracketType;
    });
  },

  BONDING_REMOVED: (action, state) => {
    const { teeth } = action.payload as { teeth: number[] };
    if (!state.bondedTeeth) return false;
    return teeth.every(toothId => !state.bondedTeeth!.has(toothId));
  },

  TAD_INSERTED: (action, state) => {
    // Phase 7: Position-aware dedup — blocks if TAD already exists at same tooth+position
    const toothId  = (action.payload.toothNumber ?? action.payload.toothId) as number;
    const position = (action.payload.chartPosition?.anchorType ?? action.payload.position) as string;
    if (!state.miniscrews || toothId == null) return false;
    return state.miniscrews.some(t => t.toothId === toothId && t.position === position);
  },

  TAD_REMOVED: (action, state) => {
    const tadId = (action.payload.tadId ?? action.payload._id) as string;
    if (!state.miniscrews) return false;
    return !state.miniscrews.some(t => t.id === tadId);
  },

  POWERCHAIN_SET: (action, state) => {
    const { teeth, type, color } = action.payload as {
      teeth: number[];
      type: string;
      color: string;
    };
    if (!state.powerChains || state.powerChains.length === 0) return false;
    const teethSorted = [...teeth].sort();
    return state.powerChains.some(pc => {
      const pcTeeth = [...pc.anchorTeeth, ...pc.activeTeeth].sort();
      return (
        JSON.stringify(pcTeeth) === JSON.stringify(teethSorted) &&
        pc.type === type &&
        pc.color === color
      );
    });
  },

  POWERCHAIN_REMOVED: (action, state) => {
    const { chainId } = action.payload as { chainId: string };
    if (!state.powerChains) return false;
    return !state.powerChains.some(pc => pc.id === chainId);
  },

  ELASTIC_SET: (action, state) => {
    const { teeth, type, size } = action.payload as {
      teeth: number[];
      type: string;
      size: string;
    };
    if (!state.elastics || state.elastics.length === 0) return false;
    const teethSorted = [...teeth].sort();
    return state.elastics.some(e => {
      const eTeeth = [...e.toothIds].sort();
      return (
        JSON.stringify(eTeeth) === JSON.stringify(teethSorted) &&
        e.type === type &&
        e.size === size
      );
    });
  },

  ELASTIC_REMOVED: (action, state) => {
    const { elasticId } = action.payload as { elasticId: string };
    if (!state.elastics) return false;
    return !state.elastics.some(e => e.id === elasticId);
  },

  LIGATURE_SET: (action, state) => {
    const { toothId, ligatureType } = action.payload as {
      toothId: number;
      ligatureType: string;
    };
    if (!state.ligatures) return false;
    return state.ligatures.some(l => l.toothId === toothId && l.type === ligatureType);
  },

  IPR_MARKED: (action, state) => {
    const { toothId, amount } = action.payload as {
      toothId: number;
      amount: number;
    };
    if (!state.iprMarkers) return false;
    return state.iprMarkers.some(ipr => ipr.toothId === toothId && ipr.amount === amount);
  },

  SPACE_MARKED: (action, state) => {
    const { toothId, location } = action.payload as {
      toothId: number;
      location: string;
    };
    if (!state.spaceMarkers) return false;
    return state.spaceMarkers.some(sm => sm.toothId === toothId && sm.location === location);
  },

  // ── Pass-through validators (no duplicate-state logic needed) ──────────────
  // Removals are idempotent. Status/tagging changes are always intentional.
  TAD_FAILED:              PASS_THROUGH,
  TAD_HEALED:              PASS_THROUGH,
  TAD_REINSERTED:          PASS_THROUGH,
  TAD_MARKED_FOR_REMOVAL:  PASS_THROUGH,
  TAD_CONTEXT_MENU_OPEN:   PASS_THROUGH,
  TAD_CONTEXT_MENU_CLOSE:  PASS_THROUGH,
  LIGATURE_REMOVED:     PASS_THROUGH,
  ACCESSORY_SET:        PASS_THROUGH,
  ACCESSORY_REMOVED:    PASS_THROUGH,
  APPLIANCE_REMOVED:    PASS_THROUGH,
  IPR_REMOVED:          PASS_THROUGH,
  SPACE_REMOVED:        PASS_THROUGH,
  TOOTH_STATUS_CHANGED: PASS_THROUGH,
  TOOTH_TAGGED:         PASS_THROUGH,
  // ── Granular per-tooth actions (Phase 2 — always intentional) ────────────
  SET_TOOTH_STATUS:     PASS_THROUGH,
  SET_TOOTH_BONDING:    PASS_THROUGH,
  SET_TOOTH_DIAGNOSIS:  PASS_THROUGH,
  SET_TOOTH_ALIGNMENT:  PASS_THROUGH,
  SET_TOOTH_CONDITION:  PASS_THROUGH,
  TOGGLE_TOOTH_ALERT:   PASS_THROUGH,
  CLEAR_TOOTH:          PASS_THROUGH,
};

/**
 * Check if a clinical action is a duplicate of existing state.
 *
 * @param action - The action being proposed
 * @param state - Current clinical state snapshot
 * @returns true if duplicate found, false if action should proceed
 */
export function checkDuplicateAction(
  action: ClinicalAction,
  state: ClinicalState
): boolean {
  const validator = VALIDATORS[action.type];
  if (!validator) {
    return false;
  }
  return validator(action, state);
}

/**
 * Quick check for archwire duplicity using direct state comparison.
 */
export function isDuplicateArchwire(
  existing: ArchwireConfig | undefined,
  config: { material: string; size: string; from: number; to: number }
): boolean {
  if (!existing) return false;
  return (
    existing.material === config.material &&
    existing.size === config.size &&
    existing.fromToothId === config.from &&
    existing.toToothId === config.to
  );
}

/**
 * Quick check for bonding duplicity.
 */
export function isDuplicateBonding(
  bondedTeeth: Map<number, string>,
  teeth: number[],
  bracketType: string
): boolean {
  return teeth.every(toothId => {
    const existingType = bondedTeeth.get(toothId);
    return existingType === bracketType;
  });
}

/**
 * Quick check for powerchain duplicity.
 */
export function isDuplicatePowerChain(
  existingChains: PowerChainConfig[] | undefined,
  teeth: number[],
  type: string,
  color: string
): boolean {
  if (!existingChains || existingChains.length === 0) return false;
  const teethSorted = [...teeth].sort();
  return existingChains.some(pc => {
    const pcTeeth = [...pc.anchorTeeth, ...pc.activeTeeth].sort();
    return (
      JSON.stringify(pcTeeth) === JSON.stringify(teethSorted) &&
      pc.type === type &&
      pc.color === color
    );
  });
}

/**
 * Quick check for elastic duplicity.
 */
export function isDuplicateElastic(
  existingElastics: ElasticConnection[] | undefined,
  teeth: number[],
  type: string
): boolean {
  if (!existingElastics || existingElastics.length === 0) return false;
  const teethSorted = [...teeth].sort();
  return existingElastics.some(e => {
    const eTeeth = [...e.toothIds].sort();
    return JSON.stringify(eTeeth) === JSON.stringify(teethSorted) && e.type === type;
  });
}

/**
 * Emit a clinical warning event for UI feedback.
 */
export function emitClinicalWarning(message: string): void {
  console.warn('[ClinicalAction]', message);
  window.dispatchEvent(
    new CustomEvent('clinical-warning', {
      detail: { message },
    })
  );
}

/**
 * Format action for display.
 */
export function formatActionLabel(action: ClinicalAction): string {
  const { type, payload } = action;
  switch (type) {
    case 'ARCHWIRE_SET':
      return `Archwire set: ${payload.arch} (${payload.material} ${payload.size})`;
    case 'ARCHWIRE_REMOVE':
      return `Archwire removed: ${payload.arch}`;
    case 'BONDING_APPLIED':
      return `Bonding applied: teeth ${(payload.teeth as number[]).join(', ')}`;
    case 'TAD_INSERTED':
      return `TAD inserted at tooth ${payload.toothId}`;
    case 'POWERCHAIN_SET':
      return `Power chain set`;
    case 'ELASTIC_SET':
      return `Elastic set: ${payload.type}`;
    default:
      return type;
  }
}