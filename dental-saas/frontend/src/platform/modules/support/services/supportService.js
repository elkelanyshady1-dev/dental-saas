/**
 * supportService.js — Platform Support Dashboard API client
 *
 * Thin wrapper around `platformApi` for the platform-plane support endpoints.
 * All auth + request-ID tracing is handled by the shared axios instance;
 * this file is pure URL + params shaping.
 *
 * Backend routes (mounted under /api/platform by platformApi.baseURL):
 *   GET   /support/tickets
 *   GET   /support/ticket/:id/forensic
 *   POST  /support/ticket/:id/message
 *   PATCH /support/ticket/:id/assign
 *
 * PLANE: Platform
 */

import platformApi from "@/platform/auth/platformApi";

export const supportService = {
    /**
     * List tickets with optional filters.
     * Backend supports: status, priority, organizationId, search, limit, cursor.
     * Filters are passed as query params; the service does no client-side filtering.
     */
    listTickets: (filters = {}) =>
        platformApi
            .get("/support/tickets", { params: filters })
            .then((r) => r.data),

    /**
     * Forensic ticket detail — includes the conversation thread, linked
     * invoice/refund context, and assignment history. Returns a PlatformTicketDTO.
     */
    getTicketForensic: (ticketId) =>
        platformApi
            .get(`/support/ticket/${ticketId}/forensic`)
            .then((r) => r.data),

    /**
     * Post a reply as a platform agent.
     * Body: { message, expectedVersion? }
     */
    addMessage: (ticketId, body) =>
        platformApi
            .post(`/support/ticket/${ticketId}/message`, body)
            .then((r) => r.data),

    /**
     * Assign ticket to a platform user.
     * Body: { assigneeUserId, expectedVersion }
     */
    assignTicket: (ticketId, body) =>
        platformApi
            .patch(`/support/ticket/${ticketId}/assign`, body)
            .then((r) => r.data),
};

export default supportService;
