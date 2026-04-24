/**
 * useAccounting.js — React Query hooks for the accounting read side (Phase 31)
 *
 * The Finance Hub reads every numeric card + chart from these endpoints —
 * never re-derives totals on the client.
 */
import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "../api/accounting.api";
import { QK } from "@/lib/query/queryKeys";

export function useAccountingMonthly(params = {}) {
    return useQuery({
        queryKey: QK.accounting.monthly(params),
        queryFn: async () => (await accountingApi.getMonthlySummary(params)).data?.data,
        staleTime: 60_000,
        placeholderData: (prev) => prev,
    });
}

export function useAccountingDaily(params = {}) {
    return useQuery({
        queryKey: QK.accounting.daily(params),
        queryFn: async () => (await accountingApi.getDailySummary(params)).data?.data,
        staleTime: 60_000,
        placeholderData: (prev) => prev,
    });
}

export function useAccountingRevenue(params = {}) {
    return useQuery({
        queryKey: QK.accounting.revenue(params),
        queryFn: async () => (await accountingApi.getRevenueSeries(params)).data?.data,
        staleTime: 60_000,
        placeholderData: (prev) => prev,
    });
}

export function useAccountingOutstanding(params = {}) {
    return useQuery({
        queryKey: QK.accounting.outstanding(params),
        queryFn: async () => (await accountingApi.getOutstanding(params)).data?.data,
        staleTime: 60_000,
    });
}

export function useAccountingHealth() {
    return useQuery({
        queryKey: QK.accounting.health(),
        queryFn: async () => (await accountingApi.getHealth()).data?.data,
        staleTime: 30_000,
    });
}
