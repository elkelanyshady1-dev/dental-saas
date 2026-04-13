/**
 * caseTabChannel.ts — Per-Case Multi-Tab Detection Channel
 *
 * ROLE:
 *   Detects when the same case is open in more than one browser tab, and
 *   warns the user to prevent conflicting concurrent edits.
 *
 * ARCHITECTURE RULES (mirrors planChannel.js):
 *   RULE 1 — Events carry NO clinical data (zero-trust)
 *   RULE 2 — Receivers MUST validate event type before acting
 *   RULE 3 — One channel PER CASE. Channel name: `case_tab_{caseId}`
 *   RULE 4 — Channels are per-mount (not module-level singletons) because
 *            the channel name depends on caseId — a runtime value.
 *   RULE 5 — Each tab announces itself on mount; listens for announcements
 *            from other tabs; closes the channel on unmount.
 *
 * ❌ FORBIDDEN:
 *   channel.postMessage({ chartState: {...} })    // data payload
 *   channel.postMessage({ caseId, userId })       // entity identity leak
 *
 * ✅ ALLOWED:
 *   channel.postMessage({ type: 'TAB_OPENED', tabId })
 *   channel.postMessage({ type: 'TAB_CLOSED',  tabId })
 *
 *   tabId is a random session-local ID generated once per tab — it carries
 *   no user/org/clinical data and is safe to broadcast.
 *
 * USAGE (via hook):
 *   useCaseTabChannel(caseId, {
 *     onOtherTabOpened: () => toast.warning('Case already open in another tab'),
 *   });
 */

import { useEffect } from 'react';
import { toast } from 'sonner';

// ── Event type registry ───────────────────────────────────────────────────────

export const CASE_TAB_EVENTS = {
  TAB_OPENED: 'TAB_OPENED',
  TAB_CLOSED:  'TAB_CLOSED',
} as const;

export type CaseTabEventType = typeof CASE_TAB_EVENTS[keyof typeof CASE_TAB_EVENTS];

// Allowed keys per event type — used for zero-trust payload validation
const ALLOWED_KEYS = new Set(['type', 'tabId']);

// ── Stable per-session tab ID ─────────────────────────────────────────────────
// Generated once per browser tab and stored in sessionStorage.
// Allows a channel listener to distinguish its own messages from others'.

function getTabId(): string {
  if (typeof sessionStorage === 'undefined') return 'ssr';
  let id = sessionStorage.getItem('_case_tab_id');
  if (!id) {
    id = Math.random().toString(36).slice(2);
    sessionStorage.setItem('_case_tab_id', id);
  }
  return id;
}

// ── Channel factory (per-case, not module-level singleton) ───────────────────

function openChannel(caseId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(`case_tab_${caseId}`);
  } catch (_) {
    // Private-browsing or unsupported environment — degrade silently
    return null;
  }
}

// ── Hook options & return ─────────────────────────────────────────────────────

export interface UseCaseTabChannelOptions {
  /**
   * Called when another browser tab announces it opened the same case.
   * Default implementation shows a Sonner toast warning.
   */
  onOtherTabOpened?: () => void;
}

/**
 * useCaseTabChannel
 *
 * Opens a per-case BroadcastChannel, announces this tab's presence,
 * and listens for other tabs opening the same case.
 * Channel is closed on unmount (or when caseId changes).
 *
 * @param caseId  - The OrthodonticCase._id. Required — hook is a no-op when falsy.
 * @param options - Optional callbacks and configuration.
 */
export function useCaseTabChannel(
  caseId: string | null | undefined,
  options: UseCaseTabChannelOptions = {}
): void {
  const { onOtherTabOpened } = options;

  useEffect(() => {
    if (!caseId) return;

    const tabId  = getTabId();
    const channel = openChannel(caseId);
    if (!channel) return;

    // Announce that this tab opened the case
    channel.postMessage({ type: CASE_TAB_EVENTS.TAB_OPENED, tabId });

    // Handle incoming messages
    const handleMessage = (event: MessageEvent) => {
      const data = event?.data;
      if (!data || typeof data !== 'object') return;

      // ── Zero-trust validation: reject unknown event types ─────────────────
      const { type, tabId: senderTabId } = data as { type?: string; tabId?: string };

      if (!type || !Object.values(CASE_TAB_EVENTS).includes(type as CaseTabEventType)) {
        console.warn('[caseTabChannel] Rejected unknown event type:', type);
        return;
      }

      // ── Zero-trust: reject events with unexpected payload keys ────────────
      const receivedKeys = Object.keys(data);
      const hasExtraPayload = receivedKeys.some((k) => !ALLOWED_KEYS.has(k));
      if (hasExtraPayload) {
        console.error('[caseTabChannel] SECURITY: Rejected event with unexpected payload:', receivedKeys);
        return;
      }

      // Ignore own messages
      if (senderTabId === tabId) return;

      if (type === CASE_TAB_EVENTS.TAB_OPENED) {
        if (onOtherTabOpened) {
          onOtherTabOpened();
        } else {
          // Default: soft warning toast
          toast.warning('This case is already open in another tab. Changes may conflict.', {
            duration: 8000,
            id:       'multi-tab-warning',
          });
        }
      }
    };

    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      try {
        channel.postMessage({ type: CASE_TAB_EVENTS.TAB_CLOSED, tabId });
      } catch (_) {}
      channel.close();
    };
  }, [caseId, onOtherTabOpened]);
}
