/**
 * clinicalChannel.ts — Zero-Trust BroadcastChannel for Clinical Event Domain
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE (Phase 8 — Multi-Tab Safety)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * RULES (mirroring planChannel.js — NON-NEGOTIABLE):
 *   RULE 1 — Events carry NO clinical data payload (zero-trust)
 *   RULE 2 — Receivers must invalidateQueries → refetch API → render
 *   RULE 3 — Events carry ONLY { type, eventId, caseId }
 *   RULE 4 — Single shared channel instance ('clinical-events')
 *   RULE 5 — Dedup on receive via processedEventIds
 *   RULE 6 — Conflict detection for same-case multi-tab edits
 *
 * ❌ FORBIDDEN:
 *   channel.postMessage({ tads: [...] })            // data payload
 *   channel.postMessage({ chartState: {...} })      // state leak
 *
 * ✅ ALLOWED:
 *   channel.postMessage({ type: 'CLINICAL_EVENT_DISPATCHED', eventId, caseId })
 *
 * FLOW:
 *   Tab A dispatches event
 *     → reducer applies locally
 *     → emitClinicalEvent(eventId, caseId) broadcasts to other tabs
 *     → Tab B receives
 *       → checks processedEventIds (dedup)
 *       → invalidateQueries → refetch → render
 *
 * @per-org-safe — no patient data crosses the channel
 */

import { useEffect, useCallback, useRef } from 'react';

// ─── Channel Singleton ───────────────────────────────────────────────────────

let _channel: BroadcastChannel | null = null;

function _getChannel(): BroadcastChannel | null {
  if (!_channel && typeof BroadcastChannel !== 'undefined') {
    _channel = new BroadcastChannel('clinical-events');
  }
  return _channel;
}

// ─── Event Types (exhaustive — no arbitrary strings) ─────────────────────────

export const CLINICAL_CHANNEL_EVENTS = {
  /** A clinical event was dispatched and applied in another tab */
  EVENT_DISPATCHED: 'CLINICAL_EVENT_DISPATCHED',
  /** A snapshot was saved/promoted in another tab */
  SNAPSHOT_SAVED:   'CLINICAL_SNAPSHOT_SAVED',
  /** A visit session started/ended in another tab */
  VISIT_CHANGED:    'CLINICAL_VISIT_CHANGED',
  /** Phase 8 PART 3: A tab has claimed write-lock on a case */
  CASE_OPENED:      'CLINICAL_CASE_OPENED',
  /** Phase 8 PART 3: A tab has released write-lock on a case */
  CASE_CLOSED:      'CLINICAL_CASE_CLOSED',
} as const;

type ClinicalChannelEventType = typeof CLINICAL_CHANNEL_EVENTS[keyof typeof CLINICAL_CHANNEL_EVENTS];

/** Allowed message shape — ZERO data payload */
interface ClinicalChannelMessage {
  type:     ClinicalChannelEventType;
  eventId:  string;
  caseId:   string;
  tabId:    string;  // sender's tab identity for conflict detection
}

// ─── Write Lock State (Phase 8 PART 3: Single-Writer Enforcement) ────────────
/**
 * Tracks which tab holds the write-lock for each case.
 * Only one tab may dispatch clinical events for a given case at a time.
 * Other tabs viewing the same case are forced into READ-ONLY mode.
 *
 * INVARIANT: The tab that claims the lock is the ONLY writer.
 *            Other tabs MUST invalidateQueries on remote events instead of dispatching.
 */
const _caseWriteLocks = new Map<string, { tabId: string; claimedAt: number }>();

/**
 * Check if this tab holds the write lock for a case.
 * Returns true if this tab is the writer OR if no lock exists (first writer wins).
 */
export function isWriteLockedByOtherTab(caseId: string): boolean {
  const lock = _caseWriteLocks.get(caseId);
  if (!lock) return false; // no lock — anyone can write
  return lock.tabId !== TAB_ID;
}

/**
 * Check if this tab is the active writer for a case.
 */
export function isActiveWriter(caseId: string): boolean {
  const lock = _caseWriteLocks.get(caseId);
  if (!lock) return true; // no lock claimed — first writer wins
  return lock.tabId === TAB_ID;
}

/**
 * Get the tab ID of the current write-lock holder for a case.
 * Returns null if no lock is held.
 */
export function getWriteLockHolder(caseId: string): string | null {
  return _caseWriteLocks.get(caseId)?.tabId ?? null;
}

