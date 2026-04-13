/**
 * actionDispatcher.ts — Centralized Clinical Action Pipeline
 *
 * ARCHITECTURE:
 *   - ALL clinical actions MUST pass through this dispatcher
 *   - Single point of validation, logging, and state updates
 *   - Prevents duplicates from ANY source (UI, OPG, snapshot, history)
 *
 * USAGE:
 *   const result = dispatchClinicalAction({
 *     type: 'ARCHWIRE_SET',
 *     payload: { arch, material, size, from, to },
 *     getState: () => ({ upperArchwire, lowerArchwire }),
 *     onApply: () => { setUpperArchwire(config); saveToHistory(); }
 *   });
 *
 *   if (result.blocked) {
 *     toast.warning(result.reason);
 *   }
 */

import {
  checkDuplicateAction,
  emitClinicalWarning,
  ClinicalAction,
  ClinicalState,
} from './clinicalActionGuard';

export interface DispatchResult {
  success: boolean;
  blocked: boolean;
  reason?: string;
}

export interface DispatchOptions {
  action: ClinicalAction;
  /** Required for duplicate-check. Can be omitted when skipDuplicateCheck=true. */
  getState?: () => ClinicalState;
  onApply: () => void;
  /** Optional async API commit — runs after onApply succeeds. Never throws (errors are caught). */
  onCommit?: () => Promise<void>;
  source?: 'ui' | 'opg-sync' | 'snapshot-restore' | 'history-replay';
  skipDuplicateCheck?: boolean;
  logAction?: (description: string) => void;
  /** Phase 7: Enable verbose debug logging (EVENT + STATE after each dispatch) */
  debug?: boolean;
}

// ─── P0-4: Write path sentinel ────────────────────────────────────────────────
// Tracks whether we are currently inside a dispatchClinicalAction call.
// Any mutation hook that calls a DB API directly (outside this dispatcher)
// will be caught by the dev-time guard below.
let _insideDispatcher = false;

/**
 * P0-4: assertCalledThroughDispatcher
 *
 * Call this at the top of any mutation hook (e.g. useElasticMutation.mutate)
 * to enforce that writes always go through dispatchClinicalAction.
 * Only active in development — zero cost in production.
 *
 * @throws Error if called outside the dispatcher in non-production environments.
 */
export function assertCalledThroughDispatcher(mutationName: string): void {
  if (process.env.NODE_ENV !== 'production' && !_insideDispatcher) {
    throw new Error(
      `INVALID_WRITE_PATH: "${mutationName}" must be called through dispatchClinicalAction. ` +
      `Direct mutation detected outside dispatcher pipeline.`
    );
  }
}

/**
 * Dispatch a clinical action through the unified pipeline.
 *
 * @param options - Action configuration
 * @returns DispatchResult indicating success/failure
 */
