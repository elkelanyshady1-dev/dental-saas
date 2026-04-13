/**
 * useBonding.ts — Bonding Engine React Query Hooks
 *
 * SERVER STATE LAW (per architecture rules):
 *   ✅ useQuery  — for all reads
 *   ✅ useMutation + invalidateQueries — for all writes
 *   ❌ useState(apiData)  — FORBIDDEN
 *   ❌ refetch()          — FORBIDDEN
 *   ❌ window.location.reload() — FORBIDDEN
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  bondingApi,
  type ApplyBondingPayload,
  type DebondPayload,
  type RepositionPayload,
  type Bonding,
  type BondingSettings,
} from '../api/bonding.api';

// Lightweight toast shim — replace with project notification system if available
const toast = {
  success: (msg: string) => console.info('[Bonding] ✅', msg),
  error: (msg: string) => console.error('[Bonding] ❌', msg),
};

// ─── ObjectId Guard ───────────────────────────────────────────────────────────
// MongoDB ObjectIds are 24-char hex strings. React Query's `enabled: !!caseId`
// passes any truthy string (including placeholders like 'case-001').
// This guard prevents invalid API calls that would return 400 errors.
const isValidObjectId = (id: string | undefined): id is string =>
  typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

// ─── Query Keys ────────────────────────────────────────────────────────────────

export const BONDING_KEYS = {
  byCase: (caseId: string) => ['bonding', 'case', caseId] as const,
  analytics: (caseId: string) => ['bonding', 'analytics', caseId] as const,
  settings: () => ['bonding', 'settings'] as const,
};

// ─── Read Hooks ────────────────────────────────────────────────────────────────

/**
 * Get all bondings for a case.
 * Auto-refreshes through React Query cache invalidation.
 */
export const useBondingsByCase = (caseId: string | undefined) => {
  return useQuery<Bonding[]>({
    queryKey: BONDING_KEYS.byCase(caseId ?? ''),
    queryFn: () => bondingApi.getByCase(caseId!),
    enabled: isValidObjectId(caseId),
    staleTime: 30_000,
  });
};

/**
 * Get debond rate analytics for a case.
 */
export const useDebondRate = (caseId: string | undefined) => {
  return useQuery({
    queryKey: BONDING_KEYS.analytics(caseId ?? ''),
    queryFn: () => bondingApi.getDebondRate(caseId!),
    enabled: isValidObjectId(caseId),
    staleTime: 60_000,
  });
};

/**
 * Get org bonding settings.
 */
export const useBondingSettings = () => {
  return useQuery<BondingSettings>({
    queryKey: BONDING_KEYS.settings(),
    queryFn: () => bondingApi.getSettings(),
    staleTime: 5 * 60_000, // settings change rarely
  });
};

// ─── Mutation Hooks ────────────────────────────────────────────────────────────

/**
 * Apply bonding to one or more teeth.
 * Handles both new BONDED and REBONDED cases on the backend.
 */
