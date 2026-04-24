/**
 * PlatformAuthContext.jsx
 * v19.5 — Boot Loop Fix: Hardened Refresh + Interceptor + Refresh Lock
 *
 * Changes from v19.4:
 *   - Module-level `_isRefreshing` lock prevents concurrent refresh races
 *     during boot and interceptor retry.
 *   - Interceptor now uses `_isRefreshRequest` config flag (not URL string
 *     matching) to detect refresh calls — immune to baseURL variations.
 *   - On refresh failure inside interceptor: clears token + user + redirects.
 *     Previously this path was silently swallowed, causing the stuck boot screen.
 *   - refresh() catch: unconditionally clears session on ANY failure during
 *     initialization. The old `if (!_pToken)` guard had an escape hatch that
 *     left authResolved false when a stale in-memory token existed — causing
 *     the infinite "INITIALIZING SOVEREIGN PLATFORM..." spinner.
 *   - Boot log lines added for debuggability.
 *
 * Backend auth, billing, contract, and RBAC logic: UNCHANGED.
 */

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useRef,
} from "react";

import platformApi from "./platformApi";
import { platformApiClient } from "../core/api/platformApiClient";
import { invalidateFlagCache } from "../hooks/usePlatformFeatureFlags";

const PlatformAuthContext = createContext(null);

export const usePlatformAuth = () => {
    const context = useContext(PlatformAuthContext);
    if (!context)
        throw new Error("usePlatformAuth must be used inside PlatformAuthProvider");
    return context;
};

// ─── Module-level singletons ──────────────────────────────────────────────────

// In-memory access token — never persisted to localStorage.
// httpOnly refresh cookie is the source of truth; this is just a request-time cache.
let _pToken = "";
export const getPlatformToken = () => _pToken;

// Refresh lock — ensures only one silent-refresh is in flight at a time.
// Prevents the boot interceptor and the init useEffect from racing.
let _isRefreshing = false;

// ─── Session clear helper ─────────────────────────────────────────────────────
// Called on logout and on any refresh failure.
// Clears in-memory token, lock, and any belt-and-suspenders localStorage keys.
// Does NOT make network calls — redirect is always the caller's responsibility.
function _clearSession() {
    _pToken = "";
    _isRefreshing = false;
    // Clear any keys that older code versions may have written
    localStorage.removeItem("platformToken");
    localStorage.removeItem("platformAccessToken");
    localStorage.removeItem("platformUser");
    // httpOnly cookies cannot be cleared from JS, but clear non-httpOnly ones:
    document.cookie = "platformRefreshToken=; Max-Age=0; path=/";
}

