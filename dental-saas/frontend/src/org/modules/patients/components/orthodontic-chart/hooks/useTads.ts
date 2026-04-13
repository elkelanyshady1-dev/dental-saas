/**
 * useTads.ts — TADs Engine React Query Hooks
 *
 * SERVER STATE LAW: All data is managed via React Query.
 * ❌ No useState(apiData)
 * ✅ useQuery + useMutation + invalidateQueries
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tadsApi, type Tad } from '../api/tads.api';
// Lightweight toast shim — replace with project notification system if available
const toast = {
  success: (msg: string) => console.info('[TADs] ✅', msg),
  error: (msg: string) => console.error('[TADs] ❌', msg),
  warning: (msg: string) => console.warn('[TADs] ⚠️', msg),
};


// ─── Query Keys ───────────────────────────────────────────────────────────────

export const tadKeys = {
  all: ['tads'] as const,
  byCase: (caseId: string) => ['tads', 'case', caseId] as const,
  detail: (id: string) => ['tads', 'detail', id] as const,
  failureRate: (caseId: string) => ['tads', 'failure-rate', caseId] as const,
  settings: () => ['tads', 'settings'] as const,
};

// ─── ObjectId Guard ───────────────────────────────────────────────────────────
// MongoDB ObjectIds are 24-char hex strings. `enabled: !!caseId` lets any
// truthy string through (e.g. 'case-001'). This guard prevents invalid API calls.
const isValidObjectId = (id: string | undefined): id is string =>
  typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useTadsByCase(caseId: string | undefined) {
  return useQuery({
    queryKey: tadKeys.byCase(caseId ?? ''),
    queryFn: async () => {
      const res = await tadsApi.listByCase(caseId!);
      return res.data.data;
    },
    enabled: isValidObjectId(caseId),
    staleTime: 30_000,
  });
}

export function useTadById(id: string | undefined) {
  return useQuery({
    queryKey: tadKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await tadsApi.getById(id!);
      return res.data.data;
    },
    enabled: isValidObjectId(id),
  });
}

export function useTadFailureRate(caseId: string | undefined) {
  return useQuery({
    queryKey: tadKeys.failureRate(caseId ?? ''),
    queryFn: async () => {
      const res = await tadsApi.getFailureRate(caseId!);
      return res.data.data;
    },
    enabled: isValidObjectId(caseId),
    staleTime: 60_000,
  });
}

export function useTadSettings() {
  return useQuery({
    queryKey: tadKeys.settings(),
    queryFn: async () => {
      const res = await tadsApi.getSettings();
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateTad(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: tadsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tadKeys.byCase(caseId) });
      qc.invalidateQueries({ queryKey: tadKeys.failureRate(caseId) });
      toast.success('Miniscrew placed successfully');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Failed to place miniscrew'),
  });
}

export function useMarkTadForRemoval(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { reason?: string; healingWeeks?: number; notes?: string } }) =>
      tadsApi.markForRemoval(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: tadKeys.byCase(caseId) });
      qc.invalidateQueries({ queryKey: tadKeys.detail(id) });
      toast.warning('TAD flagged for removal');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Action failed'),
  });
}

export function useRemoveTad(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { reason?: string; healingWeeks?: number; notes?: string } }) =>
      tadsApi.remove(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: tadKeys.byCase(caseId) });
      qc.invalidateQueries({ queryKey: tadKeys.detail(id) });
      qc.invalidateQueries({ queryKey: tadKeys.failureRate(caseId) });
      toast.success('TAD removed');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Action failed'),
  });
}

export function useFailTad(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { reason?: string; notes?: string } }) =>
      tadsApi.fail(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: tadKeys.byCase(caseId) });
      qc.invalidateQueries({ queryKey: tadKeys.detail(id) });
      qc.invalidateQueries({ queryKey: tadKeys.failureRate(caseId) });
      toast.error('TAD failure recorded');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Action failed'),
  });
}

export function useRemoveAllTads(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => tadsApi.removeAll(caseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tadKeys.byCase(caseId) });
      qc.invalidateQueries({ queryKey: tadKeys.failureRate(caseId) });
      toast.success('All TADs removed');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Bulk remove failed'),
  });
}

export function useReinsertTad(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: { position?: string; positionLabel?: string; notes?: string } }) =>
      tadsApi.reinsert(id, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: tadKeys.byCase(caseId) });
      qc.invalidateQueries({ queryKey: tadKeys.detail(id) });
      qc.invalidateQueries({ queryKey: tadKeys.failureRate(caseId) });
      toast.success('TAD reinserted successfully');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Action failed'),
  });
}
