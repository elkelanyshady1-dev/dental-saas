import { useState, useEffect, useCallback } from "react";
import { platformOrgService } from "@/platform/services/platformOrgService";

/**
 * Hook to manage organization resource usage data.
 * Returns { data, loading, error, refresh }
 */
export function useOrgUsage(orgId) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const result = await platformOrgService.getUsage(orgId);
            setData(result);
            setError(null);
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Failed to fetch usage data");
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { data, loading, error, refresh };
}
