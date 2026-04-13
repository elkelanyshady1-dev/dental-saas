/**
 * useUsers.js — React Query hook for org user list
 * Org-plane only. Follows React Query server state law (Cursor Rules §9).
 *
 * RULE: NO useState(apiData) — React Query is the SSOT.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "../api/users.api";

// ─── Query Keys ───────────────────────────────────────────────────────────────
export const USER_KEYS = {
    all: ["org", "users"],
    list: (filters = {}) => ["org", "users", "list", filters],
    detail: (id) => ["org", "users", id],
};

// ─── useUsers — list with optional filters ────────────────────────────────────
export function useUsers(filters = {}) {
    return useQuery({
        queryKey: USER_KEYS.list(filters),
        queryFn: async () => {
            const res = await usersApi.list(filters);
            // Unwrap: axios → res.data, backend → { success, data: { users, pagination } }
            return res.data?.data || res.data || { users: [], pagination: {} };
        },
        staleTime: 30_000,         // 30s before background refetch
        retry: 2,
    });
}

// ─── useCreateUser ────────────────────────────────────────────────────────────
export function useCreateUser() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => usersApi.create(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: USER_KEYS.all });
        },
    });
}

// ─── useUpdateUser ────────────────────────────────────────────────────────────
export function useUpdateUser() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }) => usersApi.update(id, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: USER_KEYS.all });
        },
    });
}

// ─── useDeleteUser ────────────────────────────────────────────────────────────
export function useDeleteUser() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => usersApi.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: USER_KEYS.all });
        },
    });
}
