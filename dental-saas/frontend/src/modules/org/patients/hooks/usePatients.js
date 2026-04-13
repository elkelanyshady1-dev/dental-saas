/**
 * usePatients.js — React Query hook for the Patient Directory
 *
 * Provides:
 *   - Paginated patient list with server-side search, sorting
 *   - Optimistic mutations for create/delete/bulk actions
 *   - Automatic cache invalidation + rollback
 *
 * Usage:
 *   const { patients, pagination, isLoading, refetch } = usePatients({ search, sort, page, limit });
 *
 * API layer: modules/org/patients/api/patients.api.js
 * Query keys: @/lib/query/queryKeys (QK.patients)
 * Architecture: org-plane only, organizationId derived from JWT.
 */
import { useQuery } from '@tanstack/react-query';
import { patientsApi } from '../api/patients.api';
import { QK, useOptimisticMutation, useSimpleMutation } from '@/lib/query';

// Re-export keys for backward compatibility
export const patientKeys = QK.patients;

// ── List Hook ─────────────────────────────────────────────────────────────

/**
 * @param {{ search?: string, sort?: string, page?: number, limit?: number }} params
 */
export function usePatients(params = {}) {
    const { search = '', sort = 'smart', page = 1, limit = 25 } = params;

    const query = useQuery({
        queryKey: QK.patients.list({ search, sort, page, limit }),
        queryFn: async () => {
            const res = await patientsApi.list({ search, sort, page, limit });
            const body = res.data;

            // Normalise response shape (backend returns { data, pagination })
            return {
                patients: body?.data || body?.patients || [],
                pagination: body?.pagination || {
                    total: 0,
                    page,
                    limit,
                    totalPages: 0,
                },
            };
        },
        placeholderData: (previousData) => previousData,  // Keep stale data while fetching
    });

    return {
        patients: query.data?.patients ?? [],
        pagination: query.data?.pagination ?? { total: 0, page: 1, limit: 25, totalPages: 0 },
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isError: query.isError,
        error: query.error,
        refetch: query.refetch,
    };
}

// ── Create Patient Mutation (Optimistic) ───────────────────────────────────

export function useCreatePatient() {
    return useOptimisticMutation({
        mutationFn: async (data) => {
            const res = await patientsApi.create(data);
            return res.data?.data || res.data;
        },
        queryKey: QK.patients.lists(),
        updateFn: (old, newItem) => {
            if (!old) return old;
            return {
                ...old,
                patients: [{ ...newItem, _id: `temp-${Date.now()}`, _optimistic: true }, ...(old.patients || [])],
            };
        },
    });
}

// ── Quick Create Mutation (Optimistic) ─────────────────────────────────────

export function useQuickCreatePatient() {
    return useOptimisticMutation({
        mutationFn: async (data) => {
            const res = await patientsApi.quickCreate(data);
            return res.data?.data || res.data;
        },
        queryKey: QK.patients.lists(),
        updateFn: (old, newItem) => {
            if (!old) return old;
            return {
                ...old,
                patients: [{ ...newItem, _id: `temp-${Date.now()}`, _optimistic: true }, ...(old.patients || [])],
            };
        },
    });
}

// ── Delete Patient Mutation (Optimistic) ───────────────────────────────────

export function useDeletePatient() {
    return useOptimisticMutation({
        mutationFn: (id) => patientsApi.delete(id),
        queryKey: QK.patients.lists(),
        updateFn: (old, id) => {
            if (!old?.patients) return old;
            return {
                ...old,
                patients: old.patients.filter((p) => p._id !== id),
            };
        },
    });
}

// ── Bulk Action Mutation ───────────────────────────────────────────────────

export function useBulkPatientAction() {
    return useSimpleMutation({
        mutationFn: (data) => patientsApi.bulkAction(data),
        invalidateKeys: [QK.patients.lists()],
    });
}
