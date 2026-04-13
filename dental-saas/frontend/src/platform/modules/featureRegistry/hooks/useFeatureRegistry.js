/**
 * useFeatureRegistry.js — React Query Hooks for Feature Registry
 *
 * TASK-ENTITLEMENT-FULLSTACK-001
 *
 * Provides cached, auto-refetching data hooks for the Feature Registry admin page.
 * Mutations invalidate the registry cache to ensure UI consistency.
 *
 * PLANE: Platform only.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { featureRegistryApi } from "../api/featureRegistry.api";

const KEYS = {
    registry: ["featureRegistry"],
    modules: ["featureRegistry", "modules"],
    features: ["featureRegistry", "features"],
};

/**
 * Fetch the full registry (modules + features + stats).
 */
export function useFeatureRegistry() {
    return useQuery({
        queryKey: KEYS.registry,
        queryFn: () => featureRegistryApi.getRegistry(),
        staleTime: 30_000, // 30s — acceptable for admin page
        refetchOnWindowFocus: true,
    });
}

/**
 * Fetch features filtered by module key.
 * @param {string} moduleKey
 */
export function useModuleFeatures(moduleKey) {
    return useQuery({
        queryKey: [...KEYS.features, moduleKey],
        queryFn: () => featureRegistryApi.listFeatures(moduleKey),
        enabled: !!moduleKey,
    });
}

/**
 * Update a module definition.
 */
export function useUpdateModule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }) => featureRegistryApi.updateModule(id, updates),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.registry });
            qc.invalidateQueries({ queryKey: KEYS.modules });
        },
    });
}

/**
 * Toggle module enabled state.
 */
export function useToggleModule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, enabled }) => featureRegistryApi.toggleModule(id, enabled),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.registry });
        },
    });
}

/**
 * Update a feature definition.
 */
export function useUpdateFeature() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, updates }) => featureRegistryApi.updateFeature(id, updates),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.registry });
            qc.invalidateQueries({ queryKey: KEYS.features });
        },
    });
}

/**
 * Update matrix plan assignments (bulk toggle).
 */
export function useUpdateMatrix() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ type, key, plans }) => featureRegistryApi.updateMatrix(type, key, plans),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.registry });
        },
    });
}

/**
 * Trigger manual registry seed.
 */
export function useSeedRegistry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => featureRegistryApi.seedRegistry(),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: KEYS.registry });
        },
    });
}
