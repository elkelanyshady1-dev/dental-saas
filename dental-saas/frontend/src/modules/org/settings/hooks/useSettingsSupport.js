/**
 * useSettingsSupport.js — React Query Hooks for Settings Hub: Support
 *
 * Provides:
 *   - Ticket list query (paginated)
 *   - Ticket detail query (with conversation thread)
 *   - Create ticket mutation
 *   - Add comment mutation
 *
 * API layer:   @/modules/org/settings/api/settings.api.js
 * Query keys:  @/lib/query/queryKeys (QK.settingsSupport)
 * Architecture: org-plane only, organizationId derived from JWT.
 *
 * SAFETY: Support mutations use useSimpleMutation (not optimistic)
 * because ticket state transitions and SLA computations are server-side.
 *
 * PLANE: Org only.
 *
 * @module modules/org/settings/hooks/useSettingsSupport
 */

import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/modules/org/settings/api/settings.api";
import { QK, useSimpleMutation } from "@/lib/query";

// ── Ticket List ───────────────────────────────────────────────────────────

/**
 * Fetch paginated ticket list for the current org.
 *
 * @param {{ limit?: number, skip?: number }} [params={}]
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useTickets(params = {}) {
    return useQuery({
        queryKey: QK.settingsSupport.list(params),
        queryFn: async () => {
            const res = await settingsApi.getTickets(params);
            return res.data?.data ?? [];
        },
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    });
}

// ── Ticket Detail ─────────────────────────────────────────────────────────

/**
 * Fetch a single ticket's full detail (with filtered conversation thread).
 *
 * @param {string|null} ticketId
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useTicketDetail(ticketId) {
    return useQuery({
        queryKey: QK.settingsSupport.detail(ticketId),
        queryFn: async () => {
            const res = await settingsApi.getTicketDetail(ticketId);
            return res.data?.data ?? null;
        },
        enabled: !!ticketId,
        staleTime: 30_000,
    });
}

// ── Create Ticket ─────────────────────────────────────────────────────────

/**
 * Create a new support ticket. Server assigns SLA, status, and ID.
 * Not optimistic — server-side validation is required.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 *
 * @example
 *   const create = useCreateTicket();
 *   create.mutate({ subject: "...", description: "...", category: "technical" });
 */
export function useCreateTicket() {
    return useSimpleMutation({
        mutationFn: async (data) => {
            const res = await settingsApi.createTicket(data);
            return res.data?.data || res.data;
        },
        invalidateKeys: [
            QK.settingsSupport.lists(),
        ],
    });
}

// ── Add Comment ───────────────────────────────────────────────────────────

/**
 * Add a comment (reply) to an existing ticket. Comments are append-only.
 * Not optimistic — server validates ownership and appends atomically.
 *
 * @returns {import('@tanstack/react-query').UseMutationResult}
 *
 * @example
 *   const reply = useAddComment();
 *   reply.mutate({ ticketId: "abc", message: "Thanks for responding." });
 */
export function useAddComment() {
    return useSimpleMutation({
        mutationFn: async ({ ticketId, message }) => {
            const res = await settingsApi.addComment(ticketId, message);
            return res.data?.data || res.data;
        },
        invalidateKeys: [
            QK.settingsSupport.lists(),
            // Note: detail key requires the specific ticketId, which we
            // invalidate via onSuccess callback in the consuming component.
        ],
        onSuccess: (_data, variables) => {
            // The component should also invalidate the specific detail:
            // qc.invalidateQueries({ queryKey: QK.settingsSupport.detail(variables.ticketId) });
        },
    });
}
