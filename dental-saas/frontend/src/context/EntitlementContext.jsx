/**
 * EntitlementContext.jsx — DEPRECATED (Phase 22)
 *
 * ⚠️ DEPRECATED: This context has been superseded by FeatureContext.jsx.
 *
 * FeatureContext provides a unified interface for both module entitlements
 * (plan-level access) and feature flags (sub-feature gating).
 *
 * Migration guide:
 *   BEFORE: const { isEntitled } = useEntitlements();
 *   AFTER:  const { hasModule, hasFeature } = useFeatures();
 *
 *   BEFORE: useEntitlement("orthodontics")
 *   AFTER:  hasModule("orthodontics")
 *
 * This file is retained as a thin compatibility shim.
 * If you are reading this — use FeatureContext instead.
 *
 * PLANE: Org only.
 */

import { createContext, useContext } from "react";
import { useFeatures } from "./FeatureContext";

// ─── Deprecated Context (delegates to FeatureContext) ────────────────────────

const EntitlementContext = createContext({
    modules: {},
    features: {},
    isEntitled: () => false,
});

/**
 * @deprecated Use useFeatures().hasModule() instead
 */
export const useEntitlements = () => {
    const { modules, features, hasModule, hasFeature } = useFeatures();
    return {
        modules,
        features,
        isEntitled: (key) => hasModule(key) || hasFeature(key),
    };
};

/**
 * @deprecated Use useFeatures().hasModule(key) instead
 */
export function useEntitlement(key) {
    const { isEntitled } = useEntitlements();
    return isEntitled(key);
}

/**
 * @deprecated Use <FeatureProvider> instead — this is a no-op pass-through.
 */
export function EntitlementProvider({ children }) {
    // No-op: FeatureProvider already wraps the tree in OrgShell.
    // This exists solely for backward compatibility if any lazy-loaded
    // module still imports it.
    return children;
}
