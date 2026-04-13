/**
 * useCompleteProfile.js — Mutation hook for profile completion
 * Triggered on ProfileCompletionPage. Updates AuthContext on success.
 */
import { useMutation } from "@tanstack/react-query";
import { staffApi } from "../api/staff.api";

export function useCompleteProfile({ onSuccess } = {}) {
    return useMutation({
        mutationFn: (data) => staffApi.completeProfile(data),
        onSuccess: (res, ...args) => {
            if (typeof onSuccess === "function") {
                onSuccess(res, ...args);
            }
        },
    });
}
