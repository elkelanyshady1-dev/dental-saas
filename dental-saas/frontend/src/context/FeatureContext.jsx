/**
 * FeatureContext.jsx — Organization Feature & Module Gate Provider
 *
 * TASK-ENTITLEMENT-SYSTEM-002 — Phase 12 Entitlement Engine
 *
 * Provides subscription-aware feature/module gating to the entire org UI.
 *
 * v2.0 — Now reads from organization.capabilities (resolved from backend
 * plan pipeline via featureRegistry normalization), NOT raw org.modules.
 *
 * Sources (in priority order):
 *   1. organization.capabilities.modules  (from plan pipeline — gold standard)
 *   2. organization.modules               (backward compat fallback)
 *   3. organization.capabilities.features (sub-feature gating)
 *   4. organization.features              (legacy feature flags)
 *
 * USAGE:
 *   const { hasModule, hasFeature } = useFeatures();
 *   if (hasModule("orthodontics")) { ... }
 *   if (hasFeature("orthodontics.aiAnalysis")) { ... }
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED.
 * SENTINEL RULE: role === "admin" — FORBIDDEN.
 *
 * PLANE: Org only. Platform plane has its own feature flag system.
 */

import { createContext, useContext, useMemo, useCallback } from "react";
import { useAuth } from "./AuthContext";

// ─── Context ─────────────────────────────────────────────────────────────────

const FeatureContext = createContext({
    modules: {},
    features: {},
    subscriptionStatus: "trial",
    hasModule: () => false,
    hasFeature: () => false,
    isSubscriptionActive: false,
    loading: false,
});

/**
 * useFeatures — access the full feature context.
 * @returns {FeatureContextValue}
 */
export const useFeatures = () => useContext(FeatureContext);

// ─── Provider ────────────────────────────────────────────────────────────────

/**
 * FeatureProvider
 *
 * Reads modules and features from the authenticated user's organization.
 * Priority: capabilities.modules (plan-resolved) > modules (legacy).
 *
 * Module shape (from plan pipeline via featureRegistry):
 *   { patients: true, orthodontics: true, labs: false, ... }
 *
 * Feature shape (from plan pipeline + org feature flags):
 *   { "orthodontics.viewCases": true, "orthodontics.aiAnalysis": true, ... }
 *   Also includes org-level flags: { AI_SEGMENTATION: true, ... }
 */
export function FeatureProvider({ children }) {
    const { user, loading: authLoading } = useAuth();

    const modules = useMemo(() => {
        // Gold standard: backend-resolved capabilities from plan pipeline
        const capsModules = user?.organization?.capabilities?.modules;
        if (capsModules && typeof capsModules === "object" && Object.keys(capsModules).length > 0) {
            return capsModules;
        }
        // Backward compat fallback: legacy org.modules
        return user?.organization?.modules || user?.modules || {};
    }, [
        user?.organization?.capabilities?.modules,
        user?.organization?.modules,
        user?.modules,
    ]);

    const features = useMemo(() => {
        const result = {};

        // Layer 1: Sub-feature capabilities from plan pipeline
        const capsFeatures = user?.organization?.capabilities?.features;
        if (capsFeatures && typeof capsFeatures === "object") {
            for (const [key, val] of Object.entries(capsFeatures)) {
                result[key] = Boolean(val);
            }
        }

        // Layer 2: Legacy org feature flags (merged on top — org overrides take precedence)
        const orgFeatures = user?.organization?.features || {};
        if (orgFeatures && typeof orgFeatures === "object") {
            for (const [key, val] of Object.entries(orgFeatures)) {
                // Handle both { enabled: true } shape and raw boolean
                result[key] = typeof val === "object" ? !!val.enabled : !!val;
            }
        }

        return result;
    }, [
        user?.organization?.capabilities?.features,
        user?.organization?.features,
    ]);

    const subscriptionStatus = useMemo(() => {
        return (
            user?.organization?.subscription?.status ||
            user?.subscriptionStatus ||
            "trial"
        );
    }, [user?.organization?.subscription?.status, user?.subscriptionStatus]);

    const isSubscriptionActive = useMemo(() => {
        return ["active", "trial"].includes(subscriptionStatus);
    }, [subscriptionStatus]);

    /**
     * hasModule — check if a module is enabled for this organization.
     * @param {string} moduleName — e.g., "orthodontics", "labs", "analytics"
     * @returns {boolean}
     */
    const hasModule = useCallback(
        (moduleName) => {
            if (!moduleName) return false;
            return modules[moduleName] === true;
        },
        [modules]
    );

    /**
     * hasFeature — check if a feature flag or sub-feature is enabled.
     * @param {string} featureKey — e.g., "AI_SEGMENTATION", "orthodontics.aiAnalysis"
     * @returns {boolean}
     */
    const hasFeature = useCallback(
        (featureKey) => {
            if (!featureKey) return false;
            return features[featureKey] === true;
        },
        [features]
    );

    const value = useMemo(
        () => ({
            modules,
            features,
            subscriptionStatus,
            hasModule,
            hasFeature,
            isSubscriptionActive,
            loading: authLoading,
        }),
        [modules, features, subscriptionStatus, hasModule, hasFeature, isSubscriptionActive, authLoading]
    );

    return (
        <FeatureContext.Provider value={value}>
            {children}
        </FeatureContext.Provider>
    );
}
