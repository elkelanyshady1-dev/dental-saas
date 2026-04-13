/**
 * useBranches.js — Query hook for fetching org branches
 * Used by StaffFormModal to populate the branch multi-select.
 * React Query SSOT — no useState for server data.
 */
import { useQuery } from "@tanstack/react-query";
import { staffApi } from "../api/staff.api";

const BRANCHES_QUERY_KEY = ["org", "branches"];

export function useBranches() {
    return useQuery({
        queryKey: BRANCHES_QUERY_KEY,
        queryFn: async () => {
            const res = await staffApi.getBranches();
            // Handle both { data: { branches: [] } } and { data: [] } shapes
            const raw = res.data?.data ?? res.data;
            return Array.isArray(raw) ? raw : (raw?.branches ?? []);
        },
        staleTime: 5 * 60 * 1000, // branches change infrequently
    });
}
