/**
 * accounting.api.js — Accounting Domain API (CQRS READ side)
 *
 * PLANE:  Org only
 * CQRS:   READ side — aggregated analytics from accountingDomain projection
 *
 * ✅ Phase 4 FE — CQRS decoupling:
 *   Analytics MUST use /org/accounting/* endpoints (accountingDomain projection)
 *   NOT /org/invoices/* (billingDomain write side)
 *
 * organizationId is NEVER sent — derived from JWT on backend.
 */
import api from "@/services/api";

export const accountingApi = {
    /** Daily revenue summary from accountingDomain projection */
    getDailySummary: (params = {}) =>
        api.get("/org/accounting/daily", { params }),

    /** Monthly revenue summary from accountingDomain projection */
    getMonthlySummary: (params = {}) =>
        api.get("/org/accounting/monthly", { params }),

    /** Accounting domain health (DLQ backlog, projection freshness) */
    getHealth: () =>
        api.get("/org/accounting/health"),
};