export const useApplyBonding = (caseId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ApplyBondingPayload) => bondingApi.apply(payload),

    // ── Optimistic Update ────────────────────────────────────────────────────
    // Immediately inject synthetic ACTIVE bonding records into the cache so
    // the chart visual and OPG BONDED column update without waiting for the
    // server round-trip. Rolled back on error via `context.previousBondings`.
    onMutate: async (payload: ApplyBondingPayload) => {
      if (!caseId) return {};

      // Cancel any in-flight refetches to avoid race conditions
      await qc.cancelQueries({ queryKey: BONDING_KEYS.byCase(caseId) });

      // Snapshot the current cache value for rollback
      const previousBondings = qc.getQueryData<Bonding[]>(BONDING_KEYS.byCase(caseId)) ?? [];

      // Build synthetic bonding records to inject optimistically
      const now = new Date().toISOString();
      const optimisticBondings: Bonding[] = payload.teeth.map((tooth) => ({
        _id:             `optimistic-${tooth}-${Date.now()}`,
        organizationId:  '',
        caseId:          payload.caseId,
        patientId:       payload.patientId,
        snapshotId:      payload.snapshotId ?? null,
        tooth,
        type:            payload.type ?? (tooth % 10 >= 6 ? 'TUBE' : 'BRACKET'),
        prescription:    payload.prescription ?? null,
        slot:            payload.slot ?? null,
        bondingHeight:   payload.bondingHeight ?? null,
        bondingPosition: payload.bondingPosition ?? null,
        brand:           payload.brand ?? null,
        source:          payload.source ?? { type: 'opg_reference', referenceGroup: null },
        linkedTadIds:    payload.linkedTadIds ?? [],
        status:          'ACTIVE',
        history:         [],
        createdAt:       now,
        updatedAt:       now,
      }));

      // Merge: keep existing non-overlapping bondings + add optimistic ones
      const optimisticTeethSet = new Set(payload.teeth);
      const merged: Bonding[] = [
        ...previousBondings.filter(b => !optimisticTeethSet.has(b.tooth)),
        ...optimisticBondings,
      ];
      qc.setQueryData<Bonding[]>(BONDING_KEYS.byCase(caseId), merged);

      return { previousBondings };
    },

    onSuccess: () => {
      if (caseId) {
        qc.invalidateQueries({ queryKey: BONDING_KEYS.byCase(caseId) });
        qc.invalidateQueries({ queryKey: BONDING_KEYS.analytics(caseId) });
      }
      toast.success('Bonding applied successfully');
    },

    onError: (err: any, _payload, context: any) => {
      // Roll back the optimistic update on failure
      if (caseId && context?.previousBondings) {
        qc.setQueryData<Bonding[]>(BONDING_KEYS.byCase(caseId), context.previousBondings);
      }
      toast.error(err?.response?.data?.error?.message ?? 'Failed to apply bonding');
    },
  });
};

/**
 * Debond a tooth — marks status as DEBONDED + appends event.
 */
export const useDebondTooth = (caseId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bondingId, payload }: { bondingId: string; payload?: DebondPayload }) =>
      bondingApi.debond(bondingId, payload),

    // ── Optimistic Update ─────────────────────────────────────────────────────
    // Immediately flip the bonding to DEBONDED in the cache so the chart
    // removes the bracket visual without waiting for the server round-trip.
    onMutate: async ({ bondingId }) => {
      if (!caseId) return {};
      await qc.cancelQueries({ queryKey: BONDING_KEYS.byCase(caseId) });
      const previousBondings = qc.getQueryData<Bonding[]>(BONDING_KEYS.byCase(caseId)) ?? [];

      qc.setQueryData<Bonding[]>(BONDING_KEYS.byCase(caseId),
        previousBondings.map(b =>
          b._id === bondingId ? { ...b, status: 'DEBONDED' } : b
        )
      );
      return { previousBondings };
    },

    onSuccess: () => {
      if (caseId) {
        qc.invalidateQueries({ queryKey: BONDING_KEYS.byCase(caseId) });
        qc.invalidateQueries({ queryKey: BONDING_KEYS.analytics(caseId) });
      }
      toast.success('Tooth debonded');
    },

    onError: (err: any, _vars, context: any) => {
      if (caseId && context?.previousBondings) {
        qc.setQueryData<Bonding[]>(BONDING_KEYS.byCase(caseId), context.previousBondings);
      }
      toast.error(err?.response?.data?.error?.message ?? 'Debond failed');
    },
  });
};

/**
 * Reposition a bracket — updates height/position + appends event.
 */
export const useRepositionBracket = (caseId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bondingId, payload }: { bondingId: string; payload: RepositionPayload }) =>
      bondingApi.reposition(bondingId, payload),
    onSuccess: () => {
      if (caseId) {
        qc.invalidateQueries({ queryKey: BONDING_KEYS.byCase(caseId) });
      }
      toast.success('Bracket repositioned');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message ?? 'Reposition failed'),
  });
};

/**
 * Update org bonding settings.
 */
export const useUpdateBondingSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: Partial<BondingSettings>) => bondingApi.updateSettings(updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BONDING_KEYS.settings() });
      toast.success('Bonding settings updated');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message ?? 'Failed to update settings'),
  });
};

