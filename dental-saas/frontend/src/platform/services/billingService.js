/**
 * billingService.js
 * Sprint 7.2 — Platform Billing + Refund + Finance API Client
 *
 * All endpoints map to /api/platform/* routes (billing.routes.js, contracts.routes.js).
 * No legacy subscription fields. No hardcoded currency.
 *
 * PLANE: Platform
 */

import platformApi from "../auth/platformApi";

// ─── Contracts ────────────────────────────────────────────────────────────────

export const contractService = {
    /** GET /api/platform/contracts/needs-renewal */
    getRenewalDashboard: () =>
        platformApi.get("/contracts/needs-renewal").then((r) => r.data),

    /** GET /api/platform/contracts/:id/invoices */
    getContractInvoices: (contractId) =>
        platformApi.get(`/contracts/${contractId}/invoices`).then((r) => r.data),

    /** PATCH /api/platform/contracts/:id/status */
    updateContractStatus: (contractId, payload) =>
        platformApi.patch(`/contracts/${contractId}/status`, payload).then((r) => r.data),

    /** POST /api/platform/contracts/:id/replace */
    replaceContract: (contractId, payload) =>
        platformApi.post(`/contracts/${contractId}/replace`, payload).then((r) => r.data),

    /** PATCH /api/platform/contracts/:id/auto-renew — toggle autoRenew boolean */
    toggleAutoRenew: (contractId, autoRenew) =>
        platformApi.patch(`/contracts/${contractId}/auto-renew`, { autoRenew }).then((r) => r.data),

    /** POST /api/platform/contracts/:id/schedule-change — schedule downgrade */
    scheduleChange: (contractId, payload) =>
        platformApi.post(`/contracts/${contractId}/schedule-change`, payload).then((r) => r.data),

    /** DELETE /api/platform/contracts/:id/scheduled-change — cancel scheduled downgrade */
    cancelScheduledChange: (contractId) =>
        platformApi.delete(`/contracts/${contractId}/scheduled-change`).then((r) => r.data),
};

// ─── Invoices ─────────────────────────────────────────────────────────────────

export const invoiceService = {
    /** GET /api/platform/billing/invoices?organizationId=:orgId */
    getOrgBillingOverview: (orgId) =>
        platformApi.get(`/billing/invoices?organizationId=${orgId}`).then((r) => r.data),

    /** GET /api/platform/invoices/:id/refunds */
    getInvoiceRefunds: (invoiceId) =>
        platformApi.get(`/invoices/${invoiceId}/refunds`).then((r) => r.data),
};

// ─── Refunds ──────────────────────────────────────────────────────────────────

export const refundService = {
    /** POST /api/platform/contracts/:contractId/refund-request */
    requestRefund: (contractId, payload) =>
        platformApi
            .post(`/contracts/${contractId}/refund-request`, payload)
            .then((r) => r.data),

    /** PATCH /api/platform/refunds/:id/approve */
    approveRefund: (refundId) =>
        platformApi.patch(`/refunds/${refundId}/approve`).then((r) => r.data),

    /** PATCH /api/platform/refunds/:id/reject */
    rejectRefund: (refundId, reason) =>
        platformApi.patch(`/refunds/${refundId}/reject`, { reason }).then((r) => r.data),

    /** POST /api/platform/refunds/:id/process */
    processRefund: (refundId) =>
        platformApi.post(`/refunds/${refundId}/process`).then((r) => r.data),

    /** GET /api/platform/refunds/:id */
    getRefund: (refundId) =>
        platformApi.get(`/refunds/${refundId}`).then((r) => r.data),
};

// ─── Finance / Exchange Rates ─────────────────────────────────────────────────

export const financeService = {
    /** GET /api/platform/finance/exchange-rates */
    getExchangeRates: (params) =>
        platformApi.get("/finance/exchange-rates", { params }).then((r) => r.data),

    /** POST /api/platform/finance/exchange-rate */
    upsertExchangeRate: (payload) =>
        platformApi.post("/finance/exchange-rate", payload).then((r) => r.data),

    /** GET /api/platform/billing/dashboard — renewal KPIs, MRR/ARR */
    getRenewalMetrics: () =>
        platformApi.get("/billing/dashboard").then((r) => r.data),
};
