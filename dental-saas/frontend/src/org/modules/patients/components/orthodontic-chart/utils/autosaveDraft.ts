/**
 * autosaveDraft.ts
 * ═══════════════════════════════════════════════════════════════════════
 * Full-payload draft persistence layer (IndexedDB).
 *
 * PURPOSE:
 *   The patch queue (useWorkflowPatchQueue) persists only the DIFF that
 *   needs to be sent to the server. If the server is unreachable for a
 *   long time the user still needs their full local data on reload.
 *   This layer stores the full workflow payload in IndexedDB as a draft
 *   so it can be restored instantly even before the server responds.
 *
 * LIFECYCLE:
 *   1. updateRecordSet() → saveDraft(caseId, payload)    (every change)
 *   2. On mount          → loadDraft(caseId) → pre-hydrate latestRecordSetRef
 *   3. On successful server save → clearDraft(caseId)
 *
 * FALLBACK:
 *   If idb is unavailable (SSR, private browsing, storage quota) all
 *   functions degrade gracefully to no-ops — the patch queue's
 *   localStorage persist still provides last-job recovery.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { getAutosaveDB } from './autosaveDb';

// ── Serialisable draft shape ────────────────────────────────────────────────────

export interface WorkflowDraft {
  /** UTC timestamp of the last local write — used for staleness check */
  savedAt:      number;
  /** The full workflow payload as built by buildWorkflowPayload() */
  recordSets:   unknown[];
  currentStep?: number;
  treatmentGoals?:   unknown[];
  treatmentOptions?: unknown[];
  selectedOptionId?: string | null;
}

// ── saveDraft ──────────────────────────────────────────────────────────────────

/**
 * Persist the full workflow payload locally.
 * Silently ignores errors (never blocks the UI).
 */
export async function saveDraft(caseId: string, draft: WorkflowDraft): Promise<void> {
  if (!caseId) return;
  try {
    const db = await getAutosaveDB();
    await db.put('drafts', draft, caseId);
  } catch (err) {
    // Storage quota exceeded or idb unavailable — degrade silently
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AutosaveDraft] saveDraft failed (degraded):', err);
    }
  }
}

// ── loadDraft ──────────────────────────────────────────────────────────────────

/**
 * Load the locally-persisted draft for a case.
 * Returns null if no draft exists or on any error.
 * Validates that the draft is not stale (default: 24h).
 */
export async function loadDraft(
  caseId: string,
  maxAgeMs = 24 * 60 * 60 * 1000   // 24 hours
): Promise<WorkflowDraft | null> {
  if (!caseId) return null;
  try {
    const db = await getAutosaveDB();
    const draft = await db.get('drafts', caseId) as WorkflowDraft | undefined;

    if (!draft) return null;

    // Reject stale drafts (older than maxAgeMs)
    if (Date.now() - draft.savedAt > maxAgeMs) {
      await db.delete('drafts', caseId);
      return null;
    }

    return draft;
  } catch {
    return null;
  }
}

// ── clearDraft ─────────────────────────────────────────────────────────────────

/**
 * Remove the draft once the server has successfully persisted the data.
 * Call from autosave onSuccess handler.
 */
export async function clearDraft(caseId: string): Promise<void> {
  if (!caseId) return;
  try {
    const db = await getAutosaveDB();
    await db.delete('drafts', caseId);
  } catch {
    // ignore
  }
}
