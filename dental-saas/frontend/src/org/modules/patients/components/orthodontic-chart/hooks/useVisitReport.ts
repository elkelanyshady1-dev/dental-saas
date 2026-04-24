/**
 * useVisitReport.ts — React Query hooks for Visit Reports & Recalls
 * Domain: orthodontic-visits
 * Layer: Frontend > Hooks
 *
 * Provides:
 *   - useVisitTimeline(caseId)   → list of visit card DTOs
 *   - useVisitReport(visitId)    → full read-only visit report
 *   - useCreateRecall()          → mutation to create recall draft
 *
 * RULES:
 *   ✅ React Query = Server State Authority
 *   ❌ No useState(apiData) — FORBIDDEN
 *   ❌ No manual refetch() — use invalidateQueries
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QK } from '@/lib/query';
import {
  getVisitTimeline,
  getVisitReport,
  createRecall,
  type VisitCardDTO,
  type VisitReportDTO,
  type CreateRecallPayload,
  type RecallDTO,
} from '../api/visitReport.api';

// ── Visit Timeline (card list for a case) ─────────────────────────────────

export function useVisitTimeline(caseId: string | null | undefined) {
  return useQuery({
    queryKey: QK.visitReports.timeline(caseId),
    queryFn: async () => {
      if (!caseId) return { visits: [] as VisitCardDTO[], meta: { total: 0, page: 1, limit: 20, pages: 0 } };
      return getVisitTimeline(caseId);
    },
    enabled: !!caseId,
    staleTime: 60_000,
    placeholderData: (prev: any) => prev,
  });
}

// ── Single Visit Report (full read-only) ──────────────────────────────────

export function useVisitReport(visitId: string | null | undefined) {
  return useQuery({
    queryKey: QK.visitReports.report(visitId),
    queryFn: async () => {
      if (!visitId) return null;
      return getVisitReport(visitId);
    },
    enabled: !!visitId,
    staleTime: 5 * 60_000, // reports are immutable — 5 min stale
  });
}

// ── Create Recall (mutation) ──────────────────────────────────────────────

export function useCreateRecall() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateRecallPayload): Promise<RecallDTO> => {
      return createRecall(payload);
    },
    onSuccess: (_data, variables) => {
      // Invalidate the visit timeline to reflect the new recall
      qc.invalidateQueries({ queryKey: QK.visitReports.all });
      // Also invalidate the specific visit report
      qc.invalidateQueries({ queryKey: QK.visitReports.report(variables.visitId) });
      // Cross-domain: invalidate the Recalls domain page list + stats
      qc.invalidateQueries({ queryKey: QK.recalls.all });
    },
  });
}
