/**
 * useCreateStaff.js — Mutation hook for creating a staff member
 * Invalidates the full staff list cache on success.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "../api/staff.api";
import { STAFF_KEYS } from "../constants/queryKeys";

export function useCreateStaff() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => staffApi.create(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
        },
    });
}
