import { useCallback, useEffect, useState } from "react";
import platformApi from "../../../auth/platformApi";

// Mock shape mirrors backend MigrationLog.model.js so swapping to a real
// endpoint (GET /api/platform/migration/history) is a no-op change here.
const MOCK_HISTORY = [];

export function useMigrationHistory({ limit = 50 } = {}) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        try {
            const res = await platformApi.get("/migration/history", { params: { limit } });
            setData(res.data?.data || []);
            setError(null);
        } catch (err) {
            const status = err?.response?.status;
            if (status === 404) {
                setData(MOCK_HISTORY);
                setError(null);
            } else {
                setError(err?.response?.data?.message || err.message);
            }
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => { load(); }, [load]);

    return { data, loading, error, refetch: load };
}
