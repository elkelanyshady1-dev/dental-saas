/**
 * useInventory.js — Inventory React Query Hooks
 *
 * RULE 11.1: All server state via useQuery.
 * RULE 11.2: All keys from QK registry (centralized).
 * RULE 11.6: staleTime / gcTime enforced per tier.
 *
 * CQRS:
 *   - Reads: QK.inventory.list / detail / dashboard / alerts
 *   - Mutations: invalidate QK.inventory.all after each write
 *
 * PLANE: Org only.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "../api/inventory.api";
import { QK }          from "@/lib/query/queryKeys";

const STALE_LIST   = 30 * 1000;    // 30s
const STALE_DASH   = 60 * 1000;    // 60s
const GC_TIME      = 5 * 60 * 1000; // 5 min

// ── READ HOOKS ────────────────────────────────────────────────────────────────

/** Paginated item list with optional filters */
export function useInventoryList(params = {}) {
    return useQuery({
        queryKey:             QK.inventory.list(params),
        queryFn:              () => inventoryApi.list(params).then(r => r.data),
        staleTime:            STALE_LIST,
        gcTime:               GC_TIME,
        refetchOnWindowFocus: false,
    });
}

/** Single inventory item */
export function useInventoryItem(id) {
    return useQuery({
        queryKey:             QK.inventory.detail(id),
        queryFn:              () => inventoryApi.get(id).then(r => r.data),
        enabled:              !!id,
        staleTime:            STALE_LIST,
        gcTime:               GC_TIME,
        refetchOnWindowFocus: false,
    });
}

/** Movement audit trail for a single item */
export function useInventoryMovements(itemId, params = {}) {
    return useQuery({
        queryKey:             QK.inventory.movements(itemId),
        queryFn:              () => inventoryApi.movements(itemId, params).then(r => r.data),
        enabled:              !!itemId,
        staleTime:            STALE_LIST,
        gcTime:               GC_TIME,
        refetchOnWindowFocus: false,
    });
}

/** Dashboard projection (pre-computed server-side) */
export function useInventoryDashboard() {
    return useQuery({
        queryKey:             QK.inventory.dashboard(),
        queryFn:              () => inventoryApi.dashboard().then(r => r.data),
        staleTime:            STALE_DASH,
        gcTime:               GC_TIME,
        refetchOnWindowFocus: false,
    });
}

/** Active low-stock alerts */
export function useInventoryAlerts() {
    return useQuery({
        queryKey:             QK.inventory.alerts(),
        queryFn:              () => inventoryApi.alerts().then(r => r.data),
        staleTime:            STALE_LIST,
        gcTime:               GC_TIME,
        refetchOnWindowFocus: false,
    });
}

/** Purchase order list */
export function usePurchaseOrders(params = {}) {
    return useQuery({
        queryKey:             QK.inventory.orders(params),
        queryFn:              () => inventoryApi.listPOs(params).then(r => r.data),
        staleTime:            STALE_LIST,
        gcTime:               GC_TIME,
        refetchOnWindowFocus: false,
    });
}

// ── MUTATION HOOKS ────────────────────────────────────────────────────────────

/** Invalidates all inventory queries after any mutation */
function useInvalidateAll() {
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: QK.inventory.all });
}

export function useCreateItem() {
    const invalidate = useInvalidateAll();
    return useMutation({
        mutationFn: (data) => inventoryApi.create(data).then(r => r.data),
        onSuccess:  invalidate,
    });
}

export function useUpdateItem() {
    const invalidate = useInvalidateAll();
    return useMutation({
        mutationFn: ({ id, data }) => inventoryApi.update(id, data).then(r => r.data),
        onSuccess:  invalidate,
    });
}

export function useDeleteItem() {
    const invalidate = useInvalidateAll();
    return useMutation({
        mutationFn: (id) => inventoryApi.remove(id).then(r => r.data),
        onSuccess:  invalidate,
    });
}

export function useAddStock() {
    const invalidate = useInvalidateAll();
    return useMutation({
        mutationFn: ({ id, data }) => inventoryApi.addStock(id, data).then(r => r.data),
        onSuccess:  invalidate,
    });
}

export function useUseStock() {
    const invalidate = useInvalidateAll();
    return useMutation({
        mutationFn: ({ id, data }) => inventoryApi.useStock(id, data).then(r => r.data),
        onSuccess:  invalidate,
    });
}

export function useAdjustStock() {
    const invalidate = useInvalidateAll();
    return useMutation({
        mutationFn: ({ id, data }) => inventoryApi.adjust(id, data).then(r => r.data),
        onSuccess:  invalidate,
    });
}

export function useCreatePurchaseOrder() {
    const invalidate = useInvalidateAll();
    return useMutation({
        mutationFn: (data) => inventoryApi.createPO(data).then(r => r.data),
        onSuccess:  invalidate,
    });
}

export function useReceivePurchaseOrder() {
    const invalidate = useInvalidateAll();
    return useMutation({
        mutationFn: (id) => inventoryApi.receivePO(id).then(r => r.data),
        onSuccess:  invalidate,
    });
}
