/**
 * PlatformUsersPage.jsx
 * v20.6 — Add Staff modal wired
 *
 * Changes from v20.5:
 *  - "+ Add Staff" button in header
 *  - AddPlatformUserModal (two-phase: form → temp password reveal)
 *  - Table refreshes after successful creation
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Shield,
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
} from "lucide-react";
import { usePlatformCapabilities } from "../hooks/usePlatformCapabilities";
import AddPlatformUserModal from "./AddPlatformUserModal";
import platformApi from "../auth/platformApi";
import RequireCapability from "../core/guards/RequireCapability";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr) {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return "Just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} minute${m !== 1 ? "s" : ""} ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hour${h !== 1 ? "s" : ""} ago`;
    const d = Math.floor(h / 24);
    if (d === 1) return "Yesterday";
    return `${d} days ago`;
}

function getInitials(name = "") {
    return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Role badge ────────────────────────────────────────────────────────────────

const ROLE_BADGE = {
    superadmin: "bg-indigo-100 text-indigo-700",
    finance_admin: "bg-emerald-100 text-emerald-700",
    operations_admin: "bg-blue-100   text-blue-700",
    analyst: "bg-slate-100  text-slate-600",
};

function RoleBadge({ role }) {
    const cls = ROLE_BADGE[role] || ROLE_BADGE.analyst;
    const label = role?.replace(/_/g, " ").toUpperCase() || "—";
    return (
        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${cls}`}>
            {label}
        </span>
    );
}

// ─── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ user }) {
    if (user?.profilePhotoUrl) {
        return (
            <img
                src={user.profilePhotoUrl}
                alt={user.name}
                className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-slate-200"
            />
        );
    }
    return (
        <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold flex-shrink-0 select-none">
            {getInitials(user?.name)}
        </div>
    );
}

// ─── Security status ───────────────────────────────────────────────────────────

function SecurityStatus({ user }) {
    return (
        <div className="flex flex-col gap-1">
            {user.isActive
                ? <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    Active
                </span>
                : <span className="flex items-center gap-1.5 text-xs font-medium text-red-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                    Locked
                </span>}
            {!user.twoFactorEnabled && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                    ⚠ 2FA Off
                </span>
            )}
            {user.twoFactorEnabled && (
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" /> 2FA On
                </span>
            )}
        </div>
    );
}

// ─── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
    return (
        <tr className="border-b border-slate-100">
            {[65, 42, 36, 28].map((w, i) => (
                <td key={i} className="px-5 py-3">
                    <div className="h-3.5 rounded bg-slate-100 animate-pulse" style={{ width: `${w}%` }} />
                </td>
            ))}
        </tr>
    );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
    return (
        <tr><td colSpan={4}>
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <Shield className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-slate-600 font-semibold text-sm">No platform staff accounts found</p>
                <p className="text-slate-400 text-xs">Create a superadmin account to get started.</p>
            </div>
        </td></tr>
    );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const PlatformUsersPageContent = () => {
    const navigate = useNavigate();

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [addModal, setAddModal] = useState(false);

    const fetchUsers = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await platformApi.get("/governance/platform");
            // v23.1 Safety: normalize response — API may return bare array or { data: [...] }
            setUsers(Array.isArray(res.data) ? res.data : (res.data?.data || []));
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load staff accounts");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    return (
        <div className="p-6 space-y-5">

            {/* ── Header ── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-indigo-500" />
                        Platform Staff
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        {!loading && `${users.length} administrative account${users.length !== 1 ? "s" : ""} · click a row to manage`}
                    </p>
                </div>
                <button
                    id="add-staff-btn"
                    onClick={() => setAddModal(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                    + Add Staff
                </button>
            </div>

            {/* ── Error banner ── */}
            {error && (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError(null)} className="hover:text-red-800 transition-colors">✕</button>
                </div>
            )}

            {/* ── Table card ── */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">User</th>
                            <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</th>
                            <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Security</th>
                            <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest hidden lg:table-cell">Last Activity</th>
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody>
                        {loading
                            ? [1, 2, 3].map((n) => <SkeletonRow key={n} />)
                            : users.length === 0
                                ? <EmptyState />
                                : users.map((user) => (
                                    <tr
                                        key={user._id}
                                        onClick={() => navigate(`/platform/users/${user._id}`)}
                                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors duration-100 group"
                                    >
                                        {/* Identity */}
                                        <td className="px-5 py-2">
                                            <div className="flex items-center gap-3">
                                                <Avatar user={user} />
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 truncate">
                                                        {user.name}
                                                    </p>
                                                    <p className="text-xs text-slate-400 truncate">
                                                        {user.email}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Role */}
                                        <td className="px-5 py-2">
                                            <RoleBadge role={user.role} />
                                        </td>

                                        {/* Security */}
                                        <td className="px-5 py-2">
                                            <SecurityStatus user={user} />
                                        </td>

                                        {/* Last activity */}
                                        <td className="px-5 py-2 hidden lg:table-cell">
                                            <span className="text-xs text-slate-400 tabular-nums">
                                                {formatRelativeTime(user.updatedAt)}
                                            </span>
                                        </td>

                                        {/* Chevron hint */}
                                        <td className="pr-4 py-2">
                                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" />
                                        </td>
                                    </tr>
                                ))}
                    </tbody>
                </table>
            </div>
            {/* ── Add Staff Modal ── */}
            <AddPlatformUserModal
                isOpen={addModal}
                onClose={() => setAddModal(false)}
                onCreated={fetchUsers}
                platformApi={platformApi}
            />
        </div>
    );
};

export default function PlatformUsersPage() {
    return (
        <RequireCapability permission="MANAGE_PLATFORM_USERS">
            <PlatformUsersPageContent />
        </RequireCapability>
    );
}
