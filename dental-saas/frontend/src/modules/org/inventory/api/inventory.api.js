/**
 * inventory.api.js — Inventory Domain API Client
 *
 * PLANE: Org only. Uses org-plane api instance (sessionStorage token).
 * All paths are relative to /api/v1/org/inventory
 */

import api from "@/services/api";

export const inventoryApi = {
    // ── Items ─────────────────────────────────────────────────────────────────
    list:   (params) => api.get("/org/inventory",       { params }),
    get:    (id)     => api.get(`/org/inventory/${id}`),
    create: (data)   => api.post("/org/inventory",      data),
    update: (id, data) => api.put(`/org/inventory/${id}`, data),
    remove: (id)     => api.delete(`/org/inventory/${id}`),

    // ── Stock mutations ───────────────────────────────────────────────────────
    addStock:  (id, data) => api.post(`/org/inventory/${id}/add-stock`,  data),
    useStock:  (id, data) => api.post(`/org/inventory/${id}/use-stock`,  data),
    adjust:    (id, data) => api.post(`/org/inventory/${id}/adjust`,     data),

    // ── Movements (audit) ─────────────────────────────────────────────────────
    movements: (id, params) => api.get(`/org/inventory/${id}/movements`, { params }),

    // ── Dashboard (projection) ────────────────────────────────────────────────
    dashboard: () => api.get("/org/inventory/dashboard"),

    // ── Alerts ────────────────────────────────────────────────────────────────
    alerts: () => api.get("/org/inventory/alerts"),

    // ── Purchase Orders ───────────────────────────────────────────────────────
    listPOs:    (params) => api.get("/org/inventory/purchase-orders",         { params }),
    createPO:   (data)   => api.post("/org/inventory/purchase-orders",        data),
    receivePO:  (id)     => api.post(`/org/inventory/purchase-orders/${id}/receive`),
};
