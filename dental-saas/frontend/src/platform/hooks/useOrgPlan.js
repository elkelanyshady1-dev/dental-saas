import { useState, useEffect, useCallback } from "react";
import { platformOrgService } from "@/platform/services/platformOrgService";

/**
 * Hook to manage organization plan and add-ons data.
 * Returns { plan, addons, loading, error, refresh, changePlan, addAddon, removeAddon }
 */
export function useOrgPlan(orgId) {
    const [data, setData] = useState({ plan: null, addons: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const [planData, addonsData] = await Promise.all([
                platformOrgService.getEffectivePlan(orgId),
                platformOrgService.getAddons(orgId)
            ]);
            setData({ plan: planData, addons: addonsData });
            setError(null);
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Failed to fetch plan data");
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const changePlan = async (payload) => {
        setLoading(true);
        try {
            const result = await platformOrgService.changePlan(orgId, payload);
            await refresh();
            return result;
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Failed to change plan");
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const addAddon = async (addonKey, expectedVersion) => {
        try {
            const result = await platformOrgService.addAddon(orgId, addonKey, expectedVersion);
            await refresh();
            return result;
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Failed to add addon");
            throw err;
        }
    };

    const removeAddon = async (addonKey, expectedVersion) => {
        try {
            const result = await platformOrgService.removeAddon(orgId, addonKey, expectedVersion);
            await refresh();
            return result;
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Failed to remove addon");
            throw err;
        }
    };

    return {
        data: data.plan,
        addons: data.addons,
        loading,
        error,
        refresh,
        changePlan,
        addAddon,
        removeAddon
    };
}
