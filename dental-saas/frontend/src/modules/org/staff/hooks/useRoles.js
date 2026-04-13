/**
 * useRoles.js — React Query hook for org roles
 * Org-plane only. Cursor Rules §9.
 *
 * Correct unwrap chain:
 *   axios → res.data
 *   backend → { success: true, data: { roles: [] } }
 *   result → res.data.data.roles
 */
import { useQuery } from "@tanstack/react-query";
import { staffApi } from "../api/staff.api";
import { STAFF_KEYS } from "../constants/queryKeys";

export function useRoles() {
    return useQuery({
        queryKey: STAFF_KEYS.roles,
        queryFn: async () => {
            const res = await staffApi.getRoles();
            const roles = res.data?.data?.roles ?? res.data?.roles ?? res.data ?? [];
            return Array.isArray(roles) ? roles : [];
        },
        staleTime: 5 * 60_000, // Roles rarely change — cache 5 minutes
        retry: 2,
    });
}
