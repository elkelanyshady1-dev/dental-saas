/**
 * socket.js — Org Plane Socket.IO Client Singleton
 *
 * PLANE: Organization only
 * SINGLETON: One socket instance for the entire org plane session.
 *
 * RULES (enforced):
 *   ❌ NEVER import socket.io-client inside a React component
 *   ❌ NEVER call io() more than once (use connectSocket / getSocket)
 *   ✅ ALWAYS use connectSocket(token) / getSocket() / disconnectSocket()
 *   ✅ ALWAYS call disconnectSocket() on logout
 *   ✅ ALWAYS call connectSocket(token) after login
 *
 * TRANSPORT:
 *   Dev:  Vite proxies /socket.io → localhost:5000 (ws: true — vite.config.js)
 *   Prod: nginx forwards /socket.io → backend (same origin rule)
 *
 * AUTH:
 *   - Org JWT passed via socket.handshake.auth.token
 *   - Backend socketAuth middleware: verifyByType() + plane check + tokenVersion
 *   - If server rejects → connect_error fires → "auth-session-expired" dispatched
 *
 * RECONNECT SAFETY:
 *   - reconnection: true with exponential back-off (max 5 attempts)
 *   - On auth error from server: no reconnect (auth: false)
 *   - On UNAUTHORIZED_SOCKET: triggers logout flow via window event
 */

import { io } from "socket.io-client";

/** Module-level singleton — never exposed directly */
let _socket = null;

/** Track whether we already attached lifecycle listeners for this instance */
let _listenersAttached = false;

/**
 * connectSocket
 *
 * Creates (or reconnects) the socket with the current org JWT.
 * Idempotent: if already connected, disconnects first to ensure the
 * new handshake carries the freshest token.
 *
 * @param {string} token — Org access token (from sessionStorage / AuthContext)
 * @returns {import("socket.io-client").Socket}
 */
export function connectSocket(token) {
    // Tear down stale socket before reconnecting with new token
    if (_socket) {
        _socket.removeAllListeners();
        if (_socket.connected) _socket.disconnect();
        _socket = null;
        _listenersAttached = false;
    }

    _socket = io("/", {
        // Relative base — Vite proxy / nginx both forward /socket.io correctly
        path: "/socket.io",
        withCredentials: true,
        autoConnect: true,
        // ── Dev: polling only — Vite HMR owns the WebSocket upgrade on port 3000.
        //    socket.io's WS probe hits Vite instead of the backend → "Invalid frame header".
        //    Polling flows through Vite proxy → backend correctly.
        // ── Prod: nginx proxies both transports cleanly → allow upgrade.
        transports: import.meta.env.DEV ? ["polling"] : ["polling", "websocket"],
        upgrade: !import.meta.env.DEV,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        auth: {
            // Backend socketAuth reads socket.handshake.auth.token
            token: token || "",
        },
    });

    _attachLifecycleListeners();
    return _socket;
}

/**
 * getSocket
 *
 * Returns the live singleton. Returns null before connectSocket() is called.
 * Use in hooks and service functions — never inside component render body.
 *
 * @returns {import("socket.io-client").Socket | null}
 */
export function getSocket() {
    return _socket;
}

/**
 * disconnectSocket
 *
 * Gracefully closes the socket and clears the singleton.
 * MUST be called on logout to prevent stale listeners and org room membership.
 */
export function disconnectSocket() {
    if (_socket) {
        _socket.removeAllListeners();
        _socket.disconnect();
        _socket = null;
        _listenersAttached = false;
    }
}

// ── Post-Refresh Reconnect ────────────────────────────────────────────────────
// When api.js silently refreshes the access token (401 → /auth/refresh → new JWT),
// it dispatches 'auth-token-refreshed' with the new token.
// The socket's WS handshake carries the OLD token — it must reconnect immediately
// so the server accepts it. Without this, every background-refresh cycle produces
// "jwt expired" errors in server logs until the user manually re-logs in.
//
// Rule 21: socket.js is Org-plane only. This listener is module-scoped (not React)
// so it is safe to register once at import time.
function _handleTokenRefresh(event) {
    const newToken = event?.detail?.token;
    if (!newToken) return;
    // Only reconnect if a socket session is already active — don't create one
    // speculatively before AuthContext has called connectSocket() at login.
    if (_socket) {
        if (import.meta.env.DEV) {
            console.info("[Socket] Token refreshed — reconnecting with new JWT");
        }
        connectSocket(newToken);
    }
}

if (typeof window !== "undefined") {
    window.addEventListener("auth-token-refreshed", _handleTokenRefresh);
}


// ── Private ───────────────────────────────────────────────────────────────────

function _attachLifecycleListeners() {
    if (_listenersAttached || !_socket) return;
    _listenersAttached = true;

    _socket.on("connect", () => {
        if (import.meta.env.DEV) {
            console.info("[Socket] Connected:", _socket.id);
        }
    });

    /**
     * connect_error — STEP 8: Token Expiry / Auth Rejection Handling
     *
     * The backend emits specific error messages from socketAuth.js:
     *   "Authentication error: Token missing"
     *   "Authentication error: Only organization users allowed"
     *   "Authentication error: Session invalidated"   ← tokenVersion mismatch
     *   "Authentication error: User inactive"
     *   "Authentication error: Invalid token"         ← expired JWT
     *
     * Rule: UNAUTHORIZED sockets dispatch "auth-session-expired" event.
     * AuthContext picks this up and clears state + redirects.
     * Do NOT redirect from here — keep navigation in React.
     */
    _socket.on("connect_error", (err) => {
        const msg = err?.message || "";
        console.warn("[Socket] Connection error:", msg);

        const isAuthError = msg.includes("Authentication error") || msg === "UNAUTHORIZED_SOCKET";

        if (isAuthError) {
            // Stop reconnection attempts — a bad token won't get better on retry
            if (_socket) {
                _socket.disconnect();
                _listenersAttached = false;
            }

            // Signal the org AuthContext to clear session and redirect to login
            // AuthContext listens for this event (services/api.js emitSessionExpired pattern)
            if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("auth-session-expired"));
            }
        }
        // Non-auth errors (network, server down): socket.io reconnects automatically
    });

    _socket.on("disconnect", (reason) => {
        if (import.meta.env.DEV) {
            console.info("[Socket] Disconnected:", reason);
        }
        // "io server disconnect" means server forcibly kicked us — treat as auth error
        if (reason === "io server disconnect") {
            if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("auth-session-expired"));
            }
        }
    });
}
