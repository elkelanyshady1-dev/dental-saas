/**
 * optimisticMutation.js — Optimistic Mutation Helper (Org Plane)
 *
 * Wraps useMutation with automatic optimistic cache updates + rollback.
 *
 * Pattern:
 *   onMutate  → cancel in-flight queries → snapshot cache → apply updateFn
 *   onError   → rollback to snapshot
 *   onSettled → revalidate from server (source of truth)
 *
 * Usage:
 *   import { useOptimisticMutation } from "@/lib/query/optimisticMutation";
 *
 *   // List-level optimistic update (add item to list)
 *   const create = useOptimisticMutation({
 *       mutationFn: (data) => api.create(data),
 *       queryKey: QK.patients.lists(),
 *       updateFn: (old, newItem) => ({
 *           ...old,
 *           patients: [newItem, ...(old?.patients || [])],
 *       }),
 *   });
 *
 *   // Detail-level optimistic update (update fields)
 *   const update = useOptimisticMutation({
 *       mutationFn: ({ id, data }) => api.update(id, data),
 *       queryKey: QK.patients.detail(patientId),
 *       updateFn: (old, { data }) => ({ ...old, ...data }),
 *       invalidateKeys: [QK.patients.lists()], // also invalidate lists
 *   });
 *
 * SAFETY:
 *   - Always rolls back on error (server is source of truth)
 *   - Always revalidates on settle (optimistic data is temporary)
 *   - Cancels in-flight queries to prevent race conditions
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * @param {object} options
 * @param {Function} options.mutationFn       — The async mutation function
 * @param {unknown[]} options.queryKey        — The query key to optimistically update
 * @param {Function} options.updateFn         — (oldData, variables) => newData
 * @param {unknown[][]} [options.invalidateKeys] — Additional keys to invalidate on settle
 * @param {Function} [options.onSuccess]      — Additional onSuccess callback
 * @param {Function} [options.onError]        — Additional onError callback (after rollback)
 */
export function useOptimisticMutation({
    mutationFn,
    queryKey,
    updateFn,
    invalidateKeys = [],
    onSuccess,
    onError,
}) {
    const qc = useQueryClient();

    return useMutation({
        mutationFn,

        // ── Step 1: Optimistic Update ──────────────────────────────────
        onMutate: async (variables) => {
            // Cancel any in-flight queries for this key to prevent race conditions
            await qc.cancelQueries({ queryKey });

            // Snapshot the current cache value for rollback
            const previousData = qc.getQueryData(queryKey);

            // Optimistically update the cache
            if (updateFn && previousData !== undefined) {
                qc.setQueryData(queryKey, (old) => updateFn(old, variables));
            }

            return { previousData };
        },

        // ── Step 2: Rollback on Error ──────────────────────────────────
        onError: (err, variables, context) => {
            // Restore the previous cache value
            if (context?.previousData !== undefined) {
                qc.setQueryData(queryKey, context.previousData);
            }

            // Call additional error handler if provided
            onError?.(err, variables, context);
        },

        // ── Step 3: Revalidate on Settle ───────────────────────────────
        onSettled: (data, error, variables) => {
            // Always revalidate from server (source of truth)
            qc.invalidateQueries({ queryKey });

            // Invalidate any additional related queries
            for (const key of invalidateKeys) {
                qc.invalidateQueries({ queryKey: key });
            }
        },

        // ── Step 4: Success Callback ───────────────────────────────────
        onSuccess: (data, variables, context) => {
            onSuccess?.(data, variables, context);
        },
    });
}

/**
 * useSimpleMutation — Non-optimistic mutation with standardized invalidation.
 *
 * For mutations where optimistic UI doesn't make sense (e.g., file uploads,
 * complex server-side transformations, or when the response shape is unpredictable).
 *
 * @param {object} options
 * @param {Function} options.mutationFn
 * @param {unknown[][]} options.invalidateKeys — Keys to invalidate on success
 * @param {Function} [options.onSuccess]
 * @param {Function} [options.onError]
 */
export function useSimpleMutation({
    mutationFn,
    invalidateKeys = [],
    onSuccess,
    onError,
}) {
    const qc = useQueryClient();

    return useMutation({
        mutationFn,
        onSuccess: (data, variables, context) => {
            for (const key of invalidateKeys) {
                qc.invalidateQueries({ queryKey: key });
            }
            onSuccess?.(data, variables, context);
        },
        onError,
    });
}
