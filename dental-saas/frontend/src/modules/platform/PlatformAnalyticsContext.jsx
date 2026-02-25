import { createContext, useContext, useState, useEffect } from 'react';
import api from '../../services/api';

const PlatformAnalyticsContext = createContext();

export function PlatformAnalyticsProvider({ children }) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchAnalytics = async () => {
        try {
            const { data } = await api.get('/platform/analytics/revenue');
            setStats(data);
        } catch (err) {
            console.error('Failed to fetch platform analytics', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
        const interval = setInterval(fetchAnalytics, 60000); // refresh every 60s
        return () => clearInterval(interval);
    }, []);

    return (
        <PlatformAnalyticsContext.Provider value={{ stats, loading, refresh: fetchAnalytics }}>
            {children}
        </PlatformAnalyticsContext.Provider>
    );
}

export const usePlatformAnalytics = () => useContext(PlatformAnalyticsContext);
