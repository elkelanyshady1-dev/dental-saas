/**
 * appointments.api.js — Appointment Domain API Service
 * Org-plane only. organizationId is NEVER sent, derived from JWT.
 *
 * Phase S2: All paths use canonical /org/appointments/* prefix.
 */
import api from "@/services/api";

export const appointmentsApi = {
    /** List appointments with filters */
    list: (params = {}) => api.get("/org/appointments", { params }),

    /** Get single appointment */
    get: (id) => api.get(`/org/appointments/${id}`),

    /** Create appointment */
    create: (data) => api.post("/org/appointments", data),

    /** Update appointment */
    update: (id, data) => api.patch(`/org/appointments/${id}`, data),

    /** Delete appointment */
    delete: (id) => api.delete(`/org/appointments/${id}`),

    /** Update appointment status */
    updateStatus: (id, status) => api.patch(`/org/appointments/${id}/status`, { status }),

    /** Get calendar day view */
    getCalendar: (date, branchIds, doctorId) => {
        const params = { date };
        if (branchIds?.length) params.branchIds = branchIds.join(",");
        if (doctorId) params.doctorId = doctorId;
        return api.get("/org/appointments/calendar", { params });
    },

    /** Get availability slots */
    getAvailability: (branchId, chairId, dentistId, date) =>
        api.get("/org/appointments/availability", {
            params: { branchId, chairId, dentistId, date },
        }),

    /** Get doctors list (for filter) */
    getDoctors: (params = {}) => api.get("/org/users", { params: { role: "doctor", ...params } }),

    /**
     * Get practitioners (isPractitioner=true users) — v32.0
     * Source of truth: /org/users/practitioners
     * Used for: scheduling, patient assignment, doctor dropdowns
     * Response: { data: { practitioners: [{ _id, name, specialty, avatarUrl, branchAccess[], hasFullBranchAccess }] } }
     */
    getPractitioners: () => api.get("/org/users/practitioners"),
};
