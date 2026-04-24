/**
 * useAddOnCatalog.js — React Query hooks for platform add-on catalog CRUD.
 * PLANE: Platform
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAddOns, createAddOn, updateAddOn, deleteAddOn } from "../api/addonCatalog.api";
import { emitPlanUpdate } from "@/lib/realtime/planChannel";
import { QK } from "@/lib/query/queryKeys";

// ─── List ─────────────────────────────────────────────────────────────────────

export function useAddOnCatalogQuery(filters = {}) {
    return useQuery({
        queryKey: QK.platform.addons.list(filters),
        queryFn:  async () => {
            const res = await listAddOns(filters);
            return res.data?.data || [];
        },
        staleTime: 30_000,
    });
}

// ─── Create ───────────────────────────────────────────────────────────────────

export function useCreateAddOn() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload) => createAddOn(payload).then((r) => r.data?.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: QK.platform.addons.all });
            emitPlanUpdate();
        },
    });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function useUpdateAddOn() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ addOnId, expectedVersion, patch }) =>
            updateAddOn(addOnId, { expectedVersion, patch }).then((r) => r.data?.data),
        onSuccess: (data) => {
            if (data?._id) {
                qc.setQueryData(QK.platform.addons.detail(String(data._id)), data);
            }
            qc.invalidateQueries({ queryKey: QK.platform.addons.all });
            emitPlanUpdate();
        },
    });
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────

export function useDeleteAddOn() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (addOnId) => deleteAddOn(addOnId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: QK.platform.addons.all });
            emitPlanUpdate();
        },
    });
}
