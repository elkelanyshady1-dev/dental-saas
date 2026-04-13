/**
 * useFeaturesRealtime.js — Socket.IO Real-Time Module Update Streaming
 *
 * Listens for live module toggle events via the existing SocketContext
 * and invalidates React Query caches for instant UI refresh.
 *
 * Follows the established pattern from useAuthRealtime.js.
 *
 * Events:
 *   module.updated  → Emitted when any module is toggled (from backend controller)
 *
 * PLANE: Org only.
 */
import { useEffect, useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/context/SocketContext";
import { FCC_KEYS } from "./useFeaturesControl";

// ─── Event Types ─────────────────────────────────────────────────────────────

const FCC_EVENTS = {
    MODULE_UPDATED: "module.updated",       // Module toggled on/off
    FEATURE_CHANGED: "feature.changed",     // Feature flag changed (future)
    PERMISSION_CHANGED: "permission.changed", // Role permission edited (future)
};

// ─── Debounced Invalidation ──────────────────────────────────────────────────

function useDebouncedInvalidation(queryClient, delayMs = 1500) {
    const timerRef = useRef(null);
    const pendingKeysRef = useRef(new Set());

    const invalidate = useCallback(
        (queryKey) => {
            const keyStr = JSON.stringify(queryKey);
            pendingKeysRef.current.add(keyStr);

            if (timerRef.current) clearTimeout(timerRef.current);

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

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return invalidate;
}

// ─── Main Hook ───────────────────────────────────────────────────────────────

/**
 * useFeaturesRealtime — connects to Socket.IO module events and updates React Query caches.
 *
 * @param {Object} options
 * @param {boolean} options.enabled - Enable/disable real-time streaming
 * @param {function} options.onModuleUpdate - Callback when a module is toggled
 * @returns {{ isConnected, recentEvents, lastEvent }}
 */
export function useFeaturesRealtime(options = {}) {
    const { enabled = true, onModuleUpdate } = options;
    const socket = useSocket();
    const queryClient = useQueryClient();
    const invalidate = useDebouncedInvalidation(queryClient);

    const [isConnected, setIsConnected] = useState(false);
    const [lastEvent, setLastEvent] = useState(null);
    const [recentEvents, setRecentEvents] = useState([]);

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

        // ─── Module update events ────────────────────────────────────────

        const handleModuleUpdated = (event) => {
            setLastEvent({
                type: "module.updated",
                data: event,
                timestamp: new Date(),
            });

            // Prepend to recent events (keep max 20)
            setRecentEvents((prev) => [
                { ...event, receivedAt: new Date().toISOString() },
                ...prev,
            ].slice(0, 20));

            // Invalidate all FCC caches — module toggle affects modules, features, conflicts
            invalidate(FCC_KEYS.all);

            // External callback
            onModuleUpdate?.(event);
        };

        // ─── Feature flag changes ────────────────────────────────────────

        const handleFeatureChanged = (event) => {
            setLastEvent({ type: "feature.changed", data: event, timestamp: new Date() });
            invalidate(FCC_KEYS.all);
        };

        // ─── Permission changes ──────────────────────────────────────────

        const handlePermissionChanged = (event) => {
            setLastEvent({ type: "permission.changed", data: event, timestamp: new Date() });
            invalidate(FCC_KEYS.permissions);
            invalidate(FCC_KEYS.conflicts);
        };

        // Subscribe to all FCC events
        socket.on(FCC_EVENTS.MODULE_UPDATED, handleModuleUpdated);
        socket.on(FCC_EVENTS.FEATURE_CHANGED, handleFeatureChanged);
        socket.on(FCC_EVENTS.PERMISSION_CHANGED, handlePermissionChanged);

        // Cleanup
        return () => {
            socket.off("connect", handleConnect);
            socket.off("disconnect", handleDisconnect);
            socket.off(FCC_EVENTS.MODULE_UPDATED, handleModuleUpdated);
            socket.off(FCC_EVENTS.FEATURE_CHANGED, handleFeatureChanged);
            socket.off(FCC_EVENTS.PERMISSION_CHANGED, handlePermissionChanged);
        };
    }, [socket, enabled, invalidate, onModuleUpdate]);

    return {
        isConnected,
        lastEvent,
        recentEvents,
        clearEvents: useCallback(() => setRecentEvents([]), []),
    };
}
