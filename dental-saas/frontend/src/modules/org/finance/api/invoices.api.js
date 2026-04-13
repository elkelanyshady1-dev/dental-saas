/**
 * invoices.api.js — Finance Domain API Service (Org Plane)
 * organizationId is NEVER sent — derived from JWT on backend.
 *
 * Canonical service for invoice & payment operations.
 * Re-exports all methods from the shared services/invoices.api.js
 * for use within the org/finance module.
 */
import api from "@/services/api";

const BASE = "/org/invoices";

export const invoicesApi = {
    /** List invoices with filters (status, patientId, dateFrom, dateTo, page, limit) */
    list: (params = {}) => api.get(BASE, { params }),

    /** Get single invoice with items */
    get: (id) => api.get(`${BASE}/${id}`),

    /** Create invoice */
    create: (data) => api.post(BASE, data),

    /** Update invoice */
    update: (id, data) => api.patch(`${BASE}/${id}`, data),

    /** Void invoice */
    void: (id) => api.patch(`${BASE}/${id}/void`),

    /** Get invoice items */
    getItems: (id) => api.get(`${BASE}/${id}/items`),

    /** Record payment against invoice */
    recordPayment: (id, data) => api.post(`${BASE}/${id}/payments`, data),

    /** Issue refund */
    refund: (id, data) => api.post(`${BASE}/${id}/refund`, data),

    /** Revenue summary for analytics */
    getRevenueSummary: (params = {}) => api.get("/org/invoices/summary", { params }),

    /** Daily/monthly revenue breakdown */
    getRevenueBreakdown: (params = {}) => api.get("/org/invoices/revenue", { params }),
};
