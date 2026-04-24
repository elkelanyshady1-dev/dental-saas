/**
 * useRecalls.js — React Query hooks for the Recall Domain
 *
 * Mirrors useAppointments.js conventions:
 *   - Query keys via QK.recalls (strict primitive-based factory)
 *   - Optimistic mutations via the shared useOptimisticMutation helper
 *     (snapshot → apply → rollback on error → revalidate on settle)
 *   - Defensive response unwrapping (res.data?.data || res.data)
 *
 * API layer: modules/org/recalls/api/recalls.api.js
 * Backend contract: GET /org/recalls?startDate&endDate&status returns
 *   { success: true, data: Recall[] }
 */

import { useQuery } from "@tanstack/react-query";
import { recallsApi } from "../api/recalls.api";
import { QK, useOptimisticMutation, useSimpleMutation } from "@/lib/query";

// Re-export keys for callers that want to invalidate from elsewhere.
export const recallKeys = QK.recalls;

// ── List (date-range scoped) ──────────────────────────────────────────────

/**
 * @param {object}   params
 * @param {string}   [params.startDate] — ISO instant (use dateRange utils)
 * @param {string}   [params.endDate]
 * @param {string}   [params.status]    — pending | sent | booked | cancelled
 * @param {string[]} [params.branchIds] — informational, not yet sent to API
 * @param {boolean}  [params.enabled=true]
 */
export function useRecallsList(params = {}) {
    const { startDate, endDate, status, branchIds, enabled = true } = params;

    return useQuery({
        queryKey: QK.recalls.list({ startDate, endDate, status, branchIds }),
        queryFn: async () => {
            const apiParams = {};
            if (startDate) apiParams.startDate = startDate;
            if (endDate) apiParams.endDate = endDate;
            if (status) apiParams.status = status;
            const res = await recallsApi.list(apiParams);
            const body = res.data;
            // Phase 2 H2 envelope: { success, data: [...] }
            return body?.data || body?.recalls || [];
        },
        enabled: enabled && !!(startDate && endDate),
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    });
}

// ── Single Recall ─────────────────────────────────────────────────────────

export function useRecall(id) {
    return useQuery({
        queryKey: QK.recalls.detail(id),
        queryFn: async () => {
            const res = await recallsApi.get(id);
            return res.data?.data || res.data;
        },
        enabled: !!id,
        staleTime: 60_000,
    });
}

// ── Create Recall ─────────────────────────────────────────────────────────
// Optimistic insert into the list cache; full revalidation on settle so
// the server-assigned _id replaces the temp one.

export function useCreateRecall() {
    return useOptimisticMutation({
        mutationFn: async (data) => {
            const res = await recallsApi.create(data);
            return res.data?.data || res.data;
        },
        // We don't know which list cache entry to target without filters —
        // pass `lists()` so all list queries get revalidated. updateFn is
        // best-effort; the invalidate on settle is the source of truth.
        queryKey: QK.recalls.lists(),
        updateFn: (old, newRecall) => {
            if (!Array.isArray(old)) return old;
            const placeholder = {
                _id: `temp-${Date.now()}`,
                _optimistic: true,
                status: "pending",
                ...newRecall,
            };
            return [placeholder, ...old];
        },
        invalidateKeys: [QK.recalls.all],
    });
}

// ── Update Status (Optimistic) ────────────────────────────────────────────
// Used by Convert (→ booked), Cancel (→ cancelled), and admin transitions.
// Optimistic patch into every cached list so the recall's chip re-colors
// instantly across all open views.

export function useUpdateRecallStatus() {
    return useOptimisticMutation({
        mutationFn: async ({ id, status }) => {
            const res = await recallsApi.updateStatus(id, status);
            return res.data?.data || res.data;
        },
        queryKey: QK.recalls.lists(),
        updateFn: (old, { id, status }) => {
            if (!Array.isArray(old)) return old;
            return old.map((r) => (r._id === id ? { ...r, status } : r));
        },
        invalidateKeys: [QK.recalls.all],
    });
}

/**
 * useUpdateRecallStatusAsync — non-optimistic awaitable variant for the
 * Convert flow. The chained mutation needs to know success/failure to
 * surface a partial-failure toast (appointment created but recall update
 * failed). useOptimisticMutation returns the same `mutateAsync` so this
 * is just a clarity-named alias for that case.
 */
export function useUpdateRecallStatusAsync() {
    return useSimpleMutation({
        mutationFn: async ({ id, status }) => {
            const res = await recallsApi.updateStatus(id, status);
            return res.data?.data || res.data;
        },
        invalidateKeys: [QK.recalls.all],
    });
}
