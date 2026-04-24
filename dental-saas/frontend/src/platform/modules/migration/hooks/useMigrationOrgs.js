import { useCallback, useEffect, useMemo, useState } from "react";
import platformApi from "../../../auth/platformApi";

const POLL_INTERVAL_MS = 3000;

export function useMigrationOrgs() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await platformApi.get("/migration/orgs");
            setData(res.data?.data || []);
            setError(null);
        } catch (err) {
            setError(err?.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const hasActive = useMemo(
        () => data.some((o) =>
            (o.migrationState && o.migrationState !== "FAILED") || o.maintenanceMode
        ),
        [data]
    );

    useEffect(() => {
        if (!hasActive) return undefined;
        const id = setInterval(load, POLL_INTERVAL_MS);
        return () => clearInterval(id);
    }, [hasActive, load]);

    return { data, loading, error, refetch: load, hasActive };
}
