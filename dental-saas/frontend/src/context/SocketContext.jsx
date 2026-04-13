/**
 * SocketContext.jsx — Org Plane Socket Bridge
 *
 * PLANE: Organization only
 *
 * PURPOSE:
 *   Bridges the module-level socket singleton (src/lib/socket.js) into the React
 *   component tree so components/hooks can access the live socket via useSocket().
 *
 * ZERO-TRUST RULES:
 *   ❌ FORBIDDEN: io() called inside this file — singleton owns the connection
 *   ❌ FORBIDDEN: Creating socket inside a component
 *   ✅ REQUIRED: connectSocket(token) called by AuthContext on login/init
 *   ✅ REQUIRED: disconnectSocket() called by AuthContext on logout/expiry
 *
 * THIS PROVIDER:
 *   - Reads the singleton via getSocket()
 *   - Re-exposes it via context so hooks (useOrgSocket, useSocket) can subscribe
 *   - Syncs context value when the singleton reference changes (login/logout cycle)
 *   - Does NOT own the socket lifecycle — AuthContext does
 *
 * USAGE:
 *   const socket = useSocket(); // raw socket (null before login)
 *   — OR —
 *   const { on, off } = useOrgSocket("appointment.created", handler);
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { getSocket } from "../lib/socket";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
    const { user } = useAuth();
    const [socket, setSocket] = useState(() => getSocket());

    /**
     * Sync context value whenever the user changes (login / logout cycle).
     *
     * After login: AuthContext calls connectSocket(token) synchronously,
     * then updates user state. The getSocket() call here picks up the new instance.
     *
     * After logout: AuthContext calls disconnectSocket() then setUser(null).
     * user becomes null → socket set to null → consumers re-render cleanly.
     */
    useEffect(() => {
        setSocket(getSocket());
    }, [user]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};

/**
 * useSocket — raw socket access
 * Returns the live Socket.IO instance or null if not connected.
 * Use useOrgSocket() for event subscription with automatic cleanup.
 */
export const useSocket = () => useContext(SocketContext);
