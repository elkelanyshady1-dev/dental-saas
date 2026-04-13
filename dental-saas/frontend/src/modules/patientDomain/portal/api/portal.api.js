/**
 * portal.api.js — Canonical Portal API Service (Phase 7)
 *
 * Centralizes all portal endpoints:
 *   - Auth: delegated to portalAuth.api.js
 *   - Profile / Me: GET /portal/me
 *   - Appointments
 *   - Treatments / progress
 *   - Messages
 *   - Photo upload
 *
 * organizationId is NEVER sent — patient identity from portalToken JWT.
 */

import { portalApi } from "@/modules/patientDomain/shared/api/patientDomain.api";

export { portalAuthApi }  from "../services/portalAuth.api";
export { portalMessagesApi } from "../services/portalMessages.api";
export { portalProgressApi, portalPhotosApi } from "../services/portalMonitoring.api";
export { portalAccessApi } from "../services/portalAccess.api";

const PORTAL = "/portal";

/** Consolidated portal accessor (flat API pattern for Phase 7 pages) */
export const portalApiService = {
    // ── Identity ─────────────────────────────────────────────────────────────
    /**  GET /portal/me  */
    getMe: () => portalApi.get(`${PORTAL}/me`),

    /**  GET /portal/profile  */
    getProfile: () => portalApi.get(`${PORTAL}/profile`),

    // ── Appointments ─────────────────────────────────────────────────────────
    /**  GET /portal/appointments?page=1&limit=20  */
    getAppointments: (params = {}) => portalApi.get(`${PORTAL}/appointments`, { params }),

    /**  GET /portal/appointments/:id  */
    getAppointment: (id) => portalApi.get(`${PORTAL}/appointments/${id}`),

    // ── Treatments / Clinical ─────────────────────────────────────────────────
    /**  GET /portal/treatments  */
    getTreatments: (params = {}) => portalApi.get(`${PORTAL}/treatments`, { params }),

    /**  GET /portal/clinical  */
    getClinical: () => portalApi.get(`${PORTAL}/clinical`),

    // ── Aligner Progress ──────────────────────────────────────────────────────
    /**  GET /portal/progress  */
    getProgress: (params = {}) => portalApi.get(`${PORTAL}/progress`, { params }),

    // ── Messages ──────────────────────────────────────────────────────────────
    /**  GET /portal/messages  */
    getMessages: (params = {}) => portalApi.get(`${PORTAL}/messages`, { params }),

    /**  POST /portal/messages  */
    sendMessage: (data) => portalApi.post(`${PORTAL}/messages`, data),

    // ── Photo Upload ──────────────────────────────────────────────────────────
    /**  POST /portal/photos (multipart/form-data)  */
    uploadPhoto: (formData, onUploadProgress) =>
        portalApi.post(`${PORTAL}/photos`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
            onUploadProgress,
        }),

    // ── Financial ─────────────────────────────────────────────────────────────
    /**  GET /portal/financial/summary  */
    getFinancialSummary: () => portalApi.get(`${PORTAL}/financial/summary`),

    /**  GET /portal/invoices  */
    getInvoices: (params = {}) => portalApi.get(`${PORTAL}/invoices`, { params }),
};
