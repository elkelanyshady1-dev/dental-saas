/**
 * useFeaturesControl.js — React Query Hooks for Features Control Center
 *
 * All server state for the Features Control Center managed through TanStack Query.
 * Follows the established pattern from useSecurity.js and useAuthAnalytics.js.
 *
 * Hooks:
 *   useModules()          → module states + usage stats
 *   useFeatureDecisions() → feature auth decisions + chains
 *   useLivePermissions()  → role × permission matrix (live from DB)
 *   useConflicts()        → smart conflict detection
 *   useSimulateAccess()   → simulate auth decision (mutation)
 *   useToggleModule()     → toggle module on/off (mutation)
 *
 * PLANE: Org only.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { featuresControlApi } from "../api/featuresControl.api";

// ─── Cache Keys (exported for real-time invalidation) ────────────────────────

export const FCC_KEYS = {
    all: ["features-control"],
    modules: ["features-control", "modules"],
    features: ["features-control", "features"],
    permissions: ["features-control", "permissions"],
    conflicts: ["features-control", "conflicts"],
};

// ─── Modules ────────────────────────────────────────────────────────────────

/**
 * Fetches module states with live usage stats.
 * Auto-refreshes every 30s for near-real-time usage counts.
 */
export function useModules() {
    return useQuery({
        queryKey: FCC_KEYS.modules,
        queryFn: () => featuresControlApi.getModules().then((r) => r.data.data),
        staleTime: 30_000, // 30s — modules can change via toggle
    });
}

// ─── Feature Decisions ──────────────────────────────────────────────────────

/**
 * Fetches all features with their computed authorization decision chains.
 */
export function useFeatureDecisions() {
    return useQuery({
        queryKey: FCC_KEYS.features,
        queryFn: () => featuresControlApi.getFeatures().then((r) => r.data.data),
        staleTime: 30_000,
    });
}

// ─── Live Permissions Matrix ────────────────────────────────────────────────

/**
 * Fetches the live role × permission matrix from the database.
 * Rarely changes — longer stale time.
 */
export function useLivePermissions() {
    return useQuery({
        queryKey: FCC_KEYS.permissions,
        queryFn: () => featuresControlApi.getPermissions().then((r) => r.data.data),
        staleTime: 2 * 60_000, // 2min — role matrix rarely changes
    });
}

// ─── Conflicts ──────────────────────────────────────────────────────────────

/**
 * Smart conflict detection — flag overrides, missing deps, permission gaps.
 * Auto-refreshes every 60s.
 */
export function useConflicts() {
    return useQuery({
        queryKey: FCC_KEYS.conflicts,
        queryFn: () => featuresControlApi.getConflicts().then((r) => r.data.data),
        staleTime: 60_000, // 1min — conflict analysis
    });
}

// ─── Simulate Access Decision ───────────────────────────────────────────────

/**
 * Simulate an authorization decision for a given permission.
 * Returns step-by-step evaluation through all auth layers.
 */
export function useSimulateAccess() {
    return useMutation({
        mutationFn: (data) =>
            featuresControlApi.simulate(data).then((r) => r.data.data),
    });
}

// ─── Toggle Module ──────────────────────────────────────────────────────────

/**
 * Toggle a module on/off. Invalidates all FCC caches on success.
 * Backend emits Socket.IO event: module.updated
 */
export function useToggleModule() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ moduleKey, enabled }) =>
            featuresControlApi.toggleModule(moduleKey, enabled).then((r) => r.data),
        onSuccess: () => {
            // Invalidate all features-control caches — module state affects everything
            queryClient.invalidateQueries({ queryKey: FCC_KEYS.all });
        },
    });
}
