/**
 * auth.api.js — Profile & Auth API Service
 * Org-plane only. organizationId is NEVER sent, derived from JWT.
 */
import api from "@/services/api";

export const authApi = {
    /** Change password */
    changePassword: ({ currentPassword, newPassword }) =>
        api.patch("/auth/change-password", { currentPassword, newPassword }),

    /** Get active sessions */
    getSessions: () => api.get("/auth/sessions"),

    /** Logout current session */
    logout: () => api.post("/auth/logout"),

    /** Logout all devices */
    logoutAll: () => api.post("/auth/logout-all"),

    /** Terminate specific session */
    terminateSession: (sessionId) =>
        api.post(`/auth/sessions/${sessionId}/terminate`),

    /** Get profile */
    getProfile: () => api.get("/auth/profile"),

    /** Update profile */
    updateProfile: (data) => api.patch("/auth/profile", data),
};
