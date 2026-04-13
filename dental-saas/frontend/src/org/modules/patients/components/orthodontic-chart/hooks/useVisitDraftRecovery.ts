/**
 * useVisitDraftRecovery.ts — Phase 6: Session Crash Recovery Hook
 *
 * On session open, fetches the draft for the active visit.
 * If a recent draft exists, sets draftAvailable = true so the
 * caller can show the recovery modal.
 *
 * CONTRACT:
 *   • Fetches ONCE when visitId becomes available (enabled flag)
 *   • staleTime: Infinity — we never want this to re-fetch automatically
 *   • After user decides (restore|discard), call clearDraft() to reset state
 *   • Draft is considered STALE if savedAt > 2 hours ago (discard silently)
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDraft, type VisitDraft } from '../api/visitDraft.api';

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

interface DraftRecoveryResult {
  /** true when a recent, usable draft is available for recovery */
  draftAvailable: boolean;
  /** The full draft object if available */
  draft: VisitDraft | null;
  /** Call to remove the draft from cache (after restore or discard) */
  clearDraft: () => void;
  isChecking: boolean;
}

export const DRAFT_QUERY_KEY = (visitId: string) =>
  ['visitDraft', visitId] as const;

export function useVisitDraftRecovery(
  visitId: string | null | undefined
): DraftRecoveryResult {
  const qc = useQueryClient();

  const { data: draft = null, isLoading: isChecking } = useQuery<VisitDraft | null>({
    queryKey: visitId ? DRAFT_QUERY_KEY(visitId) : ['visitDraft', 'none'],
    queryFn:  () => getDraft(visitId!),
    enabled:  !!visitId,
    staleTime: Infinity,   // Only fetch once per session open
    retry:    0,           // Don't retry — null is a valid clean-state answer
  });

  // Draft is usable if it exists AND was saved within the staleness window
  const draftAvailable =
    !!draft &&
    !!draft.savedAt &&
    Date.now() - new Date(draft.savedAt).getTime() < STALE_THRESHOLD_MS;

  const clearDraft = () => {
    if (!visitId) return;
    qc.removeQueries({ queryKey: DRAFT_QUERY_KEY(visitId) });
  };

  return { draftAvailable, draft: draftAvailable ? draft : null, clearDraft, isChecking };
}
