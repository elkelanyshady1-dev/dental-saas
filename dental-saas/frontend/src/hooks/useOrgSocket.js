/**
 * useOrgSocket.js — Org Real-Time Event Hook (React Query integration)
 *
 * PLANE: Organization only
 * PATTERN: Socket event → queryClient.invalidateQueries()
 *
 * ZERO-TRUST RULES:
 *   ❌ FORBIDDEN: setState from socket event (Rule 11.1 — server state in useQuery only)
 *   ❌ FORBIDDEN: Storing socket data in useState / Zustand directly
 *   ✅ REQUIRED:  Socket event → invalidateQueries → React Query refetch → render
 *   ✅ REQUIRED:  Cleanup event listener on unmount (Rule 12.5)
 *
 * USAGE — basic invalidation:
 *   useOrgSocket("appointment.created", ["appointments"]);
 *   useOrgSocket("patient.updated", ["patients", patientId]);
 *
 * USAGE — custom handler:
 *   useOrgSocket("booking:update", ["bookings"], (data) => {
 *     console.log("Booking updated:", data);
 *   });
 *
 * USAGE — multiple events:
 *   useOrgSocketEvents([
 *     { event: "appointment.created", queryKey: ["appointments"] },
 *     { event: "patient.updated",     queryKey: ["patients"] },
 *   ]);
 *
 * WHY INVALIDATE, NOT setState:
 *   The backend is the single source of truth. The socket signal says
 *   "something changed" — React Query fetches the full, fresh data.
 *   This avoids stale-closure bugs and partial-update races.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "../context/SocketContext";

/**
 * useOrgSocket
 *
 * Subscribes to a single socket event for the duration of the component's
 * mount. On event: invalidates the given React Query key which triggers
 * an automatic background refetch.
 *
 * @param {string}   event      - Socket event name (e.g. "appointment.created")
 * @param {Array}    queryKey   - React Query key to invalidate on event
 * @param {Function} [onEvent]  - Optional additional handler (logging, toast, etc.)
 */
export function useOrgSocket(event, queryKey, onEvent) {
    const socket = useSocket();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!socket || !event) return;

        const handler = (data) => {
            // ✅ Invalidate → React Query refetch → render fresh data
            queryClient.invalidateQueries({ queryKey });

            // Optional: caller-supplied side-effect (toast, log, etc.)
            if (typeof onEvent === "function") {
                onEvent(data);
            }
        };

        socket.on(event, handler);

        // ✅ Rule 12.5: cleanup listener on unmount
        return () => {
            socket.off(event, handler);
        };
    }, [socket, event, queryKey, queryClient, onEvent]);
}

/**
 * useOrgSocketEvents
 *
 * Subscribes to multiple socket events from a single hook call.
 * Useful for pages that need to react to several domain events.
 *
 * @param {Array<{ event: string, queryKey: Array, onEvent?: Function }>} subscriptions
 *
 * @example
 * useOrgSocketEvents([
 *   { event: "appointment.created", queryKey: ["appointments"] },
 *   { event: "appointment.updated", queryKey: ["appointments"] },
 *   { event: "patient.updated",     queryKey: ["patients"] },
 * ]);
 */
export function useOrgSocketEvents(subscriptions = []) {
    const socket = useSocket();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!socket || !subscriptions.length) return;

        const handlers = subscriptions.map(({ event, queryKey, onEvent }) => {
            const handler = (data) => {
                queryClient.invalidateQueries({ queryKey });
                if (typeof onEvent === "function") onEvent(data);
            };
            socket.on(event, handler);
            return { event, handler };
        });

        // ✅ Rule 12.5: cleanup all listeners on unmount
        return () => {
            handlers.forEach(({ event, handler }) => {
                socket.off(event, handler);
            });
        };
    }, [socket, subscriptions, queryClient]);
}
