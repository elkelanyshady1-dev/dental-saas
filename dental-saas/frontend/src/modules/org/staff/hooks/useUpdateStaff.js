/**
 * useUpdateStaff.js — Mutation hook for updating a staff member
 * Invalidates the full staff list and the specific staff detail on success.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "../api/staff.api";
import { STAFF_KEYS } from "../constants/queryKeys";

export function useUpdateStaff() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }) => staffApi.update(id, data),
        onSuccess: (_data, { id }) => {
            qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
            qc.invalidateQueries({ queryKey: STAFF_KEYS.detail(id) });
        },
    });
}
