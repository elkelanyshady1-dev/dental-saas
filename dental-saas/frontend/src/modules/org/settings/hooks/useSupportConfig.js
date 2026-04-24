/**
 * useSupportConfig.js — React Query hook for Support Config (Plan E14)
 *
 * Reads and patches the per-org SupportSettings singleton (SLA hours,
 * escalation targets, allowed categories, auto-close cadence, ticket cap,
 * reopen window).
 *
 * NOT the ticket list/create — that lives in useSettingsSupport.js.
 *
 * Version-guarded: every patch MUST include `expectedVersion`.
 *
 * PLANE: Org only.
 *
 * @module modules/org/settings/hooks/useSupportConfig
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/modules/org/settings/api/settings.api";
import { QK } from "@/lib/query";

/**
 * Read the support configuration singleton.
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useSupportConfig() {
    return useQuery({
        queryKey: QK.settingsSupportConfig.config(),
        queryFn: async () => {
            const res = await settingsApi.getSupportConfig();
            return res.data?.data ?? null;
        },
        staleTime: 60_000,
    });
}

/**
 * Patch support configuration. Caller MUST pass `expectedVersion`.
 */
export function usePatchSupportConfig() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async (payload) => {
            const res = await settingsApi.patchSupportConfig(payload);
            return res.data?.data ?? null;
        },
        onSuccess: (data) => {
            if (data) qc.setQueryData(QK.settingsSupportConfig.config(), data);
            qc.invalidateQueries({ queryKey: QK.settingsSupportConfig.all });
        },
        onError: async (err) => {
            const code = err?.response?.data?.error?.code;
            if (code === "VERSION_CONFLICT") {
                await qc.invalidateQueries({ queryKey: QK.settingsSupportConfig.config() });
            }
        },
    });
}
