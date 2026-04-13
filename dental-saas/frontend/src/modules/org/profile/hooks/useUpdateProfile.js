/**
 * useUpdateProfile.js — Mutation hook for self-service profile updates
 *
 * PATCH /org/users/me — updates only allowed fields.
 * On success:
 *   1. Invalidates the React Query profile cache (re-fetches from DB)
 *   2. Calls refreshUser() from AuthContext so header avatar/name updates live
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { userService } from "../api/user.service";
import { CURRENT_USER_KEY } from "./useCurrentUser";

export function useUpdateProfile({ onSuccess, onError } = {}) {
    const qc = useQueryClient();
    const { refreshUser } = useAuth();

    return useMutation({
        mutationFn: (data) => userService.updateMe(data),
        onSuccess: async (res) => {
            // 1. Update React Query cache immediately (optimistic)
            const updated = res.data?.data || res.data;
            if (updated) {
                qc.setQueryData(CURRENT_USER_KEY, updated);
            }
            qc.invalidateQueries({ queryKey: CURRENT_USER_KEY });

            // 2. Refresh AuthContext user so header avatar/name updates instantly
            await refreshUser?.();

            onSuccess?.(updated);
        },
        onError: (err) => {
            onError?.(err);
        },
    });
}
