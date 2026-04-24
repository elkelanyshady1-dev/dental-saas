/**
 * useOrgCurrency.js — Org-level currency resolution hook (Phase F1.1)
 *
 * Calls the lightweight GET /org/settings/clinic-billing/currency endpoint
 * which requires only org authentication (no BILLING_SETTINGS_READ permission
 * or finance entitlement).  This ensures every authenticated org user can
 * resolve the org's default currency without 403 errors.
 *
 * Falls back to "USD" while the settings are loading or unavailable.
 *
 * PLANE: Org only.
 */

import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/modules/org/settings/api/settings.api";
import { QK } from "@/lib/query/queryKeys";

/**
 * @returns {string} — ISO 4217 currency code (e.g. "AED", "EGP", "USD")
 */
export function useOrgCurrency() {
    const { data } = useQuery({
        queryKey: QK.settingsClinicBilling.currency(),
        queryFn: async () => {
            const res = await settingsApi.getOrgCurrency();
            return res.data?.data?.defaultCurrency ?? "USD";
        },
        staleTime: 120_000, // currency rarely changes — 2 min stale
        retry: 1,
    });
    return data || "USD";
}
