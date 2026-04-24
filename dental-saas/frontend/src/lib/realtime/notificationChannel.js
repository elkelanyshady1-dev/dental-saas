/**
 * notificationChannel.js — Zero-Trust BroadcastChannel for Org Notifications
 *
 * Follows CLAUDE.md Section 14 rules:
 *   RULE 1 — Events carry type ONLY (no data payload)
 *   RULE 2 — Receivers invalidateQueries > refetch API > render
 *   RULE 3 — Single shared channel instance ('notifications')
 *   RULE 4 — Cleanup listeners on unmount
 *
 * Events:
 *   NOTIFICATION_UPDATED — any mutation (markAsRead, markAllRead, delete).
 *                          Listeners should invalidate QK.notifications.all.
 *
 * Usage — emit (from mutation success handlers):
 *   import { emitNotificationUpdate } from "@/lib/realtime/notificationChannel";
 *   emitNotificationUpdate();  // after local optimistic update
 *
 * Usage — listen (from OrgHeader or any notification consumer):
 *   import { useNotificationChannelListener } from "@/lib/realtime/notificationChannel";
 *   useNotificationChannelListener(() => {
 *     qc.invalidateQueries({ queryKey: QK.notifications.all });
 *   });
 */

import { useEffect } from "react";

// ── Singleton channel ─────────────────────────────────────────────────────────
let _channel = null;

function getChannel() {
    if (!_channel && typeof BroadcastChannel !== "undefined") {
        _channel = new BroadcastChannel("notifications");
    }
    return _channel;
}

// ── Event types (exhaustive) ─────────────────────────────────────────────────
export const NOTIFICATION_EVENTS = {
    NOTIFICATION_UPDATED: "NOTIFICATION_UPDATED",
};

// ── Emit ─────────────────────────────────────────────────────────────────────
export function emitNotificationUpdate(type = NOTIFICATION_EVENTS.NOTIFICATION_UPDATED) {
    const channel = getChannel();
    if (!channel) return; // graceful no-op in unsupported environments
    // Zero-trust: type-only payload, no data.
    channel.postMessage({ type });
}

// ── Listen (React hook) ──────────────────────────────────────────────────────
export function useNotificationChannelListener(onMessage) {
    useEffect(() => {
        const channel = getChannel();
        if (!channel) return;

        const handleMessage = (event) => {
            const type = event?.data?.type;
            if (!Object.values(NOTIFICATION_EVENTS).includes(type)) return;

            // Reject events that smuggle data payloads.
            const allowedKeys = ["type"];
            const receivedKeys = Object.keys(event?.data || {});
            const hasExtraPayload = receivedKeys.some((k) => !allowedKeys.includes(k));
            if (hasExtraPayload) {
                console.error(
                    "[notificationChannel] SECURITY: Rejected event with unexpected payload keys:",
                    receivedKeys,
                );
                return;
            }

            onMessage(type);
        };

        channel.addEventListener("message", handleMessage);
        return () => channel.removeEventListener("message", handleMessage);
    }, [onMessage]);
}
