/**
 * recalls.api.js — Recall Domain API Service
 *
 * Org-plane only. organizationId is NEVER sent — derived from JWT.
 * Backend routes (see backend/src/routes/recallRoutes.js) live under
 * /api/v1/org/recalls/* — the shared axios instance prefixes /api/v1.
 *
 * Response envelope (set in Phase 2 H2 hardening):
 *   { success: true, data: <recall|recall[]>, message?: string }
 *   { success: false, error: { code, message, ... } }
 *
 * Hooks unwrap `res.data?.data || res.data` defensively.
 */

import api from "@/services/api";

export const recallsApi = {
    /** List recalls with optional date range + status filters */
    list: (params = {}) => api.get("/org/recalls", { params }),

    /** Get a single recall by id */
    get: (id) => api.get(`/org/recalls/${id}`),

    /** Create a recall (branch + patient + dueDate + reason) */
    create: (data) => api.post("/org/recalls", data),

    /** Transition status (pending → sent | booked | cancelled, sent → booked) */
    updateStatus: (id, status) =>
        api.patch(`/org/recalls/${id}/status`, { status }),
};

export default recallsApi;
