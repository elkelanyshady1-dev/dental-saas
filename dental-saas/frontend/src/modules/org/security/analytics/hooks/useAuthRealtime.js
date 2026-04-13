/**
 * useAuthRealtime.js — Socket.IO Real-Time Auth Event Streaming
 *
 * Listens for live authorization events via the existing SocketContext
 * and invalidates React Query caches for dashboard auto-refresh.
 *
 * TASK-FE-AUTH-INT-003
 * MODULE: frontend/src/modules/org/security/analytics
 * PLANE: Org only.
 */
import { useEffect, useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/context/SocketContext";
import { AUTH_ANALYTICS_KEYS } from "./useAuthAnalytics";

// ─── Event Types ─────────────────────────────────────────────────────────────

const AUTH_EVENTS = {
    DENIAL: "auth:denial",           // Single denial event
    ALERT: "auth:alert",             // Anomaly detection alert
    BATCH_UPDATE: "auth:batch",      // Periodic batch stats update
    TRACE_COMPLETE: "auth:trace",    // Full trace available
};

// ─── Debounced Invalidation ──────────────────────────────────────────────────

/**
 * Debounce React Query invalidations to prevent cascading refetches
 * when multiple events arrive in rapid succession.
 */
function useDebouncedInvalidation(queryClient, delayMs = 2000) {
    const timerRef = useRef(null);
    const pendingKeysRef = useRef(new Set());

    const invalidate = useCallback(
        (queryKey) => {
            // Collect unique keys
            const keyStr = JSON.stringify(queryKey);
            pendingKeysRef.current.add(keyStr);

            // Clear previous timer
            if (timerRef.current) clearTimeout(timerRef.current);

            // Schedule batch invalidation
            timerRef.current = setTimeout(() => {
                const keys = [...pendingKeysRef.current];
                pendingKeysRef.current.clear();

                keys.forEach((k) => {
                    try {
                        queryClient.invalidateQueries({ queryKey: JSON.parse(k) });
                    } catch {
                        // silently skip
                    }
                });
            }, delayMs);
        },
        [queryClient, delayMs]
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return invalidate;
}

// ─── Main Hook ───────────────────────────────────────────────────────────────

/**
 * useAuthRealtime — connects to Socket.IO auth events and updates React Query cache.
 *
 * @param {Object} options
 * @param {boolean} options.enabled - Enable/disable real-time streaming
 * @param {function} options.onDenial - Callback when a denial event arrives
 * @param {function} options.onAlert - Callback when an alert event arrives
 * @returns {{ isConnected, eventCount, lastEvent, recentDenials }}
 */
export function useAuthRealtime(options = {}) {
    const { enabled = true, onDenial, onAlert } = options;
    const socket = useSocket();
    const queryClient = useQueryClient();
    const invalidate = useDebouncedInvalidation(queryClient);

    const [isConnected, setIsConnected] = useState(false);
    const [eventCount, setEventCount] = useState(0);
    const [lastEvent, setLastEvent] = useState(null);
    const [recentDenials, setRecentDenials] = useState([]);
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
        if (!socket || !enabled) {
            setIsConnected(false);
            return;
        }

        setIsConnected(socket.connected);

        // ─── Connection tracking ─────────────────────────────────────────

        const handleConnect = () => setIsConnected(true);
        const handleDisconnect = () => setIsConnected(false);

        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);

        // ─── Denial events ───────────────────────────────────────────────

        const handleDenial = (event) => {
            setEventCount((c) => c + 1);
            setLastEvent({ type: "denial", data: event, timestamp: new Date() });

            // Prepend to recent denials (keep max 50)
            setRecentDenials((prev) => [event, ...prev].slice(0, 50));

            // Invalidate relevant caches
            invalidate(AUTH_ANALYTICS_KEYS.all);

            // External callback
            onDenial?.(event);
        };

        // ─── Alert events (anomaly detection) ────────────────────────────

        const handleAlert = (event) => {
            setEventCount((c) => c + 1);
            setLastEvent({ type: "alert", data: event, timestamp: new Date() });

            // Add to alerts list (keep max 20)
            setAlerts((prev) => [event, ...prev].slice(0, 20));

            // External callback
            onAlert?.(event);
        };

        // ─── Batch stats update ──────────────────────────────────────────

        const handleBatch = () => {
            // Invalidate summary + timeline (most volatile caches)
            invalidate(AUTH_ANALYTICS_KEYS.all);
        };

        // ─── Trace completion ────────────────────────────────────────────

        const handleTrace = (event) => {
            if (event?.traceId) {
                invalidate(AUTH_ANALYTICS_KEYS.trace(event.traceId));
            }
        };

        // Subscribe to all auth events
        socket.on(AUTH_EVENTS.DENIAL, handleDenial);
        socket.on(AUTH_EVENTS.ALERT, handleAlert);
        socket.on(AUTH_EVENTS.BATCH_UPDATE, handleBatch);
        socket.on(AUTH_EVENTS.TRACE_COMPLETE, handleTrace);

        // Cleanup
        return () => {
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
            socket.off(AUTH_EVENTS.DENIAL, handleDenial);
            socket.off(AUTH_EVENTS.ALERT, handleAlert);
            socket.off(AUTH_EVENTS.BATCH_UPDATE, handleBatch);
            socket.off(AUTH_EVENTS.TRACE_COMPLETE, handleTrace);
        };
    }, [socket, enabled, invalidate, onDenial, onAlert]);

    return {
        isConnected,
        eventCount,
        lastEvent,
        recentDenials,
        alerts,
        clearAlerts: useCallback(() => setAlerts([]), []),
        clearDenials: useCallback(() => setRecentDenials([]), []),
    };
}
