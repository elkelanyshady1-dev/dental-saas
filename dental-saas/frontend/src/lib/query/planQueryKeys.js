/**
 * planQueryKeys.js — Centralized React Query Keys for Plan Domain
 *
 * PLANE: Cross-plane (used by Platform + Public)
 *
 * All plan-related query keys are defined here to ensure:
 *   1. Consistent cache key naming across planes
 *   2. Targeted invalidation after mutations
 *   3. No stale data between plane transitions
 *
 * Usage:
 *   import { PLAN_QUERY_KEYS } from "@/lib/query/planQueryKeys";
 *   useQuery({ queryKey: PLAN_QUERY_KEYS.PUBLIC_PLANS("US"), ... });
 *   queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.ALL_PUBLIC });
 */

export const PLAN_QUERY_KEYS = {
    // ── Platform Plane ────────────────────────────────────────────────────────

    /** Single plan version by ID — used by PlanBuilderPage */
    planVersion: (versionId) => ["planVersion", versionId],

    /** All plan versions (list) — used by PlansListPage */
    planVersionsList: () => ["planVersions", "list"],

    /** All plan templates — used by PlansListPage */
    planTemplatesList: () => ["planTemplates", "list"],

    /** Feature modules registry */
    featureModules: () => ["featureModules"],

    // ── Public / Marketing Plane ──────────────────────────────────────────────

    /** Public plans for marketing pricing page (country-scoped) */
    publicPlans: (country) => ["publicPlans", country],

    /** Invalidation helper: matches ALL publicPlans regardless of country */
    ALL_PUBLIC: ["publicPlans"],

    // ── Invalidation Helpers ──────────────────────────────────────────────────

    /** Matches ALL plan-related queries across both planes */
    ALL_PLANS: ["plan"],

    /** Matches all platform-level plan queries */
    ALL_PLATFORM_PLANS: ["planVersion"],
};

export default PLAN_QUERY_KEYS;
