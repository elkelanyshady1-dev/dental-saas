/**
 * treatments.api.js — Clinical Treatments Domain API Service
 * Org-plane only. organizationId is NEVER sent, derived from JWT.
 *
 * Canonical API service for treatment operations.
 */
import api from "@/services/api";

const BASE = "/org/treatments";

export const treatmentsApi = {
    /** List treatments with filters (patientId, doctorId, status, etc.) */
    list: (params = {}) => api.get(BASE, { params }),

    /** Get single treatment record */
    get: (id) => api.get(`${BASE}/${id}`),

    /** Create treatment */
    create: (data) => api.post(BASE, data),

    /** Update treatment (notes, status, tooth) */
    update: (id, data) => api.patch(`${BASE}/${id}`, data),

    /** Delete treatment */
    delete: (id) => api.delete(`${BASE}/${id}`),

    /** Get available procedures */
    getProcedures: (params = {}) => api.get("/org/procedures", { params }),

    /** Get clinical notes for a patient */
    getNotes: (patientId) => api.get("/patient/domain/" + patientId + "/clinical"),

    /** Add clinical note */
    addNote: (patientId, content) =>
        api.put("/patient/domain/" + patientId + "/clinical", {
            note: { content },
        }),

    /** Get patient documents (for X-ray viewer) */
    getDocuments: (patientId, params = {}) =>
        api.get("/documents", { params: { patientId, ...params } }),
};
