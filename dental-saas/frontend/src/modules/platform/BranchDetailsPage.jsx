import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../services/api";

const TABS = ["Overview", "Users", "Audit Logs", "Configuration", "Analytics"];

export default function BranchDetailsPage() {
    const { orgId, branchId } = useParams();
    const navigate = useNavigate();
    const [branch, setBranch] = useState(null);
    const [orgName, setOrgName] = useState("");
    const [orgWorkingHours, setOrgWorkingHours] = useState({ start: "08:00", end: "20:00" });
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("Overview");
    const [editing, setEditing] = useState(false);
    const [newName, setNewName] = useState("");

    useEffect(() => {
        const load = async () => {
            try {
                // Use dedicated branch endpoint instead of list+find
                const [branchRes, anaRes, orgRes] = await Promise.all([
                    api.get(`/platform/organizations/${orgId}/branches/${branchId}`),
                    api.get(`/platform/organizations/${orgId}/branches/${branchId}/analytics`),
                    api.get(`/platform/organizations/${orgId}`),
                ]);
                setBranch(branchRes.data);
                setAnalytics(anaRes.data);
                setOrgName(orgRes.data?.name || "");
                setOrgWorkingHours(
                    orgRes.data?.appointmentSettings?.workingHours || { start: "08:00", end: "20:00" }
                );
                setNewName(branchRes.data?.name || "");
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [orgId, branchId]);

    const handleRename = async () => {
        if (!newName.trim() || !branch?.isActive) return;
        try {
            await api.patch(`/platform/organizations/${orgId}/branches/${branchId}`, { name: newName });
            setBranch((b) => ({ ...b, name: newName }));
            setEditing(false);
        } catch (err) { alert(err.response?.data?.message || "Failed"); }
    };

    // Archive / Reactivate — goes through the configuration endpoint
    const handleToggleActive = async () => {
        try {
            const res = await api.patch(
                `/platform/organizations/${orgId}/branches/${branchId}/configuration`,
                { isActive: !branch.isActive }
            );
            setBranch((b) => ({ ...b, isActive: res.data.isActive }));
        } catch (err) { alert(err.response?.data?.message || "Failed"); }
    };

    if (loading) return <Spinner />;
    if (!branch) return <div className="p-10 text-red-500 font-medium">Branch not found.</div>;

    const isArchived = !branch.isActive;

    return (
        <div className="bg-slate-50 min-h-screen p-10 space-y-8">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-slate-400">Platform</span>
                <span className="text-slate-300">/</span>
                <button onClick={() => navigate("/platform/organizations")} className="text-blue-600 hover:text-blue-800 font-medium transition-colors">
                    Organizations
                </button>
                <span className="text-slate-300">/</span>
                <button onClick={() => navigate(`/platform/organizations/${orgId}`)} className="text-blue-600 hover:text-blue-800 font-medium transition-colors">
                    {orgName || "Organization"}
                </button>
                <span className="text-slate-300">/</span>
                <span className="text-slate-700 font-semibold">{branch.name}</span>
            </nav>

            {/* Archive Mode Banner */}
            {isArchived && (
                <div className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium">
                    <svg className="w-5 h-5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>This branch is in <strong>Archive Mode</strong>. Write operations are disabled. Reactivate to resume operations.</span>
                </div>
            )}

            {/* Header Card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
                <div className="flex flex-wrap items-start justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl border font-bold text-xl flex items-center justify-center ${isArchived ? "bg-amber-50 border-amber-200 text-amber-600" : "bg-indigo-50 border-indigo-100 text-indigo-700"}`}>
                            {branch.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                            {editing ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="border border-slate-300 rounded-lg px-3 py-1.5 text-lg font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button onClick={handleRename} className="px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">Save</button>
                                    <button onClick={() => setEditing(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                                </div>
                            ) : (
                                <h1 className="text-2xl font-bold text-slate-900">{branch.name}</h1>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                {/* Archive Mode vs Active badge */}
                                {isArchived ? (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 flex items-center gap-1">
                                        🟡 Archive Mode
                                    </span>
                                ) : (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 flex items-center gap-1">
                                        🟢 Active
                                    </span>
                                )}
                                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 capitalize">{branch.type}</span>
                                <span className="text-xs text-slate-400">
                                    Created {new Date(branch.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {!editing && (
                            <button
                                onClick={() => setEditing(true)}
                                disabled={isArchived}
                                className="px-4 py-2 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Rename
                            </button>
                        )}
                        <button
                            onClick={handleToggleActive}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${isArchived
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
                                : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                                }`}
                        >
                            {isArchived ? "Reactivate Branch" : "Archive Branch"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Tab Bar */}
            <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-5 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${activeTab === tab ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-800"}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div>
                {activeTab === "Overview" && <BranchOverviewTab branch={branch} analytics={analytics} orgWorkingHours={orgWorkingHours} />}
                {activeTab === "Users" && <BranchUsersTab orgId={orgId} branchId={branchId} />}
                {activeTab === "Audit Logs" && <BranchAuditLogsTab orgId={orgId} />}
                {activeTab === "Configuration" && (
                    <BranchConfigurationTab
                        orgId={orgId}
                        branchId={branchId}
                        isArchived={isArchived}
                        onIsActiveChange={(val) => setBranch((b) => ({ ...b, isActive: val }))}
                    />
                )}
                {activeTab === "Analytics" && <BranchAnalyticsTab orgId={orgId} branchId={branchId} />}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW TAB
// ─────────────────────────────────────────────────────────────────────────────
function BranchOverviewTab({ branch, analytics, orgWorkingHours }) {
    const metrics = [
        { label: "Total Users", value: analytics?.totalUsers ?? branch?.userCount ?? "—" },
        { label: "Active Users", value: analytics?.activeUsers ?? "—" },
        { label: "Suspended Users", value: analytics?.suspendedUsers ?? "—" },
        { label: "Audit Events", value: analytics?.auditEventsCount ?? branch?.auditCount ?? "—" },
    ];

    // Effective hours are server-computed and returned in branch details
    const effective = branch.effectiveWorkingHours || orgWorkingHours;
    const isOverride = branch.workingHoursOverride?.start != null;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {metrics.map(({ label, value }) => (
                    <div key={label} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                        <p className="text-xs uppercase text-slate-500 tracking-wider font-semibold">{label}</p>
                        <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
                    </div>
                ))}
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-4">
                <h2 className="text-xl font-semibold text-slate-900">Branch Details</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
                    <InfoRow label="Branch Name" value={branch.name} />
                    <InfoRow label="Type" value={<span className="capitalize">{branch.type}</span>} />
                    <InfoRow label="Status" value={branch.isActive ? "Active" : "Archived"} />
                    {branch.address && <InfoRow label="Address" value={branch.address} />}
                    {branch.phone && <InfoRow label="Phone" value={branch.phone} />}
                    <InfoRow
                        label="Working Hours"
                        value={
                            <span className="font-mono">
                                {effective.start} – {effective.end}
                                {isOverride
                                    ? <span className="ml-2 text-xs text-blue-600 font-semibold">(Override)</span>
                                    : <span className="ml-2 text-xs text-slate-400">(Inherited from org)</span>
                                }
                            </span>
                        }
                    />
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// USERS TAB
// ─────────────────────────────────────────────────────────────────────────────
function BranchUsersTab({ orgId, branchId }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/platform/organizations/${orgId}/users`)
            .then((r) => {
                const all = r.data || [];
                const filtered = all.filter((u) =>
                    u.hasFullBranchAccess ||
                    (u.branchAccess || []).some((b) => (b._id || b) === branchId)
                );
                setUsers(filtered);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [orgId, branchId]);

    if (loading) return <Spinner />;

    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
                <h2 className="text-xl font-semibold text-slate-900">Branch Users ({users.length})</h2>
            </div>
            {users.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-16">No users assigned to this branch.</p>
            ) : (
                <table className="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/50">
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Name</th>
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Email</th>
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Role</th>
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => (
                            <tr key={u._id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="py-4 px-5 font-semibold text-slate-800">{u.name}</td>
                                <td className="py-4 px-5 text-slate-500">{u.email}</td>
                                <td className="py-4 px-5 text-slate-500">{u.roleId?.name || "—"}</td>
                                <td className="py-4 px-5">
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                                        {u.isActive ? "Active" : "Inactive"}
                                    </span>
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
function BranchAuditLogsTab({ orgId }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/platform/organizations/${orgId}/audit-logs?limit=30`)
            .then((r) => setLogs(r.data?.logs || r.data || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [orgId]);

    if (loading) return <Spinner />;
    return (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
                <h2 className="text-xl font-semibold text-slate-900">Recent Audit Events</h2>
            </div>
            {logs.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-16">No events recorded.</p>
            ) : (
                <table className="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/50">
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Timestamp</th>
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Action</th>
                            <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">User</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map((log, i) => {
                            const action = (log.action || "").toUpperCase();
                            const ab = action === "CREATE" ? "bg-emerald-100 text-emerald-700" : action === "DELETE" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700";
                            return (
                                <tr key={log._id || i} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="py-3.5 px-5 text-xs text-slate-500">{new Date(log.createdAt || log.timestamp).toLocaleString()}</td>
                                    <td className="py-3.5 px-5"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ab}`}>{log.action || "—"}</span></td>
                                    <td className="py-3.5 px-5 text-slate-600">{log.userId?.name || "System"}</td>
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
// CONFIGURATION TAB
// ─────────────────────────────────────────────────────────────────────────────
function BranchConfigurationTab({ orgId, branchId, isArchived, onIsActiveChange }) {
    const [config, setConfig] = useState(null);
    const [original, setOriginal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        api.get(`/platform/organizations/${orgId}/branches/${branchId}/configuration`)
            .then((r) => { setConfig(r.data); setOriginal(r.data); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [orgId, branchId]);

    const hasChanges = config && original
        ? JSON.stringify(config) !== JSON.stringify(original)
        : false;

    const overrideEnabled = Boolean(config?.workingHoursOverride?.start);

    const enableOverride = () =>
        setConfig((c) => ({
            ...c,
            workingHoursOverride: {
                start: c.effectiveWorkingHours?.start || "08:00",
                end: c.effectiveWorkingHours?.end || "20:00",
            },
        }));

    const clearOverride = () =>
        setConfig((c) => ({ ...c, workingHoursOverride: { start: null, end: null } }));

    const setHours = (field, value) =>
        setConfig((c) => ({
            ...c,
            workingHoursOverride: { ...(c.workingHoursOverride || {}), [field]: value },
        }));

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        try {
            const res = await api.patch(
                `/platform/organizations/${orgId}/branches/${branchId}/configuration`,
                { workingHoursOverride: config.workingHoursOverride }
            );
            const next = {
                workingHoursOverride: res.data.workingHoursOverride,
                effectiveWorkingHours: res.data.effectiveWorkingHours,
                isActive: res.data.isActive,
            };
            setConfig(next);
            setOriginal(next);
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

    const effective = config.effectiveWorkingHours || {};

    return (
        <div className="space-y-6">
            {/* Working Hours Override */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-6">
                <div>
                    <h2 className="text-xl font-semibold text-slate-900">Working Hours</h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Override the organization's working hours for this branch only.
                        Slot duration is always inherited from organization.
                    </p>
                </div>

                {!overrideEnabled ? (
                    /* Inherit state */
                    <div className="flex items-center justify-between p-5 border border-slate-200 rounded-xl bg-slate-50">
                        <div>
                            <p className="text-sm font-semibold text-slate-700">Inherited from organization</p>
                            <p className="text-xs text-slate-500 mt-0.5 font-mono">
                                {effective.start || "08:00"} – {effective.end || "20:00"}
                            </p>
                        </div>
                        <button
                            onClick={enableOverride}
                            disabled={isArchived}
                            className="px-4 py-2 border border-blue-300 text-blue-700 text-sm font-semibold rounded-xl hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Enable Override
                        </button>
                    </div>
                ) : (
                    /* Override active */
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-blue-700">Branch override active</p>
                            <button
                                onClick={clearOverride}
                                disabled={isArchived}
                                className="text-xs text-slate-500 hover:text-red-600 font-medium transition-colors disabled:opacity-40"
                            >
                                Clear Override (inherit from org)
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Start Time</label>
                                <input
                                    type="time"
                                    value={config.workingHoursOverride?.start || "08:00"}
                                    onChange={(e) => setHours("start", e.target.value)}
                                    disabled={isArchived}
                                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">End Time</label>
                                <input
                                    type="time"
                                    value={config.workingHoursOverride?.end || "20:00"}
                                    onChange={(e) => setHours("end", e.target.value)}
                                    disabled={isArchived}
                                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-slate-400">
                            Effective: <span className="font-mono font-medium text-slate-600">
                                {config.workingHoursOverride?.start || "—"} – {config.workingHoursOverride?.end || "—"}
                            </span>
                        </p>
                    </div>
                )}
            </div>

            {/* Inherited settings — read-only display */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                <p className="text-xs uppercase font-semibold text-slate-400 tracking-wider mb-3">Inherited from Organization (read-only)</p>
                <div className="flex gap-8 text-sm text-slate-600">
                    <span>Modules: <span className="font-medium text-slate-800">Inherited</span></span>
                    <span>Slot Duration: <span className="font-medium text-slate-800">Inherited</span></span>
                    <span>Subscription: <span className="font-medium text-slate-800">Organization-level</span></span>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-end gap-4">
                {isArchived && (
                    <span className="text-xs text-amber-600 font-medium">Branch is archived — reactivate to save changes</span>
                )}
                {saved && !isArchived && (
                    <span className="text-sm font-medium text-emerald-600 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Configuration saved
                    </span>
                )}
                <button
                    onClick={handleSave}
                    disabled={saving || !hasChanges || isArchived}
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
function BranchAnalyticsTab({ orgId, branchId }) {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/platform/organizations/${orgId}/branches/${branchId}/analytics`)
            .then(r => setAnalytics(r.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [orgId, branchId]);

    if (loading) return <Spinner />;
    if (!analytics) return <div className="p-8 text-red-500">Failed to load analytics data.</div>;

    const metrics = [
        { label: "Total Patients", value: analytics.totalPatients || 0 },
        { label: "Total Appointments", value: analytics.totalAppointments || 0 },
        { label: "Appointments This Month", value: analytics.appointmentsThisMonth || 0, color: "text-blue-600" },
    ];

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Top Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {metrics.map((m, i) => (
                    <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                        <p className="text-xs uppercase font-bold text-slate-500 tracking-wider mb-2">{m.label}</p>
                        <p className={`text-4xl font-extrabold ${m.color || "text-slate-800"}`}>{m.value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
