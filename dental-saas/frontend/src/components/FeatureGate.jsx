/**
 * FeatureGate.jsx — Subscription-Aware Feature Gate Components
 *
 * Conditionally renders children based on organization module enablement
 * or feature flag status. Works in tandem with FeatureContext.
 *
 * USAGE:
 *   // Gate by module (from Organization.modules)
 *   <FeatureGate module="orthodontics">
 *       <OrthoModule />
 *   </FeatureGate>
 *
 *   // Gate by feature flag (from Organization.features)
 *   <FeatureGate feature="AI_SEGMENTATION">
 *       <SegmentationPanel />
 *   </FeatureGate>
 *
 *   // Combined — requires BOTH module AND feature
 *   <FeatureGate module="orthodontics" feature="ORTHO_AI">
 *       <OrthoAI />
 *   </FeatureGate>
 *
 *   // With upgrade fallback
 *   <FeatureGate module="analytics" fallback={<UpgradePrompt feature="Analytics" />}>
 *       <AnalyticsDashboard />
 *   </FeatureGate>
 *
 * SENTINEL RULE: capabilities.includes() — ENFORCED.
 * SENTINEL RULE: role === "admin" — FORBIDDEN.
 *
 * PLANE: Org only.
 */

import { useFeatures } from "@/context/FeatureContext";

/**
 * FeatureGate
 * Renders children only if the required module AND/OR feature is enabled.
 *
 * @param {Object} props
 * @param {string}           [props.module]    — Module name (e.g., "orthodontics")
 * @param {string}           [props.feature]   — Feature flag key (e.g., "AI_SEGMENTATION")
 * @param {React.ReactNode}  [props.fallback]  — Content to render when gated
 * @param {React.ReactNode}   props.children   — Content to render when allowed
 */
export default function FeatureGate({ module, feature, fallback = null, children }) {
    const { hasModule, hasFeature, loading } = useFeatures();

    // While loading, render nothing to prevent flash
    if (loading) return null;

    // Check module requirement
    if (module && !hasModule(module)) return fallback;

    // Check feature requirement
    if (feature && !hasFeature(feature)) return fallback;

    return children;
}

/**
 * FeatureHidden
 * Inverse of FeatureGate — renders children only when module/feature is DISABLED.
 * Useful for showing "upgrade" or "coming soon" prompts.
 *
 * @param {Object} props
 * @param {string}           [props.module]  — Module name
 * @param {string}           [props.feature] — Feature flag key
 * @param {React.ReactNode}   props.children — Content to render when disabled
 */
export function FeatureHidden({ module, feature, children }) {
    const { hasModule, hasFeature, loading } = useFeatures();

    if (loading) return null;

    // Show children only when the gate would BLOCK
    if (module && hasModule(module)) return null;
    if (feature && hasFeature(feature)) return null;

    return children;
}

/**
 * SubscriptionGate
 * Renders children only if the organization subscription is active (active or trial).
 * Useful for gating entire sections behind subscription status.
 *
 * @param {Object} props
 * @param {React.ReactNode}  [props.fallback]  — Content when subscription inactive
 * @param {React.ReactNode}   props.children   — Content when subscription active
 */
export function SubscriptionGate({ fallback = null, children }) {
    const { isSubscriptionActive, loading } = useFeatures();

    if (loading) return null;
    if (!isSubscriptionActive) return fallback;

    return children;
}
