/**
 * lab.api.js — Lab Domain API Client
 *
 * PLANE: Org only. Uses org-plane api instance.
 */

import api from "@/services/api";

export const labApi = {
    // ── Partners ──────────────────────────────────────────────────────────────
    getLabs:        (params)    => api.get("/org/labs",       { params }),
    getLab:         (id)        => api.get(`/org/labs/${id}`),
    createLab:      (data)      => api.post("/org/labs",      data),
    updateLab:      (id, data)  => api.put(`/org/labs/${id}`, data),

    // ── Cases ─────────────────────────────────────────────────────────────────
    getCases:       (params)    => api.get("/org/lab-cases",             { params }),
    getKanban:      ()          => api.get("/org/lab-cases/kanban"),
    getPriority:    ()          => api.get("/org/lab-cases/priority"),
    getDashboard:   ()          => api.get("/org/lab-cases/dashboard"),
    getCase:        (id)        => api.get(`/org/lab-cases/${id}`),
    createCase:     (data)      => api.post("/org/lab-cases",            data),
    updateStatus:   (id, data)  => api.patch(`/org/lab-cases/${id}/status`, data),

    // ── Messages ──────────────────────────────────────────────────────────────
    getMessages:    (id, params) => api.get(`/org/lab-cases/${id}/messages`, { params }),
    postMessage:    (id, data)   => api.post(`/org/lab-cases/${id}/messages`, data),

    // ── Claims ────────────────────────────────────────────────────────────────
    getClaims:      (params)    => api.get("/org/lab-claims",              { params }),
    createClaim:    (data)      => api.post("/org/lab-claims",             data),
    approveClaim:   (id)        => api.patch(`/org/lab-claims/${id}/approve`),
    markClaimPaid:  (id)        => api.patch(`/org/lab-claims/${id}/paid`),
};
