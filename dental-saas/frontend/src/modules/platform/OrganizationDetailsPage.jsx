import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import api from "../../services/api";
import { DataTable } from "../../components/ui/DataTable";
import { UserActionsDropdown } from "./components/UserActionsDropdown";

const TABS = ["Overview", "Branches", "Users", "Audit Logs", "Subscription", "Billing", "Configuration", "Analytics"];

const MODULE_LIST = [
    { key: "appointments", label: "Appointments" },
    { key: "patients", label: "Patients" },
    { key: "accounting", label: "Accounting" },
    { key: "orthodontics", label: "Orthodontics" },
    { key: "inventory", label: "Inventory" },
    { key: "labs", label: "Labs" },
    { key: "analytics", label: "Analytics" },
];

export default function OrganizationDetailsPage() {
    const { orgId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [org, setOrg] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "Overview");

    // Sync activeTab with URL
    useEffect(() => {
        const tab = searchParams.get("tab");
        if (tab && TABS.includes(tab)) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    // Handle tab change
    const onTabChange = (tab) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    useEffect(() => {
        const load = async () => {
            try {
                const [orgRes, anaRes] = await Promise.all([
                    api.get(`/platform/organizations/${orgId}`),
                    api.get(`/platform/organizations/${orgId}/analytics`),
                ]);
                setOrg(orgRes.data);
                setAnalytics(anaRes.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [orgId]);

    // ── Simple plan change (quick edit from header) ────────────────────────
    const handlePlanChange = async (newPlan) => {
        try {
            await api.patch(`/platform/organizations/${orgId}/plan`, { subscriptionPlan: newPlan });
            setOrg((o) => ({ ...o, subscription: { ...o.subscription, plan: newPlan } }));
        } catch (err) { alert(err.response?.data?.message || "Failed"); }
    };

    const handleToggleActive = async () => {
        try {
            await api.patch(`/platform/organizations/${orgId}/status`, { isActive: !org.isActive });
            setOrg((o) => ({ ...o, isActive: !o.isActive }));
        } catch (err) { alert(err.response?.data?.message || "Failed"); }
    };

    // ── Enterprise subscription lifecycle actions ───────────────────────────
    const handleSubAction = async (action, payload) => {
        try {
            const res = await api.patch(`/platform/organizations/${orgId}/${action}`, payload);
            const updated = res.data?.subscription;
            if (updated) setOrg((o) => ({ ...o, subscription: updated }));
        } catch (err) { alert(err.response?.data?.message || "Failed"); }
    };

    if (loading) return <Spinner />;
    if (!org) return <div className="p-10 text-red-500">Organization not found.</div>;

    const sub = org.subscription || {};
    const subscriptionBadge = {
        active: "bg-emerald-100 text-emerald-700",
        trial: "bg-amber-100 text-amber-700",
        suspended: "bg-red-100 text-red-700",
        expired: "bg-slate-100 text-slate-600",
    }[sub.status] || "bg-slate-100 text-slate-600";

    // ── Grace Period Calculation ──
    let inGrace = false;
    let graceDaysLeft = 0;
    if (sub.graceEndsAt && sub.currentPeriodEnd && org.serverNow) {
        const graceEnd = new Date(sub.graceEndsAt);
        const periodEnd = new Date(sub.currentPeriodEnd);
        const serverNow = new Date(org.serverNow);
        if (serverNow > periodEnd && serverNow <= graceEnd) {
            inGrace = true;
            graceDaysLeft = Math.ceil((graceEnd - serverNow) / (1000 * 60 * 60 * 24));
        }
    }

    return (
        <div className="bg-slate-50 min-h-screen p-10 space-y-8">


            {/* Subscription Warning Banners */}
            {inGrace && (
                <div className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-amber-300 bg-amber-50 text-amber-800 text-sm font-bold shadow-sm animate-fade-in">
                    <svg className="w-5 h-5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Subscription expired — Grace period ends in {graceDaysLeft} day(s). Action required.</span>
                </div>
            )}

            {!inGrace && org.subscriptionHealth?.isExpired && (
                <div className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-red-300 bg-red-50 text-red-800 text-sm font-medium">
                    <svg className="w-5 h-5 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Subscription expired — organization suspended. Reactivate subscription to restore access.</span>
                </div>
            )}
            {!inGrace && !org.subscriptionHealth?.isExpired && org.subscriptionHealth?.isExpiringSoon && (
                <div className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium">
                    <svg className="w-5 h-5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Subscription expires in {org.subscriptionHealth.daysRemaining} days. Please renew to avoid suspension.</span>
                </div>
            )}

            {/* Header Card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
                <div className="flex flex-wrap items-start justify-between gap-6">
                    <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 text-blue-700 font-bold text-2xl flex items-center justify-center">
                            {org.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">{org.name}</h1>
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                <span className="font-mono text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-md border border-slate-200">{org.slug}</span>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${subscriptionBadge}`}>{sub.status || "—"}</span>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize bg-blue-50 text-blue-700 border border-blue-100`}>{sub.plan || "basic"}</span>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${org.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                    {org.isActive ? "Active" : "Suspended"}
                                </span>
                                <span className="text-xs text-slate-400">Created {new Date(org.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-3">
                        <select
                            value={sub.plan || "basic"}
                            onChange={(e) => handlePlanChange(e.target.value)}
                            className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="basic">Basic</option>
                            <option value="pro">Pro</option>
                            <option value="enterprise">Enterprise</option>
                        </select>

                        <button
                            onClick={handleToggleActive}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${org.isActive ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100" : "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"}`}
                        >
                            {org.isActive ? "Suspend Org" : "Activate Org"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Tab Bar */}
            <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => onTabChange(tab)}
                        className={`px-5 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${activeTab === tab ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-800"}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div>
                {activeTab === "Overview" && <OverviewTab org={org} analytics={analytics} />}
                {activeTab === "Branches" && <BranchesTab orgId={orgId} navigate={navigate} />}
                {activeTab === "Users" && <UsersTab orgId={orgId} />}
                {activeTab === "Audit Logs" && <OrgAuditLogsTab orgId={orgId} />}
                {activeTab === "Subscription" && <SubscriptionTab orgId={orgId} sub={org.subscription || {}} onAction={handleSubAction} />}
                {activeTab === "Billing" && <BillingTab orgId={orgId} subscription={org.subscription || {}} />}
                {activeTab === "Configuration" && <ConfigurationTab orgId={orgId} />}
                {activeTab === "Analytics" && <AnalyticsTab orgId={orgId} />}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW TAB
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab({ org, analytics }) {
    const metrics = [
        { label: "Total Branches", value: analytics?.totalBranches ?? org?.branchCount ?? "—" },
        { label: "Total Users", value: analytics?.totalUsers ?? org?.userCount ?? "—" },
        { label: "Active Users", value: analytics?.activeUsers ?? "—" },
        { label: "Suspended Users", value: analytics?.suspendedUsers ?? "—" },
        { label: "Audit Events", value: analytics?.auditEventsCount ?? org?.auditCount ?? "—" },
    ];
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                {metrics.map(({ label, value }) => (
                    <div key={label} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                        <p className="text-xs uppercase text-slate-500 tracking-wider font-semibold">{label}</p>
                        <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
                    </div>
                ))}
            </div>

            {analytics?.trialRemainingDays !== null && analytics?.trialRemainingDays !== undefined && (
                <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl border text-sm font-medium ${analytics.trialRemainingDays <= 3
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-amber-50 border-amber-200 text-amber-700"
                    }`}>
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Trial period: <strong className="ml-1">{analytics.trialRemainingDays} day{analytics.trialRemainingDays !== 1 ? "s" : ""} remaining</strong>
                </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
                <h2 className="text-xl font-semibold text-slate-900 mb-4">Plan Details</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
                    <InfoRow label="Plan" value={<span className="capitalize font-semibold text-slate-800">{org.subscriptionPlan}</span>} />
                    <InfoRow label="Status" value={<span className="capitalize font-semibold text-slate-800">{org.subscriptionStatus}</span>} />
                    <InfoRow label="Active" value={org.isActive ? "Yes" : "No"} />
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// BRANCHES TAB
// ─────────────────────────────────────────────────────────────────────────────
function BranchesTab({ orgId, navigate }) {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newBranchName, setNewBranchName] = useState("");
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        api.get(`/platform/organizations/${orgId}/branches`)
            .then((r) => setBranches(r.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [orgId]);

    const handleCreate = async () => {
        if (!newBranchName.trim()) return;
        setCreating(true);
        try {
            const res = await api.post(`/platform/organizations/${orgId}/branches`, { name: newBranchName });
            setBranches((b) => [res.data.branch, ...b]);
            setNewBranchName("");
            setShowForm(false);
        } catch (err) { alert(err.response?.data?.message || "Failed"); }
        finally { setCreating(false); }
    };

    const handleToggleStatus = async (branch) => {
        try {
            await api.patch(`/platform/organizations/${orgId}/branches/${branch._id}/status`, { isActive: !branch.isActive });
            setBranches((bs) => bs.map((b) => b._id === branch._id ? { ...b, isActive: !b.isActive } : b));
        } catch (err) { alert(err.response?.data?.message || "Failed"); }
    };

    if (loading) return <Spinner />;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-slate-900">Branches ({branches.length})</h2>
                <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                    + Create Branch
                </button>
            </div>

            {showForm && (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex gap-3 items-center">
                    <input value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} placeholder="Branch name" className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={handleCreate} disabled={creating} className="px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors">
                        {creating ? "Creating..." : "Create"}
                    </button>
                    <button onClick={() => setShowForm(false)} className="px-4 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {branches.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm py-16">No branches found.</p>
                ) : (
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/50">
                                <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Branch</th>
                                <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Type</th>
                                <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Status</th>
                                <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Created</th>
                                <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {branches.map((b) => (
                                <tr key={b._id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => navigate(`/platform/organizations/${orgId}/branches/${b._id}`)}>
                                    <td className="py-4 px-5 font-semibold text-slate-800">{b.name}</td>
                                    <td className="py-4 px-5 text-slate-500 capitalize">{b.type}</td>
                                    <td className="py-4 px-5">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${b.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                            {b.isActive ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="py-4 px-5 text-slate-400 text-xs">{new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                                    <td className="py-4 px-5" onClick={(e) => e.stopPropagation()}>
                                        <button onClick={() => handleToggleStatus(b)} className={`text-sm font-semibold transition-colors ${b.isActive ? "text-red-600 hover:text-red-800" : "text-emerald-600 hover:text-emerald-800"}`}>
                                            {b.isActive ? "Deactivate" : "Activate"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// USERS TAB
// ─────────────────────────────────────────────────────────────────────────────
function UsersTab({ orgId }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/platform/organizations/${orgId}/users`)
            .then((r) => setUsers(r.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [orgId]);

    const handleToggleStatus = async (user) => {
        try {
            await api.patch(`/platform/organizations/${orgId}/users/${user._id}`, { isActive: !user.isActive });
            setUsers((us) => us.map((u) => u._id === user._id ? { ...u, isActive: !u.isActive } : u));
        } catch (err) { alert(err.response?.data?.message || "Failed"); }
    };

    if (loading) return <Spinner />;

    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
                <h2 className="text-xl font-semibold text-slate-900">Users ({users.length})</h2>
            </div>
            {users.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-16">No users found.</p>
            ) : (
                <table className="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/50">
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Name</th>
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Email</th>
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Role</th>
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Status</th>
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => (
                            <tr key={u._id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="py-4 px-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                                            {u.name?.charAt(0)?.toUpperCase() || "U"}
                                        </div>
                                        <Link to={`/platform/organizations/${orgId}/users/${u._id}`} className="font-semibold text-slate-800 hover:text-blue-600 transition-colors">
                                            {u.name}
                                        </Link>
                                    </div>
                                </td>
                                <td className="py-4 px-5 text-slate-500">{u.email}</td>
                                <td className="py-4 px-5">
                                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 capitalize">
                                        {u.roleId?.name || "—"}
                                    </span>
                                </td>
                                <td className="py-4 px-5">
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                        {u.isActive ? "Active" : "Inactive"}
                                    </span>
                                </td>
                                <td className="py-4 px-5 text-right">
                                    <Link
                                        to={`/platform/organizations/${orgId}/users/${u._id}`}
                                        className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider"
                                    >
                                        View Details
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOGS TAB
// ─────────────────────────────────────────────────────────────────────────────
function OrgAuditLogsTab({ orgId }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/platform/organizations/${orgId}/audit-logs?limit=50`)
            .then((r) => setLogs(r.data?.logs || r.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [orgId]);

    if (loading) return <Spinner />;

    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
                <h2 className="text-xl font-semibold text-slate-900">Audit Logs (last 50)</h2>
            </div>
            {logs.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-16">No audit events recorded.</p>
            ) : (
                <table className="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/50">
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Timestamp</th>
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Action</th>
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">User</th>
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map((log, i) => {
                            const action = (log.action || "").toUpperCase();
                            const actionBadge = action === "CREATE" ? "bg-emerald-100 text-emerald-700" : action === "DELETE" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700";
                            return (
                                <tr key={log._id || i} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="py-3.5 px-5 text-xs text-slate-500">{new Date(log.createdAt || log.timestamp).toLocaleString()}</td>
                                    <td className="py-3.5 px-5"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${actionBadge}`}>{log.action || "—"}</span></td>
                                    <td className="py-3.5 px-5 text-slate-600">{log.userId?.name || "System"}</td>
                                    <td className="py-3.5 px-5"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${log.success ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{log.success ? "Success" : "Failed"}</span></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION TAB
// ─────────────────────────────────────────────────────────────────────────────
function SubscriptionTab({ orgId, sub, onAction }) {
    const [upgradePlan, setUpgradePlan] = useState(sub.plan || "basic");
    const [durationMonths, setDurationMonths] = useState(1);
    const [extraMonths, setExtraMonths] = useState(1);
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyLoaded, setHistoryLoaded] = useState(false);

    const loadHistory = async () => {
        if (historyLoaded) return;
        setHistoryLoading(true);
        try {
            const res = await api.get(`/platform/organizations/${orgId}/subscription/history`);
            setHistory(res.data?.history || []);
            setHistoryLoaded(true);
        } catch (e) { console.error(e); }
        finally { setHistoryLoading(false); }
    };

    const fmt = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
    const statusColor = { trial: "amber", active: "emerald", suspended: "red", expired: "slate" }[sub.status] || "slate";

    return (
        <div className="space-y-6">
            {/* Current State Card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
                <h2 className="text-xl font-semibold text-slate-900 mb-6">Current Subscription</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                    {[
                        { label: "Plan", value: <span className="capitalize font-bold text-slate-800">{sub.plan || "basic"}</span> },
                        { label: "Status", value: <span className={`capitalize font-bold text-${statusColor}-600`}>{sub.status || "—"}</span> },
                        { label: "Trial Ends", value: fmt(sub.trialEndsAt) },
                        { label: "Period Start", value: fmt(sub.currentPeriodStart) },
                        { label: "Period End", value: fmt(sub.currentPeriodEnd) },
                    ].map(({ label, value }) => (
                        <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <p className="text-xs uppercase text-slate-500 tracking-wider font-semibold mb-1">{label}</p>
                            <p className="text-sm font-medium text-slate-700">{value}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Lifecycle Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Upgrade Plan */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
                    <div>
                        <h3 className="text-base font-semibold text-slate-900">Upgrade Plan</h3>
                        <p className="text-sm text-slate-500 mt-0.5">Activates a billing period immediately.</p>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan</label>
                            <select value={upgradePlan} onChange={(e) => setUpgradePlan(e.target.value)}
                                className="w-full mt-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="basic">Basic</option>
                                <option value="pro">Pro</option>
                                <option value="enterprise">Enterprise</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration (months)</label>
                            <input type="number" min={1} max={36} value={durationMonths}
                                onChange={(e) => setDurationMonths(Number(e.target.value))}
                                className="w-full mt-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <button onClick={() => onAction("upgrade", { plan: upgradePlan, durationMonths })}
                            className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                            Upgrade to {upgradePlan.charAt(0).toUpperCase() + upgradePlan.slice(1)}
                        </button>
                    </div>
                </div>

                {/* Extend Subscription */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
                    <div>
                        <h3 className="text-base font-semibold text-slate-900">Extend Subscription</h3>
                        <p className="text-sm text-slate-500 mt-0.5">Adds months to the current billing period end.</p>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Extra Months</label>
                            <input type="number" min={1} max={24} value={extraMonths}
                                onChange={(e) => setExtraMonths(Number(e.target.value))}
                                className="w-full mt-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <button onClick={() => onAction("extend", { extraMonths })}
                            className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
                            Extend by {extraMonths} Month{extraMonths !== 1 ? "s" : ""}
                        </button>
                    </div>
                </div>

                {/* Suspend */}
                <div className="bg-white border border-red-200 bg-red-50/20 rounded-2xl shadow-sm p-6 space-y-4">
                    <div>
                        <h3 className="text-base font-semibold text-slate-900">Suspend Organization</h3>
                        <p className="text-sm text-slate-500 mt-0.5">Blocks all tenant access immediately.</p>
                    </div>
                    <button onClick={() => onAction("suspend", {})}
                        disabled={sub.status === "suspended"}
                        className="w-full py-2.5 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        {sub.status === "suspended" ? "Already Suspended" : "Suspend"}
                    </button>
                </div>

                {/* Reactivate */}
                <div className="bg-white border border-emerald-200 bg-emerald-50/20 rounded-2xl shadow-sm p-6 space-y-4">
                    <div>
                        <h3 className="text-base font-semibold text-slate-900">Reactivate Organization</h3>
                        <p className="text-sm text-slate-500 mt-0.5">Restores access if billing period or trial is still valid.</p>
                    </div>
                    <button onClick={() => onAction("reactivate", {})}
                        disabled={sub.status !== "suspended"}
                        className="w-full py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        {sub.status !== "suspended" ? "Not Suspended" : "Reactivate"}
                    </button>
                </div>
            </div>

            {/* Subscription History */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-slate-900">Subscription History</h2>
                    {!historyLoaded && (
                        <button onClick={loadHistory} disabled={historyLoading}
                            className="px-4 py-2 text-sm font-semibold text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-60">
                            {historyLoading ? "Loading..." : "Load History"}
                        </button>
                    )}
                </div>
                {historyLoaded && (
                    history.length === 0
                        ? <p className="text-center text-slate-400 text-sm py-16">No history yet.</p>
                        : (
                            <DataTable
                                columns={[
                                    {
                                        accessorKey: "createdAt",
                                        header: "Date",
                                        cell: ({ row }) => <span className="text-xs text-slate-500">{new Date(row.original.createdAt).toLocaleString()}</span>
                                    },
                                    {
                                        accessorKey: "plan",
                                        header: "Plan",
                                        cell: ({ row }) => <span className="capitalize font-semibold text-slate-700">{row.original.plan}</span>
                                    },
                                    {
                                        accessorKey: "status",
                                        header: "Status",
                                        cell: ({ row }) => {
                                            const statusColors = {
                                                trial: "bg-amber-100 text-amber-700",
                                                active: "bg-emerald-100 text-emerald-700",
                                                suspended: "bg-red-100 text-red-700",
                                                expired: "bg-slate-100 text-slate-600"
                                            };
                                            return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${statusColors[row.original.status] || "bg-slate-100 text-slate-600"}`}>{row.original.status}</span>;
                                        }
                                    },
                                    {
                                        accessorKey: "periodEnd",
                                        header: "Period End",
                                        cell: ({ row }) => <span className="text-slate-500 text-xs">{fmt(row.original.periodEnd)}</span>
                                    },
                                    {
                                        accessorKey: "changedBy",
                                        header: "Changed By",
                                        cell: ({ row }) => <span className="text-slate-500">{row.original.changedBy?.name || "System"}</span>
                                    },
                                    {
                                        accessorKey: "notes",
                                        header: "Notes",
                                        cell: ({ row }) => <span className="text-slate-400 text-xs">{row.original.notes || "—"}</span>
                                    }
                                ]}
                                data={history}
                            />
                        )
                )}
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// CONFIGURATION TAB
// ──────────────────────────────────────────────────────────────────────────────
function ConfigurationTab({ orgId }) {
    const [config, setConfig] = useState(null);
    const [original, setOriginal] = useState(null);  // server snapshot for change detection
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        api.get(`/platform/organizations/${orgId}/configuration`)
            .then((r) => { setConfig(r.data); setOriginal(r.data); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [orgId]);

    const hasChanges = config && original
        ? JSON.stringify(config) !== JSON.stringify(original)
        : false;

    const setModule = (key, value) =>
        setConfig((c) => ({ ...c, modules: { ...c.modules, [key]: value } }));

    const setOrgSetting = (path, value) => {
        setConfig((c) => {
            const os = { ...(c.organizationSettings || {}) };
            if (path === "isPublicLandingEnabled") os.isPublicLandingEnabled = value;
            if (path === "branding.primaryColor") os.branding = { ...(os.branding || {}), primaryColor: value };
            if (path === "branding.logo") os.branding = { ...(os.branding || {}), logo: value };
            return { ...c, organizationSettings: os };
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            const res = await api.patch(`/platform/organizations/${orgId}/configuration`, {
                modules: config.modules,
                organizationSettings: config.organizationSettings,
            });
            const saved = { modules: res.data.modules, organizationSettings: res.data.organizationSettings };
            setConfig(saved);
            setOriginal(saved);  // reset snapshot — hasChanges goes false
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            alert(err.response?.data?.message || "Failed to save configuration");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <Spinner />;
    if (!config) return <div className="p-10 text-red-500">Failed to load configuration.</div>;

    const os = config.organizationSettings || {};
    const branding = os.branding || {};

    return (
        <div className="space-y-6">
            {/* Modules Section */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-6">
                <div>
                    <h2 className="text-xl font-semibold text-slate-900">Module Access</h2>
                    <p className="text-sm text-slate-500 mt-1">Toggle modules to control feature access for this organization.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {MODULE_LIST.map(({ key, label }) => {
                        const enabled = config.modules?.[key] ?? false;
                        return (
                            <div key={key} className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${enabled ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white"
                                }`}>
                                <span className="text-sm font-medium text-slate-700">{label}</span>
                                <button
                                    onClick={() => setModule(key, !enabled)}
                                    className={`relative w-11 h-6 rounded-full transition-colors duration-300 focus:outline-none ${enabled ? "bg-blue-600" : "bg-slate-300"
                                        }`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${enabled ? "translate-x-5" : "translate-x-0"
                                        }`} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Public Landing Section */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-900">Public Landing Page</h2>
                        <p className="text-sm text-slate-500 mt-1">Allow this organization to have a public-facing landing page.</p>
                    </div>
                    <button
                        onClick={() => setOrgSetting("isPublicLandingEnabled", !os.isPublicLandingEnabled)}
                        className={`relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none ${os.isPublicLandingEnabled ? "bg-emerald-500" : "bg-slate-300"
                            }`}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${os.isPublicLandingEnabled ? "translate-x-6" : "translate-x-0"
                            }`} />
                    </button>
                </div>
            </div>

            {/* Branding Section */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-6">
                <div>
                    <h2 className="text-xl font-semibold text-slate-900">Branding</h2>
                    <p className="text-sm text-slate-500 mt-1">White-label settings for this organization's tenant interface.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Primary Color */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Primary Color</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={branding.primaryColor || "#4F46E5"}
                                onChange={(e) => setOrgSetting("branding.primaryColor", e.target.value)}
                                className="w-10 h-10 rounded-lg border border-slate-300 cursor-pointer p-0.5 bg-white"
                            />
                            <input
                                type="text"
                                value={branding.primaryColor || ""}
                                onChange={(e) => setOrgSetting("branding.primaryColor", e.target.value)}
                                placeholder="#4F46E5"
                                className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    {/* Logo URL */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Logo URL</label>
                        <input
                            type="url"
                            value={branding.logo || ""}
                            onChange={(e) => setOrgSetting("branding.logo", e.target.value || null)}
                            placeholder="https://example.com/logo.png"
                            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {branding.logo && (
                            <img
                                src={branding.logo}
                                alt="Organization logo preview"
                                className="mt-2 h-12 object-contain rounded-lg border border-slate-200 p-1 bg-slate-50"
                                onError={(e) => { e.target.style.display = "none"; }}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-end gap-4">
                {saved && (
                    <span className="text-sm font-medium text-emerald-600 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Configuration saved
                    </span>
                )}
                <button
                    onClick={handleSave}
                    disabled={saving || !hasChanges}
                    className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {saving ? "Saving..." : "Save Configuration"}
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function InfoRow({ label, value }) {
    return (
        <div>
            <p className="text-xs uppercase text-slate-500 tracking-wider font-semibold mb-1">{label}</p>
            <p className="text-sm font-medium text-slate-700">{value}</p>
        </div>
    );
}

function Spinner() {
    return (
        <div className="flex items-center justify-center py-24 gap-3">
            <div className="w-6 h-6 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-slate-500 font-medium">Loading...</p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS TAB
// ─────────────────────────────────────────────────────────────────────────────
function AnalyticsTab({ orgId }) {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/platform/organizations/${orgId}/analytics`)
            .then(r => setAnalytics(r.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [orgId]);

    if (loading) return <Spinner />;
    if (!analytics) return <div className="p-8 text-red-500">Failed to load analytics data.</div>;

    const metrics = [
        { label: "Total Patients", value: analytics.totalPatients || 0 },
        { label: "Patients This Month", value: analytics.patientsThisMonth || 0, color: "text-emerald-600" },
        { label: "Total Appointments", value: analytics.totalAppointments || 0 },
        { label: "Appointments This Month", value: analytics.appointmentsThisMonth || 0, color: "text-blue-600" },
        { label: "Active Branches", value: analytics.activeBranches || 0 },
        { label: "Archived Branches", value: analytics.archivedBranches || 0, color: "text-amber-600" },
    ];

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Top Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {metrics.map((m, i) => (
                    <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                        <p className="text-xs uppercase font-bold text-slate-500 tracking-wider mb-2">{m.label}</p>
                        <p className={`text-4xl font-extrabold ${m.color || "text-slate-800"}`}>{m.value}</p>
                    </div>
                ))}
            </div>

            {/* Branch Breakdown Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100">
                    <h3 className="text-lg font-bold text-slate-900">Appointments by Branch (This Month)</h3>
                </div>
                {analytics.appointmentsByBranch?.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">No branch data available</div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="py-3 px-6 font-semibold text-slate-600 uppercase tracking-wider text-xs">Branch Name</th>
                                <th className="py-3 px-6 font-semibold text-slate-600 uppercase tracking-wider text-xs w-32">Appointments</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {analytics.appointmentsByBranch?.map((b) => (
                                <tr key={b.branchId} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-4 px-6 font-medium text-slate-800">{b.branchName}</td>
                                    <td className="py-4 px-6 font-mono text-slate-600">{b.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// BILLING TAB (Enterprise Command Center - Density Upgrade)
// ─────────────────────────────────────────────────────────────────────────────
function BillingTab({ orgId, subscription, onPlanChanged }) {
    const [invoices, setInvoices] = useState([]);
    const [emailLogs, setEmailLogs] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [reloadTrigger, setReloadTrigger] = useState(0);

    // Proration UI States
    const [showProrationModal, setShowProrationModal] = useState(false);
    const [targetPlan, setTargetPlan] = useState("");
    const [prorationPreview, setProrationPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [prorationSubmitting, setProrationSubmitting] = useState(false);
    const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
    const [prorationError, setProrationError] = useState("");

    useEffect(() => {
        Promise.all([
            api.get(`/platform/organizations/${orgId}/invoices`),
            api.get(`/platform/organizations/${orgId}/email-logs`),
            api.get(`/platform/organizations/${orgId}/audit-logs?limit=20`)
        ])
            .then(([invRes, emailRes, auditRes]) => {
                setInvoices(invRes.data.invoices || []);
                setEmailLogs(emailRes.data.emailLogs || []);
                setAuditLogs(auditRes.data.logs || auditRes.data || []);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [orgId, reloadTrigger]);

    const handlePreviewProration = async (plan) => {
        setTargetPlan(plan);
        setProrationError("");
        if (plan === subscription.plan) return;

        setPreviewLoading(true);
        setShowProrationModal(true);
        try {
            const { data } = await api.get(`/platform/organizations/${orgId}/proration-preview`, { params: { plan } });
            setProrationPreview(data);
        } catch (err) {
            setProrationError(err.response?.data?.message || err.message);
        } finally {
            setPreviewLoading(false);
        }
    };

    const confirmPlanChange = async () => {
        setProrationSubmitting(true);
        setProrationError("");
        try {
            await api.patch(`/platform/organizations/${orgId}/change-plan`, { plan: targetPlan });
            setReloadTrigger(prev => prev + 1);
            setShowProrationModal(false);
            if (onPlanChanged) onPlanChanged();
        } catch (err) {
            setProrationError(err.response?.data?.message || err.message);
        } finally {
            setProrationSubmitting(false);
        }
    };

    const handleSchedulePlanChange = async () => {
        setScheduleSubmitting(true);
        setProrationError("");
        try {
            await api.post(`/platform/organizations/${orgId}/schedule-plan-change`, { plan: targetPlan });
            setReloadTrigger(prev => prev + 1);
            setShowProrationModal(false);
            if (onPlanChanged) onPlanChanged();
        } catch (err) {
            setProrationError(err.response?.data?.message || err.message);
        } finally {
            setScheduleSubmitting(false);
        }
    };

    const handleCancelSchedule = async () => {
        if (!window.confirm("Cancel scheduled plan change?")) return;
        try {
            await api.delete(`/platform/organizations/${orgId}/schedule-plan-change`);
            setReloadTrigger(prev => prev + 1);
            if (onPlanChanged) onPlanChanged();
        } catch (err) { alert(err.response?.data?.message || "Failed"); }
    };

    if (loading) return <Spinner />;

    return (
        <div className="space-y-6 animate-fade-in max-w-full">
            {/* 12-COLUMN GRID SYSTEM */}
            <div className="grid grid-cols-12 gap-6">

                {/* ROW 1: SUBSCRIPTION (8) + BILLING SNAPSHOT (4) */}
                <div className="col-span-12 lg:col-span-8">
                    <SubscriptionPanel
                        subscription={subscription}
                        onPreviewProration={handlePreviewProration}
                        onAction={(action, payload) => {
                            // Map existing handleSubAction logic here
                            api.patch(`/platform/organizations/${orgId}/${action}`, payload)
                                .then(() => {
                                    setReloadTrigger(prev => prev + 1);
                                    if (onPlanChanged) onPlanChanged();
                                })
                                .catch(err => alert(err.response?.data?.message || "Failed"));
                        }}
                    />
                </div>
                <div className="col-span-12 lg:col-span-4">
                    <BillingSnapshot subscription={subscription} invoices={invoices} />
                </div>

                {/* ROW 2: INVOICE LEDGER (8) + DUNNING PANEL (4) */}
                <div className="col-span-12 lg:col-span-8">
                    <InvoiceLedger invoices={invoices} />
                </div>
                <div className="col-span-12 lg:col-span-4">
                    <DunningPanel subscription={subscription} invoices={invoices} />
                </div>

                {/* ROW 3: CREDIT LEDGER (6) + SCHEDULED PLAN (6) */}
                <div className="col-span-12 lg:col-span-6">
                    <CreditLedger invoices={invoices} />
                </div>
                <div className="col-span-12 lg:col-span-6">
                    <ScheduledPlanPanel subscription={subscription} onCancel={handleCancelSchedule} />
                </div>

                {/* ROW 4: AUDIT TIMELINE (12) */}
                <div className="col-span-12">
                    <AuditTimeline logs={auditLogs} />
                </div>

                {/* EMAIL HISTORY (12 - EXTRA) */}
                <div className="col-span-12">
                    <EmailHistoryPanel logs={emailLogs} />
                </div>
            </div>

            {/* Proration Modal */}
            {showProrationModal && (
                <ProrationModal
                    preview={prorationPreview}
                    loading={previewLoading}
                    error={prorationError}
                    onClose={() => setShowProrationModal(false)}
                    onConfirm={confirmPlanChange}
                    onSchedule={handleSchedulePlanChange}
                    submitting={prorationSubmitting}
                    scheduleSubmitting={scheduleSubmitting}
                />
            )}
        </div>
    );
}

// ─── ROW 1: COMPONENTS ───────────────────────────────────────────────────────

function SubscriptionPanel({ subscription, onPreviewProration, onAction }) {
    const sub = subscription;
    const [extraMonths, setExtraMonths] = useState(1);
    const fmt = (d) => d ? new Date(d).toLocaleDateString() : "—";

    // Grace check
    const inGrace = sub.graceEndsAt && new Date(sub.graceEndsAt) > new Date();

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-6 h-full flex flex-col">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">Subscription Lifecycle</h3>
                    <p className="text-sm text-gray-500">Core plan governance and renewal rules</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => onAction("suspend", {})}
                        disabled={sub.status === 'suspended'}
                        className="px-3 py-1.5 bg-red-50 text-red-700 text-[10px] font-bold rounded border border-red-100 hover:bg-red-100 disabled:opacity-40"
                    >
                        SUSPEND
                    </button>
                    <button
                        onClick={() => onAction("reactivate", {})}
                        disabled={sub.status !== 'suspended'}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded border border-emerald-100 hover:bg-emerald-100 disabled:opacity-40"
                    >
                        REACTIVATE
                    </button>
                    <select
                        value={sub.plan}
                        onChange={(e) => onPreviewProration(e.target.value)}
                        className="bg-gray-50 border border-gray-200 text-gray-700 text-xs font-bold rounded-lg px-2 py-1.5 outline-none"
                    >
                        <option value="basic">BASIC</option>
                        <option value="pro">PRO</option>
                        <option value="enterprise">ENTERPRISE</option>
                    </select>
                </div>
            </div>

            {inGrace && (
                <div className="mb-6 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Organization in Grace Period. Ends {fmt(sub.graceEndsAt)}.
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-4 mb-6">
                <InfoItem label="Current Plan" value={sub.plan} isBold isCaps />
                <InfoItem label="Status" value={sub.status} isBold isCaps statusColor={sub.status} />
                <InfoItem label="Next Renewal" value={fmt(sub.currentPeriodEnd)} />
                <InfoItem label="Auto Renew" value={sub.autoRenew ? "Enabled" : "Disabled"} />
                <InfoItem label="Inflation %" value={`${sub.inflationPercent || 0}%`} />
                <InfoItem label="Coupon / Discount" value={sub.coupon?.code || "None"} />
                <InfoItem label="Provider" value={sub.paymentProvider?.provider || "manual"} isCaps />
                <InfoItem label="Price at Sub" value={`$${sub.basePriceAtSubscription || 0}`} />
                <InfoItem label="Grace Days" value={sub.gracePeriodDays || 7} />
            </div>

            <div className="mt-auto pt-4 border-t border-gray-50 flex items-center gap-3">
                <div className="flex-1 flex items-center gap-2">
                    <input
                        type="number" min="1" max="24"
                        value={extraMonths}
                        onChange={(e) => setExtraMonths(parseInt(e.target.value))}
                        className="w-16 h-9 border border-gray-200 rounded text-sm text-center font-bold"
                    />
                    <span className="text-xs text-gray-400 font-semibold uppercase">Months</span>
                </div>
                <button
                    onClick={() => onAction("extend", { extraMonths })}
                    className="flex-[2] py-2 bg-gray-900 text-white text-[11px] font-bold rounded hover:bg-gray-800 transition-colors uppercase tracking-wider"
                >
                    Extend Period
                </button>
            </div>
        </div>
    );
}

function BillingSnapshot({ subscription, invoices }) {
    const lastPaid = invoices.find(inv => inv.status === 'paid');
    const currPeriodAmount = lastPaid?.subscriptionSnapshot?.finalAmount || 0;

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-6 h-full space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-gray-900">Billing Stats</h3>
                <p className="text-sm text-gray-500">Real-time financial exposure</p>
            </div>

            <div className="space-y-4">
                <div>
                    <p className="text-xs uppercase text-gray-400 font-bold mb-1">Current Period Amount</p>
                    <p className="text-3xl font-semibold text-gray-900">${currPeriodAmount}</p>
                </div>
                <div>
                    <p className="text-xs uppercase text-gray-400 font-bold mb-1">Credit Balance</p>
                    <p className="text-3xl font-semibold text-emerald-600">${subscription.creditBalance || 0}</p>
                </div>
                {subscription.scheduledPlanChange && (
                    <div className="pt-4 border-t border-gray-100">
                        <p className="text-xs uppercase text-gray-400 font-bold mb-1">Renewal Preview</p>
                        <p className="text-lg font-semibold text-blue-600">Pending Plan Change</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── ROW 2: COMPONENTS ───────────────────────────────────────────────────────

function InvoiceLedger({ invoices }) {
    const getStatusStyle = (s) => {
        return {
            paid: "text-green-700 bg-green-100 border border-green-200",
            pending: "text-amber-700 bg-amber-100 border border-amber-200",
            failed: "text-red-700 bg-red-100 border border-red-200",
            void: "text-gray-500 bg-gray-50 border border-gray-200"
        }[s] || "bg-gray-50 text-gray-600 border border-gray-200";
    }

    const columns = useMemo(() => [
        {
            accessorKey: "_id",
            header: "ID / Type",
            cell: ({ row }) => {
                const inv = row.original;
                return (
                    <div>
                        <div className="font-mono text-[10px] text-gray-400">{inv._id.slice(-8)}</div>
                        <div className="text-[11px] font-bold uppercase text-gray-600">{inv.type || 'RENEWAL'}</div>
                    </div>
                );
            }
        },
        {
            accessorKey: "subscriptionSnapshot.finalAmount",
            header: "Amount",
            cell: ({ row }) => <span className="font-semibold text-gray-900">${row.original.subscriptionSnapshot?.finalAmount || 0}</span>
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => {
                const status = row.original.status || "—";
                return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getStatusStyle(status)}`}>{status}</span>;
            }
        },
        {
            accessorKey: "retryCount",
            header: "Retries",
            cell: ({ row }) => <span className="text-gray-500">{row.original.retryCount || 0}</span>
        },
        {
            accessorKey: "dueDate",
            header: "Due Date",
            cell: ({ row }) => <span className="text-gray-500">{row.original.dueDate ? new Date(row.original.dueDate).toLocaleDateString() : '—'}</span>
        },
        {
            accessorKey: "createdAt",
            header: "Created",
            cell: ({ row }) => <span className="text-gray-400 text-xs">{new Date(row.original.createdAt).toLocaleDateString()}</span>
        }
    ], []);

    return (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col h-full">
            <div className="px-6 py-5 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Invoice Ledger</h3>
            </div>
            <div className="flex-1 overflow-x-auto p-0 m-0">
                <DataTable columns={columns} data={invoices} />
            </div>
        </div>
    );
}

function DunningPanel({ subscription, invoices }) {
    const latestPending = invoices.find(i => i.status === "pending" || i.status === "failed");
    const sub = subscription;

    if (!latestPending && (!sub.graceEndsAt || new Date(sub.graceEndsAt) < new Date())) {
        return (
            <div className="bg-white border border-gray-200 rounded-lg p-6 h-full flex flex-col items-center justify-center text-center">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-800">No active billing issues</h3>
                <p className="text-xs text-gray-400 mt-1">Lifecycle is healthy</p>
            </div>
        );
    }

    const retriesExhausted = latestPending && latestPending.retryCount >= latestPending.maxRetries;
    const graceEnds = sub.graceEndsAt ? new Date(sub.graceEndsAt) : null;
    const graceDaysLeft = graceEnds ? Math.ceil((graceEnds - new Date()) / (1000 * 60 * 60 * 24)) : 0;

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-6 h-full space-y-5">
            <div>
                <h3 className="text-lg font-semibold text-gray-900">Dunning Monitor</h3>
                <p className="text-sm text-gray-500">Payment failure & recovery status</p>
            </div>

            {retriesExhausted && (
                <div className="p-3 bg-red-100 border border-red-200 text-red-800 text-[11px] font-bold rounded animate-pulse">
                    Retries Exhausted — Suspension Pending
                </div>
            )}

            {graceEnds && graceDaysLeft > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold rounded">
                    Grace ends in {graceDaysLeft} days
                </div>
            )}

            <div className="space-y-3 pt-2">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Retry Count</span>
                    <span className="font-bold text-gray-900">{latestPending?.retryCount || 0} / {latestPending?.maxRetries || 3}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Next Retry</span>
                    <span className="font-medium text-gray-800">{latestPending?.nextRetryAt ? new Date(latestPending.nextRetryAt).toLocaleString() : '—'}</span>
                </div>
                {latestPending?.failureReason && (
                    <div className="text-[11px] text-red-500 mt-1 italic leading-tight">
                        Last Error: {latestPending.failureReason}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── ROW 3: COMPONENTS ───────────────────────────────────────────────────────

function CreditLedger({ invoices }) {
    // Filter invoices that resulted in credits (negative finalAmount)
    const credits = invoices.filter(inv => (inv.subscriptionSnapshot?.finalAmount || 0) < 0 || (inv.subscriptionSnapshot?.unusedCreditApplied || 0) > 0);

    return (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden h-full flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900">Credit Ledger</h3>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[250px]">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                        <tr>
                            <th className="px-6 py-2 text-xs uppercase text-gray-400 font-bold">Date</th>
                            <th className="px-6 py-2 text-xs uppercase text-gray-400 font-bold">Source</th>
                            <th className="px-6 py-2 text-xs uppercase text-gray-400 font-bold">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {credits.length === 0 ? (
                            <tr><td colSpan="3" className="p-8 text-center text-gray-400">No credit movemement observed.</td></tr>
                        ) : credits.map(inv => (
                            <tr key={inv._id} className="hover:bg-gray-50 text-[13px]">
                                <td className="px-6 py-2 text-gray-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
                                <td className="px-6 py-2 font-medium text-gray-700 capitalize">{inv.type || 'RENEWAL'}</td>
                                <td className="px-6 py-2 font-bold text-emerald-600">
                                    {inv.subscriptionSnapshot?.finalAmount < 0
                                        ? `+$${Math.abs(inv.subscriptionSnapshot.finalAmount)}`
                                        : `-$${inv.subscriptionSnapshot?.unusedCreditApplied || 0}`}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ScheduledPlanPanel({ subscription, onCancel }) {
    const sched = subscription.scheduledPlanChange;

    if (!sched || !sched.newPlan) {
        return (
            <div className="bg-white border border-gray-200 rounded-lg p-6 h-full flex flex-col items-center justify-center text-center">
                <p className="text-sm font-semibold text-gray-400">No scheduled changes</p>
                <p className="text-xs text-gray-300 mt-1 tracking-tight">System is locked to current period</p>
            </div>
        );
    }

    return (
        <div className="bg-white border border-amber-200 bg-amber-50/20 rounded-lg p-6 h-full flex flex-col justify-between">
            <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 leading-snug">Scheduled Shift Pending</h3>
                    <p className="text-sm text-gray-600 mt-1">
                        Plan will change to <strong className="uppercase text-amber-700">{sched.newPlan}</strong> effective on <strong>{new Date(sched.effectiveDate).toLocaleDateString()}</strong>.
                    </p>
                </div>
            </div>
            <div className="mt-6 flex justify-end">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 bg-white border border-amber-300 text-amber-800 text-xs font-bold rounded-lg hover:bg-amber-100 transition-colors shadow-sm"
                >
                    Cancel Scheduled Change
                </button>
            </div>
        </div>
    );
}

// ─── ROW 4: AUDIT TIMELINE ─────────────────────────────────────────────────────

function AuditTimeline({ logs }) {
    const getEventBadge = (action) => {
        const map = {
            PLATFORM_PLAN_CHANGED: "border-blue-200 text-blue-700 bg-blue-50",
            SUBSCRIPTION_RETRY_FAILED: "border-amber-200 text-amber-700 bg-amber-50",
            SUBSCRIPTION_RETRY_EXHAUSTED: "border-red-200 text-red-700 bg-red-50",
            SUBSCRIPTION_AUTO_SUSPENDED: "border-red-300 text-red-800 bg-red-100",
            PRORATION_APPLIED: "border-emerald-200 text-emerald-700 bg-emerald-50",
            ORGANIZATION_SUSPENDED: "border-red-200 text-red-700 bg-red-50",
            ORGANIZATION_REACTIVATED: "border-emerald-200 text-emerald-700 bg-emerald-50"
        };
        return map[action] || "border-gray-200 text-gray-600 bg-gray-50";
    };

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Governance Audit Timeline</h3>
            <div className="relative space-y-4">
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-100"></div>
                {logs.length === 0 ? (
                    <p className="text-sm text-gray-400 pl-8 italic">No governance events logged.</p>
                ) : logs.map((log, i) => (
                    <div key={log._id || i} className="relative pl-8 group">
                        <div className="absolute left-0 top-1.5 w-[22px] h-[22px] rounded-full bg-white border-2 border-gray-100 flex items-center justify-center p-0.5 group-hover:border-blue-200 transition-colors">
                            <div className="w-full h-full rounded-full bg-gray-50 group-hover:bg-blue-50"></div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                                <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${getEventBadge(log.action)}`}>
                                    {log.action.replace(/_/g, ' ')}
                                </span>
                                <span className="text-xs text-gray-500 font-mono">{new Date(log.createdAt).toLocaleString()}</span>
                            </div>
                            <div className="text-xs text-gray-400">
                                Executed by <span className="text-gray-600 font-semibold">{log.userId?.name || 'System Auto'}</span>
                            </div>
                        </div>
                        {log.details && (
                            <p className="text-[11px] text-gray-500 mt-1 max-w-3xl leading-snug">
                                {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── EXTRA: EMAIL HISTORY ─────────────────────────────────────────────────────

function EmailHistoryPanel({ logs }) {
    return (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 mb-2">
                <h3 className="text-lg font-semibold text-gray-900">Mail Gateway Dispatches</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-2 text-xs uppercase text-gray-400 font-bold">Dispatch Date</th>
                            <th className="px-6 py-2 text-xs uppercase text-gray-400 font-bold">Template Type</th>
                            <th className="px-6 py-2 text-xs uppercase text-gray-400 font-bold">Recipient</th>
                            <th className="px-6 py-2 text-xs uppercase text-gray-400 font-bold text-right">Gateway Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {logs.length === 0 ? (
                            <tr><td colSpan="4" className="p-10 text-center text-gray-400">No emails dispatched to thisorg yet.</td></tr>
                        ) : logs.map(log => (
                            <tr key={log._id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-6 py-2 text-gray-500 text-xs font-mono">{new Date(log.createdAt).toLocaleString()}</td>
                                <td className="px-6 py-2 font-semibold text-gray-800 text-[11px] uppercase tracking-tight">{log.type.replace(/_/g, ' ')}</td>
                                <td className="px-6 py-2 text-gray-500 text-xs truncate max-w-[250px]">{log.recipient}</td>
                                <td className="px-6 py-2 text-right">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${log.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                        {log.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function InfoItem({ label, value, isBold, isCaps, statusColor }) {
    const statusMap = {
        active: "text-emerald-600",
        trial: "text-amber-600",
        suspended: "text-red-600",
        expired: "text-gray-500"
    };
    return (
        <div className="flex flex-col">
            <span className="text-xs text-gray-500 mb-0.5">{label}</span>
            <span className={`text-[13px] ${isBold ? 'font-bold' : 'font-medium'} ${isCaps ? 'uppercase' : ''} ${statusColor ? statusMap[statusColor] : 'text-gray-900'}`}>
                {value}
            </span>
        </div>
    );
}

function ProrationModal({ preview, loading, error, onClose, onConfirm, onSchedule, submitting, scheduleSubmitting }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-900 tracking-tight">Enterprise Plan Adjustment</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>

                <div className="p-8">
                    {loading ? <Spinner /> : error ? (
                        <div className="bg-red-50 border border-red-200 p-4 rounded-lg text-red-800 text-sm font-semibold">{error}</div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="flex-1 p-3 bg-gray-50 rounded-lg border border-gray-200 text-center">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Current</p>
                                    <p className="font-bold uppercase text-gray-700">{preview.currentPlan}</p>
                                </div>
                                <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                <div className="flex-1 p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
                                    <p className="text-[10px] font-bold text-blue-500 uppercase">New</p>
                                    <p className="font-bold uppercase text-blue-900">{preview.newPlan}</p>
                                </div>
                            </div>

                            <div className="bg-gray-50 p-5 rounded-lg border border-gray-100 space-y-3 text-sm">
                                <div className="flex justify-between"><span>Unused Credit ({preview.currentPlan})</span><span className="text-emerald-600 font-bold">-${preview.preview.unusedCredit.toFixed(2)}</span></div>
                                <div className="flex justify-between"><span>New Plan Proration ({preview.newPlan})</span><span className="text-gray-900 font-bold">${preview.preview.newPlanCharge.toFixed(2)}</span></div>
                                <div className="border-t border-gray-200 pt-3 flex justify-between font-black text-gray-900 text-base">
                                    <span>Net Amount</span>
                                    <span>{preview.preview.finalAmount < 0 ? `-$${Math.abs(preview.preview.finalAmount).toFixed(2)} Credit` : `$${preview.preview.finalAmount.toFixed(2)} Charge`}</span>
                                </div>
                            </div>

                            <p className="text-xs text-gray-500 text-center px-4 leading-relaxed italic">
                                Plan adjustments can be applied immediately with proration or scheduled for the next renewal cycle to avoid mid-cycle charges.
                            </p>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                    <button onClick={onSchedule} disabled={submitting || scheduleSubmitting} className="px-5 py-2.5 text-sm font-bold text-gray-800 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm">
                        {scheduleSubmitting ? "Scheduling..." : "Schedule for Next Cycle"}
                    </button>
                    <button onClick={onConfirm} disabled={submitting || scheduleSubmitting} className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-600/20">
                        {submitting ? "Processing..." : "Confirm Immediately"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── END OF UPGRADE ───────────────────────────────────────────────────────────

