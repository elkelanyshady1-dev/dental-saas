/**
 * staffChannel.js — Zero-Trust BroadcastChannel for Org Staff Domain
 *
 * Mirrors the same rules as planChannel.js (§14 of root CLAUDE.md):
 *   RULE 1 — Events carry type ONLY (no data payload)
 *   RULE 2 — Receivers invalidateQueries → refetch API → render
 *   RULE 3 — Single shared channel instance ('staff')
 *   RULE 4 — Cleanup listeners on unmount
 *
 * Events:
 *   ROLE_UPDATED — any role CRUD (create / update / delete) OR a user-role assignment.
 *                  Listeners should invalidate STAFF_KEYS.roles AND STAFF_KEYS.all
 *                  because the staff list displays role names per user.
 *
 * Usage — emit (from mutation success handlers):
 *   import { emitStaffUpdate } from "@/lib/realtime/staffChannel";
 *   emitStaffUpdate();  // after local invalidateQueries
 *
 * Usage — listen (from RolesPage / StaffPage):
 *   import { useStaffChannelListener } from "@/lib/realtime/staffChannel";
 *   useStaffChannelListener(() => {
 *     qc.invalidateQueries({ queryKey: STAFF_KEYS.roles });
 *     qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
 *   });
 */

import { useEffect } from "react";

// ── Singleton channel ─────────────────────────────────────────────────────────
let _channel = null;

function getChannel() {
    if (!_channel && typeof BroadcastChannel !== "undefined") {
        _channel = new BroadcastChannel("staff");
    }
    return _channel;
}

// ── Event types (exhaustive) ─────────────────────────────────────────────────
export const STAFF_EVENTS = {
    ROLE_UPDATED: "ROLE_UPDATED",
};

// ── Emit ─────────────────────────────────────────────────────────────────────
export function emitStaffUpdate(type = STAFF_EVENTS.ROLE_UPDATED) {
    const channel = getChannel();
    if (!channel) return; // graceful no-op in unsupported environments
    // Zero-trust: strip any accidentally passed extra fields.
    channel.postMessage({ type });
}

// ── Listen (React hook) ──────────────────────────────────────────────────────
export function useStaffChannelListener(onMessage) {
    useEffect(() => {
        const channel = getChannel();
        if (!channel) return;

        const handleMessage = (event) => {
            const type = event?.data?.type;
            if (!Object.values(STAFF_EVENTS).includes(type)) return;

            // Reject events that smuggle data payloads.
            const allowedKeys = ["type"];
            const receivedKeys = Object.keys(event?.data || {});
            const hasExtraPayload = receivedKeys.some((k) => !allowedKeys.includes(k));
            if (hasExtraPayload) {
                console.error(
                    "[staffChannel] SECURITY: Rejected event with unexpected payload keys:",
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
