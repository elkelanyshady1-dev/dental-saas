/**
 * file.api.js — File Module API Layer
 * Phase v27.1 — Frontend File Module
 *
 * All file operations routed through the org-plane File endpoints.
 * Uses the shared `api` axios instance (auth + CSRF + branch context auto-injected).
 *
 * Endpoints:
 *   POST   /org/files/upload    → upload file (multipart/form-data)
 *   GET    /org/files            → list files (paginated, filterable)
 *   GET    /org/files/:id/url    → get signed URL for file access
 *   DELETE /org/files/:id        → soft-delete file
 *
 * PLANE: Organization
 */

import api from "@/services/api";

export const fileApi = {
    /**
     * Upload a file via multipart/form-data.
     *
     * @param {FormData} formData — Must contain "file" field + category, optional patientId/caseId/visitId
     * @param {function} [onUploadProgress] — axios progress callback (e.loaded, e.total)
     * @returns {Promise<import("axios").AxiosResponse>}
     */
    upload: (formData, onUploadProgress) =>
        api.post("/org/files/upload", formData, {
            headers: { "Content-Type": "multipart/form-data" },
            onUploadProgress,
        }),

    /**
     * List files with optional filters.
     *
     * @param {Object} params — { category?, patientId?, caseId?, visitId?, page?, limit? }
     * @returns {Promise<import("axios").AxiosResponse>}
     */
    list: (params = {}) =>
        api.get("/org/files", { params }),

    /**
     * Get a signed URL for file access.
     *
     * @param {string} fileId — File document _id
     * @returns {Promise<import("axios").AxiosResponse>} — { data: { url } }
     */
    getUrl: (fileId) =>
        api.get(`/org/files/${fileId}/url`),

    /**
     * Soft-delete a file.
     *
     * @param {string} fileId — File document _id
     * @returns {Promise<import("axios").AxiosResponse>}
     */
    delete: (fileId) =>
        api.delete(`/org/files/${fileId}`),
};

export default fileApi;
