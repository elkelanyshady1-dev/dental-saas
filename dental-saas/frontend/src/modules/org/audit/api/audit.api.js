/**
 * audit.api.js — Audit Timeline API Service
 *
 * Centralizes all audit timeline HTTP calls.
 * Uses the org API base (/api/v1/org/audit/*).
 *
 * PLANE: Org only.
 * SENTINEL: All HTTP via api service — no inline axios.
 *
 * @module services/audit.api
 */

import api from "@/services/api";

const BASE = "/org/audit";

/**
 * Get organization-wide audit timeline.
 */
export async function getOrgTimeline(params = {}) {
    const res = await api.get(`${BASE}/timeline`, { params });
    return res.data?.data || res.data;
}

/**
 * Get audit timeline for a specific entity.
 * @param {string} entityId
 * @param {Object} [params]
 */
export async function getEntityTimeline(entityId, params = {}) {
    const res = await api.get(`${BASE}/entity/${entityId}`, { params });
    return res.data?.data || res.data;
}

/**
 * Get activity history for a specific user.
 * @param {string} userId
 * @param {Object} [params]
 */
export async function getUserActivity(userId, params = {}) {
    const res = await api.get(`${BASE}/user/${userId}`, { params });
    return res.data?.data || res.data;
}

/**
 * Get aggregated audit statistics.
 * @param {Object} [params]
 */
export async function getAuditStats(params = {}) {
    const res = await api.get(`${BASE}/stats`, { params });
    return res.data?.data || res.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 14 — Audit Intelligence + Export + Governance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get security alerts from anomaly detection engine.
 * @param {Object} [params] - { hours: 24 }
 */
export async function getAuditAlerts(params = {}) {
    const res = await api.get(`${BASE}/alerts`, { params });
    return res.data?.data || res.data;
}

/**
 * Export audit logs for legal compliance.
 * @param {Object} params - { from: ISO, to: ISO, category? }
 */
export async function exportAuditLogs(params = {}) {
    const res = await api.get(`${BASE}/export`, { params });
    return res.data?.data || res.data;
}

/**
 * Get governance violation status.
 * @param {Object} [params] - { rule?, severity?, limit? }
 */
export async function getGovernanceStatus(params = {}) {
    const res = await api.get(`${BASE}/governance`, { params });
    return res.data?.data || res.data;
}

export default {
    getOrgTimeline,
    getEntityTimeline,
    getUserActivity,
    getAuditStats,
    getAuditAlerts,
    exportAuditLogs,
    getGovernanceStatus,
};
