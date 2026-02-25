import { useEffect, useState } from "react";
import api from "../../services/api";

export default function AnalyticsPage() {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        api.get("/platform/analytics")
            .then(res => setAnalytics(res.data))
            .catch(err => setError(err.response?.data?.message || "Failed to load analytics"))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="p-8">Loading analytics...</div>;
    if (error) return <div className="p-8 text-red-500">{error}</div>;
    if (!analytics) return null;

    return (
        <div>
            <h1 className="text-3xl font-bold mb-8">Platform Analytics</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-zinc-800 p-6 rounded-lg shadow">
                    <h3 className="text-zinc-400 text-sm font-semibold mb-2">Total Organizations</h3>
                    <p className="text-4xl font-bold text-white">{analytics.totals.organizations}</p>
                    <p className="text-sm mt-2 text-green-400">+{analytics.growth.newOrganizationsToday} today</p>
                </div>

                <div className="bg-zinc-800 p-6 rounded-lg shadow">
                    <h3 className="text-zinc-400 text-sm font-semibold mb-2">Active Organizations</h3>
                    <p className="text-4xl font-bold text-white">{analytics.totals.activeOrganizations}</p>
                </div>

                <div className="bg-zinc-800 p-6 rounded-lg shadow">
                    <h3 className="text-zinc-400 text-sm font-semibold mb-2">Total Branches</h3>
                    <p className="text-4xl font-bold text-white">{analytics.totals.branches}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-zinc-800 p-6 rounded-lg shadow">
                    <h3 className="text-zinc-400 text-sm font-semibold mb-2">Total Users</h3>
                    <p className="text-4xl font-bold text-white">{analytics.totals.users}</p>
                </div>

                <div className="bg-zinc-800 p-6 rounded-lg shadow">
                    <h3 className="text-zinc-400 text-sm font-semibold mb-2">Total Patients</h3>
                    <p className="text-4xl font-bold text-white">{analytics.totals.patients}</p>
                </div>

                <div className="bg-zinc-800 p-6 rounded-lg shadow">
                    <h3 className="text-zinc-400 text-sm font-semibold mb-2">Total Appointments</h3>
                    <p className="text-4xl font-bold text-white">{analytics.totals.appointments}</p>
                </div>
            </div>

            <div className="bg-zinc-800 p-6 rounded-lg shadow">
                <h3 className="text-lg font-bold mb-4">System Health</h3>
                <div className="flex space-x-8">
                    <div>
                        <span className="text-zinc-400">Status: </span>
                        <span className="text-green-500 capitalize">{analytics.systemHealth.status}</span>
                    </div>
                    <div>
                        <span className="text-zinc-400">Database: </span>
                        <span className="text-green-500">{analytics.systemHealth.dbConnected ? "Connected" : "Disconnected"}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
