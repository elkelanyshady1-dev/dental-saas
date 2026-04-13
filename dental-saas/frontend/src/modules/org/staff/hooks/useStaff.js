/**
 * useStaff.js — React Query hook for staff list
 * Org-plane only. Cursor Rules §9 — NO useState for server data.
 */
import { useQuery } from "@tanstack/react-query";
import { staffApi } from "../api/staff.api";
import { STAFF_KEYS } from "../constants/queryKeys";

export function useStaff(filters = {}) {
    return useQuery({
        queryKey: STAFF_KEYS.list(filters),
        queryFn: async () => {
            const res = await staffApi.list(filters);
            // Axios unwrap → res.data = { success, data: [...], pagination: {...} }
            const raw = res.data || {};
            const users = Array.isArray(raw.data) ? raw.data : Array.isArray(raw.users) ? raw.users : [];
            const pagination = raw.pagination || {};
            return { users, pagination };
        },
        staleTime: 30_000,
        retry: 2,
    });
}
