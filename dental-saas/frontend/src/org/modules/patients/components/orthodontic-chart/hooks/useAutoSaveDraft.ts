/**
 * useAutoSaveDraft.ts — Phase 6: Auto-Save Draft Hook
 *
 * Writes a recovery draft to the backend every 5 seconds when a visit is active.
 *
 * CONTRACT:
 *   • Fire-and-forget — never blocks clinical workflow
 *   • chartState + notes are serialized verbatim (no diffing)
 *   • Hook is a no-op when visitId is null (no active visit)
 *   • Interval resets when visitId changes (new session)
 *
 * RULES:
 *   ❌ NO localStorage — drafts stored server-side (org DB)
 *   ❌ NO React Query mutation — intentionally bypasses cache layer
 *      (draft saves are too frequent and must never trigger re-renders)
 *   ✅ Direct api call — post-and-forget
 */

import { useEffect, useRef } from 'react';
import { saveDraft } from '../api/visitDraft.api';

const SAVE_INTERVAL_MS = 5_000;

interface AutoSaveDraftOptions {
  visitId:    string | null | undefined;
  chartState: Record<string, unknown>;
  notes:      string;
  /** Optional: suppress saves when visit is not in 'active' status */
  enabled?:   boolean;
}

export default function useAutoSaveDraft({
  visitId,
  chartState,
  notes,
  enabled = true,
}: AutoSaveDraftOptions): void {
  // Refs so the interval always captures the latest values without needing
  // to restart (avoids burst of saves on every keystroke / state change)
  const chartStateRef = useRef(chartState);
  const notesRef      = useRef(notes);

  useEffect(() => { chartStateRef.current = chartState; }, [chartState]);
  useEffect(() => { notesRef.current      = notes; },      [notes]);

  useEffect(() => {
    if (!visitId || !enabled) return;

    const interval = setInterval(() => {
      saveDraft(visitId, {
        chartState: chartStateRef.current,
        notes:      notesRef.current,
      });
      // Fire-and-forget — errors already swallowed inside saveDraft()
    }, SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [visitId, enabled]);
  // chartState / notes are NOT in deps — refs handle freshness without restart
}
