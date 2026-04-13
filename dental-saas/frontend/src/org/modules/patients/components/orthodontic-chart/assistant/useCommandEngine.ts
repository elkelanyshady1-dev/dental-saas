/**
 * useCommandEngine.ts — Clinical Assistant Command Engine Hook
 *
 * Orchestrates: parse → validate → preview → execute via dispatchClinicalAction.
 *
 * NEVER mutates state directly.
 * ALWAYS shows preview before execution.
 * Uses dispatchClinicalAction → clinicalActionGuard pipeline.
 *
 * API:
 *   const engine = useCommandEngine({ dispatch, chartState, saveToHistory, logAction });
 *   engine.parse(input)   → sets previewResult
 *   engine.execute()      → dispatches actions from previewResult
 *   engine.reset()        → clears all state
 */

import { useState, useCallback } from 'react';
import { parseCommand } from './commandParser';
import type { CommandResult, ParsedAction } from './commandParser';
import { dispatchClinicalAction } from '../utils/actionDispatcher';
import { checkDuplicateAction } from '../utils/clinicalActionGuard';
import type { ClinicalState, ClinicalAction } from '../utils/clinicalActionGuard';
import type { ChartAction } from '../types';
import * as clinicalActionApi from '../api/clinicalAction.api';

export type EngineStatus =
  | 'idle'
  | 'parsing'
  | 'preview'
  | 'executing'
  | 'success'
  | 'fallback'   // unrecognized → offer visit notes
  | 'error';

export interface ValidationResult {
  action: ParsedAction;
  isDuplicate: boolean;
  duplicateReason?: string;
}

export interface CommandEngineState {
  status: EngineStatus;
  parseResult: CommandResult | null;
  validations: ValidationResult[];
  error: string | null;
  lastExecuted: string | null;
}

export interface CommandEngineOptions {
  dispatch: (action: ChartAction) => void;
  chartState: ClinicalState;
  saveToHistory: () => void;
  logAction: (description: string) => void;
  /** Called when user confirms "Add to Visit Notes" */
  onAddNote?: (text: string) => void;
  visitId: string | null;
  /** Phase 6D: visit status — commands are blocked unless 'active' */
  visitStatus?: string | null;
  /** Required for backend persistence of appliance-type actions */
  caseId?: string | null;
  patientId?: string | null;
}

export interface UseCommandEngineReturn {
  status: EngineStatus;
  parseResult: CommandResult | null;
  validations: ValidationResult[];
  error: string | null;
  lastExecuted: string | null;
  /** Parse input and prepare preview. Does NOT execute yet. */
  parse: (input: string) => void;
  /** Execute all actions from the current preview (after user confirms). */
  execute: () => void;
  /** Send unrecognized input to visit notes. */
  addAsNote: () => void;
  /** Reset to idle state. */
  reset: () => void;
}

