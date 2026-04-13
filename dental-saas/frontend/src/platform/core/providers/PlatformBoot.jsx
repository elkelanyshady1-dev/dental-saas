/**
 * PlatformBoot.jsx
 * v19.6 — Auth-Failure Fast-Exit Gate
 *
 * Changes from v19.3:
 *   - Reads `authFailed` from PlatformAuthContext (added in v19.5).
 *   - Inserts an early-exit gate BEFORE the caps/flags loading check:
 *     if auth definitively failed → redirect immediately, never wait on
 *     capsLoading or flagsLoading (which would be stuck or irrelevant).
 *
 * Correct boot sequence:
 *   1. authLoading        → spinner
 *   2. authFailed         → redirect to login  ← NEW GATE
 *   3. caps/flags loading → spinner
 *   4. kill switch        → lockdown
 *   5. not authed         → redirect to login
 *   6. authed on login    → redirect to dashboard
 *   7. authed elsewhere   → render children
 *
 * Backend auth, billing, contract, and RBAC logic: UNCHANGED.
 */
import { Navigate, useLocation } from 'react-router-dom';
import { usePlatformAuth } from '../../auth/PlatformAuthContext';
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities';
import { usePlatformFeatureFlags } from '../../hooks/usePlatformFeatureFlags';
import PlatformLockdown from '../components/PlatformLockdown';
import { Activity } from 'lucide-react';

function PlatformLoadingScreen() {
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
            <Activity className="w-10 h-10 text-blue-500 animate-spin" />
            <p className="text-slate-400 font-mono text-xs uppercase tracking-widest animate-pulse">
                Initializing Sovereign Platform...
            </p>
        </div>
    );
}

export function PlatformBoot({ children }) {
    const { user, token, loading: authLoading, authResolved, authFailed } = usePlatformAuth();
    const { loading: capsLoading } = usePlatformCapabilities();
    const { loading: flagsLoading, isKillSwitchActive } = usePlatformFeatureFlags();
    const location = useLocation();

    // 1. Auth in-progress — wait
    if (authLoading || !authResolved) {
        return <PlatformLoadingScreen />;
    }

    // 2. Auth definitively failed (refresh returned 401 or network error).
    //    Redirect immediately — never wait on capsLoading or flagsLoading.
    //    Those hooks self-resolve to loading=false when token is absent,
    //    but this gate ensures we never render the spinner for any extra tick.
    if (authFailed) {
        console.info("[BOOT] authFailed — redirecting to login");
        return <Navigate to="/platform/login" replace />;
    }

    // 3. Capabilities and feature flags still loading — wait
    if (capsLoading || flagsLoading) {
        return <PlatformLoadingScreen />;
    }

    // 4. Kill switch check (high-priority safety gate)
    if (isKillSwitchActive) {
        return <PlatformLockdown />;
    }

    const isLoginPage = location.pathname === "/platform/login";

    // 5. Not authenticated — redirect to login
    if (!token || !user || user.type !== 'platform') {
        if (isLoginPage) return children;  // allow login page to render
        return <Navigate to="/platform/login" state={{ from: location }} replace />;
    }

    // 6. Authenticated users should not see the login page
    if (isLoginPage) {
        return <Navigate to="/platform/dashboard" replace />;
    }

    // 7. All checks passed — render the platform
    return children;
}
