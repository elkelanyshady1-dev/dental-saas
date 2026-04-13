/**
 * useDeactivateStaff.js — Mutation hook for deactivating a staff member
 * Performs soft-delete via DELETE API. Invalidates staff list on success.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { staffApi } from "../api/staff.api";
import { STAFF_KEYS } from "../constants/queryKeys";

export function useDeactivateStaff() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id) => staffApi.deactivate(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: STAFF_KEYS.all });
        },
    });
}