// ─── Tab Identity ────────────────────────────────────────────────────────────

/** Unique tab identifier. Survives page reloads via sessionStorage. */
const TAB_ID: string = (() => {
  const KEY = '__clinical_tab_id__';
  if (typeof sessionStorage === 'undefined') return 'ssr';
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(KEY, id);
  }
  return id;
})();

// ─── Emit (Sender) ──────────────────────────────────────────────────────────

/**
 * emitClinicalEvent
 *
 * Broadcasts that a clinical event was dispatched in THIS tab.
 * Other tabs receive it and invalidate their queries.
 *
 * Zero-trust: carries only type, eventId, caseId, tabId. NO data.
 *
 * Call AFTER the local reducer has applied the event and queryClient.invalidateQueries
 * has been called locally.
 */
export function emitClinicalEvent(eventId: string, caseId: string): void {
  const channel = _getChannel();
  if (!channel) return;

  const msg: ClinicalChannelMessage = {
    type:    CLINICAL_CHANNEL_EVENTS.EVENT_DISPATCHED,
    eventId,
    caseId,
    tabId:   TAB_ID,
  };

  channel.postMessage(msg);
}

/**
 * emitSnapshotSaved
 *
 * Broadcasts that a snapshot was saved in THIS tab.
 */
export function emitSnapshotSaved(snapshotId: string, caseId: string): void {
  const channel = _getChannel();
  if (!channel) return;

  channel.postMessage({
    type:    CLINICAL_CHANNEL_EVENTS.SNAPSHOT_SAVED,
    eventId: snapshotId,
    caseId,
    tabId:   TAB_ID,
  });
}

/**
 * emitVisitChanged
 *
 * Broadcasts that a visit session changed in THIS tab.
 */
export function emitVisitChanged(visitId: string, caseId: string): void {
  const channel = _getChannel();
  if (!channel) return;

  channel.postMessage({
    type:    CLINICAL_CHANNEL_EVENTS.VISIT_CHANGED,
    eventId: visitId,
    caseId,
    tabId:   TAB_ID,
  });
}

// ─── Write Lock Emitters (Phase 8 PART 3) ───────────────────────────────────

/**
 * emitCaseOpened
 *
 * Claims write-lock for this tab on a case.
 * Other tabs receiving this will enter read-only mode for that case.
 * Call when a visit session starts or when the editor is opened for editing.
 */
export function emitCaseOpened(caseId: string): void {
  // Claim local lock immediately
  _caseWriteLocks.set(caseId, { tabId: TAB_ID, claimedAt: Date.now() });

  const channel = _getChannel();
  if (!channel) return;

  channel.postMessage({
    type:    CLINICAL_CHANNEL_EVENTS.CASE_OPENED,
    eventId: `lock-${TAB_ID}-${Date.now()}`,
    caseId,
    tabId:   TAB_ID,
  });
}

/**
 * emitCaseClosed
 *
 * Releases write-lock for this tab on a case.
 * Other tabs can then claim the lock.
 * Call when a visit session ends or the editor is closed.
 */
export function emitCaseClosed(caseId: string): void {
  const lock = _caseWriteLocks.get(caseId);
  // Only release if this tab holds the lock
  if (lock?.tabId === TAB_ID) {
    _caseWriteLocks.delete(caseId);
  }

  const channel = _getChannel();
  if (!channel) return;

  channel.postMessage({
    type:    CLINICAL_CHANNEL_EVENTS.CASE_CLOSED,
    eventId: `unlock-${TAB_ID}-${Date.now()}`,
    caseId,
    tabId:   TAB_ID,
  });
}

// ─── Receive (Listener Hook) ────────────────────────────────────────────────

interface ClinicalChannelCallbacks {
  /** Called when another tab dispatches a clinical event for the same case */
  onRemoteEvent?: (eventId: string) => void;
  /** Called when another tab saves a snapshot for the same case */
  onRemoteSnapshot?: (snapshotId: string) => void;
  /** Called when another tab changes a visit for the same case */
  onRemoteVisit?: (visitId: string) => void;
  /** Called when the same case is open in multiple tabs (conflict warning) */
  onConflictDetected?: (remoteTabId: string) => void;
  /** Phase 8 PART 3: Called when this tab is forced into read-only mode */
  onWriteLockLost?: (writerTabId: string) => void;
  /** Phase 8 PART 3: Called when the remote writer releases the lock */
  onWriteLockReleased?: () => void;
}

