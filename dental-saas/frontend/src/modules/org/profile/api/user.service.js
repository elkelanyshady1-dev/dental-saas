/**
 * user.service.js — Profile API Service Layer
 *
 * Single source of truth for all self-service profile operations.
 * Org-plane only. organizationId NEVER sent — derived from JWT.
 *
 * Endpoints:
 *   GET  /org/users/me              → fetch own full profile
 *   PATCH /org/users/me             → update allowed fields
 *   PATCH /auth/change-password     → change password (rotates tokens)
 *   GET  /auth/sessions             → active sessions
 *   POST /auth/logout-all           → terminate all sessions
 *   POST /org/users/:id/avatar      → upload profile photo (multipart)
 */
import api from "@/services/api";

export const userService = {
    /** Fetch the authenticated user's full profile from DB */
    getMe: () => api.get("/org/users/me"),

    /**
     * Update self-service profile fields.
     * Backend allowlist: firstName, lastName, phone, realEmail, profileImage, jobTitle
     * @param {Object} data - only allowlisted fields
     */
    updateMe: (data) => api.patch("/org/users/me", data),

    /**
     * Upload a profile photo (avatar image file).
     * Backend stores it, returns profileImage URL.
     * @param {string} userId - the user's own _id
     * @param {File} file - image file
     */
    uploadAvatar: async (userId, file) => {
        const formData = new FormData();
        formData.append("photo", file);
        return api.post(`/org/users/${userId}/avatar`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
    },

    /** Change password — rotates CSRF + access token on backend */
    changePassword: ({ currentPassword, newPassword }) =>
        api.patch("/auth/change-password", { currentPassword, newPassword }),

    /** Active sessions list */
    getSessions: () => api.get("/auth/sessions"),

    /** Terminate a specific session */
    terminateSession: (sessionId) =>
        api.post(`/auth/sessions/${sessionId}/terminate`),

    /** Logout all devices */
    logoutAll: () => api.post("/auth/logout-all"),
};
