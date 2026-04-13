/**
 * portalMessages.api.js
 * Portal Messaging API — patient + staff endpoints.
 * Uses portalApi (patient-facing) and staffApi (doctor-facing).
 * organizationId is NEVER sent, derived from JWT.
 */

import { portalApi } from "@/modules/patientDomain/shared/api/patientDomain.api";
import api from "@/services/api";

// ─── Patient-facing ──────────────────────────────────────────────────────────

export const portalMessagesApi = {
    /** Send message as patient */
    send: (data) => portalApi.post("/portal/messages", data),

    /** List messages (patient view) */
    list: (params = {}) => portalApi.get("/portal/messages", { params }),
};

// ─── Staff-facing ────────────────────────────────────────────────────────────

export const staffMessagesApi = {
    /** Send message to patient as staff */
    send: (data) => api.post("/portal/messages/staff", data),

    /** List messages for a patient (staff view) */
    list: (params = {}) => api.get("/portal/messages", { params }),
};
