/**
 * useTreatments.js — React Query hooks for Clinical/Treatment Domain
 *
 * Provides:
 *   - Treatment list with filters (patientId, doctorId, status)
 *   - Procedure catalog query
 *   - Optimistic create/update/delete mutations
 *   - Clinical notes query + add mutation
 *   - Automatic cache invalidation + rollback
 *
 * API layer: modules/org/clinical/api/treatments.api.js
 * Query keys: @/lib/query/queryKeys (QK.treatments)
 * Architecture: org-plane only, organizationId derived from JWT.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { treatmentsApi } from '../api/treatments.api';
import { QK, useOptimisticMutation } from '@/lib/query';

// Re-export keys for backward compatibility
export const treatmentKeys = QK.treatments;

// ── Treatment List ────────────────────────────────────────────────────────

/**
 * @param {{ patientId?: string, doctorId?: string, status?: string, page?: number, limit?: number }} params
 */
export function useTreatments(params = {}) {
    return useQuery({
        queryKey: QK.treatments.list(params),
        queryFn: async () => {
            const res = await treatmentsApi.list(params);
            const body = res.data;
            return {
                treatments: body?.data || body?.treatments || [],
                pagination: body?.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 },
            };
        },
        staleTime: 5 * 60_000,
        placeholderData: (prev) => prev,
    });
}

// ── Single Treatment ──────────────────────────────────────────────────────

export function useTreatment(id) {
    return useQuery({
        queryKey: QK.treatments.detail(id),
        queryFn: async () => {
            const res = await treatmentsApi.get(id);
            return res.data?.data || res.data;
        },
        enabled: !!id,
        staleTime: 5 * 60_000,
    });
}

// ── Procedure Catalog ─────────────────────────────────────────────────────

export function useProcedures(params = {}) {
    return useQuery({
        queryKey: QK.treatments.procedures(),
        queryFn: async () => {
            const res = await treatmentsApi.getProcedures(params);
            return res.data?.data || res.data || [];
        },
        staleTime: 10 * 60_000,
    });
}

// ── Clinical Notes ────────────────────────────────────────────────────────

export function useClinicalNotes(patientId) {
    return useQuery({
        queryKey: QK.treatments.notes(patientId),
        queryFn: async () => {
            const res = await treatmentsApi.getNotes(patientId);
            return res.data?.data || res.data;
        },
        enabled: !!patientId,
        staleTime: 60_000,
    });
}

// ── Create Treatment (Optimistic) ─────────────────────────────────────────

export function useCreateTreatment() {
    return useOptimisticMutation({
        mutationFn: async (data) => {
            const res = await treatmentsApi.create(data);
            return res.data?.data || res.data;
        },
        queryKey: QK.treatments.lists(),
        updateFn: (old, newItem) => {
            if (!old) return old;
            return {
                ...old,
                treatments: [{ ...newItem, _id: `temp-${Date.now()}`, _optimistic: true }, ...(old.treatments || [])],
            };
        },
    });
}

// ── Update Treatment (Optimistic) ─────────────────────────────────────────

export function useUpdateTreatment() {
    return useOptimisticMutation({
        mutationFn: async ({ id, data }) => {
            const res = await treatmentsApi.update(id, data);
            return res.data?.data || res.data;
        },
        queryKey: QK.treatments.lists(),
        updateFn: (old, { id, data }) => {
            if (!old?.treatments) return old;
            return {
                ...old,
                treatments: old.treatments.map((t) =>
                    t._id === id ? { ...t, ...data } : t
                ),
            };
        },
    });
}

// ── Delete Treatment (Optimistic) ─────────────────────────────────────────

export function useDeleteTreatment() {
    return useOptimisticMutation({
        mutationFn: (id) => treatmentsApi.delete(id),
        queryKey: QK.treatments.lists(),
        updateFn: (old, id) => {
            if (!old?.treatments) return old;
            return {
                ...old,
                treatments: old.treatments.filter((t) => t._id !== id),
            };
        },
    });
}

// ── Add Clinical Note ─────────────────────────────────────────────────────

export function useAddClinicalNote() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ patientId, content }) => {
            const res = await treatmentsApi.addNote(patientId, content);
            return res.data?.data || res.data;
        },
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: QK.treatments.notes(variables.patientId) });
        },
    });
}
