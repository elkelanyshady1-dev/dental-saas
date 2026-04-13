/**
 * index.js — Query Infrastructure (Org Plane)
 *
 * Barrel export for the centralized query system.
 *
 * Usage:
 *   import { QK, useOptimisticMutation, useSimpleMutation, queryClient } from "@/lib/query";
 */

export { QK } from "./queryKeys";
export { useOptimisticMutation, useSimpleMutation } from "./optimisticMutation";
export { queryClient } from "./queryClient";
