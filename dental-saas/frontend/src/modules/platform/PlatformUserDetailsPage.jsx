import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";

const ROLE_DEFAULTS = {
    superadmin: ["*"],
    finance_admin: ["platform.analytics.revenue"],
    operations_admin: ["platform.analytics.organizations", "platform.analytics.clinical"],
    analyst: ["platform.analytics.revenue", "platform.analytics.organizations", "platform.analytics.clinical"]
};

export default function PlatformUserDetailsPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    const isSuperadmin = currentUser?.role === "superadmin";

    const [user, setUser] = useState(null);
    const [auditLogs, setAuditLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState("overview");

    useEffect(() => {
        fetchData();
    }, [id]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [userRes, auditRes] = await Promise.all([
                api.get(`/platform/users/${id}`),
                api.get(`/platform/users/${id}/audit`)
            ]);
            setUser(userRes.data);
            setAuditLogs(auditRes.data);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load user details.");
        } finally {
            setLoading(false);
        }
    };

    const handleToggleActive = async () => {
        if (!isSuperadmin) return;
        try {
            await api.patch(`/platform/users/${id}`, { isActive: !user.isActive });
            setUser(prev => ({ ...prev, isActive: !prev.isActive }));
        } catch (err) {
            alert(err.response?.data?.message || "Failed to update status.");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (error || !user) {
        return (
            <div className="min-h-screen bg-slate-50 p-10 flex flex-col items-center pt-24">
                <p className="text-red-500 font-medium mb-4">{error || "User not found"}</p>
                <button onClick={() => navigate("/platform/users")} className="text-blue-600 hover:text-blue-800 font-medium">
                    &larr; Back to Platform Users
                </button>
            </div>
        );
    }

    const initial = user.name?.charAt(0)?.toUpperCase() || "U";
    const statusBadge = user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700";

    const effectivePermissions = ROLE_DEFAULTS[user.role] || [];
    const isFullAccess = effectivePermissions.includes("*");

    return (
        <div className="bg-slate-50 min-h-screen p-10 space-y-8">
            {/* Header / Breadcrumb */}
            <div>
                <button onClick={() => navigate("/platform/users")} className="text-sm font-semibold text-slate-400 hover:text-blue-600 mb-4 transition-colors">
                    &larr; Back to Users
                </button>
                <h1 className="text-3xl font-bold text-slate-900">Platform User Profile</h1>
            </div>

            {/* Profile Card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 flex items-start justify-between">
                <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-full bg-blue-50 border border-blue-100 text-blue-700 font-bold text-3xl flex items-center justify-center shrink-0 shadow-sm">
                        {initial}
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                            {user.name}
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadge}`}>
                                {user.isActive ? "Active" : "Inactive"}
                            </span>
                        </h2>
                        <div className="mt-2 text-slate-500 font-medium">{user.email}</div>
                        <div className="mt-4 flex gap-4 text-sm">
                            <div>
                                <span className="text-slate-400 uppercase tracking-wide text-xs">Role</span>
                                <p className="font-semibold text-slate-700 capitalize mt-0.5.">{user.role}</p>
                            </div>
                            <div>
                                <span className="text-slate-400 uppercase tracking-wide text-xs">Created</span>
                                <p className="font-medium text-slate-700 mt-0.5">{new Date(user.createdAt).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right side actions */}
                {isSuperadmin && user._id !== currentUser._id && (
                    <div>
                        <button
                            onClick={handleToggleActive}
                            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm border ${user.isActive
                                    ? "bg-white border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                                    : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"
                                }`}
                        >
                            {user.isActive ? "Deactivate User" : "Activate User"}
                        </button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-8 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab("overview")}
                    className={`pb-4 text-sm font-semibold transition-colors relative ${activeTab === "overview" ? "text-blue-600" : "text-slate-400 hover:text-slate-600"}`}
                >
                    Overview
                    {activeTab === "overview" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></span>}
                </button>
                <button
                    onClick={() => setActiveTab("audit")}
                    className={`pb-4 text-sm font-semibold transition-colors relative ${activeTab === "audit" ? "text-blue-600" : "text-slate-400 hover:text-slate-600"}`}
                >
                    Audit History
                    {activeTab === "audit" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></span>}
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === "overview" && (
                <div className="grid grid-cols-2 gap-8">
                    {/* Permissions Card */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
                        <h3 className="text-lg font-bold text-slate-800 mb-6">Effective Permissions</h3>

                        {isFullAccess ? (
                            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                                <span className="text-blue-700 font-semibold flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                    Superadmin Level Access
                                </span>
                                <p className="text-sm text-blue-600/80 mt-1">This user has unrestricted permissions across the platform configuration surface.</p>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {effectivePermissions.length > 0 ? (
                                    effectivePermissions.map(p => (
                                        <span key={p} className="px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-700 font-medium text-xs rounded-lg">
                                            {p}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-slate-400 font-medium italic">No permissions mapped.</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Stats Card */}
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
                        <h3 className="text-lg font-bold text-slate-800 mb-6">Platform Activity Metrics</h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl">
                                <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">Total Audit Events</p>
                                <p className="text-3xl font-bold text-slate-800">{user.auditCount || 0}</p>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl">
                                <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">Last Platform Login</p>
                                <p className="text-lg font-bold text-slate-800">
                                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "audit" && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
                    <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center justify-between">
                        Action History
                        <span className="text-xs font-medium text-slate-400 font-mono tracking-wider">Top 100 Recent Logs</span>
                    </h3>

                    {auditLogs.length === 0 ? (
                        <div className="py-12 text-center">
                            <p className="text-slate-400 text-sm">No activity recorded for this user.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className="pb-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                                        <th className="pb-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                                        <th className="pb-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Entity</th>
                                        <th className="pb-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {auditLogs.map(log => (
                                        <tr key={log._id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                            <td className="py-3 px-4 text-sm text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                                            <td className="py-3 px-4">
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${log.method === "DELETE" ? "bg-red-100 text-red-700" :
                                                        log.method === "POST" ? "bg-blue-100 text-blue-700" :
                                                            "bg-amber-100 text-amber-700"
                                                    }`}>
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-slate-700 font-mono">{log.entity || "SYSTEM"}</td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2 h-2 rounded-full ${log.success ? "bg-emerald-500" : "bg-red-500"}`}></span>
                                                    <span className="text-sm font-medium text-slate-600">{log.statusCode}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
