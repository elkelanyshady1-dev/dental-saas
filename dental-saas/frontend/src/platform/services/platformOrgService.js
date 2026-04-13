import platformApi from "../auth/platformApi";

/**
 * platformOrgService.js
 * Service for organization-level governance and administrative operations.
 * This service centralizes all organization-specific lifecycle and billing endpoints.
 *
 * Removed (no backend implementation):
 *   getBillingSummary()       — use /billing/invoices?organizationId= instead
 *   getCommunicationUsage()   — endpoint not implemented in backend
 */
export const platformOrgService = {
    async getEffectivePlan(orgId) {
        const { data } = await platformApi.get(`/org/${orgId}/effective-plan`);
        return data;
    },

    async changePlan(orgId, payload) {
        const { data } = await platformApi.post(`/org/${orgId}/change-plan`, payload);
        return data;
    },

    async getAddons(orgId) {
        const { data } = await platformApi.get(`/org/${orgId}/addons`);
        return data;
    },

    async addAddon(orgId, addonKey, expectedVersion) {
        const { data } = await platformApi.post(`/org/${orgId}/add-addon`, { addonKey, expectedVersion });
        return data;
    },

    async removeAddon(orgId, addonKey, expectedVersion) {
        const { data } = await platformApi.delete(`/org/${orgId}/remove-addon`, { data: { addonKey, expectedVersion } });
        return data;
    },

    async getUsage(orgId) {
        const { data } = await platformApi.get(`/org/${orgId}/usage`);
        return data;
    },

    // Sprint 8: Fetch paginated invoices for a specific org via global billing filter
    async getInvoices(orgId) {
        const { data } = await platformApi.get(`/billing/invoices?organizationId=${orgId}`);
        // Normalize: billing/invoices returns { data: [...], pagination: {...} }
        return data?.data ?? data ?? [];
    },

    // Sprint 8: Fetch all OrgContracts for an org (used by useOrgBilling to detect pending plan)
    async getContracts(orgId) {
        const { data } = await platformApi.get(`/organizations/${orgId}/contracts`);
        // Response shape: { currentContract, contracts: [...], invoices: [...] }
        return Array.isArray(data?.contracts) ? data.contracts : (Array.isArray(data) ? data : []);
    },

    // v21.0: Fetch paginated payment attempts for an org (Payment History section)
    async getPayments(orgId, params = {}) {
        const { data } = await platformApi.get("/billing/payments", {
            params: { organizationId: orgId, ...params }
        });
        return data?.data ?? data ?? [];
    },

    // v21.0: Fetch billing ledger entries for an org (Ledger Timeline section)
    async getLedger(orgId, params = {}) {
        const { data } = await platformApi.get("/billing/ledger", {
            params: { organizationId: orgId, ...params }
        });
        return data?.data ?? data ?? [];
    },

    // v22.0: Fetch credit balance from LedgerEngine
    async getCredits(orgId) {
        const { data } = await platformApi.get(`/billing/organizations/${orgId}/credits`);
        return data?.data ?? { creditBalance: 0, credits: [] };
    }
};
