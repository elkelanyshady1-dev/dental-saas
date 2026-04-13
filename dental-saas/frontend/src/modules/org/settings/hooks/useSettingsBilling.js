/**
 * useSettingsBilling.js — React Query Hooks for Settings Hub: Billing
 *
 * Provides:
 *   - Active subscription query
 *   - Invoice history query (paginated)
 *   - Usage quotas query
 *
 * API layer:   @/modules/org/settings/api/settings.api.js
 * Query keys:  @/lib/query/queryKeys (QK.settingsBilling)
 * Architecture: org-plane only, organizationId derived from JWT.
 *
 * PLANE: Org only.
 *
 * @module modules/org/settings/hooks/useSettingsBilling
 */

import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/modules/org/settings/api/settings.api";
import { QK } from "@/lib/query";

// ── Active Subscription ───────────────────────────────────────────────────

/**
 * Fetch the active subscription for the current org.
 * Returns the DTO from the billing bridge — planName, status, features, etc.
 *
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useSubscription() {
    return useQuery({
        queryKey: QK.settingsBilling.subscription(),
        queryFn: async () => {
            const res = await settingsApi.getSubscription();
            return res.data?.data ?? null;
        },
        staleTime: 5 * 60_000,  // Subscription changes rarely
    });
}

// ── Invoice History ───────────────────────────────────────────────────────

/**
 * Fetch paginated invoice history for the current org.
 *
 * @param {{ limit?: number, skip?: number }} [params={}]
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useInvoiceHistory(params = {}) {
    return useQuery({
        queryKey: QK.settingsBilling.invoices(params),
        queryFn: async () => {
            const res = await settingsApi.getInvoices(params);
            return res.data?.data ?? [];
        },
        staleTime: 2 * 60_000,
        placeholderData: (prev) => prev,  // Keep previous page while loading next
    });
}

// ── Usage Quotas ──────────────────────────────────────────────────────────

/**
 * Fetch usage quota summary for the current org.
 * Returns an array of feature quota DTOs.
 *
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useUsageQuotas() {
    return useQuery({
        queryKey: QK.settingsBilling.usage(),
        queryFn: async () => {
            const res = await settingsApi.getUsage();
            return res.data?.data ?? [];
        },
        staleTime: 60_000,
    });
}
