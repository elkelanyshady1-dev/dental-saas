/**
 * useRoles.js — React Query hook for org roles list
 * Org-plane only. Follows React Query server state law (Cursor Rules §9).
 *
 * Handles the full Axios unwrap chain:
 *   axios → res.data
 *   backend → { success: true, data: { roles: [...] } }
 *   final  → res.data.data.roles
 */
import { useQuery } from "@tanstack/react-query";
import { usersApi } from "../api/users.api";

export const ROLE_KEYS = {
    all: ["org", "roles"],
};

export function useRoles() {
    return useQuery({
        queryKey: ROLE_KEYS.all,
        queryFn: async () => {
            const res = await usersApi.getRoles();
            // Axios wraps: res.data = backend response = { success, data: { roles: [] } }
            const roles = res.data?.data?.roles ?? res.data?.roles ?? res.data ?? [];
            return Array.isArray(roles) ? roles : [];
        },
        staleTime: 5 * 60_000, // Roles rarely change — cache for 5 minutes
        retry: 2,
    });
}
