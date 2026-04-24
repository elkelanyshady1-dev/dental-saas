/**
 * addonCatalog.api.js — Platform add-on catalog API client.
 * PLANE: Platform
 */

import platformApi from "@/platform/auth/platformApi";

/**
 * @returns {Promise<Array>}
 */
export function listAddOns(filters = {}) {
    return platformApi.get("/addons", { params: filters });
}

/**
 * @param {Object} payload — createAddOnSchema shape
 * @returns {Promise<Object>}
 */
export function createAddOn(payload) {
    return platformApi.post("/addons", payload);
}

/**
 * @param {string} addOnId
 * @param {{ expectedVersion: number, patch: Object }} payload
 * @returns {Promise<Object>}
 */
export function updateAddOn(addOnId, payload) {
    return platformApi.patch(`/addons/${addOnId}`, payload);
}

/**
 * @param {string} addOnId
 * @returns {Promise<void>}
 */
export function deleteAddOn(addOnId) {
    return platformApi.delete(`/addons/${addOnId}`);
}