export function dispatchClinicalAction(options: DispatchOptions): DispatchResult {
  const {
    action,
    getState,
    onApply,
    onCommit,
    source = 'ui',
    skipDuplicateCheck = false,
    logAction,
    debug = false,
  } = options;

  // ── STEP 1: Duplicate Check ─────────────────────────────────────────────
  // Skip for snapshot-restore and history-replay (already validated)
  // Also skip when no getState provided (local-only mutations).
  if (!skipDuplicateCheck && source === 'ui' && getState) {
    const state = getState();
    const isDuplicate = checkDuplicateAction(action, state);

    if (isDuplicate) {
      const message = `Duplicate action blocked: ${action.type}`;
      console.warn('[ActionDispatcher]', message, action);
      emitClinicalWarning(message);

      return {
        success: false,
        blocked: true,
        reason: 'DUPLICATE_ACTION',
      };
    }
  }

  // ── STEP 2: Log Action (optional) ───────────────────────────────────────
  if (logAction) {
    const description = formatActionDescription(action);
    logAction(description);
  }

  try {
    // ── STEP 3: Apply Action (synchronous reducer update) ────────────────
    // P0-4: Set dispatcher sentinel so assertCalledThroughDispatcher() passes.
    _insideDispatcher = true;
    try {
      onApply();
    } finally {
      _insideDispatcher = false;
    }

    // ── STEP 4: Commit to API (async — wraps mutateAsync) ───────────────
    // Runs AFTER the reducer is updated so UI is already responsive.
    // P0-4: Re-arm the sentinel for the async commit phase so mutation hooks
    // called inside onCommit also pass the guard check.
    if (onCommit) {
      _insideDispatcher = true;
      onCommit()
        .catch((err: unknown) => {
          console.error('[ActionDispatcher] onCommit failed:', action.type, err);
        })
        .finally(() => {
          _insideDispatcher = false;
        });
    }

    // ── STEP 5: Log Success + Debug Mode ───────────────────────────────
    if (debug || process.env.NODE_ENV !== 'production') {
      console.log('[ActionDispatcher]', 'Action applied:', action.type, { source });
    }

    // Phase 7: Debug mode — log full event + post-apply state snapshot
    if (debug && getState) {
      console.log('[ActionDispatcher] DEBUG EVENT:', JSON.stringify(action, null, 2));
      console.log('[ActionDispatcher] DEBUG STATE:', JSON.stringify(getState(), null, 2));
    }

    return {
      success: true,
      blocked: false,
    };
  } catch (error) {
    console.error('[ActionDispatcher]', 'Action failed:', action.type, error);
    return {
      success: false,
      blocked: false,
      reason: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Batch dispatch multiple actions atomically.
 * If any action fails, previous actions are NOT rolled back.
 *
 * @param actions - Array of action configs
 * @param getState - State getter
 * @returns Array of results
 */
export function dispatchMultipleActions(
  actions: DispatchOptions[]
): DispatchResult[] {
  return actions.map((options) => dispatchClinicalAction(options));
}

/**
 * Create a dispatcher bound to a specific state source.
 * Useful for components that need consistent action handling.
 *
 * @param getConfig - Function returning state and callbacks
 * @returns Bound dispatch function
 */
export function createDispatcher(
  getConfig: () => {
    getState: () => ClinicalState;
    logAction: (desc: string) => void;
  }
) {
  return (
    type: ClinicalAction['type'],
    payload: ClinicalAction['payload'],
    onApply: () => void,
    source?: ClinicalAction['source']
  ): DispatchResult => {
    const { getState, logAction } = getConfig();

    return dispatchClinicalAction({
      action: {
        type,
        payload,
        timestamp: Date.now(),
        source,
      },
      getState,
      onApply,
      logAction,
      source,
    });
  };
}

function formatActionDescription(action: ClinicalAction): string {
  const { type, payload } = action;
  const p = payload as Record<string, unknown>;

  switch (type) {
    case 'ARCHWIRE_SET':
      return `Set ${p.arch} archwire: ${p.material} ${p.size} (${p.from}→${p.to})`;
    case 'ARCHWIRE_REMOVE':
      return `Removed ${p.arch} archwire`;
    case 'BONDING_APPLIED':
      return `Bonding applied to teeth ${(p.teeth as number[]).join(', ')}`;
    case 'BONDING_REMOVED':
      return `Bonding removed from teeth ${(p.teeth as number[]).join(', ')}`;
    case 'TAD_INSERTED':
      return `TAD inserted at tooth ${p.toothNumber ?? p.toothId} (${p.position ?? p.chartPosition?.anchorType ?? 'mesial'})`;
    case 'TAD_REMOVED':
      return `TAD removed (${p.tadId ?? p._id})`;
    case 'TAD_FAILED':
      return `TAD failed at tooth (${p.tadId ?? p._id})`;
    case 'TAD_REINSERTED':
      return `TAD reinserted (${p.tadId ?? p._id})`;
    case 'TAD_MARKED_FOR_REMOVAL':
      return `TAD marked for removal (${p.tadId ?? p._id})`;
    case 'POWERCHAIN_SET':
      return `Power chain applied`;
    case 'POWERCHAIN_REMOVED':
      return `Power chain removed`;
    case 'ELASTIC_SET':
      return `Elastic applied: ${p.type}`;
    case 'ELASTIC_REMOVED':
      return `Elastic removed`;
    default:
      return type;
  }
}