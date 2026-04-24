/**
 * usePayments.js — React Query hooks for org-plane patient payments (Phase 31)
 */
import { useQuery } from "@tanstack/react-query";
import { paymentsApi } from "../api/payments.api";
import { QK } from "@/lib/query/queryKeys";

export function usePayments(params = {}) {
    return useQuery({
        queryKey: QK.payments.list(params),
        queryFn: async () => {
            const res = await paymentsApi.list(params);
            const body = res.data?.data ?? res.data ?? {};
            return {
                payments: body.payments || [],
                pagination: body.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 },
            };
        },
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    });
}

export function usePayment(id) {
    return useQuery({
        queryKey: QK.payments.detail(id),
        queryFn: async () => (await paymentsApi.get(id)).data?.data,
        enabled: !!id,
        staleTime: 30_000,
    });
}
