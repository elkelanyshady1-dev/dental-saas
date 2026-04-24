/**
 * useSupport.js — React Query hooks for the platform support dashboard
 *
 * Rules (CLAUDE.md §13):
 *   - All server state via useQuery / useMutation.
 *   - Query keys via the centralized QK.support.* registry (top-level).
 *   - Shared queryClient (never `new QueryClient()`).
 *   - Mutations invalidate the narrowest key that still covers affected
 *     views — NOT QK.support.all, which would nuke every cached filter page.
 *
 * PLANE: Platform
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QK } from "@/lib/query/queryKeys";
import { supportService } from "../services/supportService";

// ── Queries ────────────────────────────────────────────────────────────

export function useTickets(filters = {}) {
    return useQuery({
        queryKey: QK.support.tickets(filters),
        queryFn: () => supportService.listTickets(filters),
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // Keep previous page visible while filters change — prevents the
        // list from collapsing into a loading state on every filter tweak.
        placeholderData: (prev) => prev,
        keepPreviousData: true,
    });
}

export function useTicket(ticketId, { enabled = true } = {}) {
    return useQuery({
        queryKey: QK.support.ticket(ticketId),
        queryFn: () => supportService.getTicketForensic(ticketId),
        enabled: Boolean(ticketId) && enabled,
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
    });
}

/**
 * useTicketMessages — dedicated hook for the E5 TicketMessage collection.
 *
 * Currently NO-OP: the platform plane still reads the thread off the
 * forensic ticket DTO, so this hook just proxies `useTicket` and exposes
 * a normalized messages array. The seam exists today so consumers can
 * switch to a real paginated endpoint without touching component code
 * once `GET /platform/support/ticket/:id/messages` lands.
 */
export function useTicketMessages(ticketId, { enabled = true } = {}) {
    const ticketQuery = useTicket(ticketId, { enabled });
    const ticket = ticketQuery.data?.data || ticketQuery.data || null;
    const messages = normalizeMessages(ticket);
    return {
        ...ticketQuery,
        data: messages,
    };
}

/**
 * Single entry point for message-shape normalization. The legacy forensic
 * DTO returns `conversationThread`; the E5 DTO returns `messages`. Keeping
 * this in one place avoids dual-branch drift across components.
 */
export function normalizeMessages(ticket) {
    if (!ticket) return [];
    if (Array.isArray(ticket.messages)) return ticket.messages;
    if (Array.isArray(ticket.conversationThread)) return ticket.conversationThread;
    return [];
}

// ── Mutations ──────────────────────────────────────────────────────────

export function useAddMessage(ticketId, { listFilters } = {}) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body) => supportService.addMessage(ticketId, body),
        onSuccess: () => {
            // Narrow invalidation: the detail view that owns the thread,
            // plus only the currently-visible list page (lastMessageAt /
            // status may have advanced). Avoid nuking `QK.support.all`,
            // which would drop every cached filter page.
            qc.invalidateQueries({ queryKey: QK.support.ticket(ticketId) });
            if (listFilters !== undefined) {
                qc.invalidateQueries({ queryKey: QK.support.tickets(listFilters) });
            }
        },
    });
}

export function useAssignTicket(ticketId, { listFilters } = {}) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body) => supportService.assignTicket(ticketId, body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: QK.support.ticket(ticketId) });
            if (listFilters !== undefined) {
                qc.invalidateQueries({ queryKey: QK.support.tickets(listFilters) });
            }
        },
    });
}
