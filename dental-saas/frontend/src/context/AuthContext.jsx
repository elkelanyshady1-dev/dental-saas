import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api, { setAccessToken, getAccessToken, setCsrfToken, clearAuth, setActiveBranchId, setOrganizationId, publicApi } from "../services/api";
import { connectSocket, disconnectSocket } from "../lib/socket";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    /* ── Derived permission helpers ──────────────────────── */
    const permissions = user?.roleId?.permissions || {};
    const allowedBranches = user?.branchAccess || [];
    const hasFullBranchAccess = user?.hasFullBranchAccess || false;
    const multiBranchView = !!permissions?.calendar?.multiBranchView;
    const roleName = user?.roleId?.name || "";

    /**
     * @deprecated Use usePermission("module.action") from "@/org/hooks/usePermission" instead.
     * hasPermission will be removed in a future sprint once all call sites are migrated.
     */
    const hasPermission = useCallback(
        (key) => {
            if (process.env.NODE_ENV !== "production") {
                console.warn(
                    `[AuthContext] hasPermission("${key}") is deprecated. ` +
                    `Use usePermission("${key}") from @/org/hooks/usePermission instead.`
                );
            }
            const [mod, action] = key.split(".");
            return !!permissions?.[mod]?.[action];
        },
        [permissions]
    );

    /* ── Login ──────────────────────────────────────────── */
    const login = async ({ clinicCode, email, password }) => {
        const res = await api.post("/auth/login", { clinicCode, email, password });
        const { token: newToken, user: userData, csrfToken } = res.data;
        setAccessToken(newToken);
        setCsrfToken(csrfToken);

        // BUG-10 FIX: regionCode stored in sessionStorage (tab-scoped, auto-clears on close)
        // Previously used localStorage which persisted across sessions.
        if (userData.regionCode || (userData.organization && userData.organization.regionCode)) {
            sessionStorage.setItem("regionCode", userData.regionCode || userData.organization.regionCode);
        }

        setUser(userData);

        // Seed branch context for all subsequent API requests (CASE 3 fix)
        // Backend branchContext.middleware.js requires x-branch-id for mutations.
        // User model has branchAccess[] (ObjectId array) but no primaryBranchId field.
        // Use the first assigned branch as the default active branch.
        const defaultBranch = userData.primaryBranchId
            || userData.branchAccess?.[0]
            || null;
        if (defaultBranch) {
            setActiveBranchId(typeof defaultBranch === "object" ? defaultBranch.toString() : defaultBranch);
        }

        // Seed organization context (Rule 21: client-side display use only).
        // Backend ALWAYS uses req.organizationId from JWT — never from body.
        if (userData.organizationId) {
            setOrganizationId(String(userData.organizationId));
        }

        // Connect socket with fresh org token
        connectSocket(newToken);

        return userData;
    };

    /* ── Phase 11: Smart Multi-Org Login ─────────────────── */

    /**
     * Step 1 — Smart login (email + password only, no clinicCode required).
     * Returns { type: "SINGLE_ORG", token, csrfToken } or { type: "MULTI_ORG", orgs: [...] }.
     * For SINGLE_ORG, fully initializes the session (token + CSRF + profile).
     * Caller (LoginPage) is responsible for branching on type.
     */
    const smartLogin = async ({ email, password }) => {
        const res = await api.post("/auth/smart-login", { email, password });
        const data = res.data.data; // { type, token?, csrfToken?, orgs? }

        if (data.type === "SINGLE_ORG") {
            // Full session returned — store token + CSRF immediately
            setAccessToken(data.token);
            setCsrfToken(data.csrfToken);
            // Hydrate the user profile (identical to completeSmartLogin path)
            const profileRes = await api.get("/auth/profile");
            const userData = profileRes.data.user || profileRes.data;
            setUser(userData);
            const defaultBranch = userData.primaryBranchId || userData.branchAccess?.[0] || null;
            if (defaultBranch) {
                setActiveBranchId(typeof defaultBranch === "object" ? defaultBranch.toString() : defaultBranch);
            }
            if (userData.organizationId) setOrganizationId(String(userData.organizationId));
            if (userData.regionCode || userData.organization?.regionCode) {
                sessionStorage.setItem("regionCode", userData.regionCode || userData.organization.regionCode);
            }
            connectSocket(data.token);
            return { type: "SINGLE_ORG", user: userData };
        }

        // MULTI_ORG: return org list — no session set yet
        return data;
    };

    /**
     * Step 2 — Finalise login after multi-org selection.
     * Backend returns { token, csrfToken } with the refreshToken httpOnly cookie already set.
     */
    const completeSmartLogin = async (token, csrfToken) => {
        // Store access token + CSRF so profile request is authenticated
        setAccessToken(token);
        setCsrfToken(csrfToken);

        // Fetch user profile to hydrate the session (same as existing login flow)
        const profileRes = await api.get("/auth/profile");
        const userData = profileRes.data.user || profileRes.data;

        setUser(userData);

        // Seed branch / org context
        const defaultBranch = userData.primaryBranchId || userData.branchAccess?.[0] || null;
        if (defaultBranch) {
            setActiveBranchId(typeof defaultBranch === "object" ? defaultBranch.toString() : defaultBranch);
        }
        if (userData.organizationId) {
            setOrganizationId(String(userData.organizationId));
        }
        if (userData.regionCode || userData.organization?.regionCode) {
            sessionStorage.setItem("regionCode", userData.regionCode || userData.organization.regionCode);
        }

        connectSocket(token);
        return userData;
    };

    const platformLogin = async ({ email, password }) => {
        const res = await publicApi.post("/platform/login", { email, password });
        const { token: newToken, user: userData, csrfToken } = res.data;
        setAccessToken(newToken);
        setCsrfToken(csrfToken);

        if (userData.regionCode) {
            sessionStorage.setItem("regionCode", userData.regionCode); // BUG-10 FIX: sessionStorage
        }

        setUser(userData);
        return userData;
    };

    /* ── Refresh User Profile ───────────────────────────── */
    const refreshUser = useCallback(async () => {
        try {
            const profileRes = await api.get("/auth/profile");
            const userData = profileRes.data.user || profileRes.data;
            setUser(userData);
            return userData;
        } catch {
            // Silent — don't break the UI if refresh fails
        }
    }, []);

    /* ── Logout ─────────────────────────────────────────── */
    const logout = useCallback(async () => {
        try {
            await api.post("/auth/logout");
        } catch (err) {
            // Silence logout errors — token may already be expired
        }
        // Disconnect socket before clearing auth state
        disconnectSocket();
        clearAuth();
        setUser(null);
        sessionStorage.removeItem("regionCode"); // BUG-10 FIX: sessionStorage
        // Force redirect to login page
        window.location.href = "/login";
    }, []);

    /* ── Auth Event Listener (Session Expired) ─────────── */
    useEffect(() => {
        const handleSessionExpired = () => {
            console.log("[AuthContext] Session expired — clearing auth state");
            disconnectSocket(); // Tear down socket on dead session
            setUser(null);
            clearAuth();
            // GAP-2 FIX: ensure loading is always released when session expires.
            // If this fires during initAuth() (between setLoading(true) and finally),
            // the app would be stuck in loading state without this call.
            setLoading(false);
        };
        window.addEventListener("auth-session-expired", handleSessionExpired);
        return () => window.removeEventListener("auth-session-expired", handleSessionExpired);
    }, []);

    /* ═══════════════════════════════════════════════════════════════════════
       PHASE X.3.2 — SAFE AUTH INITIALIZATION
       
       Handles THREE states deterministically:
         1. NO SESSION    → 401, no retry, user=null, loading=false → login redirect
         2. VALID TOKEN   → profile loads, user is set
         3. EXPIRED TOKEN → interceptor silently refreshes, then profile loads
       
       CRITICAL: Does NOT attempt refresh if no access token exists.
       The interceptor only triggers refresh when a valid-looking request
       gets a 401 (expired token). If there's no token at all, the backend
       returns "No token provided" and the interceptor rejects immediately
       without triggering the refresh flow.
    ═══════════════════════════════════════════════════════════════════════ */
    useEffect(() => {
        const initAuth = async () => {
            // ── Fast-exit: no token in storage = definitely not logged in ──
            // Skip the API call entirely. No 401 cascade, no refresh attempt.
            const existingToken = getAccessToken();
            if (!existingToken) {
                console.log("[AuthContext] No token found — skipping profile fetch");
                setUser(null);
                setLoading(false);
                return;
            }

            try {
                const profileRes = await api.get("/auth/profile");
                const userData = profileRes.data.user || profileRes.data;
                console.log("[AuthContext] Profile loaded:", userData?.name || "(anonymous)");
                setUser(userData);

                // Restore branch context on page refresh (mirrors login flow)
                const restoredBranch = userData.primaryBranchId
                    || userData.branchAccess?.[0]
                    || null;
                if (restoredBranch) {
                    setActiveBranchId(typeof restoredBranch === "object" ? restoredBranch.toString() : restoredBranch);
                }

                // Restore organization context on page refresh (Rule 21: client-side use only)
                if (userData.organizationId) {
                    setOrganizationId(String(userData.organizationId));
                }

                // Reconnect socket when session is restored on page refresh
                const token = getAccessToken();
                if (token) connectSocket(token);
            } catch (error) {
                // 401 = session is invalid or expired and refresh failed.
                // Any other error = network issue or server down.
                // In both cases: clear auth state and let ProtectedRoute redirect.
                if (error.response?.status === 401) {
                    console.log("[AuthContext] Auth init 401 — no valid session");
                } else {
                    console.error("[AuthContext] Auth init failed:", error.message);
                }
                clearAuth();
                setUser(null);
            } finally {
                // ALWAYS release the app — never block UI on auth failure
                setLoading(false);
            }
        };

        initAuth();
    }, []); // Run once on mount

    const value = {
        user,
        token: getAccessToken(),
        permissions,
        allowedBranches,
        hasFullBranchAccess,
        multiBranchView,
        roleName,
        hasPermission,
        login,
        platformLogin,
        // Phase 11 — Smart Multi-Org Login
        smartLogin,
        completeSmartLogin,
        logout,
        refreshUser,
        loading,
        regionCode: sessionStorage.getItem("regionCode"), // BUG-10 FIX: sessionStorage
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
