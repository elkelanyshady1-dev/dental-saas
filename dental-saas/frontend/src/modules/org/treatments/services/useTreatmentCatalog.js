/**
 * useTreatmentCatalog.js
 * Domain: treatment-catalog
 * Layer: Frontend > Hooks
 *
 * React Query hooks for the treatment catalog domain.
 * RULE: Server state MUST live in React Query — never in useState.
 * RULE: Mutations invalidate queries — never call refetch() manually.
 *
 * APPOINTMENT INTEGRATION:
 *   When a procedure is selected:
 *   1. Call useProcedures(categoryId) to get the list
 *   2. Store the selected procedure object (from React Query cache)
 *   3. Auto-fill appointment.duration from procedure.duration
 *   4. Send only procedureId to the backend — snapshot is built server-side
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast"; // or your project's toast lib
import {
    getCategories,
    createCategory,
    updateCategory,
    toggleCategory,
    getProcedures,
    createProcedure,
    updateProcedure,
    toggleProcedure,
} from "./treatmentCatalogService";

// ── Query Keys ─────────────────────────────────────────────────────────────────

export const catalogKeys = {
    all:          ["treatment-catalog"],
    categories:   () => [...catalogKeys.all, "categories"],
    procedures:   (categoryId) => [...catalogKeys.all, "procedures", categoryId],
};

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch all active categories with procedure counts.
 * @param {{ includeInactive?: boolean }} options
 */
export function useCategories({ includeInactive = false } = {}) {
    return useQuery({
        queryKey: [...catalogKeys.categories(), { includeInactive }],
        queryFn: () => getCategories({ includeInactive }),
        staleTime: 5 * 60 * 1000, // 5 min — catalog changes rarely
    });
}

/**
 * Create a new category.
 * Invalidates categories list on success.
 */
export function useCreateCategory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload) => createCategory(payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: catalogKeys.categories() });
            toast.success("Category created");
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error?.message ?? "Failed to create category");
        },
    });
}

/**
 * Update a category. Invalidates categories list.
 */
export function useUpdateCategory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ categoryId, payload }) => updateCategory(categoryId, payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: catalogKeys.categories() });
            toast.success("Category updated");
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error?.message ?? "Failed to update category");
        },
    });
}

/**
 * Toggle category active status. Invalidates categories + procedures for that category.
 */
export function useToggleCategory() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (categoryId) => toggleCategory(categoryId),
        onSuccess: (_, categoryId) => {
            qc.invalidateQueries({ queryKey: catalogKeys.categories() });
            qc.invalidateQueries({ queryKey: catalogKeys.procedures(categoryId) });
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error?.message ?? "Failed to toggle category");
        },
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROCEDURE HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch procedures for a category.
 * Disabled if categoryId is falsy — safe for conditional rendering.
 *
 * APPOINTMENT FLOW:
 *   const { data: procedures } = useProcedures(selectedCategoryId);
 *   // User clicks procedure card → store the whole procedure object
 *   // Pull procedure.duration to auto-fill appointment duration field
 *   // Send procedure.id as procedureId to POST /appointments
 *
 * @param {string | null} categoryId
 * @param {{ includeInactive?: boolean }} options
 */
export function useProcedures(categoryId, { includeInactive = false } = {}) {
    return useQuery({
        queryKey: [...catalogKeys.procedures(categoryId), { includeInactive }],
        queryFn: () => getProcedures(categoryId, { includeInactive }),
        enabled: !!categoryId,
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Create a new procedure. Invalidates procedures list for the target category.
 */
export function useCreateProcedure() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload) => createProcedure(payload),
        onSuccess: (_, payload) => {
            qc.invalidateQueries({ queryKey: catalogKeys.procedures(payload.categoryId) });
            qc.invalidateQueries({ queryKey: catalogKeys.categories() }); // refresh counts
            toast.success("Procedure created");
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error?.message ?? "Failed to create procedure");
        },
    });
}

/**
 * Update a procedure. Requires categoryId for cache invalidation.
 * @example
 *   const { mutate } = useUpdateProcedure();
 *   mutate({ procedureId, categoryId, payload: { duration: 30 } });
 */
export function useUpdateProcedure() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ procedureId, payload }) => updateProcedure(procedureId, payload),
        onSuccess: (_, { categoryId }) => {
            qc.invalidateQueries({ queryKey: catalogKeys.procedures(categoryId) });
            toast.success("Procedure updated");
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error?.message ?? "Failed to update procedure");
        },
    });
}

/**
 * Toggle procedure active status.
 */
export function useToggleProcedure() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ procedureId }) => toggleProcedure(procedureId),
        onSuccess: (_, { categoryId }) => {
            qc.invalidateQueries({ queryKey: catalogKeys.procedures(categoryId) });
            qc.invalidateQueries({ queryKey: catalogKeys.categories() }); // refresh counts
        },
        onError: (err) => {
            toast.error(err?.response?.data?.error?.message ?? "Failed to toggle procedure");
        },
    });
}
