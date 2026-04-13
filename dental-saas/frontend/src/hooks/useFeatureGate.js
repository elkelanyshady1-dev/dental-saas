/**
 * useFeatureGate.js — Feature/Module Gate Hooks
 *
 * Composable hooks for checking module and feature gate status.
 * All checks flow through FeatureContext (never raw org checks).
 *
 * USAGE:
 *   import { useModuleEnabled, useFeatureEnabled } from "@/hooks/useFeatureGate";
 *
 *   function OrthoNav() {
 *       const orthoEnabled = useModuleEnabled("orthodontics");
 *       if (!orthoEnabled) return null;
 *       return <OrthoLink />;
 *   }
 *
 * PLANE: Org only.
 */

import { useFeatures } from "@/context/FeatureContext";

/**
 * useModuleEnabled
 * Check if a single module is enabled for the current organization.
 *
 * @param {string} moduleName — e.g., "orthodontics", "labs", "analytics"
 * @returns {boolean}
 */
export function useModuleEnabled(moduleName) {
    const { hasModule } = useFeatures();
    return hasModule(moduleName);
}

/**
 * useFeatureEnabled
 * Check if a single feature flag is enabled.
 *
 * @param {string} featureKey — e.g., "AI_SEGMENTATION"
 * @returns {boolean}
 */
export function useFeatureEnabled(featureKey) {
    const { hasFeature } = useFeatures();
    return hasFeature(featureKey);
}

/**
 * useSubscriptionStatus
 * Returns the current subscription status and whether it's active.
 *
 * @returns {{ status: string, isActive: boolean }}
 */
export function useSubscriptionStatus() {
    const { subscriptionStatus, isSubscriptionActive } = useFeatures();
    return { status: subscriptionStatus, isActive: isSubscriptionActive };
}

/**
 * useModuleCheck
 * Batch-check multiple modules with a single hook.
 *
 * @param {string[]} moduleNames — Array of module names
 * @returns {Record<string, boolean>}
 *
 * @example
 *   const mods = useModuleCheck(["orthodontics", "labs", "analytics"]);
 *   // mods.orthodontics === true
 */
export function useModuleCheck(moduleNames) {
    const { hasModule } = useFeatures();
    const result = {};
    for (const name of moduleNames) {
        result[name] = hasModule(name);
    }
    return result;
}
