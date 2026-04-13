/**
 * queryClient.js — Global Query Client Configuration (Org Plane)
 *
 * Centralized QueryClient instance with production-grade defaults.
 * Imported by QueryProvider.jsx and available for prefetching.
 *
 * Usage:
 *   import { queryClient } from "@/lib/query/queryClient";
 *
 *   // Prefetch on hover
 *   queryClient.prefetchQuery({
 *       queryKey: QK.patients.detail(id),
 *       queryFn: () => patientsApi.get(id),
 *   });
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,          // 30s — data is "fresh" for half a minute
            gcTime: 5 * 60_000,         // 5min — garbage collect unused cache entries
            refetchOnWindowFocus: false, // Don't auto-refetch on tab switch (SaaS preference)
            retry: 1,                   // Single retry on transient network errors
            refetchOnReconnect: true,    // Refetch when network reconnects
        },
        mutations: {
            retry: 0,                   // Never retry mutations (avoid double-writes)
        },
    },
});

export default queryClient;
