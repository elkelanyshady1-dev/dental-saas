/**
 * PlatformGuard.jsx
 * v20.2 — Read-Only Auth Gate (NO data fetching)
 *
 * PlatformGuard is a pure routing gate that reads already-resolved auth state.
 * ALL data fetching (flags, capabilities, kill switch) is handled upstream
 * by PlatformBoot, which only renders PlatformGuard after boot is complete.
 *
 * Rules:
 * - READ state only. NEVER trigger fetches.
 * - NEVER call usePlatformFeatureFlags or usePlatformCapabilities here.
 * - Redirect on missing token or wrong user type.
 *
 * v20.2 — Removed diagnostic console.log calls.
 */
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { usePlatformAuth } from "../../auth/PlatformAuthContext";

export function PlatformGuard() {
    const { user, token, loading, authResolved } = usePlatformAuth();
    const location = useLocation();

    // Wait for auth resolution (should be instant since PlatformBoot already waited)
    if (loading || !authResolved) return null;

    // Token or user missing — evict to login
    if (!token || !user || user.type !== "platform") {
        return <Navigate to="/platform/login" state={{ from: location }} replace />;
    }

    // Auth valid — proceed to layout
    return <Outlet />;
}