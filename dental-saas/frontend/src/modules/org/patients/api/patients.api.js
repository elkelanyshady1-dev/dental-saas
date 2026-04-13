/**
 * patients.api.js — Patient Domain API Service
 *
 * DOMAIN: Patient (Org-side)
 * OWNERSHIP: modules/org/patients/
 * Owns: patient list, hooks, API, UI components
 * Consumers: org/modules/patients/tabs/ (detail view), pages, components
 *
 * v3.0 — Smart Search + Quick Create + Family Linking + Intelligence Engine
 * Org-plane only. organizationId is NEVER sent, derived from JWT.
 */
import api from "@/services/api";

const BASE = "/patient/domain";

export const patientsApi = {
    /** List patients with search/filter/pagination */
    list: (params = {}) => api.get(BASE, { params }),

    /** Get single patient aggregate */
    get: (id) => {
        // Phase 8.4 guard: block API call before it reaches the network
        if (!id || id === "undefined" || id === "null") {
            console.error("[patientsApi.get] Blocked — invalid patient ID:", id);
            return Promise.reject(new Error(`[patientsApi] Invalid patient ID: "${id}"`));
        }
        return api.get(`${BASE}/${id}`);
    },

    /** Create patient (full wizard payload) */
    create: (data) => api.post(BASE, data),

    /** Preview next auto-generated patient code for a branch */
    getNextCode: (branchId) => api.get(`${BASE}/internal/patients/next-code`, { params: { branchId } }),

    /** Smart patient search — duplicate prevention + family detection */
    search: (params = {}) => api.get(`${BASE}/search`, { params }),

    /** Quick patient creation (name + phone only, status=incomplete) */
    quickCreate: (data) => api.post(`${BASE}/quick`, data),

    /** Get patient family members (populated) */
    getFamilyMembers: (patientId) => api.get(`${BASE}/${patientId}/family`),

    /** Link two patients as family (bidirectional) */
    linkFamily: (patientId, data) => api.post(`${BASE}/${patientId}/family`, data),

    /** Unlink a family member (bidirectional) */
    unlinkFamily: (patientId, memberId) => api.delete(`${BASE}/${patientId}/family/${memberId}`),

    /** Update patient core data (full replacement) */
    update: (id, data) => api.put(`${BASE}/${id}`, data),

    /** Partial update patient data (inline editing) */
    patch: (id, data) => api.patch(`${BASE}/${id}`, data),

    /** Soft-delete patient */
    delete: (id) => api.delete(`${BASE}/${id}`),

    /** Update clinical/medical history */
    updateClinical: (id, data) => api.put(`${BASE}/${id}/clinical`, data),

    // ── v6.0 Tag Management ──────────────────────────────────────────────────

    /** Add a tag to a patient */
    addTag: (patientId, tag) => api.post(`${BASE}/${patientId}/tags`, { tag }),

    /** Remove a tag from a patient */
    removeTag: (patientId, tag) => api.delete(`${BASE}/${patientId}/tags/${encodeURIComponent(tag)}`),

    // ── v6.0 Intelligence Engine ─────────────────────────────────────────────

    /** Trigger patient intelligence analysis for current org */
    runIntelligence: () => api.post(`${BASE}/intelligence/run`),

    // ── v6.0 Bulk Actions ────────────────────────────────────────────────────

    /**
     * Bulk action on selected patients.
     * @param {{ patientIds: string[], action: string, payload?: any }} data
     */
    bulkAction: (data) => api.post(`${BASE}/bulk`, data),

    // ── v7.0 Patient Intake Magic Link ────────────────────────────────────────

    /** Generate a magic intake link for the patient (24h expiry) */
    generateIntakeLink: (patientId) => api.post(`${BASE}/${patientId}/intake-link`),

    // ── Appointment/Treatment/Document helpers ────────────────────────────────

    /** Get patient appointments */
    getAppointments: (id, params = {}) =>
        api.get("/org/appointments", { params: { patientId: id, ...params } }),

    /** Get patient treatments */
    getTreatments: (id, params = {}) =>
        api.get("/org/treatments", { params: { patientId: id, ...params } }),

    /** Get patient documents */
    getDocuments: (id, params = {}) =>
        api.get("/documents", { params: { patientId: id, ...params } }),

    /** Upload patient document */
    uploadDocument: (id, formData) =>
        api.post("/documents", formData, {
            headers: { "Content-Type": "multipart/form-data" },
            params: { patientId: id },
        }),

    /** Delete patient document */
    deleteDocument: (docId) => api.delete(`/documents/${docId}`),

    // ── v8.0 Portal Magic Link (org-side trigger) ─────────────────────────
    /** Generate a portal magic link for the patient */
    generatePortalMagicLink: (patientId) =>
        api.post('/portal/auth/magic-link/generate', { patientId }),
};
