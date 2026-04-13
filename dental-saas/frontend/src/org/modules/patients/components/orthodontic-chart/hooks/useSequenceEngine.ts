/**
 * useSequenceEngine.ts — Treatment Sequence Engine React Query Hooks
 *
 * SERVER STATE LAW (architecture rules):
 *   ✅ useQuery  — for all reads
 *   ✅ useMutation + invalidateQueries — for all writes
 *   ❌ useState(apiData)  — FORBIDDEN
 *   ❌ refetch()          — FORBIDDEN
 *   ❌ window.location.reload() — FORBIDDEN
 *
 * Architecture constraints:
 *   ✅ Sequence Engine is READ-ONLY relative to bonding/TAD/chart state
 *   ✅ Only updates sequenceProgress on WorkflowSnapshot (atomic $set)
 *   ❌ Does NOT mutate bonding data
 *   ❌ Does NOT mutate TAD data
 *   ❌ Does NOT modify chart state
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  sequenceApi,
  type SequencePlan,
  type SequenceStep,
  type UpsertSequencePayload,
} from '../api/sequence.api';

// Lightweight toast shim — replace with project notification system if available
const toast = {
  success: (msg: string) => console.info('[Sequence] ✅', msg),
  error: (msg: string) => console.error('[Sequence] ❌', msg),
};

// ─── ObjectId Guard ───────────────────────────────────────────────────────────
// Prevents API calls when caseId is a truthy placeholder (e.g. 'case-001').
// Only 24-char hex strings are valid MongoDB ObjectIds.
const isValidObjectId = (id: string | undefined): id is string =>
  typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

// ─── Query Keys ────────────────────────────────────────────────────────────────

export const SEQUENCE_KEYS = {
  byCase: (caseId: string) => ['sequence', 'case', caseId] as const,
};

// ─── Read Hooks ────────────────────────────────────────────────────────────────

/**
 * Fetch the SequencePlan for a case. Returns null if no plan exists yet.
 */
export const useSequencePlan = (caseId: string | undefined) => {
  return useQuery<SequencePlan | null>({
    queryKey: SEQUENCE_KEYS.byCase(caseId ?? ''),
    queryFn: () => sequenceApi.getByCase(caseId!),
    enabled: isValidObjectId(caseId),
    staleTime: 60_000,
  });
};

// ─── Mutation Hooks ────────────────────────────────────────────────────────────

/**
 * Create or replace a sequence plan for a case.
 */
export const useUpsertSequencePlan = (caseId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertSequencePayload) => sequenceApi.upsert(caseId!, payload),
    onSuccess: () => {
      if (caseId) qc.invalidateQueries({ queryKey: SEQUENCE_KEYS.byCase(caseId) });
      toast.success('Treatment sequence saved');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message ?? 'Failed to save sequence'),
  });
};

/**
 * Update the step progress index on a WorkflowSnapshot.
 * Does NOT invalidate the sequence plan itself — only the snapshot state changes.
 */
export const useUpdateSequenceProgress = (caseId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ snapshotId, stepIndex }: { snapshotId: string; stepIndex: number }) =>
      sequenceApi.updateProgress({ snapshotId, stepIndex }),
    onSuccess: () => {
      // Re-fetch snapshot data if it's in the cache
      if (caseId) {
        qc.invalidateQueries({ queryKey: ['snapshot', 'case', caseId] });
        qc.invalidateQueries({ queryKey: ['clinical-snapshots', caseId] });
      }
      toast.success('Progress updated');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message ?? 'Failed to update progress'),
  });
};

// ─── Pure Sequence State Resolver (No Server State) ───────────────────────────

/**
 * useSequenceEngine — Pure derivation hook.
 *
 * Derives current/next/prev steps from the server-fetched plan and
 * a currentStepIndex (from snapshot.sequenceProgress.currentStep).
 *
 * INVARIANT: does NOT hold server data in useState — pure computation.
 *
 * @param plan              - SequencePlan from useSequencePlan
 * @param currentStepIndex  - snapshot.sequenceProgress.currentStep (0-based)
 */
export const useSequenceEngine = (
  plan: SequencePlan | null | undefined,
  currentStepIndex: number
) => {
  // Steps are sorted by order at storage time (service layer enforces this)
  const steps: SequenceStep[] = plan?.steps ?? [];
  const totalSteps = steps.length;

  const currentStep = steps[currentStepIndex] ?? null;
  const nextStep = steps[currentStepIndex + 1] ?? null;
  const prevStep = currentStepIndex > 0 ? steps[currentStepIndex - 1] : null;

  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex >= totalSteps - 1;
  const progress = totalSteps > 0 ? Math.round(((currentStepIndex) / totalSteps) * 100) : 0;

  return {
    currentStep,
    nextStep,
    prevStep,
    currentStepIndex,
    totalSteps,
    isFirst,
    isLast,
    progress,
    hasSequence: totalSteps > 0,
  };
};

// ─── Composite Hook ───────────────────────────────────────────────────────────

/**
 * useSequenceEngineForCase — Unified hook for SnapshotEditor integration.
 *
 * Fetches plan from server, derives navigation state,
 * and exposes the updateProgress mutation.
 *
 * @param caseId           - Orthodontic case ID
 * @param snapshotId       - Current WorkflowSnapshot ID (for progress writes)
 * @param currentStepIndex - snapshot.sequenceProgress.currentStep
 */
export const useSequenceEngineForCase = (
  caseId: string | undefined,
  snapshotId: string | undefined,
  currentStepIndex: number
) => {
  const { data: plan, isLoading } = useSequencePlan(caseId);
  const progressMutation = useUpdateSequenceProgress(caseId);

  const engine = useSequenceEngine(plan, currentStepIndex);

  /**
   * Advance to the next step and persist progress.
   * Non-blocking — chart state is never touched.
   */
  const goNext = async () => {
    if (!snapshotId || engine.isLast) return;
    await progressMutation.mutateAsync({
      snapshotId,
      stepIndex: currentStepIndex + 1,
    });
  };

  /**
   * Go back to the previous step and persist progress.
   */
  const goPrev = async () => {
    if (!snapshotId || engine.isFirst) return;
    await progressMutation.mutateAsync({
      snapshotId,
      stepIndex: currentStepIndex - 1,
    });
  };

  return {
    ...engine,
    plan,
    isLoading,
    isUpdating: progressMutation.isPending,
    goNext,
    goPrev,
  };
};
