/**
 * useTreatmentPlanVersions.ts — React Query hooks for Orthodontic Treatment Plan Versioning
 *
 * SERVER STATE LAW:
 *   ✅ useQuery for all reads
 *   ✅ useMutation + invalidateQueries for writes
 *   ❌ No useState(apiData), no refetch(), no window.location.reload()
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  treatmentPlanVersionApi,
  type TreatmentPlanVersion,
  type TreatmentPlanVersionListItem,
  type PlanCompareResult,
  type CreateDraftPayload,
  type EditDraftPayload,
  type CreateRevisionPayload,
} from '../api/treatmentPlanVersion.api';

const isValidObjectId = (id: string | undefined | null): id is string =>
  typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

// ─── Query Keys (centralized registry — see CLAUDE.md §11.2) ─────────────────

export const PLAN_VERSION_KEYS = {
  all:      ['planVersions'] as const,
  byCase:   (caseId: string) => ['planVersions', 'case', caseId] as const,
  active:   (caseId: string) => ['planVersions', 'active', caseId] as const,
  approved: (caseId: string) => ['planVersions', 'approved', caseId] as const,
  single:   (caseId: string, versionId: string) => ['planVersions', 'single', caseId, versionId] as const,
  compare:  (caseId: string, from: string, to: string) => ['planVersions', 'compare', caseId, from, to] as const,
};

// ─── Read Hooks ──────────────────────────────────────────────────────────────

export const useTreatmentPlanVersions = (caseId: string | undefined) =>
  useQuery<TreatmentPlanVersionListItem[]>({
    queryKey: PLAN_VERSION_KEYS.byCase(caseId ?? ''),
    queryFn:  () => treatmentPlanVersionApi.list(caseId!),
    enabled:  isValidObjectId(caseId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

export const useActivePlanVersion = (caseId: string | undefined) =>
  useQuery<TreatmentPlanVersion | null>({
    queryKey: PLAN_VERSION_KEYS.active(caseId ?? ''),
    queryFn:  () => treatmentPlanVersionApi.getActive(caseId!),
    enabled:  isValidObjectId(caseId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

export const useApprovedPlanVersion = (caseId: string | undefined) =>
  useQuery<TreatmentPlanVersion | null>({
    queryKey: PLAN_VERSION_KEYS.approved(caseId ?? ''),
    queryFn:  () => treatmentPlanVersionApi.getApproved(caseId!),
    enabled:  isValidObjectId(caseId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

export const usePlanVersion = (caseId: string | undefined, versionId: string | undefined) =>
  useQuery<TreatmentPlanVersion>({
    queryKey: PLAN_VERSION_KEYS.single(caseId ?? '', versionId ?? ''),
    queryFn:  () => treatmentPlanVersionApi.getOne(caseId!, versionId!),
    enabled:  isValidObjectId(caseId) && isValidObjectId(versionId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

export const useComparePlanVersions = (
  caseId: string | undefined,
  from: string | undefined,
  to: string | undefined,
) =>
  useQuery<PlanCompareResult>({
    queryKey: PLAN_VERSION_KEYS.compare(caseId ?? '', from ?? '', to ?? ''),
    queryFn:  () => treatmentPlanVersionApi.compare(caseId!, from!, to!),
    enabled:  isValidObjectId(caseId) && isValidObjectId(from) && isValidObjectId(to),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

// ─── Mutation Hooks ──────────────────────────────────────────────────────────

function _invalidateAll(qc: ReturnType<typeof useQueryClient>, caseId: string | undefined) {
  if (!caseId) return;
  qc.invalidateQueries({ queryKey: PLAN_VERSION_KEYS.byCase(caseId) });
  qc.invalidateQueries({ queryKey: PLAN_VERSION_KEYS.active(caseId) });
  qc.invalidateQueries({ queryKey: PLAN_VERSION_KEYS.approved(caseId) });
}

export const useCreateDraft = (caseId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDraftPayload) => treatmentPlanVersionApi.createDraft(caseId!, payload),
    onSuccess: () => _invalidateAll(qc, caseId),
  });
};

export const useEditDraft = (caseId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, payload }: { versionId: string; payload: EditDraftPayload }) =>
      treatmentPlanVersionApi.editDraft(caseId!, versionId, payload),
    onSuccess: () => _invalidateAll(qc, caseId),
  });
};

export const useDeleteDraft = (caseId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => treatmentPlanVersionApi.deleteDraft(caseId!, versionId),
    onSuccess: () => _invalidateAll(qc, caseId),
  });
};

export const useApprovePlan = (caseId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) => treatmentPlanVersionApi.approve(caseId!, versionId),
    onSuccess: () => _invalidateAll(qc, caseId),
  });
};

export const useCreateRevision = (caseId: string | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRevisionPayload) => treatmentPlanVersionApi.createRevision(caseId!, payload),
    onSuccess: () => _invalidateAll(qc, caseId),
  });
};
