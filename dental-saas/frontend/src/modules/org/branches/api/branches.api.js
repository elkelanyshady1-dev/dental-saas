/**
 * branches.api.js — Branch Management API Service
 * Org-plane only. organizationId is NEVER sent, derived from JWT.
 */
import api from "@/services/api";

const BASE = "/org/branches";

export const branchesApi = {
    /** List all org branches */
    list: (params = {}) => api.get(BASE, { params }),

    /** Get single branch */
    get: (id) => api.get(`${BASE}/${id}`),

    /** Create branch — uses active branch from session context */
    create: (data) => api.post(BASE, data),

    /**
     * Update branch — passes the branch's own _id as X-Branch-Id.
     * Branch PATCH is self-referential: the edited branch IS the branch context.
     * This guarantees the branchContext.middleware always has a valid header,
     * even when the user's session active branch differs from the one being edited.
     */
    update: (id, data) => api.patch(`${BASE}/${id}`, data, {
        headers: { "x-branch-id": id },
    }),

    /**
     * Delete/deactivate branch — same rationale as update.
     */
    delete: (id) => api.delete(`${BASE}/${id}`, {
        headers: { "x-branch-id": id },
    }),

    /** Get branch users */
    getUsers: (id) => api.get(`${BASE}/${id}/users`),

    /** Get active chairs for a branch — used by the appointment drawer */
    getChairs: (id) => api.get(`${BASE}/${id}/chairs`),
};
