/**
 * authAnalytics.api.js — Authorization Analytics API Layer
 *
 * All HTTP calls for the Authorization Analytics module.
 * Uses the shared org-plane Axios instance.
 *
 * Phase 20.1 — Split endpoints for granular cache invalidation.
 *
 * PLANE: Org only. organizationId comes from JWT.
 */
import api from "@/services/api";

const BASE = "/org/settings/security/analytics"; // Phase H.2 — canonical Settings Hub path

export const authAnalyticsApi = {
    /** Get dashboard summary (total, allow rate, deny rate, avg duration) */
    getSummary: (params = {}) => api.get(`${BASE}/summary`, { params }),

    /** Get timeline chart data (allow/deny counts per time bucket) */
    getTimeline: (params = {}) => api.get(`${BASE}/timeline`, { params }),

    /** Get allow vs deny distribution for donut chart */
    getDistribution: (params = {}) => api.get(`${BASE}/distribution`, { params }),

    /** Get top denied permissions for bar chart */
    getDeniedPermissions: (params = {}) => api.get(`${BASE}/denied-permissions`, { params }),

    /** Get recent denial logs */
    getRecentDenials: (params = {}) => api.get(`${BASE}/recent-denials`, { params }),

    /** Get risk users (high denial count) */
    getRiskUsers: (params = {}) => api.get(`${BASE}/risk-users`, { params }),

    /** Get auth layer performance (RBAC, PBAC, FIELD_READ, FIELD_WRITE) */
    getLayerPerformance: (params = {}) => api.get(`${BASE}/layer-performance`, { params }),

    /** Get field-level violation attempts */
    getFieldViolations: (params = {}) => api.get(`${BASE}/field-violations`, { params }),

    /** Get auth trace queue health metrics */
    getQueueHealth: () => api.get(`${BASE}/queue-health`),

    /** Get full auth trace inspection for a specific request */
    getTraceInspection: (traceId) => api.get(`/org/settings/security/auth/traces/${traceId}`),

    /** Get security alerts from anomaly detection */
    getAlerts: (params = {}) => api.get(`${BASE}/alerts`, { params }),

    /** Acknowledge a specific alert */
    acknowledgeAlert: (alertId) => api.patch(`${BASE}/alerts/${alertId}/acknowledge`),

    /** Get user-level denial breakdown (drill-down) */
    getUserDenials: (userId, params = {}) =>
        api.get(`${BASE}/users/${userId}/denials`, { params }),

    /** Get permission-level breakdown (drill-down) */
    getPermissionBreakdown: (permission, params = {}) =>
        api.get(`${BASE}/permissions/${encodeURIComponent(permission)}/breakdown`, { params }),
};
