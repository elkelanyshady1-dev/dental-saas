/**
 * socketClient.js — Singleton Socket.IO Client
 * Phase 13 — Real-Time Calendar
 *
 * RULES:
 *   - One socket instance shared across the entire app (singleton)
 *   - Auth token injected at connect-time from sessionStorage (org token)
 *   - Reconnects automatically with exponential backoff
 *   - All interaction via getSocket() — never import io directly
 *
 * The server uses JWT auth middleware (socketAuth.js), so we pass
 * the org token exactly as we do for HTTP requests.
 */

import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";

let _socket = null;

/**
 * Returns the singleton socket, creating it on first call.
 * The token is read lazily so it is always current.
 */
export function getSocket() {
    if (_socket) return _socket;

    const token =
        sessionStorage.getItem("orgToken") ||      // org plane
        sessionStorage.getItem("accessToken") ||   // fallback key
        sessionStorage.getItem("token") ||
        localStorage.getItem("token");             // patient portal fallback

    _socket = io(SOCKET_URL, {
        auth: { token },
        transports: ["websocket", "polling"],
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 20000,
        autoConnect: true,
        withCredentials: true,
    });

    _socket.on("connect", () => {
        if (import.meta.env.DEV) {
            console.debug("[Socket] Connected →", _socket.id);
        }
    });

    _socket.on("connect_error", (err) => {
        if (import.meta.env.DEV) {
            console.debug("[Socket] Connect error:", err.message);
        }
    });

    return _socket;
}

/**
 * Destroys the singleton — call on logout so a fresh socket
 * is created with the new token on next login.
 */
export function destroySocket() {
    if (_socket) {
        _socket.disconnect();
        _socket = null;
    }
}
