import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import {
    User, Mail, Shield, ShieldAlert, Lock, Key,
    Calendar, Clock, Layout, ArrowLeft, MoreVertical,
    CheckCircle2, AlertCircle, History, Activity
} from "lucide-react";

export default function OrganizationUserDetailsPage() {
    const { orgId, userId } = useParams();
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();

    // Platform role checks
    const pRole = currentUser?.platformRole || currentUser?.role; // Backend maps it slightly differently in different contexts
    const isSuperAdmin = pRole === "superadmin" || currentUser?.platformRole === "superadmin";
    const isOpsAdmin = pRole === "operations_admin" || currentUser?.platformRole === "operations_admin";

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState("overview");

    useEffect(() => {
        fetchData();
    }, [orgId, userId]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/platform/organizations/${orgId}/users/${userId}`);
            setData(res.data);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load user details.");
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (mode) => {
        let payload = { mode };
        if (mode === "set_password") {
            const password = window.prompt("Enter new password for user:");
            if (!password) return;
            payload.password = password;
        }

        try {
            const res = await api.patch(`/platform/users/${userId}/manage-credentials`, payload);
            alert(res.data.message || "Action completed successfully");
            fetchData();
        } catch (err) {
            const errorData = err.response?.data;
            const fullMsg = errorData?.stack
                ? `${errorData.message}\n\nName: ${errorData.name}\n\nStack: ${errorData.stack.split('\n')[0]}...`
                : (errorData?.message || `Failed to execute ${mode}`);
            alert(fullMsg);
        }
    };

    const handleToggleStatus = async () => {
        try {
            await api.patch(`/platform/organizations/${orgId}/users/${userId}`, { isActive: !data.user.isActive });
            fetchData();
        } catch (err) {
            alert(err.response?.data?.message || "Failed to toggle status");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="p-10 text-center">
                <p className="text-red-500 font-medium mb-4">{error || "User not found"}</p>
                <Link to={`/platform/organizations/${orgId}`} className="text-blue-600 hover:underline">
                    &larr; Back to Organization
                </Link>
            </div>
        );
    }

    const { user, organization, auditLogs, securityEvents } = data;
    const initial = user.name?.charAt(0)?.toUpperCase() || "U";

    return (
        <div className="space-y-8 p-8 max-w-7xl mx-auto">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-sm text-slate-400 font-medium">
                <Link to="/platform/organizations" className="hover:text-slate-600 transition-colors">Organizations</Link>
                <span>/</span>
                <Link to={`/platform/organizations/${orgId}`} className="hover:text-slate-600 transition-colors">{organization.name}</Link>
                <span>/</span>
                <span className="text-slate-900">Users</span>
                <span>/</span>
                <span className="text-slate-900">{user.name}</span>
            </div>

            {/* Header / Profile Info */}
            <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                <div className="p-8 flex flex-col md:flex-row gap-8 items-start justify-between">
                    <div className="flex items-center gap-6">
                        <div className="w-24 h-24 rounded-2xl bg-slate-900 flex items-center justify-center text-white text-4xl font-bold shadow-xl shadow-slate-200 shrink-0">
                            {initial}
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-bold text-slate-900">{user.name}</h1>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase ${user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                    {user.isActive ? "Active" : "Inactive"}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-slate-500 font-medium">
                                <span className="flex items-center gap-1.5"><Mail className="w-4 h-4" /> {user.email}</span>
                                <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                <span className="flex items-center gap-1.5"><Shield className="w-4 h-4" /> {user.roleId?.name || "No Role"}</span>
                                <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                <span className="flex items-center gap-1.5"><Layout className="w-4 h-4" /> {organization.name}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={handleToggleStatus}
                            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm border ${user.isActive
                                ? "bg-white border-red-200 text-red-600 hover:bg-red-50 active:scale-95"
                                : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700 active:scale-95"}`}
                        >
                            {user.isActive ? "Deactivate User" : "Activate User"}
                        </button>
                    </div>
                </div>

                {/* Sub-header info grids */}
                <div className="bg-slate-50/50 border-t border-slate-100 p-8 grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">User ID</p>
                        <p className="text-sm font-mono text-slate-600 truncate">{user._id}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Organization ID</p>
                        <p className="text-sm font-mono text-slate-600 truncate">{organization.id}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Created Date</p>
                        <p className="text-sm font-semibold text-slate-700">{new Date(user.createdAt).toLocaleDateString()} at {new Date(user.createdAt).toLocaleTimeString()}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Activity</p>
                        <p className="text-sm font-semibold text-slate-700">
                            {auditLogs[0] ? new Date(auditLogs[0].createdAt).toLocaleString() : "No activity recorded"}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-200">
                {["overview", "security", "audit"].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-6 py-4 text-sm font-bold capitalize transition-all relative ${activeTab === tab ? "text-blue-600" : "text-slate-400 hover:text-slate-600"}`}
                    >
                        {tab === "audit" ? "Audit Log" : tab}
                        {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></div>}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="mt-8">
                {activeTab === "overview" && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-8">
                            <div className="bg-white border border-slate-200 rounded-3xl p-8 space-y-6">
                                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                                    <Shield className="w-5 h-5 text-blue-600" />
                                    Access & Permissions
                                </h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div>
                                            <p className="text-sm font-bold text-slate-900">Role Assigned</p>
                                            <p className="text-xs text-slate-500">{user.roleId?.name || "System default registration role"}</p>
                                        </div>
                                        <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600">
                                            {user.roleId?._id || "Default"}
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Branch Access</p>
                                        <div className="flex flex-wrap gap-2">
                                            {user.hasFullBranchAccess ? (
                                                <span className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl text-xs font-bold flex items-center gap-1.5">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    Full Organization Access
                                                </span>
                                            ) : user.branchAccess?.length > 0 ? (
                                                user.branchAccess.map(b => (
                                                    <span key={b._id} className="px-3 py-1.5 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold">
                                                        {b.name}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-sm text-slate-400 italic">No specific branch access defined.</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white border border-slate-200 rounded-3xl p-8 space-y-6">
                                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                                    <History className="w-5 h-5 text-indigo-600" />
                                    Recent Audit Summary
                                </h3>
                                <div className="space-y-4">
                                    {auditLogs.slice(0, 5).map(log => (
                                        <div key={log._id} className="flex items-center justify-between p-4 border border-slate-50 rounded-2xl hover:bg-slate-50/50 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-1.5 h-1.5 rounded-full ${log.success ? "bg-emerald-500" : "bg-red-500"}`}></div>
                                                <div className="space-y-0.5">
                                                    <p className="text-sm font-bold text-slate-900">{log.action}</p>
                                                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                                        {log.entity} &bull; {new Date(log.createdAt).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="text-xs font-bold text-slate-600 font-mono">
                                                {log.statusCode || "200"}
                                            </p>
                                        </div>
                                    ))}
                                    {auditLogs.length > 5 && (
                                        <button
                                            onClick={() => setActiveTab("audit")}
                                            className="w-full py-3 text-sm font-bold text-slate-400 hover:text-blue-600 transition-colors"
                                        >
                                            View All Activity &rarr;
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-8">
                            <div className="bg-slate-900 text-white rounded-3xl p-8 space-y-6">
                                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                    <ShieldAlert className="w-5 h-5 text-amber-400" />
                                    Security Health
                                </h3>
                                <div className="space-y-4">
                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                                        <p className="text-xs font-bold text-slate-400 uppercase">Credential Status</p>
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-bold">Password Requirement</p>
                                            {user.mustChangePassword ? (
                                                <span className="text-amber-400 text-xs font-bold flex items-center gap-1.5">
                                                    <AlertCircle className="w-3.5 h-3.5" />
                                                    Required
                                                </span>
                                            ) : (
                                                <span className="text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    Healthy
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                                        <p className="text-xs font-bold text-slate-400 uppercase">Security Token</p>
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-bold">Token Version</p>
                                            <span className="px-2 py-0.5 bg-white/10 rounded text-xs font-mono font-bold">v{user.tokenVersion}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "security" && (
                    <div className="max-w-4xl space-y-8">
                        <div className="bg-white border border-slate-200 rounded-3xl p-8 space-y-8">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 tracking-tight">Enterprise Credential Management</h3>
                                <p className="text-sm text-slate-500 mt-1">Gated administrative tools for securing user credentials and access.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {(isSuperAdmin || isOpsAdmin) && (
                                    <button
                                        onClick={() => handleAction("send_reset_email")}
                                        className="flex items-start gap-4 p-5 border border-slate-100 rounded-2xl hover:bg-slate-50 hover:border-slate-200 transition-all group text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                            <Mail className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">Send Password Reset</p>
                                            <p className="text-xs text-slate-400 mt-0.5">Sends a secure 1-hour reset link to the user's email.</p>
                                        </div>
                                    </button>
                                )}

                                {(isSuperAdmin || isOpsAdmin) && (
                                    <button
                                        onClick={() => handleAction("force_logout")}
                                        className="flex items-start gap-4 p-5 border border-slate-100 rounded-2xl hover:bg-slate-50 hover:border-slate-200 transition-all group text-left"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                                            <ShieldAlert className="w-5 h-5 text-amber-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 group-hover:text-amber-600 transition-colors">Force Logout</p>
                                            <p className="text-xs text-slate-400 mt-0.5">Invalidates all active tokens by incrementing tokenVersion.</p>
                                        </div>
                                    </button>
                                )}

                                {isSuperAdmin && (
                                    <>
                                        <button
                                            onClick={() => handleAction("set_password")}
                                            className="flex items-start gap-4 p-5 border border-slate-100 rounded-2xl hover:bg-slate-50 hover:border-slate-200 transition-all group text-left"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                                <Lock className="w-5 h-5 text-indigo-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors transition-colors">Set Password Manually</p>
                                                <p className="text-xs text-slate-400 mt-0.5">Directly override user password (Superadmin only).</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => handleAction("temporary_password")}
                                            className="flex items-start gap-4 p-5 border border-slate-100 rounded-2xl hover:bg-slate-50 hover:border-slate-200 transition-all group text-left"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                                                <Key className="w-5 h-5 text-emerald-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">Generate Temp Password</p>
                                                <p className="text-xs text-slate-400 mt-0.5">Generates random credentials and forces reset on next login.</p>
                                            </div>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-3xl p-8 space-y-6">
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-3">
                                <Activity className="w-5 h-5 text-slate-400" />
                                Recent Security Events
                            </h3>
                            <div className="space-y-4">
                                {securityEvents.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic">No security events recorded.</p>
                                ) : (
                                    securityEvents.slice(0, 10).map(event => (
                                        <div key={event._id} className="flex items-center justify-between p-4 border border-slate-50 rounded-2xl">
                                            <div className="space-y-0.5">
                                                <p className="text-sm font-bold text-slate-900">{event.action}</p>
                                                <p className="text-xs text-slate-400 font-medium">
                                                    {new Date(event.createdAt).toLocaleString()} &bull; IP: {event.ipAddress || "Unknown"}
                                                </p>
                                            </div>
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${event.success ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                                                {event.success ? "Passed" : "Failed"}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "audit" && (
                    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-200">
                                    <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Timestamp</th>
                                    <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action Event</th>
                                    <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resource Entity</th>
                                    <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {auditLogs.map(log => (
                                    <tr key={log._id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <td className="py-4 px-6">
                                            <div className="text-sm font-semibold text-slate-700">{new Date(log.createdAt).toLocaleDateString()}</div>
                                            <div className="text-[10px] text-slate-400 font-medium">{new Date(log.createdAt).toLocaleTimeString()}</div>
                                        </td>
                                        <td className="py-4 px-6">
                                            <span className="px-2 py-1 bg-slate-100 border border-slate-200 rounded text-[10px] font-bold font-mono text-slate-600">
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-sm font-medium text-slate-600 font-mono">
                                            {log.entity || "SYSTEM"}
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className={`text-[10px] font-bold uppercase tracking-widest ${log.success ? "text-emerald-500" : "text-red-500"}`}>
                                                    {log.success ? "SUCCESS" : "FAILURE"}
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-mono">HTTP {log.statusCode || "200"}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {auditLogs.length === 0 && (
                            <div className="py-20 text-center text-slate-400 font-medium">
                                No audit records found for this user.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
