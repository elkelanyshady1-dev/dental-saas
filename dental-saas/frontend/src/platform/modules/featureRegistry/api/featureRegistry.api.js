/**
 * featureRegistry.api.js — Feature Registry Platform API Service
 *
 * TASK-ENTITLEMENT-FULLSTACK-001
 *
 * All HTTP calls for the Feature Registry admin page.
 * Uses platformApi (Axios) — inherits auth interceptors, X-Request-ID, etc.
 *
 * PLANE: Platform only.
 */

import platformApi from "../../../auth/platformApi";

const BASE = "/feature-registry";

export const featureRegistryApi = {
    /**
     * Get full registry — modules + features + stats.
     */
    async getRegistry() {
        const { data } = await platformApi.get(BASE);
        return data?.data ?? data;
    },

    /**
     * List all modules.
     */
    async listModules() {
        const { data } = await platformApi.get(`${BASE}/modules`);
        return data?.data ?? data;
    },

    /**
     * List features, optionally filtered by module.
     * @param {string} [moduleKey]
     */
    async listFeatures(moduleKey) {
        const params = moduleKey ? { module: moduleKey } : {};
        const { data } = await platformApi.get(`${BASE}/features`, { params });
        return data?.data ?? data;
    },

    /**
     * Update a module definition.
     * @param {string} id — MongoDB ObjectId
     * @param {Object} updates
     */
    async updateModule(id, updates) {
        const { data } = await platformApi.put(`${BASE}/module/${id}`, updates);
        return data?.data ?? data;
    },

    /**
     * Toggle module enabled state.
     * @param {string} id
     * @param {boolean} enabled
     */
    async toggleModule(id, enabled) {
        const { data } = await platformApi.patch(`${BASE}/module/${id}/toggle`, { enabled });
        return data?.data ?? data;
    },

    /**
     * Update a feature definition.
     * @param {string} id
     * @param {Object} updates
     */
    async updateFeature(id, updates) {
        const { data } = await platformApi.put(`${BASE}/feature/${id}`, updates);
        return data?.data ?? data;
    },

    /**
     * Bulk update plan assignments (matrix toggle).
     * @param {"feature"|"module"} type
     * @param {string} key
     * @param {{ basic: boolean, pro: boolean, enterprise: boolean }} plans
     */
    async updateMatrix(type, key, plans) {
        const { data } = await platformApi.post(`${BASE}/matrix`, { type, key, plans });
        return data?.data ?? data;
    },

    /**
     * Manually seed registry from static definitions.
     */
    async seedRegistry() {
        const { data } = await platformApi.post(`${BASE}/seed`);
        return data?.data ?? data;
    },
};
