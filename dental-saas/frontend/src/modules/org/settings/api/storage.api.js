/**
 * storage.api.js — Storage Usage API Service
 *
 * DOMAIN: Settings (Org)
 * OWNERSHIP: modules/org/settings/
 * STATUS: Gen2 API (co-located) — migrated from services/storage.api.js
 *
 * PLANE: Organization
 */

import api from "@/services/api";

/**
 * Get storage usage for the current organization.
 *
 * @returns {Promise<{
 *   totalBytes: number,
 *   totalMB: number,
 *   totalGB: number,
 *   totalFiles: number,
 *   maxStorageMB: number,
 *   percentUsed: number,
 *   breakdown: { photos: number, stl: number, audio: number, documents: number, other: number },
 *   fileCount: { photos: number, stl: number, audio: number, documents: number, other: number },
 *   lastUploadAt: string | null
 * }>}
 */
export async function getStorageUsage() {
    const res = await api.get("/org/storage-usage");
    return res.data?.data;
}

export const storageApi = {
    getStorageUsage,
};

export default storageApi;
