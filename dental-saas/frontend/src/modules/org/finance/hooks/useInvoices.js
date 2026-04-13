/**
 * useInvoices.js — React Query hooks for Finance Domain
 *
 * Provides:
 *   - Invoice list with filters (status, patientId, date range)
 *   - Single invoice detail
 *   - Revenue summary + breakdown
 *   - Optimistic void/payment mutations
 *   - Automatic cache invalidation + rollback
 *
 * API layer: modules/org/finance/api/invoices.api.js
 * Query keys: @/lib/query/queryKeys (QK.invoices)
 * Architecture: org-plane only, organizationId derived from JWT.
 *
 * SAFETY NOTE: Financial mutations (void, payment, refund) use
 * useSimpleMutation (not optimistic) because financial data requires
 * server-side validation before UI reflects changes.
 */
import { useQuery } from '@tanstack/react-query';
import { invoicesApi } from '../api/invoices.api';
import { QK, useOptimisticMutation, useSimpleMutation } from '@/lib/query';

// Re-export keys for backward compatibility
export const invoiceKeys = QK.invoices;

// ── Invoice List ──────────────────────────────────────────────────────────

/**
 * @param {{ status?: string, patientId?: string, dateFrom?: string, dateTo?: string, page?: number, limit?: number }} params
 */
export function useInvoices(params = {}) {
    return useQuery({
        queryKey: QK.invoices.list(params),
        queryFn: async () => {
            const res = await invoicesApi.list(params);
            const body = res.data;
            return {
                invoices: body?.data || body?.invoices || [],
                pagination: body?.pagination || { total: 0, page: 1, limit: 50, totalPages: 0 },
            };
        },
        staleTime: 5 * 60_000,
        placeholderData: (prev) => prev,
    });
}

// ── Single Invoice ────────────────────────────────────────────────────────

export function useInvoice(id) {
    return useQuery({
        queryKey: QK.invoices.detail(id),
        queryFn: async () => {
            const res = await invoicesApi.get(id);
            return res.data?.invoice || res.data?.data || res.data;
        },
        enabled: !!id,
        staleTime: 60_000,
    });
}

// ── Revenue Summary ───────────────────────────────────────────────────────

export function useRevenueSummary(params = {}) {
    return useQuery({
        queryKey: QK.invoices.summary(params),
        queryFn: async () => {
            const res = await invoicesApi.getRevenueSummary(params);
            return res.data?.data || res.data;
        },
        staleTime: 5 * 60_000,
    });
}

// ── Revenue Breakdown ─────────────────────────────────────────────────────

export function useRevenueBreakdown(params = {}) {
    return useQuery({
        queryKey: QK.invoices.breakdown(params),
        queryFn: async () => {
            const res = await invoicesApi.getRevenueBreakdown(params);
            return res.data?.data || res.data;
        },
        staleTime: 5 * 60_000,
    });
}

// ── Create Invoice ────────────────────────────────────────────────────────
// Not optimistic: server computes totals, tax, line items

export function useCreateInvoice() {
    return useSimpleMutation({
        mutationFn: async (data) => {
            const res = await invoicesApi.create(data);
            return res.data?.data || res.data;
        },
        invalidateKeys: [
            QK.invoices.lists(),
            QK.invoices.revenue(),
        ],
    });
}

// ── Void Invoice (Optimistic) ─────────────────────────────────────────────

export function useVoidInvoice() {
    return useOptimisticMutation({
        mutationFn: async (id) => {
            const res = await invoicesApi.void(id);
            return res.data?.data || res.data;
        },
        queryKey: QK.invoices.lists(),
        updateFn: (old, id) => {
            if (!old?.invoices) return old;
            return {
                ...old,
                invoices: old.invoices.map((inv) =>
                    inv._id === id ? { ...inv, status: 'voided' } : inv
                ),
            };
        },
        invalidateKeys: [
            QK.invoices.revenue(),
        ],
    });
}

// ── Record Payment ────────────────────────────────────────────────────────
// Not optimistic: server calculates remaining balance, partial/full status

export function useRecordPayment() {
    return useSimpleMutation({
        mutationFn: async ({ invoiceId, data }) => {
            const res = await invoicesApi.recordPayment(invoiceId, data);
            return res.data?.data || res.data;
        },
        invalidateKeys: [
            QK.invoices.lists(),
            QK.invoices.revenue(),
        ],
    });
}

// ── Issue Refund ──────────────────────────────────────────────────────────
// Not optimistic: server validates refund eligibility and amounts

export function useIssueRefund() {
    return useSimpleMutation({
        mutationFn: async ({ invoiceId, data }) => {
            const res = await invoicesApi.refund(invoiceId, data);
            return res.data?.data || res.data;
        },
        invalidateKeys: [
            QK.invoices.lists(),
            QK.invoices.revenue(),
        ],
    });
}
