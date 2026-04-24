/**
 * quotations.api.js — Quotation Domain API Service (Org Plane)
 * organizationId is NEVER sent — derived from JWT on backend.
 */
import api from "@/services/api";

const BASE = "/org/quotations";

export const quotationsApi = {
    /** List quotations with filters (status, patientId, branchId, page, limit) */
    list: (params = {}) => api.get(BASE, { params }),

    /** Get single quotation */
    get: (id) => api.get(`${BASE}/${id}`),

    /** Create quotation */
    create: (data) => api.post(BASE, data),

    /** Update quotation (draft/sent only) */
    update: (id, data) => api.patch(`${BASE}/${id}`, data),

    /** Send quotation (draft → sent) */
    send: (id) => api.post(`${BASE}/${id}/send`),

    /** Staff verbal acceptance (sent → accepted) */
    accept: (id) => api.post(`${BASE}/${id}/accept`),

    /** Reject quotation */
    reject: (id, data) => api.post(`${BASE}/${id}/reject`, data),

    /** Convert to invoice (accepted → converted) */
    convert: (id, data) => api.post(`${BASE}/${id}/convert`, data),
};
