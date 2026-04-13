/**
 * settings.api.js — Settings Hub API Service
 *
 * DOMAIN: Settings (Org)
 * OWNERSHIP: modules/org/settings/
 * STATUS: Gen2 API (co-located) — migrated from services/settings.api.js
 *
 * Architecture: Component → Hook → API → Backend Bridge → Platform
 *
 * RULES:
 *   ✔ Uses centralized `api` client (NOT raw axios)
 *   ✔ No data transformation (DTO-only passthrough)
 *   ✔ No organizationId in any request
 *   ✔ No business logic
 *
 * PLANE: Org only.
 */

import api from "@/services/api";

// ═══════════════════════════════════════════════════════════════════════════════
// BILLING — Read-Only
// ═══════════════════════════════════════════════════════════════════════════════

const BILLING_BASE = "/org/settings/billing";

/**
 * Get active subscription for the current organization.
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const getSubscription = () =>
    api.get(`${BILLING_BASE}/subscription`);

/**
 * Get invoice history for the current organization.
 * @param {{ limit?: number, skip?: number }} [params]
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const getInvoices = (params = {}) =>
    api.get(`${BILLING_BASE}/invoices`, { params });

/**
 * Get usage quota summary for the current organization.
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const getUsage = () =>
    api.get(`${BILLING_BASE}/usage`);

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPORT — Read + Write
// ═══════════════════════════════════════════════════════════════════════════════

const SUPPORT_BASE = "/org/settings/support";

/**
 * List support tickets for the current organization.
 * @param {{ limit?: number, skip?: number }} [params]
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const getTickets = (params = {}) =>
    api.get(`${SUPPORT_BASE}/tickets`, { params });

/**
 * Create a new support ticket.
 * @param {{ subject: string, description: string, category: string, priority?: string }} data
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const createTicket = (data) =>
    api.post(`${SUPPORT_BASE}/tickets`, data);

/**
 * Get support ticket detail (with filtered conversation thread).
 * @param {string} id — Ticket ID
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const getTicketDetail = (id) =>
    api.get(`${SUPPORT_BASE}/tickets/${id}`);

/**
 * Add a comment (reply) to an existing support ticket.
 * Comments are append-only — no edits, no deletes.
 * @param {string} id — Ticket ID
 * @param {string} message — Comment text
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export const addComment = (id, message) =>
    api.post(`${SUPPORT_BASE}/tickets/${id}/comments`, { message });

// ═══════════════════════════════════════════════════════════════════════════════
// TIME & LOCALE
// ═══════════════════════════════════════════════════════════════════════════════

const ORG_SETTINGS_BASE = "/org/settings/organization";

/**
 * Update timezone settings for the current organization.
 * @param {{ timezone: string, autoDetectTimezone: boolean }} data
 */
export const updateTimezone = (data) =>
    api.patch(`${ORG_SETTINGS_BASE}/timezone`, data);

// ── Namespaced export (for consistency with other domain APIs) ────────────────

export const settingsApi = {
    // Billing (read-only)
    getSubscription,
    getInvoices,
    getUsage,
    // Support (read + write)
    getTickets,
    createTicket,
    getTicketDetail,
    addComment,
};
