/**
 * useQuotations.js — React Query hooks for Quotation Domain
 *
 * Provides:
 *   - Quotation list with filters (status, patientId)
 *   - Single quotation detail
 *   - Mutations: create, update, send, accept, reject, convert
 *
 * API layer: modules/org/finance/api/quotations.api.js
 * Query keys: @/lib/query/queryKeys (QK.quotations)
 * Architecture: org-plane only, organizationId derived from JWT.
 *
 * Financial mutations use useSimpleMutation (server-side validation required).
 */
import { useQuery } from '@tanstack/react-query';
import { quotationsApi } from '../api/quotations.api';
import { QK, useSimpleMutation } from '@/lib/query';

export const quotationKeys = QK.quotations;

// ── Quotation List ───────────────────────────────────────────────────────

export function useQuotations(params = {}) {
    return useQuery({
        queryKey: QK.quotations.list(params),
        queryFn: async () => {
            const res = await quotationsApi.list(params);
            const body = res.data;
            return {
                quotations: body?.data?.quotations || [],
                total: body?.data?.total || 0,
                page: body?.data?.page || 1,
                limit: body?.data?.limit || 50,
            };
        },
        staleTime: 5 * 60_000,
        placeholderData: (prev) => prev,
    });
}

// ── Single Quotation ─────────────────────────────────────────────────────

export function useQuotation(id) {
    return useQuery({
        queryKey: QK.quotations.detail(id),
        queryFn: async () => {
            const res = await quotationsApi.get(id);
            return res.data?.data || res.data;
        },
        enabled: !!id,
        staleTime: 60_000,
    });
}

// ── Create Quotation ─────────────────────────────────────────────────────

export function useCreateQuotation() {
    return useSimpleMutation({
        mutationFn: async (data) => {
            const res = await quotationsApi.create(data);
            return res.data?.data || res.data;
        },
        invalidateKeys: [QK.quotations.lists()],
    });
}

// ── Update Quotation ─────────────────────────────────────────────────────

export function useUpdateQuotation() {
    return useSimpleMutation({
        mutationFn: async ({ id, data }) => {
            const res = await quotationsApi.update(id, data);
            return res.data?.data || res.data;
        },
        invalidateKeys: [QK.quotations.lists()],
    });
}

// ── Send Quotation (draft → sent) ────────────────────────────────────────

export function useSendQuotation() {
    return useSimpleMutation({
        mutationFn: async (id) => {
            const res = await quotationsApi.send(id);
            return res.data?.data || res.data;
        },
        invalidateKeys: [QK.quotations.lists()],
    });
}

// ── Accept Quotation (staff verbal — sent → accepted) ────────────────────

export function useAcceptQuotation() {
    return useSimpleMutation({
        mutationFn: async (id) => {
            const res = await quotationsApi.accept(id);
            return res.data?.data || res.data;
        },
        invalidateKeys: [QK.quotations.lists()],
    });
}

// ── Reject Quotation ─────────────────────────────────────────────────────

export function useRejectQuotation() {
    return useSimpleMutation({
        mutationFn: async ({ id, reason }) => {
            const res = await quotationsApi.reject(id, { reason });
            return res.data?.data || res.data;
        },
        invalidateKeys: [QK.quotations.lists()],
    });
}

// ── Convert to Invoice (accepted → converted) ───────────────────────────

export function useConvertQuotation() {
    return useSimpleMutation({
        mutationFn: async ({ id, expectedVersion }) => {
            const res = await quotationsApi.convert(id, { expectedVersion });
            return res.data?.data || res.data;
        },
        invalidateKeys: [
            QK.quotations.lists(),
            QK.invoices.lists(),
        ],
    });
}
