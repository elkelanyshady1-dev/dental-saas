/**
 * useRecallDomain.ts — React Query Hooks for Recall Domain
 * Domain: recalls
 * Layer: Frontend > Hooks
 *
 * RULES:
 *   ✅ React Query = Server State Authority
 *   ❌ No useState(apiData) — FORBIDDEN
 *   ❌ No manual refetch() — use invalidateQueries
 */

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { QK } from '@/lib/query';
import {
  getRecalls,
  getRecallStats,
  updateRecallStatus,
  deleteRecall,
  type RecallListFilters,
} from '../api/recallDomain.api';

// ── Recall List (paginated, filtered) ─────────────────────────────────────────

export function useRecallList(
  filters: RecallListFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...QK.recalls.all, 'list', filters],
    queryFn: async () => {
      try {
        return await getRecalls(filters);
      } catch (err: any) {
        // PBAC denies (403) or missing entitlement — treat as empty list rather
        // than crashing the tab. The capability gate still hides the section
        // when the user has no recall role permission at all.
        const status = err?.response?.status ?? err?.status;
        if (status === 403) {
          return { recalls: [], meta: { total: 0, page: 1, limit: 0, pages: 0 } };
        }
        throw err;
      }
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
    retry: (failureCount, err: any) => {
      const status = err?.response?.status ?? err?.status;
      if (status === 403 || status === 401) return false;
      return failureCount < 2;
    },
  });
}

// ── Recall Stats (dashboard counters) ─────────────────────────────────────────

export function useRecallStats() {
  return useQuery({
    queryKey: [...QK.recalls.all, 'stats'],
    queryFn: () => getRecallStats(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000, // auto-refresh every 5 min
  });
}

// ── Update Recall Status (mutation) ───────────────────────────────────────────

export function useUpdateRecallStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ recallId, status, opts }: {
      recallId: string;
      status: string;
      opts?: { bookedAppointmentId?: string; notes?: string };
    }) => {
      return updateRecallStatus(recallId, status, opts);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.recalls.all });
    },
  });
}

// ── Cancel Recall (mutation) ──────────────────────────────────────────────────

export function useCancelRecall() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (recallId: string) => {
      return deleteRecall(recallId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.recalls.all });
    },
  });
}