/**
 * useClinicalChannelListener
 *
 * React hook — listens for clinical events from other tabs.
 *
 * Zero-trust validation:
 *   - Only accepts known event types
 *   - Rejects messages with unexpected keys (data payload guard)
 *   - Deduplicates via processedEventIds
 *   - Ignores own tab's messages
 *   - Filters by caseId (only processes events for the active case)
 *
 * Cleanup: removes listener on unmount (channel stays open — singleton).
 *
 * @param caseId    — the case ID this component is viewing
 * @param callbacks — handlers for remote events
 */
export function useClinicalChannelListener(
  caseId: string | null,
  callbacks: ClinicalChannelCallbacks,
): void {
  // Dedup registry scoped to this hook instance
  const processedRef = useRef(new Set<string>());

  const stableCallbacks = useRef(callbacks);
  stableCallbacks.current = callbacks;

  const handleMessage = useCallback((event: MessageEvent) => {
    const data = event?.data as ClinicalChannelMessage | undefined;
    if (!data || typeof data !== 'object') return;

    // ── Zero-trust: only accept known event types ─────────────────────────
    const validTypes = new Set(Object.values(CLINICAL_CHANNEL_EVENTS));
    if (!validTypes.has(data.type as ClinicalChannelEventType)) return;

    // ── Zero-trust: reject messages with unexpected payload keys ──────────
    const allowedKeys = new Set(['type', 'eventId', 'caseId', 'tabId']);
    const receivedKeys = Object.keys(data);
    if (receivedKeys.some(k => !allowedKeys.has(k))) {
      console.error('[clinicalChannel] SECURITY: Rejected message with unexpected keys:', receivedKeys);
      return;
    }

    // ── Ignore own tab's messages ────────────────────────────────────────
    if (data.tabId === TAB_ID) return;

    // ── Ignore messages for other cases ──────────────────────────────────
    if (!caseId || data.caseId !== caseId) return;

    // ── Dedup: skip already-processed eventIds ───────────────────────────
    if (processedRef.current.has(data.eventId)) return;
    processedRef.current.add(data.eventId);

    // Cap the dedup registry
    if (processedRef.current.size > 5000) {
      const arr = Array.from(processedRef.current);
      processedRef.current = new Set(arr.slice(-2500));
    }

    // ── Conflict detection: same case open in multiple tabs ──────────────
    stableCallbacks.current.onConflictDetected?.(data.tabId);

    // ── Dispatch to appropriate handler ──────────────────────────────────
    switch (data.type) {
      case CLINICAL_CHANNEL_EVENTS.EVENT_DISPATCHED:
        stableCallbacks.current.onRemoteEvent?.(data.eventId);
        break;
      case CLINICAL_CHANNEL_EVENTS.SNAPSHOT_SAVED:
        stableCallbacks.current.onRemoteSnapshot?.(data.eventId);
        break;
      case CLINICAL_CHANNEL_EVENTS.VISIT_CHANGED:
        stableCallbacks.current.onRemoteVisit?.(data.eventId);
        break;
      // Phase 8 PART 3: Write-lock protocol
      case CLINICAL_CHANNEL_EVENTS.CASE_OPENED:
        // Another tab claimed the write lock — this tab becomes read-only
        _caseWriteLocks.set(data.caseId, { tabId: data.tabId, claimedAt: Date.now() });
        stableCallbacks.current.onWriteLockLost?.(data.tabId);
        break;
      case CLINICAL_CHANNEL_EVENTS.CASE_CLOSED:
        // Remote writer released the lock — this tab can now claim write access
        if (_caseWriteLocks.get(data.caseId)?.tabId === data.tabId) {
          _caseWriteLocks.delete(data.caseId);
          stableCallbacks.current.onWriteLockReleased?.();
        }
        break;
    }
  }, [caseId]);

  useEffect(() => {
    const channel = _getChannel();
    if (!channel) return;

    channel.addEventListener('message', handleMessage);

    // ── MANDATORY CLEANUP (Rules Engine requirement) ──────────────────────
    return () => {
      channel.removeEventListener('message', handleMessage);
    };
  }, [handleMessage]);
}

/**
 * Returns the current tab's unique ID.
 * Useful for conflict resolution UIs ("Tab xyz is also editing this case").
 */
export function getCurrentTabId(): string {
  return TAB_ID;
}
