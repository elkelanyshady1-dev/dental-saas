import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { DataTable } from "../../components/ui/DataTable";

export default function PlatformUsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const res = await api.get("/platform/users");
                setUsers(res.data || []);
            } catch (err) {
                setError(err.response?.data?.message || "Failed to load platform users.");
            } finally {
                setLoading(false);
            }
        };
        fetchUsers();
    }, []);

    const handleRoleChange = async (id, newRole) => {
        try {
            await api.patch(`/platform/users/${id}`, { role: newRole });
            setUsers((prev) => prev.map((u) => u._id === id ? { ...u, role: newRole } : u));
        } catch (err) {
            alert(err.response?.data?.message || "Failed to update role.");
        }
    };

    const handleToggleActive = async (user) => {
        try {
            await api.patch(`/platform/users/${user._id}`, { isActive: !user.isActive });
            setUsers((prev) => prev.map((u) => u._id === user._id ? { ...u, isActive: !u.isActive } : u));
        } catch (err) {
            alert(err.response?.data?.message || "Failed to update status.");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this platform user?")) return;
        try {
            await api.delete(`/platform/users/${id}`);
            setUsers((prev) => prev.filter((u) => u._id !== id));
        } catch (err) {
            alert(err.response?.data?.message || "Failed to delete user.");
        }
    };
    const handleUserAdded = (newUser) => {
        setUsers((prev) => [newUser, ...prev]);
        setShowModal(false);
    };

    const columns = [
        {
            accessorKey: "name",
            header: "Name",
            cell: ({ row }) => {
                const user = row.original;
                const initial = user.name?.charAt(0)?.toUpperCase() || "U";
                return (
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center shrink-0">
                            {initial}
                        </div>
                        <span className="font-semibold text-slate-800">{user.name || "—"}</span>
                    </div>
                );
            }
        },
        {
            accessorKey: "email",
            header: "Email",
            cell: ({ row }) => <span className="text-slate-500 font-medium">{row.original.email}</span>
        },
        {
            accessorKey: "role",
            header: "Role",
            cell: ({ row }) => {
                let roleBadge = "bg-slate-100 text-slate-600";
                if (row.original.role === "superadmin") roleBadge = "bg-blue-100 text-blue-700";
                else if (row.original.role === "admin") roleBadge = "bg-indigo-100 text-indigo-700";
                else if (row.original.role === "support") roleBadge = "bg-purple-100 text-purple-700";
                return <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${roleBadge}`}>{row.original.role}</span>;
            }
        },
        {
            accessorKey: "isActive",
            header: "Status",
            cell: ({ row }) => {
                const statusBadge = row.original.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700";
                return <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadge}`}>{row.original.isActive ? "Active" : "Inactive"}</span>;
            }
        },
        {
            id: "actions",
            header: () => <div className="text-right">Actions</div>,
            cell: ({ row }) => {
                const user = row.original;
                const isSuperadmin = user.role === "superadmin";

                if (isSuperadmin) {
                    return <div className="text-right text-xs text-slate-400 italic">Protected</div>;
                }

                return (
                    <div className="flex items-center justify-end gap-4 flex-wrap">
                        <select
                            onClick={(e) => e.stopPropagation()}
                            value={user.role}
                            onChange={(e) => handleRoleChange(user._id, e.target.value)}
                            className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white hover:border-slate-400 transition-colors cursor-pointer"
                        >
                            <option value="finance_admin">Finance Admin</option>
                            <option value="operations_admin">Operations Admin</option>
                            <option value="analyst">Analyst</option>
                        </select>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleToggleActive(user); }}
                            className={`text-sm font-semibold transition-colors ${user.isActive ? "text-red-600 hover:text-red-800" : "text-emerald-600 hover:text-emerald-800"}`}
                        >
                            {user.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(user._id); }}
                            className="text-sm font-semibold text-slate-400 hover:text-red-600 transition-colors"
                        >
                            Delete
                        </button>
                    </div>
                );
            }
        }
    ];

    return (
        <div className="bg-slate-50 min-h-screen p-10 space-y-10">
            {/* Page Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Platform Users</h1>
                    <p className="text-slate-500 mt-1">Manage administrative access to the SaaS control center.</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
                >
                    + Add Platform User
                </button>
            </div>

            {/* Table Card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
                {loading && (
                    <div className="flex items-center justify-center py-24 gap-3">
                        <div className="w-6 h-6 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                        <p className="text-slate-500 font-medium">Loading platform users...</p>
                    </div>
                )}

                {!loading && error && (
                    <div className="py-16 text-center">
                        <p className="text-red-500 font-medium">{error}</p>
                    </div>
                )}

                {!loading && !error && users.length === 0 && (
                    <div className="py-16 text-center">
                        <p className="text-slate-400 text-sm">No platform users found.</p>
                    </div>
                )}

                {!loading && !error && users.length > 0 && (
                    <DataTable
                        columns={columns}
                        data={users}
                        onRowClick={(user) => navigate(`/platform/users/${user._id}`)}
                    />
                )}
            </div>

            {/* Add User Modal */}
            {showModal && (
                <AddUserModal
                    onClose={() => setShowModal(false)}
                    onSuccess={handleUserAdded}
                />
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD USER MODAL
// ─────────────────────────────────────────────────────────────────────────────

function AddUserModal({ onClose, onSuccess }) {
    const [form, setForm] = useState({ name: "", email: "", password: "", role: "admin" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await api.post("/platform/users", form);
            onSuccess(res.data.user || res.data);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to create user.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-slate-900">Add Platform User</h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Name</label>
                        <input
                            name="name"
                            value={form.name}
                            onChange={handleChange}
                            required
                            placeholder="John Smith"
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                        <input
                            name="email"
                            type="email"
                            value={form.email}
                            onChange={handleChange}
                            required
                            placeholder="admin@dentalsaas.com"
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
                        <input
                            name="password"
                            type="password"
                            value={form.password}
                            onChange={handleChange}
                            required
                            placeholder="••••••••"
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
                        <select
                            name="role"
                            value={form.role}
                            onChange={handleChange}
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white transition-colors"
                        >
                            <option value="finance_admin">Finance Admin</option>
                            <option value="operations_admin">Operations Admin</option>
                            <option value="analyst">Analyst</option>
                        </select>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
                        >
                            {loading ? "Creating..." : "Create User"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
