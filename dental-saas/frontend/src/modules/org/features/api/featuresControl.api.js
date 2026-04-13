/**
 * featuresControl.api.js — Features & Modules Control Center API Layer
 *
 * All HTTP calls for the Features Control Center module.
 * Uses the shared org-plane Axios instance.
 *
 * Endpoints:
 *   GET    /settings/features/modules      → module states + usage
 *   GET    /settings/features/features     → feature decisions + auth chain
 *   GET    /settings/features/permissions  → live role × permission matrix
 *   GET    /settings/features/conflicts    → smart conflict detection
 *   POST   /settings/features/simulate     → auth decision simulation
 *   PATCH  /settings/features/modules/:key → toggle module on/off
 *
 * PLANE: Org only. organizationId comes from JWT.
 */
import api from "@/services/api";

const BASE = "/org/settings/features"; // Phase H.2 — canonical Settings Hub path

export const featuresControlApi = {
    // ─── Read Endpoints ─────────────────────────────────────────────────────

    /** Module states with live usage stats */
    getModules: () => api.get(`${BASE}/modules`),

    /** Feature decisions with auth decision chains */
    getFeatures: () => api.get(`${BASE}/features`),

    /** Live role × permission matrix from database */
    getPermissions: () => api.get(`${BASE}/permissions`),

    /** Smart conflict detection (flag overrides, missing deps, permission gaps) */
    getConflicts: () => api.get(`${BASE}/conflicts`),

    // ─── Write Endpoints ────────────────────────────────────────────────────

    /**
     * Simulate an authorization decision.
     * @param {Object} data - { permission: string, resourceId?: string }
     */
    simulate: (data) => api.post(`${BASE}/simulate`, data),

    /**
     * Toggle a module on/off for the organization.
     * @param {string} moduleKey - The module key (e.g., "patients", "orthodontics")
     * @param {boolean} enabled - Whether to enable or disable
     */
    toggleModule: (moduleKey, enabled) =>
        api.patch(`${BASE}/modules/${moduleKey}`, { enabled }),
};