// ─── FDI Group Map (mirrors PrescriptionOPGModal height tables) ───────────────
// Key = group label (U1..U7, L1..L7), Value = FDI tooth numbers for that group.
// Each group maps to bilaterally symmetric teeth (e.g. U1 → 11 and 21).
const FDI_GROUP_MAP: Record<string, number[]> = {
  U1: [11, 21], U2: [12, 22], U3: [13, 23],
  U4: [14, 24], U5: [15, 25], U6: [16, 26], U7: [17, 27],
  L1: [31, 41], L2: [32, 42], L3: [33, 43],
  L4: [34, 44], L5: [35, 45], L6: [36, 46], L7: [37, 47],
};

// ─── Composite Engine Hook ────────────────────────────────────────────────────

/**
 * useBondingEngine — Unified engine hook for SnapshotEditor integration.
 *
 * Provides:
 *   - applyFromOPG(): maps OPG row click → Bonding Engine payload
 *   - applyBonding(): executes the mutation
 *   - bondings: current case bondings from server state
 *   - settings: org config (brands, slots, thresholds)
 *   - getBondingByGroup(): maps OPG table row → bonded status for live feedback
 */
export const useBondingEngine = (caseId: string | undefined, patientId?: string) => {
  const { data: bondings = [], isLoading: bondingsLoading } = useBondingsByCase(caseId);
  const { data: settings } = useBondingSettings();
  const { data: analytics } = useDebondRate(caseId);
  const applyMutation = useApplyBonding(caseId);

  /**
   * Transform an OPG row click into a Bonding Engine payload.
   * Called by handleBondFromOPG in SnapshotEditor.
   *
   * @param toothIds    - FDI tooth numbers from OPG parseFDI
   * @param prescription - "MBT" | "Roth"
   * @param height      - bonding height in mm from the OPG table
   * @param groupLabel  - "U1", "L6" etc. for source tracking
   * @param linkedTadIds - optional TAD ids near the selected teeth
   */
  const applyFromOPG = (
    caseIdArg: string,
    patientIdArg: string,
    toothIds: number[],
    prescription: string,
    height: number,
    groupLabel: string,
    snapshotId?: string,
    linkedTadIds: string[] = []
  ): ApplyBondingPayload => {
    // Auto-detect TUBE for molars (teeth with FDI position digit ≥ 6)
    const type = toothIds.every((id) => id % 10 >= 6) ? 'TUBE' : 'BRACKET';

    return {
      caseId: caseIdArg,
      patientId: patientIdArg,
      teeth: toothIds,
      type,
      prescription,
      slot: settings?.defaultSlot ?? '0.022',
      bondingHeight: height,
      bondingPosition: 'custom',
      brand: settings?.brands?.[0] ?? '3M',
      source: { type: 'opg_reference', referenceGroup: groupLabel },
      snapshotId,
      linkedTadIds,
    };
  };

  /**
   * Maps OPG table row labels (U1..U7, L1..L7) to live bonded status.
   * Used by PrescriptionOPGModal to show the "Bonded" column.
   *
   * Returns a map: groupLabel → { height, isOverride }
   * Only includes groups that have at least one ACTIVE bonding for that arch group.
   * isOverride = true when source.type === 'manual' (clinician manually overrode the OPG value).
   */
  const getBondingByGroup = (): Record<string, { height: number | null; isOverride: boolean }> => {
    const result: Record<string, { height: number | null; isOverride: boolean }> = {};
    for (const [group, fdiIds] of Object.entries(FDI_GROUP_MAP)) {
      const matched = bondings.filter(
        b => b.status === 'ACTIVE' && fdiIds.includes(b.tooth)
      );
      if (matched.length > 0) {
        // Use first matched tooth's data (bilateral groups have same height)
        const b = matched[0];
        result[group] = {
          height: b.bondingHeight,
          isOverride: b.source?.type === 'manual',
        };
      }
    }
    return result;
  };

  return {
    bondings,
    bondingsLoading,
    settings,
    analytics,
    applyFromOPG,
    applyBonding: applyMutation.mutateAsync,
    isApplying: applyMutation.isPending,
    getBondingByGroup,
  };
};