export function useCommandEngine(options: CommandEngineOptions): UseCommandEngineReturn {
  const { dispatch, chartState, saveToHistory, logAction, onAddNote, visitId, visitStatus, caseId, patientId } = options;

  const [state, setState] = useState<CommandEngineState>({
    status:       'idle',
    parseResult:  null,
    validations:  [],
    error:        null,
    lastExecuted: null,
  });

  // ── parse: parse input + validate vs current state ───────────────────────
  const parse = useCallback((input: string) => {
    if (!input.trim()) {
      setState(s => ({ ...s, status: 'idle', parseResult: null, validations: [] }));
      return;
    }

    // Phase 6C/6D: Hard block — assistant cannot run without an ACTIVE visit session.
    // All clinical actions require a visitId for medico-legal traceability.
    if (!visitId || visitStatus !== 'active') {
      setState(s => ({
        ...s,
        status: 'error',
        error:  !visitId
          ? 'Start a visit session before using the clinical assistant. All actions must be linked to a visit.'
          : 'Visit session is no longer active. No new actions can be recorded.',
        parseResult: null,
        validations: [],
      }));
      return;
    }

    setState(s => ({ ...s, status: 'parsing', error: null }));

    const result = parseCommand(input);

    if (!result.recognized) {
      setState(s => ({
        ...s,
        status: 'fallback',
        parseResult: result,
        validations: [],
        error: null,
      }));
      return;
    }

    // Validate each action against current chart state
    const validations: ValidationResult[] = result.actions.map((action) => {
      const clinicalAction: ClinicalAction = {
        type: action.type as ClinicalAction['type'],
        payload: action.payload,
        timestamp: Date.now(),
        source: 'ui',
        visitId: visitId || undefined,
      };
      const isDuplicate = checkDuplicateAction(clinicalAction, chartState);
      return {
        action,
        isDuplicate,
        duplicateReason: isDuplicate ? `${action.type} already applied` : undefined,
      };
    });

    setState(s => ({
      ...s,
      status:      'preview',
      parseResult: result,
      validations,
      error: null,
    }));
  }, [chartState, visitId, visitStatus]);

  // ── execute: dispatch all non-duplicate actions ───────────────────────────
  const execute = useCallback(() => {
    if (state.status !== 'preview' || !state.parseResult?.recognized) return;

    // Phase 6D: Re-check visit at execution time (status may have changed since parse)
    if (!visitId || visitStatus !== 'active') {
      setState(s => ({
        ...s,
        status: 'error',
        error:  'Visit session is no longer active. Actions cannot be committed.',
      }));
      return;
    }

    setState(s => ({ ...s, status: 'executing' }));

    const actionsToRun = state.validations.filter(v => !v.isDuplicate);
    if (actionsToRun.length === 0) {
      setState(s => ({
        ...s,
        status: 'error',
        error: 'All actions are duplicates of existing state',
      }));
      return;
    }

    // Save history ONCE before the batch
    saveToHistory();

    let allSucceeded = true;

    for (const { action } of actionsToRun) {
      const result = dispatchClinicalAction({
        action: {
          type:      action.type as ClinicalAction['type'],
          payload:   action.payload,
          timestamp: Date.now(),
          source:    'ui',
          visitId:   visitId || undefined,
        },
        getState: () => chartState,
        onApply: () => {
          // Build and dispatch the correct reducer action
          const reducerAction = buildReducerAction(action);
          if (reducerAction) dispatch(reducerAction);
        },
        // Phase 3: persist appliance-type actions to backend immediately
        onCommit: buildOnCommit(action, { caseId, patientId }),
        logAction: (desc) => logAction(`[Assistant] ${desc}`),
        skipDuplicateCheck: true, // already validated above
      });

      if (!result.success) {
        allSucceeded = false;
        console.error('[CommandEngine] Action failed:', action.type, result.reason);
      }
    }

    const commandName = state.parseResult.commandName;
    const count = actionsToRun.length;

    setState(s => ({
      ...s,
      status:       allSucceeded ? 'success' : 'error',
      error:        allSucceeded ? null : 'One or more actions failed',
      lastExecuted: `${commandName} × ${count}`,
      parseResult:  null,
      validations:  [],
    }));

    // Auto-reset to idle after success
    if (allSucceeded) {
      setTimeout(() => {
        setState(s => ({ ...s, status: 'idle', lastExecuted: null }));
      }, 2000);
    }
  }, [state, chartState, dispatch, saveToHistory, logAction, visitId, visitStatus]);

  // ── addAsNote: fallback → visit notes ────────────────────────────────────
  const addAsNote = useCallback(() => {
    if (!state.parseResult) return;
    const text = state.parseResult.rawText;
    onAddNote?.(text);
    setState(s => ({ ...s, status: 'idle', parseResult: null, validations: [] }));
  }, [state.parseResult, onAddNote]);

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setState({
      status:       'idle',
      parseResult:  null,
      validations:  [],
      error:        null,
      lastExecuted: null,
    });
  }, []);

  return {
    status:       state.status,
    parseResult:  state.parseResult,
    validations:  state.validations,
    error:        state.error,
    lastExecuted: state.lastExecuted,
    parse,
    execute,
    addAsNote,
    reset,
  };
}

// ─── Backend commit builder ────────────────────────────────────────────────────

