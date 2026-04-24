/**
 * payments.api.js — Patient Payment API client (Org Plane, Phase 31)
 *
 * Payments are a first-class org finance surface.
 * organizationId is NEVER sent — backend derives from JWT.
 */
import api from "@/services/api";

const BASE = "/org/payments";

export const paymentsApi = {
    list: (params = {}) => api.get(BASE, { params }),
    get: (id) => api.get(`${BASE}/${id}`),
    /**
     * Record a new payment. `invoiceId` is optional — when provided, the
     * orchestrator auto-allocates the amount to that invoice and updates
     * its status atomically.
     */
    create: (data) => api.post(BASE, data),
};