export function PlatformAuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authResolved, setAuthResolved] = useState(false);
    const [authFailed, setAuthFailed] = useState(false);  // true when refresh definitively fails

    const initRef = useRef(false);

    // ─────────────────────────────────────────────────────────────
    // Axios Interceptors
    // Registered once on mount, ejected on unmount.
    // ─────────────────────────────────────────────────────────────
    useEffect(() => {
        // Request: inject Bearer token from in-memory store
        const reqId = platformApi.interceptors.request.use((config) => {
            if (_pToken) {
                config.headers.Authorization = `Bearer ${_pToken}`;
            }
            return config;
        });

        // Response: on 401 — attempt one silent refresh, then clear + redirect
        const resId = platformApi.interceptors.response.use(
            (res) => res,
            async (err) => {
                const original = err.config;

                // Only intercept if ALL conditions met:
                //   1. Status is 401
                //   2. Has not already been retried (_retry flag)
                //   3. Is not itself a refresh request (prevents infinite loop)
                if (
                    err.response?.status === 401 &&
                    !original._retry &&
                    !original._isRefreshRequest
                ) {
                    original._retry = true;

                    // If another interceptor cycle already holds the refresh lock,
                    // reject immediately — don't queue behind it.
                    if (_isRefreshing) {
                        console.warn("[AUTH] Refresh already in progress — rejecting duplicate 401");
                        return Promise.reject(err);
                    }

                    _isRefreshing = true;
                    console.info("[AUTH] Access token expired — attempting silent refresh");

                    try {
                        // Tag the refresh config so the interceptor ignores it
                        const { data } = await platformApiClient.auth.refreshCreate({
                            _isRefreshRequest: true
                        });
                        _pToken = data.token;
                        _isRefreshing = false;
                        console.info("[AUTH] Silent refresh succeeded — retrying original request");
                        return platformApi(original);
                    } catch (refreshErr) {
                        // Refresh returned 401 (revoked cookie) or any other error.
                        // Session is permanently dead. Clear everything and hard-redirect.
                        console.warn(
                            "[AUTH] Refresh failed — clearing session and redirecting to login",
                            refreshErr?.response?.status
                        );
                        _clearSession();
                        setUser(null);
                        setAuthResolved(true);
                        setLoading(false);
                        window.location.href = "/platform/login";
                        // Return a never-resolving promise — the page is navigating away.
                        // This prevents any downstream .catch() from firing on dead requests.
                        return new Promise(() => { });
                    }
                }

                return Promise.reject(err);
            }
        );

        return () => {
            platformApi.interceptors.request.eject(reqId);
            platformApi.interceptors.response.eject(resId);
        };
    }, []);

    // ─── Platform Session Expired Event Listener ──────────────────────────────────
    // Listens for "platform-session-expired" — dispatched by platformApi.js
    // toast interceptor or any other code path that detects a dead platform session.
    // Rule 21.3: navigation belongs to React Router, not window.location from interceptors.
    useEffect(() => {
        const handleExpired = () => {
            console.warn("[PlatformAuth] platform-session-expired received — clearing session");
            _clearSession();
            setUser(null);
            setAuthResolved(true);
            setLoading(false);
            // Navigate to login via React Router (window.location only as last resort)
            if (window.location.pathname !== "/platform/login") {
                window.location.href = "/platform/login";
            }
        };
        window.addEventListener("platform-session-expired", handleExpired);
        return () => window.removeEventListener("platform-session-expired", handleExpired);
    }, []);

    // ─────────────────────────────────────────────────────────────
    // LOGIN
    // ─────────────────────────────────────────────────────────────
    const login = useCallback(async ({ email, password }) => {
        console.info("[BOOT] login attempt");
        const { data } = await platformApiClient.auth.loginCreate({ email, password });
        _pToken = data.token;
        setUser(data.user);
        setAuthResolved(true);
        console.info("[BOOT] login success");
        return data.user;
    }, []);

    // ─────────────────────────────────────────────────────────────
    // LOGOUT
    // ─────────────────────────────────────────────────────────────
    const logout = useCallback(() => {
        console.info("[BOOT] logout — clearing session");
        _clearSession();
        setUser(null);
        setAuthResolved(true);
        invalidateFlagCache();
        window.location.href = "/platform/login";
    }, []);

    // ─────────────────────────────────────────────────────────────
    // REFRESH — called once on boot, never from user actions
    // ─────────────────────────────────────────────────────────────
    const refresh = useCallback(async () => {
        // TEMP DEBUG — verify how often refresh actually fires. Remove after
        // confirming the "infinite refresh loop" claim with evidence.
        console.log("[AUTH_FLOW]", {
            path: window.location.pathname,
            hasToken: !!_pToken,
            isRefreshing: _isRefreshing,
            action: "refresh_attempt",
        });

        // Guard: only one refresh call in flight at a time.
        // The initRef in the initialization useEffect already prevents duplicates,
        // but this is an additional safety net.
        if (_isRefreshing) {
            console.warn("[BOOT] refresh already in progress — skipping duplicate boot call");
            return;
        }

        _isRefreshing = true;
        console.info("[BOOT] platform initialization started — refreshing session");

        try {
            const { data } = await platformApiClient.auth.refreshCreate({
                _isRefreshRequest: true   // tells interceptor to not retry this call
            });
            _pToken = data.token;
            setUser(data.user);
            console.info("[BOOT] refresh success — session restored");
        } catch (err) {
            // ⚠️  KEY FIX: Unconditionally clear session on ANY refresh error.
            //
            // v19.4 had: `if (!_pToken) { ... } else { console.warn(...) }`
            // The else branch left _pToken set, user null, and authResolved=true
            // but token truthy → PlatformBoot let through → every API call 401
            // → interceptor retried refresh → 401 again → infinite loop.
            //
            // Correct behavior: if the server rejected our refresh cookie, the
            // session is dead regardless of what _pToken holds in memory.
            const status = err.response?.status;
            if (status === 401) {
                console.warn("[BOOT] refresh token invalid or revoked (401) — session expired");
            } else {
                console.warn(`[BOOT] refresh failed (${status ?? "network"}) — clearing session`);
            }
            _clearSession();
            setUser(null);
            setAuthFailed(true);   // signal to PlatformBoot: skip cap/flag wait, go to login
            // Note: do NOT redirect here. PlatformBoot handles the redirect via
            // <Navigate to="/platform/login"> when token + user are absent.
            // This keeps navigation in React Router instead of a hard window.location.
        } finally {
            _isRefreshing = false;
            setLoading(false);
            setAuthResolved(true);   // Always resolve — never leave PlatformBoot hanging
        }
    }, []);

    // ─────────────────────────────────────────────────────────────
    // INITIALIZATION — exactly once per page load
    // ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (initRef.current) return;   // StrictMode double-invoke guard
        initRef.current = true;

        // On the login page: skip refresh entirely.
        // A failed refresh on the login page would trigger another redirect loop.
        if (window.location.pathname.startsWith("/platform/login")) {
            console.info("[BOOT] on login page — skipping session refresh");
            setLoading(false);
            setAuthResolved(true);
            return;
        }

        refresh();
    }, [refresh]);

    const value = {
        token: _pToken,
        user,
        loading,
        authResolved,
        authFailed,
        platformLogin: login,
        platformLogout: logout,
        refresh,
    };

    return (
        <PlatformAuthContext.Provider value={value}>
            {children}
        </PlatformAuthContext.Provider>
    );
}