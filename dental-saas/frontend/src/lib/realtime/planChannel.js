/**
 * planChannel.js — Zero-Trust BroadcastChannel for Plan Domain
 *
 * ARCHITECTURE RULES (NON-NEGOTIABLE):
 *   RULE 1 — Events carry NO data payload (zero-trust)
 *   RULE 2 — All receivers must invalidateQueries → refetch API → render
 *   RULE 3 — Platform emits; Public listens only (plane isolation)
 *   RULE 4 — Single shared channel instance ('plans')
 *
 * ❌ FORBIDDEN:
 *   planChannel.postMessage({ plans: [...] })   // data carries server state
 *   planChannel.postMessage({ planId: id })     // leaks entity identity
 *
 * ✅ ALLOWED:
 *   planChannel.postMessage({ type: 'PLAN_UPDATED' })
 *
 * Usage — Platform Plane (emit):
 *   import { emitPlanUpdate } from '@/lib/realtime/planChannel';
 *   emitPlanUpdate();   // call AFTER queryClient.invalidateQueries
 *
 * Usage — Public Plane (listen):
 *   import { usePlanChannelListener } from '@/lib/realtime/planChannel';
 *   usePlanChannelListener(() => queryClient.invalidateQueries(...));
 */

// ── Singleton channel ─────────────────────────────────────────────────────────
// Lazily created so SSR environments (if ever added) don't error on startup.
let _channel = null;

function getChannel() {
    if (!_channel && typeof BroadcastChannel !== "undefined") {
        _channel = new BroadcastChannel("plans");
    }
    return _channel;
}

// ── Event types (exhaustive, no arbitrary strings) ────────────────────────────
export const PLAN_EVENTS = {
    PLAN_UPDATED: "PLAN_UPDATED", // save draft, publish, visibility change, duplicate
    PLAN_DEPRECATED: "PLAN_DEPRECATED", // deprecation (version archived)
};

// ── Platform Plane: Emit ─────────────────────────────────────────────────────
/**
 * emitPlanUpdate
 * Broadcasts PLAN_UPDATED to all other tabs.
 * MUST be called AFTER queryClient.invalidateQueries (local tab already handled).
 *
 * Zero-trust: carries type only. Receivers query the API themselves.
 *
 * @param {'PLAN_UPDATED'|'PLAN_DEPRECATED'} type
 */
export function emitPlanUpdate(type = PLAN_EVENTS.PLAN_UPDATED) {
    const channel = getChannel();
    if (!channel) return; // BroadcastChannel not supported (old browser / test env)

    // ── Zero-trust guard: strip any accidentally passed extra fields ──────────
    channel.postMessage({ type });
}

// ── Public / Marketing Plane: Listen (React hook) ────────────────────────────
/**
 * usePlanChannelListener
 *
 * React hook — attaches a BroadcastChannel listener.
 * Call from Public/Marketing components that need to stay in sync.
 *
 * The callback receives no plan data — it receives only the event TYPE.
 * The callback is responsible for calling queryClient.invalidateQueries.
 *
 * @param {(type: string) => void} onMessage
 *
 * @example
 * usePlanChannelListener((type) => {
 *   if (type === PLAN_EVENTS.PLAN_UPDATED) {
 *     queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.ALL_PUBLIC });
 *   }
 * });
 */
import { useEffect } from "react";

export function usePlanChannelListener(onMessage) {
    useEffect(() => {
        const channel = getChannel();
        if (!channel) return; // gracefully no-op if unsupported

        const handleMessage = (event) => {
            // ── Zero-trust validation: only accept known event types ──────────
            const type = event?.data?.type;
            if (!Object.values(PLAN_EVENTS).includes(type)) return;

            // ── Guard: reject events that smuggle data payloads ───────────────
            const allowedKeys = ["type"];
            const receivedKeys = Object.keys(event?.data || {});
            const hasExtraPayload = receivedKeys.some(k => !allowedKeys.includes(k));
            if (hasExtraPayload) {
                console.error(
                    "[planChannel] SECURITY: Rejected event with unexpected payload keys:",
                    receivedKeys
                );
                return;
            }

            onMessage(type);
        };

        channel.addEventListener("message", handleMessage);

        // ── Cleanup: remove listener (channel stays open — it's a singleton) ──
        return () => {
            channel.removeEventListener("message", handleMessage);
        };
    }, [onMessage]);
}