/**
 * Returns an async onCommit fn that persists the action to the backend.
 *
 * Only appliance-type actions have dedicated clinical-action API endpoints.
 * Tooth-level mutations (SET_TOOTH_BONDING etc.) are persisted in bulk when
 * the snapshot is saved at visit end — no per-action API call needed.
 *
 * Returns undefined for unhandled types (dispatchClinicalAction silently skips).
 */
function buildOnCommit(
  action: ParsedAction,
  ctx: { caseId?: string | null; patientId?: string | null }
): (() => Promise<void>) | undefined {
  const { caseId, patientId } = ctx;
  if (!caseId || !patientId) return undefined;

  const p = action.payload as Record<string, unknown>;

  switch (action.type) {
    case 'ELASTIC_SET':
      return async () => {
        await clinicalActionApi.applyElastic({
          caseId,
          patientId,
          fromTooth: p.fromTooth as number,
          toTooth:   p.toTooth   as number,
          type:      (p.type     as string) ?? 'class_ii',
          size:      'medium',
        });
      };

    case 'POWERCHAIN_SET':
      return async () => {
        await clinicalActionApi.applyPowerchain({
          caseId,
          patientId,
          arch: p.arch as 'upper' | 'lower',
          type: p.type as string,
        });
      };

    case 'IPR_MARKED':
      return async () => {
        await clinicalActionApi.addIPR({
          caseId,
          patientId,
          betweenTeeth: [p.toothId as number, (p.toothId as number) + 1],
          amount:       (p.amount as number) ?? 0.3,
        });
      };

    // Tooth-level mutations: persisted via snapshot at visit end — no per-action commit
    case 'SET_TOOTH_BONDING':
    case 'BONDING_REMOVED':
    case 'POWERCHAIN_REMOVED':
    default:
      return undefined;
  }
}

// ─── Reducer action builder ────────────────────────────────────────────────────

/**
 * Maps a ParsedAction to the correct ChartAction for chartReducer dispatch.
 * This is the bridge between the assistant's parsed command and the reducer.
 */
function buildReducerAction(action: ParsedAction): ChartAction | null {
  const { type, payload } = action;

  switch (type) {
    case 'SET_TOOTH_BONDING':
      return {
        type: 'SET_TOOTH_BONDING',
        payload: {
          toothId: payload.toothId as number,
          status:  (payload.status as string) ?? 'bracket',
        },
      } as unknown as ChartAction;

    case 'BONDING_REMOVED':
      return {
        type: 'SET_TOOTH_BONDING',
        payload: {
          toothId: payload.toothId as number,
          status:  'healthy',
        },
      } as unknown as ChartAction;

    case 'ELASTIC_SET':
      return {
        type: 'ADD_ELASTIC',
        payload: {
          id:      `assist-${Date.now()}`,
          toothIds: [payload.fromTooth as number, payload.toTooth as number],
          type:    payload.type as string,
          size:    'medium',
        },
      } as unknown as ChartAction;

    case 'POWERCHAIN_SET':
      return {
        type: 'ADD_POWERCHAIN',
        payload: {
          id:          `assist-${Date.now()}`,
          type:        payload.type as string,
          arch:        payload.arch as string,
          isUpper:     payload.arch === 'upper',
          anchorTeeth: [],
          activeTeeth: [],
          direction:   'mesial',
          color:       (payload.color as string) ?? '#7c3aed',
        },
      } as unknown as ChartAction;

    case 'POWERCHAIN_REMOVED':
      // Remove all powerschains (assistant context, no specific id)
      return {
        type: 'RESET_POWERCHAINS',
        payload: undefined,
      } as unknown as ChartAction;

    case 'IPR_MARKED':
      return {
        type: 'ADD_IPR',
        payload: {
          id:          `assist-${Date.now()}`,
          toothId:     payload.toothId as number,
          anchorType:  'mesial',
          value:       String(payload.amount ?? '0.3'),
        },
      } as unknown as ChartAction;

    default:
      console.warn('[CommandEngine] No reducer mapping for action type:', type);
      return null;
  }
}
