/**
 * orgNotification.api.js
 * API calls for the org notification engine.
 * All requests hit /api/v1/org/notifications
 * organizationId is NEVER sent manually — derived from JWT by backend.
 */

import api from "@/services/api";

const BASE = "/org/notifications";

/**
 * Fetch paginated notifications.
 * @param {{ unreadOnly?: boolean, priority?: string, limit?: number, cursor?: string }} params
 */
export async function getNotifications(params = {}) {
    const query = new URLSearchParams();
    if (params.unreadOnly) query.set("unreadOnly", "true");
    if (params.priority) query.set("priority", params.priority);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.cursor) query.set("cursor", params.cursor);
    const qs = query.toString();
    return api.get(`${BASE}${qs ? `?${qs}` : ""}`);
}

/** Fetch only the unread count (for badge polling). */
export async function getUnreadCount() {
    return api.get(`${BASE}/unread-count`);
}

/** Mark a single notification as read. */
export async function markAsRead(id) {
    return api.patch(`${BASE}/${id}/read`);
}

/** Mark all user-scoped notifications as read. */
export async function markAllRead() {
    return api.patch(`${BASE}/mark-all-read`);
}

/** Soft-delete a notification. */
export async function deleteNotification(id) {
    return api.delete(`${BASE}/${id}`);
}
