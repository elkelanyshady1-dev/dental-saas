/**
 * security.api.js — Security Control Center API Layer
 *
 * All HTTP calls for the Security Control Center module.
 * Uses the shared org-plane Axios instance.
 *
 * PLANE: Org only. organizationId comes from JWT.
 */
import api from "@/services/api";

const BASE = "/org/settings/security"; // Phase H.2 — canonical Settings Hub path

export const securityApi = {
    /** Dashboard overview KPIs + weekly chart */
    getOverview: () => api.get(`${BASE}/overview`),

    /** All permissions + role mappings */
    getPermissions: () => api.get(`${BASE}/permissions`),

    /** Route → permission matrix audit */
    getMatrix: () => api.get(`${BASE}/matrix`),

    /** Policy definitions (serialized, no functions) */
    getPolicies: () => api.get(`${BASE}/policies`),

    /** Field access registry */
    getFieldAccess: () => api.get(`${BASE}/fields`),

    /** Detailed policy coverage analysis */
    getCoverage: () => api.get(`${BASE}/coverage`),

    /**
     * Audit logs (paginated + filtered)
     * @param {Object} params - { page, limit, result, search, startDate, endDate }
     */
    getLogs: (params = {}) => api.get(`${BASE}/logs`, { params }),

    /**
     * Simulate access decision (uses req.user — no body user override)
     * @param {Object} data - { permission, resource }
     */
    simulate: (data) => api.post(`${BASE}/simulate`, data),

    /**
     * Export audit logs as CSV download.
     * @param {Object} params - { result, startDate, endDate, action, entityType }
     */
    exportLogs: (params = {}) =>
        api.get(`${BASE}/logs/export`, { params, responseType: "blob" }),

    /** Export policy definitions as JSON download. */
    exportPolicies: () =>
        api.get(`${BASE}/policies/export`, { responseType: "blob" }),

    // ─── Phase 1+2: Alerts ──────────────────────────────────────────────────

    /** Get paginated security alerts. @param {Object} params - { status, severity, page, limit } */
    getAlerts: (params = {}) => api.get(`${BASE}/alerts`, { params }),

    /** Get active alert count by severity. */
    getAlertSummary: () => api.get(`${BASE}/alerts/summary`),

    /** Acknowledge a security alert. @param {string} id */
    acknowledgeAlert: (id) => api.patch(`${BASE}/alerts/${id}/acknowledge`),

    /** Resolve a security alert. @param {string} id */
    resolveAlert: (id) => api.patch(`${BASE}/alerts/${id}/resolve`),

    // ─── Phase 4: Policy History ────────────────────────────────────────────

    /** Get policy version history. @param {Object} params - { page, limit } */
    getPolicyHistory: (params = {}) => api.get(`${BASE}/policies/history`, { params }),

    // ─── Phase 5: Metrics ───────────────────────────────────────────────────

    /** Get security system operational metrics. */
    getMetrics: () => api.get(`${BASE}/metrics`),
};

/**
 * Trigger a browser file download from a blob response.
 * @param {Blob} blob - The file blob
 * @param {string} filename - Suggested filename
 */
export function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

