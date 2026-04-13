/**
 * useCurrentUser.js — React Query hook for own profile
 *
 * Fetches from GET /org/users/me (canonical DB profile).
 * Falls back to AuthContext user while loading.
 *
 * Rule: MUST use React Query. NO useState(apiData).
 */
import { useQuery } from "@tanstack/react-query";
import { userService } from "../api/user.service";

export const CURRENT_USER_KEY = ["profile", "me"];

export function useCurrentUser() {
    return useQuery({
        queryKey: CURRENT_USER_KEY,
        queryFn: async () => {
            const res = await userService.getMe();
            return res.data?.data || res.data;
        },
        staleTime: 30_000, // 30 s
        retry: 1,
    });
}
