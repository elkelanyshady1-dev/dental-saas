/**
 * usePatient.js — React Query hook for a single Patient Aggregate
 *
 * Provides:
 *   - Full patient aggregate (core, clinical, financial, governance)
 *   - Background refetch on WebSocket events
 *   - Optimistic patch/update mutations with automatic cache invalidation
 *
 * Usage:
 *   const { patient, isLoading, update, patch } = usePatient(patientId);
 *
 * API layer: modules/org/patients/api/patients.api.js
 * Query keys: @/lib/query/queryKeys (QK.patients)
 * Architecture: org-plane only, organizationId derived from JWT.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientsApi } from '../api/patients.api';
import { QK } from '@/lib/query';

// ── Single Patient Query ──────────────────────────────────────────────────

/**
 * @param {string} patientId
 * @param {{ enabled?: boolean }} options
 */
export function usePatient(patientId, options = {}) {
    const { enabled = true } = options;

    const query = useQuery({
        queryKey: QK.patients.detail(patientId),
        queryFn: async () => {
            const res = await patientsApi.get(patientId);
            return res.data?.data || res.data;
        },
        enabled: !!patientId && enabled,
        staleTime: 60_000,
    });

    return {
        patient: query.data ?? null,
        aggregate: query.data ?? null,  // Alias for backward compat with PatientLayout
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isError: query.isError,
        error: query.error,
        refetch: query.refetch,

        /** Refetch silently (for WebSocket-triggered updates) */
        refetchSilent: () => query.refetch(),
    };
}

// ── Update (PUT) Mutation ──────────────────────────────────────────────────

export function useUpdatePatient() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }) => {
            const res = await patientsApi.update(id, data);
            return res.data?.data || res.data;
        },
        onMutate: async ({ id, data }) => {
            await qc.cancelQueries({ queryKey: QK.patients.detail(id) });
            const previous = qc.getQueryData(QK.patients.detail(id));

            // Optimistically update the detail cache
            if (previous) {
                qc.setQueryData(QK.patients.detail(id), (old) => ({
                    ...old,
                    core: { ...(old?.core || {}), ...data },
                }));
            }

            return { previous, id };
        },
        onError: (err, variables, context) => {
            if (context?.previous) {
                qc.setQueryData(QK.patients.detail(context.id), context.previous);
            }
        },
        onSuccess: (data, variables) => {
            // Set the detail cache with the actual server response
            qc.setQueryData(QK.patients.detail(variables.id), data);
        },
        onSettled: (_, __, variables) => {
            qc.invalidateQueries({ queryKey: QK.patients.detail(variables.id) });
            qc.invalidateQueries({ queryKey: QK.patients.lists() });
        },
    });
}

// ── Patch (PATCH) Mutation ─────────────────────────────────────────────────

export function usePatchPatient() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }) => {
            const res = await patientsApi.patch(id, data);
            return res.data?.data || res.data;
        },
        onMutate: async ({ id, data }) => {
            await qc.cancelQueries({ queryKey: QK.patients.detail(id) });
            const previous = qc.getQueryData(QK.patients.detail(id));

            if (previous) {
                qc.setQueryData(QK.patients.detail(id), (old) => ({
                    ...old,
                    core: { ...(old?.core || {}), ...data },
                }));
            }

            return { previous, id };
        },
        onError: (err, variables, context) => {
            if (context?.previous) {
                qc.setQueryData(QK.patients.detail(context.id), context.previous);
            }
        },
        onSettled: (_, __, variables) => {
            qc.invalidateQueries({ queryKey: QK.patients.detail(variables.id) });
            qc.invalidateQueries({ queryKey: QK.patients.lists() });
        },
    });
}

// ── Update Clinical Data Mutation ──────────────────────────────────────────

export function useUpdateClinical() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }) => {
            const res = await patientsApi.updateClinical(id, data);
            return res.data?.data || res.data;
        },
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: QK.patients.detail(variables.id) });
        },
    });
}

// ── Family Hooks ───────────────────────────────────────────────────────────

export function useFamilyMembers(patientId) {
    return useQuery({
        queryKey: QK.patients.family(patientId),
        queryFn: async () => {
            const res = await patientsApi.getFamilyMembers(patientId);
            return res.data?.data || res.data || [];
        },
        enabled: !!patientId,
        staleTime: 2 * 60_000,
    });
}

export function useLinkFamily() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ patientId, data }) => {
            const res = await patientsApi.linkFamily(patientId, data);
            return res.data?.data || res.data;
        },
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: QK.patients.detail(variables.patientId) });
            qc.invalidateQueries({ queryKey: QK.patients.family(variables.patientId) });
        },
    });
}

// ── Tag Hooks ──────────────────────────────────────────────────────────────

export function useAddTag() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ patientId, tag }) => {
            return patientsApi.addTag(patientId, tag);
        },
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: QK.patients.detail(variables.patientId) });
            qc.invalidateQueries({ queryKey: QK.patients.lists() });
        },
    });
}

export function useRemoveTag() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ patientId, tag }) => {
            return patientsApi.removeTag(patientId, tag);
        },
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: QK.patients.detail(variables.patientId) });
            qc.invalidateQueries({ queryKey: QK.patients.lists() });
        },
    });
}
