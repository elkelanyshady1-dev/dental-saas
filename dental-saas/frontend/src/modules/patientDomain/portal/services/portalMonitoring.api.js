/**
 * portalMonitoring.api.js
 * Portal Monitoring API — progress, photos, monitoring sessions.
 * Uses portalApi instance (patient-facing) and staffApi (doctor-facing).
 * organizationId is NEVER sent, derived from JWT.
 */

import { portalApi } from "@/modules/patientDomain/shared/api/patientDomain.api";
import api from "@/services/api";

// ─── Patient-facing (portalApi — patientToken) ───────────────────────────────

export const portalProgressApi = {
    /** List aligner progress */
    list: (params = {}) => portalApi.get("/portal/progress", { params }),

    /** Activate aligner stage */
    activate: (id) => portalApi.patch(`/portal/progress/${id}/activate`),

    /** Complete aligner stage */
    complete: (id, data = {}) => portalApi.patch(`/portal/progress/${id}/complete`, data),
};

export const portalPhotosApi = {
    /** Register photo upload (after S3 upload) */
    register: (data) => portalApi.post("/portal/photos", data),
};

export const portalSessionsApi = {
    /** Submit monitoring session */
    submit: (data) => portalApi.post("/portal/monitoring", data),
};

// ─── Doctor/staff-facing (api — org_access_token with full refresh pipeline) ─

export const monitoringStaffApi = {
    /** List photos (staff) */
    listPhotos: (params = {}) => api.get("/portal/photos", { params }),

    /** List monitoring sessions (staff) */
    listSessions: (params = {}) => api.get("/portal/monitoring", { params }),

    /** Get single session with photos */
    getSession: (id) => api.get(`/portal/monitoring/${id}`),

    /** Review session (approve / revision_required) */
    reviewSession: (id, data) => api.patch(`/portal/monitoring/${id}/review`, data),
};
