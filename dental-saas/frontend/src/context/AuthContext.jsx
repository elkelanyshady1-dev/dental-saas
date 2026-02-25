import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api, { setAccessToken, getAccessToken, setCsrfToken } from "../services/api";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    /* ── Derived permission helpers ──────────────────────── */
    // ... same as before ...
    const permissions = user?.roleId?.permissions || {};
    const allowedBranches = user?.branchAccess || [];
    const hasFullBranchAccess = user?.hasFullBranchAccess || false;
    const multiBranchView = !!permissions?.calendar?.multiBranchView;
    const roleName = user?.roleId?.name || "";

    const hasPermission = useCallback(
        (key) => {
            if (user?.platformRole === "superadmin" || user?.platformRole === "platform_admin") return true;
            const [mod, action] = key.split(".");
            return !!permissions?.[mod]?.[action];
        },
        [user, permissions]
    );

    /* ── Login ──────────────────────────────────────────── */
    const login = async ({ clinicCode, email, password }) => {
        const res = await api.post("/auth/login", { clinicCode, email, password });
        const { token: newToken, user: userData, csrfToken } = res.data;
        setAccessToken(newToken);
        setCsrfToken(csrfToken);
        setUser(userData);
        return userData;
    };

    const platformLogin = async ({ email, password }) => {
        const res = await api.post("/platform/login", { email, password });
        const { token: newToken, user: userData, csrfToken } = res.data;
        setAccessToken(newToken);
        setCsrfToken(csrfToken);
        setUser(userData);
        return userData;
    };

    /* ── Logout ─────────────────────────────────────────── */
    const logout = useCallback(async () => {
        try {
            await api.post("/auth/logout");
        } catch (err) {
            // Silence logout errors
        }
        setAccessToken("");
        setUser(null);
        // localStorage.removeItem("user"); // If we want to persist user metadata, but security rules say not to store tokens.
    }, []);

    /* ── Auth Event Listener (Session Expired) ─────────── */
    useEffect(() => {
        const handleSessionExpired = () => {
            setUser(null);
            setAccessToken("");
            // Optional: Alert user or redirect manually if window location isn't enough
        };
        window.addEventListener("auth-session-expired", handleSessionExpired);
        return () => window.removeEventListener("auth-session-expired", handleSessionExpired);
    }, []);

    /* ── Load profile on mount (via Refresh) ────────────── */
    useEffect(() => {
        const initAuth = async () => {
            try {
                // Try to refresh token on mount (Layer 1 leverage)
                const res = await api.post("/auth/refresh");
                const { token: newToken, csrfToken } = res.data;
                setAccessToken(newToken);
                setCsrfToken(csrfToken);

                // Fetch Profile
                const payload = JSON.parse(atob(newToken.split('.')[1]));
                const profileUrl = payload.type === "platform" ? "/platform/dashboard" : "/auth/profile";
                const profileRes = await api.get(profileUrl);
                setUser(profileRes.data.user || profileRes.data);
            } catch (error) {
                // No valid session
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        if (!getAccessToken()) {
            initAuth();
        } else {
            setLoading(false);
        }
    }, []);

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
        logout,
        loading,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
