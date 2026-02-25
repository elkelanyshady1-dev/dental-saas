import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Copy, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import api from "../../services/api";
import { DataTable } from "../../components/ui/DataTable";

export default function OrganizationsPage() {
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");

    // Provisioning Modal State
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState("");
    const [newOrgParams, setNewOrgParams] = useState({
        organizationName: "",
        slug: "",
        plan: "basic",
        status: "trial",
        adminEmail: "",
        trialDays: 14,
        country: ""
    });

    // Success State
    const [successData, setSuccessData] = useState(null);
    const [copied, setCopied] = useState(false);

    const navigate = useNavigate();

    const fetchOrgs = async () => {
        try {
            setLoading(true);
            const res = await api.get("/platform/organizations");
            setOrganizations(res.data || []);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load organizations.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrgs();
    }, []);

    const handleCreateOrg = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setFormError("");

        try {
            const res = await api.post("/platform/organizations", newOrgParams);
            setSuccessData(res.data);
            setIsAddOpen(false);
            setNewOrgParams({
                organizationName: "", slug: "", plan: "basic", status: "trial", adminEmail: "", trialDays: 14, country: ""
            });
            fetchOrgs();
        } catch (err) {
            setFormError(err.response?.data?.message || "Failed to provision organization.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCopyPassword = () => {
        if (!successData?.tempPassword) return;
        navigator.clipboard.writeText(successData.tempPassword);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const filtered = organizations.filter((org) => {
        const q = search.toLowerCase();
        return (
            org.name?.toLowerCase().includes(q) ||
            org.slug?.toLowerCase().includes(q)
        );
    });

    const columns = useMemo(() => [
        {
            accessorKey: "name",
            header: "Organization",
            cell: ({ row }) => {
                const org = row.original;
                const initial = org.name?.charAt(0)?.toUpperCase() || "O";
                return (
                    <div className="flex items-center gap-3 py-1">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 font-bold text-sm flex items-center justify-center border border-blue-100 shrink-0">
                            {initial}
                        </div>
                        <div>
                            <p className="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">{org.name}</p>
                            {org.contactEmail && <p className="text-xs text-slate-400 mt-0.5">{org.contactEmail}</p>}
                        </div>
                    </div>
                );
            }
        },
        {
            accessorKey: "slug",
            header: "Slug",
            cell: ({ row }) => (
                <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-md border border-slate-200">
                    {row.original.slug || "—"}
                </span>
            )
        },
        {
            accessorKey: "subscriptionPlan",
            header: "Plan",
            cell: ({ row }) => {
                const planColors = { basic: "bg-slate-100 text-slate-600", pro: "bg-blue-100 text-blue-700", enterprise: "bg-indigo-100 text-indigo-700" };
                const plan = row.original.subscriptionPlan || "basic";
                return <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize ${planColors[plan] || planColors.basic}`}>{plan}</span>;
            }
        },
        {
            accessorKey: "subscriptionStatus",
            header: "Status",
            cell: ({ row }) => {
                const badgeColors = { active: "bg-emerald-50 text-emerald-700 border-emerald-200", trial: "bg-amber-50 text-amber-700 border-amber-200", suspended: "bg-red-50 text-red-700 border-red-200", expired: "bg-slate-50 text-slate-600 border-slate-200", canceled: "bg-slate-50 text-slate-600 border-slate-200" };
                const status = row.original.subscriptionStatus || "—";
                return <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold capitalize border ${badgeColors[status] || badgeColors.trial}`}>{status}</span>;
            }
        },
        {
            accessorKey: "createdAt",
            header: "Created",
            cell: ({ row }) => (
                <span className="text-slate-500 text-xs font-medium">
                    {row.original.createdAt ? new Date(row.original.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                </span>
            )
        }
    ], []);

    return (
        <div className="bg-slate-50 min-h-screen p-10 space-y-10">
            {/* Page Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Organizations Management</h1>
                    <p className="text-slate-500 mt-1">Manage all tenant organizations across the platform.</p>
                </div>
                <button
                    onClick={() => setIsAddOpen(true)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                    <Plus className="w-5 h-5" />
                    New Organization
                </button>
            </div>

            {/* Search + Table Container */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
                {/* Search Bar */}
                <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search organization..."
                        className="w-full md:w-80 px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors placeholder:text-slate-400"
                    />
                    <span className="text-sm text-slate-500">
                        {filtered.length} organization{filtered.length !== 1 ? "s" : ""}
                    </span>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="flex items-center justify-center py-24 gap-3">
                        <div className="w-6 h-6 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                        <p className="text-slate-500 font-medium">Loading organizations...</p>
                    </div>
                )}

                {/* Error State */}
                {!loading && error && (
                    <div className="py-16 text-center">
                        <p className="text-red-500 font-medium">{error}</p>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !error && filtered.length === 0 && (
                    <div className="py-16 text-center">
                        <p className="text-slate-400 text-sm">No organizations found.</p>
                    </div>
                )}

                {/* Table */}
                {!loading && !error && filtered.length > 0 && (
                    <DataTable
                        columns={columns}
                        data={filtered}
                        onRowClick={(org) => navigate(`/platform/organizations/${org._id}`)}
                    />
                )}
            </div>

            {/* Success Modal */}
            {successData && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
                        <div className="p-8 text-center bg-slate-50 border-b border-slate-100">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-800">Organization Provisioned</h2>
                            <p className="text-slate-500 text-sm mt-2">The tenant has been created and initialized successfully.</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Admin Email</p>
                                <p className="text-slate-800 font-medium">{successData.adminUser?.email}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Temporary Password</p>
                                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3">
                                    <code className="text-blue-700 font-mono font-bold tracking-wider">{successData.tempPassword}</code>
                                    <button
                                        onClick={handleCopyPassword}
                                        className="text-slate-400 hover:text-blue-600 transition-colors p-1"
                                        title="Copy Password"
                                    >
                                        {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
                                    </button>
                                </div>
                                <p className="text-[11px] text-amber-600 mt-2 font-medium flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    This password will only be shown once.
                                </p>
                            </div>
                            <button
                                onClick={() => setSuccessData(null)}
                                className="w-full mt-6 bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 rounded-lg transition-colors border border-slate-700"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Creation Modal */}
            {isAddOpen && !successData && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-slate-800">Provision Organization</h2>
                                <p className="text-xs text-slate-500 mt-0.5">Initialize a new tenant structure.</p>
                            </div>
                            <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                                &times;
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            {formError && (
                                <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
                                    <div className="flex items-center">
                                        <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                                        <p className="text-sm text-red-700 font-medium">{formError}</p>
                                    </div>
                                </div>
                            )}

                            <form id="org-provision-form" onSubmit={handleCreateOrg} className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {/* Column 1 */}
                                    <div className="space-y-5">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Organization Name <span className="text-red-500">*</span></label>
                                            <input
                                                type="text"
                                                required
                                                value={newOrgParams.organizationName}
                                                onChange={e => setNewOrgParams(p => ({ ...p, organizationName: e.target.value }))}
                                                className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-shadow"
                                                placeholder="e.g. Apex Dental Group"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Slug URL <span className="text-slate-400 font-normal">(Optional)</span></label>
                                            <input
                                                type="text"
                                                value={newOrgParams.slug}
                                                onChange={e => setNewOrgParams(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                                                className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-shadow font-mono text-sm"
                                                placeholder="e.g. apex-dental"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Admin Email <span className="text-red-500">*</span></label>
                                            <input
                                                type="email"
                                                required
                                                value={newOrgParams.adminEmail}
                                                onChange={e => setNewOrgParams(p => ({ ...p, adminEmail: e.target.value }))}
                                                className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-shadow"
                                                placeholder="admin@apexdental.com"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Country <span className="text-red-500">*</span></label>
                                            <select
                                                required
                                                value={newOrgParams.country}
                                                onChange={e => setNewOrgParams(p => ({ ...p, country: e.target.value }))}
                                                className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-shadow"
                                            >
                                                <option value="">Select a country</option>
                                                <option value="Egypt">Egypt</option>
                                                <option value="Saudi Arabia">Saudi Arabia</option>
                                                <option value="UAE">UAE</option>
                                                <option value="Kuwait">Kuwait</option>
                                                <option value="Qatar">Qatar</option>
                                                <option value="Bahrain">Bahrain</option>
                                                <option value="Oman">Oman</option>
                                                <option value="UK">UK</option>
                                                <option value="USA">USA</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Column 2 */}
                                    <div className="space-y-5">
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Subscription Plan</label>
                                            <select
                                                value={newOrgParams.plan}
                                                onChange={e => setNewOrgParams(p => ({ ...p, plan: e.target.value }))}
                                                className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-shadow"
                                            >
                                                <option value="basic">Basic</option>
                                                <option value="pro">Pro</option>
                                                <option value="enterprise">Enterprise</option>
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Initial Status</label>
                                                <select
                                                    value={newOrgParams.status}
                                                    onChange={e => setNewOrgParams(p => ({ ...p, status: e.target.value }))}
                                                    className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-shadow"
                                                >
                                                    <option value="trial">Trial</option>
                                                    <option value="active">Active</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Trial Days</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={newOrgParams.trialDays}
                                                    onChange={e => setNewOrgParams(p => ({ ...p, trialDays: parseInt(e.target.value) || 0 }))}
                                                    className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-shadow"
                                                />
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg mt-2">
                                            <p className="text-xs text-slate-600 font-medium">Provisioning Tasks:</p>
                                            <ul className="text-xs text-slate-500 mt-2 space-y-1 list-disc pl-4">
                                                <li>Feature map initialized for plan <span className="font-semibold text-slate-700">{newOrgParams.plan}</span></li>
                                                <li>Default role map created</li>
                                                <li>Root branch initialized</li>
                                                <li>Temp admin credentials generated</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsAddOpen(false)}
                                className="px-4 py-2 font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg transition-colors hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                form="org-provision-form"
                                disabled={isSubmitting}
                                className="px-6 py-2 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSubmitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Provisioning...</> : 'Provision Organization'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

