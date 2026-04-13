/**
 * useFeature.js — Feature Flag Hook
 *
 * HIGH-002 FIX (Production Readiness Patch):
 * Previously used `user.platformRole === "superadmin"` — SENTINEL violation.
 * Now delegates to FeatureContext.hasModule() which resolves from the
 * subscription plan pipeline (capabilities.modules).
 *
 * For org users: checks organization.capabilities.modules[featureKey].
 * For platform users viewing org features: not applicable (platform has
 * its own feature flag system via PlatformShell).
 *
 * SENTINEL RULE: role === "admin" — FORBIDDEN.
 * SENTINEL RULE: capabilities-based checks — ENFORCED.
 *
 * PLANE: Org only.
 */
import { useFeatures } from "../context/FeatureContext";

export default function useFeature(featureKey) {
    const { hasModule, hasFeature } = useFeatures();

    // Check module-level entitlement first (e.g., "orthodontics", "finance")
    if (hasModule(featureKey)) return true;

    // Check sub-feature flag (e.g., "AI_SEGMENTATION")
    if (hasFeature(featureKey)) return true;

    return false;
}
