/**
 * visitDraft.api.ts — Phase 6: Auto-Save Draft API
 *
 * Communicates with:
 *   POST  /api/v1/org/visit-sessions/:visitId/draft  → saveDraft
 *   GET   /api/v1/org/visit-sessions/:visitId/draft  → getDraft
 */

import api from '@/services/api';

const BASE = '/org/visit-sessions';

export interface VisitDraft {
  _id:           string;
  visitId:       string;
  organizationId: string;
  chartState:    Record<string, unknown>;
  notes:         string;
  savedAt:       string;  // ISO date
  updatedAt:     string;
}

interface DraftResponse {
  success: boolean;
  data: { draft: VisitDraft | null };
}

// ── POST /visit-sessions/:visitId/draft ────────────────────────────────────────
/**
 * Fire-and-forget auto-save. Errors are swallowed — draft save failure
 * must NEVER block clinical workflow.
 */
export async function saveDraft(
  visitId: string,
  payload: { chartState: Record<string, unknown>; notes: string }
): Promise<void> {
  try {
    await api.post<DraftResponse>(`${BASE}/${visitId}/draft`, payload);
  } catch {
    // Non-fatal — draft save is best-effort
  }
}

// ── GET /visit-sessions/:visitId/draft ─────────────────────────────────────────
/**
 * Fetches the crash-recovery draft for a visit, or null if none exists.
 * Called once on session open to check if a previous session crashed.
 */
export async function getDraft(visitId: string): Promise<VisitDraft | null> {
  try {
    const res = await api.get<DraftResponse>(
      `${BASE}/${visitId}/draft`,
      { silent: true } as any
    );
    return res.data.data.draft ?? null;
  } catch {
    return null;
  }
}
