/**
 * users.api.js — Users Management API Service
 * Org-plane only. organizationId is NEVER sent, derived from JWT.
 */
import api from "@/services/api";

const BASE = "/org/users";

export const usersApi = {
    /** List all org users */
    list: (params = {}) => api.get(BASE, { params }),

    /** Get single user */
    get: (id) => api.get(`${BASE}/${id}`),

    /** Create new user */
    create: (data) => api.post(BASE, data),

    /** Update user */
    update: (id, data) => api.patch(`${BASE}/${id}`, data),

    /** Delete / deactivate user */
    delete: (id) => api.delete(`${BASE}/${id}`),

    /** List available roles */
    getRoles: () => api.get("/org/roles"),

    /** Update user's role */
    updateRole: (id, roleId) => api.patch(`${BASE}/${id}/role`, { roleId }),

    /** Update branch access */
    updateBranchAccess: (id, branchIds) =>
        api.patch(`${BASE}/${id}/branch-access`, { branchIds }),

    /** Get the authenticated user's own profile */
    getMyProfile: () => api.get(`${BASE}/me`),

    /** Complete the authenticated user's profile (first login flow) */
    completeProfile: (data) => api.patch(`${BASE}/me/complete-profile`, data),
};
