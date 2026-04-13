/**
 * PlatformShell.jsx
 * v21.0 TDS Sovereign — Provider Isolation Wrapper + Boot Orchestrator
 *
 * Mount order:
 *   QueryClientProvider (React Query)
 *     └─ PlatformAuthProvider (auth context)
 *         └─ PlatformCapabilitiesProvider (shared capability state)
 *             └─ PlatformLoggerInit (logger setup)
 *                 └─ PlatformBoot (deterministic boot gate)
 *                     └─ PlatformErrorBoundary (UI crash shield)
 *                         └─ Outlet (routes: login, PlatformGuard, PlatformLayout)
 */
import { PlatformAuthProvider, usePlatformAuth } from "../../auth/PlatformAuthContext";
import { PlatformCapabilitiesProvider } from "./PlatformCapabilitiesProvider";
import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import platformLogger from "../../observability/platformEventLogger";
import { PlatformBoot } from "./PlatformBoot";
import { PlatformErrorBoundary } from "../components/PlatformErrorBoundary";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query/queryClient";

function PlatformLoggerInit({ children }) {
    const { user } = usePlatformAuth();

    useEffect(() => {
        if (user) {
            platformLogger.init(user);
        }
    }, [user]);

    return children;
}

/**
 * PlatformShell
 * Sovereign root for the Platform Plane.
 * QueryClientProvider MUST be outermost — platform modules use React Query hooks.
 * PlatformAuthProvider sits after query — never duplicate it in App.jsx.
 * PlatformCapabilitiesProvider sits after auth so it has access to token/authResolved.
 * PlatformErrorBoundary sits inside boot/auth so renders errors are caught before blank screen.
 */
export function PlatformShell() {
    return (
        <QueryClientProvider client={queryClient}>
            <PlatformAuthProvider>
                <PlatformCapabilitiesProvider>
                    <PlatformLoggerInit>
                        <PlatformBoot>
                            <PlatformErrorBoundary>
                                <Outlet />
                            </PlatformErrorBoundary>
                        </PlatformBoot>
                    </PlatformLoggerInit>
                </PlatformCapabilitiesProvider>
            </PlatformAuthProvider>
        </QueryClientProvider>
    );
}
