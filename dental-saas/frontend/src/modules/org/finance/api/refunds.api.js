/**
 * refunds.api.js — Patient Refund API client (Org Plane, Phase 31)
 *
 * organizationId is NEVER sent — backend derives from JWT.
 */
import api from "@/services/api";

const BASE = "/org/refunds";

export const refundsApi = {
    list: (params = {}) => api.get(BASE, { params }),
    /**
     * Process a refund against an existing payment.
     * @param {{ paymentId:string, amount:number, reason:string }} data
     */
    create: (data) => api.post(BASE, data),
};
