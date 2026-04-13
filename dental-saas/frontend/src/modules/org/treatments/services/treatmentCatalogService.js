/**
 * treatmentCatalogService.js
 * Domain: treatment-catalog
 * Layer: Frontend > Services
 *
 * RULE: No raw fetch in UI. All requests go through this service.
 * RULE: Never store server state in useState — use React Query.
 * RULE: organizationId is NEVER sent from the client — JWT provides it server-side.
 *
 * BASE URL: /api/v1/treatment-catalog
 */

import apiClient from "@/lib/apiClient"; // assumes axios instance with auth header + interceptors

const BASE = "/treatment-catalog";

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch all active categories for this org.
 * Includes procedureCount per category.
 *
 * React Query key: ["treatment-catalog", "categories"]
 */
export async function getCategories({ includeInactive = false } = {}) {
    const params = includeInactive ? { includeInactive: true } : {};
    const { data } = await apiClient.get(`${BASE}/categories`, { params });
    return data.data; // Array<CategoryDTO>
}

/**
 * Create a new category.
 * @param {{ name: string, code: string, icon?: string, description?: string, sortOrder?: number }} payload
 * Returns CategoryDTO
 */
export async function createCategory(payload) {
    const { data } = await apiClient.post(`${BASE}/categories`, payload);
    return data.data;
}

/**
 * Update an existing category.
 * code is immutable — do NOT include it in payload.
 * @param {string} categoryId
 * @param {{ name?: string, icon?: string, description?: string, sortOrder?: number }} payload
 */
export async function updateCategory(categoryId, payload) {
    const { data } = await apiClient.put(`${BASE}/categories/${categoryId}`, payload);
    return data.data;
}

/**
 * Toggle category isActive status (soft delete / restore).
 * @param {string} categoryId
 */
export async function toggleCategory(categoryId) {
    const { data } = await apiClient.patch(`${BASE}/categories/${categoryId}/toggle`);
    return data.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROCEDURES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch all active procedures for a category.
 *
 * React Query key: ["treatment-catalog", "procedures", categoryId]
 *
 * @param {string} categoryId - REQUIRED
 * @param {{ includeInactive?: boolean }} options
 */
export async function getProcedures(categoryId, { includeInactive = false } = {}) {
    if (!categoryId) throw new Error("categoryId is required");
    const { data } = await apiClient.get(`${BASE}/procedures`, {
        params: { categoryId, ...(includeInactive ? { includeInactive: true } : {}) },
    });
    return data.data; // Array<ProcedureDTO>
}

/**
 * Create a new procedure under a category.
 * @param {{
 *   categoryId: string,
 *   name: string,
 *   code: string,
 *   duration: number,     // REQUIRED — used for appointment slot auto-fill
 *   price?: number | null,
 *   color?: string,       // hex e.g. "#4f46e5" — used for calendar display
 *   description?: string,
 *   sortOrder?: number,
 * }} payload
 */
export async function createProcedure(payload) {
    const { data } = await apiClient.post(`${BASE}/procedures`, payload);
    return data.data;
}

/**
 * Update an existing procedure.
 * categoryId is immutable — do NOT include it in payload.
 * @param {string} procedureId
 * @param {{
 *   name?: string,
 *   duration?: number,
 *   price?: number | null,
 *   color?: string,
 *   description?: string,
 *   sortOrder?: number,
 * }} payload
 */
export async function updateProcedure(procedureId, payload) {
    const { data } = await apiClient.put(`${BASE}/procedures/${procedureId}`, payload);
    return data.data;
}

/**
 * Toggle procedure isActive status.
 * @param {string} procedureId
 */
export async function toggleProcedure(procedureId) {
    const { data } = await apiClient.patch(`${BASE}/procedures/${procedureId}/toggle`);
    return data.data;
}
