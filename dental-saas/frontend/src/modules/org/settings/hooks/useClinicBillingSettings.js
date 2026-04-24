/**
 * useClinicBillingSettings.js — React Query hook for Clinic Billing Config (Plan D3)
 *
 * Reads and patches the per-org BillingSettings singleton (tax rates,
 * currencies, invoice template, numbering, payment methods, discount policy).
 *
 * NOT the SaaS subscription — that lives in useSettingsBilling.js.
 *
 * Version-guarded: every patch MUST include `expectedVersion`. On 409 the
 * hook refetches the latest config and surfaces the current version so the
 * form can repopulate and the user can retry.
 *
 * PLANE: Org only.
 *
 * @module modules/org/settings/hooks/useClinicBillingSettings
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/modules/org/settings/api/settings.api";
import { QK } from "@/lib/query";

/**
 * Read the clinic billing configuration singleton.
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useClinicBillingSettings() {
    return useQuery({
        queryKey: QK.settingsClinicBilling.config(),
        queryFn: async () => {
            const res = await settingsApi.getClinicBillingConfig();
            return res.data?.data ?? null;
        },
        staleTime: 60_000,
    });
}

/**
 * Patch clinic billing configuration. Caller MUST pass `expectedVersion`.
 *
 * Error surface:
 *   - 409 VERSION_CONFLICT: cache invalidated, re-read returns latest.
 *   - 400 VALIDATION_ERROR: err.response.data.error.details is a Zod issue list.
 */
export function usePatchClinicBillingSettings() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async (payload) => {
            const res = await settingsApi.patchClinicBillingConfig(payload);
            return res.data?.data ?? null;
        },
        onSuccess: (data) => {
            // Replace the cached config with the server-authoritative copy.
            if (data) qc.setQueryData(QK.settingsClinicBilling.config(), data);
            qc.invalidateQueries({ queryKey: QK.settingsClinicBilling.all });
        },
        onError: async (err) => {
            const code = err?.response?.data?.error?.code;
            if (code === "VERSION_CONFLICT") {
                // Force refetch so the form receives the latest version.
                await qc.invalidateQueries({ queryKey: QK.settingsClinicBilling.config() });
            }
        },
    });
}
