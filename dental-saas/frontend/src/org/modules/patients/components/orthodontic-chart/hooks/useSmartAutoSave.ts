/**
 * useSmartAutoSave.ts — Phase 6B: Smart Debounced Auto-Save
 *
 * REPLACES the naive setInterval approach from Phase 6.
 *
 * IMPROVEMENTS OVER Phase 6:
 *   ✅ Change-detection (content hash) — no API spam when state unchanged
 *   ✅ Tab visibility guard — skip save when tab is hidden
 *   ✅ Debounce (2s) — batches rapid changes into single save
 *   ✅ Save status feedback (idle | saving | saved | error)
 *   ✅ Payload size guard — skip when state is abnormally large
 *   ❌ NO interval — purely reactive to data changes
 *
 * CONTRACT:
 *   • Returns { saveStatus } so caller can display save indicator
 *   • saveFn must be an async function that rejects on error
 *   • never blocks rendering — uses useEffect + refs only
 *
 * ARCHITECTURE:
 *   data change → hash compare → debounce 2s → tab check →
 *     size check → saveFn() → status feedback
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { saveDraft } from '../api/visitDraft.api';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Maximum payload size before we skip auto-save (bytes JSON-stringified) */
const MAX_PAYLOAD_BYTES = 512_000; // 500 KB

/** How long to wait after the last data-change before saving (ms) */
const DEBOUNCE_MS = 2_000;

/** How long to show "saved" before returning to "idle" (ms) */
const SAVED_FEEDBACK_MS = 2_500;

interface SmartAutoSaveOptions {
  visitId:    string | null | undefined;
  chartState: Record<string, unknown>;
  notes:      string;
  /** Only runs when enabled — use to gate on activeVisit.status === 'active' */
  enabled?:   boolean;
}

interface SmartAutoSaveResult {
  saveStatus: SaveStatus;
}

export default function useSmartAutoSave({
  visitId,
  chartState,
  notes,
  enabled = true,
}: SmartAutoSaveOptions): SmartAutoSaveResult {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // Stable refs — debounce timer and last-saved hash
  const timeoutRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHashRef     = useRef<string>('');
  const savedTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef     = useRef(false);

  // Stable ref to visitId so save closure always has the freshest value
  const visitIdRef = useRef(visitId);
  useEffect(() => { visitIdRef.current = visitId; }, [visitId]);

  // ── Save function ─────────────────────────────────────────────────────────────
  const save = useCallback(async (data: { chartState: Record<string, unknown>; notes: string }) => {
    const vid = visitIdRef.current;
    if (!vid || isSavingRef.current) return;

    isSavingRef.current = true;
    setSaveStatus('saving');

    try {
      await saveDraft(vid, data);
      setSaveStatus('saved');

      // Auto-reset to idle after feedback window
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), SAVED_FEEDBACK_MS);
    } catch {
      setSaveStatus('error');
    } finally {
      isSavingRef.current = false;
    }
  }, []); // stable — visitIdRef handles freshness

  // ── Change detection + debounce ───────────────────────────────────────────────
  useEffect(() => {
    if (!visitId || !enabled) return;

    // Compute content hash — cheap JSON stringify
    let hash: string;
    try {
      hash = JSON.stringify({ chartState, notes });
    } catch {
      return; // circular refs — skip
    }

    // Skip if nothing changed since last save
    if (hash === lastHashRef.current) return;

    // Skip if payload is too large (abnormal state — don't spam the server)
    if (hash.length > MAX_PAYLOAD_BYTES) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[SmartAutoSave] Payload too large — skipping autosave', hash.length);
      }
      return;
    }

    // Clear any pending debounce
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(async () => {
      // ── Tab visibility guard — don't save when tab is hidden ──────────────
      if (document.hidden) return;

      // Capture snapshot of data at debounce resolution time
      const data = { chartState, notes };
      lastHashRef.current = hash;
      await save(data);
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartState, notes, visitId, enabled]);
  // 'save' intentionally excluded — it's stable via useCallback

  // ── Cleanup on unmount ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timeoutRef.current)  clearTimeout(timeoutRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  return { saveStatus };
}
