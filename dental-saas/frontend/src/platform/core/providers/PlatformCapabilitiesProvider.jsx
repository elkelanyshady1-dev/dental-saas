/**
 * PlatformCapabilitiesProvider.jsx
 * v21.0 — Shared Capability Context (Eliminates Hook Race Condition)
 *
 * Provides a single, shared capability state to the entire platform plane.
 * All consumers (PlatformBoot, RequireCapability, Sidebar, etc.) read
 * from the SAME context — no duplicate fetches, no independent state.
 *
 * Must be mounted AFTER PlatformAuthProvider so it has access to
 * token and authResolved.
 *
 * Migration from usePlatformCapabilities hook:
 *   - All fetch logic moved here (unchanged)
 *   - Contract validation preserved
 *   - usePlatformCapabilities() now reads from this context
 */
import { createContext, useState, useEffect, useCallback, useRef } from "react";
import { platformApiClient } from "../api/platformApiClient";
import { usePlatformAuth } from "../../auth/PlatformAuthContext";

export const PlatformCapabilitiesContext = createContext(null);

export function PlatformCapabilitiesProvider({ children }) {
    const { token, authResolved } = usePlatformAuth();
    const [capabilities, setCapabilities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const lastFetchedToken = useRef(null);

    const fetchCapabilities = useCallback(async () => {
        // RACE SAFETY: Wait for auth cycle to resolve
        if (!authResolved) return;

        // If no token, we can't fetch. Reset state and stop.
        if (!token) {
            setCapabilities([]);
            setLoading(false);
            return;
        }

        // Optimization: Prevent redundant fetches if token hasn't changed
        if (lastFetchedToken.current === token) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const { data } = await platformApiClient.governance.capabilitiesList();

            if (data?.capabilities && Array.isArray(data.capabilities)) {
                // v19.3: Harden against drift by validating against contract
                const { PLATFORM_CAPABILITIES } = await import("@packages/platform-contract/platformContract");
                const validCaps = Object.values(PLATFORM_CAPABILITIES);

                const cleanCaps = data.capabilities.filter(cap => {
                    if (validCaps.includes(cap)) return true;
                    console.error(`[CapabilityGuard] Architectural Drift: Unknown capability "${cap}" returned by backend.`);
                    return false;
                });

                setCapabilities(cleanCaps);
                lastFetchedToken.current = token;
            }
            setError(null);
        } catch (err) {
            console.error("[CapabilityEngine] Failed to resolve contract:", err.message);
            setError(err.message);
            setCapabilities([]); // Zero out on error
        } finally {
            setLoading(false);
        }
    }, [token, authResolved]);

    useEffect(() => {
        fetchCapabilities();
    }, [fetchCapabilities]);

    /**
     * hasCapability
     * Pure declarative check against the backend-provided matrix.
     */
    const hasCapability = useCallback((permission) => {
        if (!Array.isArray(capabilities)) return false;
        return capabilities.includes(permission);
    }, [capabilities]);

    const value = {
        capabilities,
        loading,
        error,
        hasCapability,
        refresh: fetchCapabilities
    };

    return (
        <PlatformCapabilitiesContext.Provider value={value}>
            {children}
        </PlatformCapabilitiesContext.Provider>
    );
}
