/**
 * staff.api.js — Staff Module API Service
 * Org-plane only. organizationId comes from JWT — never sent by client.
 *
 * Points to /org/users backend endpoints (no API contract change).
 */
import api from "@/services/api";

const BASE = "/org/users";
const ROLES_BASE = "/org/roles";
const BRANCHES_BASE = "/org/branches";

export const staffApi = {
    // ─── Staff CRUD ────────────────────────────────────────────────────────────
    /** List staff with optional filters: { search, roleId, isActive } */
    list: (params = {}) => api.get(BASE, { params }),

    /** Get single staff member */
    get: (id) => api.get(`${BASE}/${id}`),

    /** Create new staff member */
    create: (data) => api.post(BASE, data),

    /** Update staff member */
    update: (id, data) => api.patch(`${BASE}/${id}`, data),

    /** Deactivate staff member (soft delete) */
    deactivate: (id) => api.delete(`${BASE}/${id}`),

    // ─── Roles ─────────────────────────────────────────────────────────────────
    /** List all org roles (for dropdowns and permission matrix) */
    getRoles: () => api.get(ROLES_BASE),

    // ─── Branches ──────────────────────────────────────────────────────────────
    /** List all org branches (for multi-select in staff form) */
    getBranches: () => api.get(BRANCHES_BASE),

    // ─── Username / email availability ─────────────────────────────────────────
    /**
     * Check whether a firstName+lastName combo will produce an available org email.
     * Response: { available: boolean, email: string, suggestedEmail?: string }
     */
    checkUsername: (firstName, lastName) =>
        api.get(`${BASE}/check-username`, { params: { firstName, lastName } }),

    /**
     * Get active practitioners (doctors) for appointment scheduling.
     * Response: { practitioners: [{ _id, name, specialty, avatarUrl, branchAccess[], hasFullBranchAccess }] }
     */
    getPractitioners: () => api.get(`${BASE}/practitioners`),

    // ─── Branch access (targeted updates) ─────────────────────────────────────
    updateRole: (id, roleId) => api.patch(`${BASE}/${id}/role`, { roleId }),
    updateBranchAccess: (id, branchIds) =>
        api.patch(`${BASE}/${id}/branch-access`, { branchIds }),

    // ─── Profile photo upload ──────────────────────────────────────────────────
    /**
     * Upload staff profile photo.
     * @param {string} id - user id
     * @param {File} file - the selected File object
     * @returns Promise resolving to { profileImage: "/uploads/staff/..." }
     */
    uploadAvatar: (id, file) => {
        const form = new FormData();
        form.append("photo", file);
        return api.post(`${BASE}/${id}/avatar`, form, {
            headers: { "Content-Type": "multipart/form-data" },
        });
    },

    // ─── Profile completion ────────────────────────────────────────────────────
    getMyProfile: () => api.get(`${BASE}/me`),
    completeProfile: (data) => api.patch(`${BASE}/me/complete-profile`, data),
};

