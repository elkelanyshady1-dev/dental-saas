/**
 * CapabilityContext.jsx — Global Capability Provider
 *
 * Provides the resolved capability map from the backend to the entire org UI.
 * Capabilities are derived from the user's hydrated role permissions at login
 * and are made available as a flat map: { "patients.update": true, ... }
 *
 * This context is the SINGLE source of truth for UI capability checks.
 * All UI visibility decisions MUST flow through this context — never
 * check role names directly.
 *
 * SENTINEL RULE: capabilities.includes() pattern — ENFORCED.
 * SENTINEL RULE: role === "admin" — FORBIDDEN.
 *
 * PLANE: Org only.
 */

import { createContext, useContext, useMemo } from "react";
import { useAuth } from "./AuthContext";

const CapabilityContext = createContext({});

/**
 * useCapabilities
 * Returns the full flat capability map.
 * @returns {Record<string, boolean>}
 */
export const useCapabilities = () => useContext(CapabilityContext);

/**
 * CapabilityProvider
 * Derives a flat capability map from the user's nested role permissions.
 *
 * Nested permissions from backend:
 *   { patients: { read: true, create: true }, security: { manage: true } }
 *
 * Flattened to:
 *   { "patients.read": true, "patients.create": true, "security.manage": true }
 *
 * This flattened shape allows efficient O(1) lookup by both the useCapability
 * hook and the <Can> component.
 */
export function CapabilityProvider({ children }) {
    const { permissions } = useAuth();

    const capabilities = useMemo(() => {
        if (!permissions || typeof permissions !== "object") return {};

        const flat = {};
        for (const [module, actions] of Object.entries(permissions)) {
            if (actions && typeof actions === "object") {
                for (const [action, granted] of Object.entries(actions)) {
                    if (granted) {
                        flat[`${module}.${action}`] = true;
                    }
                }
            }
        }
        return flat;
    }, [permissions]);

    return (
        <CapabilityContext.Provider value={capabilities}>
            {children}
        </CapabilityContext.Provider>
    );
}
